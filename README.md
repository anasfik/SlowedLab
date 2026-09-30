SlowedLab — private browser audio studio ([slowedlab.app](https://slowedlab.app))

<img width="1918" height="1001" alt="SlowedLab studio" src="https://github.com/user-attachments/assets/8f69cc72-2134-4e11-bfa0-c3625c520892" />

An advanced real-time audio player supporting all effects (slow, reverb) that elevate your music/audio playing to next level

## Features

- 🎚️ Time-stretching with pitch preservation
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

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` (backend) | `4001` | API port |
| `MAX_AUDIO_MINUTES` | `15` | Max link-import duration |
| `LINKIMPORT_CONCURRENCY` | `2` | Parallel yt-dlp downloads |
| `AUDIO_CACHE_MB` | `1024` | Audio cache cap |
| `AUDIO_CACHE_FILES` | `100` | Max cached files |
| `YTDLP_COOKIES_FILE` | unset | Set to `/app/data/cookies.txt` when YouTube serves bot-checks |
| `REACT_APP_API_URL` (frontend) | `http://localhost:4001` | API base baked into the dev bundle |

Live source mounts (`backend/src`, `frontend/src`, `frontend/public`)
mean local edits hot-reload inside the containers; dependency changes
(`package.json`) need `docker compose up --build`.

Downloaded audio persists in `backend/data/audio-cache` (host-mounted).
`cookies.txt` is git-ignored — never commit it.

### YouTube bot-checks / 403s

1. Export a Netscape `cookies.txt` from a logged-out browser tab.
2. Save it as `backend/data/cookies.txt`.
3. Uncomment `YTDLP_COOKIES_FILE=/app/data/cookies.txt` in
   `docker-compose.yml` and restart: `docker compose up -d`.

## Deploying (VPS)

1. Clone the repo on the server and `docker compose up --build -d`.
2. Put a reverse proxy (Caddy/Nginx) in front: `slowedlab.app` → `:4000`,
   `slowedlab.app/api` → `:4001` (or subdomain for the API).
3. If the API is public at a non-localhost URL, rebuild the frontend
   with `REACT_APP_API_URL=https://<your-api>` — Create React App bakes
   this value in at build/start time, so the dev container must be
   recreated after changing it.
4. Keep `backend/data` on a volume; set the `MAX_*` / cache caps above
   to bound disk use.

## Manual Setup (Development)

### Prerequisites

- Node.js 18+ and npm installed

### Backend

```bash
cd backend
npm install
npm run dev
```

This starts the Express server on **http://localhost:4001**

### Frontend (in a new terminal)

```bash
cd frontend
npm install
npm start
```

This starts the React dev server on **http://localhost:4000**

## Usage

1. **Open the app** at http://localhost:4000
2. **Upload an audio file** using the upload area (supports MP3, WAV, FLAC, OGG, AAC, and more)
3. **Apply effects**:
   - ⚡ **Time Stretch**: Adjust playback speed while preserving pitch
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
- If YouTube serves bot-checks or 403s, export a Netscape `cookies.txt`
  from a logged-out browser tab into `backend/data/cookies.txt` and
  uncomment `YTDLP_COOKIES_FILE` in `docker-compose.yml`.

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
