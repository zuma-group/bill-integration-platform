import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/invoices - list invoices (basic pagination)
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const take = Math.min(200, Math.max(1, parseInt(url.searchParams.get('take') || '50', 10)));
    const skip = Math.max(0, parseInt(url.searchParams.get('skip') || '0', 10));

    const [items, total] = await Promise.all([
      prisma.invoice.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { lineItems: true, attachments: true },
      }),
      prisma.invoice.count(),
    ]);

    return NextResponse.json({ total, items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to list invoices' }, { status: 500 });
  }
}

// POST /api/invoices - create single or bulk invoices
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = Array.isArray(body) ? body : Array.isArray(body.invoices) ? body.invoices : [body];

    if (!Array.isArray(input) || input.length === 0) {
      return NextResponse.json({ error: 'No invoices provided' }, { status: 400 });
    }

    const created = await prisma.$transaction(
      input.map((inv) =>
        prisma.invoice.create({
          data: {
            invoiceNumber: inv.invoiceNumber,
            customerPoNumber: inv.customerPoNumber || null,
            invoiceDate: new Date(inv.invoiceDate),
            dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
            vendor: inv.vendor,
            customer: inv.customer,
            subtotal: inv.subtotal,
            taxAmount: inv.taxAmount ?? 0,
            total: inv.total,
            taxType: inv.taxType || null,
            currency: inv.currency || 'USD',
            paymentTerms: inv.paymentTerms || null,
            pageNumber: inv.pageNumber ?? null,
            pageNumbers: inv.pageNumbers || [],
            status: (inv.status || 'extracted').toUpperCase(),
            extractedAt: inv.extractedAt ? new Date(inv.extractedAt) : new Date(),
            taskId: inv.taskId || null,
            batchId: inv.batchId || null,
            lineItems: {
              create: (inv.lineItems || []).map((li: {
                description: string;
                partNumber?: string | null;
                quantity: number;
                unitPrice: number;
                amount: number;
                tax?: number;
                position?: number;
              }, idx: number) => ({
                description: li.description,
                partNumber: li.partNumber || null,
                quantity: li.quantity,
                unitPrice: li.unitPrice,
                amount: li.amount,
                tax: li.tax ?? 0,
                position: li.position ?? idx + 1,
              })),
            },
            attachments: inv.pdfUrl || inv.attachmentFilename
              ? {
                  create: [
                    {
                      filename: inv.attachmentFilename || `${inv.invoiceNumber || 'INV'}-${Date.now()}.pdf`,
                      url: inv.pdfUrl,
                      mimeType: inv.mimeType || 'application/pdf',
                    },
                  ],
                }
              : undefined,
          },
          include: { lineItems: true, attachments: true },
        })
      )
    );

    return NextResponse.json({ count: created.length, items: created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create invoices' }, { status: 500 });
  }
}


