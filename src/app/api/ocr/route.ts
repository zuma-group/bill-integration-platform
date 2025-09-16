import { NextRequest, NextResponse } from 'next/server';
import { extractInvoiceData } from '@/lib/gemini';

// Explicitly use Node.js runtime for PDF processing
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { base64, mimeType } = body;

    if (!base64 || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: base64 and mimeType' },
        { status: 400 }
      );
    }

    const ocrResponse = await extractInvoiceData(base64, mimeType);

    return NextResponse.json(ocrResponse);
  } catch (error) {
    console.error('OCR API error - FULL DETAILS:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // ALWAYS return JSON, never let HTML error pages leak through
    return new Response(
      JSON.stringify({
        error: `OCR Processing Failed: ${errorMessage}`,
        details: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.stack : undefined : undefined
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}