import { NextRequest, NextResponse } from 'next/server';
import { getPdf } from '@/lib/pdf-storage';

export const dynamic = 'force-dynamic';

// GET /api/attachments/[filename] - Retrieve stored PDF
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (!filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    // Retrieve PDF from storage
    const storedPdf = getPdf(filename);

    if (!storedPdf) {
      return NextResponse.json(
        { error: 'PDF not found or expired' },
        { status: 404 }
      );
    }

    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(storedPdf.data, 'base64');

    // Return PDF as binary response
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': storedPdf.mimeType || 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error retrieving PDF:', error);
    return NextResponse.json(
      {
        error: 'Failed to retrieve PDF',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}