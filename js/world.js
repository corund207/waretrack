/* WareTrack – the open world: terrain, highway, coast, forest, plot grid, avenues, rail line, routing */
(function () {
  const T = THREE, M = WT.M;
  const W = (WT.W = {});

  W.COL = {
    ground: 0xe8ebfa, road: 0xcdd3f0, apron: 0xdde1f5, concrete: 0xd8ddf2, mark: 0xf8f9ff,
    yellow: 0xf1c66b, water: 0xadc9f3, ballast: 0xc9c6d6, runway: 0xbfc5e2, pad: 0xdfe3f5,
  };
  const COL = W.COL;
  W.AVENUES = [-120, 120, -360, 360, -600, 600];
  W.EDGE = 1700;
  W.SEA_Z = 600;
  W.RAIL = { zE: -650, zW: -662 };
  W.HW_LANE = 3.2;
  W.PLOT_K = 4;

  /* ---------- helpers ---------- */
  W.flat = function (parent, w, d, color, x, z, y = 0.02) {
    const geo = new T.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const m = new T.Mesh(geo, M.mat(color));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  W.dashes = function (parent, list, color, y = 0.05) {
    const geo = new T.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const im = new T.InstancedMesh(geo, M.mat(color), Math.max(1, list.length));
    const m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    list.forEach((d, i) => {
      q.setFromAxisAngle(up, d.rot || 0);
      m.compose(p.set(d.x, y, d.z), q, s.set(d.len, 1, d.w));
      im.setMatrixAt(i, m);
    });
    im.count = list.length;
    im.receiveShadow = true;
    parent.add(im);
    return im;
  };
  W.dashLine = function (list, x0, z0, x1, z1, dash = 3, gap = 3, w = 0.35) {
    const L = Math.hypot(x1 - x0, z1 - z0), rot = -Math.atan2(z1 - z0, x1 - x0);
    for (let s = 0; s + dash <= L + 1e-6; s += dash + gap) {
      const t = (s + dash / 2) / L;
      list.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, len: dash, w, rot });
    }
  };
  W.dashRect = function (list, cx, cz, w, d, dash = 1.1, gap = 0.7, lw = 0.22) {
    W.dashLine(list, cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2, dash, gap, lw);
    W.dashLine(list, cx - w / 2, cz + d / 2, cx + w / 2, cz + d / 2, dash, gap, lw);
    W.dashLine(list, cx - w / 2, cz - d / 2, cx - w / 2, cz + d / 2, dash, gap, lw);
    W.dashLine(list, cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2, dash, gap, lw);
  };
  W.groundText = function (parent, text, x, z, w, h, color = '#9aa3c9', rot = 0, size = 64) {
    const tex = M.canvasTex(256, 128, (ctx) => {
      ctx.fillStyle = color;
      ctx.font = `700 ${size}px Inter, "Segoe UI", Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 66);
    });
    const geo = new T.PlaneGeometry(w, h);
    geo.rotateX(-Math.PI / 2);
    const m = new T.Mesh(geo, new T.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.position.set(x, 0.07, z);
    m.rotation.y = rot;
    parent.add(m);
    return m;
  };

  /* ---------- plots ---------- */
  W.plots = [];
  function makePlot(A, s, h, k) {
    const zc = h * (64 + 108 * k);
    const p = { id: `${A}:${s}:${h}:${k}`, A, s, h, k, zc, used: null };
    p.toWorld = (x, z) => [A + s * (8 + x), zc + s * z];
    const xa = A + s * 6, xb = A + s * 114;
    p.bounds = { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: zc - 53, z1: zc + 53 };
    p.center = p.toWorld(56, 0);
    p.rot = s > 0 ? 0 : Math.PI;
    W.plots.push(p);
    return p;
  }
  for (const A of W.AVENUES) for (const h of [-1, 1]) for (let k = 0; k < W.PLOT_K; k++) for (const s of [1, -1]) {
    if (A === 600 && h < 0 && s > 0) continue; // airport district
    makePlot(A, s, h, k);
  }
  W.plotAt = (A, s, h, k) => W.plots.find((p) => p.A === A && p.s === s && p.h === h && p.k === k);

  /* ---------- avenues (grow with the park) ---------- */
  W.av = {};
  W.builtAbsX = 150;
  function avenueState(A) {
    return (W.av[A] = W.av[A] || { north: 7, south: 7, built: false, paving: {} });
  }
  // generator: pave avenue A toward hemisphere h (−1 north, +1 south) out to |z| = to
  W.extendAvenue = function* (A, h, to, speed = 30) {
    const st = avenueState(A);
    const key = h < 0 ? 'north' : 'south';
    while (st.paving[key]) yield;
    if (st[key] >= to) return;
    st.paving[key] = true;
    const from = st[key], len = to - from;
    W.builtAbsX = Math.max(W.builtAbsX, Math.abs(A) + 120);
    if (!st.built) {
      st.built = true;
      W.flat(WT.scene, 14, 14, COL.road, A, 0, 0.032);
      WT.TR.addJunction(A);
    }
    const g = new T.Group();
    g.position.set(A, 0, h * from);
    g.rotation.y = h < 0 ? Math.PI : 0;
    const geo = new T.PlaneGeometry(12, len);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, len / 2);
    const road = new T.Mesh(geo, M.mat(COL.road));
    road.position.y = 0.03;
    road.receiveShadow = true;
    g.add(road);
    const dl = [];
    W.dashLine(dl, 0, 0, 0, len, 3, 3, 0.3);
    W.dashes(g, dl, COL.mark, 0.055);
    const edge = [];
    W.dashLine(edge, -5.6, 0, -5.6, len, len, 0, 0.18);
    W.dashLine(edge, 5.6, 0, 5.6, len, len, 0, 0.18);
    W.dashes(g, edge, COL.mark, 0.055);
    // street lamps both sides
    const lb = new M.MB();
    // none past |z| 556: the rail and port terminals' gate lanes cross the avenue ends there
    for (let z = 14; z < len; z += 34) {
      if (from + z < 556) M.lampInto(lb, -7.6, z, 0);
      if (from + z + 17 < 556) M.lampInto(lb, 7.6, z + 17, Math.PI);
    }
    if (lb.p.length) g.add(lb.mesh());
    g.scale.z = 0.001;
    WT.scene.add(g);
    const paver = M.paver();
    WT.scene.add(paver);
    paver.rotation.y = h < 0 ? Math.PI / 2 : -Math.PI / 2;
    W.clearTrees({ x0: A - 9, x1: A + 9, z0: Math.min(h * from, h * to) - 2, z1: Math.max(h * from, h * to) + 2 });
    yield* WT.tween(len / speed, (t) => {
      g.scale.z = Math.max(0.001, t);
      paver.position.set(A + 2.5, 0, h * (from + len * t));
    });
    WT.scene.remove(paver);
    st[key] = to;
    st.paving[key] = false;
  };
  W.avenueReach = (A, h) => (W.av[A] ? W.av[A][h < 0 ? 'north' : 'south'] : 0);

  /* ---------- routing ---------- */
  const laneZ = (dir) => (dir > 0 ? W.HW_LANE : -W.HW_LANE);
  W.edgeX = () => Math.min(W.EDGE, W.builtAbsX + 650);
  W.spawnPoint = (side) => (side === 'W' ? [-W.edgeX(), laneZ(1)] : [W.edgeX(), laneZ(-1)]);
  // from/to: {edge:'W'|'E'} or {A, z}
  W.route = function (from, to) {
    if (from.A !== undefined && to.A !== undefined && from.A === to.A) {
      const laneX = to.A + (to.z < from.z ? 3 : -3);
      return [[laneX, from.z], [laneX, to.z]];
    }
    const pts = [];
    const tx = to.edge ? (to.edge === 'W' ? -W.edgeX() : W.edgeX()) : to.A;
    let dir;
    if (from.hw !== undefined) {
      dir = Math.sign(tx - from.hw) || 1;
      pts.push([from.hw, laneZ(dir)]);
    } else if (from.edge) {
      const x = from.edge === 'W' ? -W.edgeX() : W.edgeX();
      dir = Math.sign(tx - x) || 1;
      pts.push([x, laneZ(dir)]);
    } else {
      dir = Math.sign(tx - from.A) || 1;
      const lx = from.A + (from.z < 0 ? -3 : 3);
      pts.push([lx, from.z], [lx, laneZ(dir)]);
    }
    if (to.edge) pts.push([tx, laneZ(dir)]);
    else {
      const lx = to.A + (to.z < 0 ? 3 : -3);
      pts.push([lx, laneZ(dir)], [lx, to.z]);
    }
    return pts;
  };

  /* ---------- forest (instanced, clearable; broadleaf + conifer) ---------- */
  W.forests = [];
  W.trees = { x: [] };
  function treeAllowed(x, z) {
    if (Math.abs(z) < 14) return false;
    if (z > W.SEA_Z - 8) return false;
    if (z > -682 && z < -620) return false;
    for (const A of W.AVENUES) if (Math.abs(x - A) < 10) return false;
    if (x > 615 && z > -590 && z < -330) return false;
    if (Math.abs(x - 900) < 10 && z < 0 && z > -380) return false;
    if (x > -60 && x < -20 && z > 10 && z < 24) return false;
    return true;
  }
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _p = new T.Vector3(), _s = new T.Vector3(), _c = new T.Color(), _up = new T.Vector3(0, 1, 0);
  function setTree(f, i, sc) {
    _q.setFromAxisAngle(_up, i * 1.7);
    _m.compose(_p.set(f.x[i], 0, f.z[i]), _q, _s.set(sc, sc, sc));
    f.mesh.setMatrixAt(i, _m);
  }
  function buildForest(scene) {
    const groves = [];
    for (let i = 0; i < 90; i++) groves.push([WT.rnd(-1550, 1550), WT.rnd(-820, 580), WT.rnd(40, 130), Math.random() < 0.4]);
    const broad = { x: [], z: [], s: [], alive: [] }, pine = { x: [], z: [], s: [], alive: [] };
    for (let tries = 0; tries < 60000 && broad.x.length + pine.x.length < 3300; tries++) {
      let x, z, conifer = Math.random() < 0.25;
      if (Math.random() < 0.75) {
        const g = WT.pick(groves), a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * g[2];
        x = g[0] + Math.cos(a) * r; z = g[1] + Math.sin(a) * r;
        conifer = g[3] ? Math.random() < 0.85 : Math.random() < 0.1;
      } else { x = WT.rnd(-1550, 1550); z = WT.rnd(-820, 590); }
      if (!treeAllowed(x, z)) continue;
      const f = conifer ? pine : broad;
      f.x.push(x); f.z.push(z); f.s.push(WT.rnd(0.75, 1.45)); f.alive.push(true);
    }
    for (const [f, geo] of [[broad, M.treeGeometry()], [pine, M.conifer()]]) {
      f.mesh = new T.InstancedMesh(geo, M.vc, f.x.length);
      f.mesh.castShadow = f.mesh.receiveShadow = true;
      for (let i = 0; i < f.x.length; i++) {
        setTree(f, i, f.s[i]);
        const v = WT.rnd(0.84, 1.0);
        f.mesh.setColorAt(i, _c.setRGB(v * WT.rnd(0.92, 1), v, v * WT.rnd(0.88, 1)));
      }
      f.mesh.frustumCulled = false;
      scene.add(f.mesh);
      W.forests.push(f);
    }
    W.trees.x = broad.x.concat(pine.x);
  }
  W.clearTrees = function (b) {
    for (const f of W.forests) {
      const idx = [];
      for (let i = 0; i < f.x.length; i++) {
        if (f.alive[i] && f.x[i] > b.x0 && f.x[i] < b.x1 && f.z[i] > b.z0 && f.z[i] < b.z1) { f.alive[i] = false; idx.push(i); }
      }
      if (!idx.length) continue;
      WT.spawn((function* () {
        yield* WT.tween(1.4, (t) => {
          for (const i of idx) setTree(f, i, Math.max(0.0001, f.s[i] * (1 - WT.ease(t))));
          f.mesh.instanceMatrix.needsUpdate = true;
        });
      })());
    }
  };

  /* ---------- rail mainline (built by a project) ---------- */
  W.railBuilt = false;
  W.buildRail = function* () {
    const g = new T.Group();
    g.position.x = -W.EDGE - 200;
    const L = (W.EDGE + 200) * 2;
    W.flat(g, L, 30, COL.ballast, L / 2, -656, 0.025);
    const sl = [];
    for (const tz of [W.RAIL.zE, W.RAIL.zW]) for (let x = 0; x < L; x += 1.7) sl.push({ x, z: tz, len: 0.5, w: 3.4 });
    W.dashes(g, sl, 0xa49c90, 0.06);
    const b = new M.MB();
    for (const tz of [W.RAIL.zE, W.RAIL.zW]) for (const o of [-0.75, 0.75]) b.box(L, 0.25, 0.22, 0x6a7194, L / 2, 0.05, tz + o);
    g.add(b.mesh(false, true));
    const pb = new M.MB();
    for (let x = 20; x < L; x += 60) {
      pb.box(0.4, 8, 0.4, 0x9aa1c4, x, 0, -671);
      pb.box(0.3, 0.3, 14, 0x9aa1c4, x, 7.6, -664);
    }
    g.add(pb.mesh());
    g.scale.x = 0.0001;
    WT.scene.add(g);
    W.clearTrees({ x0: -W.EDGE - 220, x1: W.EDGE + 220, z0: -682, z1: -626 });
    const layer = M.trackLayer();
    WT.scene.add(layer);
    W.railLayer = layer;
    yield* WT.tween(30, (t) => {
      g.scale.x = Math.max(0.0001, t);
      layer.position.set(-W.EDGE - 200 + L * t - 8, 0, W.RAIL.zE);
    });
    WT.scene.remove(layer);
    W.railLayer = null;
    W.railBuilt = true;
  };

  /* ---------- power lines ---------- */
  W.pylonRange = null;
  const wireMat = new T.LineBasicMaterial({ color: 0x6a7194, transparent: true, opacity: 0.75 });
  function wire(ax, bx, y, z, sag) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new T.Vector3(ax + (bx - ax) * t, y - Math.sin(Math.PI * t) * sag, z));
    }
    return new T.Line(new T.BufferGeometry().setFromPoints(pts), wireMat);
  }
  W.extendPylons = function (x0, x1) {
    const step = 60, z = -9.8;
    const r = W.pylonRange || (W.pylonRange = { list: [], wires: [] });
    const a = Math.floor(x0 / step) * step, b = Math.ceil(x1 / step) * step;
    for (let x = a; x <= b; x += step) {
      if (r.list.find((p) => p.x === x)) continue;
      if (W.AVENUES.some((A) => Math.abs(A - x) < 10)) continue;
      const m = M.pylon();
      m.position.set(x, 0, z);
      m.scale.y = 0.01;
      WT.scene.add(m);
      r.list.push({ x, m });
      WT.spawn(WT.tween(1.5, (t) => (m.scale.y = Math.max(0.01, WT.ease(t)))));
    }
    r.list.sort((p, q) => p.x - q.x);
    r.wires.forEach((w) => WT.scene.remove(w));
    r.wires = [];
    for (let i = 1; i < r.list.length; i++) {
      const pa = r.list[i - 1].x, pb = r.list[i].x;
      if (pb - pa > 2 * step) continue;
      for (const [ox, oy] of [[-5.2, 17.7], [5.2, 17.7], [-3.7, 21.7], [3.7, 21.7]]) {
        const w = wire(pa, pb, oy, z + ox, 1.8);
        WT.scene.add(w);
        r.wires.push(w);
      }
    }
    W.clearTrees({ x0: a - 4, x1: b + 4, z0: z - 7, z1: z + 7 });
  };

  /* ---------- base world ---------- */
  W.build = function (scene) {
    W.flat(scene, 7000, 7000, COL.ground, 0, 0, 0);
    W.flat(scene, (W.EDGE + 400) * 2, 14, COL.road, 0, 0, 0.03);
    const d = [];
    W.dashLine(d, -W.EDGE - 400, 0, W.EDGE + 400, 0, 5, 5, 0.4);
    W.dashes(scene, d, COL.mark, 0.055);
    const e = [];
    W.dashLine(e, -W.EDGE - 400, -6.4, W.EDGE + 400, -6.4, 4200, 0, 0.22);
    W.dashLine(e, -W.EDGE - 400, 6.4, W.EDGE + 400, 6.4, 4200, 0, 0.22);
    W.dashes(scene, e, COL.mark, 0.055);
    // coast
    W.flat(scene, 7000, 10, 0xdfe2f2, 0, W.SEA_Z - 3, 0.026);
    W.flat(scene, 7000, 1600, COL.water, 0, W.SEA_Z + 800, 0.04);
    W.ripples = [];
    const rg = new T.PlaneGeometry(1, 1);
    rg.rotateX(-Math.PI / 2);
    const rm = new T.MeshBasicMaterial({ color: 0xd6e5fb, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 240; i++) {
      const r = new T.Mesh(rg, rm);
      r.scale.set(WT.rnd(3, 10), 1, 0.4);
      r.position.set(WT.rnd(-1900, 1900), 0.06, WT.rnd(W.SEA_Z + 20, W.SEA_Z + 560));
      r.userData.v = WT.rnd(0.4, 1.2);
      scene.add(r);
      W.ripples.push(r);
    }
    WT.on('frame', () => {
      for (const r of W.ripples) { r.position.x -= r.userData.v * WT.sim.dt; if (r.position.x < -1900) r.position.x = 1900; }
    });
    buildForest(scene);
    // park sign
    const sign = M.canvasTex(512, 160, (ctx) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 160);
      ctx.fillStyle = '#2f56e0'; M.hexPath(ctx, 70, 80, 46); ctx.fill();
      ctx.fillStyle = '#ffffff'; M.hexPath(ctx, 70, 80, 20); ctx.fill();
      ctx.fillStyle = '#141933'; ctx.font = '800 46px Inter, Arial'; ctx.fillText('RIVERSIDE', 136, 70);
      ctx.fillStyle = '#2f56e0'; ctx.font = '700 30px Inter, Arial'; ctx.fillText('LOGISTICS PARK', 138, 114);
    });
    const sg = new T.Group();
    const sb = new M.MB();
    sb.box(0.5, 6.5, 0.5, 0x9aa1c4, -5.5, 0, 0); sb.box(0.5, 6.5, 0.5, 0x9aa1c4, 5.5, 0, 0);
    sg.add(sb.mesh());
    const panel = new T.Mesh(new T.PlaneGeometry(13, 4), new T.MeshLambertMaterial({ map: sign }));
    panel.position.set(0, 7.5, 0.3);
    sg.add(panel);
    sg.position.set(-40, 0, 17);
    scene.add(sg);
  };
})();
