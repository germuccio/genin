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
    const { customerDefaults, customerOverrides, articleMapping } = req.body;
    
    // Mock invoice creation response
    res.json({ 
      success: true,
      created: 3,
      errors: []
    });
  } catch (error) {
    console.error('Create invoices error:', error);
    res.status(500).json({ error: 'Failed to create invoices in Visma' });
  }
};
