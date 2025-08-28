// Inline CORS function for Vercel
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}
const formidable = require('formidable'); // Use standard require for formidable v3
const XLSX = require('xlsx');
const fs = require('fs');

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
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
      multiples: false // Single file for now
    });

    // Parse the multipart form data
    const [fields, files] = await form.parse(req);
    
    console.log('📁 Files received:', Object.keys(files));
    console.log('📋 Fields received:', Object.keys(fields));

    // Get the uploaded file using the correct field name 'excel'
    const fileArray = files.excel;
    if (!fileArray || fileArray.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = Array.isArray(fileArray) ? fileArray[0] : fileArray;
    console.log('📄 Processing file:', uploadedFile.originalFilename);
    
    // Check if PDFs were uploaded
    const pdfFiles = req.files?.pdf || [];
    console.log(`📄 PDF files received: ${pdfFiles.length}`);

    // Read the Excel file
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    // Get the first worksheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    console.log(`📊 Parsed ${jsonData.length} rows from Excel`);
    
    // DEBUG: Log the first row to see what columns are available
    if (jsonData.length > 0) {
      console.log('📊 DEBUG - First row columns:', Object.keys(jsonData[0]));
      console.log('📊 DEBUG - First row data:', jsonData[0]);
    }

    // Process the data (simplified version of your local processing)
    const processedInvoices = jsonData.map((row, index) => {
      // DEBUG: Log what we're extracting from each row
      const extracted = {
        id: index + 1,
        mottaker: String(row.Mottaker || row.mottaker || '').trim(),
        your_reference: String(row['Your Reference'] || row.your_reference || '').trim(),
        our_reference: String(row.Referanse || row['Referanse'] || '').trim(), // Fixed: Use actual Excel column name
        avsender: String(row.Avsender || row.avsender || '').trim(),
        status: 'ok', // Default status
        amount: parseFloat(row['Valutabeløp'] || row.Valutabelop || row.Amount || row.amount || 414), // Use actual Excel amount column
        currency: String(row.Currency || row.currency || 'NOK').trim(),
        raw_data: row
      };
      
      if (index < 3) { // Log first 3 rows for debugging
        console.log(`📊 DEBUG - Row ${index + 1} extracted:`, {
          mottaker: extracted.mottaker,
          our_reference: extracted.our_reference,
          your_reference: extracted.your_reference,
          avsender: extracted.avsender
        });
      }
      
      return extracted;
    }).filter(invoice => invoice.mottaker); // Filter out empty rows

    // Generate import ID
    const import_id = Date.now().toString();
    
    // Process PDF files if any
    const processedPdfs = [];
    if (pdfFiles.length > 0) {
      console.log(`📄 Processing ${pdfFiles.length} PDF files...`);
      pdfFiles.forEach((pdfFile, index) => {
        try {
          // Store PDF info (in Vercel we can't store files permanently, so we store metadata)
          processedPdfs.push({
            filename: pdfFile.originalFilename,
            size: pdfFile.size,
            mimetype: pdfFile.mimetype,
            index: index,
            // Note: In Vercel, we can't store the actual PDF content permanently
            // The frontend will need to handle PDF storage or the create-direct endpoint will need to process them
          });
          console.log(`✅ Processed PDF: ${pdfFile.originalFilename}`);
        } catch (error) {
          console.error(`❌ Error processing PDF ${pdfFile.originalFilename}:`, error);
        }
      });
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
      fs.unlinkSync(uploadedFile.filepath);
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
