// Base44 sandbox-only static dev server.
//
// This project is a single, pre-built-free HTML file (`index.html`) that talks to
// Firebase + Cloudinary straight from the browser, so there is nothing to compile.
// This tiny server exists so the preview:
//   1. serves the CLONED SOURCE from the bind mount (never a baked bundle), and
//   2. auto-reloads the browser when a source file changes (live reload over SSE).
//
// It is NOT part of the application. Nothing outside the sandbox uses it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0'; // must be reachable through the preview proxy
const POLL_MS = 700;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Injected into served HTML only — the file in the repo is never modified.
const RELOAD_SNIPPET = `
<script>
(function () {
  try {
    var es = new EventSource('/__ppr_reload');
    es.onmessage = function (e) { if (e.data === 'reload') location.reload(); };
  } catch (e) {}
})();
</script>
`;

const clients = new Set();

function stamp() {
  try {
    const s = fs.statSync(path.join(ROOT, 'index.html'));
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return null;
  }
}

let lastStamp = stamp();
setInterval(() => {
  const now = stamp();
  if (now === lastStamp) return;
  lastStamp = now;
  console.log('[ppr] source changed -> reloading connected browsers');
  for (const res of clients) {
    try {
      res.write('data: reload\n\n');
    } catch {
      clients.delete(res);
    }
  }
}, POLL_MS).unref();

function resolveTarget(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const target = path.join(ROOT, path.normalize(decoded));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null; // path traversal
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return null;
  }
  if (stat.isDirectory()) {
    const idx = path.join(target, 'index.html');
    return fs.existsSync(idx) ? idx : null;
  }
  return target;
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/__ppr_reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  try {
    const file = resolveTarget(req.url || '/');
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    let body = fs.readFileSync(file);
    if (ext === '.html') {
      const html = body.toString('utf8');
      body = Buffer.from(
        html.includes('</body>')
          ? html.replace('</body>', `${RELOAD_SNIPPET}</body>`)
          : html + RELOAD_SNIPPET
      );
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    console.error('[ppr] request failed:', err?.message || err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `[ppr] serving ${ROOT} on http://${HOST}:${PORT} ` +
      `(preview mode: ${process.env.BASE44_PREVIEW_MODE === '1'})`
  );
});
