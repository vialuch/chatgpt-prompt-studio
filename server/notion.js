// Notion adapter for ChatGPT Prompt Studio.
//
// Stores clips as pages in a Notion database instead of (or in addition to)
// the local JSON file. Activated only when both NOTION_TOKEN and
// NOTION_DATABASE_ID are set; otherwise the server falls back to local JSON.
//
// Node 18+ ships a global `fetch`. On Node < 18, install `node-fetch` and
// uncomment the import below.
// import fetch from "node-fetch";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// Notion caps a single rich_text / text content object at 2000 characters.
const NOTION_TEXT_LIMIT = 2000;

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

export function notionConfigured() {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}

// Split a long string into <= NOTION_TEXT_LIMIT chunks and wrap each as a
// Notion rich_text object. Empty input yields an empty array.
function richText(value) {
  const text = String(value || "");
  if (!text) return [];
  const chunks = [];
  for (let i = 0; i < text.length; i += NOTION_TEXT_LIMIT) {
    chunks.push({ type: "text", text: { content: text.slice(i, i + NOTION_TEXT_LIMIT) } });
  }
  return chunks;
}

// A select property only accepts a non-empty option name. Omit it otherwise,
// so we never send `{ select: { name: "" } }` (which Notion rejects).
function selectProp(value) {
  const name = String(value || "").trim();
  return name ? { select: { name } } : undefined;
}

function multiSelectProp(values) {
  const list = Array.isArray(values) ? values : [];
  return {
    multi_select: list
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .slice(0, 100)
      .map((name) => ({ name }))
  };
}

function urlProp(value) {
  const url = String(value || "").trim();
  return { url: url || null };
}

function paragraph(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(text) }
  };
}

function heading(text) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: richText(text) }
  };
}

// Build the page body blocks: the raw clip text, plus an "Analysis" section
// holding the structured AI fields (if the clip was enriched).
function buildChildren(clip) {
  const children = [];
  const raw = String(clip.raw_text || clip.reusable || "");
  if (raw) {
    // A single paragraph block also caps at 2000 chars, so chunk long text.
    for (let i = 0; i < raw.length; i += NOTION_TEXT_LIMIT) {
      children.push(paragraph(raw.slice(i, i + NOTION_TEXT_LIMIT)));
    }
  }

  const analysis = {};
  if (clip.style_dna) analysis.style_dna = clip.style_dna;
  if (clip.prompt_dna) analysis.prompt_dna = clip.prompt_dna;
  if (clip.memory_card) analysis.memory_card = clip.memory_card;
  if (Object.keys(analysis).length) {
    children.push(heading("Analysis"));
    const json = JSON.stringify(analysis, null, 2);
    for (let i = 0; i < json.length; i += NOTION_TEXT_LIMIT) {
      children.push(paragraph(json.slice(i, i + NOTION_TEXT_LIMIT)));
    }
  }

  // Notion accepts at most 100 children blocks per page-create request.
  return children.slice(0, 100);
}

function buildProperties(clip) {
  const props = {
    Title: { title: richText(clip.title || "Untitled clip") },
    Tags: multiSelectProp(clip.tags),
    Summary: { rich_text: richText(clip.summary) },
    "Learning Goal": { rich_text: richText(clip.memory_card?.learning_goal || clip.learning_goal) },
    "Source URL": urlProp(clip.source_url),
    "User Note": { rich_text: richText(clip.user_note) },
    "Usage Note": { rich_text: richText(clip.usage_note) },
    "Risk Note": { rich_text: richText(clip.risk_note) }
  };

  const room = selectProp(clip.room);
  if (room) props.Room = room;
  const kind = selectProp(clip.kind);
  if (kind) props.Kind = kind;
  const source = selectProp(clip.source || "web_clipper");
  if (source) props.Source = source;
  const status = selectProp(clip.status || "saved");
  if (status) props.Status = status;

  return props;
}

// Create one Notion page for a clip.
// Returns { ok, page_id } on success, { ok: false, error } on failure.
export async function notionCreateClip(clip) {
  if (!notionConfigured()) return { ok: false, error: "notion not configured" };
  try {
    const res = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: buildProperties(clip),
        children: buildChildren(clip)
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.message || `notion HTTP ${res.status}` };
    }
    return { ok: true, page_id: data.id || "" };
  } catch (err) {
    return { ok: false, error: err?.message || "notion request failed" };
  }
}

function plainText(richTextArr) {
  if (!Array.isArray(richTextArr)) return "";
  return richTextArr.map((t) => t?.plain_text || t?.text?.content || "").join("");
}

// Map a Notion page object back to the public library item shape so the
// userscripts get the same structure regardless of storage backend.
function pageToItem(page) {
  const props = page.properties || {};
  return {
    title: plainText(props.Title?.title) || "Untitled clip",
    room: props.Room?.select?.name || "Inbox",
    kind: props.Kind?.select?.name || "note",
    tags: Array.isArray(props.Tags?.multi_select) ? props.Tags.multi_select.map((t) => t.name) : [],
    summary: plainText(props.Summary?.rich_text),
    learning_goal: plainText(props["Learning Goal"]?.rich_text),
    // Notion's database query returns properties only, not page body, so the
    // full reusable text is not re-hydrated here (documented limitation).
    reusable: "",
    source_url: props["Source URL"]?.url || "",
    user_note: plainText(props["User Note"]?.rich_text),
    usage_note: plainText(props["Usage Note"]?.rich_text),
    risk_note: plainText(props["Risk Note"]?.rich_text),
    clip_id: page.id || "",
    status: props.Status?.select?.name || "saved",
    created_at: page.created_time || "",
    notion_page_id: page.id || ""
  };
}

// Query the Notion database.
// Returns { ok, items } on success, { ok: false, error, items: [] } on failure.
//
// Limitation: Notion's API has no full-text search across page bodies, so the
// `q` filter only matches the Title property (title contains). Body/raw text
// is not searchable here.
export async function notionQueryPrompts({ room, kind, q, limit } = {}) {
  if (!notionConfigured()) return { ok: false, error: "notion not configured", items: [] };
  const filters = [];
  if (room) filters.push({ property: "Room", select: { equals: room } });
  if (kind) filters.push({ property: "Kind", select: { equals: kind } });
  if (q) filters.push({ property: "Title", title: { contains: q } });

  const body = {
    page_size: Math.min(Math.max(Number(limit) || 20, 1), 100),
    sorts: [{ timestamp: "created_time", direction: "descending" }]
  };
  if (filters.length === 1) body.filter = filters[0];
  else if (filters.length > 1) body.filter = { and: filters };

  try {
    const res = await fetch(`${NOTION_API}/databases/${process.env.NOTION_DATABASE_ID}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.message || `notion HTTP ${res.status}`, items: [] };
    }
    const items = Array.isArray(data.results) ? data.results.map(pageToItem) : [];
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err?.message || "notion request failed", items: [] };
  }
}

// Fixed room list (mirrors the server's ROOMS).
export function notionGetRooms() {
  return { ok: true, rooms: ROOMS };
}
