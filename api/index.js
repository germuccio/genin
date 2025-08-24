// Vercel serverless function entry point
const express = require('express');
const cors = require('cors');

// Import the main server logic
let mainApp;
try {
  // Try to load the compiled version first
  mainApp = require('../packages/api/dist/minimal-server.js');
} catch (error) {
  console.log('Compiled server not found, loading TypeScript...');
  // Fallback to direct TypeScript (this might not work in production)
  require('ts-node/register');
  mainApp = require('../packages/api/src/minimal-server.ts');
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
    // Use the main app to handle the request
    return mainApp(req, res);
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};
