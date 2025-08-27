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
    console.log('📍 Create direct invoices endpoint called');
    console.log('📍 Request body:', req.body);
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
    
    const { import_id, articleMapping, customerDefaults, customerOverrides, processed_invoices } = req.body;
    console.log('📍 Parsed request data:', { import_id, articleMapping, customerDefaults, customerOverrides, processed_invoices: processed_invoices ? `${processed_invoices.length} invoices` : 'none' });
    
    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    // Try to get invoices from global storage first (for local development)
    let importInvoices = [];
    const globalInvoices = global.invoices || [];
    const globalImportInvoices = globalInvoices.filter(inv => inv.import_id === parseInt(import_id));
    
    if (globalImportInvoices.length > 0) {
      importInvoices = globalImportInvoices;
      console.log('📍 Found', importInvoices.length, 'invoices from global storage for import_id:', import_id);
    } else if (processed_invoices && Array.isArray(processed_invoices)) {
      // Fallback: use processed invoices passed from frontend (for Vercel stateless environment)
      importInvoices = processed_invoices;
      console.log('📍 Using', importInvoices.length, 'invoices from request body for import_id:', import_id);
    } else {
      console.log('📍 No invoices found in global storage or request body for import_id:', import_id);
      return res.status(404).json({ 
        error: 'No invoices found for this import ID',
        import_id: import_id,
        available_imports: [...new Set(globalInvoices.map(i => i.import_id))],
        note: 'In Vercel, pass processed_invoices in request body'
      });
    }

    // Actually create invoices in Visma
    console.log('📍 Creating', importInvoices.length, 'invoices in Visma...');
    
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    const apiBaseUrl = tokens.instance_url || 'https://eaccountingapi.vismaonline.com';

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
      if (termsResp.data && termsResp.data.Data && termsResp.data.Data.length > 0) {
        termsOfPaymentId = termsResp.data.Data[0].Id;
        console.log(`📍 Using terms of payment: ${termsResp.data.Data[0].Name} (${termsOfPaymentId})`);
      } else {
        console.log('📍 No terms of payment found in response data');
      }
    } catch (termsErr) {
      console.log('📍 Could not fetch terms of payment:');
      console.log('📍 Error status:', termsErr.response?.status);
      console.log('📍 Error data:', JSON.stringify(termsErr.response?.data));
      console.log('📍 Error message:', termsErr.message);
      console.log('📍 API URL used:', `${apiBaseUrl}/v2/termsofpayments`);
    }

    if (!termsOfPaymentId) {
      console.log('📍 No terms of payment found, will try to create invoices without it and let Visma use default');
      // Don't fail here - let's try to create invoices and see if Visma accepts them without terms of payment
    }

    // Process invoices in batches to avoid timeout
    const batchSize = 5;
    for (let i = 0; i < importInvoices.length; i += batchSize) {
      const batch = importInvoices.slice(i, i + batchSize);
      console.log(`📍 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(importInvoices.length/batchSize)}`);
      
      for (const invoice of batch) {
        try {
          // Create customer if needed
          let customerId = null;
          const customerName = invoice.mottaker || 'Unknown Customer';
          
          // Try to find existing customer first
          try {
            const customerSearchResp = await axios.get(`${apiBaseUrl}/v2/customers`, {
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
              },
              params: {
                name: customerName
              }
            });
            
            if (customerSearchResp.data && customerSearchResp.data.length > 0) {
              customerId = customerSearchResp.data[0].id;
              console.log(`📍 Found existing customer: ${customerName} (${customerId})`);
            }
          } catch (searchErr) {
            console.log('📍 Customer search failed, will create new customer');
          }
          
          // Create customer if not found
          if (!customerId) {
            const customerData = {
              name: customerName,
              address: {
                address: customerDefaults.address || 'Ukjent adresse',
                postalCode: customerDefaults.postalCode || '0001',
                city: customerDefaults.city || 'Oslo',
                country: customerDefaults.country || 'NO'
              },
              isPrivatePerson: false
            };
            
            const customerResp = await axios.post(`${apiBaseUrl}/v2/customers`, customerData, {
              headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
              }
            });
            
            customerId = customerResp.data.id;
            console.log(`📍 Created customer: ${customerName} (${customerId})`);
          }

          // Get article ID from mapping
          const articleId = articleMapping.ok || articleMapping['OK'] || null;
          if (!articleId) {
            throw new Error('No article mapping found for status OK');
          }

          // Create invoice with all required fields (using PascalCase like local server)
          const invoiceData = {
            CustomerId: customerId,
            InvoiceDate: new Date().toISOString().split('T')[0],
            DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
            CurrencyCode: invoice.currency || 'NOK',
            YourReference: invoice.avsender, // Use sender as your reference like local server
            OurReference: invoice.referanse,
            RotReducedInvoicingType: 0,
            EuThirdParty: false,
            Rows: [{
              IsTextRow: false,
              ArticleId: articleId,
              Description: `Transport service - ${invoice.referanse}`,
              Quantity: 1,
              UnitPrice: invoice.unit_price || 414,
              VatRate: 25, // Standard Norwegian VAT
              LineNumber: 1,
              IsWorkCost: false,
              EligibleForReverseChargeOnVat: false,
              HideRow: false,
              ReversedConstructionServicesVatFree: false
            }]
          };

          // Add terms of payment only if we have one
          if (termsOfPaymentId) {
            invoiceData.TermsOfPaymentId = termsOfPaymentId;
          }

          console.log(`📍 Creating invoice ${invoice.referanse} with data:`, JSON.stringify(invoiceData, null, 2));

          const invoiceResp = await axios.post(`${apiBaseUrl}/v2/invoices`, invoiceData, {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
              'Content-Type': 'application/json'
            }
          });

          console.log(`✅ Created invoice: ${invoice.referanse} (Visma ID: ${invoiceResp.data.id})`);
          results.successful++;
          
        } catch (error) {
          console.error(`❌ Failed to create invoice ${invoice.referanse}:`, error.response?.data || error.message);
          results.failed++;
          results.errors.push(`${invoice.referanse}: ${error.response?.data?.message || error.message}`);
        }
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < importInvoices.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`📍 Invoice creation completed: ${results.successful} successful, ${results.failed} failed`);
    
    res.json({ 
      success: true,
      summary: {
        successful: results.successful,
        failed: results.failed
      },
      message: `Created ${results.successful} invoices in Visma. ${results.failed} failed.`,
      errors: results.errors.slice(0, 10), // Limit errors to avoid response size issues
      invoices_processed: importInvoices.length
    });
  } catch (error) {
    console.error('📍 Create direct invoices error:', error);
    console.error('📍 Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to create invoices in Visma', 
      details: error.message,
      stack: error.stack 
    });
  }
};
