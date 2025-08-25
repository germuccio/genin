const { setCors } = require('../../_utils');
const statusModule = require('../../_status');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Check authentication
  if (req.method === 'DELETE') {
    // Clear the in-memory store
    statusModule.setTokens(null);
    
    // Clear the HttpOnly cookie by setting its expiration date to the past
    res.setHeader('Set-Cookie', 'visma-tokens=; HttpOnly; Path=/; Secure; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    
    return res.json({ success: true, message: 'Successfully disconnected' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};


