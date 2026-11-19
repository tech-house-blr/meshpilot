/* Phone UX: bottom tab bar state, pull to refresh, service worker registration. */
(() => {
  const syncTabs = () => { const p = location.hash.slice(1) || 'dashboard'; document.querySelectorAll('.tabs a').forEach(a => a.dataset.p == p ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')) };
  addEventListener('hashchange', syncTabs); syncTabs();
  const more = document.getElementById('tabmore');
  if (more) more.onclick = () => { const o = document.getElementById('side').classList.toggle('open'); more.setAttribute('aria-expanded', o); document.getElementById('tog').setAttribute('aria-expanded', o) };
  document.addEventListener('click', e => { const s = document.getElementById('side'); if (s.classList.contains('open') && matchMedia('(max-width: 60rem)').matches && !e.target.closest('#side,#tog,#tabmore')) { s.classList.remove('open'); if (more) more.setAttribute('aria-expanded', false) } });

  /* pull to refresh: only on touch, only when the page is scrolled to the top, never on the desktop canvas or inner scrollers */
  const m = document.getElementById('main'), ind = document.createElement('div'); ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true'); ind.innerHTML = '<svg class="ic" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg>'; document.body.appendChild(ind);
  let y0 = null, dy = 0; const MAX = 90, TRIG = 64;
  const blocked = t => !!t.closest('#dscr,.fm,.tw,pre,textarea,input,select,dialog,.cmenu') || (typeof page != 'undefined' && page == 'desktop');
  m.addEventListener('touchstart', e => { y0 = (m.scrollTop <= 0 && e.touches.length == 1 && !blocked(e.target)) ? e.touches[0].clientY : null; dy = 0 }, {passive: true});
  m.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy <= 0) return; const d = Math.min(MAX, dy * 0.5); ind.style.transition = 'none'; ind.style.opacity = Math.min(1, d / TRIG); ind.style.transform = `translate(-50%, ${d}px) rotate(${d * 4}deg)`; ind.classList.toggle('ready', d >= TRIG * 0.9) }, {passive: true});
  const end = () => { if (y0 == null) return; const go = Math.min(MAX, dy * 0.5) >= TRIG * 0.9; y0 = null; ind.style.transition = ''; ind.classList.remove('ready'); if (go) { ind.classList.add('spin'); ind.style.opacity = 1; ind.style.transform = 'translate(-50%, 56px)'; try { nav() } catch (e) {} setTimeout(() => { ind.classList.remove('spin'); ind.style.opacity = 0; ind.style.transform = '' }, 700) } else { ind.style.opacity = 0; ind.style.transform = '' } };
  m.addEventListener('touchend', end, {passive: true}); m.addEventListener('touchcancel', end, {passive: true});

  if ('serviceWorker' in navigator && (location.protocol == 'https:' || location.hostname == 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
