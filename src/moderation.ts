import { Bot, Context } from "grammy";
import { config, isAdmin } from "./config.js";
import { isFilterEnabled } from "./filterState.js";

// ---- Per-chat, per-user offender tracking (in-memory) ----
type Offender = { warns: number };
const offenders = new Map<number, Map<number, Offender>>();

function getOffender(chatId: number, userId: number): Offender {
  const chat = offenders.get(chatId) ?? new Map<number, Offender>();
  offenders.set(chatId, chat);
  const record = chat.get(userId) ?? { warns: 0 };
  chat.set(userId, record);
  return record;
}

// ---- Flood detection (rate-based, always on — not a content filter) ----
const FLOOD_WINDOW_MS = 8_000;
const FLOOD_MESSAGE_THRESHOLD = 6;
const floodTimestamps = new Map<string, number[]>();

function isFlooding(chatId: number, userId: number): boolean {
  const key = `${chatId}:${userId}`;
  const now = Date.now();
  const times = (floodTimestamps.get(key) ?? []).filter((t) => now - t < FLOOD_WINDOW_MS);
  times.push(now);
  floodTimestamps.set(key, times);
  return times.length >= FLOOD_MESSAGE_THRESHOLD;
}

// ---- Duplicate detection ----
const DUPLICATE_WINDOW_MS = 5 * 60_000;
const lastMessage = new Map<string, { text: string; time: number }>();

function isDuplicate(chatId: number, userId: number, text: string): boolean {
  const key = `${chatId}:${userId}`;
  const now = Date.now();
  const normalized = text.trim().toLowerCase();
  const prev = lastMessage.get(key);
  lastMessage.set(key, { text: normalized, time: now });
  return !!prev && prev.text === normalized && now - prev.time < DUPLICATE_WINDOW_MS;
}

// ---- Content heuristics ----
const INVITE_LINK_RE = /t\.me\/(\+|joinchat)/i;
const URL_RE = /https?:\/\/\S+|www\.\S+/i;
const SOLANA_ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

const PHISHING_KEYWORDS = [
  "seed phrase",
  "private key",
  "connect wallet",
  "wallet drainer",
  "claim your airdrop",
  "free mint",
  "double your",
  "recover your funds",
  "validate your wallet",
];
const SCAM_KEYWORD_RE = new RegExp(PHISHING_KEYWORDS.join("|"), "i");

export type Verdict =
  | { type: "clean" }
  | { type: "flood" }
  | { type: "scam_invite" }
  | { type: "phishing" }
  | { type: "fake_contract"; found: string[] }
  | { type: "generic_link" }
  | { type: "bad_word" }
  | { type: "duplicate" }
  | { type: "caps" }
  | { type: "emoji_spam" };

export function evaluateMessage(text: string, chatId: number, userId: number): Verdict {
  if (isFlooding(chatId, userId)) return { type: "flood" };

  const lower = text.toLowerCase();

  if (isFilterEnabled(chatId, "invite") && INVITE_LINK_RE.test(text)) {
    return { type: "scam_invite" };
  }

  if (isFilterEnabled(chatId, "wallet") && SCAM_KEYWORD_RE.test(lower) && URL_RE.test(text)) {
    return { type: "phishing" };
  }

  if (isFilterEnabled(chatId, "ca")) {
    const addresses = text.match(SOLANA_ADDRESS_RE) ?? [];
    const claimsToBeContract = /\bca\s*[:=]|contract\s*(address)?\s*[:=]/i.test(text);
    if (claimsToBeContract && addresses.length > 0) {
      const fakeOnes = addresses.filter((a) => a !== config.contractAddress);
      if (fakeOnes.length > 0) {
        return { type: "fake_contract", found: fakeOnes };
      }
    }
  }

  if (isFilterEnabled(chatId, "links") && URL_RE.test(text)) {
    return { type: "generic_link" };
  }

  if (isFilterEnabled(chatId, "profanity") && config.badWords.length > 0 && config.badWords.some((w) => lower.includes(w))) {
    return { type: "bad_word" };
  }

  if (isFilterEnabled(chatId, "duplicate") && isDuplicate(chatId, userId, text)) {
    return { type: "duplicate" };
  }

  if (isFilterEnabled(chatId, "caps")) {
    const letters = text.replace(/[^a-zA-Z]/g, "");
    const upper = text.replace(/[^A-Z]/g, "");
    if (letters.length >= 12 && upper.length / letters.length > 0.7) {
      return { type: "caps" };
    }
  }

  if (isFilterEnabled(chatId, "emoji")) {
    const count = (text.match(EMOJI_RE) ?? []).length;
    if (count >= 8) return { type: "emoji_spam" };
  }

  return { type: "clean" };
}

function verdictMessage(verdict: Verdict): string {
  switch (verdict.type) {
    case "flood":
      return "slow down — that's too many messages too fast";
    case "scam_invite":
      return "that looks like a spam/invite-link drop, not something an admin posted";
    case "phishing":
      return "that reads like a phishing attempt (wallet/seed-phrase bait + a link)";
    case "fake_contract":
      return "that's not our official contract address — don't trust it";
    case "generic_link":
      return "links aren't allowed here right now";
    case "bad_word":
      return "that language isn't allowed here";
    case "duplicate":
      return "that's a repeated message — no copy-paste spam";
    case "caps":
      return "ease up on the caps lock";
    case "emoji_spam":
      return "too many emoji in one message";
    default:
      return "";
  }
}

// Verdicts serious enough to skip the warning ladder and act immediately.
const IMMEDIATE_ACTION = new Set<Verdict["type"]>(["phishing", "fake_contract"]);
// Verdicts that get deleted but shouldn't count toward the warn ladder at all
// (flood/caps/emoji/duplicate are usually just noise, not malicious).
const SOFT_ACTION = new Set<Verdict["type"]>(["flood", "duplicate", "caps", "emoji_spam"]);

async function logAction(ctx: Context, action: string, verdict: Verdict) {
  const user = ctx.from;
  const line = `[MOD] ${action} — user ${user?.id} (@${user?.username ?? "unknown"}) in chat ${ctx.chat?.id} — reason: ${verdict.type}`;
  console.log(line);
  if (config.logChatId) {
    try {
      await ctx.api.sendMessage(config.logChatId, line);
    } catch (err) {
      console.error("Failed to send log message:", err);
    }
  }
}

async function handleVerdict(ctx: Context, verdict: Verdict) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return;

  try {
    await ctx.deleteMessage();
  } catch {
    // bot may lack delete permission; continue anyway
  }

  if (SOFT_ACTION.has(verdict.type)) {
    await logAction(ctx, "delete", verdict);
    return;
  }

  const immediate = IMMEDIATE_ACTION.has(verdict.type);
  const offender = getOffender(chatId, userId);
  offender.warns += 1;

  if (immediate || offender.warns >= 3) {
    await ctx.api.banChatMember(chatId, userId);
    await ctx.api.sendMessage(chatId, `🔨 Banned a Builder — ${verdictMessage(verdict)}.`);
    await logAction(ctx, "ban", verdict);
    return;
  }

  if (offender.warns === 2) {
    const until = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
    await ctx.api.restrictChatMember(chatId, userId, { can_send_messages: false }, { until_date: until });
    await ctx.api.sendMessage(chatId, `🔇 Muted a Builder for 1 hour — ${verdictMessage(verdict)}.`);
    await logAction(ctx, "mute", verdict);
    return;
  }

  await ctx.api.sendMessage(
    chatId,
    `⚠️ Warning (${offender.warns}/3) — ${verdictMessage(verdict)}. Next one gets you muted.`,
  );
  await logAction(ctx, "warn", verdict);
}

export function registerModeration(bot: Bot) {
  bot.on("message:text").filter(
    (ctx) => ctx.chat.type !== "private" && !isAdmin(ctx.from?.id),
    async (ctx, next) => {
      const verdict = evaluateMessage(ctx.message.text, ctx.chat.id, ctx.from.id);
      if (verdict.type === "clean") {
        await next();
        return;
      }
      await handleVerdict(ctx, verdict);
    },
  );

  bot.on("message:sticker").filter(
    (ctx) => ctx.chat.type !== "private" && !isAdmin(ctx.from?.id) && isFilterEnabled(ctx.chat.id, "stickers"),
    async (ctx) => {
      try {
        await ctx.deleteMessage();
      } catch {
        // ignore
      }
      await logAction(ctx, "delete", { type: "clean" });
    },
  );

  bot.on("message:animation").filter(
    (ctx) => ctx.chat.type !== "private" && !isAdmin(ctx.from?.id) && isFilterEnabled(ctx.chat.id, "gifs"),
    async (ctx) => {
      try {
        await ctx.deleteMessage();
      } catch {
        // ignore
      }
      await logAction(ctx, "delete", { type: "clean" });
    },
  );
}
