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

  const scopes = encodeURIComponent('ea:api ea:sales ea:purchase ea:accounting vls:api offline_access');
  // Build a signed state containing client credentials so callback can exchange tokens
  const statePayload = {
    cid: clientId,
    // Include secret only if supplied by UI; otherwise callback will use env
    ...(clientSecret ? { cs: clientSecret } : {}),
    ts: Date.now(),
  };
  const stateBody = Buffer.from(JSON.stringify(statePayload)).toString('base64url');
  const stateSig = signSession(statePayload);
  const state = `${stateBody}.${stateSig}`;
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

  // Decide environment from client id or explicit header
  const isSandbox = clientId.includes('sandbox') || clientId.includes('test') ||
                   req.headers['x-visma-environment'] === 'sandbox';
  
  // Prefer explicit env override, else choose by sandbox/prod
  const configuredIdentityUrl = process.env.VISMA_IDENTITY_URL;
  const identityBaseUrl = configuredIdentityUrl || (isSandbox
    ? 'https://identity-sandbox.vismaonline.com'
    : 'https://identity.vismaonline.com');

  const auth_url = `${identityBaseUrl}/connect/authorize?${params.toString()}`;
  return res.json({ auth_url, redirect_uri: redirectUri, state, environment: isSandbox ? 'sandbox' : 'production' });
};


