# Notion Adapter Notes

This template does not include a Notion token in the front end.

If you want to use Notion:

1. Create a Notion integration.
2. Share your Notion database with that integration.
3. Store the token on your backend only:

```bash
NOTION_TOKEN=your_notion_internal_integration_token
NOTION_DATABASE_ID=your_database_id
```

4. Make the backend read from Notion and return the same public API shape:

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
      "reusable": "Reusable prompt block",
      "source_url": "https://example.com",
      "user_note": "",
      "clip_id": "clip_123",
      "status": "synced",
      "created_at": "2026-01-01T00:00:00.000Z",
      "notion_page_id": ""
    }
  ]
}
```

The userscripts do not need to know whether the backend uses Notion, a database, or JSON files.
