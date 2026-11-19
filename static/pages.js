/* Settings, Files, and the clock helpers. Loaded after the shell script, before dashboard.js. */
let SERVER_TZ = null;
const tzOf = s => s.tz == 'device' ? undefined : s.tz == 'server' ? (SERVER_TZ || undefined) : s.tz;
const tzFmt = (s, o) => new Intl.DateTimeFormat('en-GB', Object.assign({timeZone: tzOf(s)}, o));
function clockParts(s, d) {
  const p = {}; tzFmt(s, {hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'}).formatToParts(d).forEach(x => p[x.type] = x.value);
  return {h: +p.hour % 24, m: +p.minute, s: +p.second};
}
function digitalText(s, d) {
  const o = {hour: '2-digit', minute: '2-digit', hourCycle: s.h24 ? 'h23' : 'h12'}; if (s.secs) o.second = '2-digit';
  const parts = tzFmt(s, o).formatToParts(d), pick = t => (parts.find(x => x.type == t) || {}).value || '';
  return {hm: pick('hour') + ':' + pick('minute'), sec: s.secs ? pick('second') : '', ap: s.h24 ? '' : pick('dayPeriod').toUpperCase()};
}
const ANALOG = (() => {
  let t = ''; for (let i = 0; i < 60; i++) { const a = i * 6 * Math.PI / 180, big = i % 5 == 0, r1 = big ? 41 : 44, x = Math.sin(a), y = -Math.cos(a); t += `<line x1="${(x * r1).toFixed(2)}" y1="${(y * r1).toFixed(2)}" x2="${(x * 47).toFixed(2)}" y2="${(y * 47).toFixed(2)}" class="${big ? 'tk big' : 'tk'}"/>` }
  return `<svg viewBox="-50 -50 100 100" class="analog" role="img" aria-label="Analog clock"><circle r="49" class="face"/>${t}<line class="hh" x1="0" y1="3" x2="0" y2="-26"/><line class="mh" x1="0" y1="4" x2="0" y2="-38"/><g class="sh"><line x1="0" y1="10" x2="0" y2="-41"/></g><circle r="2.6" class="cap"/></svg>`;
})();
function startClock(root) {
  const hh = root.querySelector('.hh'), mh = root.querySelector('.mh'), sh = root.querySelector('.sh'), hm = root.querySelector('.dg-hm'), sc = root.querySelector('.dg-s'), ap = root.querySelector('.dg-ap'), dt = root.querySelector('.dg-date'), zn = root.querySelector('.dg-zone');
  let last = -1, base = {h: 0, m: 0, s: 0}, S = getSet();
  const frame = () => {
    if (!root.isConnected) return;
    const now = Date.now(), sec = Math.floor(now / 1000);
    if (sec != last) {
      last = sec; S = getSet(); base = clockParts(S, new Date(now)); const d = new Date(now), t = digitalText(S, d);
      hm.textContent = t.hm; sc.textContent = t.sec ? ':' + t.sec : ''; ap.textContent = t.ap; sh.style.display = S.secs ? '' : 'none';
      dt.textContent = tzFmt(S, {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}).format(d);
      const nm = S.tz == 'server' ? (SERVER_TZ || 'Pi time') : S.tz == 'device' ? Intl.DateTimeFormat().resolvedOptions().timeZone : S.tz;
      zn.textContent = nm.replace(/_/g, ' ') + (S.tz == 'server' ? ' (Pi)' : '');
    }
    const f = (now % 1000) / 1000, s = base.s + f, m = base.m + s / 60, h = (base.h % 12) + m / 60;
    sh.style.transform = `rotate(${(S.secs ? s * 6 : 0).toFixed(2)}deg)`; mh.style.transform = `rotate(${(m * 6).toFixed(2)}deg)`; hh.style.transform = `rotate(${(h * 30).toFixed(2)}deg)`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
const clockPanel = () => `<div class="panel clockp"><h2>Time</h2><div class="clk">${ANALOG}<div class="dg"><div class="dg-t m"><span class="dg-hm"></span><span class="dg-s"></span><span class="dg-ap"></span></div><div class="dg-date"></div><div class="dg-zone muted m"></div></div></div></div>`;

/* ---------- settings ---------- */
P.settings = () => {
  const S = getSet(), zones = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC']);
  const seg = (key, opts) => `<div class="seg" role="radiogroup" data-k="${key}">${opts.map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(S[key]) == String(v)}">${l}</button>`).join('')}</div>`;
  const row = (t, d, ctl) => `<div class="srow"><div><div class="st">${t}</div><div class="sd muted">${d}</div></div><div>${ctl}</div></div>`;
  main.innerHTML = `<div class="page">${head('Settings')}
  <div class="surface"><div class="head"><h2>Appearance</h2></div><div class="sbody">
    ${row('Theme', 'Dark graphite, light paper, or follow this device.', seg('theme', [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']]))}
    ${row('Accent colour', 'Used for selection, primary actions and the active page.', `<div class="swatches" role="radiogroup" data-k="accent">${ACCENTS.map(([k, h, l]) => `<button type="button" role="radio" class="sw2" data-v="${k}" aria-checked="${S.accent == k}" style="--h:${h}"><i></i><span>${l}</span></button>`).join('')}</div>`)}
    ${row('Density', 'Spacing and table row height.', seg('density', [['compact', 'Compact'], ['normal', 'Normal'], ['spacious', 'Spacious']]))}
    ${row('Text size', 'Scales all text and controls.', seg('text', [['small', 'Small'], ['normal', 'Default'], ['large', 'Large']]))}
  </div></div>
  <div class="surface"><div class="head"><h2>Clock</h2></div><div class="sbody">
    ${row('Time format', 'Applies to the digital clock.', seg('h24', [[true, '24-hour'], [false, '12-hour']]))}
    ${row('Seconds', 'Show the second hand and seconds.', seg('secs', [[true, 'Show'], [false, 'Hide']]))}
    ${row('Time zone', 'The Pi follows its own system zone. Pick any other to compare.', `<select id="tzs" aria-label="Time zone"><option value="server">Pi system time zone</option><option value="device">This device</option>${zones.map(z => `<option value="${z}">${z.replace(/_/g, ' ')}</option>`).join('')}</select>`)}
    <div class="clockwrap">${clockPanel()}</div>
  </div></div>
  <div class="srow end"><span class="muted sm">Saved in this browser only. Other devices keep their own settings.</span><button class="btn" id="rst" type="button">Reset to defaults</button></div></div>`;
  $('#tzs').value = S.tz; startClock(main.querySelector('.clockp'));
  const upd = (k, v) => { const n = getSet(); n[k] = v; saveSet(n) };
  main.querySelectorAll('[data-k]').forEach(g => g.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; let v = b.dataset.v; if (v == 'true') v = true; if (v == 'false') v = false; upd(g.dataset.k, v); g.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-checked', x == b)) });
  $('#tzs').onchange = e => upd('tz', e.target.value);
  $('#rst').onclick = () => { saveSet(Object.assign({}, SET_DEFAULT)); P.settings() };
};

function textDialog(title, label, value, ok) {
  return new Promise(res => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog"><p>${esc(title)}</p><input name="v" aria-label="${esc(label)}" autocomplete="off" style="width:100%"><div class="acts"><button class="btn" value="no" type="submit">Cancel</button><button class="btn primary" value="yes" type="submit">${esc(ok)}</button></div></form>`;
    document.body.appendChild(d); const i = d.querySelector('input'); i.value = value || '';
    d.onclose = () => { const v = i.value.trim(); d.remove(); res(d.returnValue == 'yes' && v ? v : null) };
    d.showModal(); i.focus(); i.select();
  });
}

get('/api/stats').then(s => { SERVER_TZ = s.tz || null }).catch(() => {});
