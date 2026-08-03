// In-memory per-chat moderation toggles. Lets the Settings menu flip
// behavior live without redeploying. Resets on restart — fine for a single
// Railway instance; move to a database if this needs to survive restarts.
const profanityFilterState = new Map<number, boolean>();

export function isProfanityFilterEnabled(chatId: number): boolean {
  return profanityFilterState.get(chatId) ?? true;
}

export function setProfanityFilterEnabled(chatId: number, enabled: boolean): void {
  profanityFilterState.set(chatId, enabled);
}
