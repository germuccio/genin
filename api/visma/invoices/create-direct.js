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
    const { import_id, articleMapping, customerDefaults, customerOverrides } = req.body;
    
    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    // Mock response for creating invoices directly in Visma
    res.json({ 
      success: true,
      summary: {
        successful: 3,
        failed: 0
      },
      message: 'Invoices created directly in Visma (mock response)'
    });
  } catch (error) {
    console.error('Create direct invoices error:', error);
    res.status(500).json({ error: 'Failed to create invoices in Visma' });
  }
};
