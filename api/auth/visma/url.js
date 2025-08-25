const { setCors } = require('../../_utils');
const crypto = require('crypto');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = req.headers['x-visma-client-id'] || req.query.client_id;
  if (!clientId) return res.status(400).json({ error: 'Missing x-visma-client-id header' });

  // Use the Vercel app callback URL - you need to update this in your Visma app registration
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const redirectUri = `${proto}://${host}/api/auth/visma/callback`;

  const scopes = encodeURIComponent('ea:api ea:sales ea:purchase ea:accounting vls:api offline_access');
  const state = crypto.randomBytes(8).toString('hex');
  const serviceId = '44643EB1-3F76-4C1C-A672-402AE8085934';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'ea:api ea:sales ea:purchase ea:accounting vls:api offline_access',
    state,
    prompt: 'select_account',
    acr_values: `service:${serviceId}`,
  });

  // Visma sandbox now uses the SAME URLs as production, just with sandbox client_id
  // The sandbox companies are automatically suffixed with "sandbox" in company name
  const isSandbox = clientId.includes('sandbox') || clientId.includes('test') || 
                   req.headers['x-visma-environment'] === 'sandbox';
  
  const identityBaseUrl = 'https://identity.vismaonline.com'; // Same for both sandbox and production

  const auth_url = `${identityBaseUrl}/connect/authorize?${params.toString()}`;
  return res.json({ auth_url, redirect_uri: redirectUri, state, environment: isSandbox ? 'sandbox' : 'production' });
};


