'use client';

import React, { useState } from 'react';
import { Calendar, Building2, FileText, Trash2, Link, Eye, Hash } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { InvoiceDetails } from './invoice-details';
import { Invoice } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useInvoiceStore } from '@/store/invoice-store';

interface InvoiceCardProps {
  invoice: Invoice;
  onSync?: () => void;
}

export function InvoiceCard({ invoice, onSync }: InvoiceCardProps) {
  const { deleteInvoice, syncToOdoo } = useInvoiceStore();
  const [showDetails, setShowDetails] = useState(false);

  const handleSync = () => {
    if (invoice.id) {
      syncToOdoo([invoice.id]);
      onSync?.();
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
        <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{invoice.invoiceNumber}</CardTitle>
          <Badge variant={invoice.status === 'synced' ? 'success' : 'warning'}>
            {invoice.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center text-sm">
            <Building2 className="w-4 h-4 mr-2 text-secondary-text" />
            <span className="text-secondary-text">Vendor:</span>
            <span className="ml-2 font-medium text-primary-text">{invoice.vendor.name}</span>
          </div>

          {invoice.customerPoNumber && (
            <div className="flex items-center text-sm">
              <Hash className="w-4 h-4 mr-2 text-secondary-text" />
              <span className="text-secondary-text">PO#:</span>
              <span className="ml-2 font-medium text-accent-action">{invoice.customerPoNumber}</span>
            </div>
          )}

          <div className="flex items-center text-sm">
            <Calendar className="w-4 h-4 mr-2 text-secondary-text" />
            <span className="text-secondary-text">Date:</span>
            <span className="ml-2 font-medium text-primary-text">{formatDate(invoice.invoiceDate)}</span>
          </div>

          <div className="flex items-center text-sm">
            <Calendar className="w-4 h-4 mr-2 text-secondary-text" />
            <span className="text-secondary-text">Due:</span>
            <span className="ml-2 font-medium text-primary-text">{formatDate(invoice.dueDate)}</span>
          </div>

          <div className="flex items-center text-sm">
            <FileText className="w-4 h-4 mr-2 text-secondary-text" />
            <span className="text-secondary-text">Items:</span>
            <span className="ml-2 font-medium text-primary-text">{invoice.lineItems.length} items</span>
          </div>
        </div>

        <div className="pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm text-secondary-text">Total Amount</span>
            <span className="text-xl font-bold text-accent-highlight">
              {formatCurrency(invoice.total)}
            </span>
          </div>
        </div>

        {invoice.batchId && (
          <div className="pt-2">
            <Badge variant="info" size="sm">
              Batch: {invoice.batchId.slice(0, 8)}
            </Badge>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
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
          >
            Sync to Odoo
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