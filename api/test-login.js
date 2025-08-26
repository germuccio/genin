const { setCors, setSessionCookie } = require('./_utils');

module.exports = async (req, res) => {
  setCors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧪 Test login endpoint called');
    
    // For testing, bypass password check if APP_PASSWORD is not set
    const APP_PASSWORD = process.env.APP_PASSWORD || 'test123';
    
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const password = parsed.password;
        
        console.log('Password provided:', password ? 'Yes' : 'No');
        console.log('Expected password:', APP_PASSWORD ? 'Set' : 'Missing');
        
        // For testing on Vercel, allow 'test123' as a fallback
        const validPasswords = [APP_PASSWORD, 'test123', '123456'];
        
        if (!password || !validPasswords.includes(password)) {
          return res.status(401).json({
            error: 'Invalid password',
            debug: {
              provided: password ? 'Present' : 'Missing',
              expected: APP_PASSWORD ? 'Set' : 'Missing',
              fallback_available: 'Yes (test123 or 123456)'
            }
          });
        }

        // Create session
        const session = { authenticated: true, ts: Date.now() };
        setSessionCookie(res, session);
        
        return res.json({
          success: true,
          message: 'Test login successful',
          environment: process.env.VERCEL ? 'Vercel' : 'Local'
        });
        
      } catch (parseError) {
        return res.status(400).json({
          error: 'Invalid JSON',
          message: parseError.message
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Test login error:', error);
    return res.status(500).json({
      error: 'Test login failed',
      message: error.message
    });
  }
};
