/* Activity: the audit log (every sign-in, state change and vault access, newest first) and the signed-in sessions. */
P.activity = () => {
  let rows = [], chain = null, filt = '';
  main.innerHTML = `<div class="page">${head('Activity')}<div id="live">
    <div id="cn" class="notice" hidden></div>
    <div class="surface"><div class="head"><div><h2>Audit log</h2><div class="muted sm" id="as">Reading the log</div></div>
      <div class="acts"><input id="aq" placeholder="Filter activity" size="22" aria-label="Filter activity"><button class="btn" type="button" id="ar">Refresh</button></div></div>
      <div id="ab"><div class="loading">${skel(3)}</div></div></div>
    <div class="surface"><div class="head"><div><h2>Signed-in sessions</h2><div class="muted sm" id="ss">Reading sessions</div></div>
      <div class="acts"><button class="btn danger" type="button" id="so" disabled>Sign out all others</button></div></div>
      <div id="sb"></div></div></div></div>`;
  const when = t => t ? new Date(t * 1000).toLocaleString() : '';
  const det = d => Object.entries(d || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ');
  const draw = () => {
    const q = filt.toLowerCase(), list = rows.filter(e => !q || (e.event + e.ip + e.outcome + det(e.detail)).toLowerCase().includes(q));
    $('#as').textContent = `${rows.length} recent entr${rows.length == 1 ? 'y' : 'ies'}`;
    $('#cn').hidden = !chain || chain.ok;
    if (chain && !chain.ok) $('#cn').textContent = `The log chain is broken at line ${chain.broken_at}. An entry was edited or removed.`;
    $('#ab').innerHTML = !list.length ? '<div class="empty">No activity yet.</div>' : `<div class="tw"><table class="stack"><thead><tr><th>Time</th><th>Event</th><th>Result</th><th>From</th><th>Detail</th></tr></thead><tbody>${list.map(e =>
      `<tr><td class="muted" data-l="Time">${esc(when(e.ts))}</td><td data-l="Event"><strong>${esc(e.event)}</strong></td><td data-l="Result">${chip(e.outcome, e.outcome == 'ok' ? 'ok' : '')}</td><td class="m muted" data-l="From">${esc(e.ip || '')}</td><td class="muted" data-l="Detail">${esc(det(e.detail))}</td></tr>`).join('')}</tbody></table></div>`;
  };
  const ago = t => { const s = Math.max(0, Date.now() / 1000 - t); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' d ago' };
  const drawSessions = r => {
    const l = r.sessions, others = l.filter(x => !x.current).length;
    $('#ss').textContent = `${l.length} active · idle limit ${Math.round(r.idle / 60)} min · hard limit ${Math.round(r.maximum / 3600)} h`;
    $('#so').disabled = !others;
    $('#sb').innerHTML = `<div class="tw"><table class="stack"><thead><tr><th>Device</th><th>From</th><th>Signed in</th><th>Last active</th><th>Ends by</th><th></th></tr></thead><tbody>${l.map(x =>
      `<tr><td data-l="Device"><strong>${esc(x.label || 'Unknown')}</strong>${x.current ? ' ' + chip('this device', 'ok') : ''}</td><td class="muted" data-l="From">${esc(x.ip || '')}</td><td class="muted" data-l="Signed in">${esc(when(x.created))}</td><td class="muted" data-l="Last active">${esc(ago(x.last_seen))}</td><td class="muted" data-l="Ends by">${esc(when(x.expires))}</td><td>${x.current ? '' : `<button class="btn s danger" type="button" data-r="${esc(x.ref)}">Sign out</button>`}</td></tr>`).join('')}</tbody></table></div>`;
    $('#sb').querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { b.disabled = true; try { await post('/api/sessions/revoke', {id: b.dataset.r}); toast('Signed out'); loadSessions() } catch (e) { if (e !== 0) toast('Could not sign out'); b.disabled = false } });
  };
  async function loadSessions() { const r = await get('/api/sessions'); if (page != 'activity') return; drawSessions(r) }
  $('#so').onclick = async () => { $('#so').disabled = true; try { const r = await post('/api/sessions/revoke-others', {}); toast(`Signed out ${r.revoked} other session${r.revoked == 1 ? '' : 's'}`); loadSessions() } catch (e) { if (e !== 0) toast('Could not sign out'); loadSessions().catch(() => {}) } };
  async function load() { const r = await get('/api/audit'); if (page != 'activity') return; rows = r.entries; chain = r.chain; draw() }
  $('#aq').oninput = e => { filt = e.target.value; draw() };
  $('#ar').onclick = () => Promise.all([load(), loadSessions()]).then(() => toast('Refreshed'));
  load().catch(e => { if (e !== 0) $('#ab').innerHTML = errbox(e) });
  loadSessions().catch(e => { if (e !== 0) $('#sb').innerHTML = errbox(e) });
  const t = setInterval(() => { if (page == 'activity') { load().catch(() => {}); loadSessions().catch(() => {}) } }, 10000); timers.push(t);
};
