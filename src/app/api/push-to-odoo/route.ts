import { NextRequest, NextResponse } from 'next/server';
import { splitPdfByInvoices, generateTaskId } from '@/lib/pdf-splitter';
import { OdooBillPayload, Invoice } from '@/types';
import { storePdf } from '@/lib/pdf-storage';

export const dynamic = 'force-dynamic'; // Prevent caching

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invoices, originalPdfBase64 } = body;

    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      return NextResponse.json(
        { error: 'No invoices provided' },
        { status: 400 }
      );
    }

    if (!originalPdfBase64) {
      return NextResponse.json(
        { error: 'No PDF provided' },
        { status: 400 }
      );
    }

    // Generate unique task ID
    const taskId = generateTaskId();

    // Split PDF if multiple invoices
    const splitPdfs = await splitPdfByInvoices(originalPdfBase64, invoices);

    // Get base URL for attachment URLs
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                   (request.headers.get('host') ? `https://${request.headers.get('host')}` : '');

    // Transform data to match Odoo's exact format
    const odooPayload: OdooBillPayload = {
      invoices: invoices.map((invoice: Invoice) => {
        // Generate filename for this invoice
        const filename = `INV${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

        // Get the PDF for this invoice (split if needed)
        const pdfBase64 = splitPdfs.get(invoice.id!) || originalPdfBase64;

        // Store PDF so it can be retrieved via URL
        storePdf(filename, pdfBase64);

        return {
          // Main invoice fields (capitalized as Odoo expects)
          "Invoice-No": invoice.invoiceNumber,
          "Invoice-Date": invoice.invoiceDate,
          "Customer PO Number": invoice.customerPoNumber || "",
          "Customer": `${invoice.customer.name}\n${invoice.customer.address}`,
          "Customer No": "", // We don't extract this
          "Payment Terms": invoice.paymentTerms || "NET 30 DAYS",
          "Subtotal": invoice.subtotal.toFixed(2),
          "Tax Amount": invoice.taxAmount.toFixed(2),
          "Total Amount": invoice.total.toFixed(2),
          "invoice-or-credit": "INVOICE" as const,

          // Optional fields (set defaults)
          "Carrier": "",
          "Date Shipped": "",
          "Sales Order No": "",
          "Incoterms": "",
          "Freight": "",

          // Line items
          lines: invoice.lineItems.map(item => ({
            product_code: item.partNumber || "", // partNumber maps to product_code
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            discount: 0, // We don't extract discount
            taxes: [],
            subtotal: item.amount
          })),

          // Attachments with URL format
          attachments: [{
            filename: filename,
            url: baseUrl ? `${baseUrl}/api/attachments/${filename}` : `/api/attachments/${filename}`
          }]
        };
      })
    };

    // Forward to Odoo webhook (when configured)
    let odooResponseData = null;
    if (process.env.ODOO_WEBHOOK_URL) {
      try {
        console.log('Sending to Odoo webhook:', process.env.ODOO_WEBHOOK_URL);
        console.log('Payload:', JSON.stringify(odooPayload, null, 2));

        const odooResponse = await fetch(process.env.ODOO_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.ODOO_API_KEY && { 'X-API-Key': process.env.ODOO_API_KEY })
          },
          body: JSON.stringify(odooPayload)
        });

        if (!odooResponse.ok) {
          const errorText = await odooResponse.text();
          console.error(`Odoo webhook failed: ${odooResponse.status} ${odooResponse.statusText}`);
          console.error('Error response:', errorText);
          // Don't fail the entire request if Odoo fails
        } else {
          odooResponseData = await odooResponse.json();
          console.log('Odoo response:', odooResponseData);
        }
      } catch (webhookError) {
        console.error('Failed to send to Odoo webhook:', webhookError);
        // Continue even if webhook fails
      }
    }

    return NextResponse.json({
      success: true,
      taskId,
      message: process.env.ODOO_WEBHOOK_URL ? 'Data sent to Odoo' : 'Data prepared for Odoo (webhook not configured)',
      invoiceCount: invoices.length,
      payload: odooPayload, // Include payload for debugging/documentation
      odooResponse: odooResponseData, // Include Odoo's response if available
      attachmentUrls: odooPayload.invoices.map(inv => inv.attachments[0]?.url) // List of attachment URLs
    });

  } catch (error) {
    console.error('Push to Odoo error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process invoices',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}

// GET endpoint for retrieving task data (if needed)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json(
      { error: 'taskId parameter is required' },
      { status: 400 }
    );
  }

  // Since we're not using a database, return a message explaining the workflow
  return NextResponse.json({
    message: 'This is a push-based integration. Invoice data is sent directly to Odoo via POST request.',
    taskId,
    info: 'To send invoices to Odoo, use POST /api/push-to-odoo with invoice data and PDF.'
  });
}