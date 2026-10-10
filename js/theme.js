/* WareTrack – light / dark theme. Dark mode is a moonlit park: dark ground, roads and water, cooler and dimmer
   light, while buildings, vehicles and road markings keep their colours. The choice is remembered; until one is
   made the system preference is followed. Toggle with the map toolbar button or N. */
(function () {
  const M = WT.M, W = WT.W, KEY = 'waretrack-theme';
  // ground surfaces (W.COL and a few lane / shoreline greys) → their night colours
  const NIGHT = {
    0xe8ebfa: 0x1b2133, // ground
    0xcdd3f0: 0x343c58, // road
    0xdde1f5: 0x2a3149, // apron
    0xd8ddf2: 0x2c3350, // concrete
    0xdfe3f5: 0x262d44, // plot pad
    0xadc9f3: 0x16294a, // water
    0xc9c6d6: 0x3a3746, // ballast
    0xbfc5e2: 0x3a4260, // runway, courier lanes
    0xdfe2f2: 0x2e3448, // shoreline
  };
  const LOOK = {
    light: { clear: 0xe8ebfa, sky: 0xffffff, ground: 0xb4bbe0, hemi: 0.74, sun: 0xffffff, sunI: 0.5, ripple: 0xd6e5fb },
    dark: { clear: 0x121726, sky: 0x9fb0ff, ground: 0x1a2036, hemi: 0.55, sun: 0xcfd9ff, sunI: 0.42, ripple: 0x2b4470 },
  };
  const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const system = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const Theme = (WT.Theme = { mode: 'light' });
  Theme.set = (mode, remember = true) => {
    Theme.mode = mode = mode === 'dark' ? 'dark' : 'light';
    if (remember) { try { localStorage.setItem(KEY, mode); } catch { /* private mode: just don't persist */ } }
    document.body.classList.toggle('dark', mode === 'dark');
    document.documentElement.style.colorScheme = mode;
    const L = LOOK[mode];
    M.tint = mode === 'dark' ? (c) => (NIGHT[c] !== undefined ? NIGHT[c] : c) : null;
    M.retint();
    WT.renderer.setClearColor(L.clear);
    WT.lights.hemi.color.setHex(L.sky); WT.lights.hemi.groundColor.setHex(L.ground); WT.lights.hemi.intensity = L.hemi;
    WT.lights.sun.color.setHex(L.sun); WT.lights.sun.intensity = L.sunI;
    if (W.rippleMat) W.rippleMat.color.setHex(L.ripple);
    WT.emit('theme', mode);
  };
  Theme.toggle = () => Theme.set(Theme.mode === 'dark' ? 'light' : 'dark');

  Theme.set(stored() || (system && system.matches ? 'dark' : 'light'), false);
  // follow the system setting live, unless a choice has been made here
  if (system && system.addEventListener) system.addEventListener('change', (e) => { if (!stored()) Theme.set(e.matches ? 'dark' : 'light', false); });
  window.addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT' && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n') Theme.toggle(); });
})();
