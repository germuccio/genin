// Backward-compat catch-all that points users to existing endpoints
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(404).json({ error: 'Not Found', hint: 'Use /api/health, /api/auth/me, /api/auth/login' });
};
