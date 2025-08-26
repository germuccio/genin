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
      cookies: cookies ? 'Present' : 'Missing',
      cookie_count: cookies.split(';').length,
      session_result: session,
      headers: {
        cookie: req.headers.cookie ? 'Present' : 'Missing',
        'user-agent': req.headers['user-agent'] ? 'Present' : 'Missing'
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        APP_PASSWORD: process.env.APP_PASSWORD ? 'Set' : 'Missing'
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
