import { Bot } from "grammy";
import { WELCOME_MESSAGE } from "./persona.js";
import { recordJoin, milestoneMessage } from "./analytics.js";
import { isAdmin, config } from "./config.js";
import { recordJoinForRaidCheck, isLocked } from "./raidGuard.js";

export function registerWelcome(bot: Bot) {
  bot.on("chat_member", async (ctx) => {
    const oldStatus = ctx.chatMember.old_chat_member.status;
    const newStatus = ctx.chatMember.new_chat_member.status;
    const justJoined =
      (oldStatus === "left" || oldStatus === "kicked") &&
      (newStatus === "member" || newStatus === "restricted");

    if (!justJoined) return;

    const user = ctx.chatMember.new_chat_member.user;
    if (user.id === ctx.me.id) return; // never act on RobinBot's own join event

    const addedBy = ctx.chatMember.from;
    const chatId = ctx.chat.id;

    // Anti-bot: only admins are allowed to add other bots to the group.
    if (user.is_bot && !isAdmin(addedBy?.id)) {
      try {
        await ctx.api.banChatMember(chatId, user.id);
        await ctx.reply(`🤖 Removed an unauthorized bot (@${user.username ?? user.id}).`);
        if (config.logChatId) {
          await ctx.api.sendMessage(config.logChatId, `[MOD] anti-bot — removed bot ${user.id} added by ${addedBy?.id}`);
        }
      } catch (err) {
        console.error("Failed to remove unauthorized bot:", err);
      }
      return;
    }

    // Anti-raid: if the chat is currently locked (manually or from a prior
    // burst), quietly restrict new joins instead of sending the normal
    // welcome flow, so a raid in progress doesn't get free rein to post.
    if (isLocked(chatId)) {
      try {
        await ctx.api.restrictChatMember(chatId, user.id, { can_send_messages: false });
      } catch (err) {
        console.error("Failed to restrict member during lockdown:", err);
      }
      return;
    }

    const mention = user.username ? `@${user.username}` : user.first_name;
    await ctx.reply(`${mention}\n\n${WELCOME_MESSAGE}`);

    const { milestone } = recordJoin(chatId);
    if (milestone) {
      await ctx.reply(milestoneMessage(milestone));
    }

    const raidTriggered = recordJoinForRaidCheck(chatId);
    if (raidTriggered) {
      await ctx.reply(
        "🚨 Raid pattern detected (too many joins too fast). New members are being auto-restricted for 10 minutes — admins can /unlock early.",
      );
      if (config.logChatId) {
        await ctx.api.sendMessage(config.logChatId, `[MOD] anti-raid — lockdown triggered in chat ${chatId}`);
      }
    }
  });
}
