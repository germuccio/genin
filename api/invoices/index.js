const { setCors } = require('../_utils');

// Basic in-memory list for serverless demo
let invoices = [];

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    return res.json(invoices);
  }
  if (req.method === 'DELETE') {
    invoices = [];
    return res.json({ success: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
};


