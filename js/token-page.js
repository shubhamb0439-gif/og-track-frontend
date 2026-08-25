/* ============================================================================
   OG Track — Token: dedicated management page controller.
   - "Add Token" section/button opens a pop-up with Name + Token Consumed
     inputs.
   - Submitting the pop-up creates the token via TokenCommon.api.create.
   - Added tokens are listed below (newest first), with delete support.
   Requires window.TokenCommon (token-common.js) to be loaded first.
   ============================================================================ */
(function (global) {
  'use strict';

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) node.setAttribute(k, v);
    });
    (children || []).forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  async function init(rootEl) {
    if (!global.TokenCommon) {
      rootEl.innerHTML = '<p style="color:#c0392b;padding:20px;">TokenCommon (token-common.js) must be loaded before token-page.js.</p>';
      return;
    }
    const common = global.TokenCommon;
    const state = { items: [], currentUser: null };

    rootEl.innerHTML = `
      <div class="tok-toolbar">
        <h2 class="tok-heading">🔖 Token</h2>
        <button class="tok-btn-primary" data-role="new-btn">+ Add Token</button>
      </div>
      <div class="tok-status" data-role="status"></div>
      <div class="tok-list" data-role="list"></div>

      <div class="tok-modal-overlay" data-role="modal-overlay">
        <div class="tok-modal">
          <div class="tok-modal-hdr">
            <h3>Add Token</h3>
            <button class="tok-modal-close" data-role="modal-close">&times;</button>
          </div>
          <div class="tok-modal-body">
            <div class="tok-field">
              <label>Name</label>
              <input type="text" data-role="f-name" maxlength="200" placeholder="e.g. GPT-4 API key" />
            </div>
            <div class="tok-field">
              <label>Token Consumed</label>
              <input type="number" data-role="f-consumed" min="0" step="0.01" placeholder="e.g. 1500" />
            </div>
          </div>
          <div class="tok-modal-footer">
            <button class="tok-btn-cancel" data-role="modal-cancel">Cancel</button>
            <button class="tok-btn-primary" data-role="modal-save">Save</button>
          </div>
        </div>
      </div>
    `;

    const listEl = rootEl.querySelector('[data-role="list"]');
    const statusEl = rootEl.querySelector('[data-role="status"]');
    const overlay = rootEl.querySelector('[data-role="modal-overlay"]');
    const fName = rootEl.querySelector('[data-role="f-name"]');
    const fConsumed = rootEl.querySelector('[data-role="f-consumed"]');

    function openModal() {
      fName.value = '';
      fConsumed.value = '';
      overlay.classList.add('open');
      fName.focus();
    }
    function closeModal() { overlay.classList.remove('open'); }

    rootEl.querySelector('[data-role="new-btn"]').addEventListener('click', openModal);
    rootEl.querySelector('[data-role="modal-close"]').addEventListener('click', closeModal);
    rootEl.querySelector('[data-role="modal-cancel"]').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    rootEl.querySelector('[data-role="modal-save"]').addEventListener('click', async () => {
      const name = fName.value.trim();
      const consumed = fConsumed.value;
      if (!name) { fName.focus(); return; }
      if (consumed === '' || isNaN(Number(consumed))) { fConsumed.focus(); return; }
      try {
        await common.api.create({
          name,
          consumed: Number(consumed),
          createdBy: state.currentUser ? state.currentUser.id : null,
          createdByName: state.currentUser ? state.currentUser.name : null,
        });
        closeModal();
        await refresh();
      } catch (e) {
        alert('Could not add token: ' + e.message);
      }
    });

    function renderList() {
      listEl.innerHTML = '';
      if (!state.items.length) {
        listEl.innerHTML = '<div class="tok-empty">No tokens added yet.</div>';
        return;
      }
      state.items.forEach(item => listEl.appendChild(renderRow(item)));
    }

    function renderRow(item) {
      const row = el('div', { class: 'tok-row' });
      const left = el('div', { class: 'tok-row-left' });
      left.appendChild(el('div', { class: 'tok-row-title' }, [item.name]));
      const metaBits = [];
      if (item.createdByName) metaBits.push('Added by ' + item.createdByName);
      if (item.createdAt) metaBits.push(common.formatDateTime(item.createdAt));
      left.appendChild(el('div', { class: 'tok-row-meta' }, [metaBits.join(' • ')]));
      row.appendChild(left);

      const right = el('div', { class: 'tok-row-right' });
      right.appendChild(el('span', { class: 'tok-badge' }, [String(item.consumed) + ' consumed']));
      right.appendChild(el('button', { class: 'tok-btn-sm tok-btn-danger', onclick: () => remove(item) }, ['Delete']));
      row.appendChild(right);
      return row;
    }

    async function remove(item) {
      if (!confirm('Delete "' + item.name + '"?')) return;
      try {
        await common.api.remove(item.id);
        await refresh();
      } catch (e) { alert('Could not delete: ' + e.message); }
    }

    async function refresh() {
      try {
        statusEl.textContent = '';
        state.items = await common.api.list({});
        renderList();
      } catch (e) {
        statusEl.textContent = 'Could not load tokens: ' + e.message;
      }
    }

    state.currentUser = await common.currentUser();
    common.subscribe({ onCreated: refresh, onDeleted: refresh });
    await refresh();
  }

  global.TokenPage = { init };
})(window);
