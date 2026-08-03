import { Bot } from "grammy";
import { config } from "./config.js";
import { registerCommands } from "./commands.js";
import { registerWelcome } from "./welcome.js";
import { registerAiChat } from "./aiChat.js";
import { registerModeration } from "./moderation.js";
import { registerAdminCommands } from "./adminCommands.js";

const bot = new Bot(config.botToken);

registerCommands(bot);
registerAdminCommands(bot);
registerWelcome(bot);
registerModeration(bot);
registerAiChat(bot);

bot.catch((err) => {
  console.error("Unhandled bot error:", err.error);
});

bot.start({
  allowed_updates: ["message", "chat_member"],
  onStart: (info) => console.log(`RobinBot online as @${info.username}`),
});
