import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/invoices/[id] - update invoice core fields and line items
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const data = await request.json();

    // Update invoice core
    const updated = await prisma.invoice.update({
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
        status: data.status ? String(data.status).toUpperCase() : undefined,
        extractedAt: data.extractedAt ? new Date(data.extractedAt) : undefined,
        taskId: data.taskId ?? undefined,
        batchId: data.batchId ?? undefined,
      },
      include: { lineItems: true, attachments: true },
    });

    // Optional: replace line items if provided
    if (Array.isArray(data.lineItems)) {
      await prisma.$transaction([
        prisma.lineItem.deleteMany({ where: { invoiceId: id } }),
        prisma.lineItem.createMany({
          data: data.lineItems.map((li: any, idx: number) => ({
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

    // Optional: add attachment if provided
    if (data.attachment && data.attachment.url) {
      await prisma.attachment.create({
        data: {
          invoiceId: id,
          filename: data.attachment.filename || `INV-${id}.pdf`,
          url: data.attachment.url,
          mimeType: data.attachment.mimeType || 'application/pdf',
          sizeKb: data.attachment.sizeKb ?? null,
        },
      });
    }

    const final = await prisma.invoice.findUnique({ where: { id }, include: { lineItems: true, attachments: true } });
    return NextResponse.json(final);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update invoice' }, { status: 500 });
  }
}

// DELETE /api/invoices/[id] - delete invoice and cascades
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    await prisma.invoice.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete invoice' }, { status: 500 });
  }
}


