import { NextRequest, NextResponse } from 'next/server';
import { getGmailClient, getMessageAttachments, ensureLabel, getProcessedLabelName } from '@/lib/gmail';
import { extractInvoiceData } from '@/lib/gemini';
import { storePdf } from '@/lib/pdf-storage';
import { randomUUID } from 'crypto';
import { Invoice } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Google Pub/Sub pushes a JWT to verify the message; for simplicity, we only handle base64 data here.
// Expecting a Pub/Sub push with a Gmail History notification as per Gmail API docs.

export async function POST(request: NextRequest) {
  try {
    const gmail = await getGmailClient();
    const userId = 'me';
    const processedLabel = await ensureLabel(gmail, userId, getProcessedLabelName());

    const { message } = await request.json();
    if (!message?.data) return NextResponse.json({ error: 'Missing Pub/Sub message data' }, { status: 400 });

    const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) as { emailAddress: string; historyId: string };

    // Fetch history to find new messages
    const history = await gmail.users.history.list({ userId, startHistoryId: decoded.historyId, historyTypes: ['messageAdded'] });
    const items = history.data.history || [];

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
            // Here you could push to a DB or webhook; for now we just count.
            count += invoices.length;
          } catch {}
        }

        await gmail.users.messages.modify({ userId, id: mid, requestBody: { addLabelIds: [processedLabel] } });
        processed.push({ messageId: mid, attachments: count });
      }
    }

    return NextResponse.json({ success: true, processed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to handle Pub/Sub notification' }, { status: 500 });
  }
}


