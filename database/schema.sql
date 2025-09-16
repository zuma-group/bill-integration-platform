-- Database schema for Bill Integration Platform
-- PostgreSQL schema for invoice OCR to Odoo pipeline

-- Vendors table
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  tax_id VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices table
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(255) NOT NULL,
  customer_po_number VARCHAR(255),
  invoice_date DATE NOT NULL,
  due_date DATE,
  currency VARCHAR(10) DEFAULT 'USD',
  payment_terms VARCHAR(255),
  page_number INTEGER DEFAULT 1,
  subtotal DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total DECIMAL(15, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'extracted',
  vendor_id UUID REFERENCES vendors(id),
  customer_id UUID REFERENCES customers(id),
  batch_id UUID,
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Line items table
CREATE TABLE line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  part_number VARCHAR(255),
  quantity DECIMAL(15, 3) NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  tax DECIMAL(15, 2) DEFAULT 0,
  position INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Odoo sync records table
CREATE TABLE odoo_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id),
  odoo_id VARCHAR(255),
  move_type VARCHAR(50) DEFAULT 'in_invoice',
  partner_id VARCHAR(255),
  customer_po VARCHAR(255),
  invoice_date DATE,
  invoice_date_due DATE,
  ref VARCHAR(255),
  amount_total DECIMAL(15, 2),
  state VARCHAR(50) DEFAULT 'draft',
  sync_status VARCHAR(50) DEFAULT 'pending',
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Batches table for multi-invoice documents
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_amount DECIMAL(15, 2) NOT NULL,
  invoice_count INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_customer_po_number ON invoices(customer_po_number);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_batch_id ON invoices(batch_id);
CREATE INDEX idx_invoices_vendor_id ON invoices(vendor_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_line_items_invoice_id ON line_items(invoice_id);
CREATE INDEX idx_line_items_part_number ON line_items(part_number);
CREATE INDEX idx_odoo_records_invoice_id ON odoo_records(invoice_id);
CREATE INDEX idx_odoo_records_sync_status ON odoo_records(sync_status);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_line_items_updated_at BEFORE UPDATE ON line_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_odoo_records_updated_at BEFORE UPDATE ON odoo_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();