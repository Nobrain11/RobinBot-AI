import { Bot } from "grammy";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { SYSTEM_PROMPT } from "./persona.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

type ChatTurn = { role: "user" | "assistant"; content: string };

// Rolling memory per Telegram chat, capped so it doesn't grow unbounded.
const MAX_TURNS = 12;
const history = new Map<number, ChatTurn[]>();

function pushTurn(chatId: number, turn: ChatTurn) {
  const turns = history.get(chatId) ?? [];
  turns.push(turn);
  while (turns.length > MAX_TURNS) turns.shift();
  history.set(chatId, turns);
}

export function registerAiChat(bot: Bot) {
  bot.on("message:text").filter(
    (ctx) => {
      const text = ctx.message.text ?? "";
      const botUsername = ctx.me.username;
      return botUsername ? text.toLowerCase().includes(`@${botUsername.toLowerCase()}`) : false;
    },
    async (ctx) => {
      const chatId = ctx.chat.id;
      const botUsername = ctx.me.username ?? "";
      const userText = ctx.message.text.replace(new RegExp(`@${botUsername}`, "i"), "").trim();

      if (!userText) {
        await ctx.reply("Yeah? Ask me something, don't just @ me and vanish.");
        return;
      }

      await ctx.replyWithChatAction("typing");
      pushTurn(chatId, { role: "user", content: userText });

      try {
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: history.get(chatId) ?? [],
        });

        const reply = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();

        pushTurn(chatId, { role: "assistant", content: reply });
        await ctx.reply(reply || "...my brain 404'd for a second, try again?");
      } catch (err) {
        console.error("AI chat error:", err);
        await ctx.reply("Build Mode hiccup — my AI brain didn't respond. Try again in a sec.");
      }
    },
  );
}
