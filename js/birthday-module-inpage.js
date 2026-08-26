/* ============================================================================
   OG Track — Birthday Module (module key: "birthday_module")
   ----------------------------------------------------------------------------
   NOT a standalone page. This file holds the in-page view functions for the
   main single-page app (index.html), written to match the exact pattern
   index.html already uses for the "Notes" module (private per-user data,
   rendered inside the existing content-area via showView()/renderView()).

   index.html is a single monolithic file with everything inlined in one
   <script> tag (no other module — Notes included — loads its logic from an
   external .js file), and this coding pass was not given write/insert access
   to index.html or masteradmin.html. So the actual wiring must be done by a
   human, copying the pieces below into index.html (and one line into
   masteradmin.html). See the PR description for the exact insertion points.

   Once wired in, this reuses the SAME conventions as Notes:
     - fetch('/api/birthday_module...') — the in-page fetch adapter already
       rewrites '/api/...' to '/api/<tenantSlug>/...' for every other module,
       so no separate slug-detection/common.js is needed here.
     - currentUser.id / currentUser.name — already available globally once
       logged in, same as Notes' saveNote() uses them.
     - escHtml(), fmt(), showToast() — existing global helpers in index.html.
   ============================================================================ */

// ── Birthday Module ──────────────────────────────────────────────────────────
// Lets a user record their birth date once (editable afterward), and shows
// them any birthday greeting(s) the system has already sent them. The
// "system sends a greeting" side happens by calling GET /api/birthday_module/today
// (rewritten to /api/:slug/birthday_module/today by the adapter) — the
// backend checks whether today matches anyone's birth date and, the first
// time it's asked on that day, creates+broadcasts a one-time greeting for
// that calendar year. This view calls it every time a user opens the page,
// which is enough to guarantee it fires the same day without needing a
// separate always-on server-side scheduler.
let _birthdaySaving = false;
async function renderBirthdayModule() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<div class="loading">Loading birthday info...</div>';
  try {
    const [profile, todays, myGreetings] = await Promise.all([
      fetch(`/api/birthday_module?userId=${encodeURIComponent(currentUser.id)}`).then(r => r.json()),
      fetch('/api/birthday_module/today').then(r => r.json()),
      fetch(`/api/birthday_module/greetings?userId=${encodeURIComponent(currentUser.id)}`).then(r => r.json()),
    ]);
    if (profile && profile.error) throw new Error(profile.error);
    const myGreetingToday = Array.isArray(todays) ? todays.find(t => t.userId === currentUser.id) : null;
    const othersToday = Array.isArray(todays) ? todays.filter(t => t.userId !== currentUser.id) : [];
    area.innerHTML = `
      <div style="max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:16px">
        ${myGreetingToday ? `<div style="background:linear-gradient(135deg,#F1C40F22,#E91E8C22);border:1px solid #E91E8C55;border-radius:14px;padding:20px;text-align:center">
          <div style="font-size:28px">🎂🎉</div>
          <div style="font-size:16px;font-weight:600;margin-top:6px">${escHtml(myGreetingToday.greeting?.message || 'Happy Birthday!')}</div>
        </div>` : ''}
        ${othersToday.length ? `<div style="background:var(--white,#fff);border:1px solid rgba(11,11,11,.08);border-radius:14px;padding:16px 20px">
          <h4 style="margin:0 0 8px;font-size:14px">🎈 Birthdays today</h4>
          ${othersToday.map(t => `<div style="font-size:13.5px;padding:4px 0">🎂 ${escHtml(t.userName || t.userId)}</div>`).join('')}
        </div>` : ''}
        <div style="background:var(--white,#fff);border:1px solid rgba(11,11,11,.08);border-radius:14px;box-shadow:0 1px 2px rgba(20,20,30,.04);padding:22px">
          <h3 style="margin:0 0 6px;font-size:16px">🎂 My Birthday</h3>
          <p style="font-size:12.5px;color:var(--g3);margin:0 0 14px">Save your birth date so the team gets a greeting from OG Track on your special day.</p>
          <input type="date" id="birthday-input" value="${profile.birthDate || ''}" style="padding:10px 12px;border:1px solid var(--border,#E8E8E8);border-radius:10px;font-size:14px;font-family:inherit;outline:none">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap;gap:10px">
            <span id="birthday-status" style="font-size:12px;color:var(--g3)">${profile.updatedAt ? ('Last saved ' + fmt(profile.updatedAt)) : ''}</span>
            <button class="btn-primary" id="birthday-save-btn" onclick="saveBirthday()">Save</button>
          </div>
        </div>
        ${(myGreetings && myGreetings.length) ? `<div style="background:var(--white,#fff);border:1px solid rgba(11,11,11,.08);border-radius:14px;padding:16px 20px">
          <h4 style="margin:0 0 8px;font-size:14px">📜 Past greetings</h4>
          ${myGreetings.map(g => `<div style="font-size:13px;color:var(--g3);padding:4px 0">${g.year}: ${escHtml(g.message)}</div>`).join('')}
        </div>` : ''}
      </div>`;
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p>Could not load the Birthday module.<br><small style="color:var(--g3)">${err.message}</small></p></div>`;
  }
}

async function saveBirthday() {
  if (_birthdaySaving) return;
  const btn = document.getElementById('birthday-save-btn');
  const statusEl = document.getElementById('birthday-status');
  const input = document.getElementById('birthday-input');
  if (!input || !input.value) {
    if (typeof showToast === 'function') showToast('Please choose a date first', 'alert');
    return;
  }
  _birthdaySaving = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
    const saved = await fetch('/api/birthday_module', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, userName: currentUser.name, birthDate: input.value }),
    }).then(r => r.json());
    if (saved && saved.error) throw new Error(saved.error);
    if (statusEl) statusEl.textContent = 'Last saved ' + fmt(saved.updatedAt || new Date().toISOString());
    if (typeof showToast === 'function') showToast('Birth date saved', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast('Could not save birth date: ' + err.message, 'alert');
    else alert('Could not save birth date: ' + err.message);
  } finally {
    _birthdaySaving = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  }
}

/* ============================================================================
   WIRING NEEDED IN index.html (human step — see PR description):

   1) Load this file — add near the other <script> tags, e.g. right before
      the closing </body>:
        <script src="js/birthday-module-inpage.js"></script>

   2) Sidebar (built-in roles) — right after the existing Notes block
      (search for "navItems.push(['notes','Notes','#F1C40F']);"), add:
        if(role!=='masteradmin' && (!window.COMPANY_CONTEXT || !window.COMPANY_CONTEXT.modules || window.COMPANY_CONTEXT.modules.includes('birthday_module')) && !navItems.some(it=>it&&it[0]==='birthday_module')){
          navItems.push(['birthday_module','Birthday','#E91E8C']);
        }

   3) Sidebar (custom roles) — right after the SECOND Notes block (the one
      inside the "else { // Custom role" branch), add:
        if((!window.COMPANY_CONTEXT || !window.COMPANY_CONTEXT.modules || window.COMPANY_CONTEXT.modules.includes('birthday_module')) && !navItems.some(it=>it&&it[0]==='birthday_module')){
          navItems.push(['birthday_module','Birthday','#E91E8C']);
        }

   4) showView() — right after the line
        if(v==='notes') document.getElementById('view-title').textContent='Notes';
      add:
        if(v==='birthday_module') document.getElementById('view-title').textContent='Birthday';

   5) renderView() — right after the line
        if(currentView==='notes')         return renderNotes();
      add:
        if(currentView==='birthday_module') return renderBirthdayModule();

   That's it — renderBirthdayModule()/saveBirthday() above are already
   self-contained and match the API this PR's backend route implements.
   ============================================================================ */
