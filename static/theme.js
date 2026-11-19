/* Loaded in <head> so the saved look is applied before first paint. */
window.ACCENTS = [['amber', 80, 'Amber'], ['cyan', 205, 'Cyan'], ['green', 150, 'Green'], ['lime', 120, 'Lime'], ['rose', 15, 'Rose'], ['coral', 45, 'Coral']];
window.SET_DEFAULT = {theme: 'dark', accent: 'amber', density: 'normal', text: 'normal', h24: true, secs: true, tz: 'server'};
window.getSet = () => { try { return Object.assign({}, SET_DEFAULT, JSON.parse(localStorage.getItem('pm_set') || '{}')) } catch (e) { return Object.assign({}, SET_DEFAULT) } };
window.applySet = s => {
  const r = document.documentElement, dark = s.theme == 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : s.theme != 'light';
  r.dataset.theme = dark ? 'dark' : 'light'; r.dataset.density = s.density; r.dataset.text = s.text;
  const a = ACCENTS.find(x => x[0] == s.accent) || ACCENTS[0]; r.style.setProperty('--h', a[1]);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#1c1f24' : '#f4f5f7';
};
window.saveSet = s => { localStorage.setItem('pm_set', JSON.stringify(s)); applySet(s) };
applySet(getSet());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applySet(getSet()));
