const { getVismaTokensFromCookie } = require('../_utils');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tokens = getVismaTokensFromCookie(req);
    if (!tokens || !tokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Visma' });
    }

    // Mock payment terms response
    res.json([
      { id: 1, name: '14 dager', days: 14 },
      { id: 2, name: '30 dager', days: 30 },
      { id: 3, name: '60 dager', days: 60 }
    ]);
  } catch (error) {
    console.error('Get payment terms error:', error);
    res.status(500).json({ error: 'Failed to get payment terms' });
  }
};
