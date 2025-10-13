-- Minimal PostgreSQL schema aligned with API payloads and S3-based attachments

-- Invoices table
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(255) NOT NULL,
  customer_po_number VARCHAR(255),
  invoice_date DATE NOT NULL,
  due_date DATE,
  vendor JSONB NOT NULL,        -- { name, address, taxId, email, phone }
  customer JSONB NOT NULL,      -- { name, address }
  subtotal NUMERIC(15, 2) NOT NULL,
  tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total NUMERIC(15, 2) NOT NULL,
  tax_type VARCHAR(64),
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  payment_terms VARCHAR(255),
  page_number INTEGER,
  page_numbers INTEGER[],
  status VARCHAR(32) NOT NULL DEFAULT 'EXTRACTED',
  extracted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  task_id VARCHAR(64),
  batch_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Line items table
CREATE TABLE line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  part_number VARCHAR(255),
  quantity NUMERIC(15, 3) NOT NULL,
  unit_price NUMERIC(15, 2) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  tax NUMERIC(15, 2) NOT NULL DEFAULT 0,
  position INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Attachments table (S3 URLs)
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,              -- S3 object URL
  mime_type VARCHAR(128),
  size_kb INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Batches table (optional grouping)
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_amount NUMERIC(15, 2),
  invoice_count INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_batch_id ON invoices(batch_id);
CREATE INDEX idx_line_items_invoice_id ON line_items(invoice_id);
CREATE INDEX idx_line_items_part_number ON line_items(part_number);
CREATE INDEX idx_attachments_invoice_id ON attachments(invoice_id);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_line_items_updated_at BEFORE UPDATE ON line_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attachments_updated_at BEFORE UPDATE ON attachments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();