// Inlined setCors for Vercel compatibility
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'DELETE') {
    // Clear the HttpOnly cookie by setting its expiration date to the past
    res.setHeader('Set-Cookie', 'visma-tokens=; HttpOnly; Path=/; Secure; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    
    return res.json({ success: true, message: 'Successfully disconnected' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};


