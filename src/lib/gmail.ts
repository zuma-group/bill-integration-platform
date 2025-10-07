import { google } from 'googleapis';

type GmailClient = any;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function getProcessedLabelName(): string {
  return process.env.GMAIL_PROCESSED_LABEL || 'BIP/Processed';
}

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

export function getOAuth2Client() {
  const clientId = getRequiredEnv('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = getRequiredEnv('GOOGLE_OAUTH_CLIENT_SECRET');
  const redirectUri = getRequiredEnv('GOOGLE_OAUTH_REDIRECT_URI');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function getGmailClient(): Promise<GmailClient> {
  // If service account variables are present and authorized later, we can use them.
  // For now, prefer OAuth flow when OAuth vars exist.
  const hasOAuth = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI
  );

  if (hasOAuth) {
    const oauth2 = getOAuth2Client();
    const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;
    if (!refreshToken) {
      throw new Error(
        'No refresh token available. Visit /api/gmail/auth to authorize, then set GMAIL_OAUTH_REFRESH_TOKEN.'
      );
    }
    oauth2.setCredentials({ refresh_token: refreshToken });
    return google.gmail({ version: 'v1', auth: oauth2 });
  }

  // Service account fallback (requires DWD)
  const clientEmail = getRequiredEnv('GOOGLE_CLIENT_EMAIL');
  const privateKeyRaw = getRequiredEnv('GOOGLE_PRIVATE_KEY');
  const subjectUser = getRequiredEnv('GMAIL_IMPERSONATE_EMAIL');

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  const jwt = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: OAUTH_SCOPES,
    subject: subjectUser,
  });
  await jwt.authorize();
  return google.gmail({ version: 'v1', auth: jwt });
}

export async function ensureLabel(
  gmail: GmailClient,
  userId: string,
  labelName: string
): Promise<string> {
  const list = await gmail.users.labels.list({ userId });
  const existing = (list.data.labels as Array<{ id?: string; name?: string }> | undefined)?.find((l) => l.name === labelName);
  if (existing?.id) return existing.id;

  const created = await gmail.users.labels.create({
    userId,
    requestBody: {
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });
  const id = created.data.id;
  if (!id) throw new Error('Failed to create label');
  return id;
}

export function base64UrlToBase64(b64url: string): string {
  let s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad === 2) s += '==';
  if (pad === 3) s += '=';
  if (pad === 1) s += '===';
  return s;
}

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  base64: string; // standard base64
}

export async function getMessageAttachments(
  gmail: GmailClient,
  userId: string,
  message: any
): Promise<GmailAttachment[]> {
  const out: GmailAttachment[] = [];

  async function walkParts(parts?: any[]) {
    if (!parts) return;
    for (const p of parts) {
      const filename = p.filename || '';
      const mimeType = p.mimeType || '';
      const isAttachment = Boolean(filename || p.body?.attachmentId);
      if (isAttachment && (mimeType.startsWith('application/pdf') || mimeType.startsWith('image/png') || mimeType.startsWith('image/jpeg') || /\.(pdf|png|jpe?g)$/i.test(filename))) {
        if (p.body?.attachmentId && message.id) {
          const att = await gmail.users.messages.attachments.get({
            userId,
            messageId: message.id,
            id: p.body.attachmentId,
          });
          const data = att.data.data;
          if (data) {
            out.push({
              filename: filename || `attachment-${out.length + 1}`,
              mimeType: mimeType || 'application/octet-stream',
              base64: base64UrlToBase64(data),
            });
          }
        } else if (p.body?.data) {
          out.push({
            filename: filename || `attachment-${out.length + 1}`,
            mimeType: mimeType || 'application/octet-stream',
            base64: base64UrlToBase64(p.body.data),
          });
        }
      }
      if (p.parts && p.parts.length) await walkParts(p.parts);
    }
  }

  // Root part can hold data too
  if (message.payload) {
    await walkParts([message.payload]);
  }

  return out;
}

export async function listCandidateMessages(
  gmail: GmailClient,
  userId: string,
  maxResults: number
): Promise<any[]> {
  const resp = await gmail.users.messages.list({
    userId,
    maxResults,
    q: 'has:attachment newer_than:30d',
  });
  const messages = resp.data.messages || [];
  const full: any[] = [];
  for (const m of messages) {
    if (!m.id) continue;
    const g = await gmail.users.messages.get({ userId, id: m.id, format: 'full' });
    if (g.data) full.push(g.data);
  }
  return full;
}


