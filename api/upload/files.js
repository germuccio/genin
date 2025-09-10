// Inline CORS function for Vercel
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}
const formidable = require('formidable'); // Use standard require for formidable v3
const XLSX = require('xlsx');
const fs = require('fs'); // Needed for reading PDF files


// Simple in-memory storage for processed data (resets on serverless cold start)
global.processedImports = global.processedImports || {};

module.exports = async (req, res) => {
  setCors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Note: Upload works without authentication (like local version)
  console.log('📤 File upload request received on Vercel');

  try {
    console.log('🚀 Processing file upload in Vercel...');
    
    // Configure formidable for Vercel environment (v3 syntax)
    const form = new formidable.IncomingForm({
      maxFileSize: 10 * 1024 * 1024, // 10MB per-file limit (overall request is limited by Vercel)
      keepExtensions: true,
      multiples: true // Allow multiple files per request (for PDF batches)
    });

    // Parse the multipart form data
    const [fields, files] = await form.parse(req);
    
    console.log('📁 Files received:', Object.keys(files));
    console.log('📋 Fields received:', Object.keys(fields));

    // Extract optional import_id and import_data for PDF chunk uploads
    const importIdField = Array.isArray(fields.import_id) ? fields.import_id[0] : fields.import_id;
    const importIdFromFields = importIdField ? String(importIdField) : null;
    const importDataField = Array.isArray(fields.import_data) ? fields.import_data[0] : fields.import_data;
    let importDataProvided = null;
    if (importDataField) {
      try {
        importDataProvided = typeof importDataField === 'string' ? JSON.parse(importDataField) : importDataField;
      } catch (e) {
        console.warn('⚠️ Failed to parse import_data JSON:', e.message);
      }
    }

    // Detect files
    const excelFiles = files.excel;
    const uploadedFile = Array.isArray(excelFiles) ? excelFiles[0] : excelFiles;
    
    // Check if PDFs were uploaded
    const pdfFiles = files.pdf || [];
    console.log(`📄 PDF files received: ${Array.isArray(pdfFiles) ? pdfFiles.length : 0}`);
    if (Array.isArray(pdfFiles) && pdfFiles.length > 0) {
      console.log('📄 PDF file details:', pdfFiles.map(pdf => ({
        filename: pdf.originalFilename,
        size: pdf.size,
        mimetype: pdf.mimetype
      })));
    }

    // Branch 1: PDF CHUNK UPLOAD (no Excel file). Use provided import_data if available, else try global by import_id
    if (!uploadedFile && (importIdFromFields || importDataProvided)) {
      let existing = null;
      if (importDataProvided && Array.isArray(importDataProvided.invoices)) {
        existing = {
          invoices: importDataProvided.invoices || [],
          pdfs: importDataProvided.pdfs || [],
          timestamp: importDataProvided.timestamp || new Date().toISOString(),
          filename: importDataProvided.filename || 'Unknown',
          total_count: importDataProvided.total_count || (importDataProvided.invoices?.length || 0)
        };
      } else if (importIdFromFields && global.processedImports[importIdFromFields]) {
        existing = global.processedImports[importIdFromFields];
      }

      if (!existing) {
        return res.status(400).json({ error: 'Invalid import_id for PDF chunk upload' });
      }
      const processedPdfs = [];
      if (pdfFiles && (Array.isArray(pdfFiles) ? pdfFiles.length > 0 : pdfFiles)) {
        const pdfArray = Array.isArray(pdfFiles) ? pdfFiles : [pdfFiles];
        console.log(`📄 Processing PDF chunk with ${pdfArray.length} files for import ${importIdFromFields}...`);
        
        pdfArray.forEach((pdfFile, index) => {
          try {
            const pdfId = `pdf_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
            let pdfContent = null;
            try {
              if (pdfFile.filepath) {
                pdfContent = fs.readFileSync(pdfFile.filepath);
              } else if (pdfFile.buffer) {
                pdfContent = pdfFile.buffer;
              }
            } catch (err) {
              console.warn(`⚠️ Could not read PDF content for ${pdfFile.originalFilename}:`, err.message);
            }
            const pdfData = {
              id: pdfId,
              filename: pdfFile.originalFilename,
              size: pdfFile.size,
              mimetype: pdfFile.mimetype,
              index: (existing.pdfs?.length || 0) + index,
              content: pdfContent ? pdfContent.toString('base64') : null
            };
            processedPdfs.push(pdfData);
            console.log(`✅ Processed PDF chunk file: ${pdfFile.originalFilename} (${pdfFile.size} bytes)`);
          } catch (error) {
            console.error(`❌ Error processing PDF chunk ${pdfFile.originalFilename}:`, error);
          }
        });
      }

      // Merge into existing (avoid duplicating by filename+size)
      const existingKey = new Set((existing.pdfs || []).map(p => `${p.filename}:${p.size}`));
      processedPdfs.forEach(p => { if (!existingKey.has(`${p.filename}:${p.size}`)) existing.pdfs.push(p); });
      existing.timestamp = new Date().toISOString();

      // Ensure global storage is updated for later retrieval of base64 content by import_id
      if (importIdFromFields) {
        if (!global.processedImports[importIdFromFields]) {
          global.processedImports[importIdFromFields] = existing;
        } else {
          const g = global.processedImports[importIdFromFields];
          const gKey = new Set((g.pdfs || []).map(p => `${p.filename}:${p.size}`));
          (processedPdfs || []).forEach(p => { if (!gKey.has(`${p.filename}:${p.size}`)) g.pdfs.push(p); });
          g.timestamp = existing.timestamp;
        }
      }

      // Build response similar to initial upload
      return res.json({
        import_id: importIdFromFields,
        filename: existing.filename,
        status: 'completed',
        total_rows: existing.invoices.length,
        valid_rows: existing.invoices.length,
        errors: [],
        pdf_files: existing.pdfs.map(({ content, ...rest }) => rest),
        message: `Added ${processedPdfs.length} PDFs to import ${importIdFromFields}. Total PDFs: ${existing.pdfs.length}`,
        _vercel_import_data: {
          invoices: existing.invoices,
          pdfs: existing.pdfs.map(({ content, ...rest }) => rest),
          timestamp: existing.timestamp,
          filename: existing.filename,
          total_count: existing.invoices.length
        }
      });
    }

    // Branch 2: INITIAL UPLOAD (Excel present)
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No Excel file uploaded' });
    }

    console.log('📄 Processing file:', uploadedFile.originalFilename);

    // Read the Excel file - try different approaches for different environments
    let fileBuffer;
    try {
      if (uploadedFile.filepath) {
        fileBuffer = fs.readFileSync(uploadedFile.filepath);
      } else if (uploadedFile.buffer) {
        fileBuffer = uploadedFile.buffer;
      } else {
        throw new Error('No file data available');
      }
    } catch (err) {
      console.error('❌ Failed to read Excel file:', err.message);
      return res.status(500).json({ error: 'Failed to read uploaded Excel file' });
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Get the first worksheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    console.log(`📊 Parsed ${jsonData.length} rows from Excel`);
    
    if (jsonData.length > 0) {
      console.log('📊 DEBUG - First row columns:', Object.keys(jsonData[0]));
      console.log('📊 DEBUG - First row data:', jsonData[0]);
    }

    const processedInvoices = jsonData.map((row, index) => {
      const extracted = {
        id: index + 1,
        mottaker: String(row.Mottaker || row.mottaker || '').trim(),
        your_reference: String(row['Your Reference'] || row.your_reference || '').trim(),
        our_reference: String(row.Referanse || row['Referanse'] || '').trim(),
        avsender: String(row.Avsender || row.avsender || '').trim(),
        status: 'ok',
        amount: parseFloat(row['Valutabeløp'] || row.Valutabelop || row.Amount || row.amount || 414),
        currency: String(row.Currency || row.currency || 'NOK').trim(),
        raw_data: row
      };
      if (index < 3) {
        console.log(`📊 DEBUG - Row ${index + 1} extracted:`, {
          mottaker: extracted.mottaker,
          our_reference: extracted.our_reference,
          your_reference: extracted.your_reference,
          avsender: extracted.avsender
        });
      }
      return extracted;
    }).filter(invoice => invoice.mottaker);

    // Generate import ID
    const import_id = Date.now().toString();
    
    // Process PDF files if any
    const processedPdfs = [];
    if (pdfFiles && (Array.isArray(pdfFiles) ? pdfFiles.length > 0 : pdfFiles)) {
      // Handle both single file and array cases
      const pdfArray = Array.isArray(pdfFiles) ? pdfFiles : [pdfFiles];
      console.log(`📄 Processing ${pdfArray.length} PDF files...`);
      
      pdfArray.forEach((pdfFile, index) => {
        try {
          // Generate a unique ID for this PDF that can be referenced later
          const pdfId = `pdf_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Read the PDF file content and store it temporarily for immediate attachment
          let pdfContent = null;
          try {
            if (pdfFile.filepath) {
              pdfContent = fs.readFileSync(pdfFile.filepath);
            } else if (pdfFile.buffer) {
              pdfContent = pdfFile.buffer;
            }
          } catch (err) {
            console.warn(`⚠️ Could not read PDF content for ${pdfFile.originalFilename}:`, err.message);
          }
          
          // Store PDF metadata with a unique ID for later reference
          const pdfData = {
            id: pdfId,
            filename: pdfFile.originalFilename,
            size: pdfFile.size,
            mimetype: pdfFile.mimetype,
            index: index,
            // Store the actual PDF content for immediate attachment (this will be used in the same request)
            content: pdfContent ? pdfContent.toString('base64') : null
          };
          
          processedPdfs.push(pdfData);
          console.log(`✅ Processed PDF: ${pdfFile.originalFilename} (${pdfFile.size} bytes)`);
        } catch (error) {
          console.error(`❌ Error processing PDF ${pdfFile.originalFilename}:`, error);
        }
      });
    } else {
      console.log('📄 No PDF files uploaded');
    }

    // Store processed data in memory
    global.processedImports[import_id] = {
      invoices: processedInvoices,
      pdfs: processedPdfs,
      timestamp: new Date().toISOString(),
      filename: uploadedFile.originalFilename,
      total_count: processedInvoices.length
    };

    console.log(`✅ Successfully processed ${processedInvoices.length} invoices`);

    // Clean up temporary file
    try {
      if (uploadedFile.filepath) {
        fs.unlinkSync(uploadedFile.filepath);
      }
    } catch (err) {
      console.warn('Could not clean up temp file:', err.message);
    }

    // Return success response in the format expected by frontend
    res.json({ 
      import_id: import_id,
      filename: uploadedFile.originalFilename,
      status: 'completed',
      total_rows: processedInvoices.length,
      valid_rows: processedInvoices.length,
      errors: [],
      pdf_files: processedPdfs, // Now includes processed PDF metadata
      message: `Successfully processed ${processedInvoices.length} invoices from ${uploadedFile.originalFilename}`,
      // Include the processed data for Vercel stateless environment
      _vercel_import_data: {
        invoices: processedInvoices,
        pdfs: processedPdfs,
        timestamp: new Date().toISOString(),
        filename: uploadedFile.originalFilename,
        total_count: processedInvoices.length
      }
    });
    
  } catch (error) {
    console.error('❌ Upload processing error:', error);
    res.status(500).json({ 
      error: 'Upload processing failed', 
      message: error.message,
      details: 'Check Vercel function logs for more information'
    });
  }
};
