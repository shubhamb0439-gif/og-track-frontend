/* ============================================================================
   OG Track — Token: dashboard SECTION widget.
   A compact "Token" card meant to be embedded on an existing page (e.g. the
   main dashboard, next to Attendance/To-Do sections). Shows an "Add Token"
   button that opens the pop-up (name + token consumed), a short list of the
   most recently added tokens, and a link out to the full dedicated
   management page (token.html).

   Usage (see finish summary for exact wiring instructions):
     <div id="token-section"></div>
     <script src="/js/token-common.js"></script>
     <script src="/js/token-section.js"></script>
     <script>TokenSection.mount(document.getElementById('token-section'));</script>

   Requires window.TokenCommon (token-common.js) to be loaded first.
   Depends on the backend module 'token' being enabled for the tenant — if
   the section's initial fetch 403s (module not enabled), the widget shows
   an inline error rather than a broken box.
   ============================================================================ */
(function (global) {
  'use strict';

  const STYLE_ID = 'token-section-style';
  const CSS = `
    .tok-sec{background:var(--white,#fff);border-radius:14px;border:1px solid rgba(11,11,11,.08);
      box-shadow:0 1px 2px rgba(20,20,30,.04),0 4px 14px rgba(20,20,30,.05);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;}
    .tok-sec-hdr{display:flex;align-items:center;justify-content:space-between;
      padding:16px 18px;border-bottom:1px solid #eee;}
    .tok-sec-hdr h3{font-size:15px;font-weight:700;color:#2C3E50;margin:0;display:flex;align-items:center;gap:8px;}
    .tok-sec-hdr button{padding:7px 14px;background:#C0392B;color:#fff;border:none;border-radius:8px;
      font-size:12.5px;font-weight:700;cursor:pointer;}
    .tok-sec-hdr button:hover{opacity:.9;}
    .tok-sec-body{padding:10px 18px 16px;}
    .tok-sec-list{list-style:none;margin:0;padding:0;}
    .tok-sec-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #f2f2f2;}
    .tok-sec-item:last-child{border-bottom:none;}
    .tok-sec-item .n{font-size:13px;color:#2C3E50;flex:1;}
    .tok-sec-item .c{font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:#EBF5FB;color:#1A5276;}
    .tok-sec-empty{padding:14px 0;text-align:center;color:#999;font-size:12.5px;}
    .tok-sec-footer{text-align:right;margin-top:8px;}
    .tok-sec-footer a{font-size:12.5px;color:#C0392B;text-decoration:none;font-weight:600;}
    .tok-sec-footer a:hover{text-decoration:underline;}
    .tok-sec-err{color:#c0392b;font-size:12px;padding:10px 0;}

    .tok-sec-modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;
      align-items:center;justify-content:center;padding:20px;}
    .tok-sec-modal-overlay.open{display:flex;}
    .tok-sec-modal{background:#fff;border-radius:16px;width:100%;max-width:420px;
      box-shadow:0 20px 60px rgba(0,0,0,.2);}
    .tok-sec-modal-hdr{padding:16px 20px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;}
    .tok-sec-modal-hdr h3{font-size:15px;font-weight:700;margin:0;}
    .tok-sec-modal-close{background:none;border:none;font-size:20px;cursor:pointer;color:#7F8C8D;}
    .tok-sec-modal-body{padding:18px 20px;}
    .tok-sec-field{margin-bottom:12px;}
    .tok-sec-field label{display:block;font-size:11px;font-weight:700;color:#7F8C8D;margin-bottom:6px;
      text-transform:uppercase;letter-spacing:.4px;}
    .tok-sec-field input{width:100%;padding:8px 11px;border:1px solid #ddd;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;}
    .tok-sec-field input:focus{border-color:#C0392B;}
    .tok-sec-modal-footer{padding:12px 20px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:10px;}
    .tok-sec-btn-cancel{padding:8px 14px;border:1px solid #ddd;background:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;}
  `;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function itemRow(item, common) {
    const li = document.createElement('li');
    li.className = 'tok-sec-item';
    li.innerHTML = `
      <span class="n">${common.escapeHtml(item.name)}</span>
      <span class="c">${common.escapeHtml(String(item.consumed))} consumed</span>
    `;
    return li;
  }

  async function mount(container, opts) {
    if (!container) return;
    if (!global.TokenCommon) {
      console.error('[TokenSection] TokenCommon (token-common.js) must be loaded first.');
      return;
    }
    const common = global.TokenCommon;
    const options = Object.assign({ limit: 5, pageUrl: '/token.html' }, opts || {});
    ensureStyle();

    container.classList.add('tok-sec');
    container.innerHTML = `
      <div class="tok-sec-hdr">
        <h3>🔖 Token</h3>
        <button data-role="add-btn">+ Add Token</button>
      </div>
      <div class="tok-sec-body">
        <ul class="tok-sec-list" data-role="list"></ul>
        <div class="tok-sec-footer"><a href="${common.escapeHtml(options.pageUrl)}?slug=${encodeURIComponent(common.slug)}">Open full Token list →</a></div>
      </div>
      <div class="tok-sec-modal-overlay" data-role="modal-overlay">
        <div class="tok-sec-modal">
          <div class="tok-sec-modal-hdr">
            <h3>Add Token</h3>
            <button class="tok-sec-modal-close" data-role="modal-close">&times;</button>
          </div>
          <div class="tok-sec-modal-body">
            <div class="tok-sec-field">
              <label>Name</label>
              <input type="text" data-role="f-name" maxlength="200" placeholder="e.g. GPT-4 API key" />
            </div>
            <div class="tok-sec-field">
              <label>Token Consumed</label>
              <input type="number" data-role="f-consumed" min="0" step="0.01" placeholder="e.g. 1500" />
            </div>
          </div>
          <div class="tok-sec-modal-footer">
            <button class="tok-sec-btn-cancel" data-role="modal-cancel">Cancel</button>
            <button data-role="modal-save" style="padding:8px 16px;background:#C0392B;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Save</button>
          </div>
        </div>
      </div>
    `;

    const listEl = container.querySelector('[data-role="list"]');
    const overlay = container.querySelector('[data-role="modal-overlay"]');
    const fName = container.querySelector('[data-role="f-name"]');
    const fConsumed = container.querySelector('[data-role="f-consumed"]');

    function openModal() {
      fName.value = '';
      fConsumed.value = '';
      overlay.classList.add('open');
      fName.focus();
    }
    function closeModal() { overlay.classList.remove('open'); }

    container.querySelector('[data-role="add-btn"]').addEventListener('click', openModal);
    container.querySelector('[data-role="modal-close"]').addEventListener('click', closeModal);
    container.querySelector('[data-role="modal-cancel"]').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    container.querySelector('[data-role="modal-save"]').addEventListener('click', async () => {
      const name = fName.value.trim();
      const consumed = fConsumed.value;
      if (!name) { fName.focus(); return; }
      if (consumed === '' || isNaN(Number(consumed))) { fConsumed.focus(); return; }
      try {
        const user = await common.currentUser();
        await common.api.create({
          name,
          consumed: Number(consumed),
          createdBy: user ? user.id : null,
          createdByName: user ? user.name : null,
        });
        closeModal();
        await refresh();
      } catch (e) {
        alert('Could not add token: ' + e.message);
      }
    });

    async function refresh() {
      try {
        const items = await common.api.list({ limit: options.limit });
        listEl.innerHTML = '';
        if (!items.length) {
          listEl.innerHTML = '<div class="tok-sec-empty">No tokens added yet.</div>';
        } else {
          items.forEach(item => listEl.appendChild(itemRow(item, common)));
        }
      } catch (e) {
        container.innerHTML = `<div class="tok-sec-hdr"><h3>🔖 Token</h3></div>
          <div class="tok-sec-body"><div class="tok-sec-err">Couldn't load tokens: ${common.escapeHtml(e.message)}</div></div>`;
      }
    }

    common.subscribe({
      onCreated: refresh,
      onDeleted: refresh,
    });

    await refresh();
  }

  global.TokenSection = { mount };
})(window);
