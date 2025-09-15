export interface Vendor {
  name: string;
  address: string;
  taxId: string;
  email: string;
  phone: string;
}

export interface Customer {
  name: string;
  address: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  tax: number;
}

export interface Invoice {
  id?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  vendor: Vendor;
  customer: Customer;
  lineItems: LineItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  paymentTerms: string;
  pageNumber?: number;
  status: 'extracted' | 'synced';
  extractedAt?: string;
  syncedAt?: string;
  batchId?: string;
}

export interface OdooRecord {
  id: string;
  move_type: 'in_invoice';
  partner_id: string;
  invoice_date: string;
  invoice_date_due: string;
  ref: string;
  invoice_line_ids: Array<{
    name: string;
    quantity: number;
    price_unit: number;
    price_subtotal: number;
    tax_amount: number;
  }>;
  amount_total: number;
  state: 'draft' | 'posted' | 'cancel';
  created_at: string;
}

export interface OCRResponse {
  documentType: 'single' | 'multiple';
  invoiceCount: number;
  invoices: Invoice[];
}

export interface Batch {
  id: string;
  invoiceIds: string[];
  totalAmount: number;
  createdAt: string;
}

export type PipelineStep = 'upload' | 'ocr' | 'processing' | 'ready';
export type PipelineStatus = 'idle' | 'active' | 'completed' | 'error';