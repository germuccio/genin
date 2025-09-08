const { setCors, getSession, getVismaTokensFromCookie } = require('../_utils');
const axios = require('axios');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  console.log('📋 Invoice data request received on Vercel');

  if (req.method === 'GET') {
    try {
      // Get import_id from query parameters
      const import_id = req.query?.import_id;
      
      // Get Visma tokens for API calls
      const tokens = getVismaTokensFromCookie(req);
      if (!tokens || !tokens.access_token) {
        return res.status(401).json({ error: 'Not authenticated with Visma' });
      }

      const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
      const headers = {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json'
      };

      if (import_id) {
        // Get specific import data - try to fetch from Visma drafts first
        console.log(`📋 Fetching invoices for import_id: ${import_id}`);
        
        try {
          // Fetch draft invoices from Visma
          const draftsResponse = await axios.get(`${apiBaseUrl}/v2/customerinvoicedrafts`, { headers });
          const drafts = draftsResponse.data?.Data || [];
          
          // Filter drafts that might match this import (by reference or other criteria)
          const importDrafts = drafts.filter(draft => {
            // Look for drafts with references that might match the import
            const reference = draft.OurReference || draft.YourReference || '';
            return reference.includes(import_id) || reference.includes('REF-');
          });
          
          if (importDrafts.length > 0) {
            console.log(`📋 Found ${importDrafts.length} draft invoices for import ${import_id}`);
            return res.json({
              success: true,
              import_id: import_id,
              invoices: importDrafts.map(draft => ({
                id: draft.Id,
                referanse: draft.OurReference || draft.YourReference || `REF-${draft.Id}`,
                your_reference: draft.YourReference,
                mottaker: draft.CustomerName || 'Unknown',
                avsender: 'Genin',
                status: 'draft',
                total_cents: Math.round((draft.Amount || 0) * 100),
                unit_price: draft.Amount || 0,
                currency: draft.CurrencyCode || 'NOK',
                created_at: draft.CreatedDateTime || new Date().toISOString(),
                visma_invoice_id: draft.Id,
                filename: `Import ${import_id}`,
                import_id: import_id
              })),
              metadata: {
                timestamp: new Date().toISOString(),
                filename: `Import ${import_id}`,
                total_count: importDrafts.length
              }
            });
          }
        } catch (vismaError) {
          console.error('📋 Error fetching from Visma:', vismaError.message);
        }
        
        // Fallback: return empty result if no Visma data found
        return res.json({
          success: true,
          import_id: import_id,
          invoices: [],
          metadata: {
            timestamp: new Date().toISOString(),
            filename: `Import ${import_id}`,
            total_count: 0
          },
          note: 'No invoices found for this import in Visma'
        });
        
      } else {
        // Return all available invoices from Visma
        console.log('📋 Fetching all available invoices from Visma');
        
        try {
          // Fetch all draft invoices from Visma
          const draftsResponse = await axios.get(`${apiBaseUrl}/v2/customerinvoicedrafts`, { headers });
          const drafts = draftsResponse.data?.Data || [];
          
          // Group drafts by import (using reference patterns)
          const importGroups = {};
          drafts.forEach(draft => {
            const reference = draft.OurReference || draft.YourReference || '';
            let importId = 'unknown';
            
            // Try to extract import ID from reference - look for numeric references like 166091, 166090, etc.
            if (reference && /^\d+$/.test(reference)) {
              // If reference is a pure number, use it as import ID
              importId = reference;
            } else if (reference.includes('REF-')) {
              const match = reference.match(/REF-(\d+)/);
              if (match) importId = match[1];
            }
            
            if (!importGroups[importId]) {
              importGroups[importId] = {
                import_id: importId,
                timestamp: draft.CreatedDateTime || new Date().toISOString(),
                filename: `Import ${importId}`,
                total_count: 0
              };
            }
            importGroups[importId].total_count++;
          });
          
          const availableImports = Object.values(importGroups);
          console.log(`📋 Found ${availableImports.length} import groups with ${drafts.length} total invoices`);
          
          // Get processing results to enhance status information
          const processingResults = global.lastProcessingResults || {};
          
          // Map Visma drafts with enhanced status
          const vismaInvoices = drafts.map(draft => {
            // Calculate total from line items since Visma doesn't populate Amount field for drafts
            const totalAmount = draft.Rows && draft.Rows.length > 0 
              ? draft.Rows.reduce((sum, row) => sum + (row.UnitPrice * row.Quantity), 0)
              : 414; // Fallback to preset price
            
            const referanse = draft.OurReference || draft.YourReference || `REF-${draft.Id}`;
            const processingResult = processingResults[referanse];
            
            return {
              id: draft.Id,
              referanse: referanse,
              your_reference: draft.YourReference,
              mottaker: draft.CustomerName || 'Unknown',
              avsender: 'Genin',
              status: processingResult?.status || 'CREATED_AS_DRAFT', // Enhanced status from processing
              total_cents: Math.round(totalAmount * 100),
              unit_price: totalAmount,
              currency: draft.CurrencyCode || 'NOK',
              created_at: draft.CreatedDateTime || new Date().toISOString(),
              visma_invoice_id: draft.Id,
              filename: processingResult?.filename || `Import ${draft.OurReference || 'Unknown'}`,
              import_id: draft.OurReference || 'unknown',
              customer_validation_status: processingResult?.customer_validation_status || 'FOUND'
            };
          });
          
          // Add any customer not found invoices that didn't make it to Visma
          const customerNotFoundInvoices = Object.values(processingResults)
            .filter(result => result.status === 'CUSTOMER_NOT_FOUND')
            .map(result => ({
              id: `not-found-${result.referanse}`,
              referanse: result.referanse,
              your_reference: result.referanse,
              mottaker: result.mottaker,
              avsender: 'Genin',
              status: 'CUSTOMER_NOT_FOUND',
              total_cents: Math.round((result.amount || 0) * 100),
              unit_price: result.amount || 0,
              currency: 'NOK',
              created_at: new Date().toISOString(),
              visma_invoice_id: null,
              filename: result.filename || 'Unknown',
              import_id: result.referanse || 'unknown',
              customer_validation_status: 'NOT_FOUND'
            }));
          
          const allInvoices = [...vismaInvoices, ...customerNotFoundInvoices];

          // Return both import metadata and all invoices
          return res.json({
            success: true,
            available_imports: availableImports,
            total_invoices: allInvoices.length,
            visma_drafts: drafts.length,
            customer_not_found: customerNotFoundInvoices.length,
            // Also return all invoices for the frontend to display
            invoices: allInvoices,
            note: availableImports.length === 0 && customerNotFoundInvoices.length === 0 
              ? 'No imports found. Upload an Excel file first.' 
              : undefined
          });
          
        } catch (vismaError) {
          console.error('📋 Error fetching from Visma:', vismaError.message);
          return res.status(500).json({ 
            error: 'Failed to fetch invoices from Visma',
            details: vismaError.message 
          });
        }
      }
      
    } catch (error) {
      console.error('📋 Error in invoice listing:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  if (req.method === 'DELETE') {
    // Clear all processed imports
    global.processedImports = {};
    return res.json({ success: true, message: 'All imports cleared' });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};


