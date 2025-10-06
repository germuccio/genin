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

    console.log('📍 Starting batch deletion process...');
    
    let deleted = 0;
    const errors = [];
    const pageSize = 50;
    let hasMoreInvoices = true;
    let batchNumber = 0;
    
    // Delete in batches: fetch first page, delete all, repeat until no more invoices
    // This works because after deleting, the next invoices become the new "first page"
    while (hasMoreInvoices) {
      batchNumber++;
      
      // Always fetch the first page (skip=0) since we're deleting as we go
      const draftsResponse = await axios.get(
        `${apiBaseUrl}/v2/customerinvoicedrafts?$top=${pageSize}`, 
        { headers }
      );
      
      const drafts = draftsResponse.data?.Data || [];
      const totalRemaining = draftsResponse.data?.Meta?.TotalNumberOfResults || 0;
      
      if (drafts.length === 0) {
        console.log('📍 No more draft invoices found');
        hasMoreInvoices = false;
        break;
      }
      
      console.log(`📍 Batch ${batchNumber}: Fetched ${drafts.length} drafts (${totalRemaining} total remaining in Visma)`);
      
      // Delete all invoices in this batch
      for (const draft of drafts) {
        try {
          await axios.delete(`${apiBaseUrl}/v2/customerinvoicedrafts/${draft.Id}`, { headers });
          deleted++;
        } catch (deleteError) {
          const statusCode = deleteError.response?.status;
          // Ignore 404 (already deleted) and 400 (might be already deleted or invalid state)
          if (statusCode === 404) {
            console.log(`⚠️ Invoice ${draft.Id} already deleted (404), skipping`);
            deleted++; // Count as successful since it's already gone
          } else if (statusCode === 400) {
            console.log(`⚠️ Invoice ${draft.Id} cannot be deleted (400), possibly already deleted`);
            // Don't count as error since it might already be deleted
          } else {
            const errorMsg = `Failed to delete ${draft.Id}: ${deleteError.response?.data?.Message || deleteError.message}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
          }
        }
      }
      
      console.log(`📊 Progress: ${deleted} total deleted so far`);
      
      // If we got fewer than requested, we're done
      if (drafts.length < pageSize) {
        hasMoreInvoices = false;
      }
    }

    console.log(`📍 Bulk delete completed: ${deleted} invoices deleted, ${errors.length} errors`);
    
    res.json({ 
      success: true, 
      deleted, 
      total: deleted,
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


