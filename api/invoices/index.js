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
          // Fetch draft invoices from Visma with pagination
          let allDrafts = [];
          let page = 0;
          const pageSize = 50;
          let hasMorePages = true;
          
          while (hasMorePages) {
            const skip = page * pageSize;
            const draftsResponse = await axios.get(
              `${apiBaseUrl}/v2/customerinvoicedrafts?$orderby=Id&$skip=${skip}&$top=${pageSize}`, 
              { headers }
            );
            
            const pageDrafts = draftsResponse.data?.Data || [];
            const totalResults = draftsResponse.data?.Meta?.TotalNumberOfResults || 0;
            
            console.log(`📋 Fetching page ${page + 1}: ${pageDrafts.length} drafts (Total: ${totalResults})`);
            
            if (pageDrafts.length > 0) {
              allDrafts = allDrafts.concat(pageDrafts);
              page++;
              
              if (allDrafts.length >= totalResults) {
                hasMorePages = false;
              }
            } else {
              hasMorePages = false;
            }
          }
          
          const drafts = allDrafts;
          console.log(`📋 Total fetched: ${drafts.length} draft invoices`);
          
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
          // Fetch all draft invoices from Visma with pagination
          let allDrafts = [];
          let page = 0;
          const pageSize = 50;
          let hasMorePages = true;
          
          while (hasMorePages) {
            const skip = page * pageSize;
            const draftsResponse = await axios.get(
              `${apiBaseUrl}/v2/customerinvoicedrafts?$orderby=Id&$skip=${skip}&$top=${pageSize}`, 
              { headers }
            );
            
            const pageDrafts = draftsResponse.data?.Data || [];
            const totalResults = draftsResponse.data?.Meta?.TotalNumberOfResults || 0;
            
            console.log(`📋 Fetching page ${page + 1}: ${pageDrafts.length} drafts (Total: ${totalResults})`);
            
            if (pageDrafts.length > 0) {
              allDrafts = allDrafts.concat(pageDrafts);
              page++;
              
              if (allDrafts.length >= totalResults) {
                hasMorePages = false;
              }
            } else {
              hasMorePages = false;
            }
          }
          
          const drafts = allDrafts;
          console.log(`📋 Total fetched: ${drafts.length} draft invoices`);
          
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
          console.log(`📋 DEBUG: Processing results available:`, Object.keys(processingResults).length, 'entries');
          console.log(`📋 DEBUG: Processing results:`, processingResults);
          console.log(`📋 DEBUG: Global lastProcessingResults:`, global.lastProcessingResults);
          
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
          const allProcessingResults = Object.values(processingResults);
          console.log(`📋 DEBUG: All processing results:`, allProcessingResults);
          
          const customerNotFoundResults = allProcessingResults.filter(result => result.status === 'CUSTOMER_NOT_FOUND');
          console.log(`📋 DEBUG: Customer not found results:`, customerNotFoundResults);
          
          // Also check global.processedImports for persistent CUSTOMER_NOT_FOUND invoices
          let persistentCustomerNotFound = [];
          if (global.processedImports) {
            console.log(`📋 DEBUG: Checking global.processedImports for customer not found invoices`);
            Object.values(global.processedImports).forEach(importData => {
              if (importData.customer_not_found_invoices) {
                persistentCustomerNotFound = persistentCustomerNotFound.concat(importData.customer_not_found_invoices);
                console.log(`📋 DEBUG: Found ${importData.customer_not_found_invoices.length} customer not found invoices in import data`);
              }
            });
          }
          console.log(`📋 DEBUG: Persistent customer not found invoices:`, persistentCustomerNotFound);
          
          // Combine both sources and deduplicate
          const allCustomerNotFound = [...customerNotFoundResults, ...persistentCustomerNotFound];
          const uniqueCustomerNotFound = allCustomerNotFound.filter((invoice, index, self) => 
            index === self.findIndex(i => i.referanse === invoice.referanse)
          );
          
          const customerNotFoundInvoices = uniqueCustomerNotFound.map(result => ({
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
          
          console.log(`📋 DEBUG: Found ${customerNotFoundInvoices.length} customer not found invoices`);
          customerNotFoundInvoices.forEach(invoice => {
            console.log(`📋 DEBUG: Customer not found invoice:`, invoice.referanse, invoice.mottaker);
          });
          
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


