-- Initial database schema for invoice processing system
-- Run this migration to set up all required tables

-- Presets table for service pricing
CREATE TABLE presets (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  unit_price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'NOK',
  vat_code text NOT NULL DEFAULT '25',
  created_at timestamptz DEFAULT now()
);

-- Customers table for caching Visma customers
CREATE TABLE customers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  visma_customer_id text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Imports table for tracking uploaded files
CREATE TABLE imports (
  id serial PRIMARY KEY,
  filename text NOT NULL,
  checksum text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT imports_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Import rows table for parsed Excel data
CREATE TABLE import_rows (
  id serial PRIMARY KEY,
  import_id integer REFERENCES imports(id) ON DELETE CASCADE,
  row_index integer,
  referanse text,
  transportid text,
  avsender text,
  mottaker text,
  sekvensnr text,
  status_code text,
  parsed_json jsonb,
  hash text UNIQUE,
  processed boolean DEFAULT false,
  visma_invoice_id text,
  created_at timestamptz DEFAULT now()
);

-- Invoices table for tracking created invoices
CREATE TABLE invoices (
  id serial PRIMARY KEY,
  import_row_id integer REFERENCES import_rows(id) ON DELETE CASCADE,
  total_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'NOK',
  visma_invoice_id text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'sent', 'paid', 'cancelled'))
);

-- Visma tokens table for OAuth token storage
CREATE TABLE visma_tokens (
  id serial PRIMARY KEY,
  company_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_import_rows_import_id ON import_rows(import_id);
CREATE INDEX idx_import_rows_hash ON import_rows(hash);
CREATE INDEX idx_import_rows_processed ON import_rows(processed);
CREATE INDEX idx_invoices_import_row_id ON invoices(import_row_id);
CREATE INDEX idx_invoices_visma_invoice_id ON invoices(visma_invoice_id);
CREATE INDEX idx_customers_visma_customer_id ON customers(visma_customer_id);
CREATE INDEX idx_presets_code ON presets(code);

-- Insert some sample presets
INSERT INTO presets (code, name, unit_price_cents, currency, vat_code) VALUES
('TRANSPORT_OK', 'Standard Transport Service', 50000, 'NOK', '25'),
('TRANSPORT_MAN', 'Manual Transport Service', 75000, 'NOK', '25'),
('TRANSPORT_OTHER', 'Other Transport Service', 100000, 'NOK', '25');

-- Add comments for documentation
COMMENT ON TABLE presets IS 'Service presets for different status codes';
COMMENT ON TABLE customers IS 'Local cache of Visma customers';
COMMENT ON TABLE imports IS 'Metadata for uploaded Excel/PDF files';
COMMENT ON TABLE import_rows IS 'Individual rows parsed from Excel files';
COMMENT ON TABLE invoices IS 'Generated invoices linked to import rows';
COMMENT ON TABLE visma_tokens IS 'OAuth tokens for Visma API access';



