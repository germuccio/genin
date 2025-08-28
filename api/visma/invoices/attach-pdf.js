const axios = require('axios');
const fs = require('fs');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { invoiceId, pdfData } = req.body;

    if (!invoiceId || !pdfData) {
      return res.status(400).json({ error: 'Missing invoiceId or pdfData' });
    }

    // Get Visma tokens from cookie
    const cookies = req.headers.cookie;
    if (!cookies) {
      return res.status(401).json({ error: 'No authentication cookies found' });
    }

    // Parse cookies to get tokens
    const tokenCookie = cookies.split(';').find(c => c.trim().startsWith('visma_tokens='));
    if (!tokenCookie) {
      return res.status(401).json({ error: 'Visma tokens not found in cookies' });
    }

    const tokens = JSON.parse(decodeURIComponent(tokenCookie.split('=')[1]));
    if (!tokens.access_token) {
      return res.status(401).json({ error: 'Invalid Visma access token' });
    }

    // Resolve API base URL
    const apiBaseUrl = process.env.VISMA_API_BASE_URL || 'https://eaccountingapi.vismaonline.com';

    // Prepare PDF attachment data
    const attachmentData = {
      DockumentId: invoiceId, // Note: Visma uses "DockumentId" not "DocumentId"
      DocumentType: 'CustomerInvoiceDraft',
      FileName: pdfData.filename || 'document.pdf',
      ContentType: 'application/pdf',
      Data: pdfData.content // Base64 encoded PDF content
    };

    console.log(`📎 Attaching PDF ${pdfData.filename} to invoice ${invoiceId}...`);

    // Send PDF attachment to Visma
    const response = await axios.post(
      `${apiBaseUrl}/v2/salesdocumentattachments`,
      attachmentData,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ PDF attachment successful for invoice ${invoiceId}`);
    
    return res.json({
      success: true,
      message: 'PDF attached successfully',
      attachmentId: response.data.Id
    });

  } catch (error) {
    console.error('❌ PDF attachment failed:', error.response?.data || error.message);
    
    return res.status(500).json({
      error: 'Failed to attach PDF',
      details: error.response?.data || error.message
    });
  }
};
