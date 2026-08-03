# solid-que

Local review/queue/publish app for the Solid Plumbing & Electrical video pipeline.

Render pipeline finishes a video → pushes it to this app's DB → you review/approve/reorder
in a browser dashboard → an hourly (or on-demand) Claude scheduled task publishes the
approved queue to YouTube, Instagram, Facebook, and TikTok simultaneously via the
Metricool MCP connector.

## Stack

- Node.js + TypeScript, Express
- SQLite via Node's built-in `node:sqlite` (no native build tools required)
- Single-user session login (username + scrypt password hash)
- Plain HTML/vanilla JS dashboard (no frontend framework)

## Setup

```bash
npm install
npm run build
cp .env.example .env
```

Generate a password hash and paste it into `.env` as `AUTH_PASSWORD_HASH`:

```bash
node dist/scripts/hash-password.js "your-password-here"
```

Edit `.env`: set `SESSION_SECRET` to a long random string, `AUTH_USERNAME`,
and confirm `DB_PATH` / `STORAGE_DIR`.

Run it:

```bash
npm start
```

Open `http://localhost:8787` (or your configured `PORT`).

## Ingesting a finished video

The render pipeline calls this once a video is done. It **moves** (never copies)
the video file into managed storage and creates a `pending_review` row.

```bash
curl -X POST http://localhost:8787/api/videos/ingest \
  -H "Content-Type: application/json" \
  -H "X-Service-Token: $SERVICE_TOKEN" \
  -d '{
    "title": "5 Ways To Save On Your Water Bill",
    "description": "...",
    "transcript": "...",
    "source_project": "trade-1",
    "video_path": "C:/path/to/rendered/video.mp4",
    "thumbnail_path": "C:/path/to/thumbnail.jpg"
  }'
```

This and the `/api/publish/*` routes authenticate with the `X-Service-Token`
header (matching `SERVICE_TOKEN` in `.env`) instead of a browser session,
since they're called by scripts/agents, not a logged-in user.

## API surface

- `POST /api/videos/ingest` — register a finished video
- `GET /api/videos/pending` — videos awaiting review
- `POST /api/videos/:id/approve` — moves a pending video into the queue
- `POST /api/videos/:id/reject` — deletes the file + DB row
- `GET /api/queue` — ordered queue
- `POST /api/videos/:id/move` — `{ direction: "up" | "down" }`, reorder in queue
- `POST /api/videos/:id/postpone` — `{ until: ISO date string }`
- `POST /api/videos/:id/schedule` — `{ scheduled_time: ISO date string }`
- `GET /api/publish/due` — queued videos ready to publish now (used by the
  Claude scheduled publish task)
- `POST /api/publish/:id/start` — mark as `publishing` (avoids double-processing)
- `POST /api/publish/:id/result` — report back platform links + success/failure

## Running as an always-on Windows service

The simplest path is [NSSM](https://nssm.cc/):

1. Download NSSM, put `nssm.exe` somewhere on PATH.
2. `npm run build` first so `dist/server.js` exists.
3. Install the service:

   ```
   nssm install solid-que "C:\Program Files\nodejs\node.exe" "C:\path\to\solid-que\dist\server.js"
   nssm set solid-que AppDirectory "C:\path\to\solid-que"
   nssm set solid-que AppEnvironmentExtra NODE_ENV=production
   nssm start solid-que
   ```

NSSM restarts the process automatically on crash and starts it on boot.

## Remote access

You said you want to reach the dashboard from outside your home network via
plain port-forwarding + login. Practical notes:

- Forward your router's chosen external port to this machine's `PORT`.
- The single-user login is the only gate — keep `SESSION_SECRET` and your
  password strong, since this is reachable from the open internet.
- Consider adding HTTPS (e.g. a reverse proxy like Caddy with a free
  Let's Encrypt cert) once this is more than a personal testing setup — plain
  HTTP means your session cookie/password travel unencrypted.

## Publish worker (Claude scheduled task)

This app cannot call the Metricool MCP connector itself — only a Claude
session can. The publish step is a Claude scheduled task (hourly + on-demand)
that:

1. Calls `GET /api/publish/due`.
2. For each due video, calls `POST /api/publish/:id/start`.
3. Publishes to YouTube, Instagram, Facebook, TikTok via the Metricool
   connector.
4. Calls `POST /api/publish/:id/result` with the resulting post links (or the
   error, on failure).

See `docs/publish-task.md` for the exact scheduled-task setup.
