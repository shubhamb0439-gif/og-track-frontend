/* ============================================================================
   OG Track — Birthday module (module key: "birthday")
   ----------------------------------------------------------------------------
   Lets a user save their birthday and shows the automatic "Happy Birthday"
   messages the backend generates for anyone whose birthday is today, plus a
   simple team birthday list.

   This file is written to be wired into index.html's existing showView() /
   renderView() dispatch EXACTLY the way the built-in "notes" view is wired
   (see index.html around `if(currentView==='notes') return renderNotes();`).
   It was kept in its own file, instead of being pasted directly into
   index.html, only because this sandbox is only allowed to create new files
   — see the PR/finish summary for the exact lines a human needs to add to
   index.html to hook it up (nav entry + view-title + dispatch line + a
   <script src="/js/birthday.js"></script> include).

   Depends on globals already defined by index.html at the point this runs:
     - currentUser        (the logged-in user object, { id, name, role, ... })
     - fmt(iso)            (date/time formatter used by other views)
     - escHtml(str)         (HTML-escaping helper used by other views)
     - showToast(msg,type)  (toast notifications)
     - window.fetch         (already patched by the OGTrack API adapter at the
                             top of index.html to rewrite /api/... calls to
                             /api/<slug>/... and attach the auth token)
   Falls back gracefully (plain alert / basic escaping) if any of those
   aren't present, so this also degrades reasonably if ever used standalone.
   ============================================================================ */
(function (global) {
  'use strict';

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function monthDayLabel(month, day) {
    const m = MONTH_NAMES[(Number(month) || 1) - 1] || '';
    return day ? `${m} ${day}` : m;
  }

  function safeEsc(s) {
    if (typeof global.escHtml === 'function') return global.escHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function safeFmt(iso) {
    if (typeof global.fmt === 'function') return global.fmt(iso);
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  function notify(msg, type) {
    if (typeof global.showToast === 'function') global.showToast(msg, type);
    else if (type === 'alert' || type === 'error') alert(msg);
  }

  let _birthdaySaving = false;

  // GET /api/:slug/birthday?userId=..., /api/:slug/birthday/today,
  // /api/:slug/birthday/all (rewritten from /api/birthday... by the adapter,
  // same convention as the Notes module's /api/notes calls).
  async function renderBirthday() {
    const area = document.getElementById('content-area');
    if (!area) return;
    area.innerHTML = '<div class="loading">Loading birthdays...</div>';
    try {
      const user = global.currentUser || {};
      const [mine, todayList, allList] = await Promise.all([
        fetch(`/api/birthday?userId=${encodeURIComponent(user.id || '')}`).then(r => r.json()),
        fetch('/api/birthday/today').then(r => r.json()).catch(() => []),
        fetch('/api/birthday/all').then(r => r.json()).catch(() => []),
      ]);
      if (mine && mine.error) throw new Error(mine.error);

      const monthOptions = MONTH_NAMES.map((m, i) =>
        `<option value="${i + 1}" ${mine.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('');
      const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1).map(d =>
        `<option value="${d}" ${mine.day === d ? 'selected' : ''}>${d}</option>`).join('');
      const yearVal = mine.year || '';

      const now = new Date();
      const curMonth = now.getMonth() + 1, curDay = now.getDate();
      const todays = Array.isArray(todayList) ? todayList : [];
      const everyone = Array.isArray(allList) ? allList : [];

      area.innerHTML = `
        <div style="max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:18px">
          ${todays.length ? `
          <div style="background:linear-gradient(135deg,#FFF6E5,#FFEFD5);border:1px solid #F5D98B;border-radius:14px;padding:20px">
            <h3 style="margin:0 0 10px;font-size:16px">🎉 Today's Celebrations</h3>
            ${todays.map(g => `<div style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:14px">${safeEsc(g.message)}</div>`).join('')}
          </div>` : ''}

          <div style="background:var(--white,#fff);border:1px solid rgba(11,11,11,.08);border-radius:14px;box-shadow:0 1px 2px rgba(20,20,30,.04);padding:22px">
            <h3 style="margin:0 0 6px;font-size:16px">🎂 My Birthday</h3>
            <p style="font-size:12.5px;color:var(--g3);margin:0 0 14px">Save your birthday and OG Track will automatically post a Happy Birthday message on the day.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
              <div>
                <label style="display:block;font-size:12px;color:var(--g3);margin-bottom:4px">Month</label>
                <select id="bday-month" style="padding:8px 10px;border:1px solid var(--border,#E8E8E8);border-radius:8px">${monthOptions}</select>
              </div>
              <div>
                <label style="display:block;font-size:12px;color:var(--g3);margin-bottom:4px">Day</label>
                <select id="bday-day" style="padding:8px 10px;border:1px solid var(--border,#E8E8E8);border-radius:8px">${dayOptions}</select>
              </div>
              <div>
                <label style="display:block;font-size:12px;color:var(--g3);margin-bottom:4px">Year (optional)</label>
                <input id="bday-year" type="number" min="1900" max="2100" value="${yearVal}" style="padding:8px 10px;border:1px solid var(--border,#E8E8E8);border-radius:8px;width:110px" />
              </div>
              <button class="btn-primary" id="bday-save-btn" onclick="saveBirthday()">Save</button>
            </div>
            <div id="bday-status" style="font-size:12px;color:var(--g3);margin-top:10px">${mine.updatedAt ? ('Last saved ' + safeFmt(mine.updatedAt)) : 'Not saved yet'}</div>
          </div>

          <div style="background:var(--white,#fff);border:1px solid rgba(11,11,11,.08);border-radius:14px;box-shadow:0 1px 2px rgba(20,20,30,.04);padding:22px">
            <h3 style="margin:0 0 12px;font-size:16px">📅 Team Birthdays</h3>
            ${everyone.length ? `<div style="display:flex;flex-direction:column">
              ${everyone.map(b => {
                const isToday = b.month === curMonth && b.day === curDay;
                return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f2f2f2;font-size:13.5px">
                  <span>${safeEsc(b.userName || b.userId)}</span>
                  <span style="color:${isToday ? '#C0392B' : 'var(--g3)'};font-weight:${isToday ? '700' : '400'}">${monthDayLabel(b.month, b.day)}${isToday ? ' 🎂' : ''}</span>
                </div>`;
              }).join('')}
            </div>` : '<div class="empty-state"><p>No birthdays saved yet.</p></div>'}
          </div>
        </div>`;
    } catch (err) {
      area.innerHTML = `<div class="empty-state"><p>Could not load birthdays.<br><small style="color:var(--g3)">${err.message}</small></p></div>`;
    }
  }

  // POST /api/:slug/birthday — { userId, userName, month, day, year }
  async function saveBirthday() {
    if (_birthdaySaving) return;
    const btn = document.getElementById('bday-save-btn');
    const statusEl = document.getElementById('bday-status');
    const monthSel = document.getElementById('bday-month');
    const daySel = document.getElementById('bday-day');
    const yearInput = document.getElementById('bday-year');
    if (!monthSel || !daySel) return;
    const month = Number(monthSel.value);
    const day = Number(daySel.value);
    const year = yearInput && yearInput.value ? Number(yearInput.value) : null;
    const user = global.currentUser || {};

    _birthdaySaving = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    try {
      const saved = await fetch('/api/birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, userName: user.name, month, day, year }),
      }).then(r => r.json());
      if (saved && saved.error) throw new Error(saved.error);
      if (statusEl) statusEl.textContent = 'Last saved ' + safeFmt(saved.updatedAt || new Date().toISOString());
      notify('Birthday saved', 'success');
    } catch (err) {
      notify('Could not save birthday: ' + err.message, 'alert');
    } finally {
      _birthdaySaving = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  }

  global.renderBirthday = renderBirthday;
  global.saveBirthday = saveBirthday;
})(window);
