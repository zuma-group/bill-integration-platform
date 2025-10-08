let lastHistoryId: string | null = process.env.GMAIL_START_HISTORY_ID || null;

export function getLastHistoryId(): string | null {
  return lastHistoryId;
}

export function setLastHistoryId(id: string | null) {
  if (id && id !== '0') {
    lastHistoryId = id;
  }
}


