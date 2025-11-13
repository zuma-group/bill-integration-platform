import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractKeyFromUrl, shouldUseSignedUrls } from '@/lib/s3';
import type { InvoiceStatus } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/invoices/[id] - update invoice core fields and line items
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json();

    // Update invoice core
    try {
      await prisma.invoice.update({
        where: { id },
        data: {
          invoiceNumber: data.invoiceNumber ?? undefined,
          customerPoNumber: data.customerPoNumber ?? undefined,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          vendor: data.vendor ?? undefined,
          customer: data.customer ?? undefined,
          subtotal: data.subtotal ?? undefined,
          taxAmount: data.taxAmount ?? undefined,
          total: data.total ?? undefined,
          taxType: data.taxType ?? undefined,
          currency: data.currency ?? undefined,
          paymentTerms: data.paymentTerms ?? undefined,
          pageNumber: data.pageNumber ?? undefined,
          pageNumbers: Array.isArray(data.pageNumbers) ? data.pageNumbers : undefined,
          status: data.status ? (String(data.status).toUpperCase() as InvoiceStatus) : undefined,
          extractedAt: data.extractedAt ? new Date(data.extractedAt) : undefined,
          taskId: data.taskId ?? undefined,
          batchId: data.batchId ?? undefined,
        },
        include: { lineItems: true, attachments: true },
      });
    } catch (e: unknown) {
      // Record not found
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('No record was found for an update')) {
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      }
      throw e;
    }

    // Optional: replace line items if provided
    if (Array.isArray(data.lineItems)) {
      await prisma.$transaction([
        prisma.lineItem.deleteMany({ where: { invoiceId: id } }),
        prisma.lineItem.createMany({
          data: data.lineItems.map((li: {
            description: string;
            partNumber?: string | null;
            quantity: number;
            unitPrice: number;
            amount: number;
            tax?: number;
            position?: number;
          }, idx: number) => ({
            invoiceId: id,
            description: li.description,
            partNumber: li.partNumber || null,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            amount: li.amount,
            tax: li.tax ?? 0,
            position: li.position ?? idx + 1,
          })),
        }),
      ]);
    }

    // Optional: add attachment if provided (supports both 'attachment' and top-level pdfUrl/attachmentFilename)
    if ((data.attachment && data.attachment.url) || data.pdfUrl) {
      const incomingUrl = data.attachment?.url || data.pdfUrl;
      const filename =
        data.attachment?.filename ||
        data.attachmentFilename ||
        `INV-${id}.pdf`;
      const mimeType =
        data.attachment?.mimeType ||
        data.mimeType ||
        'application/pdf';
      const sizeKb = data.attachment?.sizeKb ?? null;

      // Store key when signed URLs are enabled; otherwise store the given URL
      const maybeKey = extractKeyFromUrl(incomingUrl);
      const urlToPersist =
        shouldUseSignedUrls() && maybeKey ? maybeKey : (incomingUrl as string);

      await prisma.attachment.create({
        data: {
          invoiceId: id,
          filename,
          url: urlToPersist,
          mimeType,
          sizeKb,
        },
      });
    }

    const final = await prisma.invoice.findUnique({ where: { id }, include: { lineItems: true, attachments: true } });
    // Normalize status to lowercase and flatten first attachment
    const normalized = final
      ? {
          ...final,
          status: String(final.status).toLowerCase(),
          pdfUrl: final.attachments?.[0]?.url,
          attachmentFilename: final.attachments?.[0]?.filename,
          mimeType: final.attachments?.[0]?.mimeType,
        }
      : null;
    return NextResponse.json(normalized);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update invoice' }, { status: 500 });
  }
}

// DELETE /api/invoices/[id] - delete invoice and cascades
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.invoice.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete invoice' }, { status: 500 });
  }
}


