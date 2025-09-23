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
import { AlertCircle, CheckCircle, Link, Send } from 'lucide-react';

export default function HomePage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [extractedInvoices, setExtractedInvoices] = useState<Invoice[] | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [originalPdfBase64, setOriginalPdfBase64] = useState<string | null>(null);
  const [isPushingToOdoo, setIsPushingToOdoo] = useState(false);

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
  }, [loadData]);

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
      setOriginalPdfBase64(base64); // Store for Odoo push
      updatePipelineStep('upload', 'completed', 'Uploaded');

      // Step 2: OCR
      updatePipelineStep('ocr', 'active', 'Extracting...');
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to process invoice`);
      }

      const ocrData: OCRResponse = await response.json();

      // Validate response structure
      if (!ocrData.invoices || !Array.isArray(ocrData.invoices)) {
        throw new Error('Invalid response from OCR: missing or invalid invoices array');
      }

      if (ocrData.invoices.length === 0) {
        throw new Error('No invoices found in the document. Please ensure the file contains valid invoice data.');
      }

      // Log successful extraction
      console.log(`Successfully extracted ${ocrData.invoices.length} invoices from document`);
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
        taskId: ocrData.taskId, // Include taskId from OCR response
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
      const errorMessage = err instanceof Error ? err.message : 'Failed to process file';

      // Check if it's a temporary service issue
      if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
        setError(`⚠️ Service Temporarily Unavailable: The Gemini API is currently overloaded or down. Please wait a moment and try again.`);
        alert('The OCR service is temporarily unavailable.\n\nThis is usually temporary - please wait 30 seconds and try again.\n\nIf the problem persists, the service may be experiencing high load.');
      } else if (errorMessage.includes('429') || errorMessage.includes('Rate Limit')) {
        setError(`⏱️ Rate Limit: Too many requests. Please wait a minute before trying again.`);
        alert('Rate limit reached!\n\nPlease wait 60 seconds before uploading another invoice.');
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        setError(`🔑 API Key Error: ${errorMessage}`);
        alert('API Key Error!\n\nYour Gemini API key appears to be invalid.\n\nPlease check your .env.local file.');
      } else if (errorMessage.includes('truncated') || errorMessage.includes('too many invoices')) {
        setError(`📄 Processing Error: The response was truncated. Please try again.`);
        alert(
          '⚠️ Processing Error!\n\n' +
          'The API response was truncated. This can happen with very large documents.\n\n' +
          'Please try uploading the document again.'
        );
      } else {
        setError(`❌ Error: ${errorMessage}`);
        alert(`Failed to process invoice:\n\n${errorMessage}`);
      }

      resetPipeline();
      console.error('Full error details:', err);
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

  const handlePushToOdoo = async () => {
    if (!extractedInvoices || !originalPdfBase64) return;

    setIsPushingToOdoo(true);
    setError(null);

    try {
      const response = await fetch('/api/push-to-odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoices: extractedInvoices,
          originalPdfBase64,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to push to Odoo');
      }

      const result = await response.json();
      setSuccess(`Successfully pushed ${result.invoiceCount} invoice(s) to Odoo. Task ID: ${result.taskId}`);

      // Mark invoices as synced
      const invoiceIds = extractedInvoices.map(inv => inv.id || '');
      syncToOdoo(invoiceIds);
      setExtractedInvoices(null);
      setOriginalPdfBase64(null);
    } catch (err) {
      console.error('Error pushing to Odoo:', err);
      setError(`Failed to push to Odoo: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsPushingToOdoo(false);
    }
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
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  icon={Send}
                  onClick={handlePushToOdoo}
                  disabled={isPushingToOdoo}
                >
                  {isPushingToOdoo ? 'Pushing...' : 'Push to Odoo'}
                </Button>
                <Button
                  variant="outline"
                  icon={Link}
                  onClick={handleSyncAll}
                >
                  Save Locally
                </Button>
              </div>
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
