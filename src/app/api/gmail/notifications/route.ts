import { NextRequest, NextResponse } from 'next/server';
import { getGmailClient, getMessageAttachments, ensureLabel, getProcessedLabelName } from '@/lib/gmail';
import { extractInvoiceData } from '@/lib/gemini';
import { storePdf } from '@/lib/pdf-storage';
import { randomUUID } from 'crypto';
import { Invoice } from '@/types';
import { enqueueInvoices } from '@/lib/server-queue';
import { getLastHistoryId, setLastHistoryId } from '@/lib/gmail-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Google Pub/Sub pushes a JWT to verify the message; for simplicity, we only handle base64 data here.
// Expecting a Pub/Sub push with a Gmail History notification as per Gmail API docs.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Handle Pub/Sub push endpoint URL verification challenge
    if (body && body.message === undefined && body.subscription && body.token) {
      console.log('[Gmail][Notification] Verification challenge received');
      return NextResponse.json({ token: body.token });
    }

    const { message } = body;
    if (!message?.data) return NextResponse.json({ error: 'Missing Pub/Sub message data' }, { status: 400 });

    const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) as { emailAddress?: string; historyId?: string };
    console.log('[Gmail][Notification] Received Pub/Sub push', {
      at: new Date().toISOString(),
      emailAddress: decoded.emailAddress,
      historyId: decoded.historyId,
    });

    // Acquire Gmail client after minimal parsing/logging to reduce latency
    const gmail = await getGmailClient();
    const userId = 'me';
    const processedLabel = await ensureLabel(gmail, userId, getProcessedLabelName());

    // Fetch history to find new messages
    // Use previously stored historyId if available; fallback to the one from this notification
    const storedHistoryId = getLastHistoryId();
    const startHistoryId = storedHistoryId || decoded.historyId;
    if (!startHistoryId) {
      console.warn('[Gmail][Notification] Missing historyId; ignoring notification to avoid 400');
      return NextResponse.json({ success: true, processed: [] });
    }

    const history = await gmail.users.history.list({
      userId,
      startHistoryId,
      historyTypes: ['messageAdded', 'labelsAdded'],
    });
    const items = history.data.history || [];
    console.log('[Gmail][Notification] History items', { count: items.length, startHistoryId });

    const processed: Array<{ messageId: string; attachments: number }> = [];

    for (const h of items) {
      for (const added of h.messagesAdded || []) {
        const mid = added.message?.id;
        if (!mid) continue;
        const full = await gmail.users.messages.get({ userId, id: mid, format: 'full' });
        const msg = full.data;
        if (!msg) continue;

        // Skip if already labeled
        if ((msg.labelIds || []).includes(processedLabel)) continue;

        const atts = await getMessageAttachments(gmail, userId, msg);
        let count = 0;
        for (const [aIdx, att] of atts.entries()) {
          try {
            const ocr = await extractInvoiceData(att.base64, att.mimeType);
            const safeBase = (msg.id || 'msg').replace(/[^a-zA-Z0-9_-]/g, '');
            const safeName = (att.filename || `attachment-${aIdx + 1}`).replace(/[^a-zA-Z0-9_.-]/g, '_');
            const filename = `${safeBase}_${safeName}`;
            storePdf(filename, att.base64, att.mimeType);
            const fileUrl = `/api/attachments/${encodeURIComponent(filename)}`;

            const invoices: Invoice[] = (ocr.invoices || []).map((inv, idx) => ({
              ...inv,
              id: randomUUID(),
              status: 'extracted',
              extractedAt: new Date().toISOString(),
              pdfUrl: fileUrl,
              attachmentFilename: filename,
              mimeType: att.mimeType,
            }));
            enqueueInvoices(invoices);
            count += invoices.length;
          } catch {}
        }

        await gmail.users.messages.modify({ userId, id: mid, requestBody: { addLabelIds: [processedLabel] } });
        console.log('[Gmail][Notification] Processed message', { messageId: mid, invoices: count });
        processed.push({ messageId: mid, attachments: count });
      }
    }

    // Update lastHistoryId: pick max of existing and any returned historyId
    try {
      if (decoded.historyId) setLastHistoryId(String(decoded.historyId));
      else if (items.length > 0 && items[items.length - 1]?.id) setLastHistoryId(String(items[items.length - 1]?.id));
    } catch {}

    console.log('[Gmail][Notification] Done', { processed: processed.length });
    return NextResponse.json({ success: true, processed });
  } catch (error) {
    console.error('[Gmail][Notification] Error', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to handle Pub/Sub notification' }, { status: 500 });
  }
}


