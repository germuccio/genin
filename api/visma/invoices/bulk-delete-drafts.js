const { setCors } = require('../../../_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  return res.json({ success: true, deleted: 0, errors: [] });
};


