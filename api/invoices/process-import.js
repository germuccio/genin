// Initialize global storage
global.invoices = global.invoices || [];

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📍 Process import endpoint called');
    const { import_id } = req.body;
    
    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    console.log('📍 Looking for import_id:', import_id);
    console.log('📍 Available imports:', Object.keys(global.processedImports || {}));

    // Get the processed import data
    if (!global.processedImports || !global.processedImports[import_id]) {
      return res.status(404).json({ error: 'Import not found' });
    }

    const importData = global.processedImports[import_id];
    console.log('📍 Found import data with', importData.invoices.length, 'invoices');

    // Convert the uploaded data to invoice format
    let processed = 0;
    const errors = [];

    importData.invoices.forEach((uploadedInvoice, index) => {
      try {
        // Only process invoices with OK status
        const statusCode = uploadedInvoice.raw_data?.['s.NO'] || uploadedInvoice.raw_data?.Status || 'OK';
        
        if (statusCode !== 'OK') {
          console.log(`⏭️ Skipping invoice ${index + 1} - Status: ${statusCode}`);
          return;
        }

        // Create invoice in the format expected by create-direct endpoint
        const invoice = {
          id: global.invoices.length + 1,
          import_id: parseInt(import_id),
          total_cents: Math.round(uploadedInvoice.amount * 100), // Convert to cents
          unit_price: uploadedInvoice.amount,
          visma_invoice_id: null,
          status: 'draft',
          created_at: new Date().toISOString(),
          
          // Business fields
          referanse: uploadedInvoice.our_reference || `REF-${Date.now()}-${index}`,
          your_reference: uploadedInvoice.your_reference,
          avsender: uploadedInvoice.avsender,
          mottaker: uploadedInvoice.mottaker,
          status_code: statusCode,
          currency: uploadedInvoice.currency || 'NOK',
          service_description: 'Transport service',
          
          // PDF attachment info (placeholder - PDFs not handled in Vercel yet)
          declaration_pdf: null,
          
          filename: importData.filename,
          row_data: uploadedInvoice.raw_data
        };

        global.invoices.push(invoice);
        processed++;
        console.log(`✅ Processed invoice: ${invoice.referanse} for ${invoice.mottaker}`);
        
      } catch (error) {
        console.error(`❌ Error processing invoice ${index + 1}:`, error);
        errors.push(`Invoice ${index + 1}: ${error.message}`);
      }
    });

    console.log(`📍 Process import completed: ${processed} processed, ${errors.length} errors`);

    res.json({ 
      success: true,
      processed: processed,
      import_id: parseInt(import_id),
      errors: errors,
      message: `Processed ${processed} invoices from import ${import_id}`
    });
  } catch (error) {
    console.error('📍 Process import error:', error);
    res.status(500).json({ 
      error: 'Failed to process import',
      details: error.message 
    });
  }
};
