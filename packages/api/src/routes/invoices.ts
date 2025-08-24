import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { PricingService } from '../services/pricing-service.js';
import { VismaApiService } from '../services/visma-api.js';
import { ExcelParserService } from '../services/excel-parser.js';
import { db } from '../db/database.js';
import { z } from 'zod';

// Temporary inline schema until we fix the shared import
const ProcessImportRequestSchema = z.object({
  import_id: z.number(),
  preset_code: z.string().optional()
});

const router = Router();
const pricingService = new PricingService();
const vismaApi = new VismaApiService();
const excelParser = new ExcelParserService();

/**
 * POST /invoices/process-import
 * Process import rows and create invoices
 */
router.post('/process-import', asyncHandler(async (req, res) => {
  const { import_id, preset_code } = ProcessImportRequestSchema.parse(req.body);
  
  // Get unprocessed rows
  const rows = await excelParser.getUnprocessedRows(import_id);
  
  if (rows.length === 0) {
    return res.json({
      message: 'No unprocessed rows found',
      processed: 0,
      errors: [],
    });
  }

  const errors: string[] = [];
  let processed = 0;

  for (const row of rows) {
    try {
      // Calculate pricing
      const pricing = await pricingService.calculatePricing(
        row.status_code || 'OTHER',
        1,
        preset_code
      );

      // Create customer name from available data
      const customerName = row.mottaker || row.avsender || `Customer ${row.referanse}`;
      
      // Find or create customer in Visma
      const customer = await vismaApi.findOrCreateCustomer(customerName);

      // Create invoice line items
      const lineItems = [{
        description: `Transport service - ${row.referanse}`,
        quantity: 1,
        unitPrice: pricing.unitPriceCents / 100, // Convert to currency units
        vatPercent: pricing.vatPercent,
      }];

      // Create draft invoice in Visma
      const invoice = await vismaApi.createDraftInvoice({
        customerNumber: customer.id,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
        currency: pricing.currency,
        rows: lineItems,
      });

      // Store invoice in local database
      await db
        .insertInto('invoices')
        .values({
          import_row_id: row.id,
          total_cents: pricing.totalCents,
          currency: pricing.currency,
          visma_invoice_id: invoice.id,
          status: 'draft',
        })
        .execute();

      // Mark row as processed
      await db
        .updateTable('import_rows')
        .set({
          processed: true,
          visma_invoice_id: invoice.id,
        })
        .where('id', '=', row.id)
        .execute();

      processed++;
    } catch (error) {
      const errorMessage = `Row ${row.row_index}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMessage);
      console.error(errorMessage);
    }
  }

  res.json({
    message: `Processed ${processed} out of ${rows.length} rows`,
    processed,
    total: rows.length,
    errors,
  });
}));

/**
 * GET /invoices
 * Get all invoices
 */
router.get('/', asyncHandler(async (req, res) => {
  const invoices = await db
    .selectFrom('invoices')
    .leftJoin('import_rows', 'invoices.import_row_id', 'import_rows.id')
    .leftJoin('imports', 'import_rows.import_id', 'imports.id')
    .select([
      'invoices.id',
      'invoices.total_cents',
      'invoices.currency',
      'invoices.visma_invoice_id',
      'invoices.status',
      'invoices.created_at',
      'import_rows.referanse',
      'import_rows.mottaker',
      'imports.filename',
    ])
    .orderBy('invoices.created_at', 'desc')
    .execute();

  res.json(invoices);
}));

/**
 * GET /invoices/:id
 * Get invoice details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.id);
  
  if (isNaN(invoiceId)) {
    return res.status(400).json({
      error: 'Invalid invoice ID',
    });
  }

  const invoice = await db
    .selectFrom('invoices')
    .leftJoin('import_rows', 'invoices.import_row_id', 'import_rows.id')
    .leftJoin('imports', 'import_rows.import_id', 'imports.id')
    .selectAll()
    .where('invoices.id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    return res.status(404).json({
      error: 'Invoice not found',
    });
  }

  // Get Visma invoice details if available
  let vismaInvoice = null;
  if (invoice.visma_invoice_id) {
    try {
      vismaInvoice = await vismaApi.getInvoice(invoice.visma_invoice_id);
    } catch (error) {
      console.warn('Failed to fetch Visma invoice details:', error);
    }
  }

  res.json({
    ...invoice,
    visma_details: vismaInvoice,
  });
}));

/**
 * POST /invoices/:id/send
 * Send invoice via Visma
 */
router.post('/:id/send', asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.id);
  
  if (isNaN(invoiceId)) {
    return res.status(400).json({
      error: 'Invalid invoice ID',
    });
  }

  const invoice = await db
    .selectFrom('invoices')
    .select(['visma_invoice_id'])
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice || !invoice.visma_invoice_id) {
    return res.status(404).json({
      error: 'Invoice not found or not in Visma',
    });
  }

  try {
    await vismaApi.sendInvoice(invoice.visma_invoice_id);
    
    // Update local status
    await db
      .updateTable('invoices')
      .set({ status: 'sent' })
      .where('id', '=', invoiceId)
      .execute();

    res.json({
      success: true,
      message: 'Invoice sent successfully',
    });
  } catch (error) {
    console.error('Failed to send invoice:', error);
    res.status(500).json({
      error: 'Failed to send invoice',
    });
  }
}));

/**
 * GET /invoices/presets
 * Get available pricing presets
 */
router.get('/presets', asyncHandler(async (req, res) => {
  const presets = await pricingService.getAllPresets();
  res.json(presets);
}));

export default router;

