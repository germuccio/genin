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
    try {
      // Mock mapping status response
      return res.json({ 
        hasMapping: false,
        mappingCount: 0,
        requiredArticles: ['Transport/Levering', 'Håndteringsgebyr']
      });
    } catch (error) {
      console.error('❌ Failed to get mapping status:', error);
      return res.status(500).json({ error: 'Failed to get mapping status' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
