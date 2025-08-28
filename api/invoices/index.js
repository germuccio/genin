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
        // Return all available imports by fetching from Visma
        console.log('📋 Fetching all available imports from Visma');
        
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
          
          return res.json({
            success: true,
            available_imports: availableImports,
            total_invoices: drafts.length,
            note: availableImports.length === 0 ? 'No imports found. Upload an Excel file first.' : undefined
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


