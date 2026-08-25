/* ============================================================================
   OG Track — To-Do List: dashboard SECTION widget.
   A compact "my to-dos" card meant to be embedded on an existing page (e.g.
   the main dashboard). Shows open-item counts, a short list of the newest
   pending/in-progress items, a quick-add box, and a link out to the full
   dedicated management page (todo-list.html).

   Usage (see finish summary for exact wiring instructions):
     <div id="todo-section"></div>
     <script src="/js/todo-list-common.js"></script>
     <script src="/js/todo-list-section.js"></script>
     <script>TodoListSection.mount(document.getElementById('todo-section'));</script>

   Requires window.TodoListCommon (todo-list-common.js) to be loaded first.
   Depends on the backend module 'to_do_list' being enabled for the tenant —
   if the section's initial fetch 403s (module not enabled), the widget just
   hides itself rather than showing a broken box.
   ============================================================================ */
(function (global) {
  'use strict';

  const STYLE_ID = 'todo-section-style';
  const CSS = `
    .todo-sec{background:var(--white,#fff);border-radius:14px;border:1px solid rgba(11,11,11,.08);
      box-shadow:0 1px 2px rgba(20,20,30,.04),0 4px 14px rgba(20,20,30,.05);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;}
    .todo-sec-hdr{display:flex;align-items:center;justify-content:space-between;
      padding:16px 18px;border-bottom:1px solid #eee;}
    .todo-sec-hdr h3{font-size:15px;font-weight:700;color:#2C3E50;margin:0;display:flex;align-items:center;gap:8px;}
    .todo-sec-counts{display:flex;gap:6px;font-size:11px;}
    .todo-chip{padding:2px 9px;border-radius:20px;font-weight:700;background:#EBF5FB;color:#1A5276;}
    .todo-chip.done{background:#d4edda;color:#155724;}
    .todo-sec-body{padding:10px 18px 16px;}
    .todo-sec-add{display:flex;gap:8px;margin-bottom:10px;}
    .todo-sec-add input{flex:1;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;outline:none;}
    .todo-sec-add input:focus{border-color:#C0392B;}
    .todo-sec-add button{padding:8px 14px;background:#C0392B;color:#fff;border:none;border-radius:8px;
      font-size:13px;font-weight:600;cursor:pointer;}
    .todo-sec-add button:disabled{opacity:.5;cursor:not-allowed;}
    .todo-sec-list{list-style:none;margin:0;padding:0;}
    .todo-sec-item{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f2f2f2;}
    .todo-sec-item:last-child{border-bottom:none;}
    .todo-sec-item input[type=checkbox]{margin-top:3px;cursor:pointer;accent-color:#C0392B;}
    .todo-sec-item .t{font-size:13px;color:#2C3E50;flex:1;}
    .todo-sec-item.done .t{text-decoration:line-through;color:#999;}
    .todo-sec-item .prio{font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;}
    .todo-sec-item .prio.high{background:#fdecea;color:#c0392b;}
    .todo-sec-item .prio.normal{background:#eef1f4;color:#7f8c8d;}
    .todo-sec-item .prio.low{background:#eafaf1;color:#27ae60;}
    .todo-sec-empty{padding:14px 0;text-align:center;color:#999;font-size:12.5px;}
    .todo-sec-footer{text-align:right;margin-top:8px;}
    .todo-sec-footer a{font-size:12.5px;color:#C0392B;text-decoration:none;font-weight:600;}
    .todo-sec-footer a:hover{text-decoration:underline;}
    .todo-sec-err{color:#c0392b;font-size:12px;padding:10px 0;}
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
    li.className = 'todo-sec-item' + (item.status === 'done' ? ' done' : '');
    li.dataset.id = item.id;
    li.innerHTML = `
      <input type="checkbox" ${item.status === 'done' ? 'checked' : ''} />
      <span class="t">${common.escapeHtml(item.title)}</span>
      <span class="prio ${item.priority}">${common.PRIORITY_LABEL[item.priority] || item.priority}</span>
    `;
    const checkbox = li.querySelector('input');
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      try {
        await common.api.update(item.id, { status: checkbox.checked ? 'done' : 'pending' });
      } catch (e) {
        checkbox.checked = !checkbox.checked;
        alert('Could not update to-do: ' + e.message);
      } finally {
        checkbox.disabled = false;
      }
    });
    return li;
  }

  async function mount(container, opts) {
    if (!container) return;
    if (!global.TodoListCommon) {
      console.error('[TodoListSection] TodoListCommon (todo-list-common.js) must be loaded first.');
      return;
    }
    const common = global.TodoListCommon;
    const options = Object.assign({ limit: 5, pageUrl: '/todo-list.html' }, opts || {});
    ensureStyle();

    container.classList.add('todo-sec');
    container.innerHTML = `
      <div class="todo-sec-hdr">
        <h3>✅ To-Do List</h3>
        <div class="todo-sec-counts" data-role="counts"></div>
      </div>
      <div class="todo-sec-body">
        <div class="todo-sec-add">
          <input type="text" placeholder="Add a quick to-do…" maxlength="500" data-role="quick-add-input" />
          <button data-role="quick-add-btn">Add</button>
        </div>
        <ul class="todo-sec-list" data-role="list"></ul>
        <div class="todo-sec-footer"><a href="${common.escapeHtml(options.pageUrl)}?slug=${encodeURIComponent(common.slug)}">Open full to-do list →</a></div>
      </div>
    `;

    const countsEl = container.querySelector('[data-role="counts"]');
    const listEl = container.querySelector('[data-role="list"]');
    const input = container.querySelector('[data-role="quick-add-input"]');
    const addBtn = container.querySelector('[data-role="quick-add-btn"]');

    async function refresh() {
      try {
        const user = await common.currentUser();
        const userId = user ? user.id : undefined;
        const [counts, items] = await Promise.all([
          common.api.counts(userId ? { userId } : {}),
          common.api.list(Object.assign({ limit: options.limit }, userId ? { userId } : {})),
        ]);
        countsEl.innerHTML = `
          <span class="todo-chip">${counts.pending + counts.in_progress} open</span>
          <span class="todo-chip done">${counts.done} done</span>
        `;
        listEl.innerHTML = '';
        if (!items.length) {
          listEl.innerHTML = '<div class="todo-sec-empty">Nothing on the list yet 🎉</div>';
        } else {
          items.forEach(item => listEl.appendChild(itemRow(item, common)));
        }
      } catch (e) {
        container.innerHTML = `<div class="todo-sec-hdr"><h3>✅ To-Do List</h3></div>
          <div class="todo-sec-body"><div class="todo-sec-err">Couldn't load to-dos: ${common.escapeHtml(e.message)}</div></div>`;
      }
    }

    async function quickAdd() {
      const title = input.value.trim();
      if (!title) return;
      addBtn.disabled = true;
      try {
        const user = await common.currentUser();
        await common.api.create({
          title,
          priority: 'normal',
          createdBy: user ? user.id : null,
          createdByName: user ? user.name : null,
        });
        input.value = '';
        await refresh();
      } catch (e) {
        alert('Could not add to-do: ' + e.message);
      } finally {
        addBtn.disabled = false;
      }
    }

    addBtn.addEventListener('click', quickAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') quickAdd(); });

    common.subscribe({
      onCreated: refresh,
      onUpdated: refresh,
      onDeleted: refresh,
    });

    await refresh();
  }

  global.TodoListSection = { mount };
})(window);
