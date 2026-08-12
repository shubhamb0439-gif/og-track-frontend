/* Minimal static server for local frontend testing (Path A).
   Serves index.html for any non-file path so /ogtrack and /cajo both load the
   app, letting the in-page adapter detect the slug from the URL.

   Run:  node serve.js       (defaults to port 8080)
   Then open:  http://localhost:8080/ogtrack   or   http://localhost:8080/cajo

   In production you'd serve index.html from Azure Static Web Apps / Blob+CDN
   instead — this file is only for local dev convenience. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.FRONTEND_PORT || 8080;
const INDEX = path.join(__dirname, 'index.html');
const MASTERADMIN = path.join(__dirname, 'masteradmin.html');

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  // Serve any real static file that exists (e.g. future assets); else index.html.
  const candidate = path.join(__dirname, urlPath);
  if (urlPath !== '/' && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    const ext = path.extname(candidate).toLowerCase();
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    return fs.createReadStream(candidate).pipe(res);
  }
  // /master-admin and /master-admin/aida both load the master-admin app,
  // mirroring the staticwebapp.config.json rewrite used in production.
  // Also accept the literal '/masteradmin.html/aida' — a real static file
  // has no sub-paths, so without this, appending '/aida' onto the filename
  // itself (an easy mistake vs. the clean '/master-admin' route) silently
  // falls through to index.html instead of 404ing loudly.
  if (
    urlPath === '/master-admin' || urlPath.startsWith('/master-admin/') ||
    urlPath === '/masteradmin.html' || urlPath.startsWith('/masteradmin.html/')
  ) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    return fs.createReadStream(MASTERADMIN).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
  fs.createReadStream(INDEX).pipe(res);
}).listen(PORT, () => {
  console.log(`Frontend dev server on http://localhost:${PORT}`);
  console.log(`Open a tenant:  http://localhost:${PORT}/ogtrack   (or /cajo)`);
});
