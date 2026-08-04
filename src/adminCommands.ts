import { Bot, Context } from "grammy";
import { isAdmin } from "./config.js";
import { formatStats, formatLeaderboard } from "./analytics.js";
import { ALL_FILTERS, FilterName, toggleFilter, disableAllFilters, formatFilterStatus } from "./filterState.js";
import { setManualLock } from "./raidGuard.js";

function targetUserId(ctx: Context): number | undefined {
  return ctx.message?.reply_to_message?.from?.id;
}

function requireAdmin(ctx: Context): boolean {
  return isAdmin(ctx.from?.id);
}

export function registerAdminCommands(bot: Bot) {
  bot.command("stats", async (ctx) => {
    if (!requireAdmin(ctx) || !ctx.chat) return;
    await ctx.reply(formatStats(ctx.chat.id));
  });

  bot.command("leaderboard", async (ctx) => {
    if (!requireAdmin(ctx) || !ctx.chat) return;
    await ctx.reply(formatLeaderboard(ctx.chat.id));
  });

  bot.command("filter", async (ctx) => {
    if (!requireAdmin(ctx) || !ctx.chat) return;
    const arg = ctx.match?.toString().trim().toLowerCase();

    if (!arg) {
      await ctx.reply(`${formatFilterStatus(ctx.chat.id)}\n\nUsage: /filter <name> to toggle, or /filter off to disable all.`);
      return;
    }

    if (arg === "off") {
      disableAllFilters(ctx.chat.id);
      await ctx.reply("All filters disabled.");
      return;
    }

    if (!ALL_FILTERS.includes(arg as FilterName)) {
      await ctx.reply(`Unknown filter "${arg}". Valid: ${ALL_FILTERS.join(", ")}`);
      return;
    }

    const nowEnabled = toggleFilter(ctx.chat.id, arg as FilterName);
    await ctx.reply(`Filter "${arg}" is now ${nowEnabled ? "ON" : "OFF"}.`);
  });

  bot.command("lock", async (ctx) => {
    if (!requireAdmin(ctx) || !ctx.chat) return;
    setManualLock(ctx.chat.id, true);
    try {
      await ctx.api.setChatPermissions(ctx.chat.id, { can_send_messages: false });
    } catch (err) {
      console.error("Failed to lock chat permissions:", err);
    }
    await ctx.reply("🔒 Chat locked — only admins can send messages.");
  });

  bot.command("unlock", async (ctx) => {
    if (!requireAdmin(ctx) || !ctx.chat) return;
    setManualLock(ctx.chat.id, false);
    try {
      await ctx.api.setChatPermissions(ctx.chat.id, {
        can_send_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      });
    } catch (err) {
      console.error("Failed to unlock chat permissions:", err);
    }
    await ctx.reply("🔓 Chat unlocked.");
  });

  bot.command("warn", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const uid = targetUserId(ctx);
    if (!uid) return ctx.reply("Reply to the Builder's message with /warn.");
    await ctx.reply(`⚠️ Warned <a href="tg://user?id=${uid}">this Builder</a> manually.`, {
      parse_mode: "HTML",
    });
  });

  bot.command("mute", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const uid = targetUserId(ctx);
    if (!uid || !ctx.chat) return ctx.reply("Reply to the Builder's message with /mute.");
    const until = Math.floor(Date.now() / 1000) + 60 * 60;
    await ctx.api.restrictChatMember(ctx.chat.id, uid, { can_send_messages: false }, { until_date: until });
    await ctx.reply("🔇 Muted for 1 hour.");
  });

  bot.command("unmute", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const uid = targetUserId(ctx);
    if (!uid || !ctx.chat) return ctx.reply("Reply to the Builder's message with /unmute.");
    await ctx.api.restrictChatMember(ctx.chat.id, uid, {
      can_send_messages: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
    });
    await ctx.reply("🔊 Unmuted.");
  });

  bot.command("ban", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const uid = targetUserId(ctx);
    if (!uid || !ctx.chat) return ctx.reply("Reply to the Builder's message with /ban.");
    await ctx.api.banChatMember(ctx.chat.id, uid);
    await ctx.reply("🔨 Banned.");
  });

  bot.command("unban", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const uid = targetUserId(ctx);
    if (!uid || !ctx.chat) return ctx.reply("Reply to the Builder's message with /unban.");
    await ctx.api.unbanChatMember(ctx.chat.id, uid);
    await ctx.reply("✅ Unbanned.");
  });

  bot.command("clear", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const reply = ctx.message?.reply_to_message;
    if (!reply || !ctx.chat) return ctx.reply("Reply to the first message you want cleared with /clear.");
    const from = reply.message_id;
    const to = ctx.message!.message_id;
    for (let id = from; id <= to; id++) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, id);
      } catch {
        // message may already be gone or too old to delete; skip
      }
    }
  });
}
