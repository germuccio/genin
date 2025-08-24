import 'dotenv/config';
import express from 'express';
import https from 'https';
import fs from 'fs';
import cors from 'cors';
import axios from 'axios';
import multer from 'multer';
// Import XLSX using dynamic import to avoid ES module issues
let XLSX: any;
import path from 'path';
import { createRequire } from 'module';

// Initialize XLSX with require (works better than ES import)
const require = createRequire(import.meta.url);
XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Add endpoint to clear data for testing
app.post('/api/debug/clear', (req, res) => {
  global.imports = [];
  global.invoices = [];
  console.log('🗑️ Cleared all imports and invoices');
  res.json({ success: true, message: 'Data cleared' });
});

// Configure multer for file uploads
const upload = multer({
  dest: './uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  // Remove file filter for now to debug
});

// Function to exchange authorization code for access tokens
async function exchangeCodeForTokens(code: string) {
  const clientId = 'aiautomationsandbox';
  const clientSecret = 'rR.ZqjR=;WIcQP9FgmIiqJSuaeMldq2wlR8PJIvvBtAQxo2h2RfLYgTO1INiEw2O';
  const redirectUri = 'https://localhost:44300/callback'; // Must match the auth URL redirect URI
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const response = await axios.post(
      'https://identity.vismaonline.com/connect/token',
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

// Simple auth URL endpoint
app.get('/api/auth/visma/url', (req, res) => {
  const state = Math.random().toString(36).substring(2, 15);
  
  // Use your actual Visma sandbox credentials
  const clientId = 'aiautomationsandbox';
  const redirectUri = 'https://localhost:44300/callback'; // Must match Visma registration
  const scope = 'ea:api ea:sales ea:purchase ea:accounting vls:api offline_access';
  
  const authUrl = `https://identity.vismaonline.com/connect/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}&prompt=select_account&acr_values=service:44643EB1-3F76-4C1C-A672-402AE8085934`;
  
  console.log('Generated auth URL:', authUrl);
  
  res.json({
    auth_url: authUrl,
    state,
  });
});

// Token exchange endpoint (what the frontend actually calls)
app.post('/api/auth/visma/callback', async (req, res) => {
  try {
    const { code, state } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Missing authorization code'
      });
    }

    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(code);
    
    // Store tokens (for now, just in memory - in real app, store in database)
    global.vismaTokens = tokenData;
    
    console.log('✅ Successfully exchanged code for tokens');
    
    res.json({
      success: true,
      company: tokenData.company_name || 'Connected Company',
      expires_at: tokenData.expires_at
    });
    
  } catch (error) {
    console.error('Token exchange failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to exchange authorization code for tokens'
    });
  }
});

// Connection status endpoint
app.get('/api/auth/visma/status', (req, res) => {
  const isConnected = !!(global.vismaTokens && global.vismaTokens.access_token);
  
  if (isConnected) {
    res.json({
      connected: true,
      company: global.vismaTokens?.company_name || 'Connected Company',
      expires_at: global.vismaTokens?.expires_at || null
    });
  } else {
    res.json({
      connected: false,
      company: null,
      expires_at: null
    });
  }
});

// Disconnect endpoint
app.delete('/api/auth/visma/disconnect', (req, res) => {
  global.vismaTokens = null;
  res.json({ success: true });
});




// Create a test invoice draft for PDF attachment testing
app.post('/api/visma/create-test-invoice', async (req, res) => {
  try {
    if (!global.vismaTokens?.access_token) {
      return res.status(401).json({ 
        error: 'Not authenticated with Visma. Please authenticate via /api/auth/visma/connect first.' 
      });
    }

    const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
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
    
    res.json({ 
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
    res.status(500).json({ 
      error: `Test invoice creation failed: ${errMsg}`,
      status,
      details: error.response?.data
    });
  }
});

// Direct invoice creation with PDF attachment (bypassing orders)
app.post('/api/visma/invoices/create-direct', async (req, res) => {
  try {
    const { import_id } = req.body;
    
    if (!global.vismaTokens?.access_token) {
      return res.status(401).json({ 
        error: 'Not authenticated with Visma. Please authenticate via /api/auth/visma/connect first.' 
      });
    }

    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
    const headers = { Authorization: `Bearer ${global.vismaTokens.access_token}`, 'Content-Type': 'application/json' };

    console.log(`🚀 Creating invoices directly for import ${import_id}...`);

    // Get invoices from the import
    const invoices = (global.invoices || []).filter((inv: any) => inv.import_id === import_id);
    
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
        
        if (!articleMapping || !articleMapping.ok || !articleMapping.man) {
          throw new Error(`Article mapping missing. Please provide articleMapping with 'ok' and 'man' article IDs.`);
        }
        
        const articleId = invoice.status_code === 'OK' ? articleMapping.ok : articleMapping.man;

        // Create invoice data
        const invoiceData = {
          CustomerId: customerId,
          InvoiceDate: new Date().toISOString().split('T')[0],
          DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          YourReference: invoice.your_reference || invoice.referanse,
          OurReference: invoice.referanse,
          Currency: invoice.currency || 'NOK',
          RotReducedInvoicingType: 0,
          EuThirdParty: false,
          Rows: [{
            IsTextRow: false,
            ArticleId: articleId,
            Description: `Transport service - ${invoice.referanse}`,
            Quantity: 1,
            UnitPrice: invoice.unit_price || 0,
            VatRate: invoice.currency === 'NOK' ? 25 : 0,
            LineNumber: 1,
            IsWorkCost: false,
            EligibleForReverseChargeOnVat: false,
            HideRow: false,
            ReversedConstructionServicesVatFree: false
          }]
        };

        // Create the customer invoice draft
        const invoiceResponse = await axios.post(`${apiBaseUrl}/v2/customerinvoicedrafts`, invoiceData, { headers });
        const invoiceId = invoiceResponse.data.Id;
        
        console.log(`✅ Created invoice draft: ${invoiceId}`);

        // Attach PDF if available
        if (invoice.declaration_pdf && invoice.declaration_pdf.path) {
          try {
            console.log(`📎 Attaching PDF ${invoice.declaration_pdf.filename} to invoice ${invoiceId}...`);
            
            const fs = require('fs');
            const FormData = require('form-data');
            const path = require('path');
            
            const pdfPath = path.resolve(invoice.declaration_pdf.path);
            const pdfBuffer = fs.readFileSync(pdfPath);
            
            const formData = new FormData();
            formData.append('file', pdfBuffer, {
              filename: invoice.declaration_pdf.filename,
              contentType: 'application/pdf'
            });
            formData.append('customerInvoiceDraftId', invoiceId);
            
            await axios.post(`${apiBaseUrl}/v2/salesdocumentattachments/customerinvoicedraft`, formData, {
              headers: {
                'Authorization': `Bearer ${global.vismaTokens.access_token}`,
                ...formData.getHeaders()
              }
            });
            
            console.log(`✅ PDF attachment successful for invoice ${invoiceId}`);
          } catch (attachError: any) {
            console.warn(`⚠️ PDF attachment failed for invoice ${invoiceId}: ${attachError.response?.data?.DeveloperErrorMessage || attachError.message}`);
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

    res.json({
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

    const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
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
    
    res.json({ 
      success: true, 
      invoiceId,
      results,
      message: `Tested PDF attachment endpoints for invoice ${invoiceId}` 
    });
  } catch (error: any) {
    const errMsg = error.response?.data?.DeveloperErrorMessage || error.response?.data?.Message || error.message;
    const status = error.response?.status;
    console.warn(`❌ Test failed for invoice ${req.params.invoiceId} (HTTP ${status}): ${errMsg}`);
    res.status(500).json({ 
      error: `Test failed: ${errMsg}`,
      status,
      invoiceId: req.params.invoiceId,
      details: error.response?.data
    });
  }
});

// Test single order conversion endpoint (bypasses auth for testing)

// Upload endpoints
app.post('/api/upload/files', upload.any(), async (req, res) => {
  try {
    console.log('📁 Upload request received');
    const files = (req.files as Express.Multer.File[]) || [];
    console.log('📂 Files received:', files.map(f => f.fieldname));
    
    // Accept either named fields (excel/pdf) or any() array uploads
    const excelFile = files.find(f => /\.xlsx$|\.xls$/i.test(f.originalname));
    const pdfFiles = files.filter(f => /\.pdf$/i.test(f.originalname));
    
    if (!excelFile) {
      console.log('❌ No Excel file found in upload');
      return res.status(400).json({ error: 'Excel file is required' });
    }

    if (!excelFile) {
      return res.status(400).json({
        error: 'Excel file is required'
      });
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

    res.json({
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
    res.status(500).json({
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
      name: 'Transport Service - Standard Processing',
      unit_price_cents: 25000, // 250 NOK
      currency: 'NOK',
      vat_code: '25',
      article_name: 'Transport Service - Standard Processing'
    },
    {
      id: 2,
      code: 'MAN',
      name: 'Transport Service - Manual Processing',
      unit_price_cents: 50000, // 500 NOK
      currency: 'NOK',
      vat_code: '25',
      article_name: 'Transport Service - Manual Processing'
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
  
  res.json(newPreset);
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
  
  res.json(global.presets[presetIndex]);
});

app.delete('/api/invoices/presets/:id', (req, res) => {
  const presetId = parseInt(req.params.id);
  const presetIndex = global.presets.findIndex(p => p.id === presetId);
  
  if (presetIndex === -1) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  
  const deletedPreset = global.presets.splice(presetIndex, 1)[0];
  console.log(`🗑️ Deleted preset: ${deletedPreset.code} - ${deletedPreset.name}`);
  
  res.json({ success: true, deleted: deletedPreset });
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
    const currency = row.Valuta || row.Currency || row.currency || 'NOK'; // Currency from Excel
    
    console.log(`🏷️  Status Code: ${statusCode}`);
    console.log(`📄 Sequence Number / PDF code: ${sekvensnr}`);
    console.log(`💱 Currency from Excel: ${currency}`);
    
    // Determine pricing based on status code and presets
    let totalCents = 10000; // Default 100 NOK
    let serviceDescription = 'Standard Service';
    
    // Find matching preset
    const preset = global.presets.find(p => p.code === statusCode);
    if (preset) {
      totalCents = preset.unit_price_cents;
      serviceDescription = preset.name;
      console.log(`💰 Using preset: ${preset.code} - ${preset.name} (${preset.unit_price_cents/100} ${preset.currency})`);
    } else {
      console.log(`⚠️ No preset found for status code: ${statusCode}, using default pricing`);
    }
    
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
      visma_invoice_id: null, // Will be set when created in Visma
      status: 'draft',
      created_at: new Date().toISOString(),
      
      // Business fields
      referanse: referanse, // Order/Transport Reference
      your_reference: yourReference,
      avsender: avsender, // Sender (your client's client)
      mottaker: mottaker, // Receiver (who gets invoiced)
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

    console.log(`✅ Created invoice: ${referanse} for ${mottaker} - ${totalCents/100} NOK (${statusCode} status)`);
    if (matchingPdf) {
      console.log(`   📎 With PDF: ${matchingPdf.originalName}`);
    }
    
    global.invoices.push(invoice);
    processed++;
  });

  console.log(`✅ Created ${processed} invoices from import ${import_id}`);

  res.json({
    success: true,
    processed: processed,
    import_id: import_id
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

    const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
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

    res.json({
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
    res.status(500).json({ 
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
    const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
    const termsResp = await axios.get(`${apiBaseUrl}/v2/termsofpayments`, {
      headers: {
        'Authorization': `Bearer ${global.vismaTokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    res.json({ items: termsResp.data?.Data ?? [] });
  } catch (error: any) {
    console.error('❌ Failed to load TermsOfPayments:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to load TermsOfPayments' });
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
    
    if (!articleMapping?.ok || !articleMapping?.man) {
      return res.status(400).json({ success: false, error: 'Article mapping is incomplete. Please configure it in Setup.' });
    }
    const okArticleId: string = articleMapping.ok;
    const manArticleId: string = articleMapping.man;
    
    console.log('📋 Using customer defaults:', customerDefaults);

    const draftInvoices = global.invoices.filter(inv => !inv.visma_invoice_id);
    console.log(`🔄 Creating ${draftInvoices.length} invoices in Visma...`);

    // Use the production API endpoint (sandbox credentials work with production API)
    const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
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
        const isOkStatus = invoice.status_code === 'OK';
        const articleId = isOkStatus ? okArticleId : manArticleId;
        const unitPrice = invoice.total_cents / 100; // Use actual calculated price
        const preset = global.presets.find(p => p.code === invoice.status_code) || global.presets.find(p => p.code === 'OK');
        const articleName = preset?.article_name || 'Transport Service';
        
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
          throw new Error(`Missing article ID for ${isOkStatus ? 'OK' : 'MAN'} status`);
        }

        const invoiceData = {
          CustomerId: customerId,
          InvoiceDate: new Date().toISOString().split('T')[0],
          DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
          // Map columns: C -> YourReference, A -> OurReference
          YourReference: (invoice.your_reference ?? '').toString() || invoice.referanse?.toString(),
          OurReference: invoice.referanse?.toString(),
          Currency: invoice.currency, // Use customer's currency directly from invoice object
          RotReducedInvoicingType: 0, // Set to 0 for None
          EuThirdParty: false, // --- FIX: Force EuThirdParty to false to avoid automatic account switching
          Rows: [
            {
              IsTextRow: false, // Use article row to show pricing
              ArticleId: articleId, // Include ArticleId for proper pricing
              Description: `${articleName} - Ref: ${invoice.referanse}`,
              Quantity: 1,
              UnitPrice: unitPrice, // Use UnitPrice instead of Price
              VatRate: invoice.currency === 'NOK' ? 25 : 0, // --- FIX: Manually set VAT rate based on currency
              ...(defaultUnitId && { UnitId: defaultUnitId }),
              ...(defaultCodingId && { CodingId: defaultCodingId }),
              ReversedConstructionServicesVatFree: false
            }
          ]
        };

        console.log(`📝 Creating invoice for ${invoice.mottaker}: ${JSON.stringify(invoiceData)}`);
        
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

    res.json({
      success: true,
      created: created,
      errors: errors,
      message: `Created ${created} invoices in Visma eAccounting`
    });

  } catch (error: any) {
    console.error('Failed to create invoices in Visma:', error);
    res.status(500).json({
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
app.get('/api/articles', async (req, res) => {
  if (!global.vismaTokens || !global.vismaTokens.access_token) {
    return res.status(401).json({ error: 'Not authenticated with Visma' });
  }

  try {
    const apiBaseUrl = 'https://eaccountingapi.vismaonline.com'; // Use production for articles
    const response = await axios.get(`${apiBaseUrl}/v2/articles`, {
      headers: {
        'Authorization': `Bearer ${global.vismaTokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data.Data);
  } catch (error: any) {
    console.error('❌ Failed to fetch articles:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// New endpoint to create dedicated transport service articles
app.post('/api/articles/create-transport-articles', async (req, res) => {
  if (!global.vismaTokens || !global.vismaTokens.access_token) {
    return res.status(401).json({ error: 'Not authenticated with Visma' });
  }

  try {
    const apiBaseUrl = 'https://eaccountingapi.vismaonline.com';
    const headers = {
      'Authorization': `Bearer ${global.vismaTokens.access_token}`,
      'Content-Type': 'application/json'
    };

    // Get default unit, coding, and determine next article number
    let defaultUnitId = null;
    let defaultCodingId = null;
    let nextArticleNumber = 1000;
    
    try {
      // Get units
      const unitsResponse = await axios.get(`${apiBaseUrl}/v2/units`, { headers });
      const units = unitsResponse.data?.Data ?? [];
      const suitableUnit = units.find((u: any) => ['stk', 'pcs', 'tim'].includes(u.Name?.toLowerCase())) || units[0];
      if (suitableUnit) {
        defaultUnitId = suitableUnit.Id;
        console.log(`📏 Using unit: ${suitableUnit.Name} (${defaultUnitId})`);
      }

      // Get existing articles to find a valid CodingId and determine next number
      console.log('🔍 Fetching existing articles to extract CodingId and determine next number...');
      const articlesResponse = await axios.get(`${apiBaseUrl}/v2/articles`, { headers });
      const existingArticles = articlesResponse.data?.Data ?? [];
      console.log(`📋 Found ${existingArticles.length} existing articles`);
      
      // --- FIX START: Use the correct CodingId for VAT exempt vs. standard VAT ---
      const highVatCoding = existingArticles.find((a: any) => a.Coding?.Name === 'Tjenester høy mva');
      const exemptVatCoding = existingArticles.find((a: any) => a.Coding?.Name === 'Tjenester mva fritt, innenfor avgiftsområdet');

      if (highVatCoding) {
        defaultCodingId = highVatCoding.CodingId;
        console.log(`📊 Found standard VAT CodingId: ${defaultCodingId}`);
      } else {
        // Fallback if not found (less reliable)
        const articlesWithCoding = existingArticles.filter((a: any) => a.CodingId);
        if (articlesWithCoding.length > 0) {
          defaultCodingId = articlesWithCoding[0].CodingId;
          console.log(`📊 Using fallback CodingId from existing article: ${defaultCodingId}`);
        } else {
          throw new Error('No existing articles found with CodingId.');
        }
      }
      
      let exemptCodingId = null;
      if (exemptVatCoding) {
        exemptCodingId = exemptVatCoding.CodingId;
        console.log(`📊 Found exempt VAT CodingId: ${exemptCodingId}`);
      } else {
        console.warn('⚠️ Could not find a specific VAT-exempt coding, EU orders may fail.');
        exemptCodingId = defaultCodingId; // Fallback to standard
      }
      // --- FIX END ---
      
      const existingNumbers = existingArticles
        .map((a: any) => parseInt(a.Number))
        .filter((n: number) => !isNaN(n))
        .sort((a: number, b: number) => b - a);
      
      if (existingNumbers.length > 0) {
        nextArticleNumber = Math.max(existingNumbers[0] + 1, 1000);
      }
      console.log(`🔢 Next article number: ${nextArticleNumber}`);

    } catch (lookupError: any) {
      console.error('❌ Failed to fetch required data for article creation:', lookupError.response?.data || lookupError.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch required data from Visma. Cannot create articles without proper codings and units.',
        details: lookupError.response?.data?.DeveloperErrorMessage || lookupError.message
      });
    }

    // Validate that we have all required data
    if (!defaultCodingId) {
      return res.status(500).json({ 
        success: false, 
        error: 'No valid coding found in Visma account. CodingId is required for article creation.'
      });
    }

    const createdArticles = { ok: null, man: null };

    // Create OK article
    const okPreset = global.presets.find(p => p.code === 'OK');
    if (okPreset) {
      const netPrice = okPreset.unit_price_cents / 100;
      const grossPrice = netPrice * 1.25; // Calculate gross price with 25% VAT

      const okArticleData = {
        Name: okPreset.article_name,
        Number: (nextArticleNumber++).toString(),
        NetPrice: netPrice,
        GrossPrice: grossPrice, // Include GrossPrice
        VatRate: 25,
        IsActive: true,
        IsService: true,
        CodingId: defaultCodingId, // Required field
        ...(defaultUnitId && { UnitId: defaultUnitId })
      };

      const okResponse = await axios.post(`${apiBaseUrl}/v2/articles`, okArticleData, { headers });
      createdArticles.ok = okResponse.data.Id;
      console.log(`✅ Created OK transport article: ${okPreset.article_name} (ID: ${okResponse.data.Id}, Number: ${okArticleData.Number})`);
    }

    // Create MAN article
    const manPreset = global.presets.find(p => p.code === 'MAN');
    if (manPreset) {
      const netPrice = manPreset.unit_price_cents / 100;
      const grossPrice = netPrice * 1.25; // Calculate gross price with 25% VAT

      const manArticleData = {
        Name: manPreset.article_name,
        Number: (nextArticleNumber++).toString(),
        NetPrice: netPrice,
        GrossPrice: grossPrice, // Include GrossPrice
        VatRate: 25,
        IsActive: true,
        IsService: true,
        CodingId: defaultCodingId, // Use standard coding for MAN article as well
        ...(defaultUnitId && { UnitId: defaultUnitId })
      };

      const manResponse = await axios.post(`${apiBaseUrl}/v2/articles`, manArticleData, { headers });
      createdArticles.man = manResponse.data.Id;
      console.log(`✅ Created MAN transport article: ${manPreset.article_name} (ID: ${manResponse.data.Id}, Number: ${manArticleData.Number})`);
    }

    res.json({
      success: true,
      articles: createdArticles,
      message: 'Transport service articles created successfully'
    });

  } catch (error: any) {
    console.error('❌ Failed to create transport articles:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to create transport articles',
      details: error.response?.data?.DeveloperErrorMessage || error.message
    });
  }
});

// Start HTTP server for API
app.listen(PORT, () => {
  console.log(`🚀 Minimal API server running on port ${PORT}`);
  console.log(`📚 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Frontend should now be able to connect!`);
});

// Load the generated SSL certificate
let httpsOptions;
try {
  httpsOptions = {
    key: fs.readFileSync('localhost.key'),
    cert: fs.readFileSync('localhost.crt')
  };
} catch (error) {
  console.error('Could not load SSL certificates:', error);
}

// Start HTTPS callback server on port 44300
if (httpsOptions) {
  https.createServer(httpsOptions, app).listen(44300, () => {
    console.log(`🔒 HTTPS Callback server running on https://localhost:44300`);
    console.log(`📍 Callback URL: https://localhost:44300/callback`);
    console.log(`⚠️  Safari users: You'll need to accept the self-signed certificate`);
    console.log(`💡 In Safari: Advanced → Proceed to localhost (unsafe)`);
    console.log(`🔧 To accept certificate: Visit https://localhost:44300/callback manually first`);
  });
} else {
  console.log('⚠️  No SSL certificates found, falling back to HTTP...');
  // Fallback to HTTP
  app.listen(44300, () => {
    console.log(`⚠️  HTTP Callback server running on http://localhost:44300`);
    console.log(`❌ This may not work with Visma - HTTPS required`);
  });
}