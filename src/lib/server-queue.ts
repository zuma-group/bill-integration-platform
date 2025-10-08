import { Invoice } from '@/types';

// Simple per-process in-memory queue for processed invoices
const queue: Invoice[] = [];

export function enqueueInvoices(invoices: Invoice[]) {
  if (!Array.isArray(invoices) || invoices.length === 0) return;
  queue.push(...invoices);
}

export function drainInvoices(max: number = 100): Invoice[] {
  if (queue.length === 0) return [];
  const count = Math.min(max, queue.length);
  return queue.splice(0, count);
}

export function size(): number {
  return queue.length;
}


