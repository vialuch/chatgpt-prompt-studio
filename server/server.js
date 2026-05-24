import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { notionConfigured, notionCreateClip, notionQueryPrompts, notionGetRooms } from "./notion.js";
import { aiEnrichConfigured, enrichClip } from "./ai-enrich.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8787);
const DATA_FILE = path.resolve(__dirname, process.env.DATA_FILE || "./data/clips.json");

const USE_NOTION = notionConfigured();

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

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRoom(value) {
  const raw = String(value || "").trim().toLowerCase();
  const map = {
    "rp": "RP Prompt",
    "rp prompt": "RP Prompt",
    "rp_prompt": "RP Prompt",
    "image": "Image Prompt",
    "image prompt": "Image Prompt",
    "image_prompt": "Image Prompt",
    "prompt": "Image Prompt",
    "style": "Writing Style",
    "writing": "Writing Style",
    "writing style": "Writing Style",
    "nsfw": "NSFW",
    "joke": "Jokes",
    "jokes": "Jokes",
    "humor": "Jokes",
    "dialogue": "Dialogue",
    "plot": "Plot",
    "mood": "Mood",
    "reference": "Reference",
    "note": "Reference",
    "inbox": "Inbox"
  };
  return map[raw] || ROOMS.find((room) => room.toLowerCase() === raw) || "Inbox";
}

function inferKind(room, fallback) {
  const raw = String(fallback || "").trim().toLowerCase();
  if (["prompt", "style", "mood", "dialogue", "plot", "note"].includes(raw)) return raw;
  if (room === "RP Prompt" || room === "Image Prompt") return "prompt";
  if (room === "Writing Style" || room === "NSFW") return "style";
  if (room === "Dialogue") return "dialogue";
  if (room === "Plot") return "plot";
  if (room === "Mood") return "mood";
  return "note";
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readClips() {
  await ensureDataFile();
  const text = await fs.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeClips(clips) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, `${JSON.stringify(clips, null, 2)}\n`, "utf8");
}

function hasDnaContent(dna) {
  if (!dna || typeof dna !== "object") return false;
  return Object.values(dna).some((v) => (Array.isArray(v) ? v.length > 0 : String(v || "").trim().length > 0));
}

function toLibraryItem(item) {
  return {
    title: item.title || item.page_title || item.raw_text?.slice(0, 48) || "Untitled clip",
    room: item.room || "Inbox",
    kind: item.kind || item.type || "note",
    tags: Array.isArray(item.tags) ? item.tags : [],
    summary: item.summary || item.raw_text?.slice(0, 180) || "",
    learning_goal: item.memory_card?.learning_goal || item.learning_goal || item.user_note || "",
    reusable: item.reusable || item.raw_text || "",
    source_url: item.source_url || "",
    user_note: item.user_note || "",
    clip_id: item.clip_id,
    status: item.status || "saved",
    created_at: item.created_at,
    notion_page_id: item.notion_page_id || "",
    // AI enrichment fields
    usage_note: item.usage_note || "",
    risk_note: item.risk_note || "",
    style_dna: item.style_dna || null,
    prompt_dna: item.prompt_dna || null,
    memory_card: item.memory_card || null,
    enriched: item.enriched === true || hasDnaContent(item.style_dna) || hasDnaContent(item.prompt_dna)
  };
}

function matchesQuery(item, q) {
  if (!q) return true;
  const haystack = [
    item.title,
    item.room,
    item.kind,
    item.summary,
    item.learning_goal,
    item.reusable,
    item.user_note,
    item.raw_text,
    ...(Array.isArray(item.tags) ? item.tags : [])
  ].join(" ").toLowerCase();
  return haystack.includes(q.toLowerCase());
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "chatgpt-prompt-studio-api", message: "Prompt Studio is awake" });
});

app.post("/clip", async (req, res) => {
  const payload = req.body || {};
  const text = String(payload.text || payload.raw_text || "").trim();
  const sourceUrl = String(payload.source_url || "").trim();

  if (!text && !sourceUrl) {
    res.status(400).json({ ok: false, error: "text or source_url is required" });
    return;
  }

  const room = normalizeRoom(payload.room || payload.type);
  const kind = inferKind(room, payload.kind || payload.type);
  const item = {
    clip_id: makeId(),
    room,
    kind,
    type: kind,
    title: String(payload.page_title || payload.title || "").trim() || "Untitled clip",
    raw_text: text || sourceUrl,
    source: String(payload.source || "web_clipper").trim(),
    source_url: sourceUrl,
    page_title: String(payload.page_title || "").trim(),
    user_note: String(payload.user_note || "").trim(),
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    summary: String(payload.summary || "").trim(),
    learning_goal: String(payload.learning_goal || "").trim(),
    reusable: String(payload.reusable || text || sourceUrl).trim(),
    status: "saved",
    created_at: nowIso()
  };

  // AI enrichment (non-blocking on failure: enrichClip never throws and
  // falls back to local rule-based fields when no key is set or the call dies).
  const enriched = await enrichClip(item);
  Object.assign(item, enriched);

  // Always keep a local JSON copy as a backup, even in Notion mode.
  const clips = await readClips();
  clips.unshift(item);
  await writeClips(clips);

  // In Notion mode, also create a Notion page. A Notion failure must not lose
  // the clip — it is already safe in local JSON. `item` is the same object
  // held in `clips`, so updating it and rewriting persists the page id.
  if (USE_NOTION) {
    const result = await notionCreateClip(item);
    if (result.ok) {
      item.notion_page_id = result.page_id;
      await writeClips(clips);
    } else {
      console.warn(`[notion] create failed (clip kept in local JSON): ${result.error}`);
    }
  }

  res.json({ ok: true, item: toLibraryItem(item) });
});

app.get("/library/rooms", (_req, res) => {
  if (USE_NOTION) {
    res.json(notionGetRooms());
    return;
  }
  res.json({ ok: true, rooms: ROOMS });
});

app.get(["/library/prompts", "/library/search"], async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
  const room = req.query.room ? normalizeRoom(req.query.room) : "";
  const kind = String(req.query.kind || "").trim().toLowerCase();
  const q = String(req.query.q || "").trim();

  if (USE_NOTION) {
    const result = await notionQueryPrompts({ room, kind, q, limit });
    if (result.ok) {
      res.json({ ok: true, items: result.items });
      return;
    }
    // Fall back to the local JSON backup if Notion is unreachable.
    console.warn(`[notion] query failed, serving local JSON: ${result.error}`);
  }

  const clips = await readClips();
  const items = clips
    .filter((item) => !room || normalizeRoom(item.room) === room)
    .filter((item) => !kind || String(item.kind || item.type || "").toLowerCase() === kind)
    .filter((item) => matchesQuery(item, q))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, limit)
    .map(toLibraryItem);

  res.json({ ok: true, items });
});

app.listen(PORT, () => {
  console.log(`Prompt Studio API listening on http://localhost:${PORT}`);
  console.log(`Storage: ${USE_NOTION ? "Notion" : "local JSON"}`);
  console.log(`AI enrichment: ${aiEnrichConfigured() ? `OpenAI (${process.env.OPENAI_MODEL || "gpt-4o-mini"})` : "disabled (no OPENAI_API_KEY)"}`);
});
