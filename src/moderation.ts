import { Bot, Context } from "grammy";
import { config, isAdmin } from "./config.js";
import { isProfanityFilterEnabled } from "./menuState.js";

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

// ---- Detection heuristics ----
const INVITE_LINK_RE = /t\.me\/(\+|joinchat)/i;
const URL_RE = /https?:\/\/\S+|www\.\S+/i;
const SOLANA_ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

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
  | { type: "scam_invite" }
  | { type: "phishing" }
  | { type: "fake_contract"; found: string[] }
  | { type: "bad_word" };

export function evaluateMessage(text: string, chatId: number): Verdict {
  const lower = text.toLowerCase();

  if (INVITE_LINK_RE.test(text)) {
    return { type: "scam_invite" };
  }

  if (SCAM_KEYWORD_RE.test(lower) && URL_RE.test(text)) {
    return { type: "phishing" };
  }

  const addresses = text.match(SOLANA_ADDRESS_RE) ?? [];
  const claimsToBeContract = /\bca\s*[:=]|contract\s*(address)?\s*[:=]/i.test(text);
  if (claimsToBeContract && addresses.length > 0) {
    const fakeOnes = addresses.filter((a) => a !== config.contractAddress);
    if (fakeOnes.length > 0) {
      return { type: "fake_contract", found: fakeOnes };
    }
  }

  if (isProfanityFilterEnabled(chatId) && config.badWords.length > 0 && config.badWords.some((w) => lower.includes(w))) {
    return { type: "bad_word" };
  }

  return { type: "clean" };
}

function verdictMessage(verdict: Verdict): string {
  switch (verdict.type) {
    case "scam_invite":
      return "that looks like a spam/invite-link drop, not something an admin posted";
    case "phishing":
      return "that reads like a phishing attempt (wallet/seed-phrase bait + a link)";
    case "fake_contract":
      return "that's not our official contract address — don't trust it";
    case "bad_word":
      return "that language isn't allowed here";
    default:
      return "";
  }
}

// Verdicts serious enough to skip the warning ladder and act immediately.
const IMMEDIATE_ACTION = new Set<Verdict["type"]>(["phishing", "fake_contract"]);

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

async function warnMuteOrBan(ctx: Context, verdict: Verdict) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return;

  const immediate = IMMEDIATE_ACTION.has(verdict.type);
  const offender = getOffender(chatId, userId);
  offender.warns += 1;

  try {
    await ctx.deleteMessage();
  } catch {
    // bot may lack delete permission; continue anyway
  }

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
    async (ctx) => {
      const verdict = evaluateMessage(ctx.message.text, ctx.chat.id);
      if (verdict.type === "clean") return;
      await warnMuteOrBan(ctx, verdict);
    },
  );
}
