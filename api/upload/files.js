const { setCors, getSession } = require('../_utils');

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
    // Parse multipart form data (simplified for Vercel)
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }

    // For Vercel serverless environment, we'll process the file data directly
    // Note: This is a simplified implementation for demo purposes
    // In production, you might want to use a proper multipart parser
    
    const import_id = Date.now().toString();
    
    // Simulate processing the uploaded file
    // In a real implementation, you would:
    // 1. Parse the multipart data
    // 2. Extract the Excel file
    // 3. Process it with your Excel parser
    // 4. Store the results
    
    // For now, return a success response that matches the expected format
    res.json({ 
      success: true,
      import_id: import_id,
      message: 'File upload endpoint ready - please upload via local development for full functionality',
      note: 'Vercel serverless functions have limitations for file processing. Use local development for Excel processing.'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed', message: error.message });
  }
};
