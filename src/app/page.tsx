'use client';

import React, { useState, useEffect } from 'react';
import { Dropzone } from '@/components/ui/dropzone';
import { PipelineVisual } from '@/components/pipeline/pipeline-visual';
import { InvoiceSelector } from '@/components/invoice/invoice-selector';
import { InvoiceCard } from '@/components/invoice/invoice-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvoiceStore } from '@/store/invoice-store';
import { fileToBase64, getMimeType, generateId } from '@/lib/utils';
import { Invoice, OCRResponse } from '@/types';
import { AlertCircle, CheckCircle, Link } from 'lucide-react';

export default function HomePage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [extractedInvoices, setExtractedInvoices] = useState<Invoice[] | null>(null);
  const [showSelector, setShowSelector] = useState(false);

  const {
    loadData,
    addInvoice,
    updatePipelineStep,
    resetPipeline,
    setCurrentBatch,
    syncToOdoo,
  } = useInvoiceStore();

  useEffect(() => {
    loadData();
  }, []);

  const handleFileDrop = async (files: File[]) => {
    if (files.length === 0) return;

    const file = files[0];
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    resetPipeline();

    try {
      // Step 1: Upload
      updatePipelineStep('upload', 'active', 'Uploading...');
      const base64 = await fileToBase64(file);
      const mimeType = getMimeType(file);
      updatePipelineStep('upload', 'completed', 'Uploaded');

      // Step 2: OCR
      updatePipelineStep('ocr', 'active', 'Extracting...');
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType }),
      });

      if (!response.ok) {
        throw new Error('Failed to process invoice');
      }

      const ocrData: OCRResponse = await response.json();
      updatePipelineStep('ocr', 'completed', 'Extracted');

      // Step 3: Processing
      updatePipelineStep('processing', 'active', 'Processing...');

      // Add IDs and metadata to invoices
      const processedInvoices = ocrData.invoices.map((invoice) => ({
        ...invoice,
        id: generateId(),
        status: 'extracted' as const,
        extractedAt: new Date().toISOString(),
        batchId: ocrData.documentType === 'multiple' ? generateId() : undefined,
      }));

      updatePipelineStep('processing', 'completed', 'Processed');

      // Step 4: Ready
      updatePipelineStep('ready', 'completed', 'Ready');

      if (ocrData.documentType === 'multiple') {
        setExtractedInvoices(processedInvoices);
        setCurrentBatch(processedInvoices);
        setShowSelector(true);
      } else {
        processInvoices(processedInvoices);
      }

      setSuccess(`Successfully extracted ${ocrData.invoiceCount} invoice(s)`);
    } catch (err) {
      console.error('Error processing file:', err);
      setError(err instanceof Error ? err.message : 'Failed to process file');
      resetPipeline();
    } finally {
      setIsProcessing(false);
    }
  };

  const processInvoices = (invoices: Invoice[]) => {
    invoices.forEach(addInvoice);
    setExtractedInvoices(invoices);
    setShowSelector(false);
  };

  const handleSelectorProcess = (selectedInvoices: Invoice[]) => {
    processInvoices(selectedInvoices);
    setSuccess(`Processed ${selectedInvoices.length} invoice(s)`);
  };

  const handleSyncAll = () => {
    if (!extractedInvoices) return;

    const invoiceIds = extractedInvoices.map(inv => inv.id || '');
    syncToOdoo(invoiceIds);
    setExtractedInvoices(null);
    setSuccess('Successfully synced all invoices to Odoo');
  };

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <Dropzone
            onDrop={handleFileDrop}
            disabled={isProcessing}
          />
        </CardContent>
      </Card>

      {/* Pipeline Visualization */}
      <PipelineVisual />

      {/* Multi-Invoice Selector */}
      {showSelector && extractedInvoices && (
        <InvoiceSelector
          invoices={extractedInvoices}
          onProcess={handleSelectorProcess}
          onCancel={() => {
            setShowSelector(false);
            setExtractedInvoices(null);
            resetPipeline();
          }}
        />
      )}

      {/* Extracted Data Display */}
      {extractedInvoices && !showSelector && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Extracted Invoice Data</CardTitle>
              <Button
                variant="primary"
                icon={Link}
                onClick={handleSyncAll}
              >
                Sync All to Odoo
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {extractedInvoices.map((invoice) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  onSync={() => setExtractedInvoices(null)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-status-error rounded-lg">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 text-status-success rounded-lg">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}
    </div>
  );
}
