module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  const presetId = parseInt(id);

  if (isNaN(presetId)) {
    return res.status(400).json({ error: 'Invalid preset ID' });
  }

  // Handle PUT - Update preset
  if (req.method === 'PUT') {
    try {
      const { code, name, unit_price_cents, currency, vat_code, article_name } = req.body;

      // Note: In Vercel serverless functions, we can't persist in-memory data between requests.
      // This implementation returns the updated preset but it won't persist across requests.
      // For persistent storage, you would need to implement a database connection.

      const updatedPreset = {
        id: presetId,
        code: code || 'OK',
        name: name || 'Norsk import (+mva)',
        unit_price_cents: unit_price_cents ? parseInt(unit_price_cents) : 42500,
        currency: currency || 'NOK',
        vat_code: vat_code || '25',
        article_name: article_name || name || 'Norsk import (+mva)'
      };

      console.log(`✅ Preset update requested for ID ${presetId}:`, updatedPreset);

      return res.json(updatedPreset);
    } catch (error) {
      console.error('Error updating preset:', error);
      return res.status(500).json({ error: 'Failed to update preset', details: error.message });
    }
  }

  // Handle DELETE - Delete preset
  if (req.method === 'DELETE') {
    try {
      console.log(`🗑️ Preset deletion requested for ID ${presetId}`);

      // Note: Same limitation as above - this won't persist
      return res.json({ success: true, deleted: { id: presetId } });
    } catch (error) {
      console.error('Error deleting preset:', error);
      return res.status(500).json({ error: 'Failed to delete preset', details: error.message });
    }
  }

  // Handle GET - Get single preset
  if (req.method === 'GET') {
    try {
      // Return the default preset for ID 1
      if (presetId === 1) {
        const preset = {
          id: 1,
          code: 'OK',
          name: 'Norsk import (+mva)',
          article_name: 'Norsk import (+mva)',
          unit_price_cents: 42500,
          currency: 'NOK',
          vat_code: '25'
        };
        return res.json(preset);
      }

      return res.status(404).json({ error: 'Preset not found' });
    } catch (error) {
      console.error('Error fetching preset:', error);
      return res.status(500).json({ error: 'Failed to fetch preset', details: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
