# AI Enrichment

When `OPENAI_API_KEY` is set, every clip is analyzed automatically as it is
saved. The raw text goes in; a structured "memory card" comes out — summary,
tags, classification, and reusable technique — with no manual tagging.

## What It Produces

`POST /clip` runs the raw text through OpenAI before saving and merges the
result into the stored clip. The model returns this JSON schema:

```json
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
```

The Library panel shows the summary, tags, an `✨ AI` badge, collapsible Style
DNA / Prompt DNA panels, a usage note, and (in red) any risk note.

## Configuration

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
```

- `OPENAI_API_KEY` — required to enable enrichment. Without it, enrichment is
  disabled (the server logs `AI enrichment: disabled`).
- `OPENAI_MODEL` — optional, defaults to `gpt-4o-mini`. You can set it to
  `gpt-4o` or any chat model that supports `response_format: json_object`.

## Fallback Behavior

Enrichment never blocks or loses a save:

- **No key** → the clip is saved with a local rule-based classification
  (`detectKind`) and placeholder analysis fields.
- **API error or timeout** (30s) → same local fallback, and a warning is logged.

The local classifier matches keywords to pick a `kind`
(`prompt` / `style` / `mood` / `dialogue` / `plot` / `note`) and maps it to a
room, so even offline the clip lands somewhere sensible.

## Cost

`gpt-4o-mini` is roughly **$0.15 per 1M input tokens**. A clip is usually
500–2000 tokens, so each enrichment costs a fraction of a cent. For most personal
use the monthly cost is negligible.
