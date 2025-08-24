const { setCors } = require('../_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const id = req.query?.id || (req.url.split('/').pop());
  return res.json({ id, status: 'draft' });
};


