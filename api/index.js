// Simple Vercel serverless function with essential endpoints
const crypto = require('crypto');

// Simple session management
const APP_PASSWORD = '123456';
const APP_SESSION_SECRET = 'your-secret-key';

function signSession(data) {
  const hmac = crypto.createHmac('sha256', APP_SESSION_SECRET);
  hmac.update(JSON.stringify(data));
  return hmac.digest('hex');
}

function verifySession(sessionData, signature) {
  const expectedSignature = signSession(sessionData);
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  const method = req.method;

  console.log(`${method} ${url}`);

  // Health check
  if (url === '/health') {
    return res.json({ 
      status: 'ok', 
      message: 'API is working',
      timestamp: new Date().toISOString()
    });
  }

  // Login endpoint
  if (url === '/auth/login' && method === 'POST') {
    try {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        const { password } = JSON.parse(body);
        
        if (password === APP_PASSWORD) {
          const sessionData = { authenticated: true, timestamp: Date.now() };
          const signature = signSession(sessionData);
          
          res.setHeader('Set-Cookie', `genin_session=${Buffer.from(JSON.stringify(sessionData)).toString('base64')}.${signature}; HttpOnly; Path=/; Max-Age=86400`);
          return res.json({ success: true, message: 'Login successful' });
        } else {
          return res.status(401).json({ error: 'Invalid password' });
        }
      });
    } catch (error) {
      return res.status(500).json({ error: 'Login failed', message: error.message });
    }
    return;
  }

  // Environment info
  if (url === '/auth/me') {
    return res.json({
      authenticated: false,
      environment: {
        VISMA_API_ENVIRONMENT: 'production',
        VISMA_API_BASE_URL: 'https://eaccountingapi.vismaonline.com',
        VISMA_IDENTITY_URL: 'https://identity.vismaonline.com'
      }
    });
  }

  // Default 404 for other routes
  return res.status(404).json({
    error: 'Not Found',
    message: 'Endpoint not implemented',
    url: url,
    method: method
  });
};
