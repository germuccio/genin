const { setCors, setSessionCookie, signSession } = require('../../_utils');
const axios = require('axios');

// Import token management from status endpoint
const statusModule = require('./status');

// Function to exchange authorization code for access tokens
async function exchangeCodeForTokens(code, opts = {}) {
  const clientId = opts.clientId || process.env.VISMA_CLIENT_ID || 'aiautomationsandbox';
  const clientSecret = opts.clientSecret || process.env.VISMA_CLIENT_SECRET || '';
  const redirectUri = opts.redirectUri;
  const identityUrl = (process.env.VISMA_IDENTITY_URL || 'https://identity.vismaonline.com').replace(/\/$/, '');
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const response = await axios.post(
      `${identityUrl}/connect/token`,
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

  // Compute redirect_uri to match what was used on /api/auth/visma/url
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const redirectUri = `${proto}://${host}/api/auth/visma/callback`;

  // Support the provider redirect (GET) and old XHR flow (POST)
  if (req.method === 'GET') {
    const { code, state, error, error_description } = req.query || {};
    if (error) {
      const msg = error_description || error || 'authorization_error';
      return res.redirect(`/setup?error=${encodeURIComponent(msg)}`);
    }
    if (!code) {
      return res.status(400).send('Missing authorization code');
    }
    try {
      // Try to extract client credentials from signed state
      let creds = {};
      if (typeof state === 'string' && state.includes('.')) {
        try {
          const [b64, sig] = state.split('.');
          const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
          // Best-effort signature check (re-sign and compare)
          const expected = signSession(payload);
          if (expected === sig) {
            creds = { clientId: payload.cid, clientSecret: payload.cs };
          }
        } catch {}
      }

      const tokenData = await exchangeCodeForTokens(code, { redirectUri, ...creds });
      const cookiePayload = JSON.stringify(tokenData);
      res.setHeader('Set-Cookie', `visma-tokens=${cookiePayload}; HttpOnly; Path=/; Secure; SameSite=Strict; Max-Age=3600`);
      statusModule.setTokens(tokenData);
      return res.redirect('/setup?auth=success');
    } catch (e) {
      const msg = e.response?.data?.error_description || e.message || 'token_exchange_failed';
      return res.redirect(`/setup?error=${encodeURIComponent(msg)}`);
    }
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c.toString()));
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const { code } = parsed;
        if (!code) return res.status(400).json({ error: 'Missing authorization code' });
        // Accept client credentials from headers for XHR flow
        const hdrClientId = req.headers['x-visma-client-id'];
        const hdrClientSecret = req.headers['x-visma-client-secret'];
        const tokenData = await exchangeCodeForTokens(code, { 
          redirectUri, 
          ...(hdrClientId ? { clientId: hdrClientId } : {}),
          ...(hdrClientSecret ? { clientSecret: hdrClientSecret } : {})
        });
        const cookiePayload = JSON.stringify(tokenData);
        res.setHeader('Set-Cookie', `visma-tokens=${cookiePayload}; HttpOnly; Path=/; Secure; SameSite=Strict; Max-Age=3600`);
        statusModule.setTokens(tokenData);
        return res.json({ success: true, company: tokenData.company_name || 'Connected Company', expires_at: tokenData.expires_at });
      } catch (error) {
        console.error('Token exchange failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to exchange authorization code for tokens' });
      }
    });
    return;
  }

  return res.status(405).json({ error: 'Method not allowed' });
};


