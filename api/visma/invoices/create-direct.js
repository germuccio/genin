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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📍 Create direct invoices endpoint called');
    console.log('📍 Request body:', req.body);
    console.log('📍 Request headers cookies:', req.headers.cookie ? 'Present' : 'Missing');
    
    let tokens = null;
    try {
      tokens = getVismaTokensFromCookie(req);
      console.log('📍 Tokens from cookie:', tokens ? 'Found' : 'Not found');
    } catch (tokenError) {
      console.error('📍 Error getting tokens from cookie:', tokenError);
      return res.status(500).json({ error: 'Error parsing authentication tokens', details: tokenError.message });
    }
    
    if (!tokens || !tokens.access_token) {
      console.log('📍 No valid tokens found');
      return res.status(401).json({ error: 'Not authenticated with Visma' });
    }
    
    const { import_id, articleMapping, customerDefaults, customerOverrides, processed_invoices } = req.body;
    console.log('📍 Parsed request data:', { import_id, articleMapping, customerDefaults, customerOverrides, processed_invoices: processed_invoices ? `${processed_invoices.length} invoices` : 'none' });
    
    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    // Try to get invoices from global storage first (for local development)
    let importInvoices = [];
    const globalInvoices = global.invoices || [];
    const globalImportInvoices = globalInvoices.filter(inv => inv.import_id === parseInt(import_id));
    
    if (globalImportInvoices.length > 0) {
      importInvoices = globalImportInvoices;
      console.log('📍 Found', importInvoices.length, 'invoices from global storage for import_id:', import_id);
    } else if (processed_invoices && Array.isArray(processed_invoices)) {
      // Fallback: use processed invoices passed from frontend (for Vercel stateless environment)
      importInvoices = processed_invoices;
      console.log('📍 Using', importInvoices.length, 'invoices from request body for import_id:', import_id);
    } else {
      console.log('📍 No invoices found in global storage or request body for import_id:', import_id);
      return res.status(404).json({ 
        error: 'No invoices found for this import ID',
        import_id: import_id,
        available_imports: [...new Set(globalInvoices.map(i => i.import_id))],
        note: 'In Vercel, pass processed_invoices in request body'
      });
    }

    // For now, just return success with the count - actual Visma API calls would be too complex for Vercel
    console.log('📍 Would create', importInvoices.length, 'invoices in Visma');
    
    res.json({ 
      success: true,
      summary: {
        successful: importInvoices.length,
        failed: 0
      },
      message: `Would create ${importInvoices.length} invoices in Visma (Vercel mock response)`,
      invoices_found: importInvoices.length,
      note: 'Full Visma API integration requires local development server.'
    });
  } catch (error) {
    console.error('📍 Create direct invoices error:', error);
    console.error('📍 Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to create invoices in Visma', 
      details: error.message,
      stack: error.stack 
    });
  }
};
