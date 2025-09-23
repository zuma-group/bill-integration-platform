// In-memory PDF storage for serving attachments via URL
// This is a temporary solution for Vercel serverless environment
// For production, consider using Vercel Blob Storage or S3

interface StoredPdf {
  data: string;  // Base64 encoded PDF
  mimeType: string;
  timestamp: number;
}

// Simple in-memory store (resets on deployment)
const pdfStore = new Map<string, StoredPdf>();

// Store PDF with automatic cleanup after 1 hour
export function storePdf(filename: string, base64Data: string, mimeType: string = 'application/pdf'): void {
  pdfStore.set(filename, {
    data: base64Data,
    mimeType,
    timestamp: Date.now()
  });

  // Auto-cleanup after 1 hour to prevent memory leak
  setTimeout(() => {
    pdfStore.delete(filename);
    console.log(`Cleaned up stored PDF: ${filename}`);
  }, 3600000); // 1 hour
}

// Retrieve stored PDF
export function getPdf(filename: string): StoredPdf | null {
  const pdf = pdfStore.get(filename);

  if (!pdf) {
    return null;
  }

  // Check if PDF is older than 1 hour (backup cleanup)
  const ageInMs = Date.now() - pdf.timestamp;
  if (ageInMs > 3600000) {
    pdfStore.delete(filename);
    return null;
  }

  return pdf;
}

// Delete stored PDF
export function deletePdf(filename: string): boolean {
  return pdfStore.delete(filename);
}

// Get all stored filenames (for debugging)
export function getStoredFilenames(): string[] {
  return Array.from(pdfStore.keys());
}

// Clear all stored PDFs
export function clearAllPdfs(): void {
  pdfStore.clear();
  console.log('Cleared all stored PDFs');
}

// Get storage size info
export function getStorageInfo(): { count: number; estimatedSizeKB: number } {
  let totalSize = 0;
  pdfStore.forEach(pdf => {
    // Rough estimate: base64 is ~33% larger than binary
    totalSize += pdf.data.length * 0.75;
  });

  return {
    count: pdfStore.size,
    estimatedSizeKB: Math.round(totalSize / 1024)
  };
}