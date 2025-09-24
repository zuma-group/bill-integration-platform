'use client';

import React, { useEffect, useState } from 'react';
import { InvoiceCard } from '@/components/invoice/invoice-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvoiceStore } from '@/store/invoice-store';
import { Link, FileText, Trash2 } from 'lucide-react';
import { Invoice } from '@/types';

export default function InvoicesPage() {
  const { invoices, loadData, syncToOdoo, setInvoices } = useInvoiceStore();
  const [syncingInvoiceId, setSyncingInvoiceId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const extractedInvoices = invoices.filter(inv => inv.status === 'extracted');
  const getInvoiceKey = (invoice: Invoice) => invoice.id ?? invoice.invoiceNumber;

  const pushInvoiceToOdoo = async (invoice: Invoice) => {
    if (!invoice.pdfBase64) {
      throw new Error('Missing PDF data for this invoice. Re-upload the original document before syncing.');
    }

    const response = await fetch('/api/push-to-odoo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoices: [invoice],
        originalPdfBase64: invoice.pdfBase64,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to push invoice to Odoo');
    }

    const attachments = Array.isArray(result.attachmentInfo)
      ? (result.attachmentInfo as Array<{
          invoiceId?: string;
          invoiceNumber?: string;
          filename?: string;
          url?: string;
        }>)
      : [];

    const invoiceKey = getInvoiceKey(invoice);
    const attachment = attachments.find(att =>
      (att.invoiceId && att.invoiceId === invoiceKey) ||
      (att.invoiceNumber && att.invoiceNumber === invoice.invoiceNumber)
    );

    if (result.configuration?.webhookConfigured) {
      syncToOdoo([
        {
          invoice,
          changes: {
            pdfUrl: attachment?.url,
            attachmentFilename: attachment?.filename,
            syncedAt: new Date().toISOString(),
          },
        },
      ]);
    } else {
      throw new Error('Odoo webhook not configured on server. Data prepared but not sent.');
    }

    return result;
  };

  const handleSyncAll = async () => {
    if (extractedInvoices.length === 0) return;

    setIsSyncingAll(true);
    setFeedback(null);
    setError(null);

    try {
      for (const invoice of extractedInvoices) {
        await pushInvoiceToOdoo(invoice);
      }
      setFeedback(`Successfully synced ${extractedInvoices.length} invoice(s) to Odoo.`);
    } catch (err) {
      console.error('Failed to sync invoices to Odoo:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync invoices to Odoo.');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleSyncSingle = async (invoice: Invoice) => {
    setSyncingInvoiceId(getInvoiceKey(invoice));
    setFeedback(null);
    setError(null);

    try {
      await pushInvoiceToOdoo(invoice);
      setFeedback(`Invoice ${invoice.invoiceNumber} synced to Odoo.`);
    } catch (err) {
      console.error('Failed to sync invoice to Odoo:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync invoice to Odoo.');
    } finally {
      setSyncingInvoiceId(null);
    }
  };

  const handleClearAll = () => {
    if (confirm(`Are you sure you want to delete all ${invoices.length} invoices? This cannot be undone.`)) {
      setInvoices([]);
      console.log('🗑️ Cleared all invoices from storage');
    }
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
            <CardTitle>Processed Invoices ({invoices.length} total)</CardTitle>
            <div className="flex gap-2">
              {extractedInvoices.length > 0 && (
                <Button
                  variant="primary"
                  icon={Link}
                  onClick={handleSyncAll}
                  disabled={isSyncingAll}
                >
                  {isSyncingAll ? 'Syncing…' : `Sync All Extracted (${extractedInvoices.length})`}
                </Button>
              )}
              {invoices.length > 0 && (
                <Button
                  variant="danger"
                  icon={Trash2}
                  onClick={handleClearAll}
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {invoices.map((invoice) => (
              <InvoiceCard
                key={getInvoiceKey(invoice)}
                invoice={invoice}
                onSendToOdoo={handleSyncSingle}
                isSending={syncingInvoiceId === getInvoiceKey(invoice)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {(feedback || error) && (
        <Card>
          <CardContent>
            {feedback && (
              <p className="text-sm text-status-success">{feedback}</p>
            )}
            {error && (
              <p className="text-sm text-status-error">{error}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
