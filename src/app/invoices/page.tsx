'use client';

import React, { useEffect } from 'react';
import { InvoiceCard } from '@/components/invoice/invoice-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvoiceStore } from '@/store/invoice-store';
import { Link, FileText } from 'lucide-react';

export default function InvoicesPage() {
  const { invoices, loadData, syncToOdoo } = useInvoiceStore();

  useEffect(() => {
    loadData();
  }, [loadData]);

  const extractedInvoices = invoices.filter(inv => inv.status === 'extracted');

  const handleSyncAll = () => {
    const invoiceIds = extractedInvoices.map(inv => inv.id || '');
    syncToOdoo(invoiceIds);
  };

  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="text-center">
            <FileText className="w-16 h-16 mx-auto text-secondary-text mb-4" />
            <h3 className="text-lg font-semibold text-primary-text mb-2">
              No invoices processed yet
            </h3>
            <p className="text-secondary-text">
              Upload and process invoices to see them here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Processed Invoices</CardTitle>
            {extractedInvoices.length > 0 && (
              <Button
                variant="primary"
                icon={Link}
                onClick={handleSyncAll}
              >
                Sync All Extracted ({extractedInvoices.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {invoices.map((invoice) => (
              <InvoiceCard key={invoice.id} invoice={invoice} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}