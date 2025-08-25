module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Return default presets
    const presets = [
      {
        id: 1,
        code: 'TRANSPORT',
        name: 'Transport Service',
        article_name: 'Transport/Levering',
        unit_price_cents: 50000, // 500 NOK
        currency: 'NOK',
        vat_code: '25'
      },
      {
        id: 2,
        code: 'HANDLING',
        name: 'Handling Fee',
        article_name: 'Håndteringsgebyr',
        unit_price_cents: 10000, // 100 NOK
        currency: 'NOK',
        vat_code: '25'
      }
    ];

    res.json(presets);
  } catch (error) {
    console.error('Error loading presets:', error);
    res.status(500).json({ error: 'Failed to load presets' });
  }
};
