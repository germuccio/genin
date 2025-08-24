const { setCors } = require('../../_utils');
const crypto = require('crypto');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = req.headers['x-visma-client-id'] || req.query.client_id;
  if (!clientId) return res.status(400).json({ error: 'Missing x-visma-client-id header' });

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

  const auth_url = `https://identity.vismaonline.com/connect/authorize?${params.toString()}`;
  return res.json({ auth_url, redirect_uri: redirectUri, state });
};


