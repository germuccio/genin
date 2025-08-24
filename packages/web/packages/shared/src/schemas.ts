import { z } from 'zod';

// Excel row schema for parsing uploaded files
export const ExcelRowSchema = z.object({
  referanse: z.string().min(1),
  transportid: z.string().optional(),
  avsender: z.string().optional(),
  mottaker: z.string().optional(),
  sekvensnr: z.string().min(1),
  status_code: z.enum(['OK','MAN','OTHER']).or(z.string()), // adapt as needed
  total_br_vket: z.preprocess((v) => typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v, z.number().optional()),
  currency: z.string().optional(),
  // add other columns as needed
});

// Database table schemas
export const PresetSchema = z.object({
  id: z.number().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  unit_price_cents: z.number().int().positive(),
  currency: z.string().min(1),
  vat_code: z.string().min(1),
  created_at: z.date().optional()
});

export const CustomerSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  visma_customer_id: z.string().optional(),
  created_at: z.date().optional()
});

export const ImportSchema = z.object({
  id: z.number().optional(),
  filename: z.string().min(1),
  checksum: z.string().min(1),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  created_at: z.date().optional()
});

export const ImportRowSchema = z.object({
  id: z.number().optional(),
  import_id: z.number(),
  row_index: z.number().optional(),
  referanse: z.string().optional(),
  transportid: z.string().optional(),
  avsender: z.string().optional(),
  mottaker: z.string().optional(),
  sekvensnr: z.string().optional(),
  status_code: z.string().optional(),
  parsed_json: z.record(z.any()).optional(), // jsonb field
  hash: z.string().optional(),
  processed: z.boolean().default(false),
  visma_invoice_id: z.string().optional(),
  created_at: z.date().optional()
});

export const InvoiceSchema = z.object({
  id: z.number().optional(),
  import_row_id: z.number(),
  total_cents: z.number().int(),
  currency: z.string().min(1),
  visma_invoice_id: z.string().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'cancelled']),
  created_at: z.date().optional()
});

export const VismaTokenSchema = z.object({
  id: z.number().optional(),
  company_name: z.string().optional(),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.date(),
  created_at: z.date().optional()
});

// API request/response schemas
export const FileUploadResponseSchema = z.object({
  import_id: z.number(),
  filename: z.string(),
  status: z.string(),
  total_rows: z.number()
});

export const ProcessImportRequestSchema = z.object({
  import_id: z.number(),
  preset_code: z.string().optional()
});

export const VismaAuthUrlResponseSchema = z.object({
  auth_url: z.string().url()
});

export const VismaCallbackRequestSchema = z.object({
  code: z.string().min(1),
  state: z.string().optional()
});

// Type exports
export type ExcelRow = z.infer<typeof ExcelRowSchema>;
export type Preset = z.infer<typeof PresetSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type Import = z.infer<typeof ImportSchema>;
export type ImportRow = z.infer<typeof ImportRowSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type VismaToken = z.infer<typeof VismaTokenSchema>;
export type FileUploadResponse = z.infer<typeof FileUploadResponseSchema>;
export type ProcessImportRequest = z.infer<typeof ProcessImportRequestSchema>;
export type VismaAuthUrlResponse = z.infer<typeof VismaAuthUrlResponseSchema>;
export type VismaCallbackRequest = z.infer<typeof VismaCallbackRequestSchema>;