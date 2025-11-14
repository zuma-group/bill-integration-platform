import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractKeyFromUrl, getObjectUrl, shouldUseSignedUrls } from '@/lib/s3';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Minimal shape for line items coming from Prisma including possible Decimal/unknown types
type UnknownLineItem = {
  quantity?: unknown;
  unitPrice?: unknown;
  amount?: unknown;
  tax?: unknown;
  [key: string]: unknown;
};

const DB_WARNING = 'Database not available. Invoices are held in memory only.';

function isDatabaseUnavailable(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P1000', 'P1001', 'P1002', 'P1003', 'P1008'].includes(error.code);
  }

  return false;
}

// GET /api/invoices - list invoices (basic pagination)
export async function GET(request: NextRequest) {
  // Check if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not configured, returning empty invoice list');
    return NextResponse.json({
      total: 0,
      items: [],
      warning: DB_WARNING,
    });
  }

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

    // Normalize: lowercase status, numeric fields; flatten first attachment with fresh URL
    const normalized = await Promise.all(
      items.map(async (inv) => {
        const firstAtt = Array.isArray(inv.attachments) && inv.attachments.length > 0 ? inv.attachments[0] : undefined;
        const normalizedLineItems = (inv.lineItems || []).map((li: UnknownLineItem) => ({
          ...li,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          amount: Number(li.amount),
          tax: Number(li.tax ?? 0),
        }));
        let pdfUrl: string | undefined;
        if (firstAtt?.url) {
          const key = extractKeyFromUrl(firstAtt.url) || undefined;
          if (key) {
            try {
              pdfUrl = await getObjectUrl(key);
            } catch (err) {
              console.error('Failed to resolve attachment URL from storage', err);
              pdfUrl = firstAtt.url;
            }
          } else {
            pdfUrl = firstAtt.url;
          }
        }
        return {
          ...inv,
          status: String(inv.status).toLowerCase(),
          subtotal: Number(inv.subtotal),
          taxAmount: Number(inv.taxAmount ?? 0),
          total: Number(inv.total),
          lineItems: normalizedLineItems,
          pdfUrl,
          attachmentFilename: firstAtt?.filename,
          mimeType: firstAtt?.mimeType,
        } as unknown as typeof inv & { pdfUrl?: string; attachmentFilename?: string; mimeType?: string };
      })
    );

    return NextResponse.json({ total, items: normalized });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn('Database unavailable, returning empty invoice list');
      return NextResponse.json({ total: 0, items: [], warning: DB_WARNING });
    }

    console.error('Error fetching invoices:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to list invoices',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    }, { status: 500 });
  }
}

// POST /api/invoices - create single or bulk invoices
export async function POST(request: NextRequest) {
  const body = await request.json();
  const input = Array.isArray(body) ? body : Array.isArray(body.invoices) ? body.invoices : [body];

  if (!Array.isArray(input) || input.length === 0) {
    return NextResponse.json({ error: 'No invoices provided' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not configured, skipping invoice persistence');
    return NextResponse.json({ count: input.length, items: input, warning: DB_WARNING });
  }

  try {
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
                quantity: number | null | undefined;
                unitPrice: number | null | undefined;
                amount: number | null | undefined;
                tax?: number | null | undefined;
                position?: number | null | undefined;
              }, idx: number) => {
                const safeQuantity = Number.isFinite(li?.quantity as number) && (li?.quantity as number) > 0 ? Number(li?.quantity) : 1;
                const rawAmount = Number.isFinite(li?.amount as number) ? Number(li?.amount) : 0;
                const derivedUnit = Number.isFinite(li?.unitPrice as number) && (li?.unitPrice as number) > 0
                  ? Number(li?.unitPrice)
                  : (safeQuantity > 0 ? rawAmount / safeQuantity : 0);
                const unitPrice = Number((Number.isFinite(derivedUnit) ? derivedUnit : 0).toFixed(2));
                const amount = Number((Number.isFinite(rawAmount) ? rawAmount : unitPrice * safeQuantity).toFixed(2));
                const tax = Number.isFinite(li?.tax as number) ? Number(li?.tax) : 0;

                return {
                  description: li.description,
                  partNumber: li.partNumber || null,
                  quantity: safeQuantity,
                  unitPrice,
                  amount,
                  tax,
                  position: (li?.position ?? idx + 1) as number,
                };
              }),
            },
            attachments: inv.pdfUrl || inv.attachmentFilename
              ? {
                  create: [
                    {
                      filename: inv.attachmentFilename || `${inv.invoiceNumber || 'INV'}-${Date.now()}.pdf`,
                      // Store KEY, not signed URL, when using signed mode. Otherwise store URL.
                      url: (() => {
                        const key = extractKeyFromUrl(inv.pdfUrl);
                        if (shouldUseSignedUrls() && key) return key;
                        return inv.pdfUrl;
                      })(),
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

    // Normalize: lowercase status, numeric fields; flatten attachment with fresh URL in response
    const normalized = await Promise.all(
      created.map(async (inv) => {
        const firstAtt = Array.isArray(inv.attachments) && inv.attachments.length > 0 ? inv.attachments[0] : undefined;
        const normalizedLineItems = (inv.lineItems || []).map((li: UnknownLineItem) => ({
          ...li,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          amount: Number(li.amount),
          tax: Number(li.tax ?? 0),
        }));
        let pdfUrl: string | undefined;
        if (firstAtt?.url) {
          const key = extractKeyFromUrl(firstAtt.url) || undefined;
          if (key) {
            try {
              pdfUrl = await getObjectUrl(key);
            } catch (err) {
              console.error('Failed to resolve attachment URL from storage', err);
              pdfUrl = firstAtt.url;
            }
          } else {
            pdfUrl = firstAtt.url;
          }
        }
        return {
          ...inv,
          status: String(inv.status).toLowerCase(),
          subtotal: Number(inv.subtotal),
          taxAmount: Number(inv.taxAmount ?? 0),
          total: Number(inv.total),
          lineItems: normalizedLineItems,
          pdfUrl,
          attachmentFilename: firstAtt?.filename,
          mimeType: firstAtt?.mimeType,
        } as unknown as typeof inv & { pdfUrl?: string; attachmentFilename?: string; mimeType?: string };
      })
    );

    return NextResponse.json({ count: normalized.length, items: normalized });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.warn('Database unavailable, skipping invoice persistence');
      return NextResponse.json({ count: input.length, items: input, warning: DB_WARNING });
    }

    console.error('Error creating invoices:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create invoices',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    }, { status: 500 });
  }
}


