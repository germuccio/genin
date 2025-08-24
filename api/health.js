const { setCors } = require('./_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
};


