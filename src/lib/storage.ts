import { Invoice, OdooRecord, Batch } from '@/types';

interface StorageSchema {
  invoices: Invoice[];
  odooRecords: OdooRecord[];
  batches: Batch[];
  settings: {
    geminiApiKey?: string;
    odooUrl?: string;
    odooApiKey?: string;
  };
}

class LocalStorageManager {
  private isClient = typeof window !== 'undefined';

  get<K extends keyof StorageSchema>(key: K): StorageSchema[K] | null {
    if (!this.isClient) return null;

    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      return JSON.parse(item) as StorageSchema[K];
    } catch (error) {
      console.error(`Error reading ${key} from localStorage:`, error);
      return null;
    }
  }

  set<K extends keyof StorageSchema>(key: K, value: StorageSchema[K]): void {
    if (!this.isClient) return;

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error writing ${key} to localStorage:`, error);
    }
  }

  update<K extends keyof StorageSchema>(
    key: K,
    updater: (current: StorageSchema[K] | null) => StorageSchema[K]
  ): void {
    const current = this.get(key);
    const updated = updater(current);
    this.set(key, updated);
  }

  remove(key: keyof StorageSchema): void {
    if (!this.isClient) return;
    localStorage.removeItem(key);
  }

  clear(): void {
    if (!this.isClient) return;
    localStorage.clear();
  }

  // Helper methods for common operations
  addInvoice(invoice: Invoice): void {
    this.update('invoices', (current) => {
      const invoices = current || [];
      return [...invoices, { ...invoice, id: invoice.id || crypto.randomUUID() }];
    });
  }

  updateInvoice(id: string, updates: Partial<Invoice>): void {
    this.update('invoices', (current) => {
      const invoices = current || [];
      return invoices.map(inv =>
        inv.id === id ? { ...inv, ...updates } : inv
      );
    });
  }

  deleteInvoice(id: string): void {
    this.update('invoices', (current) => {
      const invoices = current || [];
      return invoices.filter(inv => inv.id !== id);
    });
  }

  addOdooRecord(record: OdooRecord): void {
    this.update('odooRecords', (current) => {
      const records = current || [];
      return [...records, record];
    });
  }

  deleteOdooRecord(id: string): void {
    this.update('odooRecords', (current) => {
      const records = current || [];
      return records.filter(rec => rec.id !== id);
    });
  }

  getStatistics() {
    const invoices = this.get('invoices') || [];
    const odooRecords = this.get('odooRecords') || [];

    return {
      totalInvoices: invoices.length,
      extractedCount: invoices.filter(inv => inv.status === 'extracted').length,
      syncedCount: invoices.filter(inv => inv.status === 'synced').length,
      totalValue: invoices.reduce((sum, inv) => sum + inv.total, 0),
      odooRecordsCount: odooRecords.length,
    };
  }
}

// TODO: Replace with PostgreSQL using Prisma
// This is a temporary implementation using localStorage
// Future implementation will use:
// - PostgreSQL database
// - Prisma ORM
// - Server-side API routes for data operations

export const storage = new LocalStorageManager();