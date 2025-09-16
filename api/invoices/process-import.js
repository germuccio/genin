// Initialize global storage
global.invoices = global.invoices || [];

module.exports = async (req, res) => {
  console.log('📍 Process import endpoint called');
  
  try {
    const { import_id } = req.body;
    
    if (!import_id) {
      return res.status(400).json({ error: 'Import ID is required' });
    }

    console.log('📍 Looking for import_id:', import_id);

    // Try to get import data from global storage first (for local development)
    let importData = global.imports?.find(imp => imp.id === parseInt(import_id));
    
    if (!importData) {
      // For Vercel, try to get data from request body
      console.log('📍 No global import data found, checking request body...');
      importData = req.body.import_data;
      
      if (!importData) {
        console.log('📍 No import data in request body either');
        return res.status(404).json({ 
          error: `Import ${import_id} not found`,
          note: 'In Vercel, import data must be passed in the request body'
        });
      }
      
      console.log('📍 Using import data from request body with', importData.invoices?.length || 0, 'invoices');
    } else {
      console.log('📍 Found import data in global storage with', importData.invoices?.length || 0, 'invoices');
    }

    if (!importData || !importData.invoices) {
      return res.status(404).json({ error: 'Import data is invalid or missing invoices' });
    }

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
        const referanse = uploadedInvoice.our_reference || `REF-${Date.now()}-${index}`;
        
        // Try to match PDF by filename containing the line declaration number or invoice reference
        let matchedPdf = null;
        if (importData.pdfs && Array.isArray(importData.pdfs)) {
          // First try to match by "Linjedekl. nr." from Excel (this should match PDF filename)
          let lineDeclarationNr = uploadedInvoice.raw_data?.['Linjedekl. nr.'] || uploadedInvoice.raw_data?.['Line Declaration Nr'];
          
          // Handle scientific notation: convert to full number string if needed
          if (lineDeclarationNr && typeof lineDeclarationNr === 'number') {
            // Convert scientific notation to full number string
            lineDeclarationNr = lineDeclarationNr.toFixed(0);
            console.log(`📊 Converted scientific notation to full number: ${lineDeclarationNr} for invoice ${referanse}`);
          } else if (lineDeclarationNr && typeof lineDeclarationNr === 'string' && lineDeclarationNr.includes('E')) {
            // Handle string scientific notation like "3.71001E+15"
            try {
              const numberValue = parseFloat(lineDeclarationNr);
              lineDeclarationNr = numberValue.toFixed(0);
              console.log(`📊 Converted string scientific notation to full number: ${lineDeclarationNr} for invoice ${referanse}`);
            } catch (e) {
              console.warn(`⚠️ Failed to convert scientific notation: ${lineDeclarationNr} for invoice ${referanse}`);
            }
          }
          
          console.log(`📊 DEBUG - Line Declaration Nr for invoice ${referanse}: "${lineDeclarationNr}" (type: ${typeof lineDeclarationNr})`);
          
          if (lineDeclarationNr) {
            matchedPdf = importData.pdfs.find(pdf => pdf.filename && pdf.filename.includes(String(lineDeclarationNr)));
            if (matchedPdf) {
              console.log(`📎 Matched PDF by Line Declaration Nr (${lineDeclarationNr}): ${matchedPdf.filename} for invoice ${referanse}`);
            } else {
              console.log(`📎 No PDF match found for Line Declaration Nr (${lineDeclarationNr}) for invoice ${referanse}`);
              console.log(`📎 Available PDF filenames: ${importData.pdfs.map(p => p.filename).slice(0, 5).join(', ')}...`);
            }
          }
          // Fallback: try to match by invoice reference
          if (!matchedPdf) {
            matchedPdf = importData.pdfs.find(pdf => pdf.filename && pdf.filename.includes(referanse));
            if (matchedPdf) {
              console.log(`📎 Matched PDF by reference (${referanse}): ${matchedPdf.filename} for invoice ${referanse}`);
            }
          }
          // Last resort: try by index (original logic) - but only if no other invoice has claimed this PDF
          if (!matchedPdf && importData.pdfs[index] && !importData.pdfs[index]._claimed) {
            matchedPdf = importData.pdfs[index];
            console.log(`📎 Matched PDF by index (${index}): ${matchedPdf.filename} for invoice ${referanse}`);
          }
          
          // Mark PDF as claimed to prevent double-assignment
          if (matchedPdf) {
            matchedPdf._claimed = true;
          }
        }

        const invoice = {
          id: global.invoices.length + 1,
          import_id: parseInt(import_id),
          total_cents: Math.round(uploadedInvoice.amount * 100), // Convert to cents
          unit_price: uploadedInvoice.amount,
          visma_invoice_id: null,
          status: 'draft',
          customer_validation_status: 'PENDING', // Will be updated during creation
          created_at: new Date().toISOString(),
          
          // Business fields
          referanse: referanse,
          your_reference: uploadedInvoice.your_reference,
          avsender: uploadedInvoice.avsender,
          mottaker: uploadedInvoice.mottaker,
          status_code: statusCode,
          currency: uploadedInvoice.currency || 'NOK',
          service_description: 'Transport service',
          
          // PDF attachment info with proper matching logic
          declaration_pdf: matchedPdf ? { 
            filename: matchedPdf.filename, 
            size: matchedPdf.size, 
            mimetype: matchedPdf.mimetype, 
            index: matchedPdf.index 
          } : null,
          
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

    // Get the processed invoices for this specific import
    const processedInvoices = global.invoices.filter(inv => inv.import_id === parseInt(import_id));
    
    console.log(`📍 Returning ${processedInvoices.length} processed invoices to frontend`);
    console.log(`📍 Sample invoice data:`, processedInvoices[0] ? {
      referanse: processedInvoices[0].referanse,
      mottaker: processedInvoices[0].mottaker,
      our_reference: processedInvoices[0].referanse // This should match the Excel Referanse column
    } : 'No invoices');
    
    const responseData = {
      success: true,
      processed: processed,
      import_id: parseInt(import_id),
      errors: errors,
      message: `Processed ${processed} invoices from import ${import_id}`,
      // Return processed invoices for Vercel stateless environment
      processed_invoices: processedInvoices
    };
    
    console.log('📍 Sending response to frontend:', {
      success: responseData.success,
      processed: responseData.processed,
      import_id: responseData.import_id,
      processed_invoices_count: responseData.processed_invoices.length,
      processed_invoices_sample: responseData.processed_invoices[0] ? {
        referanse: responseData.processed_invoices[0].referanse,
        mottaker: responseData.processed_invoices[0].mottaker,
        our_reference: responseData.processed_invoices[0].referanse
      } : 'No invoices'
    });
    
    res.json(responseData);
  } catch (error) {
    console.error('📍 Process import error:', error);
    res.status(500).json({ 
      error: 'Failed to process import',
      details: error.message 
    });
  }
};
