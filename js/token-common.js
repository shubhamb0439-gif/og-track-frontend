/* ============================================================================
   OG Track — Token module (module key: "token")
   Shared helpers used by both the dashboard "section" widget
   (token-section.js) and the dedicated management page (token-page.js,
   token.html).

   Mirrors the conventions used by the existing To-Do List module
   (todo-list-common.js) and the OGTrack Path-A adapter
   (_adapter.reference.html): tenant slug detected from the URL, JWT read
   from localStorage under 'og_token', API base from window.OGTRACK_API_BASE
   (or localhost:3000 for local dev).
   ============================================================================ */
(function (global) {
  'use strict';

  function apiBase() {
    if (window.OGTRACK_API_BASE) return window.OGTRACK_API_BASE;
    return (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
      ? 'http://localhost:3000'
      : location.origin;
  }

  // Tenant slug detection. Supports:
  //   - already set by the main app: window.OGTRACK_SLUG
  //   - ?slug=<slug> query param (used when linking to the standalone token.html page)
  //   - /<slug>/token(.html) path shape, if ever mounted that way
  //   - last resort: whatever slug this module last remembered in localStorage
  function detectSlug() {
    if (window.OGTRACK_SLUG) return String(window.OGTRACK_SLUG).toLowerCase();
    const params = new URLSearchParams(location.search);
    if (params.get('slug')) return params.get('slug').toLowerCase();
    const segs = location.pathname.split('/').filter(Boolean);
    if (segs.length >= 2) return segs[0].toLowerCase();
    const stored = localStorage.getItem('og_token_slug') || localStorage.getItem('og_slug');
    if (stored) return stored.toLowerCase();
    return window.OGTRACK_DEFAULT_SLUG || 'ogtrack';
  }

  const slug = detectSlug();
  try { localStorage.setItem('og_token_slug', slug); } catch (e) { /* ignore */ }

  function getToken() {
    return localStorage.getItem('og_token') || null;
  }

  function authHeaders(extra) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  }

  // Decodes (without verifying — verification happens server-side) the JWT
  // payload so the frontend can know the current userId/role without a
  // dedicated "/me" endpoint (issueToken() in the backend signs {userId, role, slug}).
  function decodeToken(token) {
    try {
      const payload = token.split('.')[1];
      const json = decodeURIComponent(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        .split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  async function request(path, options) {
    const res = await fetch(apiBase() + '/api/' + slug + path, Object.assign({ headers: authHeaders() }, options || {}));
    let body = null;
    try { body = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const msg = (body && body.error) || ('Request failed (' + res.status + ')');
      throw new Error(msg);
    }
    return body;
  }

  const TokenAPI = {
    list(query) {
      const qs = new URLSearchParams(query || {}).toString();
      return request('/token' + (qs ? '?' + qs : ''));
    },
    create(payload) {
      return request('/token', { method: 'POST', body: JSON.stringify(payload) });
    },
    remove(id) {
      return request('/token/' + encodeURIComponent(id), { method: 'DELETE' });
    },
    users() {
      return request('/users');
    },
  };

  // Current user, derived from the JWT (userId/role) + the tenant's user list
  // (for display name). Cached for the lifetime of the page.
  let currentUserPromise = null;
  function currentUser() {
    if (currentUserPromise) return currentUserPromise;
    currentUserPromise = (async () => {
      const token = getToken();
      const decoded = token ? decodeToken(token) : null;
      if (!decoded) return null;
      let name = null;
      try {
        const users = await TokenAPI.users();
        const match = (users || []).find(u => u.id === decoded.userId);
        if (match) name = match.name;
      } catch (e) { /* users list may not be reachable yet — fine, name stays null */ }
      return { id: decoded.userId, role: decoded.role, name: name || decoded.userId };
    })();
    return currentUserPromise;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // Optional real-time sync — connects to the same Socket.io server/room the
  // rest of OGTrack uses, if the socket.io client library is present on the
  // page (it's a plain <script> include in both index.html and masteradmin.html).
  function subscribe(handlers) {
    if (typeof global.io !== 'function') return null;
    try {
      const socket = global.io(apiBase());
      socket.on('connect', () => socket.emit('join', slug));
      if (handlers.onCreated) socket.on('token:created', handlers.onCreated);
      if (handlers.onDeleted) socket.on('token:deleted', handlers.onDeleted);
      return socket;
    } catch (e) { return null; }
  }

  global.TokenCommon = {
    slug, apiBase, getToken, authHeaders, decodeToken, currentUser,
    api: TokenAPI, escapeHtml, formatDateTime, subscribe,
  };
})(window);
