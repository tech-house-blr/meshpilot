/* Dashboard: verdict, gauge, rotor, linked small multiples with a shared time cursor, command palette. */
const NF = new Intl.NumberFormat('en');
const RATE = v => B(v) + '/s';
const RANGE_LIST = [['5m', '5m', '5 min'], ['30m', '30m', '30 min'], ['6h', '6h', '6 hours'], ['24h', '24h', '24 hours'], ['7d', '7d', '7 days']];
const RANGE_MS = {'5m': 5000, '30m': 10000, '6h': 30000, '24h': 60000, '7d': 120000};
const MET = {
  temp: {name: 'CPU temperature', series: [{k: 'temp', c: 'var(--color-cool)', l: 'Average'}, {k: 'temp_max', c: 'var(--color-ink-2)', faint: 1, l: 'Peak'}], fmt: v => v.toFixed(1) + ' °C', ax: v => v.toFixed(0), pad: 2},
  fan: {name: 'Fan speed', series: [{k: 'fan', c: 'var(--color-ink-2)', l: 'Speed'}], fmt: v => NF.format(Math.round(v)) + ' rpm', ax: v => NF.format(Math.round(v)), pad: 100},
  cpu: {name: 'CPU usage', series: [{k: 'cpu', c: 'var(--color-cool)', l: 'Average'}, {k: 'cpu_max', c: 'var(--color-ink-2)', faint: 1, l: 'Peak'}], fmt: v => v.toFixed(0) + ' %', ax: v => v.toFixed(0) + '%', dom: [0, 100]},
  ram: {name: 'Memory used', series: [{k: 'ram', c: 'var(--color-cool)', l: 'Used'}], fmt: v => v.toFixed(0) + ' %', ax: v => v.toFixed(0) + '%', dom: [0, 100]},
  net: {name: 'Network throughput', series: [{k: 'rx', c: 'var(--color-cool)', l: 'Received'}, {k: 'tx', c: 'var(--color-accent)', l: 'Sent'}], fmt: RATE, ax: v => B(v), st: v => B(v) + '/s', zero: 1},
  load: {name: 'Load average, 1 minute', series: [{k: 'load', c: 'var(--color-cool)', l: 'Load'}], fmt: v => v.toFixed(2), ax: v => v.toFixed(1), zero: 1},
};
const ORDER = ['temp', 'fan', 'cpu', 'ram', 'net', 'load'];
const tval = {
  temp: s => s.temp == null ? null : MET.temp.fmt(s.temp),
  fan: s => s.fan == null ? null : MET.fan.fmt(s.fan),
  cpu: s => s.cpu == null ? null : MET.cpu.fmt(s.cpu),
  ram: s => s.ram == null ? null : MET.ram.fmt(s.ram),
  net: s => s.rx == null ? null : `${RATE(s.rx)}<small>in</small> ${RATE(s.tx)}<small>out</small>`,
  load: s => s.load == null ? null : MET.load.fmt(s.load),
};

function niceTicks(lo, hi, n) {
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), nm = raw / mag;
  const step = (nm < 1.5 ? 1 : nm < 3 ? 2 : nm < 7 ? 5 : 10) * mag, out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
function domain(m, pts) {
  if (m.dom) return m.dom;
  const vals = [];
  m.series.forEach(s => pts.forEach(p => { if (p[s.k] != null) vals.push(p[s.k]) }));
  if (!vals.length) return [0, 1];
  let lo = m.zero ? 0 : Math.min(...vals) - (m.pad || 0), hi = Math.max(...vals) + (m.pad || 0);
  if (hi - lo < (m.pad ? 10 : 1e-6)) hi = lo + (m.pad ? 10 : 1);
  hi += (hi - lo) * 0.08;
  return [lo, hi];
}
function linePath(pts, k, x, y, gap) {
  let d = '', prev = null;
  pts.forEach(p => { if (p[k] == null) { prev = null; return } const cmd = (prev == null || p.t - prev > gap) ? 'M' : 'L'; d += cmd + x(p.t).toFixed(1) + ' ' + y(p[k]).toFixed(1); prev = p.t });
  return d;
}
const clock = (t, span, full) => {
  const d = new Date(t * 1000), hm = d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', ...(full ? {second: '2-digit'} : {})});
  return span > 86400 ? d.toLocaleDateString('en-GB', {weekday: 'short'}) + ' ' + hm : hm;
};
function nearest(pts, t, tol) {
  let best = null, bd = 1e12;
  for (const p of pts) { const dd = Math.abs(p.t - t); if (dd < bd) { bd = dd; best = p } }
  return best && bd <= tol ? best : null;
}
function verdict(s) {
  let lvl = 0; const why = [];
  const bump = (l, t) => { lvl = Math.max(lvl, l); why.push(t) };
  const fl = parseInt((s.throttled || '').split('=')[1] || '0', 16) || 0;
  if (s.temp != null && s.temp >= 80) bump(2, `CPU at ${s.temp.toFixed(0)} °C, at the throttling limit`);
  else if (s.temp != null && s.temp >= 70) bump(1, `CPU warm at ${s.temp.toFixed(0)} °C`);
  if (fl & 1) bump(2, 'Under-voltage right now. Check the power supply');
  if (fl & 4) bump(2, 'Throttled right now');
  if (fl & 2) bump(2, 'ARM frequency capped right now');
  if (fl & 8) bump(1, 'Soft temperature limit active');
  if (fl & 0x10000) bump(1, 'Under-voltage occurred since boot');
  if (fl & 0x40000) bump(1, 'Throttling occurred since boot');
  if (s.temp > 60 && s.fan === 0) bump(1, 'CPU is warm and the fan reads 0 rpm');
  if (s.ram.percent > 90) bump(1, `Memory ${s.ram.percent.toFixed(0)}% used`);
  const full = s.disks.filter(d => d.percent > 90);
  if (full.length) bump(1, `${full.map(d => d.mount).join(', ')} over 90% full`);
  return {lvl, word: ['Nominal', 'Attention', 'Critical'][lvl], why: why.length ? why : ['No throttling, no under-voltage, temperatures and memory within limits.']};
}
const ARC = Math.PI * 70;
function gaugeHTML(t) {
  const lo = 20, hi = 90, f = t == null ? 0 : Math.max(0, Math.min((t - lo) / (hi - lo), 1));
  const col = t >= 80 ? 'var(--color-bad)' : t >= 70 ? 'var(--color-accent)' : 'var(--color-cool)';
  const pt = v => { const a = Math.PI * (1 - (v - lo) / (hi - lo)); return [80 + 78 * Math.cos(a), 90 - 78 * Math.sin(a)] };
  const [x7, y7] = pt(70), [x8, y8] = pt(80);
  return `<div class="gauge"><svg viewBox="0 0 160 104" role="img" aria-label="Temperature gauge, ${t == null ? 'no reading' : t.toFixed(1) + ' degrees'}"><path d="M10 90 A70 70 0 0 1 150 90" class="gbg"/><path d="M10 90 A70 70 0 0 1 150 90" class="gfg" style="stroke:${col};stroke-dasharray:${ARC};stroke-dashoffset:${ARC * (1 - f)}"/><text x="${x7}" y="${y7}" class="gtick" text-anchor="middle">70</text><text x="${x8}" y="${y8 - 2}" class="gtick" text-anchor="middle">80</text><text x="4" y="102" class="gtick">20</text><text x="156" y="102" class="gtick" text-anchor="end">90</text></svg><div class="gval"><span class="reading lg">${t == null ? 'n/a' : t.toFixed(1)}</span><small class="muted">°C</small></div></div>`;
}
const ROTOR = (() => { let b = ''; for (let i = 0; i < 5; i++) b += `<path d="M0 -6 C 9 -9, 22 -20, 17 -33 C 8 -35, -2 -26, 0 -6Z" transform="rotate(${i * 72})"/>`; return `<svg viewBox="-40 -40 80 80" class="rotor" aria-hidden="true"><circle r="38" class="rim"/><circle r="34" class="disc"/><g class="wedges">${b}</g><g class="blades">${b}</g><circle r="5" class="hub"/></svg>` })();

P.dashboard = () => {
  let rng = localStorage.getItem('pm_range'), fm = localStorage.getItem('pm_metric');
  if (!RANGE_MS[rng]) rng = '30m'; if (!MET[fm]) fm = 'temp';
  let HS = null, S = null, over = 0, t0 = 0, t1 = 1, geo = null, curT = null, hist = null;
  main.innerHTML = `<div class="page">${head('Dashboard', '<span class="m muted" id="sysline"></span>')}<div id="live">
  <div class="panels cols-4">
    <div class="panel span2" id="vd"><h2>Status</h2>${skel(3)}</div>
    <div class="panel"><h2>CPU temperature</h2><div id="gauge"></div></div>
    <div class="stackc"><div class="panel"><h2>Fan</h2><div class="fanbox">${ROTOR}<div><div class="reading" id="fan">...</div><div class="sub" id="fanl"></div></div></div></div>${clockPanel()}</div>
  </div>
  <div class="surface"><div class="head"><h2 id="fname"></h2><div class="acts"><span class="m muted sm" id="cur"></span><div class="seg" role="radiogroup" aria-label="Time range">${RANGE_LIST.map(([k, l, f]) => `<button type="button" role="radio" data-r="${k}" aria-label="${f}" aria-checked="${k == rng}">${l}</button>`).join('')}</div></div></div>
    <div class="focus" id="focus"><svg id="fsvg" aria-hidden="true"></svg><div class="hair" id="fh" hidden></div><div class="tip m" id="tip" hidden></div></div>
    <div class="legend" id="fleg"></div></div>
  <div class="panels cols-3 tiles" id="tiles">${ORDER.map(k => `<button type="button" class="tile" data-m="${k}" aria-pressed="${k == fm}"><span class="tn">${MET[k].name}</span><span class="tv m" data-v="${k}">...</span><span class="spark"><svg viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true"></svg><span class="hair" hidden></span></span><span class="tr m"></span></button>`).join('')}</div>
  <div class="panels cols-3 row2c">
    <div class="panel"><h2>Cores</h2><div class="cores" id="cores"></div></div>
    <div class="panel"><h2>Memory</h2><div id="mem"></div></div>
    <div class="panel"><h2>System</h2><div id="si"></div></div>
  </div>
  <div class="surface"><div class="head"><h2>File systems</h2></div><div id="fs">${skel(2)}</div></div>
  <div class="surface"><div class="head"><h2>Busiest processes</h2><a class="btn s" href="#processes">All processes</a></div><div class="tw short"><table class="stack"><thead><tr><th>PID</th><th>Name</th><th>User</th><th class="r">CPU %</th><th class="r">Memory %</th></tr></thead><tbody id="pr"></tbody></table></div></div>
  </div></div>`;
  startClock(main.querySelector('.clockp'));
  const focusEl = $('#focus'), svg = $('#fsvg'), tip = $('#tip'), fh = $('#fh');
  const live = () => S ? {temp: S.temp, fan: S.fan, cpu: S.cpu, ram: S.ram.percent, rx: S.net.rx, tx: S.net.tx, load: S.load[0]} : {};

  function drawFocus() {
    const m = MET[fm]; $('#fname').textContent = m.name;
    if (!HS || !HS.points.length) { svg.innerHTML = ''; focusEl.dataset.empty = 1; $('#fleg').textContent = 'Collecting samples. The first points appear within a few seconds.'; return }
    delete focusEl.dataset.empty;
    const pts = HS.points, W = focusEl.clientWidth || 700, Ht = focusEl.clientHeight || 260, L = 54, R = 12, T = 12, Bm = 26, gap = HS.step * 3;
    let [lo, hi] = domain(m, pts); const ticks = niceTicks(lo, hi, 4);
    if (!m.dom) { lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]) }
    const x = t => L + (t - t0) / (t1 - t0) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (Ht - T - Bm);
    geo = {W, L, R, x};
    let g = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" class="ax" text-anchor="end">${m.ax(v)}</text>`).join('');
    const nt = W < 520 ? 2 : 4; for (let i = 0; i <= nt; i++) { const t = t0 + (t1 - t0) * i / nt; g += `<text x="${x(t).toFixed(1)}" y="${Ht - 6}" class="ax" text-anchor="${i == 0 ? 'start' : i == nt ? 'end' : 'middle'}">${clock(t, HS.span, t1 - t0 < 900)}</text>` }
    const prim = m.series[0];
    const area = linePath(pts, prim.k, x, y, gap);
    const areaD = area ? area.split('M').filter(Boolean).map(seg => { const c = seg.split('L'); const first = c[0].split(' ')[0], last = c[c.length - 1].split(' ')[0]; return `M${seg.replace(/L/g, 'L')}L${last} ${y(lo).toFixed(1)}L${first} ${y(lo).toFixed(1)}Z` }).join('') : '';
    g += `<path d="${areaD}" class="area" style="fill:${prim.c}"/>`;
    m.series.slice().reverse().forEach(s => { g += `<path d="${linePath(pts, s.k, x, y, gap)}" class="ln${s.faint ? ' faint' : ''}" style="stroke:${s.c}"/>` });
    const last = pts[pts.length - 1];
    if (last && last[prim.k] != null) g += `<circle cx="${x(last.t).toFixed(1)}" cy="${y(last[prim.k]).toFixed(1)}" r="3.5" class="now" style="fill:${prim.c}"/>`;
    g += `<circle id="fdot" r="4" class="dot" hidden/>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${Ht}`); svg.innerHTML = g; geo.y = y; geo.lo = lo; geo.hi = hi;
    $('#fleg').innerHTML = m.series.map(s => `<span><i class="sw${s.faint ? ' faint' : ''}" style="background:${s.c}"></i>${s.l}</span>`).join('') + `<span>Samples every ${HS.step} s, ${RANGE_LIST.find(r => r[0] == rng)[2]} window</span>`;
  }
  function drawSparks() {
    if (!HS) return; const pts = HS.points, gap = HS.step * 3;
    ORDER.forEach(k => {
      const m = MET[k], el = $(`.tile[data-m=${k}]`), sv = el.querySelector('svg');
      if (!pts.length) { sv.innerHTML = ''; return }
      const [lo, hi] = domain(m, pts), sp = Math.max(hi - lo, 1e-9);
      const x = t => (t - t0) / (t1 - t0) * 200, y = v => 4 + (1 - (v - lo) / sp) * 36;
      const prim = m.series.filter(s => !s.faint);
      const a = linePath(pts, prim[0].k, x, y, gap);
      let d = prim.map(s => `<path d="${linePath(pts, s.k, x, y, gap)}" class="sl" style="stroke:${s.c}"/>`).join('');
      sv.innerHTML = `<path d="${a}" class="sl-fill" style="stroke:none;fill:none"/>` + d;
      const vals = pts.map(p => p[prim[0].k]).filter(v => v != null);
      if (vals.length) { const mn = Math.min(...vals), mx = Math.max(...vals), av = vals.reduce((p, c) => p + c, 0) / vals.length; el.querySelector('.tr').textContent = `min ${(m.st || m.ax)(mn)}  avg ${(m.st || m.ax)(av)}  max ${(m.st || m.ax)(mx)}` }
    });
  }
  function readouts() {
    let src = live(), nopt = false;
    if (curT != null && HS) { const p = nearest(HS.points, curT, HS.step * 2); if (p) src = p; else nopt = true }
    ORDER.forEach(k => { const e = $(`[data-v=${k}]`); const v = nopt ? null : tval[k](src); e.innerHTML = v == null ? '<span class="muted">no data</span>' : v });
    const frac = curT == null ? null : (curT - t0) / (t1 - t0);
    document.querySelectorAll('.tile .hair').forEach(h => { h.hidden = frac == null || frac < 0 || frac > 1; if (!h.hidden) h.style.left = (frac * 100) + '%' });
    $('#cur').textContent = curT == null ? 'Live' : clock(curT, HS ? HS.span : 0, true);
    const dot = $('#fdot'), m = MET[fm];
    if (curT == null || !geo || !geo.y || !HS) { fh.hidden = true; tip.hidden = true; if (dot) dot.hidden = true; return }
    const p = nearest(HS.points, curT, HS.step * 2);
    if (!p) { fh.hidden = true; tip.hidden = true; if (dot) dot.hidden = true; return }
    const px = geo.x(p.t); fh.hidden = false; fh.style.left = px + 'px';
    const prim = m.series[0]; if (dot && p[prim.k] != null) { dot.hidden = false; dot.setAttribute('cx', px); dot.setAttribute('cy', geo.y(p[prim.k])); dot.style.fill = prim.c }
    tip.hidden = false;
    tip.innerHTML = `<div class="muted">${clock(p.t, HS.span, true)}</div>` + m.series.filter(s => p[s.k] != null).map(s => `<div><span class="muted">${s.l}</span> ${m.fmt(p[s.k])}</div>`).join('');
    tip.style.transform = `translateX(${px > geo.W * 0.6 ? px - tip.offsetWidth - 12 : px + 12}px)`;
  }
  function setFromEvent(ev, el, padL, padR) {
    if (!HS) return; const r = el.getBoundingClientRect(), f = Math.max(0, Math.min((ev.clientX - r.left - padL) / (r.width - padL - padR), 1));
    curT = t0 + f * (t1 - t0); readouts();
  }
  const leave = () => { over = 0; curT = null; readouts() };
  focusEl.onpointermove = e => { over = 1; setFromEvent(e, focusEl, geo ? geo.L : 0, geo ? geo.R : 0) }; focusEl.onpointerleave = leave;
  document.querySelectorAll('.tile .spark').forEach(sp => { sp.onpointermove = e => { over = 1; setFromEvent(e, sp, 0, 0) }; sp.onpointerleave = leave });
  $('#tiles').onclick = e => { const b = e.target.closest('.tile'); if (!b) return; fm = b.dataset.m; localStorage.setItem('pm_metric', fm); document.querySelectorAll('.tile').forEach(t => t.setAttribute('aria-pressed', t == b)); drawFocus(); readouts() };
  document.querySelector('.seg').onclick = e => { const b = e.target.closest('[data-r]'); if (!b || b.dataset.r == rng) return; rng = b.dataset.r; localStorage.setItem('pm_range', rng); document.querySelectorAll('.seg [data-r]').forEach(x => x.setAttribute('aria-checked', x == b)); HS = null; loadHist(true) };
  async function loadHist(force) {
    const h = await get('/api/history?range=' + rng); if (page != 'dashboard' || (over && !force)) return;
    HS = h; if (h.points.length) { t1 = h.points[h.points.length - 1].t; t0 = Math.max(t1 - h.span, h.points[0].t); if (t1 - t0 < 60) t0 = t1 - 60 } drawFocus(); drawSparks(); readouts();
  }
  const ro = new ResizeObserver(() => { if (page != 'dashboard') return ro.disconnect(); if (HS) { drawFocus(); readouts() } }); ro.observe(focusEl);
  const setM = (id, p, hot = 85) => { const e = $(id); e.classList.toggle('hot', p > hot); e.firstElementChild.style.transform = 'scaleX(' + Math.max(0, Math.min(p, 100)) / 100 + ')' };
  /* rotor: true speed while slow enough to read as motion; above ~120 rpm blades dissolve into a soft disc, since 60 Hz cannot show a real 2,900 rpm fan without aliasing */
  let rpmTarget = 0, rpmNow = 0, ang = 0, lastTs = 0;
  const blades = document.querySelector('.rotor .blades'), wedges = document.querySelector('.rotor .wedges'), disc = document.querySelector('.rotor .disc'), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spin = ts => {
    if (page != 'dashboard') return;
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0; lastTs = ts;
    rpmNow += (rpmTarget - rpmNow) * Math.min(1, dt * 2.5);
    ang = (ang + Math.min(rpmNow, 120) * 6 * dt) % 360;
    const sharp = Math.max(0, Math.min((300 - rpmNow) / 180, 1)), tr = `rotate(${ang.toFixed(2)}deg)`;
    blades.style.transform = tr; wedges.style.transform = tr;
    blades.style.opacity = sharp; wedges.style.opacity = (1 - sharp) * 0.3; disc.style.opacity = (1 - sharp) * 0.22;
    requestAnimationFrame(spin);
  };
  if (!still) requestAnimationFrame(spin);
  let n = 0;
  timers.push(setInterval(() => loadHist().catch(() => {}), RANGE_MS[rng]));
  loadHist(true).catch(() => {});
  every(async () => {
    const s = await get('/api/stats'); SERVER_TZ = s.tz || SERVER_TZ; if (page != 'dashboard') return; S = s; const v = verdict(s);
    $('#sysline').textContent = s.model || '';
    $('#vd').innerHTML = `<h2>Status</h2><div class="verd l${v.lvl}">${v.word}</div><ul class="why">${v.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>${dl([['Uptime', T(s.uptime)], ['Load 1, 5, 15 min', s.load.map(x => x.toFixed(2)).join('  ')], ['CPU clock', s.freq ? NF.format(s.freq) + ' MHz' : 'n/a'], ['Processes', s.nproc]])}`;
    $('#gauge').innerHTML = gaugeHTML(s.temp);
    $('#fan').innerHTML = s.fan != null ? NF.format(s.fan) + '<small>rpm</small>' : 'n/a';
    $('#fanl').textContent = s.fan == null ? 'No tachometer found' : s.fan === 0 ? 'Stopped' : '';
    rpmTarget = s.fan || 0;
    $('#cores').innerHTML = s.cores.map((c, i) => `<div class="core"><div class="cb${c > 85 ? ' hot' : ''}"><i style="transform:scaleY(${Math.max(0, Math.min(c, 100)) / 100})"></i></div><span class="m">${c.toFixed(0)}%</span><span class="m muted">Core ${i}</span></div>`).join('');
    $('#mem').innerHTML = `<div class="reading">${(s.ram.used / 1073741824).toFixed(2)}<small>of ${(s.ram.total / 1073741824).toFixed(1)} GB</small></div>${meter(s.ram.percent)}<div class="row2"><span class="muted">Swap</span><span class="m">${B(s.swap.used)} of ${B(s.swap.total)}</span></div>${meter(s.swap.percent)}`;
    $('#si').innerHTML = dl([['Host', esc(s.hostname)], ['OS', esc(s.os)], ['Kernel', esc(s.kernel)], ['Network total in', B(s.net.rx_total)], ['Network total out', B(s.net.tx_total)]]);
    $('#fs').innerHTML = s.disks.length ? s.disks.map(d => `<div class="fs"><div class="t"><span>${esc(d.mount)} <span class="muted m">${esc(d.dev)}</span> <span class="muted m">${esc(d.fs)}</span></span><span class="m">${B(d.used)} of ${B(d.total)}, ${d.percent}%</span></div>${meter(d.percent)}</div>`).join('') : '<div class="empty">No mounted file systems found.</div>';
    $('#hn').textContent = s.hostname; $('#clock').textContent = s.time;
    if (!over) readouts();
    if (n++ % 2 == 0) { const p = (await get('/api/processes')).procs.slice(0, 8); if (page != 'dashboard') return; $('#pr').innerHTML = p.map(x => `<tr><td class="m" data-l="PID">${x.pid}</td><td data-l="Name">${esc(x.name)}</td><td data-l="User">${esc(x.user)}</td><td class="r m" data-l="CPU %">${x.cpu}</td><td class="r m" data-l="Memory %">${x.mem}</td></tr>`).join('') }
  }, 3000);
};

/* command palette */
(() => {
  const dlg = document.createElement('dialog'); dlg.id = 'pal'; dlg.setAttribute('aria-label', 'Jump to');
  dlg.innerHTML = '<input id="pq" autocomplete="off" placeholder="Jump to a page or run an action" aria-label="Jump to"><ul id="pl" role="listbox"></ul>';
  document.body.appendChild(dlg);
  const pages = ['dashboard', 'processes', 'services', 'updates', 'logs', 'storage', 'files', 'network', 'users', 'power', 'settings'];
  const cmds = [...pages.map(p => ({n: 'Go to ' + p[0].toUpperCase() + p.slice(1), f: () => { location.hash = p }})),
    {n: 'Check for updates', f: async () => { const r = await post('/api/updates/run', {action: 'refresh'}); toast(r.ok ? 'Started' : 'Failed: ' + r.error); location.hash = 'updates' }},
    {n: 'Log out', f: () => { location = '/logout' }}];
  let sel = 0, list = cmds;
  const draw = () => { $('#pl').innerHTML = list.length ? list.map((c, i) => `<li role="option" aria-selected="${i == sel}" data-i="${i}">${esc(c.n)}</li>`).join('') : '<li class="muted">Nothing matches</li>' };
  const open = () => { $('#pq').value = ''; list = cmds; sel = 0; draw(); dlg.showModal(); $('#pq').focus() };
  const run = i => { const c = list[i]; if (!c) return; dlg.close(); c.f() };
  $('#pq').oninput = e => { const q = e.target.value.toLowerCase(); list = cmds.filter(c => c.n.toLowerCase().includes(q)); sel = 0; draw() };
  $('#pq').onkeydown = e => { if (e.key == 'ArrowDown') { sel = Math.min(sel + 1, list.length - 1); draw(); e.preventDefault() } else if (e.key == 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault() } else if (e.key == 'Enter') run(sel) };
  $('#pl').onclick = e => { const li = e.target.closest('[data-i]'); if (li) run(+li.dataset.i) };
  dlg.addEventListener('click', e => { if (e.target == dlg) dlg.close() });
  addEventListener('keydown', e => { const t = e.target.tagName; if ((e.key == 'k' && (e.ctrlKey || e.metaKey)) || (e.key == '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(t))) { e.preventDefault(); open() } });
  const b = document.getElementById('jump'); if (b) b.onclick = open;
})();
nav();
