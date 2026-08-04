import type { Bot } from "grammy";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" (UTC)
}

type Contributor = { username?: string; firstName: string; count: number };

type ChatStats = {
  dayKey: string;
  messagesToday: number;
  activeToday: Set<number>;
  joinsToday: number;
  totalMembers: number;
  milestonesHit: Set<number>;
  contributors: Map<number, Contributor>;
  streak: number;
  lastActiveDay?: string;
};

const stats = new Map<number, ChatStats>();

function getStats(chatId: number): ChatStats {
  const today = todayKey();
  let s = stats.get(chatId);

  if (!s) {
    s = {
      dayKey: today,
      messagesToday: 0,
      activeToday: new Set(),
      joinsToday: 0,
      totalMembers: 0,
      milestonesHit: new Set(),
      contributors: new Map(),
      streak: 0,
    };
    stats.set(chatId, s);
  }

  if (s.dayKey !== today) {
    // New day: roll the streak forward if yesterday had any activity, else reset it.
    const hadActivityYesterday = s.messagesToday > 0 || s.joinsToday > 0;
    s.streak = hadActivityYesterday ? s.streak + 1 : 0;
    s.dayKey = today;
    s.messagesToday = 0;
    s.joinsToday = 0;
    s.activeToday = new Set();
  }

  return s;
}

export function recordMessage(chatId: number, userId: number, firstName: string, username?: string): void {
  const s = getStats(chatId);
  s.messagesToday += 1;
  s.activeToday.add(userId);

  const c = s.contributors.get(userId) ?? { username, firstName, count: 0 };
  c.count += 1;
  c.username = username;
  c.firstName = firstName;
  s.contributors.set(userId, c);
}

const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export function recordJoin(chatId: number): { total: number; milestone: number | null } {
  const s = getStats(chatId);
  s.joinsToday += 1;
  s.totalMembers += 1;

  const hit = MILESTONES.find((m) => m === s.totalMembers && !s.milestonesHit.has(m));
  if (hit) s.milestonesHit.add(hit);

  return { total: s.totalMembers, milestone: hit ?? null };
}

export function milestoneMessage(total: number): string {
  if (total === MILESTONES[0]) {
    return `🎉 Build Mode Activated.\n\n${total} Builders and counting.`;
  }
  return `🏗 ${total} Builders Online.`;
}

export function formatStats(chatId: number): string {
  const s = getStats(chatId);
  return [
    "📊 Build Mode Stats",
    "",
    `New Builders today: ${s.joinsToday}`,
    `Messages today: ${s.messagesToday}`,
    `Active Builders today: ${s.activeToday.size}`,
    `Total Builders tracked: ${s.totalMembers}`,
    `Community streak: ${s.streak} day(s)`,
  ].join("\n");
}

export function formatLeaderboard(chatId: number, topN = 5): string {
  const s = getStats(chatId);
  const ranked = [...s.contributors.values()].sort((a, b) => b.count - a.count).slice(0, topN);

  if (ranked.length === 0) {
    return "🏆 Top Contributors\n\nNo tracked messages yet.";
  }

  const lines = ranked.map((c, i) => {
    const name = c.username ? `@${c.username}` : c.firstName;
    return `${i + 1}. ${name} — ${c.count} messages`;
  });

  return ["🏆 Top Contributors", "", ...lines].join("\n");
}

// Registered first in the middleware chain, before moderation/menu/AI chat,
// so every message counts toward activity stats regardless of what happens
// to it downstream (deleted for spam, answered by AI, etc). Always calls
// next() so it never blocks anything else from running.
export function registerAnalyticsTracking(bot: Bot) {
  bot.on("message:text", async (ctx, next) => {
    if (ctx.chat.type !== "private" && ctx.from && !ctx.from.is_bot) {
      recordMessage(ctx.chat.id, ctx.from.id, ctx.from.first_name, ctx.from.username);
    }
    await next();
  });
}
