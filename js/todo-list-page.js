/* ============================================================================
   OG Track — To-Do List: dedicated management page controller.
   Full CRUD: filter by status, create/edit/delete items, assign to a
   teammate, set priority + due date. Used by todo-list.html.
   Requires window.TodoListCommon (todo-list-common.js) to be loaded first.
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
    if (!global.TodoListCommon) {
      rootEl.innerHTML = '<p style="color:#c0392b;padding:20px;">TodoListCommon (todo-list-common.js) must be loaded before todo-list-page.js.</p>';
      return;
    }
    const common = global.TodoListCommon;
    const state = { items: [], users: [], filterStatus: '', currentUser: null, editingId: null };

    rootEl.innerHTML = `
      <div class="tdl-toolbar">
        <div class="tdl-filters">
          <button class="tdl-filter active" data-status="">All</button>
          <button class="tdl-filter" data-status="pending">Pending</button>
          <button class="tdl-filter" data-status="in_progress">In Progress</button>
          <button class="tdl-filter" data-status="done">Done</button>
        </div>
        <button class="tdl-btn-primary" data-role="new-btn">+ New To-Do</button>
      </div>
      <div class="tdl-status" data-role="status"></div>
      <div class="tdl-list" data-role="list"></div>

      <div class="tdl-modal-overlay" data-role="modal-overlay">
        <div class="tdl-modal">
          <div class="tdl-modal-hdr">
            <h3 data-role="modal-title">New To-Do</h3>
            <button class="tdl-modal-close" data-role="modal-close">&times;</button>
          </div>
          <div class="tdl-modal-body">
            <div class="tdl-field">
              <label>Title</label>
              <input type="text" data-role="f-title" maxlength="500" />
            </div>
            <div class="tdl-field">
              <label>Description</label>
              <textarea data-role="f-description" rows="3"></textarea>
            </div>
            <div class="tdl-field-row">
              <div class="tdl-field">
                <label>Priority</label>
                <select data-role="f-priority">
                  <option value="low">Low</option>
                  <option value="normal" selected>Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div class="tdl-field">
                <label>Due date</label>
                <input type="date" data-role="f-due" />
              </div>
            </div>
            <div class="tdl-field">
              <label>Assign to</label>
              <select data-role="f-assignee"><option value="">Unassigned</option></select>
            </div>
          </div>
          <div class="tdl-modal-footer">
            <button class="tdl-btn-cancel" data-role="modal-cancel">Cancel</button>
            <button class="tdl-btn-primary" data-role="modal-save">Save</button>
          </div>
        </div>
      </div>
    `;

    const listEl = rootEl.querySelector('[data-role="list"]');
    const statusEl = rootEl.querySelector('[data-role="status"]');
    const overlay = rootEl.querySelector('[data-role="modal-overlay"]');
    const modalTitle = rootEl.querySelector('[data-role="modal-title"]');
    const fTitle = rootEl.querySelector('[data-role="f-title"]');
    const fDesc = rootEl.querySelector('[data-role="f-description"]');
    const fPriority = rootEl.querySelector('[data-role="f-priority"]');
    const fDue = rootEl.querySelector('[data-role="f-due"]');
    const fAssignee = rootEl.querySelector('[data-role="f-assignee"]');

    function openModal(item) {
      state.editingId = item ? item.id : null;
      modalTitle.textContent = item ? 'Edit To-Do' : 'New To-Do';
      fTitle.value = item ? item.title : '';
      fDesc.value = item ? item.description : '';
      fPriority.value = item ? item.priority : 'normal';
      fDue.value = item && item.dueDate ? item.dueDate : '';
      fAssignee.value = item && item.assignedTo ? item.assignedTo : '';
      overlay.classList.add('open');
      fTitle.focus();
    }
    function closeModal() { overlay.classList.remove('open'); }

    rootEl.querySelector('[data-role="new-btn"]').addEventListener('click', () => openModal(null));
    rootEl.querySelector('[data-role="modal-close"]').addEventListener('click', closeModal);
    rootEl.querySelector('[data-role="modal-cancel"]').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    rootEl.querySelector('[data-role="modal-save"]').addEventListener('click', async () => {
      const title = fTitle.value.trim();
      if (!title) { fTitle.focus(); return; }
      const assignee = state.users.find(u => u.id === fAssignee.value);
      const payload = {
        title,
        description: fDesc.value.trim(),
        priority: fPriority.value,
        dueDate: fDue.value || null,
        assignedTo: fAssignee.value || null,
        assignedToName: assignee ? assignee.name : null,
      };
      try {
        if (state.editingId) {
          await common.api.update(state.editingId, payload);
        } else {
          payload.createdBy = state.currentUser ? state.currentUser.id : null;
          payload.createdByName = state.currentUser ? state.currentUser.name : null;
          await common.api.create(payload);
        }
        closeModal();
        await refresh();
      } catch (e) {
        alert('Could not save to-do: ' + e.message);
      }
    });

    rootEl.querySelectorAll('.tdl-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        rootEl.querySelectorAll('.tdl-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filterStatus = btn.dataset.status;
        renderList();
      });
    });

    function renderList() {
      const items = state.filterStatus ? state.items.filter(i => i.status === state.filterStatus) : state.items;
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.innerHTML = '<div class="tdl-empty">No to-do items here yet.</div>';
        return;
      }
      items.forEach(item => listEl.appendChild(renderRow(item)));
    }

    function renderRow(item) {
      const row = el('div', { class: 'tdl-row' + (item.status === 'done' ? ' done' : '') });
      const left = el('div', { class: 'tdl-row-left' });
      const checkbox = el('input', { type: 'checkbox' });
      checkbox.checked = item.status === 'done';
      checkbox.addEventListener('change', async () => {
        try {
          await common.api.update(item.id, { status: checkbox.checked ? 'done' : 'pending' });
          await refresh();
        } catch (e) { alert('Could not update: ' + e.message); }
      });
      left.appendChild(checkbox);

      const info = el('div', { class: 'tdl-row-info' });
      info.appendChild(el('div', { class: 'tdl-row-title' }, [item.title]));
      const metaBits = [];
      if (item.dueDate) metaBits.push('Due ' + common.formatDate(item.dueDate));
      if (item.assignedToName) metaBits.push('Assigned: ' + item.assignedToName);
      if (item.description) metaBits.push(item.description);
      info.appendChild(el('div', { class: 'tdl-row-meta' }, [metaBits.join(' • ')]));
      left.appendChild(info);
      row.appendChild(left);

      const right = el('div', { class: 'tdl-row-right' });
      right.appendChild(el('span', { class: 'tdl-badge prio-' + item.priority }, [common.PRIORITY_LABEL[item.priority] || item.priority]));
      right.appendChild(el('span', { class: 'tdl-badge status-' + item.status }, [common.STATUS_LABEL[item.status] || item.status]));
      right.appendChild(el('button', { class: 'tdl-btn-sm', onclick: () => openModal(item) }, ['Edit']));
      right.appendChild(el('button', { class: 'tdl-btn-sm tdl-btn-danger', onclick: () => remove(item) }, ['Delete']));
      row.appendChild(right);
      return row;
    }

    async function remove(item) {
      if (!confirm('Delete "' + item.title + '"?')) return;
      try {
        await common.api.remove(item.id);
        await refresh();
      } catch (e) { alert('Could not delete: ' + e.message); }
    }

    async function refresh() {
      try {
        statusEl.textContent = '';
        const [items, users] = await Promise.all([common.api.list({}), common.api.users().catch(() => [])]);
        state.items = items;
        state.users = users || [];
        fAssignee.innerHTML = '<option value="">Unassigned</option>' +
          state.users.map(u => `<option value="${common.escapeHtml(u.id)}">${common.escapeHtml(u.name)}</option>`).join('');
        renderList();
      } catch (e) {
        statusEl.textContent = 'Could not load to-dos: ' + e.message;
      }
    }

    state.currentUser = await common.currentUser();
    common.subscribe({ onCreated: refresh, onUpdated: refresh, onDeleted: refresh });
    await refresh();
  }

  global.TodoListPage = { init };
})(window);
