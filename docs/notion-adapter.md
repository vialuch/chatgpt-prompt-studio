# Notion Adapter

The backend can store clips in a Notion database instead of (well, in addition
to) the local JSON file. It activates automatically when both `NOTION_TOKEN` and
`NOTION_DATABASE_ID` are set; otherwise the server uses local JSON.

The userscripts never talk to Notion directly. They only ever call your backend,
so they do not need to know which storage mode is active.

## Database Properties

Create a Notion database with the following properties. Names and types must
match exactly (the adapter maps clip fields onto them when creating a page).

| Notion Property | Type         | Clip field                            |
|-----------------|--------------|---------------------------------------|
| Title           | Title        | `title`                               |
| Room            | Select       | `room`                                |
| Kind            | Select       | `kind`                                |
| Tags            | Multi-select | `tags`                                |
| Summary         | Rich text    | `summary`                             |
| Learning Goal   | Rich text    | `memory_card.learning_goal`           |
| Source URL      | URL          | `source_url`                          |
| User Note       | Rich text    | `user_note`                           |
| Source          | Select       | `source` (web_clipper / ios_shortcut / telegram) |
| Status          | Select       | `status` (default "saved")            |
| Usage Note      | Rich text    | `usage_note`                          |
| Risk Note       | Rich text    | `risk_note`                           |

The clip's raw text goes into the **page body** as paragraph blocks. If the clip
was AI-enriched, the structured fields (`style_dna`, `prompt_dna`,
`memory_card`) are appended to the page body as JSON under an "Analysis" heading.

Select properties are created on demand — you do not have to pre-define every
room/kind option, Notion adds new options as they appear.

## Setup

1. Go to <https://www.notion.so/my-integrations> and create a new internal
   integration. Copy the integration token.
2. Open your database in Notion, click the `•••` menu → **Connections** → add
   your integration so it can read and write the database.
3. Copy the database ID from its URL (the 32-character hex string before `?v=`).
4. Set the environment variables:

```bash
NOTION_TOKEN=your_notion_internal_integration_token
NOTION_DATABASE_ID=your_database_id
```

5. Restart the backend. On startup it logs `Storage: Notion`.

## API Shape

Queries return the same item shape as local JSON mode, so the front end is
unaffected:

```json
{
  "ok": true,
  "items": [
    {
      "title": "Example",
      "room": "RP Prompt",
      "kind": "prompt",
      "tags": ["tag"],
      "summary": "Short summary",
      "learning_goal": "What to learn",
      "reusable": "",
      "source_url": "https://example.com",
      "user_note": "",
      "clip_id": "page_id",
      "status": "saved",
      "created_at": "2026-01-01T00:00:00.000Z",
      "notion_page_id": "page_id"
    }
  ]
}
```

## Known Limitations

- **No full-text search.** Notion's API cannot search across page bodies, so the
  `q` query parameter only matches the **Title** property (`title contains`).
  Body / raw text is not searchable through the Notion adapter.
- **Query returns properties, not page body.** The `reusable` (raw text) field is
  not re-hydrated from Notion in list/search responses; it comes back empty.
  Summary, tags, and the structured properties are all returned.
- **Local backup is always written.** Even in Notion mode, each clip is also
  saved to `server/data/clips.json`, and the server falls back to local JSON if
  Notion is unreachable.
