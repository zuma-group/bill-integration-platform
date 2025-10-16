'use client';

import React, { useEffect, useState } from 'react';
import { InvoiceCard } from '@/components/invoice/invoice-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvoiceStore } from '@/store/invoice-store';
import { Link, FileText, Trash2 } from 'lucide-react';
import { Invoice } from '@/types';

export default function InvoicesPage() {
  const { invoices, loadData, syncToOdoo, setInvoices, addInvoice } = useInvoiceStore();
  const [syncingInvoiceId, setSyncingInvoiceId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [autoImporting, setAutoImporting] = useState(false);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Background auto-import from server queue
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let cancelled = false;

    const tick = async () => {
      try {
        setAutoImporting(true);
        const res = await fetch('/api/invoices/pending?max=25', { cache: 'no-store' });
        const data = await res.json();
        if (res.ok && Array.isArray(data.invoices) && data.invoices.length > 0) {
          data.invoices.forEach((inv: Invoice) => addInvoice(inv));
          setFeedback(`Auto-imported ${data.invoices.length} invoice(s).`);
        }
      } catch {}
      finally {
        setAutoImporting(false);
        if (!cancelled) timer = setTimeout(tick, 4000);
      }
    };

    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [addInvoice]);

  const extractedInvoices = invoices.filter(inv => inv.status === 'extracted');
  const getInvoiceKey = (invoice: Invoice) => invoice.id ?? `${invoice.invoiceNumber}-${Math.random().toString(36).slice(2)}`;

  const pushInvoiceToOdoo = async (invoice: Invoice) => {
    const response = await fetch('/api/push-to-odoo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoices: [invoice],
        // Let server fetch or split as needed; S3 is used for stable URL
        ...(invoice.pdfBase64 ? { originalPdfBase64: invoice.pdfBase64 } : {}),
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

  const handleImportFromGmail = async () => {
    setIsImporting(true);
    setFeedback(null);
    setError(null);
    try {
      const res = await fetch('/api/gmail/poll?max=10');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to poll Gmail');

      let importedCount = 0;
      for (const r of data.results || []) {
        for (const att of r.attachments || []) {
          for (const inv of (att.invoices || []) as Invoice[]) {
            addInvoice(inv);
            importedCount++;
          }
        }
      }
      setFeedback(importedCount > 0 ? `Imported ${importedCount} invoice(s) from Gmail.` : 'No invoices found in Gmail.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import from Gmail');
    }
    finally {
      setIsImporting(false);
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
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="primary" onClick={handleImportFromGmail} loading={isImporting}>
                {isImporting ? 'Importing…' : 'Import from Gmail'}
              </Button>
              {autoImporting && (
                <span className="text-sm text-secondary-text">Listening for new invoices…</span>
              )}
            </div>
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
              <Button
                variant="primary"
                icon={Link}
                onClick={handleImportFromGmail}
                loading={isImporting}
              >
                {isImporting ? 'Importing…' : 'Import from Gmail'}
              </Button>
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
