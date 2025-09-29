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
    // Check content type
    const contentType = request.headers.get('content-type') || '';
    console.log('Request Content-Type:', contentType);

    let invoices: Invoice[];
    let originalPdfBase64: string;

    // Handle both FormData and JSON for compatibility
    if (contentType.includes('multipart/form-data')) {
      // Parse FormData
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch (formDataError) {
        console.error('FormData parsing error:', formDataError);
        return NextResponse.json(
          { error: `Failed to parse FormData: ${formDataError}` },
          { status: 500 }
        );
      }

      // Get invoices data from FormData
      const invoicesJson = formData.get('invoices') as string;
      if (!invoicesJson) {
        return NextResponse.json(
          { error: 'No invoices data provided in FormData' },
          { status: 400 }
        );
      }

      invoices = JSON.parse(invoicesJson) as Invoice[];

      // Get PDF file from FormData
      const pdfFile = formData.get('pdf') as File;
      if (!pdfFile) {
        return NextResponse.json(
          { error: 'No PDF file provided in FormData' },
          { status: 400 }
        );
      }

      // Convert PDF file to base64
      const pdfBytes = await pdfFile.arrayBuffer();
      const pdfBuffer = Buffer.from(pdfBytes);
      originalPdfBase64 = pdfBuffer.toString('base64');

    } else if (contentType.includes('application/json')) {
      // Fallback to JSON parsing (original method)
      const body = await request.json();
      invoices = body.invoices;
      originalPdfBase64 = body.originalPdfBase64;

      if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
        return NextResponse.json(
          { error: 'No invoices provided in JSON' },
          { status: 400 }
        );
      }

      if (!originalPdfBase64) {
        return NextResponse.json(
          { error: 'No PDF provided in JSON' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported Content-Type: ${contentType}. Expected multipart/form-data or application/json` },
        { status: 400 }
      );
    }

    // Validate invoices
    if (!Array.isArray(invoices) || invoices.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or empty invoices array' },
        { status: 400 }
      );
    }

    // Generate unique task ID
    const taskId = generateTaskId();

    // Split PDF if multiple invoices
    const splitPdfs = await splitPdfByInvoices(originalPdfBase64, invoices);

    const attachmentMeta: Array<{
      invoiceId: string;
      invoiceNumber: string;
      filename: string;
      size: string;
    }> = [];

    // Transform data to match Odoo's exact format
    const odooPayload: OdooBillPayload = {
      invoices: invoices.map((invoice: Invoice, index) => {
        const invoiceKey = invoice.id ?? invoice.invoiceNumber ?? generateTaskId();
        const rawInvoiceNumber = invoice.invoiceNumber || `INV-${index + 1}`;
        const sanitizedNumber = rawInvoiceNumber.replace(/[^a-zA-Z0-9]/g, '_') || `INV_${index + 1}`;
        const filenameSuffix = invoiceKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || `IDX${index}`;
        const filename = `INV_${sanitizedNumber}_${filenameSuffix}.pdf`;

        const pdfBase64 = splitPdfs.get(invoice.id || '') || originalPdfBase64;
        const estimatedSizeKb = Math.round(pdfBase64.length * 0.75 / 1024);
        attachmentMeta.push({
          invoiceId: invoiceKey,
          invoiceNumber: rawInvoiceNumber,
          filename,
          size: `${estimatedSizeKb} KB`
        });

        const vendorSummary = [
          invoice.vendor?.name,
          invoice.vendor?.address,
          invoice.vendor?.taxId ? `Tax ID: ${invoice.vendor.taxId}` : null,
          invoice.vendor?.email,
          invoice.vendor?.phone
        ].filter(Boolean).join('\n');

        const baseLines = invoice.lineItems.map(item => {
          const safeQuantity = Number.isFinite(item.quantity) && item.quantity > 0 ? Number(item.quantity) : 1;
          const rawAmount = Number.isFinite(item.amount) ? Number(item.amount) : 0;
          const derivedUnit = Number.isFinite(item.unitPrice) && item.unitPrice > 0
            ? Number(item.unitPrice)
            : rawAmount / safeQuantity;
          const unitPrice = Number((Number.isFinite(derivedUnit) ? derivedUnit : 0).toFixed(2));
          const grossTotal = Number((unitPrice * safeQuantity).toFixed(2));
          const desiredSubtotal = Number(rawAmount.toFixed(2));

          let discount = 0;
          if (grossTotal > 0 && Math.abs(grossTotal - desiredSubtotal) >= 0.01) {
            const discountPercentage = (1 - desiredSubtotal / grossTotal) * 100;
            discount = Number(Math.min(100, Math.max(0, discountPercentage)).toFixed(2));
          }

          const adjustedSubtotal = Number((grossTotal * (1 - discount / 100)).toFixed(2));
          const subtotal = Math.abs(adjustedSubtotal - desiredSubtotal) <= 0.01
            ? desiredSubtotal
            : adjustedSubtotal;

          return {
            product_code: item.partNumber || '',
            description: item.description,
            quantity: safeQuantity,
            unit_price: unitPrice,
            discount,
            taxes: [],
            subtotal,
          };
        });

        const subtotalValue = Number(
          baseLines.reduce((sum, line) => sum + line.subtotal, 0).toFixed(2)
        );

        const taxAmountValue = Number((invoice.taxAmount ?? 0).toFixed(2));
        const lines = [...baseLines];

        if (Math.abs(taxAmountValue) > 0) {
          lines.push({
            product_code: 'TAX',
            description: 'Sales Tax',
            quantity: 1,
            unit_price: taxAmountValue,
            discount: 0,
            taxes: [],
            subtotal: taxAmountValue
          });
        }

        const totalAmountValue = Number((subtotalValue + taxAmountValue).toFixed(2));

        // Keep PDF base64 for later conversion to file when sending to Odoo
        // But DON'T include it in the invoice data

        return {
          // Main invoice fields (capitalized as Odoo expects)
          "Invoice-No": rawInvoiceNumber,
          "Invoice-Date": invoice.invoiceDate,
          "Customer PO Number": invoice.customerPoNumber || '',
          "Customer": vendorSummary || invoice.vendor.name,
          "Customer No": invoice.vendor.taxId || '',
          "Vendor": invoice.vendor.name,
          "Vendor Address": invoice.vendor.address,
          "Vendor No": invoice.vendor.taxId || '',
          "Bill-To": invoice.customer.name,
          "Bill-To Address": invoice.customer.address,
          "Payment Terms": invoice.paymentTerms || 'NET 30 DAYS',
          "Subtotal": subtotalValue.toFixed(2),
          "Tax Amount": taxAmountValue.toFixed(2),
          "Total Amount": totalAmountValue.toFixed(2),
          "Currency": invoice.currency || 'USD',
          "invoice-or-credit": 'INVOICE' as const,

          // Optional fields (set defaults)
          "Carrier": '',
          "Date Shipped": '',
          "Sales Order No": '',
          "Incoterms": '',
          "Freight": '',

          // Line items
          lines,

          // Just send filename reference - actual PDF will be sent as separate file
          attachments: [{
            filename
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

        // Log a sample of the payload
        console.log('\nPayload structure (invoice data only, PDFs sent separately):');
        console.log(JSON.stringify(odooPayload, null, 2));

        // Create FormData to send invoice data and PDF files separately
        const formData = new FormData();

        // Add invoice data as JSON in 'invoices' field (what Odoo expects)
        formData.append('invoices', JSON.stringify(odooPayload));

        // Add PDF files as separate file attachments
        odooPayload.invoices.forEach((invoice, index) => {
          const invoiceRecord = invoices[index];
          const pdfBase64 = splitPdfs.get(invoiceRecord.id || '') || originalPdfBase64;
          const pdfBuffer = Buffer.from(pdfBase64, 'base64');
          const filename = invoice.attachments[0].filename;

          // Create a File object from the buffer
          const file = new File([pdfBuffer], filename, { type: 'application/pdf' });
          formData.append(`file_${index}`, file);

          console.log(`Adding PDF file_${index}: ${filename}`);
        });

        // Headers for multipart (don't set Content-Type, let fetch set it with boundary)
        const headers = {
          ...(process.env.ODOO_API_KEY && { 'X-API-Key': process.env.ODOO_API_KEY })
        };

        console.log('\nRequest headers:', headers);
        console.log('Sending as multipart/form-data with', odooPayload.invoices.length, 'PDF files');

        const odooResponse = await fetch(process.env.ODOO_WEBHOOK_URL, {
          method: 'POST',
          headers,
          body: formData
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
          } catch (parseError) {
            console.log('Response is not JSON, using raw text');
            console.log('Parse error:', parseError);
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
      attachmentInfo: attachmentMeta,
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
