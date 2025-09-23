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
  partNumber?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  tax: number;
}

export interface Invoice {
  id?: string;
  invoiceNumber: string;
  customerPoNumber?: string;
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
  pageNumbers?: number[]; // Pages this invoice appears on (for multi-page invoices)
  status: 'extracted' | 'synced';
  extractedAt?: string;
  syncedAt?: string;
  batchId?: string;
  taskId?: string; // Task identifier for tracking
  pdfBase64?: string; // Individual invoice PDF
}

export interface OdooRecord {
  id: string;
  move_type: 'in_invoice';
  partner_id: string;
  invoice_date: string;
  invoice_date_due: string;
  ref: string;
  customer_po?: string;
  invoice_line_ids: Array<{
    name: string;
    product_ref?: string;
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
  taskId?: string; // Task identifier for tracking
}

export interface Batch {
  id: string;
  invoiceIds: string[];
  totalAmount: number;
  createdAt: string;
}

export type PipelineStep = 'upload' | 'ocr' | 'processing' | 'ready';
export type PipelineStatus = 'idle' | 'active' | 'completed' | 'error';

export interface OdooPayload {
  taskId: string;
  timestamp: string;
  invoices: Array<{
    // Core invoice data
    vendor_name: string; // Maps to partner_id in Odoo
    invoice_date: string;
    invoice_number: string;
    customer_po_number?: string;

    // Line items with MPN mapping
    order_lines: Array<{
      description: string;
      mpn: string; // Maps to MPN field in Odoo product data
      quantity: number;
      unit_price: number;
      amount: number;
    }>;

    // PDF attachment
    pdf_base64: string; // Single invoice PDF (split if needed)

    // Totals
    subtotal: number;
    tax_amount: number;
    total: number;
  }>;
}

// Exact structure expected by Odoo's bill creation API
export interface OdooBillPayload {
  invoices: Array<{
    // Main invoice fields (capitalized as per Odoo)
    "Invoice-No": string;
    "Invoice-Date": string;
    "Customer PO Number": string;
    "Customer": string;
    "Customer No"?: string;
    "Payment Terms": string;
    "Subtotal": string;
    "Tax Amount": string;
    "Total Amount": string;
    "invoice-or-credit": "INVOICE" | "CREDIT";

    // Optional fields Odoo expects
    "Carrier"?: string;
    "Column"?: string;
    "Customer Order Date"?: string;
    "Date Shipped"?: string;
    "Footer Section"?: string;
    "Freight"?: string;
    "Header Section"?: string;
    "Incoterms"?: string;
    "Inv Seq"?: string;
    "Landing No"?: string;
    "Line"?: string;
    "Line Section"?: string;
    "Page No"?: string;
    "Sales Order No"?: string;

    // Line items
    lines: Array<{
      product_code: string;  // Maps from partNumber/MPN
      description: string;
      quantity: number;
      unit_price: number;
      discount: number;
      taxes: any[];
      subtotal: number;
    }>;

    // Attachments with URL format
    attachments: Array<{
      filename: string;
      url: string;  // URL path to retrieve PDF
    }>;
  }>;
}