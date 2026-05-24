# Telegram Bot Clipper

A small standalone bot that lets you save clips from your phone: send text to the
bot, pick a room, and it POSTs to your clip API (which runs AI enrichment
automatically).

## Create a Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot` and follow the prompts (name + username).
3. Copy the token BotFather gives you.

## Configure

Create `telegram/.env`:

```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
CLIP_API_BASE=http://localhost:8787
```

- `TELEGRAM_BOT_TOKEN` — the token from BotFather (required).
- `CLIP_API_BASE` — your running clip API. Use your deployed URL if the backend
  is not on the same machine.

## Run

```bash
cd telegram
npm install
npm start
```

The bot uses long polling, so it does not need a public webhook URL.

## Usage

1. Send the bot any text message.
2. It replies with an inline keyboard of rooms.
3. Tap a room.
4. The bot POSTs the text to `${CLIP_API_BASE}/clip` with `source: "telegram"`.
5. On success it replies `✅ Saved to {room}` plus the AI-generated summary.

Commands:

- `/start` — short help.
- `/rooms` — list available rooms.

## Run with PM2

To keep the bot running in the background:

```bash
cd telegram
npm install
pm2 start bot.js --name prompt-studio-telegram
pm2 save
```

Make sure the environment variables are available to the process (either via
`telegram/.env`, which the bot loads on startup, or your PM2 ecosystem config).
