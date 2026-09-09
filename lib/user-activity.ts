const LAST_SEEN_WRITE_INTERVAL_MS = 10 * 60 * 1000;

export function shouldRefreshLastSeen(lastSeenAt: Date, now = new Date()) {
  return now.getTime() - lastSeenAt.getTime() >= LAST_SEEN_WRITE_INTERVAL_MS;
}
