import { NextRequest, NextResponse } from 'next/server';
import { splitPdfByInvoices, generateTaskId } from '@/lib/pdf-splitter';
import { Invoice } from '@/types';
import { uploadPdfBase64 } from '@/lib/s3';
import { normalizeToOdooDateFormat, determineCompanyId } from '@/lib/utils';

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
    let originalPdfBase64: string | undefined;

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

      // originalPdfBase64 may be omitted; we'll derive from invoice.pdfUrl if needed
    } else {
      return NextResponse.json(
        { error: `Unsupported Content-Type: ${contentType}. Expected multipart/form-data or application/json` },
        { status: 400 }
      );
    }

    // Validate invoices
    console.log('\n📋 STEP 1: VALIDATING INVOICES');
    console.log('Number of invoices received:', invoices?.length || 0);
    if (!Array.isArray(invoices) || invoices.length === 0) {
      console.error('❌ Validation failed: Invalid or empty invoices array');
      return NextResponse.json(
        { error: 'Invalid or empty invoices array' },
        { status: 400 }
      );
    }
    console.log('✅ Invoice validation passed');
    invoices.forEach((inv, idx) => {
      console.log(`  Invoice ${idx + 1}: ${inv.invoiceNumber || 'NO_NUMBER'} (ID: ${inv.id || 'NO_ID'})`);
    });

    // Generate unique task ID
    const taskId = generateTaskId();
    console.log('\n📝 STEP 2: GENERATING TASK ID');
    console.log('Task ID:', taskId);

    // Split PDF if multiple invoices
    console.log('\n📄 STEP 3: PROCESSING PDF');
    console.log('Has originalPdfBase64:', !!originalPdfBase64);
    console.log('Original PDF size:', originalPdfBase64 ? `${(originalPdfBase64.length * 0.75 / 1024).toFixed(2)} KB` : 'N/A');
    let splitPdfs: Map<string, string> = new Map();
    if (originalPdfBase64) {
      console.log('Splitting PDF by invoices...');
      splitPdfs = await splitPdfByInvoices(originalPdfBase64, invoices);
      console.log(`✅ PDF split complete. Split PDFs count: ${splitPdfs.size}`);
      splitPdfs.forEach((pdf, invId) => {
        console.log(`  Split PDF for invoice ${invId}: ${(pdf.length * 0.75 / 1024).toFixed(2)} KB`);
      });
    } else {
      console.log('⚠️ No originalPdfBase64 provided, will fetch from invoice.pdfUrl if needed');
    }

    const attachmentMeta: Array<{
      invoiceId: string;
      invoiceNumber: string;
      filename: string;
      size: string;
      url?: string;
    }> = [];

    // Transform data to match original working format (async for S3 upload)
    console.log('\n🔄 STEP 4: TRANSFORMING INVOICES FOR ODOO');
    console.log(`Processing ${invoices.length} invoice(s)...`);
    
    const transformedInvoices = await Promise.all(invoices.map(async (invoice: Invoice, index) => {
        console.log(`\n  📦 Processing invoice ${index + 1}/${invoices.length}: ${invoice.invoiceNumber || 'NO_NUMBER'}`);
        
        const invoiceKey = invoice.id ?? invoice.invoiceNumber ?? generateTaskId();
        const rawInvoiceNumber = invoice.invoiceNumber || `INV-${index + 1}`;
        const sanitizedNumber = rawInvoiceNumber.replace(/[^a-zA-Z0-9]/g, '_') || `INV_${index + 1}`;
        const filenameSuffix = invoiceKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || `IDX${index}`;
        const filename = `INV_${sanitizedNumber}_${filenameSuffix}.pdf`;
        
        console.log(`    Invoice key: ${invoiceKey}`);
        console.log(`    Filename: ${filename}`);

        const makeFileUrl = async (): Promise<string> => {
          console.log(`    📎 STEP 4.${index + 1}.1: PREPARING PDF FOR S3`);
          let base64 = splitPdfs.get(invoice.id || '') || originalPdfBase64;
          console.log(`      Has split PDF: ${!!splitPdfs.get(invoice.id || '')}`);
          console.log(`      Has originalPdfBase64: ${!!originalPdfBase64}`);
          console.log(`      Has invoice.pdfUrl: ${!!invoice.pdfUrl}`);
          
          if (!base64) {
            if (!invoice.pdfUrl) {
              console.error(`      ❌ Missing PDF data for invoice ${invoice.invoiceNumber}`);
              throw new Error('Missing PDF data: neither originalPdfBase64 nor invoice.pdfUrl provided');
            }
            console.log(`      Fetching PDF from: ${invoice.pdfUrl}`);
            const fetchStart = Date.now();
            const fetched = await fetch(invoice.pdfUrl);
            const fetchTime = Date.now() - fetchStart;
            console.log(`      Fetch completed in ${fetchTime}ms, status: ${fetched.status} ${fetched.statusText}`);
            
            if (!fetched.ok) {
              console.error(`      ❌ Failed to fetch PDF: ${fetched.status} ${fetched.statusText}`);
              throw new Error(`Failed to fetch PDF from ${invoice.pdfUrl}`);
            }
            const blob = await fetched.arrayBuffer();
            base64 = Buffer.from(blob).toString('base64');
            console.log(`      ✅ PDF fetched and converted to base64: ${(base64.length * 0.75 / 1024).toFixed(2)} KB`);
          } else {
            console.log(`      ✅ Using existing base64: ${(base64.length * 0.75 / 1024).toFixed(2)} KB`);
          }
          
          const key = `odoo/${filename}`;
          console.log(`      S3 key: ${key}`);
          
          attachmentMeta.push({
            invoiceId: invoiceKey,
            invoiceNumber: rawInvoiceNumber,
            filename,
            size: `${Math.round((base64.length * 0.75) / 1024)} KB`,
            url: undefined
          });

          console.log(`    📤 STEP 4.${index + 1}.2: UPLOADING TO S3`);
          console.log(`      Key: ${key}`);
          console.log(`      Size: ${(base64.length * 0.75 / 1024).toFixed(2)} KB`);
          const uploadStart = Date.now();
          
          try {
            const url = await uploadPdfBase64(key, base64, 'application/pdf');
            const uploadTime = Date.now() - uploadStart;
            console.log(`      ✅ S3 upload successful in ${uploadTime}ms`);
            console.log(`      URL: ${url}`);
            // set url on last pushed meta
            attachmentMeta[attachmentMeta.length - 1].url = url;
            return url;
          } catch (s3Error) {
            const uploadTime = Date.now() - uploadStart;
            console.error(`      ❌ S3 upload failed after ${uploadTime}ms`);
            console.error(`      Error:`, s3Error instanceof Error ? s3Error.message : s3Error);
            throw s3Error;
          }
        };

        const fileUrl = await makeFileUrl();
        console.log(`    ✅ PDF URL obtained: ${fileUrl.substring(0, 100)}...`);

        // (meta entry already set in makeFileUrl)

        console.log(`    📊 STEP 4.${index + 1}.3: PROCESSING LINE ITEMS`);
        console.log(`      Line items count: ${invoice.lineItems.length}`);
        const baseLines = invoice.lineItems.map((item, lineIdx) => {
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

          const lineItem = {
            product_code: item.partNumber || '',
            description: item.description,
            quantity: safeQuantity,
            unit_price: unitPrice,
            discount,
            taxes: [] as unknown[],
            subtotal,
          };
          
          if (lineIdx === 0) {
            console.log(`      Sample line item:`, {
              product_code: lineItem.product_code,
              description: lineItem.description.substring(0, 50),
              quantity: lineItem.quantity,
              unit_price: lineItem.unit_price,
              subtotal: lineItem.subtotal
            });
          }
          
          return lineItem;
        });
        
        console.log(`      ✅ Processed ${baseLines.length} line items`);

        console.log(`    💰 STEP 4.${index + 1}.4: CALCULATING TOTALS`);
        const subtotalValue = Number(
          baseLines.reduce((sum, line) => sum + Number(line.subtotal || 0), 0).toFixed(2)
        );
        console.log(`      Subtotal: $${subtotalValue.toFixed(2)}`);

        const taxAmountValue = Number((invoice.taxAmount ?? 0).toFixed(2));
        console.log(`      Tax amount: $${taxAmountValue.toFixed(2)}`);
        const taxes: Array<{ tax_type: string; amount: number }> = [];
        const taxType = invoice.taxType?.toUpperCase() || '';
        console.log(`      Tax type: ${taxType || 'NONE'}`);

        if (Math.abs(taxAmountValue) > 0) {
          if (taxType.includes('GST') && taxType.includes('PST')) {
            const gstEstimate = Number((subtotalValue * 0.05).toFixed(2));
            let pstEstimate = Number((taxAmountValue - gstEstimate).toFixed(2));

            if (pstEstimate < 0) {
              pstEstimate = Number((subtotalValue * 0.07).toFixed(2));
            }

            if (gstEstimate > 0) {
              taxes.push({ tax_type: 'GST', amount: gstEstimate });
            }
            if (pstEstimate > 0) {
              taxes.push({ tax_type: 'PST', amount: Number(pstEstimate.toFixed(2)) });
            }
          } else if (taxType.includes('GST')) {
            taxes.push({ tax_type: 'GST', amount: taxAmountValue });
          } else if (taxType.includes('PST')) {
            taxes.push({ tax_type: 'PST', amount: taxAmountValue });
          } else if (taxType) {
            taxes.push({ tax_type: taxType, amount: taxAmountValue });
          } else {
            taxes.push({ tax_type: 'Tax', amount: taxAmountValue });
          }
        }

        const taxTotalFromArray = taxes.reduce((sum, tax) => sum + tax.amount, 0);
        const taxTotalValue = taxes.length ? Number(taxTotalFromArray.toFixed(2)) : taxAmountValue;
        const lines = baseLines;
        const totalAmountValue = Number((subtotalValue + taxTotalValue).toFixed(2));
        
        console.log(`      Tax total: $${taxTotalValue.toFixed(2)}`);
        console.log(`      Total: $${totalAmountValue.toFixed(2)}`);
        console.log(`      Taxes breakdown:`, taxes);

        // Keep PDF base64 for later conversion to file when sending to Odoo
        // But DON'T include it in the invoice data

        console.log(`    🏗️ STEP 4.${index + 1}.5: BUILDING ODOO PAYLOAD`);
        const companyId = determineCompanyId(invoice.customerPoNumber);
        console.log(`      Company ID: ${companyId} (PO: ${invoice.customerPoNumber || 'NONE'})`);
        
        const transformedInvoice = {
          // Use original working format (camelCase, nested objects)
          invoiceNumber: rawInvoiceNumber,
          customerPoNumber: invoice.customerPoNumber || '',
          company_id: determineCompanyId(invoice.customerPoNumber),
          invoiceDate: normalizeToOdooDateFormat(invoice.invoiceDate),
          dueDate: normalizeToOdooDateFormat(invoice.dueDate),
          vendor: {
            name: invoice.vendor.name,
            address: invoice.vendor.address,
            taxId: invoice.vendor.taxId,
            email: invoice.vendor.email,
            phone: invoice.vendor.phone
          },
          customer: {
            name: invoice.customer.name,
            address: invoice.customer.address
          },
          lines,
          taxes,
          subtotal: subtotalValue,
          taxAmount: taxTotalValue,
          taxType: invoice.taxType,  // Show the tax type (GST, PST, etc.)
          total: totalAmountValue,
          currency: 'USD',  // Force to USD to ensure valid currency_id mapping in Odoo
          paymentTerms: invoice.paymentTerms || 'NET 30 DAYS',
          pageNumber: invoice.pageNumber,
          pageNumbers: invoice.pageNumbers,
          id: invoice.id,
          status: invoice.status,
          extractedAt: invoice.extractedAt,
          taskId: invoice.taskId,
          batchId: invoice.batchId,

          // Send attachments with url only (Odoo will fetch from URL)
          attachments: [{
            filename,
            url: fileUrl
          }]
        };
        
        console.log(`    ✅ Invoice ${index + 1} transformation complete`);
        console.log(`      Invoice number: ${transformedInvoice.invoiceNumber}`);
        console.log(`      Company ID: ${transformedInvoice.company_id}`);
        console.log(`      Lines: ${transformedInvoice.lines.length}`);
        console.log(`      Attachments: ${transformedInvoice.attachments.length}`);
        console.log(`      Attachment URL: ${transformedInvoice.attachments[0]?.url?.substring(0, 100)}...`);
        
        return transformedInvoice;
    }));
    
    console.log('\n✅ STEP 4 COMPLETE: All invoices transformed');
    console.log(`Total transformed invoices: ${transformedInvoices.length}`);
    
    const odooPayload = { invoices: transformedInvoices };
    console.log('\n📦 STEP 5: PAYLOAD CONSTRUCTION');
    const payloadStr = JSON.stringify(odooPayload);
    console.log(`Payload size: ${(payloadStr.length / 1024).toFixed(2)} KB`);
    console.log(`Payload structure:`, {
      invoicesCount: odooPayload.invoices.length,
      firstInvoice: {
        invoiceNumber: odooPayload.invoices[0]?.invoiceNumber,
        company_id: odooPayload.invoices[0]?.company_id,
        linesCount: odooPayload.invoices[0]?.lines?.length,
        attachmentsCount: odooPayload.invoices[0]?.attachments?.length,
        attachmentUrl: odooPayload.invoices[0]?.attachments?.[0]?.url?.substring(0, 100)
      }
    });

    // Forward to Odoo webhook (when configured)
    let odooResponseData = null;

    console.log('\n🌐 WEBHOOK CONFIGURATION:');
    console.log('ODOO_WEBHOOK_URL:', process.env.ODOO_WEBHOOK_URL || 'NOT SET');
    console.log('ODOO_API_KEY:', process.env.ODOO_API_KEY ? 'SET (hidden)' : 'NOT SET');

    // Make Odoo webhook required
    if (!process.env.ODOO_WEBHOOK_URL) {
      console.error('\n❌ CRITICAL: ODOO_WEBHOOK_URL is not configured');
      return NextResponse.json(
        {
          error: 'Odoo webhook is not configured. Please set ODOO_WEBHOOK_URL environment variable.',
          details: 'Invoice extraction requires Odoo integration to be set up properly.'
        },
        { status: 500 }
      );
    }

    if (process.env.ODOO_WEBHOOK_URL) {
      try {
        console.log('\n🚀 STEP 6: SENDING TO ODOO WEBHOOK');
        console.log('Webhook URL:', process.env.ODOO_WEBHOOK_URL);
        console.log('Number of invoices:', odooPayload.invoices.length);
        console.log('Invoice numbers:', odooPayload.invoices.map(inv => inv.invoiceNumber));

        // Odoo expects JSON with 'invoices' array - send full payload
        const odooRequestPayload = odooPayload;
        
        // PDFs are already stored and URLs are set - no need to embed base64
        
        // Headers for JSON request
        const headers = {
          'Content-Type': 'application/json',
          ...(process.env.ODOO_API_KEY && { 'X-API-Key': process.env.ODOO_API_KEY })
        };

        console.log('\n  📤 STEP 6.1: PREPARING REQUEST');
        console.log('    Headers:', {
          'Content-Type': headers['Content-Type'],
          'X-API-Key': headers['X-API-Key'] ? 'SET (hidden)' : 'NOT SET'
        });
        console.log('    Method: POST');
        console.log('    URL:', process.env.ODOO_WEBHOOK_URL);
        console.log('    Payload invoices count:', odooRequestPayload.invoices.length);
        console.log('    First invoice attachment URL:', odooRequestPayload.invoices[0]?.attachments?.[0]?.url?.substring(0, 150));
        
        const requestBody = JSON.stringify(odooRequestPayload);
        console.log('    Request body size:', (requestBody.length / 1024).toFixed(2), 'KB');
        
        console.log('\n  📡 STEP 6.2: SENDING REQUEST TO ODOO');
        const requestStart = Date.now();
        
        const odooResponse = await fetch(process.env.ODOO_WEBHOOK_URL, {
          method: 'POST',
          headers,
          body: requestBody
        });
        
        const requestTime = Date.now() - requestStart;
        console.log(`    Request completed in ${requestTime}ms`);

        console.log('\n  📥 STEP 6.3: PROCESSING ODOO RESPONSE');
        console.log('    Status:', odooResponse.status, odooResponse.statusText);
        console.log('    Status OK:', odooResponse.ok);
        console.log('    Response headers:', Object.fromEntries(odooResponse.headers.entries()));

        if (!odooResponse.ok) {
          const errorText = await odooResponse.text();
          console.error('\n    ❌ ODOO WEBHOOK FAILED');
          console.error('    Status:', odooResponse.status, odooResponse.statusText);
          console.error('    Error response body length:', errorText.length, 'chars');
          console.error('    Error response body (first 500 chars):', errorText.substring(0, 500));
          if (errorText.length > 500) {
            console.error('    ... (truncated)');
          }
          
          // Store error in response data so client knows Odoo rejected it
          try {
            // Try to parse as JSON if possible
            let parsedError;
            try {
              parsedError = JSON.parse(errorText);
              console.error('    Parsed error (JSON):', parsedError);
            } catch {
              parsedError = errorText;
            }
            odooResponseData = { error: parsedError, status: odooResponse.status, statusText: odooResponse.statusText };
          } catch {
            odooResponseData = { error: 'Failed to parse error response', status: odooResponse.status, statusText: odooResponse.statusText };
          }
          console.error('    ❌ Odoo rejected the request');
        } else {
          const responseText = await odooResponse.text();
          console.log('\n    ✅ ODOO WEBHOOK SUCCESS');
          console.log('    Response body length:', responseText.length, 'chars');
          console.log('    Response body (first 500 chars):', responseText.substring(0, 500));
          if (responseText.length > 500) {
            console.log('    ... (truncated)');
          }

          try {
            odooResponseData = JSON.parse(responseText);
            console.log('    ✅ Parsed as JSON successfully');
            console.log('    Parsed response keys:', Object.keys(odooResponseData));
            console.log('    Parsed response:', JSON.stringify(odooResponseData, null, 2).substring(0, 1000));
          } catch (parseError) {
            console.log('    ⚠️ Response is not JSON, using raw text');
            console.log('    Parse error:', parseError instanceof Error ? parseError.message : parseError);
            odooResponseData = { rawResponse: responseText };
          }
        }
      } catch (webhookError) {
        console.error('\n  🔥 STEP 6.4: CRITICAL ERROR SENDING TO ODOO');
        console.error('    Error type:', webhookError instanceof Error ? webhookError.constructor.name : typeof webhookError);
        console.error('    Error message:', webhookError instanceof Error ? webhookError.message : webhookError);
        if (webhookError instanceof Error) {
          console.error('    Error name:', webhookError.name);
          console.error('    Stack trace:', webhookError.stack);
        } else {
          console.error('    Error details:', webhookError);
        }
        odooResponseData = { 
          error: webhookError instanceof Error ? webhookError.message : String(webhookError),
          errorType: webhookError instanceof Error ? webhookError.constructor.name : typeof webhookError
        };
        // Continue even if webhook fails
      }
    }

    // Determine if Odoo actually accepted the data
    console.log('\n📊 STEP 7: DETERMINING SUCCESS STATUS');
    const odooSucceeded = odooResponseData !== null && !('error' in (odooResponseData || {})) && odooResponseData !== undefined;
    console.log('Odoo response data exists:', odooResponseData !== null);
    console.log('Odoo response has error:', odooResponseData && 'error' in odooResponseData);
    console.log('Odoo succeeded:', odooSucceeded);
    
    const responseData = {
      success: true,
      taskId,
      message: odooSucceeded ? 'Data sent to Odoo' : 'Data sent to Odoo but may have failed',
      invoiceCount: invoices.length,
      payload: odooPayload, // Include payload for debugging/documentation
      odooResponse: odooResponseData, // Include Odoo's response if available
      odooSucceeded, // Explicit flag for whether Odoo accepted the data
      attachmentInfo: attachmentMeta,
      warning: !process.env.S3_BUCKET ? 'S3 not configured. Using fallback storage (not recommended for production).' : undefined,
      configuration: {
        webhookConfigured: !!process.env.ODOO_WEBHOOK_URL,
        apiKeyConfigured: !!process.env.ODOO_API_KEY,
        s3Configured: !!process.env.S3_BUCKET
      }
    };

    console.log('\n🎯 STEP 8: FINAL RESPONSE TO CLIENT');
    console.log('Success:', responseData.success);
    console.log('Message:', responseData.message);
    console.log('Odoo succeeded:', responseData.odooSucceeded);
    console.log('Invoice count:', responseData.invoiceCount);
    console.log('Attachments count:', responseData.attachmentInfo.length);
    console.log('Configuration:', responseData.configuration);
    if (responseData.odooResponse) {
      console.log('Odoo response summary:', {
        hasError: 'error' in responseData.odooResponse,
        status: responseData.odooResponse.status,
        keys: Object.keys(responseData.odooResponse)
      });
    }
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
