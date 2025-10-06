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
    
    const { import_id, articleMapping, customerDefaults, customerOverrides, processed_invoices, import_data, pdf_content_map } = req.body;
    console.log('📍 Parsed request data:', { 
      import_id, 
      articleMapping, 
      customerDefaults, 
      customerOverrides, 
      processed_invoices: processed_invoices ? `${processed_invoices.length} invoices` : 'none',
      import_data: import_data ? `Available with ${import_data.invoices?.length || 0} invoices` : 'none',
      pdf_content_map_keys: pdf_content_map ? Object.keys(pdf_content_map).length : 0
    });
    
    // Work with a mutable copy for fallbacks below
    let importDataLocal = import_data;
    
    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    // PRIORITIZE import_data for Vercel (more reliable than processed_invoices)
    let importInvoices = [];
    
    // First, try to use import_data if available (Vercel preferred path)
    if (importDataLocal && Array.isArray(importDataLocal.invoices) && importDataLocal.invoices.length > 0) {
      console.log(`📍 Using import_data with ${importDataLocal.invoices.length} invoices (Vercel path)`);
      importInvoices = importDataLocal.invoices
        .filter(invoice => {
          // Only process invoices with OK status (same logic as process-import)
          const statusCode = invoice.raw_data?.['s.NO'] || invoice.raw_data?.Status || 'OK';
          return statusCode === 'OK';
        })
        .map((invoice, index) => {
          const referanse = invoice.our_reference || invoice.referanse || `REF-${Date.now()}-${index}`;
          
          // Try to match PDF by filename containing the invoice reference or line declaration number
          let matchedPdf = null;
          if (importDataLocal.pdfs && Array.isArray(importDataLocal.pdfs)) {
            // First try to match by "Linjedekl. nr." from Excel (this should match PDF filename)
            let lineDeclarationNr = invoice.raw_data?.['Linjedekl. nr.'] || invoice.raw_data?.['Line Declaration Nr'];
            
            // Handle scientific notation: convert to full number string if needed
            if (lineDeclarationNr && typeof lineDeclarationNr === 'number') {
              lineDeclarationNr = lineDeclarationNr.toFixed(0);
            } else if (lineDeclarationNr && typeof lineDeclarationNr === 'string' && lineDeclarationNr.includes('E')) {
              try {
                const numberValue = parseFloat(lineDeclarationNr);
                lineDeclarationNr = numberValue.toFixed(0);
              } catch (e) {
                console.warn(`⚠️ Failed to convert scientific notation: ${lineDeclarationNr}`);
              }
            }
            
            if (lineDeclarationNr) {
              // Use exact matching: compare line declaration number with filename (without .pdf extension)
              const lineNumStr = String(lineDeclarationNr);
              matchedPdf = importDataLocal.pdfs.find(pdf => {
                if (!pdf.filename) return false;
                const pdfNameWithoutExt = pdf.filename.replace(/\.pdf$/i, '');
                return pdfNameWithoutExt === lineNumStr;
              });
            }
            // Fallback: try to match by invoice reference (only if no Line Declaration Nr exists)
            if (!matchedPdf && !lineDeclarationNr) {
              matchedPdf = importDataLocal.pdfs.find(pdf => pdf.filename && pdf.filename.includes(referanse));
            }
            // DISABLED: Index-based matching causes wrong PDF assignments
            // Only use if there's NO Line Declaration Nr at all
            if (!matchedPdf && !lineDeclarationNr && importDataLocal.pdfs[index]) {
              matchedPdf = importDataLocal.pdfs[index];
            }
          }
          
          return {
            referanse,
            mottaker: invoice.mottaker || `Customer ${index + 1}`,
            avsender: invoice.avsender || 'Default Sender',
            currency: invoice.currency || 'NOK',
            declaration_pdf: matchedPdf ? {
              filename: matchedPdf.filename,
              size: matchedPdf.size,
              mimetype: matchedPdf.mimetype,
              index: matchedPdf.index
            } : null
          };
        });
      console.log(`📍 Filtered to ${importInvoices.length} invoices with OK status from import_data`);
    }
    // Fallback to processed_invoices (local development path)
    else if (Array.isArray(processed_invoices)) {
      importInvoices = processed_invoices;
      console.log(`📍 Using ${importInvoices.length} invoices from processed_invoices array (local path)`);
    } else if (typeof processed_invoices === 'string') {
      console.log(`⚠️ WARNING: processed_invoices is a string: "${processed_invoices}"`);
      console.log(`📍 This indicates data corruption during transmission - using stored data instead`);
      
      // ALWAYS use global storage for corrupted data - this is more reliable
      if (global.processedImports && global.processedImports[import_id]) {
        const storedData = global.processedImports[import_id];
        console.log(`📍 Found stored data for import_id: ${import_id} with ${storedData.invoices.length} invoices`);
        
        importInvoices = storedData.invoices.map((invoice, index) => {
          const referanse = invoice.our_reference || invoice.referanse || `REF-${Date.now()}-${index}`;
          
          // Try to match PDF by filename containing the invoice reference or line declaration number
          let matchedPdf = null;
          if (storedData.pdfs && Array.isArray(storedData.pdfs)) {
            // First try to match by "Linjedekl. nr." from Excel (this should match PDF filename)
            let lineDeclarationNr = invoice.raw_data?.['Linjedekl. nr.'] || invoice.raw_data?.['Line Declaration Nr'];
            
            // Handle scientific notation: convert to full number string if needed
            if (lineDeclarationNr && typeof lineDeclarationNr === 'number') {
              lineDeclarationNr = lineDeclarationNr.toFixed(0);
            } else if (lineDeclarationNr && typeof lineDeclarationNr === 'string' && lineDeclarationNr.includes('E')) {
              try {
                const numberValue = parseFloat(lineDeclarationNr);
                lineDeclarationNr = numberValue.toFixed(0);
              } catch (e) {
                console.warn(`⚠️ Failed to convert scientific notation: ${lineDeclarationNr}`);
              }
            }
            
            if (lineDeclarationNr) {
              matchedPdf = storedData.pdfs.find(pdf => pdf.filename && pdf.filename.includes(String(lineDeclarationNr)));
            }
            // Fallback: try to match by invoice reference
            if (!matchedPdf) {
              matchedPdf = storedData.pdfs.find(pdf => pdf.filename && pdf.filename.includes(referanse));
            }
            // Last resort: try by index (original logic)
            if (!matchedPdf && storedData.pdfs[index]) {
              matchedPdf = storedData.pdfs[index];
            }
          }
          
          return {
            referanse,
            mottaker: invoice.mottaker || `Customer ${index + 1}`,
            avsender: invoice.avsender || 'Default Sender',
            currency: invoice.currency || 'NOK',
            declaration_pdf: matchedPdf ? {
              filename: matchedPdf.filename,
              size: matchedPdf.size,
              mimetype: matchedPdf.mimetype,
              index: matchedPdf.index
            } : null
          };
        });
        console.log(`📍 Successfully reconstructed ${importInvoices.length} invoices from stored data`);
        
        // Store the import_data for PDF attachment
        importDataLocal = storedData;
        console.log(`📍 Using ${importInvoices.length} invoices from stored data recovery`);
      } else {
        console.log(`❌ CRITICAL: No stored data found for import_id: ${import_id}`);
        console.log(`📍 Available import IDs:`, Object.keys(global.processedImports || {}));
        return res.status(400).json({ 
          error: 'Data corruption detected and no backup data available. Please re-upload your files.',
          details: 'The request payload was corrupted during transmission and no stored data was found.'
        });
      }
    } else {
      console.log(`📍 No processed_invoices data available and no import_data found`);
      console.log(`📍 Request contained:`, {
        import_id,
        has_processed_invoices: !!processed_invoices,
        processed_invoices_type: typeof processed_invoices,
        has_import_data: !!import_data,
        import_data_type: typeof import_data
      });
      return res.status(400).json({ 
        error: 'No invoice data available',
        details: 'Neither processed_invoices nor import_data was provided or valid',
        debug_info: {
          import_id,
          processed_invoices_received: typeof processed_invoices,
          import_data_received: typeof import_data
        }
      });
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
    
    // Initialize global processing results storage for this request
    if (!global.lastProcessingResults) {
      global.lastProcessingResults = {};
    }
    
    // Clear old results for this import_id to start fresh
    const currentImportResults = {};
    global.lastProcessingResults = { ...global.lastProcessingResults };
    
    // Get processing parameters from request (for resume functionality)
    const startIndex = parseInt(req.body.start_index) || 0;
    // Very small batch size for Vercel based on observed performance (0.6 invoices/second)
    const chunkSize = 5; // Process only 5 invoices per request to stay well under timeout
    const endIndex = Math.min(startIndex + chunkSize, importInvoices.length);
    
    console.log(`📍 Processing chunk: invoices ${startIndex + 1}-${endIndex} of ${importInvoices.length}`);
    
    // Add timeout tracking to prevent Vercel timeout
    const processingStartTime = Date.now();
    const MAX_PROCESSING_TIME = 6000; // 6 seconds to leave even more buffer for Vercel's 10s limit
    
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
            // Use Visma's built-in name filtering with exact match first
            let customerSearchResp = await axios.get(`${apiBaseUrl}/v2/customers?$filter=Name eq '${encodeURIComponent(customerName)}'`, {
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
              }
            });
            
            let matchingCustomers = [];
            if (customerSearchResp.data && customerSearchResp.data.Data && customerSearchResp.data.Data.length > 0) {
              matchingCustomers = customerSearchResp.data.Data;
              console.log(`[${invoice.referanse}] Found ${matchingCustomers.length} exact matches for "${customerName}"`);
            } else {
              // If no exact match, try partial/fuzzy search by getting all customers and filtering
              console.log(`[${invoice.referanse}] No exact match, trying partial search...`);
              customerSearchResp = await axios.get(`${apiBaseUrl}/v2/customers?$top=1000`, {
                headers: {
                  'Authorization': `Bearer ${tokens.access_token}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (customerSearchResp.data && customerSearchResp.data.Data && customerSearchResp.data.Data.length > 0) {
                // Try partial matching (case-insensitive)
                matchingCustomers = customerSearchResp.data.Data.filter(customer => 
                  customer.Name && customer.Name.toLowerCase().includes(customerName.toLowerCase())
                );
                console.log(`[${invoice.referanse}] Found ${matchingCustomers.length} partial matches for "${customerName}"`);
              }
            }
            
            if (matchingCustomers.length > 0) {
              customerId = matchingCustomers[0].Id;
              console.log(`[${invoice.referanse}] Found existing customer: ${matchingCustomers[0].Name} (${customerId})`);
            } else {
              console.log(`[${invoice.referanse}] Customer not found in ${customerSearchResp.data?.Meta?.TotalNumberOfResults || 'unknown'} total customers`);
            }
            
            // DEBUG: Log search details (but not full response to avoid clutter)
            console.log(`[${invoice.referanse}] DEBUG - Customer search:`, {
              searchName: customerName,
              totalCustomers: customerSearchResp.data?.Meta?.TotalNumberOfResults || 0,
              matchesFound: matchingCustomers.length,
              firstMatchName: matchingCustomers[0]?.Name || 'none'
            });
          } catch (searchErr) {
            console.error(`[${invoice.referanse}] Customer search failed:`, searchErr.response?.data || searchErr.message);
          }
          
          // Skip invoice creation if customer not found (do not auto-create customers)
          if (!customerId) {
            console.log(`[${invoice.referanse}] ❌ Customer "${customerName}" not found in Visma - SKIPPING invoice creation`);
            results.failed++;
            results.errors.push(`${invoice.referanse}: CUSTOMER_NOT_FOUND - "${customerName}" does not exist in Visma`);
            
            // Track this invoice with customer not found status
            invoiceResults.push({
              referanse: invoice.referanse,
              mottaker: customerName,
              status: 'CUSTOMER_NOT_FOUND',
              error: `Customer "${customerName}" not found in Visma`,
              visma_id: null,
              amount: (invoice.total_cents || 41400) / 100 // Default to 414 if not set
            });
            
            // Store in global results for invoice list to access
            global.lastProcessingResults[invoice.referanse] = {
              referanse: invoice.referanse,
              mottaker: customerName,
              status: 'CUSTOMER_NOT_FOUND',
              customer_validation_status: 'NOT_FOUND',
              amount: (invoice.total_cents || 41400) / 100, // Default to 414 if not set
              filename: importInvoices[0]?.filename || 'Unknown'
            };
            console.log(`📋 DEBUG: Stored CUSTOMER_NOT_FOUND result for ${invoice.referanse}:`, global.lastProcessingResults[invoice.referanse]);
            
            // Also store in persistent global.processedImports for cross-function access
            if (!global.processedImports) {
              global.processedImports = {};
            }
            if (!global.processedImports[import_id]) {
              global.processedImports[import_id] = {};
            }
            if (!global.processedImports[import_id].customer_not_found_invoices) {
              global.processedImports[import_id].customer_not_found_invoices = [];
            }
            
            const customerNotFoundInvoice = {
              referanse: invoice.referanse,
              mottaker: customerName,
              amount: (invoice.total_cents || 41400) / 100,
              filename: importInvoices[0]?.filename || 'Unknown',
              error: `Customer "${customerName}" not found in Visma`
            };
            
            // Check if this customer not found invoice already exists to avoid duplicates
            const existingNotFound = global.processedImports[import_id].customer_not_found_invoices.find(inv => 
              inv.referanse === invoice.referanse
            );
            
            if (!existingNotFound) {
              global.processedImports[import_id].customer_not_found_invoices.push(customerNotFoundInvoice);
              console.log(`📋 DEBUG: Stored CUSTOMER_NOT_FOUND in persistent storage for ${invoice.referanse}:`, customerNotFoundInvoice);
            }
            
            continue; // Skip this invoice entirely
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
              mottaker: customerName,
              status: 'CREATED_AS_DRAFT',
              visma_id: invoiceResp.data.Id,
              amount: (invoice.total_cents || 41400) / 100, // Default to 414 if not set
              pdf_attached: false
            });
            
            // Store in global results for invoice list to access
            global.lastProcessingResults[invoice.referanse] = {
              referanse: invoice.referanse,
              mottaker: customerName,
              status: 'CREATED_AS_DRAFT',
              customer_validation_status: 'FOUND',
              amount: (invoice.total_cents || 41400) / 100, // Default to 414 if not set
              visma_id: invoiceResp.data.Id,
              filename: importInvoices[0]?.filename || 'Unknown'
            };
            
            // Try to attach PDF if available
            if (invoice.declaration_pdf || invoice.pdf_data) {
              try {
                console.log(`[${invoice.referanse}] Attempting to attach PDF...`);
              
                // Use the pre-matched PDF from declaration_pdf
                let pdfToAttach = invoice.declaration_pdf;
                
                console.log(`[${invoice.referanse}] PDF to attach:`, pdfToAttach ? `${pdfToAttach.filename} (${pdfToAttach.size} bytes)` : 'none');
                
                // If no inline content (because of chunked, metadata-only uploads), try to recover from provided pdf_content_map first
                if (pdfToAttach && !pdfToAttach.content && pdf_content_map && pdf_content_map[pdfToAttach.filename]) {
                  pdfToAttach = { ...pdfToAttach, content: pdf_content_map[pdfToAttach.filename] };
                  console.log(`[${invoice.referanse}] Recovered PDF content from request map for ${pdfToAttach.filename}`);
                }

                // If still no content, try to recover from global store by import_id
                if (pdfToAttach && !pdfToAttach.content && import_id && global.processedImports && global.processedImports[import_id]) {
                  try {
                    const stored = global.processedImports[import_id];
                    console.log(`[${invoice.referanse}] Attempting to recover PDF content from global store. Available PDFs: ${stored.pdfs?.length || 0}`);
                    console.log(`[${invoice.referanse}] Looking for PDF: ${pdfToAttach.filename} (size: ${pdfToAttach.size}, index: ${pdfToAttach.index})`);
                    
                    let match = null;
                    // Prefer index match if present
                    if (typeof pdfToAttach.index === 'number' && stored.pdfs && stored.pdfs[pdfToAttach.index]) {
                      match = stored.pdfs[pdfToAttach.index];
                      console.log(`[${invoice.referanse}] Found by index ${pdfToAttach.index}: ${match.filename}`);
                    }
                    // Fallback to filename+size match
                    if (!match && Array.isArray(stored.pdfs)) {
                      match = stored.pdfs.find(p => p.filename === pdfToAttach.filename && p.size === pdfToAttach.size);
                      if (match) {
                        console.log(`[${invoice.referanse}] Found by filename+size: ${match.filename}`);
                      }
                    }
                    // Last resort: try filename only (without " copy" suffix)
                    if (!match && Array.isArray(stored.pdfs)) {
                      const baseFilename = pdfToAttach.filename.replace(/ copy.*\.pdf$/, '.pdf');
                      match = stored.pdfs.find(p => p.filename === baseFilename || p.filename.startsWith(baseFilename.replace('.pdf', '')));
                      if (match) {
                        console.log(`[${invoice.referanse}] Found by base filename: ${match.filename} (searched for: ${baseFilename})`);
                      }
                    }
                    
                    if (match && match.content) {
                      pdfToAttach = { ...pdfToAttach, content: match.content };
                      console.log(`[${invoice.referanse}] ✅ Recovered PDF content from global store for ${pdfToAttach.filename} (${match.content.length} chars)`);
                    } else {
                      console.log(`[${invoice.referanse}] ❌ Could not recover PDF content from global store for ${pdfToAttach?.filename}`);
                      console.log(`[${invoice.referanse}] Available PDFs in store:`, stored.pdfs?.map(p => `${p.filename} (${p.size}b, hasContent: ${!!p.content})`));
                    }
                  } catch (recoverErr) {
                    console.warn(`[${invoice.referanse}] PDF content recovery failed:`, recoverErr.message);
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
      
      // No delay for Vercel - we need to maximize processing in limited time
      // Visma API can handle the rate without delays for small batches
    }

    console.log(`📍 Invoice creation completed: ${results.successful} successful, ${results.failed} failed`);
    
    // Store failed invoices in global storage so they can be retrieved later
    const actuallyFailedResults = invoiceResults.filter(result => result.status === 'DRAFT');
    const customerNotFoundResults = invoiceResults.filter(result => result.status === 'CUSTOMER_NOT_FOUND');
    
    if (actuallyFailedResults.length > 0) {
      console.log(`📍 Storing ${actuallyFailedResults.length} failed invoices in global storage`);
      
      actuallyFailedResults.forEach(failedResult => {
        // Find the original invoice data to get full details
        const originalInvoice = importInvoices.find(inv => inv.referanse === failedResult.referanse);
        if (originalInvoice) {
          const failedInvoice = {
            id: `failed-${failedResult.referanse}-${Date.now()}`,
            import_id: import_id,
            referanse: failedResult.referanse,
            mottaker: originalInvoice.mottaker,
            avsender: originalInvoice.avsender || 'Genin',
            total_cents: originalInvoice.total_cents || Math.round((originalInvoice.amount || 414) * 100),
            unit_price: originalInvoice.amount || 414,
            currency: originalInvoice.currency || 'NOK',
            status: 'FAILED',
            error_message: failedResult.error,
            visma_invoice_id: null,
            created_at: new Date().toISOString(),
            filename: originalInvoice.filename || 'Unknown',
            customer_validation_status: 'FAILED',
            service_description: 'Transport service'
          };
          
          // Initialize global.invoices if it doesn't exist
          if (!global.invoices) {
            global.invoices = [];
          }
          
          // Check if this failed invoice already exists to avoid duplicates
          const existingFailed = global.invoices.find(inv => 
            inv.referanse === failedResult.referanse && inv.status === 'FAILED'
          );
          
          if (!existingFailed) {
            global.invoices.push(failedInvoice);
            console.log(`📍 Stored failed invoice: ${failedResult.referanse} - ${failedResult.error}`);
          }
        }
      });
    }
    
    // Note: CUSTOMER_NOT_FOUND invoices are already stored in global.lastProcessingResults
    // during the processing loop above, so no additional storage needed here
    if (customerNotFoundResults.length > 0) {
      console.log(`📍 ${customerNotFoundResults.length} customer not found invoices already stored in global.lastProcessingResults`);
    }
    
    // Calculate remaining invoices based on actual processing
    const totalInvoices = importInvoices.length;
    const chunkProcessedCount = results.successful + results.failed; // Only this chunk's count
    const totalProcessedSoFar = startIndex + chunkProcessedCount; // Total processed so far
    const remainingInvoices = totalInvoices - totalProcessedSoFar;
    
    console.log(`📍 Processing summary: started at ${startIndex}, processed ${chunkProcessedCount}, remaining ${remainingInvoices}`);
    
    res.json({ 
      success: true,
      summary: {
        successful: results.successful,
        failed: results.failed,
        total: totalInvoices,
        processed: chunkProcessedCount, // Only this chunk's count for frontend accumulation
        total_processed_so_far: totalProcessedSoFar, // Total for debugging
        remaining: remainingInvoices
      },
      message: `Created ${results.successful} invoices in Visma. ${results.failed} failed. ${remainingInvoices} remaining.`,
      errors: results.errors.slice(0, 10),
      // Always include processing_info for continue functionality
      processing_info: remainingInvoices > 0 ? {
        import_id: import_id,
        has_remaining: true,
        remaining: remainingInvoices,
        next_start_index: totalProcessedSoFar,
        total: totalInvoices,
        processed_so_far: totalProcessedSoFar
      } : null,
      invoices_processed: totalProcessedSoFar,
      invoice_results: invoiceResults,
      invoice_attachments: invoiceAttachments,
      customer_not_found_invoices: invoiceResults.filter(r => r.status === 'CUSTOMER_NOT_FOUND'),
      note: remainingInvoices > 0 
        ? `Processed ${totalProcessedSoFar}/${totalInvoices} invoices. ${remainingInvoices} remaining - use "Continue Processing" to process the rest.`
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
      const totalProcessedSoFarError = startIndex + results.successful + results.failed;
      const remainingInvoices = totalInvoices - totalProcessedSoFarError;
      
      partialProcessingInfo = {
        import_id: import_id,
        start_index: startIndex,
        end_index: totalProcessedSoFarError,
        chunk_size: chunkSize,
        next_start_index: remainingInvoices > 0 ? totalProcessedSoFarError : null,
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
