import { Router } from 'express';
import { VismaAuthService } from '../services/visma-auth.js';
import { VismaApiService } from '../services/visma-api.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { z } from 'zod';

// Temporary inline schema until we fix the shared import
const VismaCallbackRequestSchema = z.object({
  code: z.string().min(1),
  state: z.string().optional()
});

const router = Router();
const authService = new VismaAuthService();
const apiService = new VismaApiService();

/**
 * GET /auth/visma/url
 * Get Visma authorization URL
 */
router.get('/visma/url', asyncHandler(async (req, res) => {
  const state = Math.random().toString(36).substring(2, 15);
  const authUrl = authService.getAuthorizationUrl(state);
  
  res.json({
    auth_url: authUrl,
    state,
  });
}));

/**
 * POST /auth/visma/callback
 * Handle Visma OAuth callback
 */
router.post('/visma/callback', asyncHandler(async (req, res) => {
  const { code, state } = VismaCallbackRequestSchema.parse(req.body);
  
  // Exchange code for tokens
  const tokens = await authService.exchangeCodeForToken(code);
  
  // Get company info to store company name
  try {
    // Temporarily store tokens to make API call
    await authService.storeTokens(tokens);
    const companyInfo = await apiService.getCompanyInfo();
    
    // Update stored tokens with company name
    await authService.storeTokens(tokens, companyInfo.name);
    
    res.json({
      success: true,
      company: companyInfo.name,
      message: 'Successfully connected to Visma eAccounting',
    });
  } catch (error) {
    // Store tokens even if we can't get company info
    await authService.storeTokens(tokens);
    
    res.json({
      success: true,
      message: 'Successfully connected to Visma eAccounting',
    });
  }
}));

/**
 * GET /auth/visma/status
 * Check Visma connection status
 */
router.get('/visma/status', asyncHandler(async (req, res) => {
  const hasTokens = await authService.hasValidTokens();
  
  if (!hasTokens) {
    return res.json({
      connected: false,
      message: 'No valid Visma tokens found',
    });
  }

  // Test API connection
  const apiConnected = await apiService.testConnection();
  
  if (apiConnected) {
    try {
      const companyInfo = await apiService.getCompanyInfo();
      res.json({
        connected: true,
        company: companyInfo.name,
        message: 'Connected to Visma eAccounting',
      });
    } catch (error) {
      res.json({
        connected: true,
        message: 'Connected to Visma eAccounting',
      });
    }
  } else {
    res.json({
      connected: false,
      message: 'Failed to connect to Visma API',
    });
  }
}));

/**
 * DELETE /auth/visma/disconnect
 * Disconnect from Visma
 */
router.delete('/visma/disconnect', asyncHandler(async (req, res) => {
  await authService.clearTokens();
  
  res.json({
    success: true,
    message: 'Disconnected from Visma eAccounting',
  });
}));

export default router;

