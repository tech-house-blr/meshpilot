/* UI rule audit. Evaluate in the page after it settles; returns an array of violations. */
(() => {
  const out = [], add = (rule, el, msg) => out.push({rule, el: (el.tagName || '').toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className == 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), msg});
  if (location.pathname == '/login') return [{rule: 'auth', el: 'page', msg: 'redirected to login, audit invalid'}];
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility != 'hidden' && s.display != 'none' && +s.opacity > 0 && !e.closest('[hidden],dialog:not([open])') };
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/); if (!m) return null; if (m[2]) { const p = m[2].split(/[ /]+/).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1] } const p = m[1].split(/[ ,\/]+/).map(Number); return [p[0], p[1], p[2], p[3] ?? 1] };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b) };
  const bgOf = e => { let layers = []; for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= .99) break } } let base = [0, 0, 0]; for (const c of layers.reverse()) base = base.map((v, i) => i < 3 ? c[i] * c[3] + v * (1 - c[3]) : 1); return base };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) };
  const touch = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  // 1 text contrast, min size
  const seen = new Set();
  document.querySelectorAll('#main *, header *, nav *').forEach(e => {
    if (![...e.childNodes].some(n => n.nodeType == 3 && n.textContent.trim()) || !vis(e)) return;
    const s = getComputedStyle(e), fg = parse(s.color); if (!fg) return; const bg = bgOf(e);
    const f = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    const size = parseFloat(s.fontSize), big = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700), need = big ? 3 : 4.5, ratio = cr(f, bg);
    if (ratio < need) { const k = e.className + s.color; if (!seen.has(k)) { seen.add(k); add('contrast', e, `${ratio.toFixed(2)}:1 needs ${need} (${s.color} on rgb(${bg.map(Math.round)}))`) } }
    if (size < 11.5) add('min-text', e, size + 'px');
  });
  // 2 target size
  document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[tabindex]:not([tabindex="-1"])').forEach(e => {
    if (!vis(e) || (/^(checkbox|radio)$/.test(e.type) && e.closest('label'))) return; const r = e.getBoundingClientRect(), min = touch ? 40 : 24;
    if (r.width < min - .5 || r.height < min - .5) { if (e.closest('.seg,.fm')&&r.height>=min&&r.width>=min-6) return; add('target-size', e, `${Math.round(r.width)}x${Math.round(r.height)} needs ${min}`) }
  });
  // 3 names
  document.querySelectorAll('button,a[href],[role=button]').forEach(e => { if (vis(e) && !(e.textContent.trim() || e.getAttribute('aria-label') || e.title || e.getAttribute('aria-labelledby'))) add('name', e, 'no accessible name') });
  document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(e => { if (vis(e) && !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.id && document.querySelector(`label[for="${e.id}"]`)) || e.closest('label'))) add('name', e, 'form field without label') });
  document.querySelectorAll('svg[role=img]:not([aria-label])').forEach(e => add('name', e, 'svg img without label'));
  // 4 structure
  if (document.querySelectorAll('h1').length != 1) add('headings', document.body, 'h1 count ' + document.querySelectorAll('h1').length);
  const ids = {}; document.querySelectorAll('[id]').forEach(e => ids[e.id] = (ids[e.id] || 0) + 1); Object.entries(ids).filter(([, n]) => n > 1).forEach(([k]) => add('dup-id', document.body, k));
  if (!document.querySelector('main,[role=main]')) add('landmark', document.body, 'no main landmark');
  if (!document.documentElement.lang) add('lang', document.documentElement, 'missing lang');
  // 5 overflow
  if (document.documentElement.scrollWidth > innerWidth + 1) add('overflow-x', document.body, `page ${document.documentElement.scrollWidth} > viewport ${innerWidth}`);
  // 6 emoji
  const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}]/u; if (emo.test([...document.querySelectorAll('body *:not(pre):not(.logv):not(code)')].filter(e=>e.children.length==0&&!e.closest('pre,.log,#out')).map(e=>e.textContent).join(' '))) add('emoji', document.body, 'emoji in UI text');
  // 7 focus indicator
  const st = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText) } catch { return [] } }).join('\n');
  if (/outline\s*:\s*(none|0)\b/.test(st) && !/focus-visible/.test(st)) add('focus', document.body, 'outline removed without focus-visible style');
  // 8 reduced motion
  if (!/prefers-reduced-motion/.test(st)) add('motion', document.body, 'no reduced-motion handling');
  // 9 transition all / layout animation
  if (/transition[^;{}]*\b(width|height|top|left)\b/.test(st.replace(/\.side\s*\{[^}]*\}/g, ''))) add('motion', document.body, 'layout property transitioned (use transform)');
  return out;
})()
