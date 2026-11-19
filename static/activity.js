/* Activity: the audit log. Every sign-in, state change and vault access, newest first. */
P.activity = () => {
  let rows = [], chain = null, filt = '';
  main.innerHTML = `<div class="page">${head('Activity')}<div id="live">
    <div id="cn" class="notice" hidden></div>
    <div class="surface"><div class="head"><div><h2>Audit log</h2><div class="muted sm" id="as">Reading the log</div></div>
      <div class="acts"><input id="aq" placeholder="Filter activity" size="22" aria-label="Filter activity"><button class="btn" type="button" id="ar">Refresh</button></div></div>
      <div id="ab"><div class="loading">${skel(3)}</div></div></div></div></div>`;
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
  async function load() { const r = await get('/api/audit'); if (page != 'activity') return; rows = r.entries; chain = r.chain; draw() }
  $('#aq').oninput = e => { filt = e.target.value; draw() };
  $('#ar').onclick = () => load().then(() => toast('Refreshed'));
  load().catch(e => { if (e !== 0) $('#ab').innerHTML = errbox(e) });
  const t = setInterval(() => { if (page == 'activity') load().catch(() => {}) }, 10000); timers.push(t);
};
