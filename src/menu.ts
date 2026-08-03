import { Bot, Context, InlineKeyboard } from "grammy";
import { config, isAdmin } from "./config.js";
import { isProfanityFilterEnabled, setProfanityFilterEnabled } from "./menuState.js";

type ScreenId =
  | "main"
  | "buildmode"
  | "robinbotai"
  | "memefactory"
  | "buy"
  | "chart"
  | "community"
  | "community_events"
  | "community_event_details"
  | "community_event_details_rules"
  | "settings"
  | "settings_profanity"
  | "help";

// Static tree: parent pointers are enough to drive Back and breadcrumbs —
// no per-user navigation history needs to be tracked.
const PARENT: Partial<Record<ScreenId, ScreenId>> = {
  buildmode: "main",
  robinbotai: "main",
  memefactory: "main",
  buy: "main",
  chart: "main",
  community: "main",
  settings: "main",
  help: "main",
  community_events: "community",
  community_event_details: "community_events",
  community_event_details_rules: "community_event_details",
  settings_profanity: "settings",
};

const LABEL: Record<ScreenId, string> = {
  main: "Main Menu",
  buildmode: "Build Mode",
  robinbotai: "RobinBot AI",
  memefactory: "Meme Factory",
  buy: `Buy $${"ERROR"}`,
  chart: "Chart",
  community: "Community",
  community_events: "Events",
  community_event_details: "Event Details",
  community_event_details_rules: "Rules",
  settings: "Settings",
  settings_profanity: "Profanity Filter",
  help: "Help",
};

// Screens that are informational dead-ends use "↩ Return"; screens that are
// still navigating through a menu tree use "⬅ Back". Per the UI rules, only
// one or the other ever appears, never both.
const INFO_LEAF: Set<ScreenId> = new Set([
  "buildmode",
  "robinbotai",
  "buy",
  "chart",
  "community_event_details_rules",
  "help",
]);

function breadcrumb(id: ScreenId): string {
  const parts: string[] = [];
  let cur: ScreenId | undefined = id;
  while (cur && cur !== "main") {
    parts.unshift(LABEL[cur]);
    cur = PARENT[cur];
  }
  return parts.length ? parts.join(" > ") : "Main Menu";
}

function nav(id: ScreenId): InlineKeyboard {
  const kb = new InlineKeyboard();
  const parent = PARENT[id];
  if (parent) {
    kb.text(INFO_LEAF.has(id) ? "↩ Return" : "⬅ Back", `nav:${parent}`);
  }
  return kb;
}

function render(id: ScreenId, ctx: Context): { text: string; keyboard: InlineKeyboard } {
  const crumb = `${breadcrumb(id)}\n\n`;

  switch (id) {
    case "main": {
      const kb = new InlineKeyboard()
        .text("🏗 Build Mode", "nav:buildmode")
        .text("🤖 RobinBot AI", "nav:robinbotai")
        .row()
        .text("🎨 Meme Factory", "nav:memefactory")
        .text("💰 Buy $ERROR", "nav:buy")
        .row()
        .text("📈 Chart", "nav:chart")
        .text("👥 Community", "nav:community")
        .row()
        .text("⚙️ Settings", "nav:settings")
        .text("❓ Help", "nav:help");
      return { text: "Welcome to Build Mode. What do you need?", keyboard: kb };
    }

    case "buildmode":
      return {
        text: `${crumb}Build Mode: you joined a community of Builders, not bag-holders. Profit Not Found. Community Found.`,
        keyboard: nav(id),
      };

    case "robinbotai":
      return {
        text: `${crumb}Mention me anywhere in the group (@RobinBot ...) and I'll answer in character — I remember recent context in this chat.`,
        keyboard: nav(id),
      };

    case "memefactory":
      return {
        text: `${crumb}Meme Factory is coming in a later update. For now, drop your idea in chat and I'll riff on it.`,
        keyboard: nav(id),
      };

    case "buy":
      return { text: `${crumb}Buy here: ${config.buyLink}`, keyboard: nav(id) };

    case "chart":
      return { text: `${crumb}Chart: ${config.chartLink}`, keyboard: nav(id) };

    case "community": {
      const kb = new InlineKeyboard().text("Events", "nav:community_events").row().text("⬅ Back", "nav:main");
      return { text: `${crumb}The ${config.projectName} community hub.`, keyboard: kb };
    }

    case "community_events": {
      const kb = new InlineKeyboard()
        .text("Latest Event", "nav:community_event_details")
        .row()
        .text("⬅ Back", "nav:community");
      return { text: `${crumb}Upcoming and recent community events.`, keyboard: kb };
    }

    case "community_event_details": {
      const kb = new InlineKeyboard()
        .text("Rules", "nav:community_event_details_rules")
        .row()
        .text("⬅ Back", "nav:community_events");
      return {
        text: `${crumb}Details for the latest event will show here once one is scheduled.`,
        keyboard: kb,
      };
    }

    case "community_event_details_rules":
      return {
        text: `${crumb}Standard rules apply: no spam, no scam links, be a Builder not a nuisance.`,
        keyboard: nav(id),
      };

    case "settings": {
      const kb = new InlineKeyboard().text("Profanity Filter", "nav:settings_profanity").row().text("⬅ Back", "nav:main");
      return { text: `${crumb}Group settings.`, keyboard: kb };
    }

    case "settings_profanity": {
      const chatId = ctx.chat?.id ?? 0;
      const enabled = isProfanityFilterEnabled(chatId);
      const kb = new InlineKeyboard();
      if (enabled) {
        kb.text("🔴 Disable", "confirm:disable_profanity");
      } else {
        kb.text("🟢 Enable", "confirm:enable_profanity");
      }
      kb.row().text("⬅ Back", "nav:settings");
      return {
        text: `${crumb}Profanity Filter is currently ${enabled ? "ON" : "OFF"}.`,
        keyboard: kb,
      };
    }

    case "help":
      return {
        text: `${crumb}Use the menu buttons to get around, or mention @RobinBot with a question any time.`,
        keyboard: nav(id),
      };
  }
}

async function showScreen(ctx: Context, id: ScreenId) {
  const { text, keyboard } = render(id, ctx);
  try {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  } catch {
    // original message too old to edit, or this is the first render — send fresh
    await ctx.reply(text, { reply_markup: keyboard });
  }
}

function successScreen(message: string): { text: string; keyboard: InlineKeyboard } {
  return {
    text: `✅ Success\n\n${message}`,
    keyboard: new InlineKeyboard().text("⬅ Back", "nav:settings_profanity").row().text("🏠 Home", "nav:main"),
  };
}

export function registerMenu(bot: Bot) {
  bot.command(["menu", "start"], (ctx) => showScreen(ctx, "main"));

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith("nav:")) {
      await ctx.answerCallbackQuery();
      await showScreen(ctx, data.slice(4) as ScreenId);
      return;
    }

    if (data.startsWith("confirm:")) {
      const action = data.slice(8);
      const label = action === "disable_profanity" ? "disable the profanity filter" : "enable the profanity filter";
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard()
        .text("✅ Yes", `do:${action}`)
        .text("❌ No", "nav:settings_profanity");
      await ctx.editMessageText(`Are you sure you want to ${label}?`, { reply_markup: kb });
      return;
    }

    if (data.startsWith("do:")) {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCallbackQuery({ text: "Admins only." });
        return;
      }
      const chatId = ctx.chat?.id;
      if (!chatId) return;
      const action = data.slice(3);

      if (action === "disable_profanity") {
        setProfanityFilterEnabled(chatId, false);
        await ctx.answerCallbackQuery();
        const { text, keyboard } = successScreen("Profanity filter disabled.");
        await ctx.editMessageText(text, { reply_markup: keyboard });
      } else if (action === "enable_profanity") {
        setProfanityFilterEnabled(chatId, true);
        await ctx.answerCallbackQuery();
        const { text, keyboard } = successScreen("Profanity filter enabled.");
        await ctx.editMessageText(text, { reply_markup: keyboard });
      } else {
        await ctx.answerCallbackQuery();
      }
    }
  });
}
