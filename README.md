# RobinBot — 404 Coin

Phase 1 core bot: welcome messages, basic commands, and AI chat (via @mention)
powered by Claude Haiku 4.5, with short-term per-chat conversation memory.

Not included yet (later phases): moderation/scam detection, meme generation,
milestone events, analytics/leaderboards, voice replies, website integration.

## Setup

1. Create a bot with @BotFather, get the token.
2. Copy `.env.example` to `.env` and fill in `BOT_TOKEN` and `ANTHROPIC_API_KEY`.
3. Add your Telegram numeric user ID(s) to `ADMIN_IDS` (comma-separated) —
   not used yet in Phase 1, but wired in for the moderation phase.
4. In BotFather, disable privacy mode (`/setprivacy` → Disable) if you want
   the bot to see all group messages, not just commands and @mentions.
   @mention-based AI chat works either way.
5. Give the bot admin rights in the group so it receives `chat_member`
   updates (needed for the welcome message).

## Deploy on Railway

1. Push this folder to a GitHub repo.
2. In Railway: New Project → Deploy from GitHub repo.
3. Set the environment variables from `.env.example` in Railway's Variables tab.
4. Railway will run `npm install && npm run build && npm start` (Node 18+).
   If it doesn't auto-detect, set:
   - Build command: `npm run build`
   - Start command: `npm start`

## Notes

- This uses ESM (`"type": "module"`) with compiled output in `dist/`. If you
  hit an ESM-related crash on Railway (like the uuid@9 issue in your other
  bots), check that all imports use `.js` extensions in the compiled output —
  this repo already does that in the source `import` statements.
- Conversation memory is in-process only (resets on redeploy/restart) and is
  not shared across multiple instances. Fine for one Railway instance; if you
  scale to multiple, move it to a database.
