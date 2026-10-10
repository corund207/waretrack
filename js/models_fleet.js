/* WareTrack – vehicle variety (rigs, trailers, cars, buses), rolling stock, ships, road + site infrastructure */
(function () {
  const T = THREE, M = WT.M, MB = M.MB, P = M.P, shade = M.shade;

  /* ================= road vehicles ================= */
  const CHROME = 0xc7cde3, GLASS = 0x26305e, DARK = 0x2a2f4a;
  // a road wheel: tyre with a rounded shoulder, steel rim, hub and wheel nuts
  M.wheel = (b, x, y, z, r, wd = 0.55) => {
    const side = Math.sign(z) || 1;
    b.cyl(r, r, wd, P.tire, x, y, z, 18, Math.PI / 2);
    b.cyl(r * 0.94, r * 0.94, wd + 0.06, 0x2c2e33, x, y, z, 18, Math.PI / 2);
    b.cyl(r * 0.6, r * 0.6, wd + 0.08, 0xb7bbc2, x, y, z, 16, Math.PI / 2);
    b.cyl(r * 0.45, r * 0.5, wd + 0.1, 0x8d9199, x, y, z + side * 0.01, 16, Math.PI / 2);
    b.cyl(r * 0.2, r * 0.2, wd + 0.16, 0x5c6068, x, y, z, 10, Math.PI / 2);
  };
  function wheels(b, xs, w = 1.2, r = 0.6) {
    for (const wx of xs) for (const wz of [-w, w]) M.wheel(b, wx, r, wz, r);
  }
  // mudguards over a pair of axles
  function guards(b, x0, x1, w = 1.2, y = 1.3) {
    for (const z of [-w, w]) b.box(x1 - x0 + 1.4, 0.1, 0.65, DARK, (x0 + x1) / 2, y, z);
  }
  // tractor cab + front steer axle (drive axles are added by the rig under the fifth wheel)
  function cab(b, style, color) {
    if (style === 'conv') {
      b.box(2.2, 3.0, 3.0, color, 4.2, 0.9, 0);
      b.box(1.3, 0.9, 3.04, GLASS, 4.4, 2.5, 0);
      b.boxC(0.1, 1.0, 2.6, GLASS, 5.32, 2.95, 0, 0, 0, -0.2);
      b.box(2.1, 1.7, 2.6, color, 6.3, 0.9, 0);
      b.boxC(2.1, 0.3, 2.6, shade(color, 1.12), 6.3, 2.65, 0, 0, 0, -0.05);
      b.box(0.2, 1.4, 2.2, CHROME, 7.4, 0.9, 0);
      b.box(0.3, 0.4, 2.9, DARK, 7.5, 0.55, 0);
      for (const z of [-1.0, 1.0]) b.box(0.1, 0.3, 0.45, 0xfff1b8, 7.45, 1.7, z);
      for (const z of [-1.45, 1.45]) b.cyl(0.12, 0.12, 3.2, CHROME, 3.2, 3.6, z, 8);
      for (const z of [-1.75, 1.75]) b.box(0.14, 0.75, 0.22, DARK, 5.2, 2.6, z);
      for (const z of [-1.55, 1.55]) b.cyl(0.42, 0.42, 1.4, CHROME, 2.4, 0.95, z * 0.85, 14, 0, 0, Math.PI / 2);
      for (const z of [-1.2, 1.2]) b.boxC(1.4, 0.12, 0.7, DARK, 6.4, 1.35, z, 0, 0, -0.15);
      wheels(b, [6.4], 1.2, 0.6);
    } else {
      b.box(2.7, 2.9, 3.1, color, 5.0, 0.9, 0);
      b.box(1.8, 0.65, 3.0, color, 4.6, 3.8, 0);
      b.box(0.08, 1.25, 2.6, GLASS, 6.37, 2.2, 0);
      b.box(1.2, 0.95, 3.14, GLASS, 5.3, 2.35, 0);
      b.box(0.35, 0.45, 3.15, DARK, 6.45, 0.65, 0);
      for (const z of [-1.0, 1.0]) b.box(0.08, 0.3, 0.55, 0xfff1b8, 6.4, 1.3, z);
      b.box(0.5, 0.12, 2.4, shade(color, 0.8), 6.2, 1.8, 0);
      // grille, bumper, lamps, visor, roof fairing, mirrors, steps, fuel tanks
      for (const y of [1.0, 1.25, 1.5]) b.box(0.06, 0.1, 1.5, CHROME, 6.42, y, 0);
      b.box(0.4, 0.5, 3.2, 0x2c2f36, 6.42, 0.45, 0);
      for (const z of [-1.15, 1.15]) b.box(0.06, 0.18, 0.3, 0xe08a2a, 6.5, 0.75, z);
      b.box(0.5, 0.08, 3.0, shade(color, 0.7), 6.45, 3.42, 0);
      b.boxC(1.7, 0.9, 3.0, shade(color, 1.05), 4.85, 4.85, 0, 0, 0, 0.3);
      for (const z of [-0.6, 0, 0.6]) b.box(0.12, 0.1, 0.18, 0xe08a2a, 5.8, 4.45, z);
      for (const z of [-1.75, 1.75]) {
        b.box(0.08, 0.08, 0.4, DARK, 6.15, 3.0, z * 0.93);
        b.box(0.14, 0.75, 0.22, DARK, 6.2, 2.25, z);
      }
      for (const z of [-1.6, 1.6]) {
        b.box(0.7, 0.08, 0.35, DARK, 5.4, 0.55, z);
        b.box(0.7, 0.08, 0.35, DARK, 5.4, 1.05, z);
        b.cyl(0.42, 0.42, 1.5, CHROME, 2.6, 0.95, z * 0.82, 14, 0, 0, Math.PI / 2);
      }
      b.box(1.0, 0.1, 0.7, DARK, 4.95, 1.3, 1.25); b.box(1.0, 0.1, 0.7, DARK, 4.95, 1.3, -1.25);
      wheels(b, [4.95], 1.2, 0.6);
    }
  }
  // Articulated rig: a tractor and a semi-trailer hinged at the fifth wheel (kingpin).
  // trailer: box | reefer | curtain | tanker | coil | logs | stake | flat | uld | dump (dump = rigid tipper)
  // userData.pivot is the trailer's hinge; traffic.js swings it to follow the tractor.
  const KINGPIN = 2.4, TRAILER_AXLE = -5.4, TRACTOR_SHIFT = 0.6;
  M.rig = (o = {}) => {
    const g = new T.Group();
    const color = o.cab || P.blue, stripe = o.stripe || color, tr = o.trailer || 'box';
    const rigid = tr === 'dump';
    // ---- tractor: the downloaded DAF unit (already fitted to rig coordinates), or one drawn in cab coordinates and
    // moved forward to clear the trailer's swing
    const model = !rigid && M.asset('cab', color);
    const t = new MB();
    if (!model) cab(t, o.style || 'cabover', color);
    if (rigid) {
      t.box(14.0, 0.45, 2.3, DARK, -0.6, 0.5, 0);
      t.box(9, 0.4, 2.6, DARK, -1.6, 0.9, 0);
      t.box(8.6, 2.4, 3.0, o.trailerColor || 0xf0b429, -1.8, 1.3, 0);
      t.box(8.2, 0.6, 2.6, 0x9c7a5b, -1.8, 3.5, 0);
      t.sphere(1.2, 0x9c7a5b, -1.8, 3.9, 0, 3, 0.4, 1, 10);
      wheels(t, [-6.0, -4.75], 1.2, 0.6);
    } else if (!model) {
      t.box(6.6, 0.45, 2.3, DARK, 3.0, 0.5, 0);
      t.cyl(1.0, 1.0, 0.16, 0x3a4166, KINGPIN - TRACTOR_SHIFT, 1.03, 0, 14);
      for (const z of [-1.3, 1.3]) t.box(2.7, 0.12, 0.62, shade(color, 0.7), 1.4, 1.32, z);
      t.box(0.25, 1.6, 0.25, CHROME, 3.15, 0.95, -1.0);
      wheels(t, [0.8, 2.0], 1.2, 0.6);
      guards(t, 0.8, 2.0);
    }
    const tm = model || t.mesh();
    if (!rigid && !model) tm.position.x = TRACTOR_SHIFT;
    g.add(tm);
    const cargo = new T.Group();
    cargo.position.set(-2.0, 1.35, 0);
    g.userData.cargo = cargo;
    g.userData.half = 1.7;
    if (rigid) { g.add(cargo); return g; }

    // ---- semi-trailer (rig coordinates, hung from the kingpin)
    const b = new MB();
    let decal = false;
    const W = 3.3;
    if (tr === 'box' || tr === 'reefer' || tr === 'curtain') {
      const body = tr === 'curtain' ? shade(stripe, 1.35) : o.trailerColor || P.white;
      b.box(11.2, 3.5, W, body, -2.1, 0.9, 0);
      b.box(11.26, 0.12, W + 0.06, shade(body, 0.9), -2.1, 4.4, 0);
      b.box(0.12, 3.3, W - 0.1, shade(body, 0.85), -7.72, 1.0, 0);
      if (tr === 'curtain') for (let x = -7.2; x < 3.4; x += 1.3) b.box(0.12, 3.4, W + 0.05, shade(stripe, 0.9), x, 0.95, 0);
      else b.box(11.26, 0.6, W + 0.06, stripe, -2.1, 0.95, 0);
      if (tr === 'reefer') {
        b.box(0.9, 2.2, 2.8, 0xdfe3f2, 3.0, 1.8, 0);
        b.box(0.92, 1.0, 1.0, 0x3a4166, 3.0, 2.4, 0);
      }
      decal = tr !== 'curtain';
    } else if (tr === 'tanker') {
      b.box(11.2, 0.4, 2.2, DARK, -2.3, 0.9, 0);
      b.cyl(1.5, 1.5, 10.0, 0xd5dae9, -2.4, 2.75, 0, 18, 0, 0, Math.PI / 2);
      b.sphere(1.5, 0xd5dae9, 2.6, 2.75, 0, 0.35, 1, 1, 14);
      b.sphere(1.5, 0xd5dae9, -7.4, 2.75, 0, 0.35, 1, 1, 14);
      b.cyl(1.52, 1.52, 0.3, stripe, -2.4, 2.75, 0, 18, 0, 0, Math.PI / 2);
      b.box(9, 0.12, 0.8, 0x9aa1c4, -2.4, 4.25, 0);
      for (const x of [-5.9, -2.4, 1.1]) b.cyl(0.4, 0.4, 0.3, 0x9aa1c4, x, 4.35, 0, 10);
      b.box(0.1, 3, 0.6, 0x9aa1c4, -7.7, 1.2, 1.2);
    } else if (tr === 'coil' || tr === 'logs' || tr === 'flat' || tr === 'stake') {
      // open decks: whatever is carried is a live Load in the cargo group, not baked into the model
      b.box(11.2, 0.35, W - 0.6, tr === 'flat' ? DARK : 0x6a7194, -2.2, 0.9, 0);
      if (tr === 'logs') for (const x of [-7.4, -4.4, -1.4, 1.6, 3.2]) for (const z of [-1.4, 1.4]) b.box(0.2, 2.8, 0.2, 0x3a4166, x, 1.25, z);
      if (tr === 'stake' || tr === 'coil') b.box(0.22, tr === 'stake' ? 2.3 : 1.2, W - 0.5, 0x6a7194, 3.25, 1.25, 0); // headboard
      if (tr === 'stake') for (const x of [-7.4, -4.6, -1.8, 1.0]) for (const z of [-1.3, 1.3]) b.box(0.16, 1.5, 0.16, 0x3a4166, x, 1.25, z);
      if (tr === 'flat') for (const x of [-7.6, 3.2]) for (const z of [-1.0, 1.0]) b.box(0.3, 0.25, 0.3, 0xf0b429, x, 1.25, z); // twistlocks
    } else if (tr === 'uld') {
      b.box(11.2, 0.35, W - 0.4, 0x6a7194, -2.2, 0.9, 0);
      for (const z of [-0.9, -0.3, 0.3, 0.9]) b.box(11.0, 0.12, 0.12, 0xf0b429, -2.2, 1.25, z);
      for (const z of [-1.5, 1.5]) b.box(11.2, 0.5, 0.12, 0x9aa1c4, -2.2, 1.25, z);
    }
    for (const z of [-0.95, 0.95]) b.box(0.18, 0.75, 0.18, 0x9aa1c4, 0.6, 0.15, z); // landing legs
    wheels(b, [-6.0, -4.75], 1.2, 0.6);
    guards(b, -6.0, -4.75);
    for (const z of [-1.25, 1.25]) b.box(0.06, 0.7, 0.5, 0x1d1f24, -6.9, 0.35, z); // mud flaps
    for (const z of [-1.4, 1.4]) b.box(0.06, 0.2, 0.35, 0xc8202e, -7.75, 1.0, z); // tail lamps
    b.box(0.25, 0.15, 2.6, 0x9aa1c4, -7.6, 0.75, 0); // under-run guard
    const pivot = new T.Group();
    pivot.position.x = KINGPIN;
    const inner = new T.Group();
    inner.position.x = -KINGPIN;
    pivot.add(inner);
    inner.add(b.mesh());
    if (decal && o.label) {
      const tex = M.labelTex(o.label, stripe);
      for (const side of [1, -1]) {
        const d = M.decal(tex, 7.2, 1.8);
        d.position.set(-2.1, 3.0, side * (W / 2 + 0.03));
        if (side < 0) d.rotation.y = Math.PI;
        inner.add(d);
      }
    }
    inner.add(cargo);
    g.add(pivot);
    g.userData.pivot = pivot;
    g.userData.kingpin = KINGPIN;
    g.userData.wheelbase = KINGPIN - TRAILER_AXLE;
    return g;
  };

  /* ---------- live loads: what an open trailer or open-frame container is carrying ---------- */
  // Instances are ordered bottom-up, so unloading takes from the top and loading stacks upward.
  const LOAD_KIND = { steel: 'coils', timber: 'logs', lumber: 'planks', wire: 'reels', iron: 'heap', ore: 'heap', sand: 'heap', fabric: 'crates', comp: 'crates', glass: 'panes',
    coal: 'heap', bauxite: 'heap', grain: 'heap', alum: 'planks' };
  M.loadKind = (mat) => LOAD_KIND[mat] || 'crates';
  const LGEO = {
    coils: new T.CylinderGeometry(0.95, 0.95, 1.7, 16).rotateZ(Math.PI / 2),
    planks: new T.BoxGeometry(3.0, 0.8, 1.05),
    reels: new T.CylinderGeometry(0.72, 0.72, 0.85, 14).rotateX(Math.PI / 2),
    crates: new T.BoxGeometry(1.15, 1.0, 1.1),
    panes: new T.BoxGeometry(1.8, 1.65, 0.08),
  };
  const sized = new Map();
  const cached = (key, make) => { if (!sized.has(key)) sized.set(key, make()); return sized.get(key); };
  // a long trapezoid mound of bulk material, 1 unit tall (scaled by fill level)
  const heapGeometry = (L) => cached('heap' + L, () => {
    const sh = new T.Shape();
    sh.moveTo(-1.15, 0); sh.lineTo(1.15, 0); sh.lineTo(0.75, 0.55); sh.lineTo(0.25, 1); sh.lineTo(-0.25, 1); sh.lineTo(-0.75, 0.55); sh.closePath();
    const geo = new T.ExtrudeGeometry(sh, { depth: L - 0.6, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-(L - 0.6) / 2, 0, 0);
    return geo;
  });
  class Load {
    // L: usable deck length; the group's origin is the middle of the deck surface.
    // heapH: how high a bulk heap may mound (the walls of an open-top bin hold more than a bare bed)
    constructor(mat, L, heapH) {
      const m = WT.SUP.MAT[mat] || {};
      this.mat = mat;
      this.kind = M.loadKind(mat);
      this.colors = m.colors || [0xc89b63];
      this.g = new T.Group();
      this.frac = -1;
      const k = this.kind;
      if (k === 'heap') {
        this.mesh = new T.Mesh(heapGeometry(L), new T.MeshStandardMaterial({ color: this.colors[0], flatShading: true }));
        this.mesh.castShadow = this.mesh.receiveShadow = true;
        this.g.add(this.mesh);
        this.h = heapH || 1.9;
        this.set(0);
        return;
      }
      const pos = [];
      const fixed = new MB();
      let geo = LGEO[k];
      if (k === 'coils') {
        const n = Math.max(1, Math.floor(L / 3.4));
        for (let i = 0; i < n; i++) {
          const x = (i - (n - 1) / 2) * 3.4;
          fixed.box(1.8, 0.35, 2.3, 0x3a4166, x, 0, 0);
          pos.push([x, 1.3, 0]);
        }
        this.h = 2.25;
      } else if (k === 'logs') {
        geo = cached('logs' + L, () => new T.CylinderGeometry(0.42, 0.42, L - 0.4, 9).rotateZ(Math.PI / 2));
        for (const [y, zs] of [[0.42, [-0.9, 0, 0.9]], [1.15, [-0.45, 0.45]], [1.85, [0]]]) for (const z of zs) pos.push([0, y, z]);
        this.h = 2.27;
      } else if (k === 'planks') {
        const n = Math.max(1, Math.floor(L / 3.2));
        for (const y of [0.4, 1.25]) for (let i = 0; i < n; i++) for (const z of [-0.58, 0.58]) pos.push([(i - (n - 1) / 2) * 3.2, y, z]);
        this.h = 1.65;
      } else if (k === 'reels') {
        const n = Math.max(1, Math.floor(L / 1.7));
        for (let i = 0; i < n; i++) for (const z of [-0.6, 0.6]) pos.push([(i - (n - 1) / 2) * 1.7, 0.72, z]);
        this.h = 1.45;
      } else if (k === 'panes') {
        // glass sheets leaning on both sides of A-frame racks
        const n = Math.max(1, Math.floor(L / 2.0));
        for (let i = 0; i < n; i++) {
          const x = (i - (n - 1) / 2) * 2.0;
          fixed.box(1.9, 0.2, 1.2, 0x6a7194, x, 0, 0);
          fixed.box(1.9, 1.8, 0.14, 0x6a7194, x, 0.2, 0);
        }
        for (let l = 0; l < 4; l++) for (let i = 0; i < n; i++) for (const sd of [-1, 1]) pos.push([(i - (n - 1) / 2) * 2.0, 1.05, sd * (0.2 + l * 0.13), sd * 0.12]);
        this.h = 1.9;
      } else {
        const n = Math.max(1, Math.floor(L / 1.25));
        for (const y of [0.5, 1.52]) for (let i = 0; i < n; i++) for (const z of [-0.6, 0.6]) pos.push([(i - (n - 1) / 2) * 1.25, y, z]);
        this.h = 2.02;
      }
      // bottom tier first, front (headboard) end first: unloading empties the door end, loading fills from the front
      pos.sort((p, q) => p[1] - q[1] || q[0] - p[0]);
      if (fixed.p.length) this.g.add(fixed.mesh());
      this.im = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ color: 0xffffff, transparent: k === 'panes', opacity: k === 'panes' ? 0.75 : 1 }), pos.length);
      this.im.castShadow = this.im.receiveShadow = true;
      const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _c = new T.Color(), _p = new T.Vector3(), _s = new T.Vector3(1, 1, 1);
      pos.forEach(([x, y, z, tilt], i) => {
        _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(tilt || 0, 0, 0)), _s);
        this.im.setMatrixAt(i, _m);
        this.im.setColorAt(i, _c.setHex(k === 'panes' ? 0xbfe3f2 : this.colors[i % this.colors.length]));
      });
      this.cap = pos.length;
      this.g.add(this.im);
      this.set(0);
    }
    set(frac) {
      frac = WT.clamp(frac, 0, 1);
      if (Math.abs(frac - this.frac) < 0.005) return;
      this.frac = frac;
      if (this.mesh) {
        this.mesh.visible = frac > 0.01;
        this.mesh.scale.y = 0.12 + frac * (this.h - 0.12);
      } else this.im.count = Math.round(frac * this.cap);
    }
    // world position of a spot on top of the load, where the next item is taken from / dropped onto
    topPoint() {
      this.g.updateWorldMatrix(true, false);
      return this.g.localToWorld(new T.Vector3(WT.rnd(-2, 2), this.h * Math.max(0.25, this.frac), 0));
    }
  }
  M.Load = Load;

  // Open-frame container (open-top / flat-rack style): corner posts and top rails so it stacks and is
  // crane-handled like any box, but the cargo stays in plain view.
  M.openFrame = (color, len = 11) => {
    const b = new MB();
    const w = 2.6, h = 2.7, frame = shade(color, 0.8);
    b.box(len, 0.25, w, shade(color, 0.6), 0, 0, 0);
    for (const x of [-len / 2 + 0.12, len / 2 - 0.12]) for (const z of [-w / 2 + 0.1, w / 2 - 0.1]) b.box(0.24, h, 0.2, frame, x, 0, z);
    for (const z of [-w / 2 + 0.08, w / 2 - 0.08]) {
      b.box(len, 0.18, 0.16, frame, 0, h - 0.18, z);
      b.box(len - 0.3, 0.6, 0.08, color, 0, 0.25, z); // low side wall
      const n = Math.round(len / 1.1);
      for (let i = 1; i < n; i++) b.box(0.1, 0.6, 0.1, frame, -len / 2 + (i * len) / n, 0.25, z * 1.02);
    }
    for (const x of [-len / 2 + 0.06, len / 2 - 0.06]) {
      b.box(0.12, 0.18, w, frame, x, h - 0.18, 0);
      b.box(0.08, 1.1, w - 0.3, color, x, 0.25, 0); // end wall
    }
    const m = b.mesh();
    m.userData.h = h;
    return m;
  };

  // ISO tank container: a stainless barrel in a 40' frame, for liquids (chemicals, syrup, resin, LPG) by rail or sea
  M.isoTank = (color, len = 11) => {
    const b = new MB();
    const w = 2.6, h = 2.7, frame = shade(color, 0.75);
    b.box(len, 0.22, w, frame, 0, 0, 0);
    for (const x of [-len / 2 + 0.12, len / 2 - 0.12]) {
      for (const z of [-w / 2 + 0.12, w / 2 - 0.12]) b.box(0.24, h, 0.24, frame, x, 0, z);
      b.box(0.2, 0.2, w, frame, x, h - 0.2, 0);
    }
    for (const z of [-w / 2 + 0.1, w / 2 - 0.1]) b.box(len, 0.2, 0.16, frame, 0, h - 0.2, z);
    b.cyl(1.2, 1.2, len - 1.6, 0xe1e6f2, 0, 1.35, 0, 18, 0, 0, Math.PI / 2);
    for (const x of [-(len - 1.6) / 2, (len - 1.6) / 2]) b.sphere(1.2, 0xe1e6f2, x, 1.35, 0, 0.35, 1, 1, 14);
    b.cyl(1.22, 1.22, 0.5, color, 0, 1.35, 0, 18, 0, 0, Math.PI / 2); // operator band
    b.box(len - 2, 0.1, 0.7, 0x9aa1c4, 0, 2.55, 0); // top walkway
    b.cyl(0.35, 0.35, 0.3, 0x9aa1c4, 0, 2.6, 0, 10); // manlid
    const m = b.mesh();
    m.userData.h = h;
    return m;
  };

  // Autonomous container mover (AGV): a low, cab-less carrier that takes a box, ULD, tank or open load from a
  // terminal crane to a plant's receiving bay. deck: flat (container) | stake (open load) | tanker | uld.
  // Same footprint as a rig (front +7.2 / rear −7.8) so it shares the traffic engine; cargo sits at x −2.
  M.mover = (o = {}) => {
    const g = new T.Group(), b = new MB();
    const deck = o.deck || 'flat', body = 0x25304a, acc = o.color || 0x2aa198;
    b.box(13.2, 0.95, 2.9, body, -1.2, 0.4, 0);
    b.box(13.24, 0.18, 2.94, acc, -1.2, 0.95, 0); // livery band
    for (const x of [-7.6, 5.2]) b.box(0.3, 0.6, 2.7, 0xf0b429, x, 0.45, 0); // bumpers
    // drive module up front: lidar mast, light bar, status lamps
    b.box(1.4, 1.5, 2.6, body, 4.6, 1.35, 0);
    b.box(1.42, 0.25, 2.62, acc, 4.6, 2.6, 0);
    b.cyl(0.32, 0.32, 0.35, 0x8de9ff, 4.6, 3.05, 0, 12);
    for (const z of [-1.0, 1.0]) b.box(0.1, 0.25, 0.5, 0xfff1b8, 5.35, 1.0, z);
    for (const z of [-1.0, 1.0]) b.box(0.1, 0.25, 0.5, 0xe2384d, -7.82, 1.0, z);
    for (const x of [-7.6, 5.2]) for (const z of [-1.5, 1.5]) b.cyl(0.18, 0.18, 0.2, 0x8de9ff, x, 1.35, z, 8); // corner sensors
    // four steered axles
    for (const x of [-6.4, -3.2, 0.6, 3.6]) for (const z of [-1.25, 1.25]) {
      b.cyl(0.5, 0.5, 0.45, P.tire, x, 0.5, z, 12, Math.PI / 2);
      b.cyl(0.24, 0.24, 0.48, P.hub, x, 0.5, z, 8, Math.PI / 2);
    }
    if (deck === 'flat') for (const x of [-7.5, 3.5]) for (const z of [-1.0, 1.0]) b.box(0.3, 0.2, 0.3, 0xf0b429, x, 1.35, z); // twistlocks
    else if (deck === 'stake') {
      b.box(11, 0.2, 2.7, 0x6a7194, -2.2, 1.35, 0);
      for (const x of [-7.4, -4.6, -1.8, 1.0, 3.2]) for (const z of [-1.3, 1.3]) b.box(0.16, 1.5, 0.16, 0x3a4166, x, 1.5, z);
    } else if (deck === 'tanker') {
      b.box(11, 0.2, 2.4, 0x3a4166, -2.2, 1.35, 0);
      b.cyl(1.3, 1.3, 9.6, 0xd5dae9, -2.2, 2.85, 0, 18, 0, 0, Math.PI / 2);
      for (const x of [-7.0, 2.6]) b.sphere(1.3, 0xd5dae9, x, 2.85, 0, 0.3, 1, 1, 14);
      b.cyl(1.32, 1.32, 0.3, acc, -2.2, 2.85, 0, 18, 0, 0, Math.PI / 2);
    } else if (deck === 'uld') {
      b.box(11, 0.2, 2.7, 0x6a7194, -2.2, 1.35, 0);
      for (const z of [-0.9, -0.3, 0.3, 0.9]) b.box(10.8, 0.1, 0.12, 0xf0b429, -2.2, 1.55, z); // roller tracks
    }
    g.add(b.mesh());
    const cargo = new T.Group();
    cargo.position.set(-2, deck === 'flat' ? 1.35 : 1.65, 0); // container on the twistlocks, anything else on the deck plate
    g.add(cargo);
    g.userData.cargo = cargo;
    g.userData.half = 1.45;
    return g;
  };

  M.CAR_KINDS = ['sedan', 'sedan', 'suv', 'van', 'pickup'];
  M.carKind = (color, kind = 'sedan') => {
    const model = kind === 'pickup' ? null : M.asset(kind, color);
    if (model) { model.userData.half = 1.1; return model; }
    const b = new MB();
    if (kind === 'suv') {
      b.box(4.7, 1.1, 2.05, color, 0, 0.4, 0);
      b.box(3.2, 0.95, 1.95, color, -0.4, 1.5, 0);
      b.box(3.22, 0.6, 2.0, GLASS, -0.4, 1.65, 0);
      b.box(2.6, 0.12, 1.6, 0x3a4166, -0.5, 2.45, 0);
    } else if (kind === 'van') {
      b.box(5.4, 2.2, 2.1, color, -0.3, 0.4, 0);
      b.box(1.0, 1.2, 2.0, color, 2.6, 0.4, 0);
      b.boxC(0.1, 0.8, 1.9, GLASS, 2.45, 2.0, 0, 0, 0, -0.5);
      b.box(1.2, 0.6, 2.14, GLASS, 1.6, 1.7, 0);
    } else if (kind === 'pickup') {
      b.box(5.0, 0.95, 2.0, color, 0, 0.45, 0);
      b.box(2.0, 1.0, 1.9, color, 0.8, 1.4, 0);
      b.box(2.02, 0.6, 1.94, GLASS, 0.8, 1.55, 0);
      b.box(2.2, 0.5, 1.9, shade(color, 0.8), -1.4, 1.35, 0);
    } else {
      b.box(4.4, 0.9, 1.95, color, 0, 0.35, 0);
      b.box(2.4, 0.8, 1.8, color, -0.3, 1.25, 0);
      b.box(2.42, 0.55, 1.84, GLASS, -0.3, 1.35, 0);
    }
    for (const z of [-0.6, 0.6]) b.box(0.08, 0.25, 0.45, 0xfff1b8, 2.25, 0.75, z);
    for (const z of [-0.65, 0.65]) b.box(0.08, 0.25, 0.4, 0xe2384d, -2.25, 0.85, z);
    const L = kind === 'van' ? 6.0 : kind === 'pickup' || kind === 'suv' ? 5.0 : 4.6, Wd = kind === 'suv' || kind === 'van' ? 2.08 : 1.98;
    b.box(0.25, 0.32, Wd + 0.02, 0x2c2f36, L / 2 - 0.2, 0.3, 0);
    b.box(0.25, 0.32, Wd + 0.02, 0x2c2f36, -L / 2 + 0.25, 0.3, 0);
    for (const z of [-1, 1]) {
      b.box(L - 1.2, 0.18, 0.04, 0x2c2f36, 0, 0.38, z * (Wd / 2 + 0.005));
      b.box(0.22, 0.14, 0.12, color, kind === 'van' ? 2.2 : 0.95, kind === 'van' ? 2.05 : 1.35, z * (Wd / 2 + 0.06));
    }
    for (const x of [1.45, -1.45]) for (const z of [-0.92, 0.92]) M.wheel(b, x, 0.37, z, 0.37, 0.3);
    const g = new T.Group();
    g.add(b.mesh());
    g.userData.half = 1.1;
    return g;
  };
  M.bus = (color = 0x2f56e0) => {
    const b = new MB();
    b.box(11.5, 2.8, 2.6, P.white, 0, 0.5, 0);
    b.box(11.52, 1.0, 2.64, GLASS, 0, 1.9, 0);
    b.box(11.54, 0.5, 2.66, color, 0, 0.7, 0);
    b.box(11.6, 0.25, 2.5, 0xdfe3f2, 0, 3.3, 0);
    b.box(0.1, 1.6, 2.3, GLASS, 5.76, 1.5, 0);
    for (const z of [-0.8, 0.8]) b.box(0.08, 0.3, 0.45, 0xfff1b8, 5.8, 0.9, z);
    for (const x of [3.8, -3.6]) for (const z of [-1.2, 1.2]) b.cyl(0.55, 0.55, 0.4, P.tire, x, 0.55, z, 12, Math.PI / 2);
    const g = new T.Group();
    g.add(b.mesh());
    g.userData.half = 1.4;
    return g;
  };

  /* ================= rolling stock + ships ================= */
  // container = intermodal flat (carries one removable 40' box); tank / hopper / box cars carry their load built in
  M.wagonKind = (kind) => {
    if (kind === 'container') { const w = M.wagon(); w.userData.kind = kind; return w; }
    const g = new T.Group();
    g.userData.kind = kind;
    const b = new MB();
    b.box(12.4, 0.45, 2.9, 0x3a4166, 0, 1.0, 0);
    for (const bx of [-4.6, 4.6]) {
      b.box(2.8, 0.5, 2.2, 0x22263d, bx, 0.45, 0);
      for (const wx of [-0.8, 0.8]) for (const wz of [-1.0, 1.0]) b.cyl(0.42, 0.42, 0.2, 0x5a6080, bx + wx, 0.42, wz, 10, Math.PI / 2);
    }
    if (kind === 'tank') {
      const c = WT.pick([0xe9ecf7, 0x22263d, 0xd9434b]);
      b.cyl(1.4, 1.4, 11.2, c, 0, 2.95, 0, 16, 0, 0, Math.PI / 2);
      b.sphere(1.4, c, 5.6, 2.95, 0, 0.3, 1, 1, 12);
      b.sphere(1.4, c, -5.6, 2.95, 0, 0.3, 1, 1, 12);
      b.box(1.2, 0.5, 1.2, 0x9aa1c4, 0, 4.3, 0);
    } else if (kind === 'hopper') {
      const c = WT.pick([0x6a7194, 0x7a5b46, 0x3a4166]);
      b.box(11.8, 2.6, 2.9, c, 0, 1.5, 0);
      for (const x of [-3, 0, 3]) b.boxC(2.4, 1.2, 2.6, shade(c, 0.85), x, 1.2, 0, 0, 0, 0);
      b.box(11.4, 0.4, 2.5, 0x8a7a68, 0, 4.0, 0);
      for (let x = -5.4; x <= 5.4; x += 1.8) b.box(0.15, 2.6, 2.95, shade(c, 0.8), x, 1.5, 0);
    } else {
      const c = WT.pick([0xb5543d, 0x2f56e0, 0x2aa198, 0x7a5cd6]);
      b.box(12, 3.4, 2.9, c, 0, 1.45, 0);
      b.box(3, 2.8, 2.95, shade(c, 0.8), 0, 1.6, 0);
      b.box(12.1, 0.2, 3.0, shade(c, 0.85), 0, 4.85, 0);
    }
    g.add(b.mesh());
    const slot = new T.Group();
    slot.position.set(0, 1.45, 0);
    g.add(slot);
    g.userData.slot = slot;
    return g;
  };
  // passing ships offshore: bulk carriers + tankers
  M.cargoShip = (kind) => {
    const g = new T.Group();
    const shape = new T.Shape();
    const pts = [[-48, -8], [32, -8], [50, -2], [52, 0], [50, 2], [32, 8], [-48, 8], [-50, 4], [-50, -4]];
    shape.moveTo(...pts[0]);
    pts.slice(1).forEach((p) => shape.lineTo(...p));
    const hull = new T.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: false });
    hull.rotateX(-Math.PI / 2);
    hull.translate(0, -3, 0);
    const b = new MB();
    const hc = kind === 'tanker' ? 0x3a2f6e : 0x1f4f6b;
    b.geo(hull, hc);
    const red = new T.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    red.rotateX(-Math.PI / 2);
    red.scale(1.005, 1, 1.01);
    red.translate(0, -0.3, 0);
    b.geo(red, 0xc8463d);
    const deck = new T.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    deck.rotateX(-Math.PI / 2);
    deck.scale(0.97, 1, 0.92);
    deck.translate(0, 4, 0);
    b.geo(deck, kind === 'tanker' ? 0xb5543d : 0x9aa1c4);
    if (kind === 'tanker') {
      b.box(70, 0.8, 0.8, 0xe9ecf7, -4, 4.4, 0);
      for (let x = -34; x < 30; x += 9) { b.box(0.6, 1.6, 10, 0xe9ecf7, x, 4.3, 0); b.cyl(0.9, 0.9, 1.5, 0xe9ecf7, x + 4, 5, 0, 10); }
    } else {
      for (let x = -32; x < 30; x += 10.5) { b.box(8, 1.6, 11, 0x2f56e0, x, 4.3, 0); b.box(8.1, 0.3, 11.1, 0x2140b8, x, 5.9, 0); }
      for (const x of [-22, 0, 20]) { b.box(0.6, 9, 0.6, 0xf0b429, x + 5, 4.3, 5); b.boxC(10, 0.4, 0.4, 0xf0b429, x + 1, 12, 5, 0, 0, -0.5); }
    }
    b.box(9, 10, 14, P.white, -42, 4, 0);
    b.box(9.1, 0.8, 14.1, 0x26305e, -42, 12, 0);
    b.box(5, 2.4, 17, P.white, -41, 14, 0);
    b.box(5.1, 0.8, 17.1, 0x26305e, -41, 14.8, 0);
    b.box(3, 5, 3, 0x2f56e0, -46, 14, 0);
    g.add(b.mesh());
    return g;
  };

  /* ================= road + site infrastructure ================= */
  M.lampInto = (b, x, z, rotY = 0) => {
    b.cyl(0.13, 0.17, 8, 0x9aa1c4, x, 4, z, 6);
    const dx = Math.cos(rotY) * 1.4, dz = -Math.sin(rotY) * 1.4;
    b.boxC(2.8, 0.14, 0.18, 0x9aa1c4, x + dx / 2, 7.9, z + dz / 2, 0, rotY, 0);
    b.boxC(0.9, 0.2, 0.5, 0xfff6d0, x + dx, 7.75, z + dz, 0, rotY, 0);
  };
  // traffic signal pole: heads facing two directions; mats = {hw:[r,y,g], av:[r,y,g]}
  M.signalPole = (mats, faceHw, faceAv) => {
    const g = new T.Group();
    const b = new MB();
    b.cyl(0.16, 0.2, 7.5, 0x3a4166, 0, 3.75, 0, 8);
    b.box(0.6, 2.1, 0.6, 0x22263d, 0, 4.6, 0);
    b.box(0.6, 2.1, 0.6, 0x22263d, 0, 2.2, 0);
    g.add(b.mesh());
    const lamp = new T.SphereGeometry(0.2, 8, 6);
    const head = (set, y, ang) => {
      set.forEach((m, i) => {
        const s = new T.Mesh(lamp, m);
        s.position.set(Math.cos(ang) * 0.32, y + 1.7 - i * 0.62, -Math.sin(ang) * 0.32);
        g.add(s);
      });
    };
    head(mats.hw, 4.6, faceHw);
    head(mats.av, 2.2, faceAv);
    return g;
  };
  M.barrier = () => {
    const g = new T.Group();
    const b = new MB();
    b.box(2.2, 2.6, 2.2, 0xf3f5fd, 0, 0, -1.6);
    b.box(2.3, 0.3, 2.3, 0x2f56e0, 0, 2.6, -1.6);
    b.box(2.24, 0.8, 1.6, GLASS, 0, 1.4, -1.6);
    b.box(0.5, 1.2, 0.5, 0x3a4166, 0, 0, 0);
    g.add(b.mesh());
    const arm = new T.Group();
    arm.position.set(0, 1.1, 0);
    const ab = new MB();
    for (let i = 0; i < 6; i++) ab.box(1.0, 0.18, 0.18, i % 2 ? 0xffffff : 0xd9434b, 0, -0.09, 0.5 + i);
    arm.add(ab.mesh());
    g.add(arm);
    g.userData.arm = arm;
    return g;
  };
  // conifer: a straight trunk under five drooping tiers, each a lumpy cone, darkest at the bottom
  M.conifer = () => {
    const b = new MB();
    b.cyl(0.12, 0.26, 2.0, 0x4e3b2c, 0, 1.0, 0, 6);
    const tiers = [[1.9, 1.3, 2.0, 0x22442a], [1.6, 2.4, 1.9, 0x274b2d], [1.3, 3.4, 1.7, 0x2c5331], [0.95, 4.35, 1.5, 0x325a35], [0.55, 5.2, 1.3, 0x38623a]];
    for (const [r, y, h, c] of tiers) {
      b.cyl(0.08, r, h, c, 0, y + h / 2, 0, 9);
      b.cyl(r, r * 0.82, 0.25, shade(c, 0.75), 0, y + 0.12, 0, 9);
    }
    b.cyl(0.02, 0.25, 0.9, 0x38623a, 0, 6.8, 0, 6);
    return b.build();
  };
  // rubber-tyred gantry for the container depot (span along x, travels along z)
  M.rtg = (span = 60, h = 15) => {
    const c = M.gantry(span, h);
    c.group.traverse((o) => { if (o.isMesh && o.material === M.vc) o.material = M.vc; });
    return c;
  };
  M.fan = () => {
    const g = new T.Group();
    const b = new MB();
    for (let i = 0; i < 4; i++) b.boxC(1.7, 0.08, 0.4, 0x3a4166, Math.cos((i * Math.PI) / 2) * 0.85, 0, -Math.sin((i * Math.PI) / 2) * 0.85, 0, (i * Math.PI) / 2, 0);
    b.cyl(0.25, 0.25, 0.2, 0x22263d, 0, 0, 0, 8);
    g.add(b.mesh(false, false));
    return g;
  };
})();
