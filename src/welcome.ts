import { Bot } from "grammy";
import { WELCOME_MESSAGE } from "./persona.js";

export function registerWelcome(bot: Bot) {
  bot.on("chat_member", async (ctx) => {
    const oldStatus = ctx.chatMember.old_chat_member.status;
    const newStatus = ctx.chatMember.new_chat_member.status;
    const justJoined =
      (oldStatus === "left" || oldStatus === "kicked") &&
      (newStatus === "member" || newStatus === "restricted");

    if (!justJoined) return;

    const user = ctx.chatMember.new_chat_member.user;
    const mention = user.username ? `@${user.username}` : user.first_name;

    await ctx.reply(`${mention}\n\n${WELCOME_MESSAGE}`);
  });
}
