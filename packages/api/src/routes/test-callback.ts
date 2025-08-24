import { Router } from 'express';
import { VismaAuthService } from '../services/visma-auth.js';
import { VismaApiService } from '../services/visma-api.js';

const router = Router();
const authService = new VismaAuthService();
const apiService = new VismaApiService();

/**
 * GET /callback (root level)
 * Handle Visma OAuth callback for testing
 * This matches the redirect URI: http://localhost:44300/callback
 */
router.get('/', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Authentication Error</h1>
            <p>Error: ${error}</p>
            <p>Description: ${req.query.error_description || 'Unknown error'}</p>
            <a href="http://localhost:5173/setup">Return to Setup</a>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Missing Authorization Code</h1>
            <p>No authorization code received from Visma.</p>
            <a href="http://localhost:5173/setup">Return to Setup</a>
          </body>
        </html>
      `);
    }

    // Exchange code for tokens
    const tokens = await authService.exchangeCodeForToken(code as string);
    
    // Try to get company info
    let companyName = 'Unknown';
    try {
      await authService.storeTokens(tokens);
      const companyInfo = await apiService.getCompanyInfo();
      companyName = companyInfo.name;
      
      // Update stored tokens with company name
      await authService.storeTokens(tokens, companyName);
    } catch (err) {
      console.warn('Could not fetch company info:', err);
      await authService.storeTokens(tokens);
    }

    // Success page with redirect
    res.send(`
      <html>
        <head>
          <title>Visma Authentication Success</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .success { color: #28a745; }
            .info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
          </style>
          <script>
            // Auto-redirect after 5 seconds
            setTimeout(() => {
              window.location.href = 'http://localhost:5173/setup';
            }, 5000);
          </script>
        </head>
        <body>
          <h1 class="success">✅ Successfully Connected to Visma!</h1>
          <div class="info">
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>State:</strong> ${state || 'N/A'}</p>
            <p><strong>Status:</strong> Authentication successful</p>
          </div>
          <p>You will be redirected automatically in 5 seconds...</p>
          <a href="http://localhost:5173/setup" class="button">Return to App Now</a>
          <a href="http://localhost:5173/" class="button">Go to Upload</a>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Callback processing error:', error);
    res.status(500).send(`
      <html>
        <body>
          <h1>Authentication Failed</h1>
          <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <a href="http://localhost:5173/setup">Return to Setup</a>
        </body>
      </html>
    `);
  }
});

export default router;
