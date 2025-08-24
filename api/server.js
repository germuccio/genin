// Vercel serverless function entry point
const path = require('path');

// Import the compiled server
const serverPath = path.join(process.cwd(), 'packages/api/dist/minimal-server.js');

let app;
try {
  app = require(serverPath);
} catch (error) {
  console.error('Failed to load server:', error);
  // Fallback to TypeScript file for development
  require('ts-node/register');
  app = require('../packages/api/src/minimal-server.ts');
}

module.exports = app;
