const { setCors, getSession } = require('../_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Note: Invoice listing works without authentication (like local version)
  console.log('📋 Invoice data request received on Vercel');

  if (req.method === 'GET') {
    // Get import_id from query parameters
    const import_id = req.query?.import_id;
    
    if (import_id && global.processedImports && global.processedImports[import_id]) {
      // Return specific import data
      const importData = global.processedImports[import_id];
      return res.json({
        success: true,
        import_id: import_id,
        invoices: importData.invoices,
        metadata: {
          timestamp: importData.timestamp,
          filename: importData.filename,
          total_count: importData.total_count
        }
      });
    } else {
      // In Vercel stateless environment, global data doesn't persist
      // Return the processed invoices from global.invoices instead
      const allInvoices = global.invoices || [];
      
      if (import_id) {
        // Filter invoices for specific import_id
        const importInvoices = allInvoices.filter(inv => inv.import_id === parseInt(import_id));
        return res.json({
          success: true,
          import_id: import_id,
          invoices: importInvoices,
          metadata: {
            timestamp: importInvoices.length > 0 ? importInvoices[0].created_at : new Date().toISOString(),
            filename: importInvoices.length > 0 ? importInvoices[0].filename : 'Unknown',
            total_count: importInvoices.length
          }
        });
      } else {
        // Return all available imports by grouping invoices by import_id
        const importGroups = {};
        allInvoices.forEach(invoice => {
          if (!importGroups[invoice.import_id]) {
            importGroups[invoice.import_id] = {
              import_id: invoice.import_id.toString(),
              timestamp: invoice.created_at,
              filename: invoice.filename,
              total_count: 0
            };
          }
          importGroups[invoice.import_id].total_count++;
        });
        
        const availableImports = Object.values(importGroups);
        
        return res.json({
          success: true,
          available_imports: availableImports,
          note: availableImports.length === 0 ? 'No imports found. Upload an Excel file first.' : undefined
        });
      }
    }
  }
  
  if (req.method === 'DELETE') {
    // Clear all processed imports
    global.processedImports = {};
    return res.json({ success: true, message: 'All imports cleared' });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};


