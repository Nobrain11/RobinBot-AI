import { Bot } from "grammy";
import { config } from "./config.js";
import { registerCommands } from "./commands.js";
import { registerWelcome } from "./welcome.js";
import { registerAiChat } from "./aiChat.js";
import { registerModeration } from "./moderation.js";
import { registerAdminCommands } from "./adminCommands.js";
import { registerMenu } from "./menu.js";

const bot = new Bot(config.botToken);

registerCommands(bot);
registerAdminCommands(bot);
registerWelcome(bot);
registerModeration(bot);
registerMenu(bot);
registerAiChat(bot);

bot.catch((err) => {
  console.error("Unhandled bot error:", err.error);
});

async function launch() {
  while (true) {
    try {
      // Clears any leftover webhook and stale queued updates so a redeploy
      // doesn't race with the previous container's long-polling connection.
      await bot.api.deleteWebhook({ drop_pending_updates: true });

      // bot.start() only resolves when bot.stop() is called manually, so
      // awaiting it here means any crash inside the polling loop is caught
      // below instead of becoming an unhandled rejection that kills the process.
      await bot.start({
        allowed_updates: ["message", "chat_member", "callback_query"],
        onStart: (info) => console.log(`RobinBot online as @${info.username}`),
      });
      break;
    } catch (err) {
      console.error("Bot loop crashed, restarting in 5s:", err);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

launch();
