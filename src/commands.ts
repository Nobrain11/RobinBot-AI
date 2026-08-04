import { Bot } from "grammy";
import { config } from "./config.js";

const GM_LINES = ["gm builders ☀️ ship something today", "gm. build mode never sleeps (i do, occasionally)"];
const GN_LINES = ["gn builders 🌙 the code will still be broken tomorrow", "gn. dream in typescript"];
const RANDOM_LINES = [
  "404: Moon Not Found. Builders Found.",
  "Bug or feature? Yes.",
  "Still building. Still broke. Still here.",
];

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

export function registerCommands(bot: Bot) {
  bot.command("about", (ctx) =>
    ctx.reply(
      `${config.projectName} — a community of Builders. Profit Not Found. Community Found. Ask me anything with @RobinBot.`,
    ),
  );

  bot.command("contract", (ctx) => ctx.reply(`Contract: ${config.contractAddress}`));
  bot.command("buy", (ctx) => ctx.reply(`Buy here: ${config.buyLink}`));
  bot.command("chart", (ctx) => ctx.reply(`Chart: ${config.chartLink}`));
  bot.command("socials", (ctx) => ctx.reply(`Socials: ${config.socialsLink}`));

  bot.command("gm", (ctx) => ctx.reply(pick(GM_LINES)));
  bot.command("gn", (ctx) => ctx.reply(pick(GN_LINES)));
  bot.command("random", (ctx) => ctx.reply(pick(RANDOM_LINES)));

  bot.command("status", (ctx) => ctx.reply("Build Mode: online. All systems 404-ing as expected."));

  bot.command("meme", (ctx) =>
    ctx.reply("Meme generation is coming in a later update — for now, describe your idea and I'll riff on it in chat."),
  );
}
