const { setCors, signSession } = require('../../_utils');
const crypto = require('crypto');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = req.headers['x-visma-client-id'] || req.query.client_id;
  const clientSecret = req.headers['x-visma-client-secret'] || req.query.client_secret;
  if (!clientId) return res.status(400).json({ error: 'Missing x-visma-client-id header' });

  // Use the Vercel app callback URL - you need to update this in your Visma app registration
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const redirectUri = `${proto}://${host}/api/auth/visma/callback`;

  // Create a signed state object
  const statePayload = {
    cid: clientId,
    // Include secret only if supplied by UI; otherwise callback will use env
    ...(clientSecret ? { cs: clientSecret } : {}),
    ts: Date.now(),
  };
  const stateBody = Buffer.from(JSON.stringify(statePayload)).toString('base64url');
  const stateSig = signSession(statePayload);
  const state = `${stateBody}.${stateSig}`;

  // Add the discovery scope required to find the instance_url
  const scope = 'ea:api ea:sales ea:purchase ea:accounting vls:api offline_access discovery-api:read';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scope,
    state,
    prompt: 'select_account',
    acr_values: `service:${serviceId}`,
  });

  // Decide environment from client id or explicit header
  const isSandbox = clientId.includes('sandbox') || clientId.includes('test') ||
                   req.headers['x-visma-environment'] === 'sandbox';
  
  // Both sandbox and production use the same identity server
  const identityBaseUrl = process.env.VISMA_IDENTITY_URL || 'https://identity.vismaonline.com';

  const auth_url = `${identityBaseUrl}/connect/authorize?${params.toString()}`;
  return res.json({ auth_url, redirect_uri: redirectUri, state, environment: isSandbox ? 'sandbox' : 'production' });
};


