'use client';

import React, { useState, useEffect } from 'react';
import { Dropzone } from '@/components/ui/dropzone';
import { PipelineVisual } from '@/components/pipeline/pipeline-visual';
import { InvoiceSelector } from '@/components/invoice/invoice-selector';
import { InvoiceCard } from '@/components/invoice/invoice-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { useInvoiceStore } from '@/store/invoice-store';
import { fileToBase64, getMimeType, generateId } from '@/lib/utils';
import { Invoice, OCRResponse } from '@/types';
import { AlertCircle, CheckCircle, Link, Send, Trash2, TestTube } from 'lucide-react';

export default function HomePage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [extractedInvoices, setExtractedInvoices] = useState<Invoice[] | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [originalPdfBase64, setOriginalPdfBase64] = useState<string | null>(null);
  const [isPushingToOdoo, setIsPushingToOdoo] = useState(false);
  const [pushingInvoiceId, setPushingInvoiceId] = useState<string | null>(null);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [odooResponseDetails, setOdooResponseDetails] = useState<Record<string, unknown> | null>(null);

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
        pdfBase64: base64,
        mimeType,
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

  const getInvoiceKey = (invoice: Invoice) => invoice.id ?? invoice.invoiceNumber;

  const removeExtractedInvoices = (idsToRemove: Set<string>) => {
    setExtractedInvoices((current) => {
      if (!current) return current;
      const remaining = current.filter(inv => !idsToRemove.has(getInvoiceKey(inv)));
      // Don't call setCurrentBatch here - use effect instead
      return remaining.length > 0 ? remaining : null;
    });
  };

  // Update currentBatch when extractedInvoices changes
  React.useEffect(() => {
    setCurrentBatch(extractedInvoices);
  }, [extractedInvoices, setCurrentBatch]);

  const pushInvoicesToOdoo = async (
    invoicesToPush: Invoice[],
    options?: { pdfBase64Override?: string; showModal?: boolean }
  ) => {
    if (invoicesToPush.length === 0) {
      throw new Error('No invoices selected for Odoo push.');
    }

    const pdfPayload = options?.pdfBase64Override
      ?? originalPdfBase64
      ?? invoicesToPush[0]?.pdfBase64;

    if (!pdfPayload) {
      throw new Error('Missing PDF data for the selected invoice. Re-upload the original file before pushing to Odoo.');
    }

    // Send as JSON (FormData has issues on Vercel)
    const response = await fetch('/api/push-to-odoo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoices: invoicesToPush,
        originalPdfBase64: pdfPayload,
      }),
    });

    const result = await response.json();
    console.log('📥 Response from server:', result);

    if (!response.ok) {
      throw new Error(result.error || 'Failed to push to Odoo');
    }

    setOdooResponseDetails(result);

    if (options?.showModal !== false) {
      setShowResponseModal(true);
    }

    const attachments = Array.isArray(result.attachmentInfo)
      ? (result.attachmentInfo as Array<{
          invoiceId?: string;
          invoiceNumber?: string;
          filename?: string;
          url?: string;
          size?: string;
        }>)
      : [];

    const syncTimestamp = new Date().toISOString();
    const webhookConfigured = Boolean(result.configuration?.webhookConfigured);

    if (webhookConfigured) {
      const updatedInvoices = invoicesToPush.map((invoice) => {
        const invoiceKey = getInvoiceKey(invoice);
        const attachment = attachments.find(att =>
          (att.invoiceId && att.invoiceId === invoiceKey) ||
          (att.invoiceNumber && att.invoiceNumber === invoice.invoiceNumber)
        );

        return {
          invoice,
          changes: {
            pdfUrl: attachment?.url,
            attachmentFilename: attachment?.filename,
            syncedAt: syncTimestamp,
          } as Partial<Invoice>,
        };
      });

      syncToOdoo(updatedInvoices);
    } else {
      console.warn('⚠️ Webhook not configured - data prepared but not delivered to Odoo');
      setError('Odoo webhook not configured on server. Data prepared but not sent.');
    }

    return result;
  };

  const handlePushToOdoo = async () => {
    if (!extractedInvoices) return;

    console.log('🚀 Starting push to Odoo...');
    console.log('Number of invoices:', extractedInvoices.length);
    console.log('Invoice numbers:', extractedInvoices.map(inv => inv.invoiceNumber));

    setIsPushingToOdoo(true);
    setError(null);

    try {
      const result = await pushInvoicesToOdoo(extractedInvoices, {
        pdfBase64Override: originalPdfBase64 ?? undefined,
      });

      const webhookConfigured = Boolean(result.configuration?.webhookConfigured);

      if (webhookConfigured) {
        setSuccess(`Successfully pushed ${result.invoiceCount} invoice(s) to Odoo. Task ID: ${result.taskId}`);
        setOriginalPdfBase64(null);
        removeExtractedInvoices(new Set(extractedInvoices.map(getInvoiceKey)));
      }
    } catch (err) {
      console.error('❌ Error pushing to Odoo:', err);
      setError(`Failed to push to Odoo: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsPushingToOdoo(false);
    }
  };

  const handlePushSingle = async (invoice: Invoice) => {
    const key = getInvoiceKey(invoice);
    setPushingInvoiceId(key);
    setError(null);

    try {
      const result = await pushInvoicesToOdoo([invoice], {
        pdfBase64Override: invoice.pdfBase64 ?? originalPdfBase64 ?? undefined,
      });

      const webhookConfigured = Boolean(result.configuration?.webhookConfigured);

      if (webhookConfigured) {
        setSuccess(`Invoice ${invoice.invoiceNumber} pushed to Odoo.`);
        removeExtractedInvoices(new Set([key]));
      }
    } catch (err) {
      console.error('❌ Error pushing invoice to Odoo:', err);
      setError(`Failed to push invoice ${invoice.invoiceNumber}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setPushingInvoiceId(null);
    }
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all extracted invoices? This cannot be undone.')) {
      console.log('🗑️ Clearing all extracted invoices');
      setExtractedInvoices(null);
      setOriginalPdfBase64(null);
      setShowSelector(false);
      resetPipeline();
      setSuccess('All extracted invoices cleared');
    }
  };

  const handleSaveLocally = () => {
    if (!extractedInvoices) return;
    removeExtractedInvoices(new Set(extractedInvoices.map(getInvoiceKey)));
    setOriginalPdfBase64(null);
    setSuccess('Invoices saved locally for later syncing.');
  };

  const handleTestConnection = async () => {
    console.log('🧪 Testing Odoo connection...');
    setError(null);

    try {
      const response = await fetch('/api/push-to-odoo?taskId=diagnostic');
      const result = await response.json();

      console.log('Test response:', result);

      // Show connection info
      const testInfo = {
        message: 'Connection test completed',
        webhookConfigured: result.configuration?.webhookConfigured || false,
        info: result
      };

      setOdooResponseDetails(testInfo);
      setShowResponseModal(true);
    } catch (err) {
      console.error('Test failed:', err);
      setError('Failed to test connection');
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
                  onClick={handleSaveLocally}
                >
                  Save Locally
                </Button>
                <Button
                  variant="danger"
                  icon={Trash2}
                  onClick={handleClearAll}
                >
                  Clear All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {extractedInvoices.map((invoice) => (
                <InvoiceCard
                  key={getInvoiceKey(invoice)}
                  invoice={invoice}
                  onSendToOdoo={handlePushSingle}
                  isSending={pushingInvoiceId === getInvoiceKey(invoice)}
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

      {/* Test Connection Button */}
      <div className="fixed bottom-4 right-4">
        <Button
          variant="secondary"
          size="sm"
          icon={TestTube}
          onClick={handleTestConnection}
        >
          Test Odoo Connection
        </Button>
      </div>

      {/* Response Details Modal */}
      <Modal
        isOpen={showResponseModal}
        onClose={() => setShowResponseModal(false)}
        title="Odoo Push Details"
        size="xl"
      >
        <div className="space-y-4">
          {odooResponseDetails && (
            <>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Response Summary</h4>
                <pre className="text-xs overflow-auto max-h-96">
                  {JSON.stringify(odooResponseDetails, null, 2)}
                </pre>
              </div>

              {odooResponseDetails.attachmentInfo && Array.isArray(odooResponseDetails.attachmentInfo) && (
                <div>
                  <h4 className="font-semibold mb-2">Attachments Included</h4>
                  <div className="space-y-2">
                    {(odooResponseDetails.attachmentInfo as Array<{
                      filename: string;
                      size: string;
                      url?: string;
                      invoiceId?: string;
                      invoiceNumber?: string;
                    }>).map((info, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-accent-hover px-3 py-2 text-sm">
                        <div>
                          <div className="font-medium text-primary-text">
                            {info.invoiceNumber ? `Invoice ${info.invoiceNumber}` : info.filename}
                          </div>
                          <div className="text-xs text-secondary-text">
                            {info.size}
                            {info.filename ? ` • ${info.filename}` : ''}
                          </div>
                        </div>
                        {info.url ? (
                          <a
                            href={info.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-accent-action px-3 py-1 text-xs font-medium text-accent-action transition-colors hover:bg-accent-hover"
                          >
                            View PDF
                          </a>
                        ) : (
                          <span className="text-xs text-secondary-text">Provided inline (base64)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {odooResponseDetails.odooResponse && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Odoo Response</h4>
                  <pre className="text-xs">
                    {JSON.stringify(odooResponseDetails.odooResponse, null, 2)}
                  </pre>
                </div>
              )}

              {!odooResponseDetails.odooResponse && (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-yellow-800">⚠️ No Response from Odoo</h4>
                  <p className="text-sm text-yellow-700">
                    Either the webhook is not configured, Odoo didn&apos;t respond, or there was an error.
                    Check the browser console for more details.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
