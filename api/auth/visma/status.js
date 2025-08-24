const { setCors, getSession } = require('../../_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const session = getSession(req);
  // Serverless demo: report not connected, but authenticated state from cookie
  return res.json({ connected: false, company: '', authenticated: !!session.authenticated });
};


