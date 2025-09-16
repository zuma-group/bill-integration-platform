'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Invoice } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useInvoiceStore } from '@/store/invoice-store';
import { cn } from '@/lib/utils';

interface InvoiceSelectorProps {
  invoices: Invoice[];
  onProcess: (selectedInvoices: Invoice[]) => void;
  onCancel: () => void;
}

export function InvoiceSelector({ invoices, onProcess, onCancel }: InvoiceSelectorProps) {
  const {
    selectedInvoiceIds,
    toggleInvoiceSelection,
    selectAllInvoices,
    deselectAllInvoices,
  } = useInvoiceStore();

  const totalValue = invoices
    .filter(inv => selectedInvoiceIds.has(inv.id || ''))
    .reduce((sum, inv) => sum + inv.total, 0);

  const handleProcess = () => {
    const selected = invoices.filter(inv => selectedInvoiceIds.has(inv.id || ''));
    if (selected.length > 0) {
      onProcess(selected);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <div>
          <h3 className="text-xl font-semibold text-primary-text">Multiple Invoices Detected</h3>
          <p className="text-sm text-secondary-text mt-1">
            Found {invoices.length} invoices • Total value: {formatCurrency(totalValue)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={selectAllInvoices}>
            Select All
          </Button>
          <Button variant="secondary" size="sm" onClick={deselectAllInvoices}>
            Select None
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleProcess}
            disabled={selectedInvoiceIds.size === 0}
          >
            Process Selected ({selectedInvoiceIds.size})
          </Button>
          <Button variant="ghost" size="sm" icon={X} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto space-y-3">
        {invoices.map((invoice, index) => {
          const isSelected = selectedInvoiceIds.has(invoice.id || '');

          return (
            <div
              key={invoice.id || index}
              onClick={() => toggleInvoiceSelection(invoice.id || '')}
              className={cn(
                'p-4 rounded-lg border-2 cursor-pointer transition-all duration-200',
                isSelected
                  ? 'border-accent-action bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              )}
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                    isSelected
                      ? 'border-accent-action bg-accent-action'
                      : 'border-gray-300 bg-white'
                  )}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-primary-text">
                      {invoice.invoiceNumber}
                    </span>
                    {invoice.customerPoNumber && (
                      <span className="text-sm text-accent-action font-medium">
                        PO# {invoice.customerPoNumber}
                      </span>
                    )}
                    <Badge variant="warning" size="sm">
                      BATCH {index + 1}/{invoices.length}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-secondary-text">Vendor:</span>
                      <span className="ml-2 text-primary-text">{invoice.vendor.name}</span>
                    </div>
                    <div>
                      <span className="text-secondary-text">Date:</span>
                      <span className="ml-2 text-primary-text">{formatDate(invoice.invoiceDate)}</span>
                    </div>
                    <div>
                      <span className="text-secondary-text">Page:</span>
                      <span className="ml-2 text-primary-text">{invoice.pageNumber || 1}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xl font-bold text-accent-highlight">
                    {formatCurrency(invoice.total)}
                  </div>
                  <div className="text-xs text-secondary-text mt-1">
                    {invoice.lineItems.length} items
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {invoices.length > 10 && (
        <div className="mt-4 p-3 bg-amber-50 rounded-lg">
          <p className="text-sm text-amber-800">
            ⚠️ Large batch detected. Processing {invoices.length} invoices may take longer.
          </p>
        </div>
      )}
    </Card>
  );
}