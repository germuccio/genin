// Simple Vercel serverless function
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // For now, just return a simple response to test
  if (req.url === '/health' || req.url === '/api/health') {
    return res.json({ 
      status: 'ok', 
      message: 'API is working',
      timestamp: new Date().toISOString(),
      url: req.url,
      method: req.method
    });
  }

  // For other routes, return 404 for now
  return res.status(404).json({
    error: 'Not Found',
    message: 'Endpoint not implemented yet',
    url: req.url,
    method: req.method
  });
};
