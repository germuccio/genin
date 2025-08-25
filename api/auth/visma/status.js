const { setCors, getSession } = require('../../_utils');

// Simple in-memory token storage for serverless (resets on cold start)
let vismaTokens = null;

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const session = getSession(req);
  if (!session.authenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Check if we have Visma tokens stored
  const isConnected = !!(vismaTokens && vismaTokens.access_token);
  
  if (isConnected) {
    return res.json({
      connected: true,
      company: vismaTokens.company_name || 'Connected Company',
      expires_at: vismaTokens.expires_at || null
    });
  } else {
    return res.json({
      connected: false,
      company: null,
      expires_at: null
    });
  }
};

// Export the tokens storage for other functions to use
module.exports.getTokens = () => vismaTokens;
module.exports.setTokens = (tokens) => { vismaTokens = tokens; };


