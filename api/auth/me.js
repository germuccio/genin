const { setCors, getSession } = require('../_utils');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = getSession(req);
  return res.json({
    authenticated: !!session.authenticated,
    environment: {
      VISMA_API_ENVIRONMENT: 'production',
      VISMA_API_BASE_URL: 'https://eaccountingapi.vismaonline.com',
      VISMA_IDENTITY_URL: 'https://identity.vismaonline.com'
    }
  });
};


