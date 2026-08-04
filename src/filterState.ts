export type FilterName =
  | "ca"
  | "wallet"
  | "invite"
  | "links"
  | "profanity"
  | "duplicate"
  | "caps"
  | "emoji"
  | "stickers"
  | "gifs";

export const ALL_FILTERS: FilterName[] = [
  "ca",
  "wallet",
  "invite",
  "links",
  "profanity",
  "duplicate",
  "caps",
  "emoji",
  "stickers",
  "gifs",
];

// These protect against unambiguously bad content, so they're on by default.
// The rest are stricter/opinionated lockdown-style options admins opt into.
const DEFAULT_ON: FilterName[] = ["ca", "wallet", "invite", "profanity", "duplicate"];

const disabledDefaultOn = new Map<number, Set<FilterName>>();
const enabledDefaultOff = new Map<number, Set<FilterName>>();

export function isFilterEnabled(chatId: number, name: FilterName): boolean {
  if (DEFAULT_ON.includes(name)) {
    return !(disabledDefaultOn.get(chatId)?.has(name) ?? false);
  }
  return enabledDefaultOff.get(chatId)?.has(name) ?? false;
}

/** Flips the filter and returns its new enabled state. */
export function toggleFilter(chatId: number, name: FilterName): boolean {
  if (DEFAULT_ON.includes(name)) {
    const set = disabledDefaultOn.get(chatId) ?? new Set<FilterName>();
    disabledDefaultOn.set(chatId, set);
    if (set.has(name)) {
      set.delete(name);
      return true;
    }
    set.add(name);
    return false;
  }

  const set = enabledDefaultOff.get(chatId) ?? new Set<FilterName>();
  enabledDefaultOff.set(chatId, set);
  if (set.has(name)) {
    set.delete(name);
    return false;
  }
  set.add(name);
  return true;
}

export function disableAllFilters(chatId: number): void {
  disabledDefaultOn.set(chatId, new Set(DEFAULT_ON));
  enabledDefaultOff.set(chatId, new Set());
}

export function formatFilterStatus(chatId: number): string {
  const lines = ALL_FILTERS.map((f) => `${f}: ${isFilterEnabled(chatId, f) ? "ON" : "OFF"}`);
  return ["🛡 Filters", "", ...lines].join("\n");
}
