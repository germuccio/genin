const { setCors, getSession, getVismaTokensFromCookie } = require('./_utils');
const axios = require('axios');

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
      // Get tokens from the secure cookie
      const tokens = getVismaTokensFromCookie(req);
      
      if (!tokens || !tokens.access_token) {
        return res.status(401).json({ error: 'Not authenticated with Visma. Please connect in Setup.' });
      }

      const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
      const response = await axios.get(`${apiBaseUrl}/v2/articles`, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return res.json(response.data.Data || []);
    } catch (error) {
      console.error('❌ Failed to fetch articles:', error.response?.data || error.message);
      return res.status(500).json({ error: 'Failed to fetch articles' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
