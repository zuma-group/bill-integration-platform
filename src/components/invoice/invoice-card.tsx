'use client';

import React, { useState } from 'react';
import { Calendar, Building2, FileText, Trash2, Link, Eye, Hash } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { InvoiceDetails } from './invoice-details';
import { Invoice } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { useInvoiceStore } from '@/store/invoice-store';

interface InvoiceCardProps {
  invoice: Invoice;
  onSendToOdoo?: (invoice: Invoice) => Promise<void> | void;
  isSending?: boolean;
}

export function InvoiceCard({ invoice, onSendToOdoo, isSending = false }: InvoiceCardProps) {
  const { deleteInvoice } = useInvoiceStore();
  const [showDetails, setShowDetails] = useState(false);
  const [localSyncing, setLocalSyncing] = useState(false);

  const handleSync = async () => {
    if (!onSendToOdoo) return;
    try {
      setLocalSyncing(true);
      await Promise.resolve(onSendToOdoo(invoice));
    } finally {
      setLocalSyncing(false);
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this invoice?')) {
      if (invoice.id) {
        deleteInvoice(invoice.id);
      }
    }
  };

  return (
    <>
      <Card variant="elevated" className="hover:shadow-lg transition-all duration-200">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-start gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent-action" />
              <CardTitle className="text-lg font-bold">{invoice.invoiceNumber}</CardTitle>
            </div>
            <Badge variant={invoice.status === 'synced' ? 'success' : 'warning'} size="sm">
              {invoice.status}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Vendor */}
          <div className="flex items-start gap-3">
            <Building2 className="w-4 h-4 mt-0.5 text-secondary-text flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-secondary-text mb-0.5">Vendor</div>
              <div className="font-medium text-primary-text truncate">{invoice.vendor.name}</div>
            </div>
          </div>

          {/* PO Number with Company Badge */}
          {invoice.customerPoNumber && (
            <div className="flex items-start gap-3">
              <Hash className="w-4 h-4 mt-0.5 text-secondary-text flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-secondary-text mb-0.5">PO Number</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-accent-action">{invoice.customerPoNumber}</span>
                  {invoice.companyId && (
                    <Badge variant="info" size="sm">
                      Co.{invoice.companyId} - {invoice.companyId === 1 ? 'Zuma Lift' : 'Zuma Sales'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Date Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 text-secondary-text flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-secondary-text mb-0.5">Date</div>
                <div className="font-medium text-primary-text text-sm">{invoice.invoiceDate}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 text-secondary-text flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-secondary-text mb-0.5">Due</div>
                <div className="font-medium text-primary-text text-sm">{invoice.dueDate || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Items Count */}
          <div className="flex items-center gap-2 text-sm text-secondary-text">
            <FileText className="w-4 h-4" />
            <span>{invoice.lineItems.length} line {invoice.lineItems.length === 1 ? 'item' : 'items'}</span>
            {invoice.batchId && (
              <>
                <span className="mx-1">•</span>
                <span className="text-xs">Batch: {invoice.batchId.slice(0, 8)}</span>
              </>
            )}
          </div>

          {/* Total Amount */}
          <div className="pt-3 border-t border-border-subtle">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-secondary-text">Total Amount</span>
              <span className="text-2xl font-bold text-accent-highlight">
                {formatCurrency(invoice.total)}
              </span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2 pt-4">
          <Button
            variant="ghost"
            size="sm"
            icon={Eye}
            onClick={() => setShowDetails(true)}
          >
            View
          </Button>
          {invoice.status === 'extracted' ? (
            <Button
              variant="primary"
              size="sm"
              icon={Link}
              onClick={handleSync}
              className="flex-1"
              disabled={!onSendToOdoo || isSending || localSyncing}
            >
              {isSending || localSyncing ? 'Syncing…' : 'Sync to Odoo'}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled className="flex-1">
              ✓ Synced
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </CardFooter>
      </Card>

      <Modal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title="Invoice Details"
        size="xl"
      >
        <InvoiceDetails invoice={invoice} />
      </Modal>
    </>
  );
}
