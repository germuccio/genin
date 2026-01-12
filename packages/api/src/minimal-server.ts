import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import cors from 'cors';
import axios from 'axios';
import multer from 'multer';
// Import XLSX using dynamic import to avoid ES module issues
let XLSX: any;
import path from 'path';
import { createRequire } from 'module';
import { VismaAuthService } from './services/visma-auth.js';
import { db } from './db/database.js';
// Simple cookie parser (inline implementation)
const parseCookies = (cookieHeader: string): Record<string, string> => {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.trim().split('=');
    if (parts.length === 2 && parts[0] && parts[1]) {
      cookies[parts[0]] = decodeURIComponent(parts[1]);
    }
  });
  
  return cookies;
};

// Initialize XLSX with require (works better than ES import)
const require = createRequire(import.meta.url);
XLSX = require('xlsx');

const app = express();
const PORT = 44300; // Fixed port for Visma OAuth callback

// Initialize Visma Auth Service
const vismaAuth = new VismaAuthService();

// Global variables (in real app, use database)
declare global {
  var vismaTokens: any;
  var imports: any[];
  var invoices: any[];
  var presets: any[];
}

// Initialize global storage
global.imports = [];
global.invoices = [];

// Helper function to get Visma tokens from cookies/session
function getVismaTokens(req: express.Request): any {
  // Try to get tokens from cookies first
  const cookies = req.headers.cookie;
  if (cookies) {
    const parsedCookies = parseCookies(cookies);
    if (parsedCookies.visma_tokens) {
      try {
        return JSON.parse(parsedCookies.visma_tokens);
      } catch (e) {
        console.error('Error parsing visma tokens from cookie:', e);
      }
    }
  }
  
  // Fallback to global variable (temporary solution)
  return global.vismaTokens || null;
}

// Add endpoint to clear data for testing
app.post('/api/debug/clear', (req, res) => {
  global.imports = [];
  global.invoices = [];
  console.log('🗑️ Cleared all imports and invoices');
  res.json({ success: true, message: 'Data cleared' });
});

// Environment configuration
const VISMA_API_ENVIRONMENT = process.env.VISMA_API_ENVIRONMENT || 'production';
const VISMA_API_BASE_URL = process.env.VISMA_API_BASE_URL || 
  (VISMA_API_ENVIRONMENT === 'production' 
    ? 'https://eaccountingapi.vismaonline.com' 
    : 'https://eaccountingapi-sandbox.vismaonline.com');
const VISMA_IDENTITY_URL = process.env.VISMA_IDENTITY_URL || 
  (VISMA_API_ENVIRONMENT === 'production' 
    ? 'https://identity.vismaonline.com' 
    : 'https://identity-sandbox.vismaonline.com');

console.log(`🌍 Visma Environment: ${VISMA_API_ENVIRONMENT}`);
console.log(`🔗 API Base URL: ${VISMA_API_BASE_URL}`);
console.log(`🔐 Identity URL: ${VISMA_IDENTITY_URL}`);

// Configure multer for file uploads
const upload = multer({
  dest: './uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  // Remove file filter for now to debug
});

// Function to exchange authorization code for access tokens
async function exchangeCodeForTokens(
  code: string,
  opts?: { clientId?: string; clientSecret?: string; redirectUri?: string }
) {
  const clientId = opts?.clientId || 'aiautomationsandbox';
  const clientSecret = opts?.clientSecret || 'rR.ZqjR=;WIcQP9FgmIiqJSuaeMldq2wlR8PJIvvBtAQxo2h2RfLYgTO1INiEw2O';
  const redirectUri = opts?.redirectUri || 'https://localhost:44300/callback'; // Must match the auth URL redirect URI
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const response = await axios.post(
      `${VISMA_IDENTITY_URL}/connect/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    const tokenData = response.data;
    
    // Add expiration timestamp
    tokenData.expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    
    console.log('🎉 Token exchange successful!');
    console.log('📦 Full token data from Visma:', tokenData);
    console.log('Access token received:', tokenData.access_token ? '✅' : '❌');
    console.log('Refresh token received:', tokenData.refresh_token ? '✅' : '❌');
    console.log('Expires in:', tokenData.expires_in, 'seconds');
    
    return tokenData;
  } catch (error: any) {
    console.error('❌ Token exchange failed:', error.response?.data || error.message);
    throw new Error('Failed to exchange authorization code for access token');
  }
}

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Minimal API server is running',
  });
});

// ===============================
// Simple shared-password sessions
// ===============================
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || 'dev-secret-change-me';

type SessionPayload = { sid: string; iat: number };

function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', APP_SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.') as [string, string];
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', APP_SESSION_SECRET).update(body).digest('base64url');
  if (expected !== sig) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
}



// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!APP_PASSWORD) {
    return res.status(500).json({ error: 'APP_PASSWORD not configured on server' });
  }
  if (!password || password !== APP_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = signSession({ sid: crypto.randomUUID(), iat: Date.now() });
  res.setHeader('Set-Cookie', `genin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`);
  return res.json({ success: true });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `genin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ success: true });
});

// Auth middleware (skip health and existing Visma OAuth endpoints)
app.use((req, res, next) => {
  const path = req.path || '';
  if (
    path === '/health' ||
    path.startsWith('/api/auth/login') ||
    path.startsWith('/api/auth/logout') ||
    path.startsWith('/api/auth/visma') ||
    path === '/callback'
  ) {
    return next();
  }
  const cookies = parseCookies(req.headers.cookie || '');
  const session = verifySession(cookies['genin_session']);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
});

// Simple session check (protected by middleware above)
app.get('/api/auth/me', (_req, res) => {
  res.json({ 
    authenticated: true,
    environment: VISMA_API_ENVIRONMENT,
    apiBaseUrl: VISMA_API_BASE_URL
  });
});

// Helper: get Visma access token (prefer header, fallback to global)
function getVismaAccessToken(req: express.Request): string | null {
  const headerToken = (req.headers['x-visma-access-token'] as string) || null;
  if (headerToken) return headerToken;
  return global.vismaTokens?.access_token || null;
}

// Simple auth URL endpoint
app.get('/api/auth/visma/url', (req, res) => {
  const state = Math.random().toString(36).substring(2, 15);
  
  // Allow per-user client id via headers, fallback to default
  const clientId = (req.headers['x-visma-client-id'] as string) || 'aiautomationsandbox';
  const redirectUri = 'https://localhost:44300/callback'; // Must match Visma registration
  const scope = 'ea:api ea:sales ea:purchase ea:accounting offline_access';
  
  const authUrl = `${VISMA_IDENTITY_URL}/connect/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}&prompt=select_account&acr_values=service:44643EB1-3F76-4C1C-A672-402AE8085934`;
  
  console.log('Generated auth URL:', authUrl);
  
  res.json({
    auth_url: authUrl,
    state,
  });
});

// Token exchange endpoint (what the frontend actually calls)
app.get('/api/auth/visma/callback', async (req: express.Request, res: express.Response) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('❌ Visma OAuth Error:', error, error_description);
    return res.redirect(`/setup?error=${encodeURIComponent(error_description as string || 'Unknown error')}`);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const tokenData = await vismaAuth.exchangeCodeForToken(code as string);
    
    // Store tokens in a secure, HttpOnly cookie
    const cookiePayload = JSON.stringify(tokenData);
    res.setHeader('Set-Cookie', `visma-tokens=${cookiePayload}; HttpOnly; Path=/; SameSite=Strict; Max-Age=3600`);

    console.log('✅ Successfully exchanged code for tokens and stored in cookie');

    // Redirect to the setup page with a success flag
    return res.redirect(`/setup?auth=success`);

  } catch (err: any) {
    console.error('❌ Failed to exchange code for token:', err.response?.data || err.message);
    const errorMessage = err.response?.data?.error_description || 'Token exchange failed';
    return res.redirect(`/setup?error=${encodeURIComponent(errorMessage)}`);
  }
});

// Get Visma connection status
app.get('/api/auth/visma/status', async (req, res) => {
  try {
    const tokens = getVismaTokens(req);
    const isConnected = !!(tokens && tokens.access_token);
    const apiMode = process.env.VISMA_API_ENVIRONMENT === 'production' ? 'LIVE' : 'TEST';

    return res.json({
      connected: isConnected,
      company: isConnected ? tokens.company_name : null,
      apiMode: apiMode,
    });
  } catch (error) {
    console.error('Error checking Visma status:', error);
    return res.status(500).json({ error: 'Failed to check status' });
  }
});

// Disconnect endpoint
app.delete('/api/auth/visma/disconnect', async (req, res) => {
  try {
    // Clear the HttpOnly cookie
    res.setHeader('Set-Cookie', 'visma-tokens=; HttpOnly; Path=/; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    
    // Also clear in-memory just in case, for consistency
    global.vismaTokens = null;

    return res.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting from Visma:', error);
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
});




// Create a test invoice draft for PDF attachment testing
app.post('/api/visma/create-test-invoice', async (req, res) => {
  try {
    if (!global.vismaTokens?.access_token) {
      return res.status(401).json({ 
        error: 'Not authenticated with Visma. Please authenticate via /api/auth/visma/connect first.' 
      });
    }

    const apiBaseUrl = VISMA_API_BASE_URL;
    const headers = { Authorization: `Bearer ${global.vismaTokens.access_token}`, 'Content-Type': 'application/json' };

    console.log('🧪 Creating test invoice draft for PDF attachment testing...');
    
    // Get a customer to use
    const customersResponse = await axios.get(`${apiBaseUrl}/v2/customers`, { headers });
    const customers = customersResponse.data?.Data || [];
    
    if (customers.length === 0) {
      return res.status(400).json({ error: 'No customers found. Please create a customer first.' });
    }
    
    const testCustomer = customers[0];
    console.log(`Using customer: ${testCustomer.Name} (${testCustomer.Id})`);
    
    // Create a simple test invoice draft
    const invoiceData = {
      CustomerId: testCustomer.Id,
      InvoiceDate: new Date().toISOString().split('T')[0],
      DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      YourReference: 'Test Reference',
      OurReference: `TEST-${Date.now()}`,
      Currency: testCustomer.CurrencyCode || 'NOK',
      RotReducedInvoicingType: 0,
      EuThirdParty: false,
      Rows: [{
        IsTextRow: false,
        Description: 'Test service for PDF attachment',
        Quantity: 1,
        UnitPrice: 100,
        VatRate: 25,
        LineNumber: 1,
        IsWorkCost: false,
        EligibleForReverseChargeOnVat: false,
        HideRow: false,
        ReversedConstructionServicesVatFree: false
      }]
    };
    
    const response = await axios.post(`${apiBaseUrl}/v2/customerinvoicedrafts`, invoiceData, { headers });
    
    return res.json({ 
      success: true, 
      invoiceId: response.data.Id,
      customer: testCustomer.Name,
      message: `Test invoice draft created: ${response.data.Id}`,
      testUrl: `/api/visma/test-pdf-attachment/${response.data.Id}`
    });
  } catch (error: any) {
    const errMsg = error.response?.data?.DeveloperErrorMessage || error.response?.data?.Message || error.message;
    const status = error.response?.status;
    console.warn(`❌ Test invoice creation failed (HTTP ${status}): ${errMsg}`);
    return res.status(500).json({ 
      error: `Test invoice creation failed: ${errMsg}`,
      status,
      details: error.response?.data
    });
  }
});

// Direct invoice creation with PDF attachment
app.post('/api/visma/invoices/create-direct', async (req, res) => {
  try {
    const { import_id, processed_invoices } = req.body;
    
    if (!global.vismaTokens?.access_token) {
      return res.status(401).json({ 
        error: 'Not authenticated with Visma. Please authenticate via /api/auth/visma/connect first.' 
      });
    }

    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    const apiBaseUrl = VISMA_API_BASE_URL;
    const headers = { Authorization: `Bearer ${global.vismaTokens.access_token}`, 'Content-Type': 'application/json' };

    console.log(`🚀 Creating invoices directly for import ${import_id}...`);

    // CRITICAL FIX: Use processed_invoices from request body (chunked) instead of all invoices from import
    // This prevents creating duplicates when frontend sends requests in chunks
    let invoices;
    if (processed_invoices && Array.isArray(processed_invoices) && processed_invoices.length > 0) {
      invoices = processed_invoices;
      console.log(`📦 Processing chunk with ${invoices.length} invoices (from request body)`);
    } else {
      // Fallback: Get all invoices from import (for non-chunked requests)
      invoices = (global.invoices || []).filter((inv: any) => inv.import_id === import_id);
      console.log(`📦 Processing all ${invoices.length} invoices for import ${import_id}`);
    }
    
    if (invoices.length === 0) {
      return res.status(404).json({ error: `No invoices found for import ${import_id}` });
    }

    const results: Array<{ invoiceId?: string; ok: boolean; error?: string; customer?: string }> = [];

    for (const invoice of invoices) {
      try {
        console.log(`📝 Creating direct invoice for ${invoice.mottaker}...`);

        // Get or create customer
        let customerId = invoice.visma_customer_id;
        if (!customerId) {
          console.log(`👤 Finding/creating customer: ${invoice.mottaker}`);
          
          // Search for existing customer
          const searchResponse = await axios.get(`${apiBaseUrl}/v2/customers?name=${encodeURIComponent(invoice.mottaker)}`, { headers });
          const existingCustomer = searchResponse.data.Data?.find((c: any) => 
            c.Name?.toLowerCase() === invoice.mottaker?.toLowerCase()
          );

          if (existingCustomer) {
            customerId = existingCustomer.Id;
            console.log(`✅ Found existing customer: ${existingCustomer.Id}`);
          } else {
            // Create new customer
            const customerData = {
              Name: invoice.mottaker,
              Email: invoice.email || '',
              Phone: invoice.phone || '',
              Address: {
                Address1: invoice.address || 'Ukjent adresse',
                City: invoice.city || 'Oslo',
                PostalCode: invoice.postalCode || '0001',
                Country: invoice.country || 'NO'
              },
              CurrencyCode: invoice.currency || 'NOK'
            };

            const customerResponse = await axios.post(`${apiBaseUrl}/v2/customers`, customerData, { headers });
            customerId = customerResponse.data.Id;
            console.log(`✅ Created new customer: ${customerId}`);
          }

          // Cache customer ID
          invoice.visma_customer_id = customerId;
        }

        // Get article ID for the status (use the same mapping as other endpoints)
        // You can get this from the request body or use the transport articles we created earlier
        const { customerDefaults, customerOverrides, articleMapping } = req.body;
        
        if (!articleMapping || !articleMapping.ok) {
          throw new Error(`Article mapping missing. Please provide articleMapping with 'ok' article ID.`);
        }
        
        const articleId = articleMapping.ok;
        
        console.log(`📋 Using article mapping: ${JSON.stringify(articleMapping)}`);
        console.log(`📋 Selected article ID: ${articleId}`);

        // Create invoice data
        // Determine currency and VAT rate - with Norwegian company detection
        let currency = invoice.currency || 'NOK';
        
        // Double-check Norwegian company detection at invoice creation
        const customerName = invoice.customer_name || '';
        const isNorwegianAtInvoice = customerName && (
          customerName.includes(' AS') || 
          customerName.includes(' ASA') || 
          customerName.endsWith(' AS') || 
          customerName.endsWith(' ASA') ||
          customerName.includes('NORSK') ||
          customerName.includes('NORWEGIAN') ||
          customerName.includes(' ANS') ||
          customerName.endsWith(' ANS') ||
          /\b(NORGE|NORWAY|NORSK|KRISTIAN|GEILO|INTERIOR|SKRUE|FABRIKK|BYGG|SERVICE|EIENDOM|STUDIO|ENERGI|MARKET|BOATS|SPA|TORGET|AUTEK|PLUSS|PREG|NORDIC|IMPORT|EKSPORT|PRO|REKVISITA|BRYGGEN|GLASS|INTER|STAIR|BERG|LAFT|INSTRUMENT|TEAM)\b/i.test(customerName) ||
          /^[A-ZÆØÅ\s&]+\s+(AS|ASA|ANS)$/i.test(customerName.trim())
        );
        
        if (isNorwegianAtInvoice && currency === 'EUR') {
          console.log(`🇳🇴 Final Norwegian check: ${customerName} - forcing NOK currency (was: ${currency})`);
          currency = 'NOK';
        }
        
        const vatRate = currency === 'NOK' ? 25 : 0;
        
        console.log(`💱 Direct Invoice currency: ${invoice.currency} -> Using: ${currency}, VAT Rate: ${vatRate}%`);
        console.log(`💰 Direct Invoice unit_price: ${invoice.unit_price} ${currency}`);
        
        const invoiceData = {
          CustomerId: customerId,
          InvoiceDate: new Date().toISOString().split('T')[0],
          DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          YourReference: invoice.your_reference || invoice.referanse,
          OurReference: invoice.referanse,
          CurrencyCode: currency,
          RotReducedInvoicingType: 0,
          EuThirdParty: false,
          Rows: [{
            IsTextRow: false,
            ArticleId: articleId,
            Description: `Transport service - ${invoice.referanse}`,
            Quantity: 1,
            UnitPrice: invoice.unit_price || (invoice.total_cents / 100) || (currency === 'NOK' ? 414 : 414),
            VatRate: vatRate,
            LineNumber: 1,
            IsWorkCost: false,
            EligibleForReverseChargeOnVat: false,
            HideRow: false,
            ReversedConstructionServicesVatFree: false
          }]
        };

        // Create the customer invoice draft
        console.log(`📤 Sending invoice data to Visma: ${JSON.stringify(invoiceData, null, 2)}`);
        const invoiceResponse = await axios.post(`${apiBaseUrl}/v2/customerinvoicedrafts`, invoiceData, { headers });
        const invoiceId = invoiceResponse.data.Id;
        
        console.log(`✅ Created invoice draft: ${invoiceId}`);

        // Attach PDF if available
        if (invoice.declaration_pdf && invoice.declaration_pdf.path) {
          try {
            console.log(`📎 Attaching PDF ${invoice.declaration_pdf.filename} to invoice ${invoiceId}...`);
            
            const fs = require('fs');
            const path = require('path');
            
            const pdfPath = path.resolve(invoice.declaration_pdf.path);
            console.log(`🔍 DEBUG - PDF path: ${pdfPath}`);
            console.log(`🔍 DEBUG - File exists: ${fs.existsSync(pdfPath)}`);
            
            const pdfBuffer = fs.readFileSync(pdfPath);
            console.log(`🔍 DEBUG - PDF buffer size: ${pdfBuffer.length} bytes`);
            
            // Convert PDF buffer to base64
            const pdfBase64 = pdfBuffer.toString('base64');
            
            // Use the same format as Vercel: JSON with base64 content
            const attachmentData = {
              DockumentId: invoiceId, // Note: Visma uses "DockumentId" not "DocumentId"
              DocumentType: 'CustomerInvoiceDraft',
              FileName: invoice.declaration_pdf.filename,
              FileSize: pdfBuffer.length,
              ContentType: 'application/pdf',
              Data: pdfBase64
            };
            
            console.log(`🔍 DEBUG - Sending PDF attachment to Visma (${pdfBase64.length} base64 chars)...`);
            await axios.post(`${apiBaseUrl}/v2/salesdocumentattachments`, attachmentData, {
              headers: {
                'Authorization': `Bearer ${global.vismaTokens.access_token}`,
                'Content-Type': 'application/json'
              }
            });
            
            console.log(`✅ PDF attachment successful for invoice ${invoiceId}`);
          } catch (attachError: any) {
            console.warn(`⚠️ PDF attachment failed for invoice ${invoiceId}: ${attachError.response?.data?.DeveloperErrorMessage || attachError.response?.data?.Message || attachError.message}`);
            if (attachError.response?.data) {
              console.log(`🔍 DEBUG - Full error response:`, JSON.stringify(attachError.response.data, null, 2));
            }
          }
        }

        // Update invoice record
        invoice.visma_invoice_id = invoiceId;
        invoice.status = 'created_as_draft';

        results.push({ 
          invoiceId, 
          ok: true, 
          customer: invoice.mottaker 
        });

      } catch (error: any) {
        const errorMsg = error.response?.data?.DeveloperErrorMessage || error.response?.data?.Message || error.message;
        console.error(`❌ Failed to create invoice for ${invoice.mottaker}: ${errorMsg}`);
        
        results.push({ 
          ok: false, 
          error: errorMsg,
          customer: invoice.mottaker 
        });
      }
    }

    const successful = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    console.log(`🎉 Direct invoice creation completed: ${successful} successful, ${failed} failed`);

    return res.json({
      success: true,
      message: `Created ${successful} invoice drafts directly (${failed} failed)`,
      results,
      summary: {
        total: results.length,
        successful,
        failed
      }
    });

  } catch (error: any) {
    console.error('❌ Direct invoice creation failed:', error);
    return res.status(500).json({ 
      error: 'Direct invoice creation failed', 
      details: error.response?.data || error.message 
    });
  }
});

// Test PDF attachment endpoints
app.post('/api/visma/test-pdf-attachment/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const testToken = req.headers['x-test-token'] as string;
    const useAuth = global.vismaTokens?.access_token || testToken;
    
    if (!useAuth) {
      return res.status(401).json({ 
        error: 'Not authenticated with Visma. Either authenticate via /api/auth/visma/connect or provide x-test-token header.' 
      });
    }

    const apiBaseUrl = VISMA_API_BASE_URL;
    const headers = { Authorization: `Bearer ${useAuth}` };

    console.log(`🧪 Testing PDF attachment to invoice ${invoiceId}...`);
    
    // Create a simple test PDF content
    const testPdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000125 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n174\n%%EOF');
    
    const results = [];
    
    // Test 1: salesdocumentattachments/customerinvoicedraft (most likely correct)
    try {
      console.log('🔍 Testing: /v2/salesdocumentattachments/customerinvoicedraft');
      const FormData = require('form-data');
      const formData1 = new FormData();
      formData1.append('file', testPdfContent, {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      });
      formData1.append('customerInvoiceDraftId', invoiceId);
      
      const response1 = await axios.post(`${apiBaseUrl}/v2/salesdocumentattachments/customerinvoicedraft`, formData1, {
        headers: { ...headers, ...formData1.getHeaders() }
      });
      
      results.push({ method: 'salesdocumentattachments/customerinvoicedraft', status: 'success', response: response1.status });
    } catch (e: any) {
      results.push({ method: 'salesdocumentattachments/customerinvoicedraft', status: 'failed', error: e.response?.status, message: e.response?.data?.DeveloperErrorMessage || e.message });
    }
    
    // Test 2: customerinvoicedrafts/{id}/attachments
    try {
      console.log('🔍 Testing: /v2/customerinvoicedrafts/{id}/attachments');
      const FormData = require('form-data');
      const formData2 = new FormData();
      formData2.append('file', testPdfContent, {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      });
      
      const response2 = await axios.post(`${apiBaseUrl}/v2/customerinvoicedrafts/${invoiceId}/attachments`, formData2, {
        headers: { ...headers, ...formData2.getHeaders() }
      });
      
      results.push({ method: 'customerinvoicedrafts/attachments', status: 'success', response: response2.status });
    } catch (e: any) {
      results.push({ method: 'customerinvoicedrafts/attachments', status: 'failed', error: e.response?.status, message: e.response?.data?.DeveloperErrorMessage || e.message });
    }
    
    // Test 3: customerinvoices/{id}/attachments
    try {
      console.log('🔍 Testing: /v2/customerinvoices/{id}/attachments');
      const FormData = require('form-data');
      const formData3 = new FormData();
      formData3.append('file', testPdfContent, {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      });
      
      const response3 = await axios.post(`${apiBaseUrl}/v2/customerinvoices/${invoiceId}/attachments`, formData3, {
        headers: { ...headers, ...formData3.getHeaders() }
      });
      
      results.push({ method: 'customerinvoices/attachments', status: 'success', response: response3.status });
    } catch (e: any) {
      results.push({ method: 'customerinvoices/attachments', status: 'failed', error: e.response?.status, message: e.response?.data?.DeveloperErrorMessage || e.message });
    }
    
    return res.json({ 
      success: true, 
      invoiceId,
      results,
      message: `Tested PDF attachment endpoints for invoice ${invoiceId}` 
    });
  } catch (error: any) {
    const errMsg = error.response?.data?.DeveloperErrorMessage || error.response?.data?.Message || error.message;
    const status = error.response?.status;
    console.warn(`❌ Test failed for invoice ${req.params.invoiceId} (HTTP ${status}): ${errMsg}`);
    return res.status(500).json({ 
      error: `Test failed: ${errMsg}`,
      status,
      invoiceId: req.params.invoiceId,
      details: error.response?.data
    });
  }
});

// Test PDF attachment endpoints

// Upload endpoints
app.post('/api/upload/files', upload.any(), async (req, res) => {
  try {
    console.log('📁 Upload request received');
    const files = (req.files as Express.Multer.File[]) || [];
    console.log('📂 Files received:', files.map(f => f.fieldname));
    
    // Accept either named fields (excel/pdf) or any() array uploads
    const excelFile = files.find(f => /\.xlsx$|\.xls$/i.test(f.originalname));
    const pdfFiles = files.filter(f => /\.pdf$/i.test(f.originalname));
    
    // Check if this is a PDF chunk upload (no Excel file, but has import_id)
    const importIdFromBody = req.body?.import_id;
    
    if (!excelFile && importIdFromBody) {
      // This is a PDF chunk upload - add PDFs to existing import
      console.log(`📦 PDF chunk upload for import ${importIdFromBody} with ${pdfFiles.length} files`);
      const existingImport = global.imports.find((imp: any) => imp.id === parseInt(importIdFromBody));
      
      if (!existingImport) {
        return res.status(400).json({ error: `Import ${importIdFromBody} not found` });
      }
      
      // Add new PDFs to existing import
      const newPdfRecords = pdfFiles.map(pdf => ({
        originalName: pdf.originalname,
        path: pdf.path,
        size: pdf.size
      }));
      
      existingImport.pdf_files = [...existingImport.pdf_files, ...newPdfRecords];
      console.log(`✅ Added ${pdfFiles.length} PDFs to import ${importIdFromBody}. Total: ${existingImport.pdf_files.length}`);
      
      return res.json({
        import_id: existingImport.id,
        filename: existingImport.filename,
        status: 'completed',
        total_rows: existingImport.total_rows,
        valid_rows: existingImport.valid_rows,
        errors: [],
        pdf_files: existingImport.pdf_files.map((pdf: any) => ({
          originalName: pdf.originalName,
          size: pdf.size,
          hasText: false
        })),
        message: `Added ${pdfFiles.length} PDFs. Total: ${existingImport.pdf_files.length} PDFs`
      });
    }
    
    if (!excelFile) {
      console.log('❌ No Excel file found in upload');
      return res.status(400).json({ error: 'Excel file is required' });
    }

    console.log(`📁 Processing upload: ${excelFile.originalname}`);
    console.log(`📄 MIME type: ${excelFile.mimetype}`);
    console.log(`📄 File size: ${excelFile.size} bytes`);
    console.log(`📄 PDF files: ${pdfFiles.length}`);

    // Parse Excel file
    console.log('🔄 Starting Excel parsing...');
    const workbook = XLSX.readFile(excelFile.path);
    console.log('✅ Excel file read successfully');
    
    const sheetName = workbook.SheetNames[0];
    console.log(`📋 Using sheet: ${sheetName}`);
    
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    // Also keep a raw array-of-arrays view to support positional column mapping (A/C/H etc.)
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

    console.log(`📊 Excel contains ${jsonData.length} rows`);

    // Create import record
    const importRecord = {
      id: global.imports.length + 1,
      filename: excelFile.originalname,
      status: 'completed',
      total_rows: jsonData.length,
      valid_rows: jsonData.length, // For now, assume all rows are valid
      created_at: new Date().toISOString(),
      excel_data: jsonData,
      excel_rows: rawRows,
      pdf_files: pdfFiles.map(pdf => ({
        originalName: pdf.originalname,
        path: pdf.path,
        size: pdf.size
      }))
    };

    global.imports.push(importRecord);

    // Clean up Excel file but keep PDFs for attachment to invoices
    fs.unlinkSync(excelFile.path);
    console.log(`📁 Kept ${pdfFiles.length} PDF files for invoice attachments`);

    return res.json({
      import_id: importRecord.id,
      filename: importRecord.filename,
      status: importRecord.status,
      total_rows: importRecord.total_rows,
      valid_rows: importRecord.valid_rows,
      errors: [],
      pdf_files: pdfFiles.map(pdf => ({
        originalName: pdf.originalname,
        size: pdf.size,
        hasText: false // For now
      }))
    });

  } catch (error: any) {
    console.error('Upload processing failed:', error);
    return res.status(500).json({
      error: 'Failed to process uploaded files: ' + error.message
    });
  }
});

app.get('/api/upload/imports', (req, res) => {
  res.json(global.imports.map(imp => ({
    id: imp.id,
    filename: imp.filename,
    status: imp.status,
    total_rows: imp.total_rows,
    created_at: imp.created_at
  })));
});

// Invoice endpoints (specific routes first)
// Global presets storage (in real app, use database)
if (!global.presets) {
  global.presets = [
    {
      id: 1,
      code: 'OK',
      name: 'Norsk import (+mva)',
      unit_price_cents: 42500, // 425 NOK
      currency: 'NOK',
      vat_code: '25',
      article_name: 'Norsk import (+mva)'
    }
  ];
}

// Presets endpoints
app.get('/api/invoices/presets', (req, res) => {
  res.json(global.presets);
});

app.post('/api/invoices/presets', (req, res) => {
  const { code, name, unit_price_cents, currency, vat_code, article_name } = req.body;
  
  if (!code || !name || !unit_price_cents) {
    return res.status(400).json({ error: 'Missing required fields: code, name, unit_price_cents' });
  }
  
  const newPreset = {
    id: global.presets.length + 1,
    code,
    name,
    unit_price_cents: parseInt(unit_price_cents),
    currency: currency || 'NOK',
    vat_code: vat_code || '25',
    article_name: article_name || name
  };
  
  global.presets.push(newPreset);
  console.log(`✅ Created preset: ${code} - ${name} (${unit_price_cents/100} ${currency})`);
  
  return res.json(newPreset);
});

app.put('/api/invoices/presets/:id', (req, res) => {
  const presetId = parseInt(req.params.id);
  const { code, name, unit_price_cents, currency, vat_code, article_name } = req.body;
  
  const presetIndex = global.presets.findIndex(p => p.id === presetId);
  if (presetIndex === -1) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  
  global.presets[presetIndex] = {
    ...global.presets[presetIndex],
    code: code || global.presets[presetIndex].code,
    name: name || global.presets[presetIndex].name,
    unit_price_cents: unit_price_cents ? parseInt(unit_price_cents) : global.presets[presetIndex].unit_price_cents,
    currency: currency || global.presets[presetIndex].currency,
    vat_code: vat_code || global.presets[presetIndex].vat_code,
    article_name: article_name || global.presets[presetIndex].article_name
  };
  
  console.log(`✅ Updated preset: ${global.presets[presetIndex].code} - ${global.presets[presetIndex].name}`);
  
  return res.json(global.presets[presetIndex]);
});

app.delete('/api/invoices/presets/:id', (req, res) => {
  const presetId = parseInt(req.params.id);
  const presetIndex = global.presets.findIndex(p => p.id === presetId);
  
  if (presetIndex === -1) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  
  const deletedPreset = global.presets.splice(presetIndex, 1)[0];
  console.log(`🗑️ Deleted preset: ${deletedPreset.code} - ${deletedPreset.name}`);
  
  return res.json({ success: true, deleted: deletedPreset });
});

// Process import endpoint
app.post('/api/invoices/process-import', (req, res) => {
  const { import_id } = req.body;
  
  if (!import_id) {
    return res.status(400).json({
      error: 'import_id is required'
    });
  }

  const importRecord = global.imports.find(imp => imp.id === import_id);
  if (!importRecord) {
    return res.status(404).json({
      error: 'Import not found'
    });
  }

  console.log(`🔄 Processing import ${import_id} with ${importRecord.excel_data.length} rows`);

  // Create invoices from the Excel data
  let processed = 0;
  
  importRecord.excel_data.forEach((row: any, index: number) => {
    console.log(`📋 Processing row ${index + 1}:`, JSON.stringify(row, null, 2));
    
    // Support new column mapping by position: A=Our reference, C=Your reference, H=PDF code
    const rowArray: any[] | undefined = (global.imports.find(imp => imp.id === import_id) as any)?.excel_rows?.[index + 1];
    const ourRefFromA = rowArray ? rowArray[0] : undefined; // Column A
    const yourRefFromC = rowArray ? rowArray[2] : undefined; // Column C
    const pdfCodeFromH = rowArray ? rowArray[7] : undefined; // Column H

    // Extract business data according to your workflow
    const referanse = (ourRefFromA ?? row.Referanse ?? row.referanse ?? `REF-${Date.now()}-${index}`).toString();
    const yourReference = (yourRefFromC ?? row['Your reference'] ?? row.your_reference ?? row.yourReference)?.toString();
    const avsender = row.Avsender || row.avsender; // Sender Name (your client's client)
    const mottaker = row.Mottaker || row.mottaker; // Receiver Name (who gets invoiced)
    const sekvensnr = (pdfCodeFromH ?? row.Sekvensnr ?? row.sekvensnr ?? row['Sequence Number'])?.toString(); // PDF match code
    const transportid = row.Transportid || row.transportid;
    const statusCode = row['s.NO'] || row.Status || row.status || row['Status Code'] || 'UNKNOWN'; // OK/MAN status
    // Get currency from Excel, but force NOK for Norwegian companies
    let currency = row.Valuta || row.Currency || row.currency || 'NOK';
    
    // Check if customer appears to be Norwegian (has AS, ASA, etc. or other Norwegian indicators)
    // Convert mottaker to string to handle cases where it might be a number
    const mottakerStr = String(mottaker || '');
    const isNorwegianCompany = mottakerStr && (
      mottakerStr.includes(' AS') || 
      mottakerStr.includes(' ASA') || 
      mottakerStr.endsWith(' AS') || 
      mottakerStr.endsWith(' ASA') ||
      mottakerStr.includes('NORSK') ||
      mottakerStr.includes('NORWEGIAN') ||
      mottakerStr.includes(' ANS') ||
      mottakerStr.endsWith(' ANS') ||
      // Add more Norwegian patterns
      /\b(NORGE|NORWAY|NORSK)\b/i.test(mottakerStr) ||
      // Norwegian names/words patterns - more comprehensive
      /\b(BYGG|SERVICE|EIENDOM|STUDIO|ENERGI|MARKET|BOATS|SPA|TORGET|AUTEK|PLUSS|PREG|NORDIC|IMPORT|EKSPORT|PRO|REKVISITA|BRYGGEN|GLASS|INTER|STAIR|BERG|LAFT|INSTRUMENT|TEAM|KRISTIAN|GEILO|INTERIOR|SKRUE|FABRIKK)\b/i.test(mottakerStr) ||
      // Check if it's clearly a Norwegian company name pattern
      /^[A-ZÆØÅ\s&]+\s+(AS|ASA|ANS)$/i.test(mottakerStr.trim())
    );
    
    // Force NOK for all Norwegian companies
    if (isNorwegianCompany) {
      console.log(`🇳🇴 Detected Norwegian company: ${mottaker} - forcing NOK currency (was: ${currency})`);
      currency = 'NOK';
    }
    
    // Additional fallback: if company name suggests Norwegian but wasn't caught above
    const additionalNorwegianPatterns = mottakerStr && (
      mottakerStr.includes('KRISTIAN') ||
      mottakerStr.includes('SKRUE') ||
      mottakerStr.includes('FABRIKK') ||
      mottakerStr.includes('RAZUMN') // Seems to be a Norwegian resident
    );
    
    if (additionalNorwegianPatterns && currency === 'EUR') {
      console.log(`🇳🇴 Additional Norwegian detection: ${mottaker} - forcing NOK currency`);
      currency = 'NOK';
    }
    
    console.log(`🏷️  Status Code: ${statusCode}`);
    
    // Only process "OK" entries, skip "MAN" and others
    if (statusCode !== 'OK') {
      console.log(`⏭️  Skipping row ${index + 1} - Status code is not OK: ${statusCode}`);
      return;
    }
    
    console.log(`📄 Sequence Number / PDF code: ${sekvensnr}`);
    console.log(`💱 Currency from Excel: ${currency}`);
    
    // Use OK preset for pricing (since we only process OK entries)
    const preset = global.presets.find(p => p.code === 'OK');
    let totalCents = 41400; // Default 414 NOK
    let serviceDescription = 'Norsk import (+mva)';
    
    if (preset) {
      totalCents = preset.unit_price_cents;
      serviceDescription = preset.name;
      console.log(`💰 Using OK preset: ${preset.name} (${preset.unit_price_cents/100} ${preset.currency})`);
      console.log(`💰 Preset details: ${JSON.stringify(preset)}`);
    } else {
      console.log(`⚠️ No OK preset found, using default pricing`);
      console.log(`⚠️ Available presets: ${JSON.stringify(global.presets)}`);
    }
    
    console.log(`💰 Final pricing: ${totalCents} cents = ${totalCents/100} ${currency}`);
    
    // Find matching PDF declaration based on the code from column H
    let matchingPdf = null;
    if (sekvensnr && importRecord.pdf_files) {
      matchingPdf = importRecord.pdf_files.find((pdf: any) => 
        pdf.originalName.includes(sekvensnr) || 
        pdf.originalName.includes(sekvensnr.toString())
      );
      if (matchingPdf) {
        console.log(`📎 Found matching PDF: ${matchingPdf.originalName} for code ${sekvensnr}`);
      }
    }
    
    // Create invoice with proper business logic
    const invoice = {
      id: global.invoices.length + 1,
      import_id: import_id,
      total_cents: totalCents,
      unit_price: totalCents / 100, // Convert cents to currency units
      visma_invoice_id: null, // Will be set when created in Visma
      status: 'draft',
      created_at: new Date().toISOString(),
      
      // Business fields
      referanse: referanse, // Transport Reference
      your_reference: yourReference,
      avsender: avsender, // Sender (your client's client)
      mottaker: mottakerStr, // Receiver (who gets invoiced) - converted to string
      sekvensnr: sekvensnr, // PDF match code (from column H)
      transportid: transportid,
      status_code: statusCode, // OK/MAN status
      service_description: serviceDescription,
      currency: currency, // Currency from Excel
      
      // PDF attachment info
      declaration_pdf: matchingPdf ? {
        filename: matchingPdf.originalName,
        path: matchingPdf.path,
        size: matchingPdf.size
      } : null,
      
      filename: importRecord.filename,
      row_data: row
    };

    console.log(`✅ Created invoice: ${referanse} for ${mottaker} - ${totalCents/100} ${currency} (${statusCode} status)`);
    console.log(`📋 Invoice object: ${JSON.stringify(invoice, null, 2)}`);
    if (matchingPdf) {
      console.log(`   📎 With PDF: ${matchingPdf.originalName}`);
    }
    
    global.invoices.push(invoice);
    processed++;
  });

  console.log(`✅ Created ${processed} invoices from import ${import_id}`);

  // Get the processed invoices for this specific import
  const processedInvoices = global.invoices.filter(inv => inv.import_id === import_id);
  
  console.log(`📍 Returning ${processedInvoices.length} processed invoices to frontend`);

  return res.json({
    success: true,
    processed: processed,
    import_id: import_id,
    processed_invoices: processedInvoices
  });
});

app.get('/api/invoices', (req, res) => {
  // Return the created invoices
  res.json(global.invoices);
});

app.get('/api/invoices/:id', (req, res) => {
  const invoiceId = parseInt(req.params.id);
  
  // Return mock invoice for now - in real app, fetch from database
  res.json({
    id: invoiceId,
    total_cents: 50000, // 500 NOK
    currency: 'NOK',
    visma_invoice_id: null,
    status: 'draft',
    created_at: new Date().toISOString(),
    referanse: 'REF-001',
    mottaker: 'Test Customer',
    filename: 'test-file.xlsx'
  });
});

// Pre-validation before creating invoices in Visma
app.post('/api/invoices/validate-for-visma', async (req, res) => {
  try {
    if (!global.vismaTokens || !global.vismaTokens.access_token) {
      return res.status(401).json({ 
        error: 'Not authenticated with Visma. Please connect first.',
        valid: false
      });
    }

    const draftInvoices = global.invoices.filter(inv => !inv.visma_invoice_id);
    if (draftInvoices.length === 0) {
      return res.json({
        valid: true,
        message: 'No draft invoices to create',
        invoices: [],
        warnings: []
      });
    }

    const apiBaseUrl = VISMA_API_BASE_URL;
    const validationResults = [];
    const warnings = [];

    for (const invoice of draftInvoices) {
      const result: {
        referanse: any;
        mottaker: any;
        amount: number;
        status: 'valid' | 'invalid' | 'warning';
        issues: string[];
        existing_customer: boolean;
        customer_id: string | null;
      } = {
        referanse: invoice.referanse,
        mottaker: invoice.mottaker,
        amount: invoice.total_cents / 100,
        status: 'valid',
        issues: [],
        existing_customer: false,
        customer_id: null
      };

      // Validate required fields
      if (!invoice.mottaker || (typeof invoice.mottaker === 'string' && invoice.mottaker.trim() === '')) {
        result.status = 'invalid';
        result.issues.push('Missing customer name (mottaker)');
      }

      if (!invoice.referanse || (typeof invoice.referanse === 'string' && invoice.referanse.trim() === '')) {
        result.status = 'invalid';
        result.issues.push('Missing reference (referanse)');
      }

      if (!invoice.total_cents || invoice.total_cents <= 0) {
        result.status = 'invalid';
        result.issues.push('Invalid amount');
      }

      // For now, assume all customers will need to be created
      // We'll check this during actual creation to avoid validation failures
      result.existing_customer = false;
      warnings.push(`Customer "${invoice.mottaker}" will be created with default address information`);

      validationResults.push(result);
    }

    const hasInvalid = validationResults.some(r => r.status === 'invalid');
    const hasWarnings = validationResults.some(r => r.status === 'warning') || warnings.length > 0;

    return res.json({
      valid: !hasInvalid,
      has_warnings: hasWarnings,
      total_invoices: draftInvoices.length,
      valid_invoices: validationResults.filter(r => r.status === 'valid').length,
      invalid_invoices: validationResults.filter(r => r.status === 'invalid').length,
      invoices: validationResults,
      warnings: warnings,
      message: hasInvalid 
        ? 'Some invoices have validation errors and cannot be created'
        : hasWarnings
          ? 'All invoices are valid but there are warnings'
          : 'All invoices are valid and ready to create'
    });

  } catch (error: any) {
    console.error('❌ Validation error:', error.response?.data || error.message);
    return res.status(500).json({ 
      error: 'Validation failed',
      details: error.response?.data?.DeveloperErrorMessage || error.message,
      valid: false
    });
  }
});

// List Terms of Payment from Visma for UI dropdowns
app.get('/api/visma/termsofpayments', async (req, res) => {
  try {
    if (!global.vismaTokens || !global.vismaTokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Visma' });
    }
    const apiBaseUrl = VISMA_API_BASE_URL;
    const termsResp = await axios.get(`${apiBaseUrl}/v2/termsofpayments`, {
      headers: {
        'Authorization': `Bearer ${global.vismaTokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    return res.json({ items: termsResp.data?.Data ?? [] });
  } catch (error: any) {
    console.error('❌ Failed to load TermsOfPayments:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to load TermsOfPayments' });
  }
});


// Create invoices in Visma eAccounting
app.post('/api/invoices/create-in-visma', async (req, res) => {
  try {
    if (!global.vismaTokens || !global.vismaTokens.access_token) {
      return res.status(401).json({
        error: 'Not authenticated with Visma. Please connect first.'
      });
    }

    const { customerDefaults, customerOverrides, articleMapping } = req.body;
    
    if (!articleMapping?.ok) {
      return res.status(400).json({ success: false, error: 'Article mapping is incomplete. Please configure it in Setup.' });
    }
    const okArticleId: string = articleMapping.ok;
    
    console.log('📋 Using customer defaults:', customerDefaults);

    const draftInvoices = global.invoices.filter(inv => !inv.visma_invoice_id);
    console.log(`🔄 Creating ${draftInvoices.length} invoices in Visma...`);

    // Use the production API endpoint (sandbox credentials work with production API)
    const apiBaseUrl = VISMA_API_BASE_URL;
    console.log(`🌐 Using API URL: ${apiBaseUrl}`);

    let created = 0;
    const errors: Array<{ customer: string; error: string }> = [];

    // Pre-fetch Units once to use for all documents
    let defaultUnitId: string | null = null;
    try {
      const unitsResponse = await axios.get(`${apiBaseUrl}/v2/units`, { headers: { 'Authorization': `Bearer ${global.vismaTokens.access_token}` } });
      const units = unitsResponse.data?.Data ?? [];
      const suitableUnit = units.find((u: any) => ['stk', 'pcs'].includes(u.Name?.toLowerCase())) || units[0];
      if (suitableUnit) {
        defaultUnitId = suitableUnit.Id;
        console.log(`📏 Using default unit: ${suitableUnit.Name} (${defaultUnitId})`);
      }
    } catch (lookupError: any) {
        console.warn('⚠️ Failed to pre-fetch units (continuing without explicit UnitId):', lookupError.response?.data || lookupError.message);
        defaultUnitId = null;
    }
    
    let defaultCodingId: string | null = null;
    try {
      const codingsResponse = await axios.get(`${apiBaseUrl}/v2/codings`, {
        headers: { 'Authorization': `Bearer ${global.vismaTokens.access_token}` }
      });
      const codings = codingsResponse.data?.Data ?? [];
      if (codings.length > 0) {
        defaultCodingId = codings[0].Id;
        console.log(`📋 Using default coding: ${codings[0].Name} (${defaultCodingId})`);
      }
    } catch (codingError: any) {
        console.warn('⚠️ Could not fetch codings from Visma. Proceeding without a default CodingId.');
        console.warn(`(Visma API error: ${codingError.response?.data?.Message || codingError.message})`);
        defaultCodingId = null; // Ensure it's null and continue
    }

    for (const invoice of draftInvoices) {
      try {
        // Step 1: Create or find customer in Visma
        let customerId = null;
        try {
          // First try to find existing customer
          const customerSearchResponse = await axios.get(`${apiBaseUrl}/v2/customers`, {
            headers: {
              'Authorization': `Bearer ${global.vismaTokens.access_token}`,
              'Content-Type': 'application/json'
            }
          });

          const customerCurrency = invoice.currency || 'NOK';

          const existingCustomer = customerSearchResponse.data?.Data?.find((c: any) => 
            c.Name === invoice.mottaker && c.CurrencyCode === customerCurrency
          );

          if (existingCustomer) {
            customerId = existingCustomer.Id;
            console.log(`👤 Found existing customer: ${invoice.mottaker} with currency ${customerCurrency} (ID: ${customerId})`);
          } else {
            // Create new customer
            const override = customerOverrides[invoice.mottaker] || {};
            const customerData: any = {
              Name: invoice.mottaker,
              CurrencyCode: customerCurrency,
              IsPrivatePerson: false,
              IsActive: true,
              Email: '',
              Phone: '',
              InvoiceAddress1: override.address ?? customerDefaults.address,
              InvoiceCity: override.city ?? customerDefaults.city,
              InvoicePostalCode: override.postalCode ?? customerDefaults.postalCode,
              InvoiceCountryCode: override.country ?? customerDefaults.country,
              VatNumber: '',
              CompanyIdentityNumber: ''
            };

            // Terms of payment resolution (MANDATORY)
            let termsId: string | undefined = override.termsOfPaymentId;
            try {
              if (!termsId) {
                // Fetch from Visma right now to ensure we have a valid GUID
                const tResp = await axios.get(`${apiBaseUrl}/v2/termsofpayments`, {
                  headers: {
                    'Authorization': `Bearer ${global.vismaTokens.access_token}`,
                    'Content-Type': 'application/json'
                  }
                });
                const list = (tResp.data?.Data ?? tResp.data ?? []) as Array<any>;
                const active = list.find((t: any) => t.IsActive) || list[0];
                termsId = active?.Id;
              }
              if (!termsId) {
                throw new Error('No TermsOfPayment available in Visma company');
              }
              customerData.TermsOfPaymentId = termsId;
              console.log(`💳 Using TermsOfPaymentId ${termsId} for ${invoice.mottaker}`);
            } catch (e: any) {
              console.error('❌ Could not resolve TermsOfPaymentId:', e.response?.data || e.message);
              throw new Error('Could not resolve TermsOfPaymentId');
            }
            
            const customerResponse = await axios.post(
              `${apiBaseUrl}/v2/customers`,
              customerData,
              {
                headers: {
                  'Authorization': `Bearer ${global.vismaTokens.access_token}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            customerId = customerResponse.data.Id;
            console.log(`👤 Created new customer: ${invoice.mottaker} (ID: ${customerId})`);
          }
        } catch (customerError: any) {
          console.error(`❌ Failed to create/find customer ${invoice.mottaker}:`, customerError.response?.data || customerError.message);
          throw new Error(`Customer creation failed: ${customerError.response?.data?.DeveloperErrorMessage || customerError.message}`);
        }

        // The customerCurrency variable is now correctly scoped from the customer lookup/creation block
        
        // Step 2: Create invoice in Visma with proper format
        const articleId = okArticleId; // Always use OK article since we only process OK entries
        const unitPrice = (invoice.total_cents / 100) || 414; // Use actual calculated price or default to 414
        const preset = global.presets.find(p => p.code === 'OK');
        const articleName = preset?.article_name || 'Norsk import (+mva)';
        
        // --- FIX START: Update article name before creating invoice ---
        try {
          const articleResponse = await axios.get(`${apiBaseUrl}/v2/articles/${articleId}`, {
            headers: { 'Authorization': `Bearer ${global.vismaTokens.access_token}` }
          });
          const currentArticle = articleResponse.data;

          if (currentArticle.Name !== articleName) {
            const articleUpdatePayload = { ...currentArticle, Name: articleName };
            await axios.put(`${apiBaseUrl}/v2/articles/${articleId}`, articleUpdatePayload, {
              headers: { 'Authorization': `Bearer ${global.vismaTokens.access_token}` }
            });
            console.log(`🔄 Updated article ${articleId} name to "${articleName}" for invoice`);
          }
        } catch (updateError: any) {
          console.warn(`⚠️ Could not update article name for invoice ${articleId}:`, updateError.response?.data || updateError.message);
        }
        // --- FIX END ---
        
        if (!articleId) {
          throw new Error(`Missing article ID for OK status`);
        }

        // Determine currency and VAT rate
        const currency = invoice.currency || 'NOK';
        const vatRate = currency === 'NOK' ? 25 : 0;
        
        console.log(`💱 Bulk Invoice currency: ${invoice.currency} -> Using: ${currency}, VAT Rate: ${vatRate}%`);
        console.log(`💰 Bulk Invoice unitPrice: ${unitPrice} ${currency} (from total_cents: ${invoice.total_cents})`);
        
        const invoiceData = {
          CustomerId: customerId,
          InvoiceDate: new Date().toISOString().split('T')[0],
          DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
          // Map columns: C -> YourReference, A -> OurReference
          YourReference: (invoice.your_reference ?? '').toString() || invoice.referanse?.toString(),
          OurReference: invoice.referanse?.toString(),
          CurrencyCode: currency, // Use customer's currency, default to NOK
          RotReducedInvoicingType: 0, // Set to 0 for None
          EuThirdParty: false, // --- FIX: Force EuThirdParty to false to avoid automatic account switching
          Rows: [
            {
              IsTextRow: false, // Use article row to show pricing
              ArticleId: articleId, // Include ArticleId for proper pricing
              Description: `${articleName} - Ref: ${invoice.referanse}`,
              Quantity: 1,
              UnitPrice: unitPrice, // Use UnitPrice instead of Price
              VatRate: vatRate, // --- FIX: Use calculated VAT rate
              ...(defaultUnitId && { UnitId: defaultUnitId }),
              ...(defaultCodingId && { CodingId: defaultCodingId }),
              ReversedConstructionServicesVatFree: false
            }
          ]
        };

        console.log(`📝 Creating invoice for ${invoice.mottaker}:`);
        console.log(`📤 Sending invoice data to Visma: ${JSON.stringify(invoiceData, null, 2)}`);
        
        const response = await axios.post(
          `${apiBaseUrl}/v2/customerinvoicedrafts`,
          invoiceData,
          {
            headers: {
              'Authorization': `Bearer ${global.vismaTokens.access_token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // Update local invoice with Visma ID
        invoice.visma_invoice_id = response.data.Id;
        invoice.status = 'created_in_visma';
        
        console.log(`✅ Created invoice in Visma: ${response.data.Id}`);
        
        // Store PDF information for manual attachment later
        if (invoice.declaration_pdf && invoice.declaration_pdf.path) {
          console.log(`📎 PDF ${invoice.declaration_pdf.filename} available for invoice ${response.data.Id}`);
          console.log(`⚠️ Note: Visma eAccounting API does not support direct PDF attachment to customer invoice drafts`);
          console.log(`💡 Alternative: PDFs can be attached manually in Visma UI or via other document management systems`);
          
          // Store the PDF path and invoice ID for potential future use
          invoice.pdf_attachment_info = {
            pdf_filename: invoice.declaration_pdf.filename,
            pdf_path: invoice.declaration_pdf.path,
            visma_invoice_id: response.data.Id,
            attachment_note: 'PDF available for manual attachment in Visma UI'
          };
        }
        
        created++;

      } catch (error: any) {
        const devMsg = error.response?.data?.DeveloperErrorMessage || error.response?.data?.Message || error.message;
        console.error(`❌ Failed to create invoice for ${invoice.mottaker}:`, error.response?.data || error.message);
        errors.push({ customer: invoice.mottaker, error: devMsg });
      }
    }

    return res.json({
      success: true,
      created: created,
      errors: errors,
      message: `Created ${created} invoices in Visma eAccounting`
    });

  } catch (error: any) {
    console.error('Failed to create invoices in Visma:', error);
    return res.status(500).json({
      error: 'Failed to create invoices in Visma: ' + error.message
    });
  }
});

app.post('/api/invoices/:id/send', (req, res) => {
  const invoiceId = parseInt(req.params.id);
  
  // In real app, this would send the invoice via Visma API
  console.log(`📧 Sending invoice ${invoiceId} via Visma...`);
  
  res.json({
    success: true,
    message: 'Invoice sent successfully',
    invoice_id: invoiceId
  });
});

// HTTPS callback handler - automatically exchange token and redirect
app.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    console.error('❌ OAuth error:', error);
    return res.redirect(`http://localhost:5173/setup?error=${encodeURIComponent(error as string)}`);
  }

  if (!code) {
    console.error('❌ Missing authorization code');
    return res.redirect('http://localhost:5173/setup?error=missing_code');
  }

  try {
    console.log('🔄 Exchanging authorization code for tokens...');
    
    // Exchange code for tokens automatically
    const tokenData = await exchangeCodeForTokens(code as string);
    
    // Store tokens
    global.vismaTokens = tokenData;
    
    console.log('✅ Token exchange successful! Redirecting to frontend...');
    
    // Redirect to frontend with success parameter
    res.redirect('http://localhost:5173/setup?auth=success');
    
  } catch (error) {
    console.error('❌ Token exchange failed:', error);
    res.redirect('http://localhost:5173/setup?error=token_exchange_failed');
  }
});

// New endpoint to get all articles from Visma
app.get('/api/articles', async (req: express.Request, res: express.Response) => {
  try {
    const tokens = getVismaTokens(req);

    if (!tokens || !tokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Visma. Please connect in Setup.' });
    }

    const response = await axios.get(`${VISMA_API_BASE_URL}/v2/articles`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    return res.json(response.data.Data || []);
  } catch (error: any) {
    console.error('❌ Failed to fetch articles:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// New endpoint to create dedicated transport service articles
app.post('/api/articles/create-transport-articles', async (req: express.Request, res: express.Response) => {
  try {
    const tokens = getVismaTokens(req);
    if (!tokens || !tokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Visma' });
    }

    const headers = {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json'
    };

    // Get default unit, coding, and determine next article number
    let defaultUnitId = null;
    let defaultCodingId = null;
    let nextArticleNumber = 1000;
    
    try {
      // Get units
      const unitsResponse = await axios.get(`${VISMA_API_BASE_URL}/v2/units`, { headers });
      const units = unitsResponse.data?.Data ?? [];
      const suitableUnit = units.find((u: any) => ['stk', 'pcs', 'tim'].includes(u.Name?.toLowerCase())) || units[0];
      if (suitableUnit) {
        defaultUnitId = suitableUnit.Id;
        console.log(`📏 Using unit: ${suitableUnit.Name} (${defaultUnitId})`);
      }

      // Get existing articles to find a valid CodingId and determine next number
      console.log('🔍 Fetching existing articles to extract CodingId and determine next number...');
      const articlesResponse = await axios.get(`${VISMA_API_BASE_URL}/v2/articles`, { headers });
      const existingArticles = articlesResponse.data?.Data ?? [];
      console.log(`📋 Found ${existingArticles.length} existing articles`);
      
      // Use the correct CodingId for VAT exempt vs. standard VAT
      const highVatCoding = existingArticles.find((a: any) => a.Coding?.Name === 'Tjenester høy mva');
      
      if (highVatCoding) {
        defaultCodingId = highVatCoding.CodingId;
        console.log(`💰 Using high VAT coding: ${highVatCoding.Coding.Name} (${defaultCodingId})`);
      } else if (existingArticles.length > 0) {
        // Fallback to first article's coding
        defaultCodingId = existingArticles[0].CodingId;
        console.log(`💰 Using fallback coding from first article: ${defaultCodingId}`);
      }

      // Determine next article number
      const articleNumbers = existingArticles.map((a: any) => parseInt(a.Number)).filter((n: number) => !isNaN(n));
      if (articleNumbers.length > 0) {
        nextArticleNumber = Math.max(...articleNumbers) + 1;
      }
      console.log(`🔢 Next article number: ${nextArticleNumber}`);

    } catch (lookupError: any) {
      console.error('⚠️ Failed to lookup units/articles:', lookupError.response?.data || lookupError.message);
    }

    // Validate that we have all required data
    if (!defaultCodingId) {
      return res.status(500).json({ 
        success: false, 
        error: 'No valid coding found in Visma account. CodingId is required for article creation.'
      });
    }

    const createdArticles: any = { ok: null };

    // Create OK article
    const okPreset = global.presets?.find((p: any) => p.code === 'OK');
    if (okPreset) {
      const netPrice = okPreset.unit_price_cents / 100;
      const grossPrice = netPrice * 1.25; // Calculate gross price with 25% VAT

      const okArticleData = {
        Name: okPreset.article_name,
        Number: (nextArticleNumber++).toString(),
        NetPrice: netPrice,
        GrossPrice: grossPrice,
        VatRate: 25,
        IsActive: true,
        IsService: true,
        CodingId: defaultCodingId,
        ...(defaultUnitId && { UnitId: defaultUnitId })
      };

      const okResponse = await axios.post(`${VISMA_API_BASE_URL}/v2/articles`, okArticleData, { headers });
      createdArticles.ok = okResponse.data.Id;
      console.log(`✅ Created OK transport article: ${okPreset.article_name} (ID: ${okResponse.data.Id}, Number: ${okArticleData.Number})`);
    }

    return res.json({ success: true, created: createdArticles });
  } catch (error: any) {
    console.error('❌ Failed to create transport articles:', error.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to create transport articles' });
  }
});

// Clear local invoices from memory
app.delete('/api/invoices/clear-local', (req, res) => {
  try {
    const count = global.invoices.length;
    global.invoices = []; // Clear all local invoices
    
    console.log(`🗑️ Cleared ${count} local invoices from memory`);
    
    return res.json({
      success: true,
      message: `Cleared ${count} local invoices`,
      cleared: count
    });
  } catch (error: any) {
    console.error('❌ Error clearing local invoices:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Bulk delete draft invoices
app.delete('/api/visma/invoices/bulk-delete-drafts', async (req, res) => {
  try {
    const tokens = getVismaTokens(req);
    if (!tokens || !tokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Visma' });
    }

    const headers = {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json'
    };

    // Delete in batches: fetch first page, delete all, repeat until no more invoices
    // This works because after deleting, the next invoices become the new "first page"
    console.log('🗑️ Starting batch deletion process...');
    
    let deleted = 0;
    const errors: string[] = [];
    const pageSize = 50;
    let hasMoreInvoices = true;
    let batchNumber = 0;
    
    while (hasMoreInvoices) {
      batchNumber++;
      
      // Always fetch the first page (skip=0) since we're deleting as we go
      const draftsResponse = await axios.get(
        `${VISMA_API_BASE_URL}/v2/customerinvoicedrafts?$top=${pageSize}`, 
        { headers }
      );
      
      const drafts = draftsResponse.data?.Data || [];
      const totalRemaining = draftsResponse.data?.Meta?.TotalNumberOfResults || 0;
      
      if (drafts.length === 0) {
        console.log('🗑️ No more draft invoices found');
        hasMoreInvoices = false;
        break;
      }
      
      console.log(`🗑️ Batch ${batchNumber}: Fetched ${drafts.length} drafts (${totalRemaining} total remaining in Visma)`);
      
      // Delete all invoices in this batch
      for (const draft of drafts) {
        try {
          await axios.delete(`${VISMA_API_BASE_URL}/v2/customerinvoicedrafts/${draft.Id}`, { headers });
          deleted++;
        } catch (deleteError: any) {
          const statusCode = deleteError.response?.status;
          // Ignore 404 (already deleted) and 400 (might be already deleted or invalid state)
          if (statusCode === 404) {
            console.log(`⚠️ Invoice ${draft.Id} already deleted (404), skipping`);
            deleted++; // Count as successful since it's already gone
          } else if (statusCode === 400) {
            console.log(`⚠️ Invoice ${draft.Id} cannot be deleted (400), possibly already deleted`);
            // Don't count as error since it might already be deleted
          } else {
            const errorMsg = `Failed to delete ${draft.Id}: ${deleteError.response?.data?.Message || deleteError.message}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
          }
        }
      }
      
      console.log(`📊 Progress: ${deleted} total deleted so far`);
      
      // If we got fewer than requested, we're done
      if (drafts.length < pageSize) {
        hasMoreInvoices = false;
      }
    }

    console.log(`🗑️ Bulk delete completed: ${deleted} invoices deleted, ${errors.length} errors`);

    return res.json({ 
      success: true, 
      deleted, 
      total: deleted,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('❌ Error during bulk delete:', error.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete draft invoices' });
  }
});

// Get current article mapping status
app.get('/api/articles/mapping-status', async (req, res) => {
  try {
    let accessToken = null;
    
    // Try database first, fallback to in-memory tokens
    try {
      accessToken = await vismaAuth.getValidAccessToken();
    } catch (dbError) {
      // Database not available, use in-memory tokens
      console.log('📝 Database not available, using in-memory tokens for mapping status');
      if (global.vismaTokens && global.vismaTokens.access_token) {
        accessToken = global.vismaTokens.access_token;
      }
    }
    
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated with Visma' });
    }

    const apiBaseUrl = VISMA_API_BASE_URL;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    // Get all articles
    const articlesResponse = await axios.get(`${apiBaseUrl}/v2/articles`, { headers });
    const articles = articlesResponse.data?.Data || [];
    
    // Find transport service articles (contains "Norsk import" or "Transport service")
    const transportArticles = articles.filter((article: any) => 
      article.Name && (
        article.Name.includes('Norsk import') || 
        article.Name.includes('Transport service') ||
        article.Name.toLowerCase().includes('transport')
      )
    );
    
    // Sort by number to find the one with lowest number
    transportArticles.sort((a: any, b: any) => {
      const aNum = parseInt(a.Number) || 999999;
      const bNum = parseInt(b.Number) || 999999;
      return aNum - bNum;
    });
    
    const recommended = transportArticles[0];
    
    return res.json({
      success: true,
      transportArticles: transportArticles.map((a: any) => ({
        id: a.Id,
        number: a.Number,
        name: a.Name
      })),
      recommended: recommended ? {
        id: recommended.Id,
        number: recommended.Number,
        name: recommended.Name
      } : null
    });
    
  } catch (error: any) {
    console.error('❌ Error getting article mapping status:', error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.response?.data?.Message || error.message 
    });
  }
});

// Get terms of payment (duplicate endpoint - kept for backwards compatibility)
app.get('/api/visma/termsofpayments', async (req, res) => {
  try {
    const tokens = getVismaTokens(req);
    if (!tokens || !tokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Visma' });
    }
    const apiBaseUrl = VISMA_API_BASE_URL;
    const termsResp = await axios.get(`${apiBaseUrl}/v2/termsofpayments`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    return res.json({ items: termsResp.data?.Data ?? [] });
  } catch (error: any) {
    console.error('❌ Failed to get terms of payment:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to get terms of payment' });
  }
});



// Start HTTPS server for API (required for Visma OAuth)
try {
  const privateKey = fs.readFileSync('localhost.key', 'utf8');
  const certificate = fs.readFileSync('localhost.crt', 'utf8');
  const credentials = { key: privateKey, cert: certificate };

  const httpsServer = https.createServer(credentials, app);
  httpsServer.listen(PORT, () => {
    console.log(`🚀 Minimal API server running on HTTPS port ${PORT}`);
  });
} catch (error) {
  console.error('❌ Could not start HTTPS server, falling back to HTTP:', error);
  app.listen(PORT, () => {
    console.log(`🚀 Minimal API server running on HTTP port ${PORT}`);
  });
}

// Export the app for testing or serverless environments
export default app;