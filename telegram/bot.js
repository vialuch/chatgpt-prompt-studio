// Telegram Bot Clipper for ChatGPT Prompt Studio.
//
// Flow:
//   1. User sends any text message to the bot.
//   2. Bot replies with an inline keyboard of rooms.
//   3. User taps a room.
//   4. Bot POSTs the text to the clip API, which runs AI enrichment.
//   5. Bot confirms "Saved to {room}" with the generated summary.
//
// Config (telegram/.env or environment):
//   TELEGRAM_BOT_TOKEN=...   token from @BotFather
//   CLIP_API_BASE=http://localhost:8787

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TelegramBot from "node-telegram-bot-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal zero-dependency .env loader so `npm start` picks up telegram/.env.
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnv();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CLIP_API_BASE = (process.env.CLIP_API_BASE || "http://localhost:8787").replace(/\/$/, "");

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required. Set it in telegram/.env or the environment.");
  process.exit(1);
}

const ROOMS = [
  "RP Prompt",
  "Image Prompt",
  "Writing Style",
  "NSFW",
  "Jokes",
  "Dialogue",
  "Plot",
  "Mood",
  "Reference",
  "Inbox"
];

// callback_data has a 64-byte limit, so we can't ship the clip text in it.
// Stash pending text in memory keyed by a short id and reference it instead.
const pending = new Map();
const PENDING_TTL_MS = 30 * 60 * 1000;

function stash(text) {
  const id = Math.random().toString(36).slice(2, 8);
  pending.set(id, { text, at: Date.now() });
  return id;
}

function takePending(id) {
  const entry = pending.get(id);
  if (!entry) return null;
  pending.delete(id);
  if (Date.now() - entry.at > PENDING_TTL_MS) return null;
  return entry.text;
}

// Periodically drop stale entries so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pending) {
    if (now - entry.at > PENDING_TTL_MS) pending.delete(id);
  }
}, PENDING_TTL_MS).unref?.();

// Inline keyboard: 5 buttons per row, 2 rows.
function roomKeyboard(id) {
  const buttons = ROOMS.map((room, idx) => ({ text: room, callback_data: `save:${id}:${idx}` }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push(buttons.slice(i, i + 5));
  return { reply_markup: { inline_keyboard: rows } };
}

async function postClip(room, text) {
  const res = await fetch(`${CLIP_API_BASE}/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room,
      text,
      page_title: "",
      source_url: "",
      user_note: "",
      source: "telegram"
    })
  });
  if (!res.ok) throw new Error(`clip API HTTP ${res.status}`);
  return res.json();
}

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/^\/start\b/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Send me any text and I'll save it to your Prompt Studio.\nUse /rooms to see available rooms."
  );
});

bot.onText(/^\/rooms\b/, (msg) => {
  bot.sendMessage(msg.chat.id, `Rooms:\n${ROOMS.map((r) => `• ${r}`).join("\n")}`);
});

bot.on("message", (msg) => {
  const text = String(msg.text || "").trim();
  // Ignore commands and empty/non-text messages; those are handled elsewhere.
  if (!text || text.startsWith("/")) return;
  const id = stash(text);
  bot.sendMessage(msg.chat.id, "Pick a room for this clip:", roomKeyboard(id));
});

bot.on("callback_query", async (query) => {
  const data = String(query.data || "");
  const m = data.match(/^save:([a-z0-9]+):(\d+)$/);
  if (!m) {
    bot.answerCallbackQuery(query.id);
    return;
  }
  const id = m[1];
  const room = ROOMS[Number(m[2])] || "Inbox";
  const chatId = query.message?.chat?.id;
  const text = takePending(id);

  if (!text) {
    bot.answerCallbackQuery(query.id, { text: "This clip expired — send it again." });
    if (chatId) bot.sendMessage(chatId, "⌛ That clip expired. Please send the text again.");
    return;
  }

  try {
    const result = await postClip(room, text);
    bot.answerCallbackQuery(query.id, { text: `Saved to ${room}` });
    const summary = result?.item?.summary ? `\n${result.item.summary}` : "";
    if (chatId) bot.sendMessage(chatId, `✅ Saved to ${room}${summary}`);
  } catch (err) {
    bot.answerCallbackQuery(query.id, { text: "Save failed." });
    if (chatId) bot.sendMessage(chatId, `❌ Save failed: ${err?.message || err}`);
  }
});

bot.on("polling_error", (err) => {
  console.error(`[telegram] polling error: ${err?.message || err}`);
});

console.log(`Telegram clipper running. Clip API: ${CLIP_API_BASE}`);
