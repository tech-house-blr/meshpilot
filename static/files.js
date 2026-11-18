/* File manager: places and folder tree, list and icon views, multi-select, context menu, clipboard, drag to move, keyboard. */
const FK = {
  dir: ['k-dir', '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'],
  img: ['k-img', '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="M4 17l5-5 4 4 3-3 4 4"/>'],
  code: ['k-code', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M10 13l-2 2 2 2M14 13l2 2-2 2"/>'],
  text: ['k-text', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 16h6"/>'],
  arch: ['k-arch', '<path d="M5 4h14v16H5z"/><path d="M12 4v4M12 10v2M12 14v2"/>'],
  media: ['k-media', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/>'],
  pdf: ['k-pdf', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M9 17v-4h1.5a1.2 1.2 0 0 1 0 2.4H9"/>'],
  cfg: ['k-cfg', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><circle cx="12.5" cy="15" r="2"/>'],
  file: ['k-file', '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>'],
};
const EXT = {
  img: 'png jpg jpeg gif webp svg bmp ico', code: 'py js ts sh bash c h cpp go rs java json yaml yml toml html css xml sql php rb lua service timer socket',
  text: 'txt md log csv rst ini', arch: 'zip tar gz tgz xz bz2 7z rar deb zst', media: 'mp4 mkv avi mov mp3 flac wav ogg webm m4a', pdf: 'pdf', cfg: 'conf cfg env rules desktop',
};
function fkind(e) {
  if (e.isdir) return 'dir';
  const x = (e.name.split('.').pop() || '').toLowerCase(); if (!e.name.includes('.')) return /^(readme|license|makefile|dockerfile)/i.test(e.name) ? 'text' : 'file';
  for (const k in EXT) if (EXT[k].split(' ').includes(x)) return k; return 'file';
}
const fico = (e, big) => { const [c, p] = FK[fkind(e)]; return `<svg class="fic ${c}${big ? ' big' : ''}" viewBox="0 0 24 24" aria-hidden="true">${p}${e.type == 'link' ? '<path class="lk" d="M13 20h7v-7M20 20l-6-6"/>' : ''}</svg>` };
const ICBTN = {
  back: '<path d="M15 6l-6 6 6 6"/>', fwd: '<path d="M9 6l6 6-6 6"/>', up: '<path d="M6 15l6-6 6 6"/>', ref: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  list: '<path d="M4 7h16M4 12h16M4 17h16"/>', grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/>', root: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>', disk: '<rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h.01M11 14h6"/>', chev: '<path d="M9 6l6 6-6 6"/>', folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
};
const ib = k => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICBTN[k]}</svg>`;
const ftime = t => new Date(t * 1000).toLocaleString('en-GB', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'});
const joinp = (a, b) => (a.endsWith('/') ? a : a + '/') + b;
const kindName = e => ({dir: 'Folder', img: 'Image', code: 'Source or data', text: 'Text', arch: 'Archive', media: 'Audio or video', pdf: 'PDF document', cfg: 'Configuration', file: 'File'})[fkind(e)] + (e.type == 'link' ? ' (link)' : '');
const FCLIP = window.FCLIP = window.FCLIP || {op: null, items: []};

P.files = () => {
  const coarse = matchMedia('(pointer: coarse)').matches;
  let cwd = localStorage.getItem('pm_fpath') || '', data = null, sortK = localStorage.getItem('pm_fsort') || 'name', sortD = +localStorage.getItem('pm_fsortd') || 1, hidden = localStorage.getItem('pm_fhid') == 1, view = localStorage.getItem('pm_fview') || 'list', q = '';
  let hist = [], hi = -1, sel = new Set(), anchor = null, rows = [], places = [], drag = null;
  const open = new Set(), kids = {};
  main.innerHTML = `<div class="page">${head('Files')}<div class="fm" id="fdrop">
    <aside class="fside" id="fside" aria-label="Places and folders"><div class="fsec">Places</div><div id="places"></div><div class="fsec">Folders</div><div id="tree" role="tree"></div></aside>
    <section class="fmain">
      <div class="ftop"><div class="fnav"><button class="ib" id="fback" title="Back" aria-label="Back">${ib('back')}</button><button class="ib" id="ffwd" title="Forward" aria-label="Forward">${ib('fwd')}</button><button class="ib" id="fup" title="Up one level" aria-label="Up one level">${ib('up')}</button><button class="ib" id="fref" title="Refresh" aria-label="Refresh">${ib('ref')}</button></div>
        <div class="crumbs" id="crumbs" title="Click to type a path"></div><form id="fgo" hidden><input id="fpath" aria-label="Path" spellcheck="false" autocomplete="off"></form>
        <input id="fq" placeholder="Search in folder" aria-label="Search in folder" size="16"><div class="seg" role="radiogroup" aria-label="View"><button type="button" role="radio" data-v="list" aria-label="List view" title="List view">${ib('list')}</button><button type="button" role="radio" data-v="grid" aria-label="Icon view" title="Icon view">${ib('grid')}</button></div></div>
      <div class="facts2"><button class="btn s" data-c="new">New folder</button><button class="btn s" data-c="upload">Upload</button><span class="vsep"></span><button class="btn s" data-c="cut">Cut</button><button class="btn s" data-c="copy">Copy</button><button class="btn s" data-c="paste">Paste</button><span class="vsep"></span><button class="btn s" data-c="open">Open</button><button class="btn s" data-c="download">Download</button><button class="btn s" data-c="rename">Rename</button><button class="btn s danger" data-c="delete">Delete</button><span class="grow"></span><label class="chk"><input type="checkbox" id="fhid"> Hidden files</label><input type="file" id="ffile" multiple hidden></div>
      <div id="fup-prog" class="prog" hidden><div class="meter"><i></i></div><span class="m sm"></span></div>
      <div class="fview ${view}" id="fview" tabindex="0" role="listbox" aria-multiselectable="true" aria-label="Folder contents"></div>
      <div class="fstat muted sm" id="fstat"></div>
    </section></div></div><div class="cmenu" id="cm" role="menu" hidden></div>`;
  const dl = p => '/api/fs/download?path=' + encodeURIComponent(p);
  const byName = n => data.entries.find(e => e.name == n);
  const selEnts = () => rows.filter(e => sel.has(e.name));
  const selPaths = () => selEnts().map(e => joinp(cwd, e.name));

  /* ----- navigation ----- */
  async function go(p, push = true) {
    try {
      const r = await fetch('/api/fs/list?path=' + encodeURIComponent(p)); if (r.status == 401) { location = '/login'; return }
      const d = await r.json(); if (!r.ok) { toast(d.error || 'Cannot open'); if (!data) { return go('/') } return }
      data = d; cwd = d.path; localStorage.setItem('pm_fpath', cwd); if (push) { hist = hist.slice(0, hi + 1); if (hist[hi] != cwd) { hist.push(cwd); hi = hist.length - 1 } }
      sel.clear(); anchor = null; q = ''; $('#fq').value = ''; crumbs(); render(); tree(); nav2();
    } catch (e) { toast('Request failed') }
  }
  const nav2 = () => { $('#fback').disabled = hi <= 0; $('#ffwd').disabled = hi >= hist.length - 1; $('#fup').disabled = !data || !data.parent };
  function crumbs() {
    const parts = cwd.split('/').filter(Boolean); let acc = '';
    $('#crumbs').innerHTML = `<button data-p="/" aria-label="Root">/</button>` + parts.map((x, i) => { acc += '/' + x; return `${i ? '<span class="cs">/</span>' : ''}<button data-p="${esc(acc)}">${esc(x)}</button>` }).join('');
  }
  $('#crumbs').onclick = e => { const b = e.target.closest('[data-p]'); if (b) go(b.dataset.p); else { $('#crumbs').hidden = true; $('#fgo').hidden = false; $('#fpath').value = cwd; $('#fpath').focus(); $('#fpath').select() } };
  $('#fpath').onblur = () => { $('#fgo').hidden = true; $('#crumbs').hidden = false };
  $('#fgo').onsubmit = e => { e.preventDefault(); const v = $('#fpath').value.trim(); $('#fpath').blur(); if (v) go(v) };
  $('#fback').onclick = () => { if (hi > 0) { hi--; go(hist[hi], false) } };
  $('#ffwd').onclick = () => { if (hi < hist.length - 1) { hi++; go(hist[hi], false) } };
  $('#fup').onclick = () => data && data.parent && go(data.parent);
  $('#fref').onclick = () => go(cwd, false);

  /* ----- sidebar ----- */
  async function loadPlaces() {
    try { places = (await get('/api/fs/places')).places } catch (e) { places = [] }
    $('#places').innerHTML = places.map(p => `<button class="pl" data-p="${esc(p.path)}" data-drop="${esc(p.path)}">${ib(p.kind == 'home' ? 'home' : p.kind == 'root' ? 'root' : p.kind == 'disk' ? 'disk' : 'folder')}<span class="pn">${esc(p.name)}</span>${p.kind == 'disk' ? `<span class="muted m xs">${B(p.total - p.used)} free</span>` : ''}</button>`).join('');
  }
  async function kidsOf(p) { if (!kids[p]) { try { const r = await get('/api/fs/list?path=' + encodeURIComponent(p)); kids[p] = r.entries.filter(e => e.isdir && !e.name.startsWith('.')).map(e => e.name).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'})) } catch (e) { kids[p] = [] } } return kids[p] }
  async function tree() {
    let acc = '', parts = cwd.split('/').filter(Boolean); open.add('/'); parts.forEach(x => { open.add(acc || '/'); acc += '/' + x });
    const draw = async (p, depth) => {
      let h = ''; for (const n of await kidsOf(p)) { const c = joinp(p, n), isO = open.has(c); h += `<div class="tn${c == cwd ? ' cur' : ''}" style="--d:${depth}" role="treeitem" aria-expanded="${isO}" data-drop="${esc(c)}"><button class="tc" data-t="${esc(c)}" aria-label="${isO ? 'Collapse' : 'Expand'} ${esc(n)}"><svg class="ic${isO ? ' o' : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICBTN.chev}</svg></button><button class="tl" data-p="${esc(c)}">${esc(n)}</button></div>`; if (isO) h += await draw(c, depth + 1) } return h;
    };
    $('#tree').innerHTML = `<div class="tn${cwd == '/' ? ' cur' : ''}" style="--d:0" data-drop="/"><span class="tc"></span><button class="tl" data-p="/">/ (root)</button></div>` + await draw('/', 1);
  }
  $('#fside').onclick = async e => {
    const t = e.target.closest('[data-t]'); if (t) { const p = t.dataset.t; open.has(p) ? open.delete(p) : open.add(p); tree(); return }
    const b = e.target.closest('[data-p]'); if (b) go(b.dataset.p);
  };

  /* ----- main view ----- */
  function render() {
    rows = data.entries.filter(e => (hidden || !e.name.startsWith('.')) && e.name.toLowerCase().includes(q));
    rows.sort((a, b) => { if (a.isdir != b.isdir) return a.isdir ? -1 : 1; const x = a[sortK], y = b[sortK]; return (typeof x == 'string' ? x.localeCompare(y, undefined, {numeric: true, sensitivity: 'base'}) : x - y) * sortD });
    const v = $('#fview'); v.className = 'fview ' + view;
    document.querySelectorAll('.seg [data-v]').forEach(b => b.setAttribute('aria-checked', b.dataset.v == view));
    const cut = FCLIP.op == 'move' ? new Set(FCLIP.items) : null;
    if (!rows.length) { v.innerHTML = `<div class="empty">${q ? 'Nothing matches your search.' : 'This folder is empty. Drop files here to upload.'}</div>`; stat(); return }
    const th = n => `<button class="th" data-s="${n[0]}" aria-sort="${sortK == n[0] ? (sortD > 0 ? 'ascending' : 'descending') : 'none'}">${n[1]}</button>`;
    const item = e => {
      const img = view == 'grid' && fkind(e) == 'img' && e.size < 6e6 && e.size > 0;
      const pth = joinp(cwd, e.name), ic = img ? `<span class="thumb"><img loading="lazy" alt="" src="${dl(pth)}&inline=1"></span>` : fico(e, view == 'grid');
      const dim = cut && cut.has(pth) ? ' cutd' : '';
      return view == 'grid'
        ? `<div class="it${dim}" role="option" aria-selected="false" draggable="true" data-n="${esc(e.name)}"${e.isdir ? ` data-drop="${esc(pth)}"` : ''}>${ic}<span class="nm">${esc(e.name)}</span></div>`
        : `<div class="it row${dim}" role="option" aria-selected="false" draggable="true" data-n="${esc(e.name)}"${e.isdir ? ` data-drop="${esc(pth)}"` : ''}><span class="nm">${fico(e)}<span class="tx">${esc(e.name)}${e.target ? `<span class="muted m xs"> to ${esc(e.target)}</span>` : ''}</span></span><span class="c r m">${e.isdir ? '' : B(e.size)}</span><span class="c m">${ftime(e.mtime)}</span><span class="c m hide-s">${esc(e.mode)}</span><span class="c m hide-s">${esc(e.owner)}</span></div>`;
    };
    v.innerHTML = (view == 'list' ? `<div class="it hd" role="presentation"><span class="nm">${th(['name', 'Name'])}</span><span class="c r">${th(['size', 'Size'])}</span><span class="c">${th(['mtime', 'Modified'])}</span><span class="c hide-s">Permissions</span><span class="c hide-s">Owner</span></div>` : '') + rows.map(item).join('');
    paint(); stat();
  }
  function paint() { document.querySelectorAll('#fview .it[data-n]').forEach(el => { const s = sel.has(el.dataset.n); el.classList.toggle('sel', s); el.setAttribute('aria-selected', s) }); stat() }
  function stat() {
    const se = selEnts(), dirs = rows.filter(e => e.isdir).length, d = data && data.disk;
    $('#fstat').textContent = se.length ? `${se.length} selected${se.some(e => !e.isdir) ? ', ' + B(se.reduce((a, e) => a + (e.isdir ? 0 : e.size), 0)) : ''}` : `${rows.length - dirs} files, ${dirs} folders${d ? `. ${B(d.free)} free of ${B(d.total)}` : ''}`;
    const one = se.length == 1, any = se.length > 0, f = (c, on) => { const b = document.querySelector(`[data-c=${c}]`); if (b) b.disabled = !on };
    f('open', one); f('download', one && !se[0].isdir); f('rename', one); f('delete', any); f('cut', any); f('copy', any); f('paste', FCLIP.items.length > 0);
  }
  const rowEl = n => document.querySelector(`#fview .it[data-n="${CSS.escape(n)}"]`);
  function select(n, ev) {
    if (ev && ev.shiftKey && anchor != null) { const a = rows.findIndex(e => e.name == anchor), b = rows.findIndex(e => e.name == n); sel = new Set(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map(e => e.name)) }
    else if (ev && (ev.ctrlKey || ev.metaKey)) { sel.has(n) ? sel.delete(n) : sel.add(n); anchor = n }
    else { sel = new Set([n]); anchor = n }
    paint(); const el = rowEl(n); if (el) el.scrollIntoView({block: 'nearest'});
  }
  function activate(e) { if (e.isdir) go(joinp(cwd, e.name)); else view_(joinp(cwd, e.name), e) }

  $('#fview').onclick = e => {
    const th = e.target.closest('.th'); if (th) { const k = th.dataset.s; if (sortK == k) sortD = -sortD; else { sortK = k; sortD = 1 } localStorage.setItem('pm_fsort', sortK); localStorage.setItem('pm_fsortd', sortD); render(); return }
    const it = e.target.closest('.it[data-n]'); if (!it) { if (!e.ctrlKey && !e.shiftKey) { sel.clear(); paint() } return }
    const n = it.dataset.n; if (coarse && !e.ctrlKey) { activate(byName(n)); return } select(n, e); $('#fview').focus({preventScroll: true });
  };
  $('#fview').ondblclick = e => { const it = e.target.closest('.it[data-n]'); if (it && !coarse) activate(byName(it.dataset.n)) };

  /* ----- actions ----- */
  async function view_(p, ent) {
    const d = document.createElement('dialog'); d.className = 'viewer'; d.innerHTML = `<div class="vh"><strong class="m">${esc(ent.name)}</strong><span class="muted m sm">${B(ent.size)}</span><span class="grow"></span><a class="btn s" href="${dl(p)}">Download</a><button class="btn s" type="button" id="vx">Close</button></div><div class="vb" id="vb">${skel(2)}</div>`;
    document.body.appendChild(d); d.showModal(); d.onclose = () => d.remove(); d.querySelector('#vx').onclick = () => d.close(); d.onclick = e => { if (e.target == d) d.close() };
    const vb = d.querySelector('#vb');
    if (fkind(ent) == 'img' && !/\.svg$/i.test(ent.name)) { vb.innerHTML = `<img alt="${esc(ent.name)}" src="${dl(p)}&inline=1">`; return }
    try { const r = await get('/api/fs/read?path=' + encodeURIComponent(p)); vb.innerHTML = r.binary ? `<div class="empty">This is a binary file (${esc(r.mime || 'unknown type')}). Download it to open.</div>` : `<pre class="m"></pre>${r.truncated ? '<div class="muted sm vt">Showing the first 512 KB.</div>' : ''}`; if (!r.binary) vb.querySelector('pre').textContent = r.text } catch (e) { vb.innerHTML = '<div class="empty">Cannot read this file.</div>' }
  }
  function props(e) {
    const d = document.createElement('dialog'); d.innerHTML = `<form method="dialog"><p><strong>${esc(e.name)}</strong></p>${dl2([['Type', kindName(e)], ['Location', esc(cwd)], ['Size', e.isdir ? 'Folder' : B(e.size) + ' (' + NF.format(e.size) + ' bytes)'], ['Modified', ftime(e.mtime)], ['Permissions', esc(e.mode)], ['Owner', esc(e.owner) + ':' + esc(e.group)], ...(e.target ? [['Link target', esc(e.target)]] : [])])}<div class="acts"><button class="btn" value="x">Close</button></div></form>`;
    document.body.appendChild(d); d.onclose = () => d.remove(); d.showModal();
  }
  const dl2 = rows => `<dl class="facts" style="margin-top:var(--space-sm)">${rows.map(([a, b]) => `<dt>${a}</dt><dd class="m" style="overflow-wrap:anywhere">${b}</dd>`).join('')}</dl>`;
  const NF = new Intl.NumberFormat('en');
  async function doDelete() {
    const se = selEnts(); if (!se.length) return; const inTrash = cwd.includes('/.pi-monitor-trash/');
    const what = se.length == 1 ? `"${se[0].name}"${se[0].isdir ? ' and everything inside it' : ''}` : `${se.length} items`;
    const msg = inTrash ? `Permanently delete ${what}? This cannot be undone.` : `Move ${what} to the trash? You can undo this for 7 days.`;
    if (!(await ask(msg, inTrash && se.some(e => e.isdir) ? 'DELETE' : null))) return;
    let bad = [], ids = []; for (const e of se) { const r = await post('/api/fs/delete', {path: joinp(cwd, e.name)}); if (!r.ok) bad.push(e.name + ': ' + r.error); else if (r.undo) ids.push(r.undo) }
    await go(cwd, false);
    if (bad.length) { toast(bad[0]); return }
    const done = se.length == 1 ? 'Moved to trash' : `Moved ${se.length} items to trash`;
    if (!ids.length) { toast('Deleted'); return }
    toastAct(done + '.', 'Undo', async () => { let err = ''; for (const id of ids) { const r = await post('/api/fs/restore', {id}); if (!r.ok) err = r.error } toast(err || 'Restored'); go(cwd, false) });
  }
  async function doRename() { const e = selEnts()[0]; if (!e) return; const v = await textDialog('Rename "' + e.name + '"', 'New name', e.name, 'Rename'); if (v && v != e.name) { const from = e.name, r = await post('/api/fs/rename', {path: joinp(cwd, e.name), name: v}); if (r.ok) toastAct('Renamed.', 'Undo', async () => { const u = await post('/api/fs/rename', {path: joinp(cwd, v), name: from}); toast(u.ok ? 'Name restored' : u.error); go(cwd, false) }); else toast(r.error); await go(cwd, false); if (r.ok) { sel = new Set([v]); paint() } } }
  async function doNew() { const v = await textDialog('New folder in ' + cwd, 'Folder name', 'New folder', 'Create'); if (v) { const r = await post('/api/fs/mkdir', {path: cwd, name: v}); toast(r.ok ? 'Folder created' : r.error); delete kids[cwd]; await go(cwd, false); if (r.ok) { sel = new Set([v]); paint() } } }
  const clip = op => { const it = selPaths(); if (!it.length) return; FCLIP.op = op; FCLIP.items = it; toast((op == 'move' ? 'Cut ' : 'Copied ') + it.length + ' item(s)'); render() };
  async function paste(dest) {
    if (!FCLIP.items.length) return; dest = dest || cwd; const r = await post('/api/fs/paste', {op: FCLIP.op, items: FCLIP.items, dest});
    toast(r.ok ? (FCLIP.op == 'move' ? 'Moved ' : 'Pasted ') + r.done + ' item(s)' : (r.error || r.errors[0])); if (FCLIP.op == 'move' && r.done) FCLIP.items = []; Object.keys(kids).forEach(k => delete kids[k]); go(cwd, false);
  }
  const download = () => { const e = selEnts()[0]; if (e && !e.isdir) location = dl(joinp(cwd, e.name)) };
  const CMD = {new: doNew, upload: () => $('#ffile').click(), cut: () => clip('move'), copy: () => clip('copy'), paste: () => paste(), open: () => { const e = selEnts()[0]; if (e) activate(e) }, download, rename: doRename, delete: doDelete};
  document.querySelector('.facts2').onclick = e => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) CMD[b.dataset.c]() };
  $('#fq').oninput = e => { q = e.target.value.toLowerCase(); sel.clear(); if (data) render() };
  $('#fhid').checked = hidden; $('#fhid').onchange = e => { hidden = e.target.checked; localStorage.setItem('pm_fhid', hidden ? 1 : 0); if (data) render() };
  document.querySelector('.seg').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; view = b.dataset.v; localStorage.setItem('pm_fview', view); if (data) render() };

  /* ----- context menu ----- */
  const cm = $('#cm');
  const hideCm = () => { cm.hidden = true };
  $('#fview').oncontextmenu = e => {
    e.preventDefault(); const it = e.target.closest('.it[data-n]');
    if (it && !sel.has(it.dataset.n)) select(it.dataset.n); else if (!it) { sel.clear(); paint() }
    const se = selEnts(), one = se.length == 1, items = it ? [
      one && ['Open', 'open'], one && !se[0].isdir && ['Download', 'download'], null, ['Cut', 'cut'], ['Copy', 'copy'], one && se[0].isdir && FCLIP.items.length && ['Paste into folder', 'pasteInto'], null, one && ['Rename', 'rename'], ['Delete', 'delete'], one && ['Properties', 'props']
    ] : [['New folder', 'new'], ['Upload files', 'upload'], FCLIP.items.length && ['Paste', 'paste'], null, ['Refresh', 'ref']];
    let h = '', last = 'sep'; items.filter(x => x !== false).forEach(x => { if (x === null) { if (last != 'sep') h += '<hr>'; last = 'sep' } else { h += `<button role="menuitem" data-m="${x[1]}">${x[0]}</button>`; last = 'i' } });
    cm.innerHTML = h.replace(/<hr>$/, ''); cm.hidden = false; const w = cm.offsetWidth, ht = cm.offsetHeight; cm.style.left = Math.min(e.clientX, innerWidth - w - 8) + 'px'; cm.style.top = Math.min(e.clientY, innerHeight - ht - 8) + 'px'; cm.querySelector('button').focus();
  };
  cm.onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; hideCm(); const m = b.dataset.m; if (m == 'props') props(selEnts()[0]); else if (m == 'ref') go(cwd, false); else if (m == 'pasteInto') paste(joinp(cwd, selEnts()[0].name)); else CMD[m]() };
  const offCm = e => { if (!cm.contains(e.target)) hideCm() }; document.addEventListener('pointerdown', offCm); addEventListener('blur', hideCm);
  cm.onkeydown = e => { if (e.key == 'Escape') { hideCm(); $('#fview').focus() } else if (e.key == 'ArrowDown' || e.key == 'ArrowUp') { const bs = [...cm.querySelectorAll('button')], i = bs.indexOf(document.activeElement); bs[(i + (e.key == 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); e.preventDefault() } };

  /* ----- keyboard ----- */
  $('#fview').onkeydown = e => {
    const mod = e.ctrlKey || e.metaKey, k = e.key; if (!rows.length && !['v', 'V'].includes(k)) return;
    const idx = rows.findIndex(r => r.name == (e.shiftKey ? anchor : [...sel].pop())), cols = view == 'grid' ? Math.max(1, Math.floor($('#fview').clientWidth / (document.querySelector('#fview .it[data-n]') || {offsetWidth: 120}).offsetWidth)) : 1;
    const move = d => { const cur = rows.findIndex(r => sel.has(r.name)); const n = Math.max(0, Math.min((cur < 0 ? (d > 0 ? -1 : rows.length) : (e.shiftKey ? rows.findIndex(r => r.name == [...sel].pop()) : cur)) + d, rows.length - 1)); const el = rows[n].name; if (e.shiftKey) { if (anchor == null) anchor = el; const a = rows.findIndex(r => r.name == anchor); sel = new Set(rows.slice(Math.min(a, n), Math.max(a, n) + 1).map(r => r.name)); paint(); (rowEl(el) || {scrollIntoView() {}}).scrollIntoView({block: 'nearest'}) } else select(el); e.preventDefault() };
    if (k == 'ArrowDown') move(cols); else if (k == 'ArrowUp') move(-cols); else if (k == 'ArrowRight' && view == 'grid') move(1); else if (k == 'ArrowLeft' && view == 'grid') move(-1);
    else if (k == 'Home') { select(rows[0].name); e.preventDefault() } else if (k == 'End') { select(rows[rows.length - 1].name); e.preventDefault() }
    else if (k == 'Enter') { CMD.open(); e.preventDefault() } else if (k == 'Backspace' || (e.altKey && k == 'ArrowUp')) { $('#fup').click(); e.preventDefault() } else if (e.altKey && k == 'ArrowLeft') { $('#fback').click(); e.preventDefault() } else if (e.altKey && k == 'ArrowRight') { $('#ffwd').click(); e.preventDefault() }
    else if (k == 'Delete') { doDelete(); e.preventDefault() } else if (k == 'F2') { doRename(); e.preventDefault() } else if (k == 'Escape') { sel.clear(); paint() }
    else if (mod && k.toLowerCase() == 'a') { sel = new Set(rows.map(r => r.name)); paint(); e.preventDefault() } else if (mod && k.toLowerCase() == 'c') { clip('copy'); e.preventDefault() } else if (mod && k.toLowerCase() == 'x') { clip('move'); e.preventDefault() } else if (mod && k.toLowerCase() == 'v') { paste(); e.preventDefault() }
  };

  /* ----- drag: internal move or copy, external upload ----- */
  const dz = $('#fdrop'); let dropEl = null;
  const clearDrop = () => { document.querySelectorAll('.dropt').forEach(x => x.classList.remove('dropt')); dropEl = null };
  dz.addEventListener('dragstart', e => { const it = e.target.closest('.it[data-n]'); if (!it) return; if (!sel.has(it.dataset.n)) select(it.dataset.n); drag = selPaths(); e.dataTransfer.setData('text/plain', drag.join('\n')); e.dataTransfer.effectAllowed = 'copyMove' });
  dz.addEventListener('dragend', () => { drag = null; clearDrop(); dz.classList.remove('drag') });
  dz.addEventListener('dragover', e => {
    e.preventDefault(); const t = e.target.closest('[data-drop]'); const ext = [...(e.dataTransfer.types || [])].includes('Files');
    if (ext) { dz.classList.add('drag'); if (t) { clearDrop(); t.classList.add('dropt') } return }
    if (!drag) return; e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
    const ok = t && !drag.includes(t.dataset.drop) && !drag.some(p => t.dataset.drop.startsWith(p + '/')); if (t != dropEl) { clearDrop(); if (ok) { t.classList.add('dropt'); dropEl = t } }
  });
  dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) { dz.classList.remove('drag'); clearDrop() } });
  dz.addEventListener('drop', e => {
    e.preventDefault(); const t = e.target.closest('[data-drop]'), dest = t ? t.dataset.drop : null; dz.classList.remove('drag'); clearDrop();
    if ([...(e.dataTransfer.types || [])].includes('Files')) { doUpload(e.dataTransfer.files, dest || cwd); return }
    if (!drag || !dest) return; if (drag.includes(dest) || drag.some(p => dest.startsWith(p + '/'))) return;
    const saved = [FCLIP.op, FCLIP.items]; FCLIP.op = e.ctrlKey ? 'copy' : 'move'; FCLIP.items = drag; paste(dest).then(() => { if (saved[0] && FCLIP.items.length == 0) { FCLIP.op = saved[0]; FCLIP.items = saved[1] } });
  });

  /* ----- upload ----- */
  function upload(files, overwrite, dest) {
    return new Promise(res => {
      const fd = new FormData(); fd.append('path', dest); if (overwrite) fd.append('overwrite', '1'); files.forEach(f => fd.append('files', f));
      const pr = $('#fup-prog'), bar = pr.querySelector('.meter i'), tx = pr.querySelector('span'), x = new XMLHttpRequest(); pr.hidden = false; bar.style.transform = 'scaleX(0)';
      x.upload.onprogress = e => { if (e.lengthComputable) { bar.style.transform = `scaleX(${e.loaded / e.total})`; tx.textContent = `Uploading ${B(e.loaded)} of ${B(e.total)}` } };
      x.onload = () => { pr.hidden = true; let r = {}; try { r = JSON.parse(x.responseText) } catch (e) { r = {ok: false, error: x.status == 413 ? 'File too large' : 'Upload failed'} } res(r) };
      x.onerror = () => { pr.hidden = true; res({ok: false, error: 'Upload failed'}) };
      x.open('POST', '/api/fs/upload'); x.setRequestHeader('X-Requested-With', 'PiMonitor'); x.send(fd);
    });
  }
  async function doUpload(files, dest) {
    files = [...files]; if (!files.length) return; dest = dest || cwd; let r = await upload(files, false, dest);
    if (!r.ok) { toast(r.error || 'Upload failed'); go(cwd, false); return }
    if (r.skipped && r.skipped.length && await ask(r.skipped.length + ' file(s) already exist (' + r.skipped.slice(0, 3).join(', ') + (r.skipped.length > 3 ? ', ...' : '') + '). Overwrite them?')) { const r2 = await upload(files.filter(f => r.skipped.includes(f.name)), true, dest); r.saved = (r.saved || []).concat(r2.saved || []) }
    toast((r.saved || []).length ? 'Uploaded ' + r.saved.length + ' file(s)' : 'Nothing uploaded'); go(cwd, false);
  }
  $('#ffile').onchange = e => { doUpload(e.target.files); e.target.value = '' };
  const unhook = new MutationObserver(() => { if (!document.body.contains(dz)) { document.removeEventListener('pointerdown', offCm); unhook.disconnect() } }); unhook.observe(document.body, {childList: true, subtree: true});
  loadPlaces(); go(cwd || (localStorage.getItem('pm_fpath') ? localStorage.getItem('pm_fpath') : ''));
};
