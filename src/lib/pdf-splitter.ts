import { PDFDocument } from 'pdf-lib';
import { Invoice } from '@/types';

export async function splitPdfByInvoices(
  pdfBase64: string,
  invoices: Invoice[]
): Promise<Map<string, string>> {
  const pdfBytes = Buffer.from(pdfBase64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBytes);

  const splitPdfs = new Map<string, string>();

  // If single invoice, return original PDF
  if (invoices.length === 1) {
    splitPdfs.set(invoices[0].id!, pdfBase64);
    return splitPdfs;
  }

  // Split PDF by invoice page numbers
  for (const invoice of invoices) {
    // If invoice has specific page numbers, extract those pages
    if (invoice.pageNumbers && invoice.pageNumbers.length > 0) {
      const newPdf = await PDFDocument.create();

      // Copy pages for this invoice
      for (const pageNum of invoice.pageNumbers) {
        // PDF pages are 0-indexed, but pageNumbers are 1-indexed
        const pageIndex = pageNum - 1;

        // Ensure page index is valid
        if (pageIndex >= 0 && pageIndex < pdfDoc.getPageCount()) {
          const [page] = await newPdf.copyPages(pdfDoc, [pageIndex]);
          newPdf.addPage(page);
        }
      }

      const pdfBytes = await newPdf.save();
      const base64 = Buffer.from(pdfBytes).toString('base64');
      splitPdfs.set(invoice.id!, base64);
    }
    // If pageNumbers not specified but pageNumber is (for backward compatibility)
    else if (invoice.pageNumber) {
      const newPdf = await PDFDocument.create();
      const pageIndex = invoice.pageNumber - 1;

      if (pageIndex >= 0 && pageIndex < pdfDoc.getPageCount()) {
        const [page] = await newPdf.copyPages(pdfDoc, [pageIndex]);
        newPdf.addPage(page);

        const pdfBytes = await newPdf.save();
        const base64 = Buffer.from(pdfBytes).toString('base64');
        splitPdfs.set(invoice.id!, base64);
      }
    }
    // If no page information, include all pages (fallback)
    else {
      splitPdfs.set(invoice.id!, pdfBase64);
    }
  }

  return splitPdfs;
}

export function generateTaskId(): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substr(2, 9);
  return `TASK-${timestamp}-${randomStr}`;
}