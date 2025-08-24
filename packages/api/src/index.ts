import 'dotenv/config';
import express from 'express';
import https from 'https';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { testConnection } from './db/database.js';
import { errorHandler } from './middleware/error-handler.js';

// Import routes
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import invoiceRoutes from './routes/invoices.js';
import testCallbackRoutes from './routes/test-callback.js';

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = 44300; // Port for Visma callback

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/invoices', invoiceRoutes);

// Test callback route (matches Visma redirect URI) - temporarily disabled
// app.use('/callback', testCallbackRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Failed to connect to database');
      process.exit(1);
    }
    
    console.log('✅ Database connection successful');

    // Validate required environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'VISMA_CLIENT_ID',
      'VISMA_CLIENT_SECRET',
      'VISMA_REDIRECT_URI',
      'VISMA_BASE_URL',
    ];

    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingEnvVars.length > 0) {
      console.error('Missing required environment variables:', missingEnvVars);
      console.error('Please check your .env file');
      process.exit(1);
    }

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 HTTP Server running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Start additional server on port 44300 for Visma callback
    app.listen(HTTPS_PORT, () => {
      console.log(`🔒 Callback server running on port ${HTTPS_PORT}`);
      console.log(`📍 Visma Callback URL: http://localhost:${HTTPS_PORT}/callback`);
      console.log(`⚠️  For testing: Update Visma redirect URI to: http://localhost:${HTTPS_PORT}/callback`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

