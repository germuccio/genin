// Vercel serverless function that proxies to the compiled Express app
const path = require('path');

let app;
let loadError;

try {
  console.log('Current working directory:', process.cwd());
  const serverPath = path.join(process.cwd(), 'packages/api/dist/minimal-server.js');
  console.log('Trying to load server from:', serverPath);
  
  const compiled = require(serverPath);
  app = compiled.default || compiled;
  console.log('Successfully loaded server app:', typeof app);
} catch (e) {
  loadError = e;
  console.error('Failed to load compiled API server:', e.message);
  console.error('Stack:', e.stack);
  
  // Try alternative path
  try {
    const altPath = path.join(__dirname, '../packages/api/dist/minimal-server.js');
    console.log('Trying alternative path:', altPath);
    const compiled = require(altPath);
    app = compiled.default || compiled;
    console.log('Successfully loaded from alternative path');
  } catch (e2) {
    console.error('Alternative path also failed:', e2.message);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!app) {
    return res.status(500).json({ 
      error: 'API server not available', 
      path: req.url,
      loadError: loadError ? loadError.message : 'Unknown error',
      cwd: process.cwd()
    });
  }

  // Vercel strips /api from the URL, so we need to add it back
  req.url = '/api' + req.url;
  
  console.log('Proxying request:', req.method, req.url);
  return app(req, res);
};
