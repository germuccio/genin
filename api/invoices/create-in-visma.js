const { setCors, getSession, getVismaTokensFromCookie } = require('../_utils');
const axios = require('axios');

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
    console.log('🚀 Starting Visma invoice creation in Vercel...');
    
    const tokens = getVismaTokensFromCookie(req);
    if (!tokens || !tokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Visma. Please connect in Setup.' });
    }

    const { import_id, customerDefaults, customerOverrides, articleMapping } = req.body;
    
    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    if (!articleMapping || !articleMapping.ok) {
      return res.status(400).json({ error: 'Article mapping is required. Please configure in Setup.' });
    }

    // Get processed invoices from memory
    const importData = global.processedImports && global.processedImports[import_id];
    if (!importData) {
      return res.status(404).json({ error: 'Import not found. Please upload a file first.' });
    }

    console.log(`📋 Processing ${importData.invoices.length} invoices...`);

    const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
    const results = { successful: 0, failed: 0, errors: [] };

    // Process invoices in smaller batches to avoid timeout
    const BATCH_SIZE = 5;
    const invoices = importData.invoices.slice(0, 10); // Limit to 10 for Vercel timeout constraints
    
    for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
      const batch = invoices.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}: ${batch.length} invoices`);
      
      for (const invoice of batch) {
        try {
          // Create/find customer
          const customerName = invoice.mottaker.trim();
          let customerId;
          
          try {
            // Search for existing customer
            const searchResponse = await axios.get(`${apiBaseUrl}/v2/customers?$filter=Name eq '${encodeURIComponent(customerName)}'`, {
              headers: { 'Authorization': `Bearer ${tokens.access_token}` }
            });
            
            if (searchResponse.data.Data && searchResponse.data.Data.length > 0) {
              customerId = searchResponse.data.Data[0].Id;
              console.log(`✅ Found customer: ${customerName}`);
            } else {
              // Create new customer
              const customerData = {
                Name: customerName,
                InvoiceCity: customerDefaults?.InvoiceCity || 'Oslo',
                InvoicePostalCode: customerDefaults?.InvoicePostalCode || '0001',
                IsPrivatePerson: false,
                TermsOfPaymentId: customerDefaults?.TermsOfPaymentId || null
              };
              
              const createResponse = await axios.post(`${apiBaseUrl}/v2/customers`, customerData, {
                headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' }
              });
              
              customerId = createResponse.data.Id;
              console.log(`✅ Created customer: ${customerName}`);
            }
          } catch (customerError) {
            console.error(`❌ Customer error for ${customerName}:`, customerError.response?.data || customerError.message);
            results.failed++;
            results.errors.push(`Customer error for ${customerName}: ${customerError.message}`);
            continue;
          }

          // Create invoice
          const invoiceData = {
            CustomerId: customerId,
            InvoiceDate: new Date().toISOString().split('T')[0],
            DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days
            YourReference: invoice.your_reference || invoice.avsender,
            OurReference: invoice.our_reference,
            CurrencyCode: invoice.currency || 'NOK',
            Rows: [{
              ArticleId: articleMapping.ok,
              Description: `Transport service - ${invoice.our_reference}`,
              Quantity: 1,
              UnitPrice: invoice.amount || 414,
              VatRate: 25
            }]
          };

          const invoiceResponse = await axios.post(`${apiBaseUrl}/v2/invoices`, invoiceData, {
            headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' }
          });

          console.log(`✅ Created invoice for ${customerName}: ${invoiceResponse.data.Id}`);
          results.successful++;

        } catch (invoiceError) {
          console.error(`❌ Invoice error for ${invoice.mottaker}:`, invoiceError.response?.data || invoiceError.message);
          results.failed++;
          results.errors.push(`Invoice error for ${invoice.mottaker}: ${invoiceError.message}`);
        }
      }
    }

    console.log(`🎉 Vercel invoice creation completed: ${results.successful} successful, ${results.failed} failed`);

    res.json({ 
      success: true,
      summary: results,
      processed_count: Math.min(invoices.length, 10),
      total_available: importData.invoices.length,
      note: importData.invoices.length > 10 ? 'Limited to 10 invoices in Vercel due to timeout constraints. Use local development for larger batches.' : undefined
    });
    
  } catch (error) {
    console.error('❌ Vercel invoice creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create invoices in Visma', 
      message: error.message,
      details: 'Check Vercel function logs for more information'
    });
  }
};
