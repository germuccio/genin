const { setCors } = require('../../_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  // Clear cookie
  res.setHeader('Set-Cookie', 'genin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  return res.json({ success: true });
};


