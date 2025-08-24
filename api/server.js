// Vercel serverless function entry point
const path = require('path');

// Try to import the compiled server first
let app;
try {
  // Look for the compiled JavaScript file
  const serverPath = path.join(process.cwd(), 'packages/api/dist/minimal-server.js');
  app = require(serverPath);
  console.log('✅ Loaded compiled server from:', serverPath);
} catch (error) {
  console.log('📝 Compiled server not found, trying TypeScript...');
  try {
    // Fallback to TypeScript file with ts-node
    require('ts-node/register');
    app = require('../packages/api/src/minimal-server.ts');
    console.log('✅ Loaded TypeScript server');
  } catch (tsError) {
    console.error('❌ Failed to load server:', tsError);
    // Create a simple error handler
    app = (req, res) => {
      res.status(500).json({ 
        error: 'Server failed to load', 
        message: tsError.message 
      });
    };
  }
}

module.exports = app;
