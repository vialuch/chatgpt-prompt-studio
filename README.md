# ChatGPT Prompt Studio

Made by Dan & Joy

A small, self-hostable prompt library for ChatGPT web.

It gives you:

- A ChatGPT-only floating Studio drawer.
- A Library panel that can search and insert prompt references into ChatGPT.
- A lightweight Web Clipper button for ordinary web pages.
- A demo backend API that stores clips locally as JSON.
- A clean path for connecting your own Notion database or another backend later.

This repository is a public template. It does not include private domains, API keys, Notion tokens, Telegram tokens, or personal prompt data.

## What You Can Build

You can save prompts, writing examples, jokes, RP templates, mood snippets, or notes from normal web pages, then reuse them inside ChatGPT web.

The default backend is intentionally simple:

- `POST /clip`
- `GET /library/rooms`
- `GET /library/prompts`
- `GET /library/search`

The userscripts only talk to your own backend API. They do not call Notion directly and they do not contain tokens.

## Project Structure

```text
chatgpt-prompt-studio/
  userscripts/
    chatgpt-prompt-studio.user.js
    web-clipper.user.js
  server/
    package.json
    server.js
    data/
      .gitkeep
  docs/
    install-userscripts.md
    deploy-backend.md
    notion-adapter.md
  .env.example
  .gitignore
  LICENSE
  README.md
```

## Quick Start

1. Install dependencies:

```bash
cd server
npm install
```

2. Start the demo backend:

```bash
npm start
```

The API will run at:

```text
http://localhost:8787
```

3. Open `userscripts/chatgpt-prompt-studio.user.js`.

At the top, change:

```js
API_BASE: "http://localhost:8787"
```

to your deployed API URL when you put the backend on a server.

4. Install both userscripts in a userscript manager:

- `userscripts/chatgpt-prompt-studio.user.js`
- `userscripts/web-clipper.user.js`

See [Install Userscripts](docs/install-userscripts.md).

## Userscripts

### ChatGPT Prompt Studio

Runs only on:

```text
https://chatgpt.com/*
https://chat.openai.com/*
```

It adds one draggable floating button. Click it to open the drawer:

- Save: save selected text or current ChatGPT input.
- Library: search your saved clips and insert them into ChatGPT.
- Studio: adjust background, font, text size, and compact mode.
- Settings: reset floating button position.

### Web Clipper

Runs on normal web pages, but skips ChatGPT.

It adds one small draggable button. Select text on a page, click the button, choose a room, and the clip is sent to your backend.

## API Contract

### Save Clip

```http
POST /clip
Content-Type: application/json
```

```json
{
  "room": "RP Prompt",
  "kind": "prompt",
  "text": "Prompt or writing sample",
  "source_url": "https://example.com/page",
  "page_title": "Example",
  "user_note": "Why this is useful",
  "source": "web_clipper"
}
```

### Rooms

```http
GET /library/rooms
```

### Prompts

```http
GET /library/prompts?room=RP%20Prompt&q=keyword&limit=20
```

## Privacy Notes

Do not put secrets in userscripts. Userscripts are front-end code and can be read by the browser.

Keep these on the server only:

- Notion token
- OpenAI API key
- Telegram bot token
- database passwords

This template stores demo clips in `server/data/clips.json`, which is ignored by git.

## License

MIT
