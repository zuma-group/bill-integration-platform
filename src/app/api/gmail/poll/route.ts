import { NextRequest, NextResponse } from 'next/server';
import { getGmailClient, ensureLabel, getProcessedLabelName, listCandidateMessages, getMessageAttachments } from '@/lib/gmail';
import { extractInvoiceData } from '@/lib/gemini';
import { Invoice } from '@/types';
import { storePdf } from '@/lib/pdf-storage';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const maxParam = url.searchParams.get('max') || '10';
    const max = Math.min(50, Math.max(1, parseInt(maxParam, 10) || 10));

    const gmail = await getGmailClient();
    const userId = 'me';
    const processedLabel = await ensureLabel(gmail, userId, getProcessedLabelName());

    const messages = await listCandidateMessages(gmail, userId, max);

    const results: Array<{
      messageId: string;
      subject?: string;
      attachments: Array<{
        filename: string;
        mimeType: string;
        invoiceCount?: number;
        invoices?: Invoice[];
      }>;
      error?: string;
    }> = [];

    for (const msg of messages) {
      try {
        // Skip if already has processed label
        const hasProcessed = (msg.labelIds || []).includes(processedLabel);
        if (hasProcessed) continue;

        const headers = (msg.payload?.headers as Array<{ name?: string; value?: string }> | undefined) || [];
        const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value;

        const attachments = await getMessageAttachments(gmail, userId, msg);
        const processed: Array<{ filename: string; mimeType: string; invoiceCount?: number; invoices?: Invoice[] }> = [];

        for (const [aIdx, att] of attachments.entries()) {
          try {
            const ocr = await extractInvoiceData(att.base64, att.mimeType);
            // Store attachment once and reference by URL to avoid large localStorage usage
            const safeBase = (msg.id || 'msg').replace(/[^a-zA-Z0-9_-]/g, '');
            const safeName = (att.filename || `attachment-${aIdx + 1}`).replace(/[^a-zA-Z0-9_.-]/g, '_');
            const filename = `${safeBase}_${safeName}`;
            storePdf(filename, att.base64, att.mimeType);
            const fileUrl = `/api/attachments/${encodeURIComponent(filename)}`;
            // enrich invoices with base64 of the source doc and defaults
            const invoices: Invoice[] = (ocr.invoices || []).map((inv, idx) => ({
              ...inv,
              id: randomUUID(),
              status: inv.status || 'extracted',
              extractedAt: inv.extractedAt || new Date().toISOString(),
              pdfUrl: fileUrl,
              attachmentFilename: filename,
              mimeType: att.mimeType,
            }));
            processed.push({ filename: att.filename, mimeType: att.mimeType, invoiceCount: ocr.invoiceCount, invoices });
          } catch (err) {
            processed.push({ filename: att.filename, mimeType: att.mimeType });
          }
        }

        if (msg.id) {
          await gmail.users.messages.modify({
            userId,
            id: msg.id,
            requestBody: { addLabelIds: [processedLabel] },
          });
        }

        results.push({ messageId: msg.id || 'unknown', subject, attachments: processed });
      } catch (inner) {
        results.push({ messageId: msg.id || 'unknown', attachments: [], error: inner instanceof Error ? inner.message : 'Unknown error' });
      }
    }

    return NextResponse.json({ count: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to poll Gmail' }, { status: 500 });
  }
}


