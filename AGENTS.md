# AGENTS.md

## What this project is
`index.html` is the **entire application** — a single static page (Tailwind, SweetAlert2,
Lucide and Chart.js loaded from CDNs; Firebase SDK 10.7.1 loaded as ES modules).
There is no build step, no package manager, no server-side code and no tests.

The browser talks directly to:
- **Firebase Auth** — email/password login (`signInWithEmailAndPassword`).
- **Firebase Realtime Database** — `employees`, `master/sections`, `master/jabatans`, `roles/*`.
- **Cloudinary** — unsigned upload (`upload_preset: ppd_upload`) for photos/KTP/SIM/permit PDFs.

All of that config is already committed inside `index.html`. Firebase web config is a public
client identifier, not a secret, and the Cloudinary preset is unsigned — so **no credentials
are needed to start the app**. A real *login* needs an account that exists in that Firebase
project (the login screen advertises the admin e-mail `ahriza@admin.com`); the password belongs
to the user and is entered in the app's own login form.

## How it runs here (sandbox)
`docker-compose.base44.yml` runs one `node:22-slim` service that bind-mounts the repo at `/app`
and runs `.base44/dev-server.mjs` on `0.0.0.0:3000`.

`.base44/dev-server.mjs` is **sandbox tooling, not application code**: a ~120-line static file
server that serves the cloned source (no bundling) and injects a live-reload snippet (SSE on
`/__ppr_reload`, driven by polling `index.html`'s mtime) so edits show up without a manual reload.
It is only used by this compose file; production/hosting is unaffected.

```bash
docker compose -f docker-compose.base44.yml up -d --build   # start
docker compose -f docker-compose.base44.yml logs -f web     # logs
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/   # should be 200
```

## How to verify it works
The page is a client-side app, so an HTTP 200 only proves the file is served.
The real check is the login screen rendering and, after logging in, Firebase delivering data:

1. `curl -s http://localhost:3000/ | grep -c 'login-page'` → non-zero (served source, not a bundle).
2. Open the preview: the dark **PPD LOGIN** card must be visible with empty console errors.
3. Log in with a Firebase account → the dashboard, employee table (from RTDB) and stats render.

Because Firebase runs from the browser, sandbox networking does not affect the data layer.

## Quirks to know
- The markup contains **duplicate `id`s**: the `view-chart`, `view-matrix` and `view-master`
  blocks appear twice (and `view-master` sits outside `<main>`). `getElementById` therefore
  resolves to the first match. This is pre-existing; do not "fix" it as part of unrelated work.
- `body { overflow: hidden }` and fixed-height containers mean the page is not a normal
  scrolling document — it is a full-viewport dashboard.
- Uploads go to Cloudinary directly from the browser; nothing is proxied through the sandbox.
