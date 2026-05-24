// AI enrichment for ChatGPT Prompt Studio.
//
// Turns a raw text clip into a structured, searchable "memory card":
// summary, tags, kind, room classification, style DNA, prompt DNA, and
// transferable technique. Uses OpenAI when OPENAI_API_KEY is set; otherwise it
// degrades gracefully to a local rule-based fallback so saving never blocks.
//
// Node 18+ ships a global `fetch`. On Node < 18, install `node-fetch`.
// import fetch from "node-fetch";

const OPENAI_API = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 30000;

const VALID_KINDS = ["style", "prompt", "mood", "dialogue", "plot", "note"];

const KIND_TO_ROOM = {
  prompt: "Image Prompt",
  style: "Writing Style",
  mood: "Mood",
  dialogue: "Dialogue",
  plot: "Plot",
  note: "Reference"
};

export function aiEnrichConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function kindToRoom(kind) {
  return KIND_TO_ROOM[kind] || "Inbox";
}

// Local, zero-API keyword classifier. Returns one of VALID_KINDS.
export function detectKind(text, hintedType) {
  const hint = String(hintedType || "").trim().toLowerCase();
  // Honor an explicit, specific hint — but NOT "note", which is the server's
  // "I don't know" default. Treating "note" as authoritative would suppress the
  // keyword detection below for every un-roomed clip.
  if (VALID_KINDS.includes(hint) && hint !== "note") return hint;

  const raw = String(text || "");
  const lower = raw.toLowerCase();

  // Image-generation prompts.
  if (/\b(negative prompt|masterpiece|best quality|1girl|1boy|cfg|steps?|seed)\b/.test(lower) ||
      /\bprompt\b/.test(lower)) {
    return "prompt";
  }
  // Plot / story material.
  if (/(plot|story|narrative|剧情|设定|反转|冲突|world ?building)/.test(lower)) {
    return "plot";
  }
  // Mood / atmosphere.
  if (/(氛围|气味|色调|质感|mood|vibe|atmosphere|ambience)/.test(lower)) {
    return "mood";
  }
  // Short quoted snippet -> a line of dialogue.
  if (raw.length <= 200 && /["“”'']/.test(raw)) {
    return "dialogue";
  }
  return "style";
}

const SYSTEM_PROMPT = `You are a smart librarian for a personal prompt and writing style collection.

Your task: turn a raw text clip into a structured, searchable, reusable memory card.

Rules:
1. Do NOT copy or restate the original text at length.
2. Extract learnable structure, style DNA, technique, and reuse potential.
3. For writing style clips: analyze rhythm, syntax, sensory detail, emotion arc, transferable technique.
4. For image generation prompts: analyze subject, style, camera, lighting, color, composition, materials, negative terms, reusable modules.
5. For mood/dialogue/plot/notes: choose the appropriate analysis structure.
6. Classify into a room. Room rules:
   - "RP Prompt" = character cards, persona, interaction rules, worldbuilding frameworks
   - "Image Prompt" = image generation prompts, negative prompts, art style, camera, composition
   - "Writing Style" = prose excerpts, narrative style, syntax rhythm, sensory writing
   - "NSFW" = adult-oriented style, prompts, or excerpts (still analyze technique abstractly)
   - "Jokes" = memes, punchlines, humor structure
   - "Dialogue" = character voice, speech patterns, single-line expressions
   - "Plot" = story conflicts, twists, character relationships, world settings
   - "Mood" = scene atmosphere, smell, color, space, emotional undertone
   - "Reference" = tutorials, knowledge, reference material
   - "Inbox" = when uncertain
7. If content involves copyright, privacy, or sensitive material, note it in risk_note; still extract abstract technique.
8. Output ONLY a strict JSON object. No markdown, no code blocks.`;

// Build the system + user messages for the OpenAI call.
export function buildAnalysisPrompt(clip, kind) {
  const source = String(clip.source || "web_clipper");
  const clipText = String(clip.raw_text || clip.reusable || "");
  const user = `Output this JSON schema:
{
  "kind": "style|prompt|mood|dialogue|plot|note",
  "room": "RP Prompt|Image Prompt|Writing Style|NSFW|Jokes|Dialogue|Plot|Mood|Reference|Inbox",
  "title": "short title, max 60 chars",
  "summary": "one sentence describing the core value of this clip",
  "tags": ["3-8 short tags"],
  "memory_card": {
    "learning_goal": "what should the user learn from this clip",
    "do_not_copy": "what should NOT be copied verbatim",
    "reuse_scenario": "what writing/drawing scenario is this useful for"
  },
  "style_dna": {
    "rhythm": "writing rhythm; if not prose, describe organizational rhythm",
    "syntax": "sentence structure, paragraph style, POV, or prompt organization",
    "sensory": "sensory details, imagery, body-feel, or visual detail strategy",
    "emotion": "emotion arc or tension mechanism",
    "transferable_technique": "abstract transferable technique, independent of source text"
  },
  "prompt_dna": {
    "subject": "if image prompt: subject/character/object; else empty",
    "style": "art style or aesthetic",
    "composition": "composition/camera/angle",
    "lighting": "lighting",
    "color": "color palette",
    "materials": "texture/materials",
    "negative": "negative terms or elements to avoid",
    "reusable_blocks": ["reusable prompt modules"]
  },
  "usage_note": "usage instructions for the future user",
  "risk_note": "copyright/privacy/sensitivity warning, empty string if none",
  "status": "saved"
}

System pre-classification kind: ${kind}
Source info: ${source}
Clip text:
${clipText}`;
  return { system: SYSTEM_PROMPT, user };
}

const EMPTY_STYLE_DNA = { rhythm: "", syntax: "", sensory: "", emotion: "", transferable_technique: "" };
const EMPTY_PROMPT_DNA = { subject: "", style: "", composition: "", lighting: "", color: "", materials: "", negative: "", reusable_blocks: [] };

// Local fallback used when no API key is set or the API call fails.
// Respects a user-provided room/title/tags rather than overwriting them, so a
// deliberate choice in the clipper survives even with no AI available.
export function fallbackEnrichment(clip, kind) {
  const userTitle = String(clip.title || "").trim();
  const title = userTitle && userTitle !== "Untitled clip"
    ? userTitle
    : (String(clip.raw_text || "").slice(0, 60) || "Untitled clip");

  const userRoom = String(clip.room || "").trim();
  const room = userRoom && userRoom !== "Inbox" ? userRoom : kindToRoom(kind);

  const userTags = Array.isArray(clip.tags) ? clip.tags : [];
  const tags = [...new Set([...userTags, kind, "inbox"].map((t) => String(t || "").trim()).filter(Boolean))].slice(0, 12);

  return {
    kind,
    room,
    title,
    summary: "Saved. AI analysis unavailable — enrich manually or retry later.",
    tags,
    memory_card: {
      learning_goal: "Analyze this clip's structure and transferable technique.",
      do_not_copy: "Do not copy verbatim.",
      reuse_scenario: "Use as reference material."
    },
    style_dna: { ...EMPTY_STYLE_DNA },
    prompt_dna: { ...EMPTY_PROMPT_DNA },
    usage_note: "",
    risk_note: "",
    status: "saved",
    enriched: false
  };
}

async function callOpenAI(system, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

// Reconcile AI output with user-provided fields. We respect an explicit
// user choice (a non-placeholder title, a non-Inbox room) rather than letting
// the model silently overwrite it, and we union tags. Everything else comes
// from the model. This keeps "zero manual" enrichment while not fighting the
// user when they did make a choice.
function mergeEnrichment(clip, ai, kind) {
  const aiKind = VALID_KINDS.includes(String(ai.kind || "").toLowerCase())
    ? String(ai.kind).toLowerCase()
    : kind;

  const userTitle = String(clip.title || "").trim();
  const title = userTitle && userTitle !== "Untitled clip" ? userTitle : (String(ai.title || "").slice(0, 60) || "Untitled clip");

  const userRoom = String(clip.room || "").trim();
  const room = userRoom && userRoom !== "Inbox" ? userRoom : (String(ai.room || "").trim() || kindToRoom(aiKind));

  const userTags = Array.isArray(clip.tags) ? clip.tags : [];
  const aiTags = Array.isArray(ai.tags) ? ai.tags : [];
  const tags = [...new Set([...userTags, ...aiTags].map((t) => String(t || "").trim()).filter(Boolean))].slice(0, 12);

  return {
    kind: aiKind,
    room,
    title,
    summary: String(ai.summary || "").trim() || "Saved.",
    tags: tags.length ? tags : [aiKind],
    memory_card: {
      learning_goal: ai.memory_card?.learning_goal || "",
      do_not_copy: ai.memory_card?.do_not_copy || "",
      reuse_scenario: ai.memory_card?.reuse_scenario || ""
    },
    style_dna: { ...EMPTY_STYLE_DNA, ...(ai.style_dna || {}) },
    prompt_dna: { ...EMPTY_PROMPT_DNA, ...(ai.prompt_dna || {}) },
    usage_note: String(ai.usage_note || "").trim(),
    risk_note: String(ai.risk_note || "").trim(),
    status: "saved",
    enriched: true
  };
}

// Main entry point: returns the enriched fields to merge onto the clip.
// Never throws — on any failure it returns the local fallback.
export async function enrichClip(clip) {
  const kind = detectKind(clip.raw_text || clip.reusable, clip.kind || clip.type);

  if (!aiEnrichConfigured()) {
    return fallbackEnrichment(clip, kind);
  }

  try {
    const { system, user } = buildAnalysisPrompt(clip, kind);
    const ai = await callOpenAI(system, user);
    return mergeEnrichment(clip, ai, kind);
  } catch (err) {
    console.warn(`[ai-enrich] enrichment failed, using fallback: ${err?.message || err}`);
    return fallbackEnrichment(clip, kind);
  }
}
