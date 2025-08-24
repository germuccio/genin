// Vercel serverless function that proxies to the compiled Express app
const path = require('path');

let app;
try {
  const compiled = require(path.join(process.cwd(), 'packages/api/dist/minimal-server.js'));
  app = compiled.default || compiled; // support ESM default export
} catch (e) {
  console.error('Failed to load compiled API server:', e);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!app) {
    return res.status(500).json({ error: 'API server not available' });
  }

  return app(req, res);
};
