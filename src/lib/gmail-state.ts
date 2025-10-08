let lastHistoryId: string | null = process.env.GMAIL_START_HISTORY_ID || null;

export function getLastHistoryId(): string | null {
  return lastHistoryId;
}

export function setLastHistoryId(id: string | null) {
  if (!id || id === '0') return;
  if (!lastHistoryId) {
    lastHistoryId = id;
    return;
  }
  try {
    // Monotonic update only: keep the larger historyId
    const curr = BigInt(lastHistoryId);
    const next = BigInt(id);
    if (next > curr) lastHistoryId = id;
  } catch {
    // If parse fails, fall back to overwrite
    lastHistoryId = id;
  }
}


