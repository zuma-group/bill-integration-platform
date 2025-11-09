'use client';

import React, { useCallback } from 'react';
import {
  FileText,
  Calendar,
  Building2,
  User,
  Hash,
  Mail,
  Phone,
  MapPin,
  Package,
  DollarSign,
  Percent,
  Clock,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Invoice } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface InvoiceDetailsProps {
  invoice: Invoice;
}

export function InvoiceDetails({ invoice }: InvoiceDetailsProps) {
  const taxRate = invoice.subtotal ? (invoice.taxAmount / invoice.subtotal) * 100 : 0;
  const canViewPdf = Boolean(invoice.pdfUrl || invoice.pdfBase64);

  const handleViewPdf = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (invoice.pdfUrl) {
      window.open(invoice.pdfUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (!invoice.pdfBase64) return;

    try {
      const byteCharacters = atob(invoice.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: invoice.mimeType || 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error('Failed to open PDF preview', error);
    }
  }, [invoice.pdfBase64, invoice.pdfUrl, invoice.mimeType]);

  return (
    <div className="space-y-6">
      {/* Header with Status */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-2xl font-bold text-primary-text flex items-center gap-2">
            <FileText className="w-6 h-6 text-accent-action" />
            {invoice.invoiceNumber}
          </h3>
          <p className="text-secondary-text mt-1">
            Invoice Details and Extracted Information
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge
            variant={invoice.status === 'synced' ? 'success' : 'warning'}
            size="lg"
          >
            {invoice.status === 'synced' ? (
              <>
                <CheckCircle className="w-4 h-4 mr-1" />
                Synced to Odoo
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 mr-1" />
                Pending Sync
              </>
            )}
          </Badge>
          {invoice.batchId && (
            <Badge variant="info" size="lg">
              Batch: {invoice.batchId.slice(0, 8)}
            </Badge>
          )}
          {canViewPdf && (
            <Button
              variant="outline"
              size="sm"
              icon={ExternalLink}
              onClick={handleViewPdf}
            >
              View PDF
            </Button>
          )}
        </div>
      </div>

      {/* Customer PO Number */}
      {invoice.customerPoNumber && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-secondary-text flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Customer PO Number
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-accent-action">
                {invoice.customerPoNumber}
              </p>
              {invoice.companyId && (
                <Badge variant="info" size="lg">
                  Company {invoice.companyId} {invoice.companyId === 1 ? '(Zuma Lift Service)' : '(Zuma Sales LLC)'}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-secondary-text">
              <Calendar className="w-4 h-4 inline mr-2" />
              Invoice Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-primary-text">
              {invoice.invoiceDate}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-secondary-text">
              <Clock className="w-4 h-4 inline mr-2" />
              Due Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-primary-text">
              {invoice.dueDate || 'Not specified'}
            </p>
            <p className="text-xs text-secondary-text mt-1">
              {invoice.paymentTerms}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-secondary-text">
              <DollarSign className="w-4 h-4 inline mr-2" />
              Total Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-accent-highlight">
              {formatCurrency(invoice.total)}
            </p>
            <p className="text-xs text-secondary-text mt-1">
              {invoice.currency}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Vendor and Customer Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-accent-action" />
              Vendor Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-lg font-semibold text-primary-text">
                {invoice.vendor.name}
              </p>
            </div>

            {invoice.vendor.address && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-secondary-text mt-0.5" />
                <p className="text-sm text-primary-text">
                  {invoice.vendor.address}
                </p>
              </div>
            )}

            {invoice.vendor.taxId && (
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-secondary-text" />
                <p className="text-sm text-primary-text">
                  Tax ID: {invoice.vendor.taxId}
                </p>
              </div>
            )}

            {invoice.vendor.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-secondary-text" />
                <p className="text-sm text-primary-text">
                  {invoice.vendor.email}
                </p>
              </div>
            )}

            {invoice.vendor.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-secondary-text" />
                <p className="text-sm text-primary-text">
                  {invoice.vendor.phone}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-accent-action" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-lg font-semibold text-primary-text">
                {invoice.customer.name}
              </p>
            </div>

            {invoice.customer.address && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-secondary-text mt-0.5" />
                <p className="text-sm text-primary-text">
                  {invoice.customer.address}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-accent-action" />
            Line Items ({invoice.lineItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 text-sm font-semibold text-secondary-text">
                    Part Number
                  </th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-secondary-text">
                    Description
                  </th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-secondary-text">
                    Qty
                  </th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-secondary-text">
                    Unit Price
                  </th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-secondary-text">
                    Tax
                  </th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-secondary-text">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item, index) => (
                  <tr key={index} className="border-b hover:bg-accent-hover">
                    <td className="py-3 px-2 text-sm text-primary-text font-mono">
                      {item.partNumber || '-'}
                    </td>
                    <td className="py-3 px-2 text-sm text-primary-text">
                      {item.description}
                    </td>
                    <td className="py-3 px-2 text-sm text-center text-primary-text">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-2 text-sm text-right text-primary-text">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-3 px-2 text-sm text-right text-primary-text">
                      {formatCurrency(item.tax)}
                    </td>
                    <td className="py-3 px-2 text-sm text-right font-medium text-primary-text">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-6 pt-4 border-t space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-secondary-text">Subtotal</span>
              <span className="text-primary-text font-medium">
                {formatCurrency(invoice.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary-text flex items-center gap-1">
                <Percent className="w-3 h-3" />
                Tax ({taxRate.toFixed(1)}%)
              </span>
              <span className="text-primary-text font-medium">
                {formatCurrency(invoice.taxAmount)}
              </span>
            </div>
            <div className="flex justify-between text-lg pt-2 border-t">
              <span className="font-semibold text-primary-text">Total</span>
              <span className="font-bold text-accent-highlight">
                {formatCurrency(invoice.total)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-secondary-text">
            Extraction Metadata
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {invoice.extractedAt && (
              <div>
                <p className="text-secondary-text">Extracted At</p>
                <p className="text-primary-text font-medium">
                  {new Date(invoice.extractedAt).toLocaleString()}
                </p>
              </div>
            )}
            {invoice.syncedAt && (
              <div>
                <p className="text-secondary-text">Synced At</p>
                <p className="text-primary-text font-medium">
                  {new Date(invoice.syncedAt).toLocaleString()}
                </p>
              </div>
            )}
            {invoice.pageNumber && (
              <div>
                <p className="text-secondary-text">Page Number</p>
                <p className="text-primary-text font-medium">
                  Page {invoice.pageNumber}
                </p>
              </div>
            )}
            <div>
              <p className="text-secondary-text">Invoice ID</p>
              <p className="text-primary-text font-medium text-xs">
                {invoice.id?.slice(0, 8)}...
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
