# Running SlowedLab with Docker

## Prerequisites

- Docker with Docker Compose v2 (`docker compose version`)

## Run

```bash
# First run (or after dependency / Dockerfile changes)
docker compose up --build -d

# Follow logs
docker compose logs -f

# Stop (keeps the audio cache in backend/data)
docker compose down
```

Then open:

- **App**: http://localhost:4000
- **API health**: http://localhost:4001/api/health

Both services have healthchecks; `docker compose ps` should report `healthy`
for each once the frontend dev server has compiled (first boot takes ~1 min).

## Changing the published ports

Host ports default to 4000 (app) and 4001 (API). If either is taken on your
machine, copy `.env.example` to `.env` and change them:

```bash
cp .env.example .env
# .env
FRONTEND_PORT=8080
BACKEND_PORT=8081
```

`.env` is git-ignored, so your machine's ports never leak into the repo.
If you serve the app through a reverse proxy, point it at the ports you set
there (`deploy/nginx/slowedlab.app.conf` documents this).

## Rebuilding after changes

```bash
docker compose up --build -d      # dependency or Dockerfile changes
docker compose restart frontend   # source-only changes hot-reload already
```

`backend/src`, `backend/tsconfig.json`, `frontend/src` and
`frontend/public` are bind-mounted, so edits apply without a rebuild.

## Where the API URL comes from

The frontend always calls the API through same-origin relative URLs
(`/api/...`). Do not set `REACT_APP_API_URL` — a baked-in absolute URL breaks
every visitor whose machine is not yours. Behind a proxy, forward `/api/` to
the backend; in local Docker, `frontend/src/setupProxy.js` does it for you.

## HTTPS in front of the app

```bash
sudo cp deploy/nginx/slowedlab.app.conf /etc/nginx/sites-available/slowedlab.app
sudo ln -sf /etc/nginx/sites-available/slowedlab.app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.tld
```

See the README "Deploying (VPS)" section for the full checklist.