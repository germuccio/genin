const { setCors, setSessionCookie } = require('../../_utils');
const axios = require('axios');

// Import token management from status endpoint
const statusModule = require('./status');

// Function to exchange authorization code for access tokens
async function exchangeCodeForTokens(code, opts = {}) {
  const clientId = opts.clientId || 'aiautomationsandbox';
  const clientSecret = opts.clientSecret || 'rR.ZqjR=;WIcQP9FgmIiqJSuaeMldq2wlR8PJIvvBtAQxo2h2RfLYgTO1INiEw2O';
  const redirectUri = opts.redirectUri || 'https://localhost:44300/callback';
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const response = await axios.post(
      'https://identity.vismaonline.com/connect/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    const tokenData = response.data;
    
    // Add expiration timestamp
    tokenData.expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    
    console.log('🎉 Token exchange successful!');
    console.log('Access token received:', tokenData.access_token ? '✅' : '❌');
    console.log('Refresh token received:', tokenData.refresh_token ? '✅' : '❌');
    console.log('Expires in:', tokenData.expires_in, 'seconds');
    
    return tokenData;
  } catch (error) {
    console.error('❌ Token exchange failed:', error.response?.data || error.message);
    throw new Error('Failed to exchange authorization code for access token');
  }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = '';
  req.on('data', (c) => (body += c.toString()));
  req.on('end', async () => {
    try {
      const parsed = JSON.parse(body || '{}');
      const { code, state } = parsed;
      
      if (!code) {
        return res.status(400).json({ error: 'Missing authorization code' });
      }

      // Exchange code for tokens
      const tokenData = await exchangeCodeForTokens(code);
      
      // Store tokens in the status module
      statusModule.setTokens(tokenData);
      
      console.log('✅ Successfully exchanged code for tokens and stored in memory');
      
      return res.json({
        success: true,
        company: tokenData.company_name || 'Connected Company',
        expires_at: tokenData.expires_at
      });
      
    } catch (error) {
      console.error('Token exchange failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to exchange authorization code for tokens'
      });
    }
  });
};


