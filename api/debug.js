const { setCors, getSession } = require('./_utils');

module.exports = async (req, res) => {
  setCors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Debug information
    const cookies = req.headers.cookie || '';
    const session = getSession(req);
    
    return res.json({
      debug: true,
      timestamp: new Date().toISOString(),
      cookies: cookies ? 'Present' : 'Missing',
      cookie_count: cookies.split(';').length,
      session_result: session,
      headers: {
        cookie: req.headers.cookie ? 'Present' : 'Missing',
        'user-agent': req.headers['user-agent'] ? 'Present' : 'Missing',
        'content-type': req.headers['content-type'] || 'Missing'
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        APP_PASSWORD: process.env.APP_PASSWORD ? `Set (${process.env.APP_PASSWORD.substring(0, 3)}...)` : 'Missing',
        APP_SESSION_SECRET: process.env.APP_SESSION_SECRET ? 'Set' : 'Missing',
        VISMA_CLIENT_ID: process.env.VISMA_CLIENT_ID ? 'Set' : 'Missing',
        VISMA_CLIENT_SECRET: process.env.VISMA_CLIENT_SECRET ? 'Set' : 'Missing'
      },
      vercel_info: {
        region: process.env.VERCEL_REGION || 'Unknown',
        url: process.env.VERCEL_URL || 'Unknown'
      }
    });
    
  } catch (error) {
    return res.status(500).json({
      error: 'Debug failed',
      message: error.message,
      stack: error.stack
    });
  }
};
