SlowedLab — private browser audio studio ([slowedlab.app](https://slowedlab.app))

<img width="1918" height="1001" alt="SlowedLab studio" src="https://github.com/user-attachments/assets/8f69cc72-2134-4e11-bfa0-c3625c520892" />

An advanced real-time audio player supporting all effects (slow, reverb) that elevate your music/audio playing to next level

## Features

- 🎚️ Playback speed from 0.50× to 1.50×
- 🌊 Professional reverb engine
- 🎵 Real-time audio effects (EQ, compression, distortion)
- 📊 Waveform visualization
- 💾 Preset management
- 💝 100% Free with optional support

## Quick Start with Docker (Recommended)

### Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop) with Docker Compose v2 (`docker compose version`)

### Run

```bash
git clone https://github.com/anasfik/SlowedLab
cd SlowedLab

# First run (or after dependency / Dockerfile changes)
docker compose up --build -d

# Follow logs
docker compose logs -f

# Stop (keeps audio cache in backend/data)
docker compose down
```

Open:

- **App**: http://localhost:4000
- **API health**: http://localhost:4001/api/health

Both services have healthchecks; `docker compose ps` should show
`healthy` for each after ~1 minute (frontend needs the dev server
compile on first boot).

If 4000/4001 are already taken on your machine, copy `.env.example` to
`.env` and set `FRONTEND_PORT` / `BACKEND_PORT` to free host ports. `.env`
is git-ignored.

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `FRONTEND_PORT` / `BACKEND_PORT` (`.env`) | `4000` / `4001` | Host ports published by compose; container ports are always 4000/4001 |
| `PORT` (backend) | `4001` | API port inside the container |
| `MAX_AUDIO_MINUTES` | `15` | Max link-import duration |
| `LINKIMPORT_CONCURRENCY` | `2` | Parallel yt-dlp downloads |
| `AUDIO_CACHE_MB` | `1024` | Audio cache cap |
| `AUDIO_CACHE_FILES` | `100` | Max cached files |
| `YTDLP_COOKIES_FILE` | auto | Explicit cookie path override; otherwise `backend/data/cookies.txt` is auto-detected |
| `YTDLP_PROXY` (`.env`) | unset | Residential proxy for yt-dlp (resolve + download); health reports only `configured:true/false`, never the URL |
| `BACKEND_PROXY_URL` (frontend) | `http://backend:4001` | Where the dev server forwards same-origin `/api/*` calls (docker service DNS; host `npm start` falls back to `http://localhost:4001`) |

Live source mounts (`backend/src`, `backend/tsconfig.json`, `frontend/src`,
`frontend/public`) mean local edits hot-reload inside the containers;
dependency changes (`package.json`) need `docker compose up --build`.

The frontend never bakes in an API host: it always calls same-origin
`/api/*`. Never set `REACT_APP_API_URL` — an absolute URL baked into the
bundle breaks every visitor whose machine is not yours.

Downloaded audio persists in `backend/data/audio-cache` (host-mounted).
`cookies.txt` is git-ignored — never commit it.

### YouTube bot-checks / 403s

YouTube challenges datacenter IPs with "Sign in to confirm you're not a bot".
Cookies fix metadata reads; if **downloads** still 403 on the media CDN
(`googlevideo`), the IP itself is blocked and only residential egress fixes
it — see step 4.

1. Export a Netscape `cookies.txt` from a browser where YouTube works:

   ```bash
   # on a machine with Chrome logged out of (or into) YouTube
   yt-dlp --cookies-from-browser chrome --cookies cookies.txt "https://www.youtube.com/"
   # or export the extension "Get cookies.txt LOCALLY" while on youtube.com
   ```

2. Save it as `backend/data/cookies.txt` (git-ignored — never commit it).
   The backend **auto-detects** that path; no restart or compose edit needed.

3. Confirm it was picked up:

   ```bash
   curl -s http://localhost:4001/api/health
   # "linkImport":{"ytDlp":"yt-dlp","proxy":{"configured":false},"cookies":{"configured":true,...}}
   ```

4. If metadata resolves but downloads 403: add residential egress. Any
   residential HTTP/HTTPS/SOCKS5 proxy works — put it in `.env` (git-ignored,
   never commit credentials) and recreate the backend:

   ```bash
   # .env
   YTDLP_PROXY=http://user:pass@host:port
   # or: YTDLP_PROXY=socks5://user:pass@host:port
   docker compose up -d backend   # picks up the new variable
   ```

   Health then reports `"proxy":{"configured":true}` (the URL itself is never
   exposed). Expect roughly a few dollars per GB or ~$5–15/mo for a small
   proxy plan; a 4-minute song is ~4 MB, so light use stays cheap.

`YTDLP_COOKIES_FILE` still works as an explicit override if you keep the file
elsewhere (set it in `docker-compose.yml`, uncommented). SoundCloud marks most
streams DRM-protected for third-party clients, so some SoundCloud tracks cannot
be imported at all — file upload still works.

## Deploying (VPS)

1. Clone the repo on the server and start the stack:

   ```bash
   docker compose up --build -d
   docker compose ps          # wait for both services to report healthy
   ```

2. Point a domain at the server and put nginx in front. A ready-to-use
   config lives at `deploy/nginx/slowedlab.app.conf` (it proxies `/` to the
   app and `/api/` to the API, adds caching/security headers and gzip, and
   leaves port 80 free for the ACME challenge):

   ```bash
   sudo cp deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
   sudo cp deploy/nginx/slowedlab.app.conf /etc/nginx/sites-available/slowedlab.app
   sudo ln -sf /etc/nginx/sites-available/slowedlab.app /etc/nginx/sites-enabled/
   # edit server_name + the two proxy_pass ports to match your .env
   sudo nginx -t && sudo systemctl reload nginx
   ```

3. Issue the certificate (this also flips nginx to HTTPS and redirects
   port 80):

   ```bash
   sudo certbot --nginx -d your-domain.tld
   ```

4. Confirm: `https://your-domain.tld` loads the app and
   `https://your-domain.tld/api/health` returns `{"status":"ok"}`.

Notes:

- The frontend calls the API through same-origin `/api/*`, so changing the
  public URL or the host ports never requires a frontend rebuild.
- Keep `backend/data` on a volume; set the `MAX_*` / cache caps above to
  bound disk use.
- Certbot renews automatically; `sudo certbot renew --dry-run` verifies it.

## Manual Setup (Development)

### Prerequisites

- Node.js 18+ and npm installed

### Backend

```bash
cd backend
npm install
npm run dev        # ts-node, hot reload → http://localhost:4001
```

For a compiled run: `npm run build && npm start` (serves the same API from
`dist/` without ts-node).

### Frontend (in a new terminal)

```bash
cd frontend
npm install
cp .env.local.example .env.local   # optional: PORT, OpenAI key
npm start
```

This starts the React dev server on **http://localhost:3000** by default, or
whatever `PORT` you set in `.env.local`. The dev server proxies `/api/*` to
`http://localhost:4001`, so keep the backend running on that port.

## Usage

1. **Open the app** at http://localhost:4000
2. **Upload an audio file** using the upload area (supports MP3, WAV, FLAC, OGG, AAC, and more)
3. **Apply effects**:
   - ⚡ **Speed**: Slow the track down or push it faster. Pitch shifts with it, which is what gives the slowed sound its depth.
   - ✨ **Reverb**: Add spatial depth and ambient effects
   - **EQ**: Shape frequency response (bass, treble)
   - **Compressor**: Control dynamic range
   - **Distortion**: Add grit and aggression
4. **Preview in real-time** with the interactive waveform viewer
5. **Manage presets** using built-in effect presets or create custom ones
6. **Export** your processed audio as a WAV file
7. **Report bugs** using the 🐞 button for feedback and improvements

## Link Import (YouTube + SoundCloud)

Paste a YouTube or SoundCloud link in the empty state or queue panel.
The backend resolves metadata, downloads audio with `yt-dlp`, converts to
MP3 via `ffmpeg`, caches it under `backend/data/audio-cache`, and feeds it
into the normal playback pipeline. Spotify links are rejected: Spotify
offers no legal full-track download path.

VM deploy notes (also see above):

- The backend image ships `yt-dlp`, `ffmpeg`, and `deno` already.
- Cap downloads with `MAX_AUDIO_MINUTES` (default 15),
  `LINKIMPORT_CONCURRENCY` (default 2), `AUDIO_CACHE_MB` (default 1024).
- If YouTube serves bot-checks or 403s, drop a Netscape `cookies.txt` into
  `backend/data/cookies.txt`; it is auto-detected (see "YouTube bot-checks /
  403s" above).

## Tech Stack

- **Frontend**: React 18 (Create React App), TypeScript, Web Audio API
- **Backend**: Node.js, Express, TypeScript
- **Audio Processing**: Web Audio API (100% client-side)
- **Containerization**: Docker & Docker Compose
- **Styling**: CSS3 with modern gradients and animations

## Specifications

- **File Support**: MP3, WAV, FLAC, OGG, AAC, and more
- **File Size Limit**: 200MB per file
- **Processing**: 100% client-side (your files never leave your browser)
- **Storage**: Browser caching via IndexedDB for faster reloads
- **Error Handling**: Comprehensive validation and user-friendly error messages
- **Real-time Performance**: Sub-50ms effect processing
- **UI Responsiveness**: Touch-friendly waveform interactions

## Legal

- [Terms of Service](TERMS.md)
- [MIT License](LICENSE)

## Support

This project is 100% free. If you find it useful, consider [supporting on Ko-fi](https://ko-fi.com/gwhyyy) ☕

---

**Made with ❤️ for audio enthusiasts | SlowedLab - Elevate Your Audio Experience**
