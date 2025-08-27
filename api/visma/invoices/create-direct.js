const { getVismaTokensFromCookie } = require('../../../_utils');

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
    
    const { import_id, articleMapping, customerDefaults, customerOverrides } = req.body;
    console.log('📍 Parsed request data:', { import_id, articleMapping, customerDefaults, customerOverrides });
    
    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    console.log('📍 Returning mock response');
    // Mock response for creating invoices directly in Visma
    res.json({ 
      success: true,
      summary: {
        successful: 3,
        failed: 0
      },
      message: 'Invoices created directly in Visma (mock response - Vercel function)'
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
