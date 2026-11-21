/* Machines: every node on the mesh, what it is, and what Mesh Pilot can do with it. */
P.machines = () => {
  let list = [], errs = {}, filt = '';
  const OSN = {linux: 'Linux', windows: 'Windows', macos: 'macOS', android: 'Android', ios: 'iOS'};
  main.innerHTML = `<div class="page">${head('Machines')}<div id="live">
    <div id="merr" class="notice" hidden></div>
    <div class="surface"><div class="head"><div><h2 id="mt">Mesh</h2><div class="muted sm" id="ms">Reading the mesh</div></div>
      <div class="acts"><input id="mq" placeholder="Filter machines" size="22" aria-label="Filter machines"><button class="btn" type="button" id="mr">Refresh</button></div></div>
      <div id="mb"><div class="loading">${skel(3)}</div></div></div></div></div>`;
  // One chip per protocol that is not ruled out. Colour shows how sure we are; the tooltip shows the evidence and who may use it.
  const CAPCLS = {available: 'ok', authenticated: 'ok', detected: 'amber', error: 'bad'};
  const caps = m => {
    const c = m.capabilities || []; if (!c.length) return '<span class="muted">not scanned</span>';
    const shown = c.filter(x => x.state != 'unavailable' && x.state != 'unknown');
    if (!shown.length) return '<span class="muted">none found</span>';
    return shown.map(x => {
      const tip = `${x.state}${x.fresh ? '' : ' (stale)'}: ${x.evidence}${x.detail ? ' [' + x.detail + ']' : ''}. ${x.authorization.allowed ? 'You may use it.' : x.authorization.reason}`;
      return `<span class="chip ${CAPCLS[x.state] || ''}" title="${esc(tip)}">${esc(x.protocol.toUpperCase())}${x.state == 'detected' ? ' ?' : ''}</span>`;
    }).join(' ');
  };
  const draw = () => {
    const q = filt.toLowerCase(), rows = list.filter(m => !q || (m.name + m.os + m.owner).toLowerCase().includes(q));
    const on = list.filter(m => m.online).length;
    $('#mt').textContent = `${list.length} machine${list.length == 1 ? '' : 's'}`; $('#ms').textContent = `${on} online`;
    $('#merr').hidden = !Object.keys(errs).length; $('#merr').textContent = Object.entries(errs).map(([k, v]) => `${k}: ${v}`).join('. ');
    $('#mb').innerHTML = !rows.length ? '<div class="empty">No machines match.</div>' : `<div class="tw"><table class="stack"><thead><tr><th>Name</th><th>System</th><th>Status</th><th>Owner</th><th>Address</th><th>Protocols</th><th><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${rows.map(m => {
      const st = m.is_self ? chip('this machine', 'ok') : m.online ? chip('online', 'ok') : chip('offline');
      const acc = m.owned ? 'Yours' : esc(m.owner || 'Shared');
      return `<tr><td data-l="Name"><strong>${esc(m.name)}</strong></td><td data-l="System">${esc(OSN[m.os] || m.os)}</td><td data-l="Status">${st}</td><td class="muted" data-l="Owner">${acc}${m.owned ? '' : ' ' + chip('view only')}</td><td class="m muted" data-l="Address">${esc(m.addresses[0] || '')}</td><td data-l="Protocols">${caps(m)}</td><td class="r" data-l="">${m.controllable && !m.is_self ? `<button class="btn s" type="button" data-scan="${esc(m.id)}">Scan</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  };
  async function load(force) {
    const r = await get('/api/machines' + (force ? '?force=1' : '')); if (page != 'machines') return;
    list = r.machines; errs = r.errors; draw();
  }
  $('#mb').onclick = async e => {
    const b = e.target.closest('[data-scan]'); if (!b) return; b.disabled = true; b.textContent = 'Scanning';
    try { const r = await post('/api/machines/probe', {id: b.dataset.scan}); if (r.error) toast(r.error); else { const m = list.find(x => String(x.id) == b.dataset.scan); if (m) m.capabilities = r.capabilities } } catch { toast('Scan failed') }
    draw();
  };
  $('#mq').oninput = e => { filt = e.target.value; draw() };
  $('#mr').onclick = () => load(true).then(() => toast('Refreshed'));
  load().catch(e => { if (e !== 0) $('#mb').innerHTML = errbox(e) });
  const t = setInterval(() => { if (page == 'machines') load().catch(() => {}) }, 10000); timers.push(t);
};
