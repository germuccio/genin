// Database table types for Kysely
export interface Database {
  presets: PresetTable;
  customers: CustomerTable;
  imports: ImportTable;
  import_rows: ImportRowTable;
  invoices: InvoiceTable;
  visma_tokens: VismaTokenTable;
}

export interface PresetTable {
  id: number;
  code: string;
  name: string;
  unit_price_cents: number;
  currency: string;
  vat_code: string;
  created_at: Date;
}

export interface CustomerTable {
  id: number;
  name: string;
  visma_customer_id: string | null;
  created_at: Date;
}

export interface ImportTable {
  id: number;
  filename: string;
  checksum: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: Date;
}

export interface ImportRowTable {
  id: number;
  import_id: number;
  row_index: number | null;
  referanse: string | null;
  transportid: string | null;
  avsender: string | null;
  mottaker: string | null;
  sekvensnr: string | null;
  status_code: string | null;
  parsed_json: Record<string, any> | null;
  hash: string | null;
  processed: boolean;
  visma_invoice_id: string | null;
  created_at: Date;
}

export interface InvoiceTable {
  id: number;
  import_row_id: number;
  total_cents: number;
  currency: string;
  visma_invoice_id: string | null;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  created_at: Date;
}

export interface VismaTokenTable {
  id: number;
  company_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  created_at: Date;
}



