import { NextRequest, NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/gmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens) return NextResponse.json({ error: 'No tokens returned' }, { status: 500 });

    if (tokens.refresh_token) {
      console.log('GMAIL_OAUTH_REFRESH_TOKEN=', tokens.refresh_token);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json({
      success: true,
      tokenType: tokens.token_type,
      hasRefreshToken: Boolean(tokens.refresh_token),
      refreshToken: tokens.refresh_token ? (isDev ? tokens.refresh_token : 'REDACTED_SET_THIS_IN_ENV') : null,
      note: tokens.refresh_token
        ? isDev
          ? 'Copy refreshToken and set GMAIL_OAUTH_REFRESH_TOKEN.'
          : 'Copy from server logs (function logs) and set GMAIL_OAUTH_REFRESH_TOKEN.'
        : 'If no refresh_token, re-run consent with prompt=consent & access_type=offline.'
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to complete OAuth' }, { status: 500 });
  }
}


