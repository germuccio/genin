const { setCors, getSession, getVismaTokensFromCookie } = require('../../../_utils');
const axios = require('axios');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'DELETE') {
    try {
      // Get tokens from the secure cookie
      const tokens = getVismaTokensFromCookie(req);

      if (!tokens || !tokens.access_token) {
        return res.status(401).json({ error: 'Not authenticated with Visma' });
      }

      const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
      // ... existing code ...
    } catch (error) {
      console.error('Error deleting drafts:', error);
      return res.status(500).json({ error: 'Failed to delete drafts' });
    }
  }
  return res.json({ success: true, deleted: 0, errors: [] });
};


