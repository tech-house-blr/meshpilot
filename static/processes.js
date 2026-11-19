/* Processes: sortable columns, list or tree view, pinned rows, terminate and force kill with confirmation. */
P.processes = () => {
  const LS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } };
  let data = [], total = 0, sortK = LS('pm_psort', 'cpu'), sortD = LS('pm_pdir', -1), view = LS('pm_pview', 'list'), pins = new Set(LS('pm_ppins', []));
  const COLS = [['pid', 'PID', 'r0'], ['name', 'Name', ''], ['user', 'User', ''], ['status', 'Status', ''], ['cpu', 'CPU %', 'r'], ['mem', 'Memory %', 'r']];
  const key = x => x.pid + ':' + x.name;
  main.innerHTML = `<div class="page">${head('Processes')}<div class="surface"><div class="tools"><input id="q" placeholder="Filter by name, user, PID or command" size="34" aria-label="Filter processes">
    <div class="seg" role="radiogroup" aria-label="View">${[['list', 'List'], ['tree', 'Tree']].map(([k, l]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${view == k}">${l}</button>`).join('')}</div>
    <select id="psel" class="sortsel" aria-label="Sort by">${[['cpu', -1, 'CPU, highest first'], ['mem', -1, 'Memory, highest first'], ['name', 1, 'Name, A to Z'], ['pid', 1, 'PID, lowest first'], ['user', 1, 'User, A to Z']].map(([k, d, l]) => `<option value="${k}:${d}">${l}</option>`).join('')}</select>
    <span class="muted sm" id="pcount" aria-live="polite">Loading</span></div><div class="tw" id="live"><div class="loading">${skel(6)}</div></div></div></div>`;
  const cmp = (a, b) => { const A = a[sortK], B = b[sortK]; const c = typeof A == 'number' ? A - B : String(A).localeCompare(String(B), undefined, {numeric: true}); return (c || a.pid - b.pid) * sortD };
  const row = (x, depth, dim) => {
    const pinned = pins.has(key(x));
    return `<tr class="${dim ? 'pdim' : ''}"><td data-l="Pin"><button class="pin" type="button" data-pin="${esc(key(x))}" aria-pressed="${pinned}" aria-label="${pinned ? 'Unpin' : 'Pin'} ${esc(x.name)}" title="${pinned ? 'Unpin' : 'Pin to top'}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"${pinned ? ' fill="currentColor"' : ''}/></svg></button></td>
      <td class="m r0" data-l="PID">${x.pid}</td><td data-l="Name"><span class="pname" style="--d:${depth}">${esc(x.name)}</span></td><td data-l="User">${esc(x.user)}</td><td data-l="Status"><span class="chip st-${esc(x.status)}">${esc(x.status)}</span></td>
      <td class="r m" data-l="CPU %"><span class="cbar" style="--v:${Math.min(100, x.cpu)}%"></span>${x.cpu}</td><td class="r m" data-l="Memory %">${x.mem}</td><td class="muted m cmdc" data-l="Command" title="${esc(x.cmd)}">${esc(x.cmd)}</td>
      <td class="pact"><button class="btn s bad" type="button" data-kill="${x.pid}" data-n="${esc(x.name)}" data-sig="TERM">Terminate</button><button class="btn s bad" type="button" data-kill="${x.pid}" data-n="${esc(x.name)}" data-sig="KILL" title="Force kill (SIGKILL)">Force kill</button></td></tr>`;
  };
  const treeRows = (list, match) => {
    const byId = new Map(list.map(x => [x.pid, x])), kids = new Map(); const keep = new Set();
    list.forEach(x => { if (match(x)) { for (let n = x; n && !keep.has(n.pid); n = byId.get(n.ppid)) keep.add(n.pid) } });
    list.forEach(x => { if (!keep.has(x.pid)) return; const par = byId.has(x.ppid) && x.ppid != x.pid && keep.has(x.ppid) ? x.ppid : 0; if (!kids.has(par)) kids.set(par, []); kids.get(par).push(x) });
    const out = [], walk = (par, d) => (kids.get(par) || []).sort(cmp).forEach(x => { out.push([x, d, !match(x)]); walk(x.pid, d + 1) }); walk(0, 0); return out;
  };
  const draw = () => {
    const q = $('#q').value.toLowerCase(), match = x => !q || (x.name + ' ' + x.cmd + ' ' + x.user + ' ' + x.pid).toLowerCase().includes(q);
    const act = document.activeElement, focusKey = act && act.closest('#live') && (act.dataset.pin ? 'pin:' + act.dataset.pin : act.dataset.kill ? 'kill:' + act.dataset.kill + act.dataset.sig : act.dataset.s ? 's:' + act.dataset.s : null);
    let rows, shown;
    const sorted = data.filter(match).sort(cmp), pinned = data.filter(x => pins.has(key(x)) && match(x)).sort(cmp);
    if (view == 'tree') { rows = treeRows(data, match); shown = rows.length } else { const rest = sorted.filter(x => !pins.has(key(x))).slice(0, 150); rows = rest.map(x => [x, 0, false]); shown = rest.length + pinned.length }
    const pinRows = pinned.map(x => row(x, 0, false)).join('');
    const th = ([k, l, c]) => `<th class="${c}" aria-sort="${sortK == k ? (sortD > 0 ? 'ascending' : 'descending') : 'none'}"><button class="th" type="button" data-s="${k}">${l}</button></th>`;
    $('#live').innerHTML = rows.length || pinRows ? `<table class="stack ptable"><thead><tr><th><span class="vh">Pin</span></th>${COLS.map(th).join('')}<th>Command</th><th><span class="vh">Actions</span></th></tr></thead><tbody>${pinRows ? `<tr class="pgrp"><td colspan="9">Pinned</td></tr>${pinRows}<tr class="pgrp"><td colspan="9">${view == 'tree' ? 'Process tree' : 'All processes'}</td></tr>` : ''}${rows.map(([x, d, dim]) => row(x, d, dim)).join('')}</tbody></table>` : '<div class="empty">No process matches this filter. Clear the filter to see all processes.</div>';
    syncSel();
    $('#pcount').textContent = `${shown} of ${total} shown, refreshes every 3 seconds`;
    if (focusKey) { const sel = focusKey.startsWith('pin:') ? `[data-pin="${CSS.escape(focusKey.slice(4))}"]` : focusKey.startsWith('s:') ? `[data-s="${focusKey.slice(2)}"]` : null; const el = sel ? $('#live ' + sel) : [...document.querySelectorAll('#live [data-kill]')].find(b => 'kill:' + b.dataset.kill + b.dataset.sig == focusKey); if (el) el.focus({preventScroll: true}) }
  };
  const save = () => { localStorage.setItem('pm_psort', JSON.stringify(sortK)); localStorage.setItem('pm_pdir', sortD); localStorage.setItem('pm_pview', JSON.stringify(view)); localStorage.setItem('pm_ppins', JSON.stringify([...pins])) };
  $('#q').oninput = draw;
  const syncSel = () => { const v = sortK + ':' + sortD, o = [...$('#psel').options].find(x => x.value == v); $('#psel').value = o ? v : '' };
  $('#psel').onchange = e => { const [k, d] = e.target.value.split(':'); sortK = k; sortD = +d; save(); draw() };
  main.onclick = async e => {
    const v = e.target.closest('[data-v]'); if (v) { view = v.dataset.v; document.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', b.dataset.v == view)); save(); draw(); return }
    const t = e.target.closest('.th'); if (t) { const k = t.dataset.s; if (sortK == k) sortD = -sortD; else { sortK = k; sortD = ['cpu', 'mem'].includes(k) ? -1 : 1 } save(); draw(); return }
    const p = e.target.closest('[data-pin]'); if (p) { const k = p.dataset.pin; pins.has(k) ? pins.delete(k) : pins.add(k); save(); draw(); return }
    const b = e.target.closest('[data-kill]'); if (!b) return;
    const force = b.dataset.sig == 'KILL', pid = +b.dataset.kill;
    if (!await ask(force ? `Force kill process ${pid} (${b.dataset.n})? It stops immediately and cannot save its work.` : `Terminate process ${pid} (${b.dataset.n})? It receives SIGTERM and can shut down cleanly.`)) return;
    const r = await post('/api/processes/kill', {pid, signal: b.dataset.sig});
    if (!r.ok) { toast('Failed: ' + r.error); return }
    toast(force ? 'Process killed' : 'Terminate signal sent');
    setTimeout(async () => { try { data = (await get('/api/processes')).procs; if (page == 'processes') draw() } catch (e) {} }, 700);
  };
  every(async () => { const r = await get('/api/processes'); if (page != 'processes') return; data = r.procs; total = r.total || data.length; draw() }, 3000);
};
