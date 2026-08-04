import { Bot, Context } from "grammy";
import { isAdmin } from "./config.js";
import { formatStats, formatLeaderboard } from "./analytics.js";

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
