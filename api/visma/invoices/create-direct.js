const axios = require('axios');

// Inline cookie parsing function for Vercel
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach((part) => {
    const [k, ...v] = part.trim().split('=');
    if (!k) return;
    cookies[k] = decodeURIComponent(v.join('='));
  });
  
  return cookies;
}

function getVismaTokensFromCookie(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies['visma-tokens']) {
    try {
      return JSON.parse(cookies['visma-tokens']);
    } catch (e) {
      console.error('Error parsing visma-tokens cookie:', e);
      return null;
    }
  }
  return null;
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📍 Create direct invoices endpoint called - v2.5');
    // console.log('📍 Request body:', req.body); // Keep this commented out for cleaner logs
    console.log('📍 Request headers cookies:', req.headers.cookie ? 'Present' : 'Missing');
    
    let tokens = null;
    try {
      tokens = getVismaTokensFromCookie(req);
      console.log('📍 Tokens from cookie:', tokens ? 'Found' : 'Not found');
    } catch (tokenError) {
      console.error('📍 Error getting tokens from cookie:', tokenError);
      return res.status(500).json({ error: 'Error parsing authentication tokens', details: tokenError.message });
    }
    
    if (!tokens || !tokens.access_token) {
      console.log('📍 No valid tokens found');
      return res.status(401).json({ error: 'Not authenticated with Visma' });
    }
    
    const { import_id, articleMapping, customerDefaults, customerOverrides, processed_invoices, import_data } = req.body;
    console.log('📍 Parsed request data:', { 
      import_id, 
      articleMapping, 
      customerDefaults, 
      customerOverrides, 
      processed_invoices: processed_invoices ? `${processed_invoices.length} invoices` : 'none',
      import_data: import_data ? `Available with ${import_data.invoices?.length || 0} invoices` : 'none'
    });
    
    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    // Handle case where processed_invoices is a string (frontend issue)
    let importInvoices = [];
    if (Array.isArray(processed_invoices)) {
      importInvoices = processed_invoices;
      console.log(`📍 Using ${importInvoices.length} invoices from processed_invoices array`);
    } else if (typeof processed_invoices === 'string') {
      console.log(`⚠️ WARNING: processed_invoices is a string: "${processed_invoices}"`);
      console.log(`📍 This indicates data corruption during transmission - using stored data instead`);
      
      // ALWAYS use global storage for corrupted data - this is more reliable
      if (global.processedImports && global.processedImports[import_id]) {
        const storedData = global.processedImports[import_id];
        console.log(`📍 Found stored data for import_id: ${import_id} with ${storedData.invoices.length} invoices`);
        
        importInvoices = storedData.invoices.map((invoice, index) => ({
          referanse: invoice.our_reference || invoice.referanse || `REF-${Date.now()}-${index}`,
          mottaker: invoice.mottaker || `Customer ${index + 1}`,
          avsender: invoice.avsender || 'Default Sender',
          currency: invoice.currency || 'NOK',
          declaration_pdf: storedData.pdfs && storedData.pdfs[index] ? {
            filename: storedData.pdfs[index].filename,
            size: storedData.pdfs[index].size,
            mimetype: storedData.pdfs[index].mimetype,
            index: storedData.pdfs[index].index
          } : null
        }));
        console.log(`📍 Successfully reconstructed ${importInvoices.length} invoices from stored data`);
        
        // Store the import_data for PDF attachment
        import_data = storedData;
      } else {
        console.log(`❌ CRITICAL: No stored data found for import_id: ${import_id}`);
        console.log(`📍 Available import IDs:`, Object.keys(global.processedImports || {}));
        return res.status(400).json({ 
          error: 'Data corruption detected and no backup data available. Please re-upload your files.',
          details: 'The request payload was corrupted during transmission and no stored data was found.'
        });
      }
    } else {
      console.log(`📍 No processed_invoices data available`);
      return res.status(400).json({ error: 'No invoice data available' });
    }

    // Try to get invoices from global storage first (for local development)
    const globalInvoices = global.invoices || [];
    const globalImportInvoices = globalInvoices.filter(inv => inv.import_id === parseInt(import_id));
    
    if (globalImportInvoices.length > 0) {
      importInvoices = globalImportInvoices;
      console.log('📍 Found', importInvoices.length, 'invoices from global storage for import_id:', import_id);
    } else if (importInvoices.length === 0) {
      console.log('📍 No invoices found in global storage or request body for import_id:', import_id);
      return res.status(404).json({ 
        error: `No invoices found for import ${import_id}`,
        note: 'This might happen in Vercel if the data was not properly passed from the frontend'
      });
    }

    // Actually create invoices in Visma
    console.log('📍 Creating', importInvoices.length, 'invoices in Visma...');
    
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    // --- NEW DEBUGGING ---
    console.log('📍 Using tokens from cookie:', JSON.stringify(tokens, null, 2));
    // Use environment variable as the primary source for the instance URL on Vercel
    const apiBaseUrl = process.env.VISMA_INSTANCE_URL || tokens.instance_url || 'https://eaccountingapi.vismaonline.com';
    console.log('📍 Resolved API Base URL:', apiBaseUrl);
    // --- END NEW DEBUGGING ---

    // Get terms of payment ID once for all invoices
    let termsOfPaymentId = null;
    console.log('📍 Fetching terms of payment from:', `${apiBaseUrl}/v2/termsofpayments`);
    try {
      const termsResp = await axios.get(`${apiBaseUrl}/v2/termsofpayments`, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📍 Terms of payment response status:', termsResp.status);
      console.log('📍 Terms of payment response data:', termsResp.data);
      
      // Use the first available terms of payment (typically "Net 30" or similar)
      console.log('📍 Debugging terms response:', {
        hasData: !!termsResp.data,
        hasDataProperty: !!(termsResp.data && termsResp.data.Data),
        dataLength: termsResp.data?.Data?.length || 0,
        firstItem: termsResp.data?.Data?.[0]
      });
      
      if (termsResp.data && termsResp.data.Data && termsResp.data.Data.length > 0) {
        termsOfPaymentId = termsResp.data.Data[0].Id;
        console.log(`📍 Using terms of payment: ${termsResp.data.Data[0].Name} (${termsOfPaymentId})`);
      } else {
        console.log('📍 No terms of payment found in response data');
        // Force use the first ID from the log data we can see
        if (termsResp.data?.Data?.[0]?.Id) {
          termsOfPaymentId = termsResp.data.Data[0].Id;
          console.log('📍 Forcing terms of payment from backup logic:', termsOfPaymentId);
        }
      }
    } catch (termsErr) {
      console.log('📍 Could not fetch terms of payment:');
      console.log('📍 Error status:', termsErr.response?.status);
      console.log('📍 Error data:', JSON.stringify(termsErr.response?.data));
      console.log('📍 Error message:', termsErr.message);
      console.log('📍 API URL used:', `${apiBaseUrl}/v2/termsofpayments`);
    }

    if (!termsOfPaymentId) {
      console.error('🔥 CRITICAL: TermsOfPaymentId was not found after a successful API call. This should not happen.');
      return res.status(500).json({ error: 'Could not determine Terms of Payment from Visma. Cannot create invoices.' });
    }

    // Process invoices in manageable chunks to avoid timeout
    console.log(`📍 Starting to process ${importInvoices.length} invoices...`);
    
    // Track results for each invoice
    const invoiceResults = [];
    const invoiceAttachments = {};
    
    // Get processing parameters from request (for resume functionality)
    const startIndex = parseInt(req.body.start_index) || 0;
    const chunkSize = 20; // Process 20 invoices per request
    const endIndex = Math.min(startIndex + chunkSize, importInvoices.length);
    
    console.log(`📍 Processing chunk: invoices ${startIndex + 1}-${endIndex} of ${importInvoices.length}`);
    
    // Add timeout tracking to prevent Vercel timeout
    const processingStartTime = Date.now();
    const MAX_PROCESSING_TIME = 8500; // 8.5 seconds to leave buffer
    
    // Process only the current chunk
    for (let i = startIndex; i < endIndex; i++) {
      // Check if we're approaching timeout
      const elapsedTime = Date.now() - processingStartTime;
      if (elapsedTime > MAX_PROCESSING_TIME) {
        console.log(`⏰ Approaching timeout (${elapsedTime}ms), stopping at invoice ${i + 1}/${importInvoices.length}`);
        break;
      }
      
      const invoice = importInvoices[i];
      console.log(`📍 Processing invoice ${i + 1}/${importInvoices.length}: ${invoice.referanse}`);
      
      try {
        console.log(`📍 Processing invoice: ${invoice.referanse}`);
          
          // Create customer if needed
          let customerId = null;
          const customerName = invoice.mottaker || 'Unknown Customer';
          
          // DEBUG: Log the invoice data to see what we're working with
          console.log(`[${invoice.referanse}] DEBUG - Invoice data:`, {
            referanse: invoice.referanse,
            mottaker: invoice.mottaker,
            avsender: invoice.avsender,
            your_reference: invoice.your_reference,
            our_reference: invoice.our_reference
          });
          
          // Try to find existing customer first
          console.log(`[${invoice.referanse}] Searching for customer "${customerName}"...`);
          try {
            const customerSearchResp = await axios.get(`${apiBaseUrl}/v2/customers`, {
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
              }
              // Note: Visma API doesn't filter by name, so we get all customers and filter client-side
            });
            
            if (customerSearchResp.data && customerSearchResp.data.Data && customerSearchResp.data.Data.length > 0) {
              // Filter customers by name on the client side since Visma API doesn't support name filtering
              const matchingCustomers = customerSearchResp.data.Data.filter(customer => 
                customer.Name && customer.Name.toLowerCase().includes(customerName.toLowerCase())
              );
              
              if (matchingCustomers.length > 0) {
                customerId = matchingCustomers[0].Id;
                console.log(`[${invoice.referanse}] Found existing customer: ${customerName} (${customerId})`);
              } else {
                console.log(`[${invoice.referanse}] Customer not found, will create.`);
              }
            } else {
               console.log(`[${invoice.referanse}] Customer not found, will create.`);
            }
            
            // DEBUG: Log the full customer search response
            console.log(`[${invoice.referanse}] DEBUG - Customer search response:`, {
              status: customerSearchResp.status,
              data: customerSearchResp.data,
              searchParams: { name: customerName }
            });
          } catch (searchErr) {
            console.error(`[${invoice.referanse}] Customer search failed:`, searchErr.response?.data || searchErr.message);
          }
          
          // Create customer if not found
          if (!customerId) {
            console.log(`[${invoice.referanse}] Preparing to create customer "${customerName}"...`);
            const customerData = {
              Name: customerName, // Use PascalCase for customer creation too
              Email: `test+${Date.now()}@example.com`, // Visma requires an email
              IsPrivatePerson: false,
              IsActive: true, // Add missing IsActive field
              // Add required fields for customer creation
              InvoiceCity: customerDefaults.city || "Oslo",
              InvoicePostalCode: customerDefaults.postalCode || "0001",
              InvoiceAddress: customerDefaults.address || "Ukjent adresse",
              InvoiceCountry: customerDefaults.country || "NO",
              // Add terms of payment ID
              TermsOfPaymentId: termsOfPaymentId
            };
            
            try {
              const customerResp = await axios.post(`${apiBaseUrl}/v2/customers`, customerData, {
                headers: {
                  'Authorization': `Bearer ${tokens.access_token}`,
                  'Content-Type': 'application/json'
                }
              });

              customerId = customerResp.data.Id;
              console.log(`[${invoice.referanse}] Successfully created customer: ${customerName} (${customerId})`);
            } catch(createErr) {
                console.error(`[${invoice.referanse}] CRITICAL: Failed to create customer:`, createErr.response?.data || createErr.message);
                // Skip this invoice if we can't create a customer
                results.failed++;
                results.errors.push(`${invoice.referanse}: Failed to find or create customer "${customerName}"`);
                continue; 
            }
          }
          
          const articleId = articleMapping.ok || articleMapping['OK'] || null;
          if (!articleId) {
            console.error(`[${invoice.referanse}] CRITICAL: No article mapping found for status OK. Skipping invoice.`);
            results.failed++;
            results.errors.push(`${invoice.referanse}: No article mapping found for status OK`);
            continue;
          }

          // Create invoice with all required fields (using PascalCase like local server)
          const invoiceData = {
            CustomerId: customerId,
            InvoiceDate: new Date().toISOString().split('T')[0],
            DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
            CurrencyCode: invoice.currency || 'NOK',
            YourReference: invoice.avsender, // Use sender as your reference like local server
            OurReference: invoice.referanse,
            // Required address fields
            InvoiceCity: customerDefaults.city || 'Oslo',
            InvoicePostalCode: customerDefaults.postalCode || '0001',
            InvoiceAddress: customerDefaults.address || 'Ukjent adresse',
            InvoiceCountry: customerDefaults.country || 'NO',
            RotReducedInvoicingType: 0,
            EuThirdParty: false,
            Rows: [{
              IsTextRow: false,
              ArticleId: articleId,
              Description: `Transport service - ${invoice.referanse}`,
              Quantity: 1,
              UnitPrice: 414, // Use preset price from UI setup (like local deployment)
              VatRate: 25, // Standard Norwegian VAT
              LineNumber: 1,
              IsWorkCost: false,
              EligibleForReverseChargeOnVat: false,
              HideRow: false,
              ReversedConstructionServicesVatFree: false
            }]
          };

          // Add terms of payment
          invoiceData.TermsOfPaymentId = termsOfPaymentId;
          
          console.log(`[${invoice.referanse}] Preparing to POST invoice.`);
          console.log(`[${invoice.referanse}] API URL: POST ${apiBaseUrl}/v2/customerinvoicedrafts`);
          console.log(`[${invoice.referanse}] CustomerId: ${invoiceData.CustomerId}`);
          console.log(`[${invoice.referanse}] ArticleId: ${invoiceData.Rows[0].ArticleId}`);
          console.log(`[${invoice.referanse}] TermsOfPaymentId: ${invoiceData.TermsOfPaymentId}`);

          try {
                              const invoiceResp = await axios.post(`${apiBaseUrl}/v2/customerinvoicedrafts`, invoiceData, {
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
              }
            });

                        console.log(`✅ Created invoice: ${invoice.referanse} (Visma ID: ${invoiceResp.data.Id}) - ${results.successful + 1}/${importInvoices.length} completed`);
            
            // Track successful invoice creation
            invoiceResults.push({
              referanse: invoice.referanse,
              status: 'CREATED_AS_DRAFT',
              visma_id: invoiceResp.data.Id,
              pdf_attached: false
            });
            
            // Try to attach PDF if available
            if (invoice.declaration_pdf || invoice.pdf_data) {
              try {
                console.log(`[${invoice.referanse}] Attempting to attach PDF...`);
              
                // Get PDF data from import_data if available
                let pdfToAttach = null;
                if (import_data && import_data.pdfs && Array.isArray(import_data.pdfs)) {
                  // Find PDF by index or filename
                  const pdfIndex = invoice.declaration_pdf?.index || 0;
                  if (import_data.pdfs[pdfIndex]) {
                    pdfToAttach = import_data.pdfs[pdfIndex];
                  }
                }
                
                if (pdfToAttach && pdfToAttach.content) {
                  console.log(`[${invoice.referanse}] Found PDF to attach: ${pdfToAttach.filename}`);
                  
                  // Attach PDF to Visma invoice using their attachments API
                  const attachmentData = {
                    DockumentId: invoiceResp.data.Id, // Note: Visma uses "DockumentId" not "DocumentId"
                    DocumentType: 'CustomerInvoiceDraft',
                    FileName: pdfToAttach.filename,
                    FileSize: pdfToAttach.size,
                    ContentType: pdfToAttach.mimetype,
                    Data: pdfToAttach.content // Content is already base64 encoded from upload
                  };
                  
                  const attachmentResp = await axios.post(
                    `${apiBaseUrl}/v2/salesdocumentattachments`,
                    attachmentData,
                    {
                      headers: {
                        'Authorization': `Bearer ${tokens.access_token}`,
                        'Content-Type': 'application/json'
                      }
                    }
                  );
                  
                  console.log(`✅ PDF attachment successful for invoice ${invoiceResp.data.Id}`);
                  
                  // Track successful attachment
                  if (!invoiceAttachments[invoiceResp.data.Id]) {
                    invoiceAttachments[invoiceResp.data.Id] = [];
                  }
                  invoiceAttachments[invoiceResp.data.Id].push({
                    filename: pdfToAttach.filename,
                    status: 'attached',
                    attachmentId: attachmentResp.data.Id
                  });
                  
                  // Update invoice result to show PDF was attached
                  const resultIndex = invoiceResults.findIndex(r => r.referanse === invoice.referanse);
                  if (resultIndex !== -1) {
                    invoiceResults[resultIndex].pdf_attached = true;
                  }
                  
                } else {
                  console.log(`[${invoice.referanse}] No PDF content available for attachment`);
                }
              
              } catch (pdfError) {
                console.error(`❌ PDF attachment failed for invoice ${invoiceResp.data.Id}:`, pdfError.response?.data || pdfError.message);
                
                // Track failed attachment
                if (!invoiceAttachments[invoiceResp.data.Id]) {
                  invoiceAttachments[invoiceResp.data.Id] = [];
                }
                invoiceAttachments[invoiceResp.data.Id].push({
                  filename: invoice.declaration_pdf?.filename || 'unknown.pdf',
                  status: 'failed',
                  error: pdfError.response?.data || pdfError.message
                });
              }
            }
            
            results.successful++;

          } catch (error) {
            console.error(`❌ [${invoice.referanse}] Invoice creation failed.`);
            if (error.response) {
              console.error(`[${invoice.referanse}] Status: ${error.response.status}`);
              console.error(`[${invoice.referanse}] Headers:`, JSON.stringify(error.response.headers));
              console.error(`[${invoice.referanse}] Data:`, JSON.stringify(error.response.data));
            } else if (error.request) {
              console.error(`[${invoice.referanse}] No response received.`);
            } else {
              console.error(`[${invoice.referanse}] Error setting up request:`, error.message);
            }
            
            // Track failed invoice creation
            invoiceResults.push({
              referanse: invoice.referanse,
              status: 'DRAFT',
              error: error.response?.data?.DeveloperErrorMessage || error.message
            });
            
            results.failed++;
            results.errors.push(`${invoice.referanse}: ${error.response?.data?.DeveloperErrorMessage || error.message}`);
          }

      } catch (error) {
        // This catch handles any errors that occurred during invoice processing
        console.error(`❌ [${invoice.referanse}] A critical error occurred:`, error.message);
        
        // Track failed invoice creation
        invoiceResults.push({
          referanse: invoice.referanse,
          status: 'DRAFT',
          error: `Critical error - ${error.message}`
        });
        
        results.failed++;
        results.errors.push(`${invoice.referanse}: Critical error - ${error.message}`);
      }
      
      // Small delay between invoices to avoid rate limiting
      if (i < importInvoices.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`📍 Invoice creation completed: ${results.successful} successful, ${results.failed} failed`);
    
    // Calculate remaining invoices based on actual processing
    const totalInvoices = importInvoices.length;
    const actualProcessedCount = startIndex + results.successful + results.failed;
    const remainingInvoices = totalInvoices - actualProcessedCount;
    
    console.log(`📍 Processing summary: started at ${startIndex}, processed ${results.successful + results.failed}, remaining ${remainingInvoices}`);
    
    res.json({ 
      success: true,
      summary: {
        successful: results.successful,
        failed: results.failed,
        total: totalInvoices,
        processed: actualProcessedCount,
        remaining: remainingInvoices
      },
      message: `Created ${results.successful} invoices in Visma. ${results.failed} failed. ${remainingInvoices} remaining.`,
      errors: results.errors.slice(0, 10),
      invoices_processed: actualProcessedCount,
      invoice_results: invoiceResults,
      invoice_attachments: invoiceAttachments,
      // Information for resuming processing
      processing_info: {
        import_id: import_id,
        start_index: startIndex,
        end_index: actualProcessedCount,
        chunk_size: chunkSize,
        next_start_index: remainingInvoices > 0 ? actualProcessedCount : null,
        has_remaining: remainingInvoices > 0
      },
      note: remainingInvoices > 0 
        ? `Processed ${actualProcessedCount}/${totalInvoices} invoices. ${remainingInvoices} remaining - use "Continue Processing" to process the rest.`
        : 'All invoices processed with status tracking.'
    });
    } catch (error) {
    console.error('📍 Create direct invoices error:', error);
    console.error('📍 Error stack:', error.stack);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to create invoices in Visma';
    if (error.message.includes('timeout')) {
      errorMessage = 'Request timed out. Some invoices may have been created. Please check the invoice list and use "Continue Processing" if needed.';
    } else if (error.message.includes('ECONNRESET') || error.message.includes('socket')) {
      errorMessage = 'Connection lost during processing. Some invoices may have been created. Please refresh and check the invoice list.';
    }
    
    // Try to provide processing info even on error if we have partial results
    let partialProcessingInfo = null;
    if (typeof results !== 'undefined' && results.successful > 0) {
      const totalInvoices = importInvoices?.length || 0;
      const actualProcessedCount = startIndex + results.successful + results.failed;
      const remainingInvoices = totalInvoices - actualProcessedCount;
      
      partialProcessingInfo = {
        import_id: import_id,
        start_index: startIndex,
        end_index: actualProcessedCount,
        chunk_size: chunkSize,
        next_start_index: remainingInvoices > 0 ? actualProcessedCount : null,
        has_remaining: remainingInvoices > 0
      };
    }
    
    res.status(500).json({ 
      error: errorMessage, 
      details: error.message,
      technical_error: error.stack,
      summary: typeof results !== 'undefined' ? {
        successful: results.successful || 0,
        failed: results.failed || 0,
        remaining: partialProcessingInfo ? (importInvoices?.length || 0) - (startIndex + results.successful + results.failed) : 0
      } : undefined,
      processing_info: partialProcessingInfo
    });
  }
};
