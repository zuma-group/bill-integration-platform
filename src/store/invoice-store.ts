import { create } from 'zustand';
import { Invoice, OdooRecord, Batch, PipelineStep, PipelineStatus } from '@/types';

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
  loadData: () => Promise<{ warning?: string } | null>;
  setInvoices: (invoices: Invoice[]) => void;
  addInvoice: (invoice: Invoice) => Promise<void>;
  updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;

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

  syncToOdoo: (entries: Array<{ invoice: Invoice; changes?: Partial<Invoice> }>) => void;
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

  // Load data from database via API
  loadData: async () => {
    try {
      const res = await fetch('/api/invoices?take=200', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load invoices');
      const data = await res.json();
      const invoices: Invoice[] = Array.isArray(data.items) ? data.items : [];
      set({ invoices });
      
      // Return the response so warnings can be captured
      return data;
    } catch (err) {
      console.error('loadData error:', err);
      return null;
    }
  },

  // Invoice actions
  setInvoices: (invoices) => {
    set({ invoices });
  },

  addInvoice: async (invoice) => {
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoice),
      });
      if (!res.ok) throw new Error('Failed to create invoice');
      const data = await res.json();
      const created: Invoice[] = Array.isArray(data.items) ? data.items : data.item ? [data.item] : [];
      if (created.length > 0) {
        set({ invoices: [...get().invoices, created[0]] });
      }
    } catch (err) {
      console.error('addInvoice error:', err);
    }
  },

  updateInvoice: async (id, updates) => {
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update invoice');
      const updated = (await res.json()) as Invoice;
      set({
        invoices: get().invoices.map((inv) => (inv.id === id ? { ...inv, ...updated } : inv)),
      });
    } catch (err) {
      console.error('updateInvoice error:', err);
    }
  },

  deleteInvoice: async (id) => {
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete invoice');
      set({ invoices: get().invoices.filter((inv) => inv.id !== id) });
    } catch (err) {
      console.error('deleteInvoice error:', err);
    }
  },

  // Odoo records actions (kept in-memory only)
  setOdooRecords: (records) => {
    set({ odooRecords: records });
  },

  addOdooRecord: (record) => {
    set({ odooRecords: [...get().odooRecords, record] });
  },

  deleteOdooRecord: (id) => {
    set({ odooRecords: get().odooRecords.filter((rec) => rec.id !== id) });
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
  syncToOdoo: (entries) => {
    if (entries.length === 0) {
      return;
    }
    const now = new Date().toISOString();
    
    // First, update in-memory state immediately (works with or without DB)
    const invoiceUpdates = entries.reduce((acc, e) => {
      if (e.invoice.id) {
        acc[e.invoice.id] = { ...(e.changes || {}), status: 'synced' as const, syncedAt: now };
      }
      return acc;
    }, {} as Record<string, Partial<Invoice>>);
    
    // Apply in-memory updates
    set((state) => ({
      invoices: state.invoices.map((inv) => 
        inv.id && invoiceUpdates[inv.id] 
          ? { ...inv, ...invoiceUpdates[inv.id] } 
          : inv
      ),
    }));
    
    // Then try to persist to DB (if DB is configured)
    const update = async () => {
      const promises = entries
        .filter((e) => e.invoice.id)
        .map((e) =>
          fetch(`/api/invoices/${encodeURIComponent(e.invoice.id as string)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...(e.changes || {}), status: 'synced', syncedAt: now }),
          })
        );
      try {
        await Promise.all(promises);
        // Refresh invoices from DB only if any succeeded
        const responses = await Promise.all(promises);
        if (responses.some(r => r.ok)) {
          await get().loadData();
        }
      } catch (err) {
        console.error('syncToOdoo database persist error (continuing with in-memory state):', err);
        // Don't throw - in-memory update already succeeded
      }
    };
    update();
  },
}));
