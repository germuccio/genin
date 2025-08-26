const { setCors, getSession } = require('../_utils');
const formidable = require('formidable');
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

  // Check authentication
  const session = getSession(req);
  if (!session || !session.authenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    console.log('🚀 Processing file upload in Vercel...');
    
    // Configure formidable for Vercel environment
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
      multiples: false // Single file for now
    });

    // Parse the multipart form data
    const [fields, files] = await form.parse(req);
    
    console.log('📁 Files received:', Object.keys(files));
    console.log('📋 Fields received:', Object.keys(fields));

    // Get the uploaded file
    const fileArray = files.file || files.files;
    if (!fileArray || fileArray.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const uploadedFile = Array.isArray(fileArray) ? fileArray[0] : fileArray;
    console.log('📄 Processing file:', uploadedFile.originalFilename);

    // Read the Excel file
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    // Get the first worksheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    console.log(`📊 Parsed ${jsonData.length} rows from Excel`);

    // Process the data (simplified version of your local processing)
    const processedInvoices = jsonData.map((row, index) => {
      // Convert row data to match your expected format
      return {
        id: index + 1,
        mottaker: String(row.Mottaker || row.mottaker || '').trim(),
        your_reference: String(row['Your Reference'] || row.your_reference || '').trim(),
        our_reference: String(row['Our Reference'] || row.our_reference || '').trim(),
        avsender: String(row.Avsender || row.avsender || '').trim(),
        status: 'ok', // Default status
        amount: parseFloat(row.Amount || row.amount || 414), // Default amount
        currency: String(row.Currency || row.currency || 'NOK').trim(),
        raw_data: row
      };
    }).filter(invoice => invoice.mottaker); // Filter out empty rows

    // Generate import ID
    const import_id = Date.now().toString();
    
    // Store processed data in memory
    global.processedImports[import_id] = {
      invoices: processedInvoices,
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

    // Return success response
    res.json({ 
      success: true,
      import_id: import_id,
      message: `Successfully processed ${processedInvoices.length} invoices from ${uploadedFile.originalFilename}`,
      invoices: processedInvoices.slice(0, 5), // Return first 5 as preview
      total_count: processedInvoices.length,
      note: 'Excel file processed successfully in Vercel!'
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
