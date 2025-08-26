const { setCors, APP_PASSWORD, setSessionCookie } = require('../_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = '';
    req.on('data', (c) => (body += c.toString()));
    req.on('end', () => {
      let password;
      try {
        const parsed = JSON.parse(body || '{}');
        password = parsed.password;
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }

      console.log('🔍 Login attempt with password:', password ? 'Present' : 'Missing');
      console.log('🔍 Expected APP_PASSWORD:', APP_PASSWORD ? 'Set' : 'Missing');
      
      if (password !== APP_PASSWORD) {
        return res.status(401).json({ 
          error: 'Invalid password',
          debug: {
            provided: password ? 'Present' : 'Missing',
            expected: APP_PASSWORD ? 'Set' : 'Missing',
            environment: process.env.NODE_ENV || 'development'
          }
        });
      }

      const session = { authenticated: true, ts: Date.now() };
      setSessionCookie(res, session);
      return res.json({ success: true });
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed', message: err.message });
  }
};


