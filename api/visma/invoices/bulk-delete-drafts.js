const axios = require('axios');

// Inline cookie parsing function for Vercel
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach((part) => {
    const [k, ...v] = part.trim().split('=');
    if (!k) return;
    cookies[k] = decodeURIComponent(v.join('='));
  });
  
  return cookies;
}

function getVismaTokensFromCookie(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies['visma-tokens']) {
    try {
      return JSON.parse(cookies['visma-tokens']);
    } catch (e) {
      console.error('Error parsing visma-tokens cookie:', e);
      return null;
    }
  }
  return null;
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📍 Bulk delete drafts endpoint called');
    
    // Get tokens from the secure cookie
    const tokens = getVismaTokensFromCookie(req);
    console.log('📍 Tokens from cookie:', tokens ? 'Found' : 'Not found');

    if (!tokens || !tokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Visma' });
    }

    const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
    const headers = {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json'
    };

    console.log('📍 Getting draft invoices from Visma...');
    
    // Get all draft invoices
    const draftsResponse = await axios.get(`${apiBaseUrl}/v2/customerinvoicedrafts`, { headers });
    const drafts = draftsResponse.data?.Data || [];
    
    console.log(`📍 Found ${drafts.length} draft invoices to delete`);
    
    let deleted = 0;
    const errors = [];

    // Delete each draft invoice
    for (const draft of drafts) {
      try {
        await axios.delete(`${apiBaseUrl}/v2/customerinvoicedrafts/${draft.Id}`, { headers });
        deleted++;
        console.log(`✅ Deleted draft invoice: ${draft.Id}`);
      } catch (deleteError) {
        const errorMsg = `Failed to delete ${draft.Id}: ${deleteError.response?.data?.Message || deleteError.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    console.log(`📍 Bulk delete completed: ${deleted} deleted, ${errors.length} errors`);
    
    res.json({ 
      success: true, 
      deleted, 
      total: drafts.length,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('📍 Error during bulk delete:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to delete draft invoices',
      details: error.message 
    });
  }
};


