type RaidState = { joinTimestamps: number[]; lockedUntil?: number };

const raidState = new Map<number, RaidState>();

const RAID_WINDOW_MS = 30_000;
const RAID_JOIN_THRESHOLD = 5;
const RAID_AUTO_LOCK_MS = 10 * 60_000; // 10 minutes

function getState(chatId: number): RaidState {
  const s = raidState.get(chatId) ?? { joinTimestamps: [] };
  raidState.set(chatId, s);
  return s;
}

/** Call on every join. Returns whether this join triggered raid mode just now. */
export function recordJoinForRaidCheck(chatId: number): boolean {
  const s = getState(chatId);
  const now = Date.now();
  s.joinTimestamps = s.joinTimestamps.filter((t) => now - t < RAID_WINDOW_MS);
  s.joinTimestamps.push(now);

  if (s.joinTimestamps.length >= RAID_JOIN_THRESHOLD && !isLocked(chatId)) {
    s.lockedUntil = now + RAID_AUTO_LOCK_MS;
    return true;
  }
  return false;
}

export function isLocked(chatId: number): boolean {
  const s = raidState.get(chatId);
  return !!s?.lockedUntil && s.lockedUntil > Date.now();
}

export function setManualLock(chatId: number, locked: boolean): void {
  const s = getState(chatId);
  s.lockedUntil = locked ? Date.now() + 24 * 60 * 60_000 : undefined;
}
