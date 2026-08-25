/* =============================================================================
   Super Admin ToDo List — sidebar module (module key: super_admin_todo_list)
   -----------------------------------------------------------------------------
   Self-contained, drop-in widget. Renders a dedicated "Super Admin To-Do"
   section in the left-hand sidebar with:
     - an add-task input,
     - a checkbox per task to mark it completed,
     - a delete button per task.

   It talks to the backend routes registered at
   /api/:slug/super_admin_todo_list (mounted in src/server.js), using the
   SAME plain '/api/...' calls the rest of this app's adapter shim
   (_adapter.reference.html) already rewrites to '/api/<slug>/...' and attaches
   the JWT to — no extra wiring needed for auth/tenant routing.

   HOW TO INCLUDE (manual step — see finish summary):
     <link rel="stylesheet" href="/super_admin_todo_list.css">
     <script src="/super_admin_todo_list.js"></script>
   placed before </body> in index.html. The widget auto-mounts on
   DOMContentLoaded and looks for an existing sidebar/nav container to attach
   to (see CANDIDATE_SIDEBAR_SELECTORS below); if none is found it falls back
   to rendering its own fixed panel anchored to the left edge of the viewport
   so the feature is still usable out of the box.
   ============================================================================= */
(function () {
  const API_PATH = '/api/super_admin_todo_list';

  // Selectors tried, in order, to find the app's real left-hand sidebar/nav
  // element to append our section into. Update this list (or add an element
  // with id="sa-todo-mount-point") to attach to the exact sidebar markup.
  const CANDIDATE_SIDEBAR_SELECTORS = [
    '#sa-todo-mount-point',
    '#sidebar',
    '.sidebar',
    'nav.sidebar',
    '.side-nav',
    '.left-sidebar',
    '#leftSidebar',
    '.app-sidebar',
  ];

  function findSidebarContainer() {
    for (const sel of CANDIDATE_SIDEBAR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function currentUserId() {
    try {
      const raw = localStorage.getItem('og_user');
      if (!raw) return null;
      const u = JSON.parse(raw);
      return u && (u.id || u.userId) || null;
    } catch (e) { return null; }
  }

  const state = { tasks: [], loading: false, error: null, collapsed: false };

  async function apiList() {
    const res = await fetch(API_PATH);
    if (!res.ok) throw new Error((await safeJson(res)).error || 'Failed to load tasks');
    return res.json();
  }
  async function apiCreate(title) {
    const res = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, createdBy: currentUserId() }),
    });
    if (!res.ok) throw new Error((await safeJson(res)).error || 'Failed to add task');
    return res.json();
  }
  async function apiToggle(id, isCompleted) {
    const res = await fetch(`${API_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted }),
    });
    if (!res.ok) throw new Error((await safeJson(res)).error || 'Failed to update task');
    return res.json();
  }
  async function apiDelete(id) {
    const res = await fetch(`${API_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await safeJson(res)).error || 'Failed to delete task');
    return res.json();
  }
  async function safeJson(res) {
    try { return await res.json(); } catch (e) { return {}; }
  }

  function render(root) {
    const pending = state.tasks.filter(t => !t.isCompleted).length;
    root.innerHTML = `
      <div class="sa-todo-header" data-role="sa-todo-toggle">
        <span>Super Admin To-Do</span>
        <span class="sa-todo-badge">${pending}</span>
      </div>
      <div class="sa-todo-body" style="${state.collapsed ? 'display:none' : ''}">
        <div class="sa-todo-add-row">
          <input type="text" class="sa-todo-input" placeholder="Add a task…" data-role="sa-todo-new-input" maxlength="500" />
          <button class="sa-todo-add-btn" data-role="sa-todo-add-btn">Add</button>
        </div>
        ${state.error ? `<div class="sa-todo-error">${escapeHtml(state.error)}</div>` : ''}
        <ul class="sa-todo-list">
          ${state.tasks.length === 0 && !state.loading ? '<li class="sa-todo-empty">No tasks yet.</li>' : ''}
          ${state.tasks.map(t => `
            <li class="sa-todo-item ${t.isCompleted ? 'sa-todo-completed' : ''}" data-id="${escapeHtml(t.id)}">
              <input type="checkbox" data-role="sa-todo-check" ${t.isCompleted ? 'checked' : ''} />
              <span class="sa-todo-item-title">${escapeHtml(t.title)}</span>
              <button class="sa-todo-delete-btn" data-role="sa-todo-delete" title="Delete task">✕</button>
            </li>
          `).join('')}
        </ul>
      </div>
    `;

    root.querySelector('[data-role="sa-todo-toggle"]').addEventListener('click', () => {
      state.collapsed = !state.collapsed;
      render(root);
    });

    const addBtn = root.querySelector('[data-role="sa-todo-add-btn"]');
    const input = root.querySelector('[data-role="sa-todo-new-input"]');
    const submit = async () => {
      const title = input.value.trim();
      if (!title) return;
      addBtn.disabled = true;
      try {
        const created = await apiCreate(title);
        state.tasks.unshift(created);
        state.error = null;
      } catch (e) {
        state.error = e.message;
      } finally {
        addBtn.disabled = false;
        render(root);
      }
    };
    addBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

    root.querySelectorAll('[data-role="sa-todo-check"]').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        const li = e.target.closest('.sa-todo-item');
        const id = li.getAttribute('data-id');
        const isCompleted = e.target.checked;
        try {
          const updated = await apiToggle(id, isCompleted);
          const idx = state.tasks.findIndex(t => t.id === id);
          if (idx !== -1) state.tasks[idx] = updated;
        } catch (err) {
          state.error = err.message;
        }
        render(root);
      });
    });

    root.querySelectorAll('[data-role="sa-todo-delete"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const li = e.target.closest('.sa-todo-item');
        const id = li.getAttribute('data-id');
        try {
          await apiDelete(id);
          state.tasks = state.tasks.filter(t => t.id !== id);
        } catch (err) {
          state.error = err.message;
        }
        render(root);
      });
    });
  }

  async function mount() {
    let container = findSidebarContainer();
    const section = document.createElement('div');
    section.id = 'sa-todo-section';

    if (!container) {
      // No known sidebar markup found — render our own fixed left-hand panel
      // so the feature still works standalone until wired into the real nav.
      section.classList.add('sa-todo-floating');
      document.body.appendChild(section);
    } else {
      container.appendChild(section);
    }

    render(section);
    state.loading = true;
    try {
      state.tasks = await apiList();
    } catch (e) {
      state.error = e.message;
    } finally {
      state.loading = false;
      render(section);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
