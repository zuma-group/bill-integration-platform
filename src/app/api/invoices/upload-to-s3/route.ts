import { NextRequest, NextResponse } from 'next/server';
import { uploadPdfBase64 } from '@/lib/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JsonBody = {
  base64?: string;
  filename?: string;
  mimeType?: string;
  folder?: string;
  key?: string; // full key override
  // accepted aliases
  pdfBase64?: string;
  originalPdfBase64?: string;
  dataUrl?: string;
  pdfUrl?: string;
  url?: string;
};

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Ensure env is configured
    if (!process.env.S3_BUCKET) {
      return NextResponse.json(
        { error: 'S3 is not configured (S3_BUCKET missing).' },
        { status: 500 }
      );
    }

    let base64: string | undefined;
    let filename: string | undefined;
    let mimeType: string | undefined;
    let keyOverride: string | undefined;
    let folder = 'uploads';
    const toBase64FromMaybeDataUrl = (input: string): string => {
      // Accept pure base64 or data URLs: data:application/pdf;base64,<data>
      const idx = input.indexOf(',');
      if (input.startsWith('data:') && idx !== -1) {
        return input.slice(idx + 1);
      }
      return input;
    };

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('pdf') as File | null;
      if (!file) {
        return NextResponse.json({ error: "Missing 'pdf' file in form-data" }, { status: 400 });
      }
      filename = (form.get('filename') as string) || file.name || 'document.pdf';
      mimeType = file.type || 'application/pdf';
      folder = (form.get('folder') as string) || folder;
      keyOverride = (form.get('key') as string) || undefined;

      const arrayBuf = await file.arrayBuffer();
      base64 = Buffer.from(arrayBuf).toString('base64');
    } else if (contentType.includes('application/json')) {
      const body = (await request.json()) as JsonBody;
      base64 =
        body.base64 ||
        body.pdfBase64 ||
        body.originalPdfBase64 ||
        (body.dataUrl ? toBase64FromMaybeDataUrl(body.dataUrl) : undefined);
      filename = body.filename || 'document.pdf';
      mimeType = body.mimeType || 'application/pdf';
      folder = body.folder || folder;
      keyOverride = body.key;
      // Fallback: fetch from a provided URL and convert to base64
      const providedUrl = body.pdfUrl || body.url;
      if (!base64 && providedUrl) {
        const resp = await fetch(providedUrl);
        if (!resp.ok) {
          return NextResponse.json(
            { error: `Failed to fetch pdfUrl: ${resp.status} ${resp.statusText}` },
            { status: 400 }
          );
        }
        const arr = await resp.arrayBuffer();
        base64 = Buffer.from(arr).toString('base64');
        // attempt to infer mime type
        mimeType = mimeType || resp.headers.get('content-type') || 'application/pdf';
        // keep filename if provided; otherwise try infer from URL
        if (!body.filename && providedUrl) {
          try {
            const u = new URL(providedUrl);
            const name = u.pathname.split('/').pop();
            if (name) filename = name;
          } catch {}
        }
      }
      if (!base64) {
        return NextResponse.json(
          { error: "Missing 'base64' in JSON body. Provide one of: base64, pdfBase64, originalPdfBase64, dataUrl, or pdfUrl/url." },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported Content-Type: ${contentType}. Use multipart/form-data or application/json.` },
        { status: 415 }
      );
    }

    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '');
    const safeName = (filename || 'document.pdf').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const key = keyOverride || `${safeFolder}/${safeName}`;

    const url = await uploadPdfBase64(key, base64!, mimeType);
    const sizeKb = Math.round((base64!.length * 0.75) / 1024);

    return NextResponse.json({
      success: true,
      key,
      url,
      filename: safeName,
      mimeType,
      sizeKb,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to upload to S3',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      },
      { status: 500 }
    );
  }
}


