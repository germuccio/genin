const { setCors, setSessionCookie } = require('../../_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // In a full implementation, exchange the code for tokens with Visma.
  // For now, just accept any code and mark connected.
  let body = '';
  req.on('data', (c) => (body += c.toString()));
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body || '{}');
      if (!parsed.code) return res.status(400).json({ error: 'Missing code' });
      // Mark session as connected
      setSessionCookie(res, { authenticated: true, connected: true, ts: Date.now() });
      return res.json({ success: true, company: '' });
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  });
};


