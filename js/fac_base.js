/* WareTrack – facility base class + shipments shared by all modes */
(function () {
  const T = THREE, M = WT.M, W = WT.W;

  /* ---------- shipments ---------- */
  WT.shipments = [];
  WT.STAGES = {
    truck: ['Order Confirmed', 'Picked', 'Loading', 'In Transit', 'Delivered'],
    rail: ['Booked', 'Staged', 'Loading', 'In Transit', 'Delivered'],
    air: ['Booked', 'Build-up', 'Loading', 'Departed', 'Arrived'],
    sea: ['Booked', 'Gate-in', 'Loading', 'Sailing', 'Delivered'],
  };
  WT.createShipment = (o) => {
    const now = WT.sim.minutes;
    o = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
    const s = Object.assign({
      id: WT.nextShipId(), stage: 1, loaded: 0, total: 6, transit: 45,
      times: [now - WT.rint(90, 200), now - WT.rint(20, 80), now + 15, now + 25, now + 70],
    }, o);
    WT.shipments.unshift(s);
    if (WT.shipments.length > 24) WT.shipments.pop();
    WT.emit('shipment', s);
    return s;
  };
  WT.updateShipment = (s, minsLeft) => {
    if (s.stage > 2) return;
    const now = WT.sim.minutes;
    s.times[2] = now + minsLeft;
    s.times[3] = s.times[2] + 6;
    s.times[4] = s.times[3] + s.transit;
  };
  WT.advanceShipment = (s, stage) => {
    const now = WT.sim.minutes;
    s.stage = stage;
    s.times[stage - 1] = Math.min(s.times[stage - 1], now);
    if (stage === 3) { s.times[3] = now; s.times[4] = now + s.transit; }
    if (stage === 4) s.times[4] = now;
  };
  WT.spawn((function* () {
    while (true) {
      for (const s of WT.shipments) if (s.stage === 3 && WT.sim.minutes >= s.times[4]) s.stage = 4;
      yield* WT.sleep(1);
    }
  })());

  /* ---------- facilities ---------- */
  WT.facilities = [];
  const counters = {};
  WT.nextFacId = (prefix) => prefix + '-' + String((counters[prefix] = (counters[prefix] || 0) + 1)).padStart(2, '0');

  class Facility extends WT.Entity {
    constructor(type, prefix, name, plot) {
      super();
      this.kind = 'facility';
      this.type = type;
      this.id = WT.nextFacId(prefix);
      this.name = name;
      this.plot = plot || null;
      this.group = new T.Group();
      if (plot) {
        this.group.position.set(plot.A + 8 * plot.s, 0, plot.zc);
        this.group.rotation.y = plot.rot;
        plot.used = this;
      }
      this.structure = new T.Group();
      this.group.add(this.structure);
      this.mesh = this.group;
      this.active = false;
      this.docks = [];
      this.income = 0;
      this.builtAt = null;
      this.moves = 0;
      // local box of the main structure, used by the construction crew
      this.site = { x: 56, z: 0, w: 60, d: 80, h: 12 };
      WT.scene.add(this.group);
      WT.register(this);
      WT.facilities.push(this);
    }
    toWorld(x, z) { return this.plot.toWorld(x, z); }
    bounds() { return this.plot.bounds; }
    center() { const c = this.plot ? this.plot.center : [this.group.position.x, this.group.position.z]; return c; }
    radius() { return 60; }
    label() { return this.id + ' · ' + this.name; }
    build() {}
    activate() { this.active = true; this.builtAt = WT.sim.minutes; }
    reserve(op) {
      const d = this.docks.find((d) => !d.truck && (!d.ops || d.ops.includes(op)));
      if (d) d.truck = 'reserved';
      return d || null;
    }
    freeDocks(op) { return this.docks.filter((d) => !d.truck && (!d.ops || d.ops.includes(op))).length; }
    release(d) { if (d) d.truck = null; }
    // security gates: barrier arms lift for approaching vehicles
    addGates() {
      if (!this.plot) return;
      for (const [z, rot] of [[49.6, Math.PI], [-49.6, 0]]) {
        const b = M.barrier();
        b.position.set(7, 0, z);
        b.rotation.y = rot;
        this.group.add(b);
        const w = this.toWorld(7, z * 0.93);
        WT.TR.gates.push({ x: w[0], z: w[1], arm: b.userData.arm, open: 0 });
      }
    }
    pad() {
      W.flat(this.group, 108, 104, W.COL.pad, 55, 0, 0.022);
      W.flat(this.group, 8, 10, W.COL.road, -2, 46, 0.031);
      W.flat(this.group, 8, 10, W.COL.road, -2, -46, 0.031);
    }
    // unload/load a truck through a short roller belt (ULDs, cartons, raw material)
    *beltServe(truck, belt, n, color) {
      truck.total = n; truck.loaded = 0;
      while (truck.loaded < n) {
        if (belt.push(color)) { truck.loaded++; yield* WT.sleep(0.5); } else yield;
      }
      yield* WT.sleep(1.2);
    }
    cardBase(extra) {
      const status = this.active ? 'Operational' : 'Under construction';
      return Object.assign({
        kicker: 'Facility · ' + this.type, title: this.id + ' ' + this.name, sub: 'Riverside Logistics Park',
        icon: '🏭', iconBg: '#9fb4ff', status, statusTone: this.active ? 'green' : 'amber', where: this.plot ? `Avenue ${this.plot.A}` : '',
        rows: [],
      }, extra);
    }
  }
  WT.Facility = Facility;

  /* ---------- shared building kit ---------- */
  function corrugTex(color, dark) {
    return M.canvasTex(64, 64, (ctx) => {
      ctx.fillStyle = color; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = dark;
      for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 3, 64);
    });
  }
  const texCache = {};
  function wallMat(base, dark, rep) {
    const key = base + dark;
    const src = texCache[key] || (texCache[key] = corrugTex(base, dark));
    const t = src.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep, 1);
    return new T.MeshLambertMaterial({ map: t });
  }
  function wallPiece(parent, w, h, d, x, y, z, along, colors) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), wallMat(colors[0], colors[1], (along === 'x' ? w : d) / 3));
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  // Shed with real door openings on its +Z face; built in its own frame (x0..x1, z0..z1)
  M.shed = function (parent, o) {
    const { x0, x1, z0, z1, h, doors = [] } = o;
    const colors = o.colors || ['#2f56e0', '#2a4dcc'];
    const roofCol = o.roof || 0x3f66ee;
    const g = new T.Group();
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, t = 0.6;
    W.flat(g, w, d, 0x9aa2c6, cx, cz, 0.03);
    wallPiece(g, w, h, t, cx, 0, z0 + t / 2, 'x', colors);
    wallPiece(g, t, h, d, x0 + t / 2, 0, cz, 'z', colors);
    wallPiece(g, t, h, d, x1 - t / 2, 0, cz, 'z', colors);
    const DW = o.doorW || 6.4, DH = o.doorH || 5.4;
    // openings on the +Z face: truck dock doors, plus smaller personnel / forklift doors
    const FW = 3.6, FH = 3.8;
    const sorted = [...doors].sort((a, b) => a - b);
    const openings = [...doors.map((x) => ({ x, w: DW, h: DH })), ...(o.forkDoors || []).map((x) => ({ x, w: FW, h: FH }))].sort((a, b) => a.x - b.x);
    let cur = x0;
    for (const op of openings) {
      const a = op.x - op.w / 2;
      if (a > cur) wallPiece(g, a - cur, h, t, (cur + a) / 2, 0, z1 - t / 2, 'x', colors);
      wallPiece(g, op.w, h - op.h, t, op.x, op.h, z1 - t / 2, 'x', colors);
      cur = op.x + op.w / 2;
    }
    if (x1 > cur) wallPiece(g, x1 - cur, h, t, (cur + x1) / 2, 0, z1 - t / 2, 'x', colors);
    const b = new M.MB();
    for (const fx of o.forkDoors || []) {
      // forklift door: steel frame, yellow-and-black guard posts, a warning light and a "forklifts only" sign
      b.box(0.35, FH + 0.35, 0.35, 0xf0b429, fx - FW / 2 - 0.15, 0, z1 + 0.05);
      b.box(0.35, FH + 0.35, 0.35, 0xf0b429, fx + FW / 2 + 0.15, 0, z1 + 0.05);
      b.box(FW + 0.65, 0.35, 0.35, 0xf0b429, fx, FH, z1 + 0.05);
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.box(0.42, 0.33, 0.42, k % 2 ? 0x262a3d : 0xf0b429, fx + s * (FW / 2 + 0.7), k * 0.33, z1 + 0.6);
      b.box(0.5, 0.3, 0.3, 0xff9a3c, fx, FH + 0.45, z1 + 0.25);
      b.box(1.6, 0.9, 0.08, 0xf0b429, fx + FW / 2 + 1.5, FH - 1.2, z1 + 0.06);
    }
    for (const dx of sorted) {
      b.box(0.5, DH + 0.5, 0.5, 0x5d7ff0, dx - DW / 2 - 0.2, 0, z1 + 0.05);
      b.box(0.5, DH + 0.5, 0.5, 0x5d7ff0, dx + DW / 2 + 0.2, 0, z1 + 0.05);
      b.box(DW + 0.9, 0.5, 0.5, 0x5d7ff0, dx, DH, z1 + 0.05);
      b.boxC(DW + 1.8, 0.25, 2.2, 0xe9ecf7, dx, DH + 1.2, z1 + 1.0, -0.12, 0, 0);
      b.box(0.5, 0.9, 0.5, 0x262a3d, dx - DW / 2 + 0.3, 0.1, z1 + 0.3);
      b.box(0.5, 0.9, 0.5, 0x262a3d, dx + DW / 2 - 0.3, 0.1, z1 + 0.3);
      b.box(DW - 0.4, 0.18, 2.2, 0xc6cbe3, dx, 0, z1 + 1.0);
      b.box(DW + 4, 0.2, 0.6, 0xf08c2a, dx, 2.4, z1 - 8);
      b.box(1.4, 1.0, 0.1, 0xffffff, dx + DW / 2 + 1.4, DH - 1.4, z1 + 0.06);
    }
    const rise = o.rise === undefined ? 3.2 : o.rise;
    if (o.flat) {
      b.box(w + 0.4, 0.6, d + 0.4, roofCol, cx, h, cz);
      b.box(w + 0.6, 0.9, 0.4, M.shade(roofCol, 0.85), cx, h + 0.4, z0);
      b.box(w + 0.6, 0.9, 0.4, M.shade(roofCol, 0.85), cx, h + 0.4, z1);
      for (let sx = x0 + 6; sx < x1 - 4; sx += 10) for (const zz of [cz - d / 4, cz + d / 4]) {
        b.box(4.2, 1.6, 3.2, 0xdfe3f2, sx, h + 0.6, zz);
        b.cyl(1.1, 1.1, 0.2, 0x3a4166, sx - 0.9, h + 2.25, zz, 12);
        b.cyl(1.1, 1.1, 0.2, 0x3a4166, sx + 0.9, h + 2.25, zz, 12);
      }
    } else if (o.sawtooth) {
      for (let sx = x0; sx < x1 - 0.1; sx += 8) {
        const sw = Math.min(8, x1 - sx);
        b.box(sw, 0.3, d + 1.2, roofCol, sx + sw / 2, h, cz);
        b.boxC(sw * 0.9, 0.25, d + 1.2, roofCol, sx + sw * 0.45, h + 1.8, cz, 0, 0, 0.42);
        b.box(0.25, 3.4, d + 1.2, 0xb9c8ff, sx + sw * 0.86, h + 0.2, cz);
      }
    } else {
      const shape = new T.Shape();
      shape.moveTo(-d / 2 - 0.8, 0); shape.lineTo(0, rise); shape.lineTo(d / 2 + 0.8, 0); shape.lineTo(-d / 2 - 0.8, 0);
      const rg = new T.ExtrudeGeometry(shape, { depth: w + 1.6, bevelEnabled: false });
      rg.rotateY(Math.PI / 2);
      rg.translate(cx - w / 2 - 0.8, h, cz);
      b.geo(rg, roofCol);
      b.box(w + 1.7, 0.3, 1.0, 0x5d7ff0, cx, h + rise - 0.15, cz);
      for (let sx = x0 + 6; sx < x1 - 4; sx += 9) {
        const sl = Math.atan2(rise, d / 2 + 0.8);
        b.boxC(3.5, 0.15, Math.min(5, d / 3), 0xb9c8ff, sx, h + rise * 0.5 + 0.1, cz + d / 4, sl, 0, 0);
        b.boxC(3.5, 0.15, Math.min(5, d / 3), 0xb9c8ff, sx, h + rise * 0.5 + 0.1, cz - d / 4, -sl, 0, 0);
      }
    }
    b.box(w + 0.2, 0.6, 0.8, 0x2140b8, cx, h - 0.6, z1 + 0.1);
    b.box(w + 0.2, 0.4, 0.4, 0x8ea6ff, cx, 0, z1 + 0.25);
    if (o.extra) o.extra(b);
    g.add(b.mesh());
    if (o.sign) {
      const tex = M.canvasTex(512, 128, (ctx) => {
        ctx.fillStyle = '#ffffff';
        M.hexPath(ctx, 64, 64, 46); ctx.fill();
        ctx.fillStyle = '#2f56e0'; M.hexPath(ctx, 64, 64, 22); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = '800 66px Inter, "Segoe UI", Arial'; ctx.textBaseline = 'middle';
        ctx.fillText(o.sign, 130, 68);
      });
      const sm = M.decal(tex, 12, 3);
      sm.position.set(x0 + 9, h - 2.2, z1 + 0.35);
      g.add(sm);
    }
    if (o.roofLogo && !o.sawtooth) {
      const tex = M.canvasTex(256, 256, (ctx) => {
        ctx.fillStyle = '#ffffff'; M.hexPath(ctx, 128, 128, 110); ctx.fill();
        ctx.fillStyle = '#2f56e0'; M.hexPath(ctx, 128, 128, 60); ctx.fill();
        ctx.fillStyle = '#ffffff'; M.hexPath(ctx, 128, 128, 26); ctx.fill();
      });
      const lm = new T.Mesh(new T.PlaneGeometry(7, 7), new T.MeshLambertMaterial({ map: tex, transparent: true }));
      const slope = Math.atan2(rise, d / 2 + 0.8);
      lm.rotation.set(-Math.PI / 2 + slope, 0, 0);
      lm.position.set(cx, h + rise * 0.5 + 0.25, cz + d / 4);
      g.add(lm);
    }
    parent.add(g);
    return g;
  };
  // generic office/terminal block with window bands
  M.block = function (parent, o) {
    const b = new M.MB();
    const { x, z, w, d, h } = o;
    b.box(w, h, d, o.color || 0xf3f5fd, x, 0, z);
    b.box(w + 0.6, 0.6, d + 0.6, o.trim || 0x2f56e0, x, h, z);
    for (let y = 2; y < h - 1.5; y += 3) {
      b.box(w + 0.06, 1.2, d * 0.86, 0x3a4a86, x, y, z);
      b.box(w * 0.9, 1.2, d + 0.06, 0x3a4a86, x, y, z);
    }
    if (o.extra) o.extra(b);
    const m = b.mesh();
    parent.add(m);
    return m;
  };
})();
