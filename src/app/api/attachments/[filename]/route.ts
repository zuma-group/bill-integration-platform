import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || false,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// GET /api/attachments/[filename] - Retrieve PDF from S3
// This endpoint is used by Odoo to fetch PDFs using relative paths like /api/attachments/filename.pdf
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

    if (!process.env.S3_BUCKET) {
      return NextResponse.json(
        { error: 'S3 not configured' },
        { status: 500 }
      );
    }

    // Construct S3 key from filename (PDFs are stored in odoo/ directory)
    const s3Key = `odoo/${filename}`;
    
    console.log(`[Attachments API] Fetching PDF from S3: ${s3Key}`);

    try {
      // Get the PDF from S3
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: s3Key,
      });

      const response = await s3.send(command);
      
      if (!response.Body) {
        return NextResponse.json(
          { error: 'PDF not found in S3' },
          { status: 404 }
        );
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const reader = response.Body.transformToWebStream().getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      
      const pdfBuffer = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));

      // Return PDF as binary response
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': response.ContentType || 'application/pdf',
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      });
    } catch (s3Error) {
      console.error(`[Attachments API] S3 error for ${s3Key}:`, s3Error);
      return NextResponse.json(
        { error: 'Failed to retrieve PDF from S3', details: s3Error instanceof Error ? s3Error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Attachments API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to retrieve PDF',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}