const { setCors } = require('../../_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Minimal placeholder that echoes back a fake URL so the button flow works
  // In a full implementation, construct the Visma authorization URL using client id/redirect
  const auth_url = 'https://identity.vismaonline.com/connect/authorize';
  return res.json({ auth_url });
};


