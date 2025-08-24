// Vercel serverless function entry point
const path = require('path');

// Import the main server logic
let mainApp;
try {
  // Try to load the compiled version first
  const serverPath = path.join(process.cwd(), 'packages/api/dist/minimal-server.js');
  const serverModule = require(serverPath);
  // Handle both default export and module.exports
  mainApp = serverModule.default || serverModule;
  console.log('✅ Loaded compiled server');
} catch (error) {
  console.error('❌ Failed to load compiled server:', error.message);
  try {
    // Fallback - create a simple Express app
    const express = require('express');
    const cors = require('cors');
    
    mainApp = express();
    mainApp.use(cors());
    mainApp.use(express.json());
    
    // Add a basic health check
    mainApp.get('/health', (req, res) => {
      res.json({ status: 'ok', message: 'Fallback server running' });
    });
    
    // Catch-all for other routes
    mainApp.all('*', (req, res) => {
      res.status(404).json({ 
        error: 'Not Found', 
        message: 'Main server failed to load',
        path: req.path 
      });
    });
    
    console.log('⚠️  Using fallback server');
  } catch (fallbackError) {
    console.error('❌ Fallback server creation failed:', fallbackError);
  }
}

// For Vercel, we need to export a function that handles individual requests
module.exports = async (req, res) => {
  // Enable CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visma-client-id, x-visma-client-secret, x-visma-access-token');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (!mainApp) {
      throw new Error('No server app available');
    }
    
    // Use the main app to handle the request
    return mainApp(req, res);
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      path: req.url
    });
  }
};
