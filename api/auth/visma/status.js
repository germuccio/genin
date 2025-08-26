const { setCors, getSession } = require('../../_utils');
const cookie = require('../../_cookie');

// Simple in-memory token storage for serverless (resets on cold start)
// This is now a fallback, the cookie is the source of truth
let vismaTokens = null;

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const session = getSession(req);
  if (!session || !session.authenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Try to read tokens from the HttpOnly cookie first
  const cookies = cookie.parse(req.headers.cookie || '');
  let tokens = null;
  if (cookies['visma-tokens']) {
    try {
      tokens = JSON.parse(cookies['visma-tokens']);
    } catch (e) {
      console.error('Error parsing visma-tokens cookie:', e);
    }
  }

  // Fallback to in-memory for safety, but cookie is primary
  if (!tokens) {
    tokens = vismaTokens;
  }
  
  // Check if we have Visma tokens stored
  const isConnected = !!(tokens && tokens.access_token);
  
  // Determine API mode from environment variables
  const apiMode = process.env.VISMA_API_ENVIRONMENT === 'production' ? 'LIVE' : 'TEST';

  if (isConnected) {
    return res.json({
      connected: true,
      company: tokens.company_name || 'Connected Company',
      expires_at: tokens.expires_at || null,
      apiMode: apiMode
    });
  } else {
    return res.json({
      connected: false,
      company: null,
      expires_at: null,
      apiMode: apiMode
    });
  }
};

// Export the tokens storage for other functions to use
module.exports.getTokens = () => vismaTokens;
module.exports.setTokens = (tokens) => { vismaTokens = tokens; };


