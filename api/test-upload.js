const { setCors, getSession } = require('./_utils');

module.exports = async (req, res) => {
  setCors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧪 Test upload endpoint called');
    console.log('Headers:', req.headers);
    
    // Check authentication
    const session = getSession(req);
    console.log('Session check:', session);
    
    if (!session || !session.authenticated) {
      return res.status(401).json({ 
        error: 'Not authenticated',
        debug: {
          session_exists: !!session,
          session_authenticated: session?.authenticated || false
        }
      });
    }

    // Simple test response
    return res.json({
      success: true,
      message: 'Test upload endpoint working!',
      timestamp: new Date().toISOString(),
      content_type: req.headers['content-type'],
      content_length: req.headers['content-length'],
      environment: {
        VERCEL: process.env.VERCEL ? 'Yes' : 'No',
        NODE_ENV: process.env.NODE_ENV
      }
    });
    
  } catch (error) {
    console.error('❌ Test upload error:', error);
    return res.status(500).json({
      error: 'Test upload failed',
      message: error.message,
      stack: error.stack
    });
  }
};
