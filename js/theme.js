/* WareTrack – light / dark theme. Dark mode is the park by moonlight: a night sky and cool, dim light. The choice is remembered; until one is
   made the system preference is followed. Toggle with the map toolbar button or N. */
(function () {
  const W = WT.W, KEY = 'waretrack-theme';
  // Day is a hazy summer afternoon; night is moonlit, with a dark sky and cool, dim light. Materials keep their
  // real colours either way: only the sky, the sun / moon and the light they bounce around change.
  const LOOK = {
    light: { sky: WT.LOOK.SKY.day, hemiSky: 0xcfe0ff, hemiGround: 0x4a4234, hemi: 0.25, sun: 0xfff1dc, sunI: 2.6, exposure: 1.0, ripple: 0xe8f0f6, night: 0, puff: 1 },
    dark: { sky: WT.LOOK.SKY.night, hemiSky: 0x6d82b8, hemiGround: 0x101318, hemi: 0.06, sun: 0x9fb4ff, sunI: 0.32, exposure: 1.1, ripple: 0x3a4c66, night: 1, puff: 0.22 },
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
    WT.setSky(L.sky);
    WT.renderer.toneMappingExposure = L.exposure;
    WT.lights.hemi.color.setHex(L.hemiSky); WT.lights.hemi.groundColor.setHex(L.hemiGround); WT.lights.hemi.intensity = L.hemi;
    WT.lights.sun.color.setHex(L.sun); WT.lights.sun.intensity = L.sunI;
    if (W.rippleMat) W.rippleMat.color.setHex(L.ripple);
    WT.LOOK.night.value = L.night; WT.LOOK.puffShade = L.puff;
    WT.emit('theme', mode);
  };
  Theme.toggle = () => Theme.set(Theme.mode === 'dark' ? 'light' : 'dark');

  Theme.set(stored() || (system && system.matches ? 'dark' : 'light'), false);
  // follow the system setting live, unless a choice has been made here
  if (system && system.addEventListener) system.addEventListener('change', (e) => { if (!stored()) Theme.set(e.matches ? 'dark' : 'light', false); });
  window.addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT' && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n') Theme.toggle(); });
})();
