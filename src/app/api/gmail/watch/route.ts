import { NextRequest, NextResponse } from 'next/server';
import { getGmailClient } from '@/lib/gmail';
import { setLastHistoryId } from '@/lib/gmail-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const topicName = process.env.GMAIL_PUBSUB_TOPIC; // e.g. projects/your-project/topics/your-topic
    if (!topicName) {
      return NextResponse.json({ error: 'GMAIL_PUBSUB_TOPIC is not set' }, { status: 400 });
    }

    const gmail = await getGmailClient();
    const userId = 'me';

    const { labelIds } = await request.json().catch(() => ({ labelIds: undefined as string[] | undefined }));

    const res = await gmail.users.watch({
      userId,
      requestBody: {
        topicName,
        labelIds, // optional filter; if omitted, watches entire mailbox
        labelFilterAction: labelIds && labelIds.length > 0 ? 'include' : undefined,
      },
    });

    if (res.data.historyId) setLastHistoryId(String(res.data.historyId));

    return NextResponse.json({
      success: true,
      historyId: res.data.historyId,
      expiration: res.data.expiration,
      topicName,
      labelIds: labelIds || null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to start Gmail watch' }, { status: 500 });
  }
}


