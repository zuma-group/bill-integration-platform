import { NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/gmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const oauth2 = getOAuth2Client();
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
    ];
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to start OAuth' }, { status: 500 });
  }
}


