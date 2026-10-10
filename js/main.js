/* WareTrack – renderer, perspective orbit camera, sky, picking, overlays, main loop */
(function () {
  const T = THREE;
  const canvas = document.getElementById('scene');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  WT.renderer = renderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const LK = WT.LOOK;

  const scene = (WT.scene = new T.Scene());
  const hemi = new T.HemisphereLight(0xcfe0ff, 0x4a4234, 0.25);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff1dc, 2.6);
  WT.lights = { hemi, sun }; // theme.js retunes these for night
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 2600;
  scene.add(sun, sun.target);
  const SUN_DIR = (WT.SUN_DIR = new T.Vector3(-50, 62, 60).normalize());
  scene.fog = new T.Fog(0xc5d6e4, 400, 4000);

  /* ---------- sky + image-based lighting ---------- */
  const skyGeo = new T.SphereGeometry(1, 48, 24);
  const sky = new T.Mesh(skyGeo, LK.skyMaterial());
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  scene.add(sky);
  const pmrem = new T.PMREMGenerator(renderer);
  const envScene = new T.Scene();
  const envSky = new T.Mesh(skyGeo, LK.skyMaterial());
  envSky.scale.setScalar(50);
  envScene.add(envSky);
  let envRT = null;
  // look: LK.SKY.day | night — repaints the sky and re-bakes the light it casts on everything
  WT.setSky = (look) => {
    LK.setSky(sky.material, look, SUN_DIR);
    LK.setSky(envSky.material, look, SUN_DIR);
    scene.fog.color.setHex(look.haze);
    renderer.setClearColor(look.haze);
    const rt = pmrem.fromScene(envScene, 0, 0.1, 100);
    scene.environment = rt.texture;
    if (envRT) envRT.dispose();
    envRT = rt;
  };
  WT.setSky(LK.SKY.day);

  /* ---------- camera ---------- */
  // a perspective camera orbiting a ground target: view.size is the height of ground framed at the target
  const FOV = 34, TANH = Math.tan((FOV * Math.PI) / 360);
  const cam = (WT.camera = new T.PerspectiveCamera(FOV, 1, 1, 10000));
  const HOME = { tx: -40, tz: -70, size: 300, yaw: Math.PI / 4, pitch: 0.58 };
  const view = (WT.view = Object.assign({}, HOME));
  const goal = Object.assign({}, HOME);
  WT.follow = null;
  let shadowSize = 0;
  const PITCH_MIN = 0.12, PITCH_MAX = 1.45;

  function applyCamera() {
    const w = canvas.clientWidth, h = canvas.clientHeight, aspect = w / Math.max(1, h);
    const d = view.size / 2 / TANH, cp = Math.cos(view.pitch);
    cam.aspect = aspect;
    cam.position.set(view.tx + d * cp * Math.sin(view.yaw), d * Math.sin(view.pitch), view.tz + d * cp * Math.cos(view.yaw));
    if (cam.position.y < 1.6) cam.position.y = 1.6;
    cam.lookAt(view.tx, 0, view.tz);
    cam.near = Math.max(0.3, d * 0.02);
    cam.far = d * 6 + 9000;
    cam.updateProjectionMatrix();
    sky.position.copy(cam.position);
    sky.scale.setScalar(cam.far * 0.9);
    scene.fog.near = d * 0.8 + 250;
    scene.fog.far = d * 3.2 + 3800;
    // shadows cover the framed ground, reaching further out the lower the camera looks
    const ss = WT.clamp((view.size * aspect * 0.7) / Math.max(0.45, Math.sin(view.pitch)), 80, 1100);
    if (Math.abs(ss - shadowSize) > ss * 0.06) {
      shadowSize = ss;
      const c = sun.shadow.camera;
      c.left = -ss; c.right = ss; c.top = ss; c.bottom = -ss;
      c.updateProjectionMatrix();
    }
    // centre the shadow box a little beyond the target, where a perspective view shows more ground
    const fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw), ahead = ss * 0.3 * Math.cos(view.pitch);
    const sx = view.tx + fx * ahead, sz = view.tz + fz * ahead;
    sun.target.position.set(sx, 0, sz);
    sun.position.set(sx + SUN_DIR.x * 1200, SUN_DIR.y * 1200, sz + SUN_DIR.z * 1200);
  }
  WT.camGoal = (o) => {
    if (o.x !== undefined) { goal.tx = o.x; goal.tz = o.z; }
    if (o.size) goal.size = WT.clamp(o.size, 22, 1600);
    if (o.pitch) goal.pitch = WT.clamp(o.pitch, PITCH_MIN, PITCH_MAX);
    if (o.yaw !== undefined) goal.yaw = goal.yaw + WT.angDiff(goal.yaw, o.yaw);
    if (o.yawDelta) goal.yaw += o.yawDelta;
  };
  const manual = () => WT.Cinema && WT.Cinema.userInput();
  WT.flyTo = (x, z, size, yaw) => { WT.follow = null; WT.camGoal({ x, z, size, yaw }); };
  WT.zoomBy = (f) => { manual(); goal.size = WT.clamp(goal.size * f, 22, 1600); };
  WT.rotate = (dir) => { manual(); goal.yaw += (dir * Math.PI) / 2; };
  WT.home = () => { manual(); WT.flyTo(HOME.tx, HOME.tz, HOME.size); goal.pitch = HOME.pitch; };

  function resize() {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    applyCamera();
  }
  window.addEventListener('resize', resize);

  /* ---------- input ---------- */
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  function setNdc(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  function groundAt(e) {
    setNdc(e);
    ray.setFromCamera(ndc, cam);
    const p = new T.Vector3();
    return ray.ray.intersectPlane(groundPlane, p) ? p : null;
  }
  function pick(e) {
    setNdc(e);
    ray.setFromCamera(ndc, cam);
    const hits = ray.intersectObjects([...WT.pickables], true);
    for (const h of hits) {
      const ent = WT.findEntity(h.object);
      if (ent) return ent;
    }
    return null;
  }

  const pointers = new Map();
  let drag = null, pinch = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), size: goal.size };
      drag = null;
    } else drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, rotate: e.button === 2 };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      manual();
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      goal.size = view.size = WT.clamp((pinch.size * pinch.d) / Math.max(10, d), 22, 1600);
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (!drag.moved) return;
      manual();
      if (drag.rotate) { goal.yaw = view.yaw -= dx * 0.006; goal.pitch = view.pitch = WT.clamp(view.pitch + dy * 0.004, PITCH_MIN, PITCH_MAX); return; }
      WT.follow = null;
      const wpp = view.size / canvas.clientHeight;
      const rx = Math.cos(view.yaw), rz = -Math.sin(view.yaw), fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw);
      const k = 1 / Math.max(0.25, Math.sin(view.pitch));
      view.tx += -rx * dx * wpp + fx * dy * wpp * k;
      view.tz += -rz * dx * wpp + fz * dy * wpp * k;
      goal.tx = view.tx; goal.tz = view.tz;
      canvas.style.cursor = 'grabbing';
    } else hover(e);
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && e.type === 'pointerup' && e.button !== 2) {
      manual();
      WT.select(pick(e));
    }
    drag = null;
    canvas.style.cursor = '';
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    manual();
    const before = groundAt(e);
    view.size = goal.size = WT.clamp(view.size * Math.exp(e.deltaY * 0.0012), 22, 1600);
    applyCamera();
    const after = groundAt(e);
    if (before && after && !WT.follow) {
      view.tx += before.x - after.x; view.tz += before.z - after.z;
      goal.tx = view.tx; goal.tz = view.tz;
    }
  }, { passive: false });

  let hoverT = 0;
  WT.hovered = null;
  function hover(e) {
    const t = performance.now();
    if (t - hoverT < 60) return;
    hoverT = t;
    const ent = pick(e);
    WT.hovered = ent;
    canvas.style.cursor = ent ? 'pointer' : '';
  }

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === '/') { e.preventDefault(); document.getElementById('searchInput').focus(); return; }
    if (k === 'escape') WT.select(null);
    if (k === 'q') WT.rotate(-1);
    if (k === 'e') WT.rotate(1);
    if (k === 'r') { manual(); goal.pitch = WT.clamp(goal.pitch + 0.12, PITCH_MIN, PITCH_MAX); }
    if (k === 'f') { manual(); goal.pitch = WT.clamp(goal.pitch - 0.12, PITCH_MIN, PITCH_MAX); }
    if (k === '+' || k === '=') WT.zoomBy(0.8);
    if (k === '-' || k === '_') WT.zoomBy(1.25);
    if (k === 'h') WT.home();
    if (k === 'c') WT.Cinema.toggle();
    if (k === 'u') WT.UI.toggleCinemaMode();
    if (k === ' ') { e.preventDefault(); WT.setPaused(!WT.sim.paused); }
    if (['1', '2', '3', '4'].includes(k)) WT.setSpeed([1, 2, 4, 8][+k - 1]);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  function keyPan(dt) {
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (!dx && !dy) return;
    manual();
    WT.follow = null;
    const sp = view.size * 0.8 * dt;
    const rx = Math.cos(view.yaw), rz = -Math.sin(view.yaw), fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw);
    goal.tx += (rx * dx - fx * dy) * sp;
    goal.tz += (rz * dx - fz * dy) * sp;
  }

  WT.setPaused = (p) => { WT.sim.paused = p; WT.emit('speed'); };
  WT.setSpeed = (s) => { WT.sim.speed = s; WT.sim.paused = false; WT.emit('speed'); };

  /* ---------- selection + overlays ---------- */
  const ringGeo = new T.RingGeometry(0.86, 1, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0x2f56e0, transparent: true, opacity: 0.9, depthWrite: false }));
  const ring2 = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0x2f56e0, transparent: true, opacity: 0.4, depthWrite: false }));
  const discGeo = new T.CircleGeometry(1, 48);
  discGeo.rotateX(-Math.PI / 2);
  const disc = new T.Mesh(discGeo, new T.MeshBasicMaterial({ color: 0x2f56e0, transparent: true, opacity: 0.1, depthWrite: false }));
  ring.renderOrder = ring2.renderOrder = disc.renderOrder = 3;
  scene.add(ring, ring2, disc);
  ring.visible = ring2.visible = disc.visible = false;

  WT.selected = null;
  WT.select = (ent, fly, auto) => {
    WT.selected = ent || null;
    WT.autoSelected = auto ? ent : null;
    if (ent && fly) {
      manual();
      const p = ent.kind === 'facility' ? { x: ent.center()[0], z: ent.center()[1] } : ent.pos();
      WT.flyTo(p.x, p.z, Math.min(Math.max(goal.size, 60), Math.max(60, ent.radius() * 4)));
    }
    WT.emit('select', WT.selected);
  };

  const labelsEl = document.getElementById('labels');
  const selLabel = document.createElement('div');
  selLabel.className = 'map-label sel';
  const hovLabel = document.createElement('div');
  hovLabel.className = 'map-label hov';
  labelsEl.append(selLabel, hovLabel);
  const tmp = new T.Vector3();
  function toScreen(v) {
    tmp.copy(v).project(cam);
    return { x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight, ok: Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 };
  }
  const box3 = new T.Box3();
  function topOf(ent) {
    if (ent.kind === 'facility') {
      const c = ent.center();
      return new T.Vector3(c[0], (ent.site ? ent.site.h : 10) + 4, c[1]);
    }
    box3.setFromObject(ent.mesh);
    const p = ent.pos();
    p.y = isFinite(box3.max.y) ? box3.max.y : p.y + 3;
    return p;
  }

  const pins = new Map();
  function updatePins(t) {
    const want = new Set();
    if (view.size < 260) for (const e of WT.entities.values()) if (e.kind === 'pallet' && e.priority && !e.gone && e.mesh.parent) want.add(e);
    if (WT.selected && WT.selected.mesh && WT.selected.kind !== 'facility') want.add(WT.selected);
    for (const [e, s] of pins) if (!want.has(e)) { scene.remove(s); pins.delete(e); }
    for (const e of want) {
      let s = pins.get(e);
      if (!s) { s = WT.M.pin(); pins.set(e, s); scene.add(s); }
      const p = topOf(e);
      const sc = WT.clamp(view.size / 34, 1.6, 30) / 2.6;
      s.scale.set(2.6 * sc, 3.25 * sc, 1);
      s.position.set(p.x, p.y + 0.6 + Math.sin(t * 3 + e.uid.length) * 0.25 * sc, p.z);
    }
  }

  // construction progress pills
  const buildEls = new Map();
  function updateBuildLabels() {
    const live = new Set();
    for (const p of WT.G.projects) {
      if (p.stage === 'Online' || p.stage === 'Queued') continue;
      let pos;
      if (p.fac) { const c = p.fac.center(); pos = new T.Vector3(c[0], (p.fac.site ? p.fac.site.h : 8) + 18, c[1]); }
      else if (WT.W.railLayer) pos = WT.W.railLayer.position.clone().setY(16);
      if (!pos) continue;
      live.add(p);
      let el = buildEls.get(p);
      if (!el) {
        el = document.createElement('div');
        el.className = 'build-label';
        labelsEl.appendChild(el);
        buildEls.set(p, el);
      }
      const sp = toScreen(pos);
      el.style.display = sp.ok ? 'block' : 'none';
      el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
      const pct = Math.round((p.progress || 0) * 100);
      const html = `<div class="bl-top"><span>${p.icon}</span><b>${p.fac ? p.fac.id : 'Rail line'}</b><small>${p.stage}</small></div><div class="bl-bar"><i style="width:${pct}%"></i></div>`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
    }
    for (const [p, el] of buildEls) if (!live.has(p)) { el.remove(); buildEls.delete(p); }
  }

  function updateOverlays(t) {
    if (WT.selected && !WT.entities.has(WT.selected.uid)) WT.select(null);
    const s = WT.selected;
    if (s && s.mesh) {
      const fac = s.kind === 'facility';
      const p = fac ? new T.Vector3(s.center()[0], 0, s.center()[1]) : s.pos();
      const r = s.radius() * (fac ? 1.0 : 1.15);
      const quiet = document.body.classList.contains('cinema') || (WT.autoSelected === s && fac);
      ring.visible = !quiet;
      ring2.visible = disc.visible = !fac && !quiet;
      ring.material.opacity = fac ? 0.35 : 0.9;
      ring.position.set(p.x, 0.12, p.z); ring.scale.setScalar(r);
      disc.position.set(p.x, 0.1, p.z); disc.scale.setScalar(r);
      const k = (t * 0.8) % 1;
      ring2.position.set(p.x, 0.11, p.z); ring2.scale.setScalar(r * (1 + k * 0.6));
      ring2.material.opacity = 0.45 * (1 - k);
      const sp = toScreen(topOf(s));
      selLabel.style.display = sp.ok ? 'flex' : 'none';
      selLabel.style.transform = `translate(${sp.x}px, ${sp.y - (fac ? 6 : 44)}px) translate(-50%, -100%)`;
      const parts = s.label().split(' · ');
      const html = `<b>${parts[0]}</b><span>${parts.slice(1).join(' · ')}</span>`;
      if (selLabel._h !== html) { selLabel.innerHTML = html; selLabel._h = html; }
      if (WT.follow === s) { goal.tx = p.x; goal.tz = p.z; }
    } else {
      ring.visible = ring2.visible = disc.visible = false;
      selLabel.style.display = 'none';
    }
    const h = WT.hovered;
    if (h && h !== WT.selected && WT.entities.has(h.uid) && h.mesh.parent) {
      const sp = toScreen(topOf(h));
      hovLabel.style.display = 'flex';
      hovLabel.style.transform = `translate(${sp.x}px, ${sp.y - 8}px) translate(-50%, -100%)`;
      hovLabel.textContent = h.label();
    } else hovLabel.style.display = 'none';
    updatePins(t);
    updateBuildLabels();
  }

  /* ---------- boot (once the downloaded models are decoded) ---------- */
  function boot() {
    WT.W.build(scene);
    WT.G.start();
    WT.startTraffic();
    WT.SUP.start();
    WT.startSeaTraffic();
    WT.UI.init();
    resize();
    WT.booted = true;
    requestAnimationFrame(frame);
  }

  let last = performance.now(), uiT = 0, fcount = 0;
  function frame(nowMs) {
    const realDt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;
    WT.sim.dt = WT.sim.paused ? 0 : realDt * WT.sim.speed;
    WT.sim.minutes += WT.sim.dt * WT.sim.MIN_PER_SEC;
    WT.stepTasks();
    const t = nowMs / 1000;
    WT.emit('frame', t);
    WT.FX.update(WT.sim.dt);
    LK.time.value = t;
    WT.Cinema.update(realDt);
    keyPan(realDt);
    const cine = WT.Cinema.active();
    const k = 1 - Math.pow(cine ? 0.22 : 0.003, realDt);
    view.tx += (goal.tx - view.tx) * k;
    view.tz += (goal.tz - view.tz) * k;
    view.size += (goal.size - view.size) * k;
    view.yaw += (goal.yaw - view.yaw) * (cine ? 1 - Math.pow(0.4, realDt) : k);
    view.pitch += (goal.pitch - view.pitch) * k;
    applyCamera();
    updateOverlays(t);
    uiT += realDt;
    if (uiT > 0.25) { uiT = 0; WT.UI.refresh(); }
    // far-out views refresh shadows less often; they're tiny at that scale anyway
    fcount++;
    renderer.shadowMap.needsUpdate = view.size < 380 || fcount % (view.size < 800 ? 3 : 6) === 0;
    renderer.render(scene, cam);
    requestAnimationFrame(frame);
  }
  WT.ASSETS.ready.then(boot);
})();
