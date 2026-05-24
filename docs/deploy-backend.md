# Deploy Backend

The demo backend is a small Express server.

## Local Run

```bash
cd server
npm install
npm start
```

Health check:

```bash
curl http://localhost:8787/health
```

Save a test clip:

```bash
curl -X POST http://localhost:8787/clip \
  -H "Content-Type: application/json" \
  -d "{\"room\":\"RP Prompt\",\"text\":\"test prompt\",\"source\":\"manual\"}"
```

Read prompts:

```bash
curl "http://localhost:8787/library/prompts?limit=5"
```

## VPS Deployment

Any Node.js host works. For a VPS:

```bash
cd server
npm install --omit=dev
PORT=8787 npm start
```

For production, put it behind HTTPS with a reverse proxy or a platform that provides HTTPS.

Do not commit `.env` or `server/data/clips.json`.
