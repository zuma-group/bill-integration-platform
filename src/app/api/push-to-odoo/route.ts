import { NextRequest, NextResponse } from 'next/server';
import { splitPdfByInvoices, generateTaskId } from '@/lib/pdf-splitter';
import { OdooBillPayload, Invoice } from '@/types';

export const dynamic = 'force-dynamic'; // Prevent caching

export async function POST(request: NextRequest) {
  console.log('='.repeat(50));
  console.log('PUSH TO ODOO ENDPOINT CALLED');
  console.log('Timestamp:', new Date().toISOString());
  console.log('='.repeat(50));

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

    // Transform data to match Odoo's exact format
    const odooPayload: OdooBillPayload = {
      invoices: invoices.map((invoice: Invoice) => {
        // Generate filename for this invoice
        const filename = `INV${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

        // Get the PDF for this invoice (split if needed)
        const pdfBase64 = splitPdfs.get(invoice.id!) || originalPdfBase64;

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

          // Attachments with base64 content
          attachments: [{
            filename: filename,
            content: pdfBase64  // Send base64 directly
          }]
        };
      })
    };

    // Forward to Odoo webhook (when configured)
    let odooResponseData = null;

    console.log('\n🌐 WEBHOOK CONFIGURATION:');
    console.log('ODOO_WEBHOOK_URL:', process.env.ODOO_WEBHOOK_URL || 'NOT SET');
    console.log('ODOO_API_KEY:', process.env.ODOO_API_KEY ? 'SET (hidden)' : 'NOT SET');

    if (process.env.ODOO_WEBHOOK_URL) {
      try {
        console.log('\n🚀 ATTEMPTING TO SEND TO ODOO...');
        console.log('Webhook URL:', process.env.ODOO_WEBHOOK_URL);
        console.log('Number of invoices:', odooPayload.invoices.length);
        console.log('Invoice numbers:', odooPayload.invoices.map(inv => inv["Invoice-No"]));

        // Log payload size
        const payloadStr = JSON.stringify(odooPayload);
        console.log('Payload size:', (payloadStr.length / 1024).toFixed(2), 'KB');

        // Log a sample of the payload (without the full base64 content)
        const debugPayload = JSON.parse(JSON.stringify(odooPayload));
        debugPayload.invoices.forEach(inv => {
          if (inv.attachments && inv.attachments[0]?.content) {
            inv.attachments[0].content = `[BASE64 DATA - ${inv.attachments[0].content.length} chars]`;
          }
        });
        console.log('\nPayload structure (base64 truncated):');
        console.log(JSON.stringify(debugPayload, null, 2));

        const headers = {
          'Content-Type': 'application/json',
          ...(process.env.ODOO_API_KEY && { 'X-API-Key': process.env.ODOO_API_KEY })
        };

        console.log('\nRequest headers:', headers);

        const odooResponse = await fetch(process.env.ODOO_WEBHOOK_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(odooPayload)
        });

        console.log('\n📡 Response received from Odoo:');
        console.log('Status:', odooResponse.status, odooResponse.statusText);
        console.log('Headers:', Object.fromEntries(odooResponse.headers.entries()));

        if (!odooResponse.ok) {
          const errorText = await odooResponse.text();
          console.error('❌ ODOO WEBHOOK FAILED');
          console.error('Status:', odooResponse.status, odooResponse.statusText);
          console.error('Error response body:', errorText);
          // Don't fail the entire request if Odoo fails
        } else {
          const responseText = await odooResponse.text();
          console.log('✅ ODOO WEBHOOK SUCCESS');
          console.log('Raw response:', responseText);

          try {
            odooResponseData = JSON.parse(responseText);
            console.log('Parsed response:', odooResponseData);
          } catch {
            console.log('Response is not JSON, using raw text');
            odooResponseData = { rawResponse: responseText };
          }
        }
      } catch (webhookError) {
        console.error('\n🔥 CRITICAL ERROR sending to Odoo webhook:');
        console.error('Error type:', webhookError instanceof Error ? webhookError.constructor.name : typeof webhookError);
        console.error('Error message:', webhookError instanceof Error ? webhookError.message : webhookError);
        console.error('Stack trace:', webhookError instanceof Error ? webhookError.stack : 'No stack trace');
        // Continue even if webhook fails
      }
    } else {
      console.warn('\n⚠️ ODOO_WEBHOOK_URL is not configured');
      console.warn('Data prepared but NOT sent to Odoo');
    }

    const responseData = {
      success: true,
      taskId,
      message: process.env.ODOO_WEBHOOK_URL ? 'Data sent to Odoo' : 'Data prepared for Odoo (webhook not configured)',
      invoiceCount: invoices.length,
      payload: odooPayload, // Include payload for debugging/documentation
      odooResponse: odooResponseData, // Include Odoo's response if available
      attachmentInfo: odooPayload.invoices.map(inv => ({
        filename: inv.attachments[0]?.filename,
        size: inv.attachments[0]?.content ? Math.round(inv.attachments[0].content.length * 0.75 / 1024) + ' KB' : '0 KB'
      })), // Info about attachments
      configuration: {
        webhookConfigured: !!process.env.ODOO_WEBHOOK_URL,
        apiKeyConfigured: !!process.env.ODOO_API_KEY
      }
    };

    console.log('\n🎯 FINAL RESPONSE TO CLIENT:');
    console.log('Success:', responseData.success);
    console.log('Message:', responseData.message);
    console.log('Configuration:', responseData.configuration);
    console.log('='.repeat(50));

    return NextResponse.json(responseData);

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