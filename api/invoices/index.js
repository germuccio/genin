const { setCors, getSession } = require('../_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Check authentication
  const session = getSession(req);
  if (!session || !session.authenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

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
      // Return all available imports
      const availableImports = global.processedImports ? Object.keys(global.processedImports).map(id => ({
        import_id: id,
        timestamp: global.processedImports[id].timestamp,
        filename: global.processedImports[id].filename,
        total_count: global.processedImports[id].total_count
      })) : [];
      
      return res.json({
        success: true,
        available_imports: availableImports,
        note: availableImports.length === 0 ? 'No imports found. Upload an Excel file first.' : undefined
      });
    }
  }
  
  if (req.method === 'DELETE') {
    // Clear all processed imports
    global.processedImports = {};
    return res.json({ success: true, message: 'All imports cleared' });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};


