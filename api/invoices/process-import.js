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
    
    // Diagnostic: Show available PDFs vs expected Line Declaration numbers
    console.log(`📊 DIAGNOSTIC - Available PDFs (${importData.pdfs?.length || 0}):`, 
      importData.pdfs?.map(p => p.filename).slice(0, 10).join(', ') + '...');
    
    const expectedLineDeclarations = importData.invoices
      .filter(inv => (inv.raw_data?.['s.NO'] || inv.raw_data?.Status || 'OK') === 'OK')
      .map(inv => {
        let lineDecl = inv.raw_data?.['Linjedekl. nr.'] || inv.raw_data?.['Line Declaration Nr'];
        if (lineDecl && typeof lineDecl === 'number') {
          lineDecl = lineDecl.toFixed(0);
        } else if (lineDecl && typeof lineDecl === 'string' && lineDecl.includes('E')) {
          try {
            const numberValue = parseFloat(lineDecl);
            lineDecl = numberValue.toFixed(0);
          } catch (e) {
            // Keep original if conversion fails
          }
        }
        return lineDecl;
      })
      .filter(Boolean);
    
    console.log(`📊 DIAGNOSTIC - Expected Line Declaration numbers (${expectedLineDeclarations.length}):`, 
      expectedLineDeclarations.slice(0, 10).join(', ') + '...');
    
    // Find missing PDFs
    const availablePdfNumbers = new Set(
      (importData.pdfs || []).map(pdf => pdf.filename.replace('.pdf', ''))
    );
    const missingPdfs = expectedLineDeclarations.filter(lineDecl => !availablePdfNumbers.has(lineDecl));
    
    if (missingPdfs.length > 0) {
      console.log(`⚠️ MISSING PDFs (${missingPdfs.length}):`, missingPdfs.slice(0, 10).join(', ') + (missingPdfs.length > 10 ? '...' : ''));
    }

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
            // Use exact matching: compare line declaration number with filename (without .pdf extension)
            const lineNumStr = String(lineDeclarationNr);
            matchedPdf = importData.pdfs.find(pdf => {
              if (!pdf.filename) return false;
              const pdfNameWithoutExt = pdf.filename.replace(/\.pdf$/i, '');
              return pdfNameWithoutExt === lineNumStr;
            });
            if (matchedPdf) {
              console.log(`📎 Matched PDF by Line Declaration Nr (${lineDeclarationNr}): ${matchedPdf.filename} for invoice ${referanse}`);
            } else {
              console.log(`📎 No PDF match found for Line Declaration Nr (${lineDeclarationNr}) for invoice ${referanse}`);
              console.log(`📎 Available PDF filenames: ${importData.pdfs.map(p => p.filename).slice(0, 5).join(', ')}...`);
              
              // Debug: Show similar filenames to help identify the issue
              const similarPdfs = importData.pdfs.filter(pdf => {
                const pdfNum = pdf.filename.replace(/\.pdf$/i, '');
                return pdfNum.includes(lineNumStr.slice(0, 8)); // Match first 8 digits
              });
              if (similarPdfs.length > 0) {
                console.log(`📎 Similar PDFs found: ${similarPdfs.map(p => p.filename).join(', ')}`);
              }
            }
          }
          // Fallback: try to match by invoice reference (only if no Line Declaration Nr exists)
          if (!matchedPdf && !lineDeclarationNr) {
            matchedPdf = importData.pdfs.find(pdf => pdf.filename && pdf.filename.includes(referanse));
            if (matchedPdf) {
              console.log(`📎 Matched PDF by reference (${referanse}): ${matchedPdf.filename} for invoice ${referanse}`);
            }
          }
          // DISABLED: Index-based matching is too unreliable and causes wrong PDF assignments
          // If we have a Line Declaration Nr and exact match fails, the PDF is genuinely missing
          // Do NOT fall back to index matching as it will assign wrong PDFs
          if (!matchedPdf && !lineDeclarationNr && importData.pdfs[index] && !importData.pdfs[index]._claimed) {
            // Only use index matching if there's NO Line Declaration Nr at all
            matchedPdf = importData.pdfs[index];
            console.log(`📎 Matched PDF by index (${index}): ${matchedPdf.filename} for invoice ${referanse} (no Line Declaration Nr available)`);
          }
          
          // Final fallback: if still no match and PDF is missing, log it clearly
          if (!matchedPdf && lineDeclarationNr) {
            console.log(`❌ PDF MISSING: No PDF found for Line Declaration Nr ${lineDeclarationNr} (invoice ${referanse})`);
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
