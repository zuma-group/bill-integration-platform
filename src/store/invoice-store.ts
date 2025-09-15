import { create } from 'zustand';
import { Invoice, OdooRecord, Batch, PipelineStep, PipelineStatus } from '@/types';
import { storage } from '@/lib/storage';

interface InvoiceStore {
  // State
  invoices: Invoice[];
  odooRecords: OdooRecord[];
  batches: Batch[];
  currentBatch: Invoice[] | null;
  selectedInvoiceIds: Set<string>;
  pipelineSteps: Record<PipelineStep, { status: PipelineStatus; message: string }>;
  isProcessing: boolean;
  error: string | null;

  // Actions
  loadData: () => void;
  setInvoices: (invoices: Invoice[]) => void;
  addInvoice: (invoice: Invoice) => void;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;

  setOdooRecords: (records: OdooRecord[]) => void;
  addOdooRecord: (record: OdooRecord) => void;
  deleteOdooRecord: (id: string) => void;

  setCurrentBatch: (invoices: Invoice[] | null) => void;
  toggleInvoiceSelection: (id: string) => void;
  selectAllInvoices: () => void;
  deselectAllInvoices: () => void;

  updatePipelineStep: (step: PipelineStep, status: PipelineStatus, message: string) => void;
  resetPipeline: () => void;

  setProcessing: (isProcessing: boolean) => void;
  setError: (error: string | null) => void;

  syncToOdoo: (invoiceIds: string[]) => void;
}

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  // Initial state
  invoices: [],
  odooRecords: [],
  batches: [],
  currentBatch: null,
  selectedInvoiceIds: new Set(),
  pipelineSteps: {
    upload: { status: 'idle', message: 'Ready' },
    ocr: { status: 'idle', message: 'Waiting' },
    processing: { status: 'idle', message: 'Waiting' },
    ready: { status: 'idle', message: 'Waiting' },
  },
  isProcessing: false,
  error: null,

  // Load data from localStorage
  loadData: () => {
    const invoices = storage.get('invoices') || [];
    const odooRecords = storage.get('odooRecords') || [];
    const batches = storage.get('batches') || [];
    set({ invoices, odooRecords, batches });
  },

  // Invoice actions
  setInvoices: (invoices) => {
    storage.set('invoices', invoices);
    set({ invoices });
  },

  addInvoice: (invoice) => {
    const newInvoice = { ...invoice, id: invoice.id || crypto.randomUUID() };
    const updatedInvoices = [...get().invoices, newInvoice];
    storage.set('invoices', updatedInvoices);
    set({ invoices: updatedInvoices });
  },

  updateInvoice: (id, updates) => {
    const updatedInvoices = get().invoices.map(inv =>
      inv.id === id ? { ...inv, ...updates } : inv
    );
    storage.set('invoices', updatedInvoices);
    set({ invoices: updatedInvoices });
  },

  deleteInvoice: (id) => {
    const updatedInvoices = get().invoices.filter(inv => inv.id !== id);
    storage.set('invoices', updatedInvoices);
    set({ invoices: updatedInvoices });
  },

  // Odoo records actions
  setOdooRecords: (records) => {
    storage.set('odooRecords', records);
    set({ odooRecords: records });
  },

  addOdooRecord: (record) => {
    const updatedRecords = [...get().odooRecords, record];
    storage.set('odooRecords', updatedRecords);
    set({ odooRecords: updatedRecords });
  },

  deleteOdooRecord: (id) => {
    const updatedRecords = get().odooRecords.filter(rec => rec.id !== id);
    storage.set('odooRecords', updatedRecords);
    set({ odooRecords: updatedRecords });
  },

  // Batch and selection actions
  setCurrentBatch: (invoices) => {
    set({ currentBatch: invoices });
    if (invoices) {
      // Automatically select all invoices in the batch
      const ids = new Set(invoices.map(inv => inv.id || ''));
      set({ selectedInvoiceIds: ids });
    }
  },

  toggleInvoiceSelection: (id) => {
    set((state) => {
      const newSet = new Set(state.selectedInvoiceIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedInvoiceIds: newSet };
    });
  },

  selectAllInvoices: () => {
    const { currentBatch } = get();
    if (currentBatch) {
      const ids = new Set(currentBatch.map(inv => inv.id || ''));
      set({ selectedInvoiceIds: ids });
    }
  },

  deselectAllInvoices: () => {
    set({ selectedInvoiceIds: new Set() });
  },

  // Pipeline actions
  updatePipelineStep: (step, status, message) => {
    set((state) => ({
      pipelineSteps: {
        ...state.pipelineSteps,
        [step]: { status, message },
      },
    }));
  },

  resetPipeline: () => {
    set({
      pipelineSteps: {
        upload: { status: 'idle', message: 'Ready' },
        ocr: { status: 'idle', message: 'Waiting' },
        processing: { status: 'idle', message: 'Waiting' },
        ready: { status: 'idle', message: 'Waiting' },
      },
      isProcessing: false,
      error: null,
    });
  },

  // Processing state
  setProcessing: (isProcessing) => set({ isProcessing }),
  setError: (error) => set({ error }),

  // Sync to Odoo
  syncToOdoo: (invoiceIds) => {
    const { invoices } = get();
    const invoicesToSync = invoices.filter(inv =>
      invoiceIds.includes(inv.id || '') && inv.status === 'extracted'
    );

    invoicesToSync.forEach(invoice => {
      // Create Odoo record
      const odooRecord: OdooRecord = {
        id: crypto.randomUUID(),
        move_type: 'in_invoice',
        partner_id: invoice.vendor.name,
        invoice_date: invoice.invoiceDate,
        invoice_date_due: invoice.dueDate,
        ref: invoice.invoiceNumber,
        invoice_line_ids: invoice.lineItems.map(item => ({
          name: item.description,
          quantity: item.quantity,
          price_unit: item.unitPrice,
          price_subtotal: item.amount,
          tax_amount: item.tax,
        })),
        amount_total: invoice.total,
        state: 'draft',
        created_at: new Date().toISOString(),
      };

      get().addOdooRecord(odooRecord);

      // Update invoice status
      get().updateInvoice(invoice.id || '', {
        status: 'synced',
        syncedAt: new Date().toISOString(),
      });
    });
  },
}));