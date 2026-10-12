/* WareTrack – production plants
   Intermediate plants (steel mill, copper refinery, chemical plant, sawmill, glass works) turn raw imports into
   intermediates and ship them to assembly plants by in-park container movers.
   Receiving is a one-way yard: movers enter at the north gate, run down the bypass lane, pull past their bay and
   reverse square onto its dock door. They are unloaded out of the back (doors opened, tank hosed up, open loads lifted
   out) onto a roller bed through the door, then pull out and carry on down the lane to the south gate.
   Assembly plants consume inputs and push finished cartons over a belt bridge into their paired warehouse.
   Inputs only rise when a purchase order is physically delivered. */
(function () {
  const T = THREE, M = WT.M, W = WT.W, FX = WT.FX;
  // dock doors along the wall, 16 m apart: a mover backed onto one (3 m wide) leaves room to reverse into the next
  const DOCKS = [36, 20, 4, -12];
  // a docked mover's rear bumper stops at REAR_X, 2 m short of the wall; its origin sits 7.8 m ahead of the bumper
  const WALL_X = 66, LANE_X = 43, REAR_X = 64, DOCK_X = REAR_X - 7.8, BELT_X = 64.6, PULL = 13;
  const PREFIX = { 'Steel Mill': 'STL', 'Copper Refinery': 'CU', 'Chemical Plant': 'CHM', Sawmill: 'SAW', 'Glass Works': 'GLS', 'Aluminium Smelter': 'ALU',
    'Wire Mill': 'WIR', 'Motor Works': 'MOT', 'Circuit Fab': 'PCB', 'Panel Press': 'PNL', 'Moulding Shop': 'MLD', 'Frame Shop': 'FRM' };
  const ACCENT = { Electronics: 0x2f56e0, Appliances: 0x1aa6b7, 'Auto Parts': 0x6a7194, Beverages: 0x3a6ff7, Furniture: 0xb5543d, Pharma: 0x37b26c,
    'Steel Mill': 0x4a5578, 'Copper Refinery': 0xc87533, 'Chemical Plant': 0x37b26c, Sawmill: 0x9c7a5b, 'Glass Works': 0x1aa6b7, 'Aluminium Smelter': 0x9aa1c4,
    'Wire Mill': 0xb86a2c, 'Motor Works': 0x3a4166, 'Circuit Fab': 0x2f8f57, 'Panel Press': 0x6a7194, 'Moulding Shop': 0x2f56e0, 'Frame Shop': 0xa0754e,
    'E-Bikes': 0x2aa198, 'Solar Panels': 0x2140b8, Machinery: 0xf0b429 };
  const IN_POS = [[13, 31], [28, 31], [13, 13]];
  const PROC_NAME = { smelter: 'Foundry + assembly', press: 'Moulding + assembly', tanks: 'Mixing + bottling', sawmill: 'Woodshop + upholstery',
    blast: 'Blast furnace + coil line', refinery: 'Smelting + wire drawing', chem: 'Distillation + polymerisation', saw: 'Debarking + sawing', glassworks: 'Melting + float line',
    potline: 'Electrolysis potline + ingot casting' };

  class Factory extends WT.Facility {
    constructor(plot, partner, recipeName) {
      const name = recipeName || WT.pick(WT.SUP.ASSEMBLY);
      super('Factory', PREFIX[name] || 'FAC', name, plot);
      const S = WT.SUP;
      this.lineName = name;
      this.recipe = S.PLANTS[name];
      this.intermediate = !!this.recipe.out;
      this.tier = this.recipe.tier;
      this.partner = this.intermediate ? null : partner || null;
      this.line = { name, colors: this.recipe.colors };
      this.name = this.intermediate ? name : name + ' Plant';
      this.docks = DOCKS.map((z, i) => ({ n: i + 1, z, truck: null, ops: this.intermediate && i >= 2 ? ['ship'] : ['unload'] }));
      this.income = 14000;
      this.site = { x: 84, z: 0, w: 36, d: 82, h: 14 };
      this.produced = 0;
      this.cap = this.intermediate ? 120 : 60;
      this.stock = {};
      // every plant is commissioned with half a store of each input; after that only delivered orders refill it
      this.recipe.in.forEach((m) => (this.stock[m] = this.cap * 0.5));
      this.outStock = this.intermediate ? 14 : 0;
      this.outCap = 80;
      this.emitters = [];
      this.starved = null;
      this.blocked = false;
    }
    get gateIn() { return { A: this.plot.A, z: this.toWorld(0, 46)[1] }; }
    get gateOut() { return { A: this.plot.A, z: this.toWorld(0, -46)[1] }; }
    // trucks without a bay wait on the entry road inside the gate
    stagePath() { return [[0, 46], [26, 46]].map(([x, z]) => this.toWorld(x, z)); }
    get stageSkip() { return 1; }
    get stageRoom() { return 2; } // deliveries booked beyond the free bays: they queue on the entry road
    // down the bypass lane and past the bay ...
    inPath(d) { return [[0, 46], [LANE_X, 46], [LANE_X, d.z - PULL]].map(([x, z]) => this.toWorld(x, z)); }
    // ... reverse square onto the dock door ...
    dockPath(d) { return [[LANE_X, d.z - PULL], [LANE_X, d.z], [DOCK_X, d.z]].map(([x, z]) => this.toWorld(x, z)); }
    // ... then pull out onto the lane and on to the south gate
    outPath(d) { return [[DOCK_X, d.z], [LANE_X, d.z], [LANE_X, -46], [0, -46]].map(([x, z]) => this.toWorld(x, z)); }

    build() {
      this.pad();
      this.addGates();
      const g = this.group, S = this.structure, acc = ACCENT[this.lineName];
      W.flat(g, 26, 92, W.COL.apron, 53, 0, 0.026);
      W.flat(g, 6, 98, W.COL.road, LANE_X, 0, 0.029);
      W.flat(g, LANE_X + 3, 6, W.COL.road, (LANE_X + 3) / 2, 46, 0.029);
      W.flat(g, LANE_X + 3, 6, W.COL.road, (LANE_X + 3) / 2, -46, 0.029);
      const yel = [], arrows = [];
      // a bay box square to each dock door (a docked mover runs 13.2 m out from its bumper), with a stop line at the
      // bumper, guide lines out to the lane and arrows down the one-way lane
      const guide = [];
      for (const d of DOCKS) {
        W.dashRect(yel, REAR_X - 6.6, d, 13.6, 3.8, 1.1, 0.6, 0.2);
        guide.push({ x: REAR_X + 0.2, z: d, len: 0.35, w: 3.4 });
        for (const s of [-1, 1]) W.dashLine(guide, REAR_X - 13.4, d + s * 2.4, LANE_X + 4, d + s * 2.4, 1.2, 0.9, 0.16);
      }
      for (let z = 40; z > -44; z -= 12) arrows.push({ x: LANE_X, z, len: 2.2, w: 0.5, rot: Math.PI / 2 });
      W.dashes(g, guide, 0xffffff, 0.06);
      W.dashes(g, yel, W.COL.yellow, 0.06);
      W.dashes(g, arrows, 0xffffff, 0.06);
      // every kind of plant has its own design: shed roof, height and cladding, and the process plant beside it
      const D = WT.PLANT_DESIGN[this.lineName], sh = D.shed, H = sh.h || 13, rise = sh.rise === undefined ? (sh.roof === 'barrel' ? 5 : 3.2) : sh.rise;
      const hf = new T.Group();
      hf.rotation.y = -Math.PI / 2;
      hf.position.x = WALL_X;
      S.add(hf);
      M.shed(hf, {
        x0: -40, x1: 40, z0: -36, z1: 0, h: H, rise, doors: DOCKS, roof: sh.roofCol, colors: sh.wall, doorW: 4.6, doorH: 4.8,
        sawtooth: sh.roof === 'sawtooth', flat: sh.roof === 'flat', barrel: sh.roof === 'barrel', monitor: sh.roof === 'monitor',
        extra: (b) => b.box(80.2, 1.2, 36.2, acc, 0, H - 3.5, -18),
      });
      const b = new M.MB();
      // roof ventilators: over the saw-tooth teeth, or along the ridge of a pitched, vaulted or monitor roof (flat roofs
      // carry their own plant)
      const fanAt = sh.roof === 'flat' ? [] : sh.roof === 'sawtooth' ? [-30, -10, 10].map((z) => [78, H + 3.8, z])
        : [-28, 0, 28].map((z) => [84, H + rise + (sh.roof === 'monitor' ? 2 : 0), z]);
      for (const [x, y, z] of fanAt) b.box(4, 1.6, 4, 0xb9bfd8, x, y, z);
      // belt bridge truss over the apron (no posts in the truck lane)
      b.box(30, 0.5, 0.6, 0x9aa1c4, 52, 6.6, -24.8); b.box(30, 0.5, 0.6, 0x9aa1c4, 52, 6.6, -23.2);
      for (let x = 38; x <= 66; x += 3) b.boxC(0.18, 1.6, 0.18, 0x9aa1c4, x, 7.2, -24.8, 0, 0, 0.6);
      b.box(1.2, 7, 1.2, 0x9aa1c4, 37.5, 0, -24); b.box(1.2, 7, 1.2, 0x9aa1c4, 65, 0, -24);
      const stacks = [];
      const fx = D.build(b, { acc, stack: (x, y, z, c = 0xeef0fa) => stacks.push({ p: [x, y, z], c }) }) || {};
      S.add(b.mesh());
      (fx.meshes || []).forEach((m) => S.add(m));
      if (fx.glow) {
        this.furnace = new T.Mesh(new T.BoxGeometry(...fx.glow.size), new T.MeshBasicMaterial({ color: 0xff8a2a }));
        this.furnace.position.set(...fx.glow.at);
        S.add(this.furnace);
      }
      if (fx.blade) {
        this.blade = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 0.15, 16), M.mat(0xb8c2dc));
        this.blade.rotation.x = Math.PI / 2;
        this.blade.position.set(...fx.blade);
        S.add(this.blade);
      }
      this.fans = fanAt.map(([x, y, z]) => { const f = M.fan(); f.position.set(x, y + 1.7, z); S.add(f); return f; });
      // a pod plant flies its pod's colours at the gate
      if (this.pod) {
        const pb = new M.MB();
        pb.box(0.3, 7, 0.3, 0x9aa1c4, 3, 0, 37);
        pb.box(0.12, 2.2, 3.4, this.pod.color, 3, 4.6, 38.8);
        S.add(pb.mesh());
      }
      this.stacks = stacks.map((s) => { const o = new T.Object3D(); o.position.set(...s.p); S.add(o); return { o, c: s.c }; });
      // physical inventory yards
      const MAT = WT.SUP.MAT;
      this.piles = {};
      this.recipe.in.forEach((m, i) => (this.piles[m] = new FX.Stockpile(this.group, IN_POS[i][0], IN_POS[i][1], m, MAT[m].item === 'log' ? [1, 5, 3] : MAT[m].item === 'plank' ? [2, 4, 3] : [3, 4, 3])));
      if (this.intermediate) this.outPile = new FX.Stockpile(this.group, 30, 8, this.recipe.out, MAT[this.recipe.out].item === 'plank' ? [1, 2, 3] : MAT[this.recipe.out].item === 'log' ? [1, 2, 3] : [3, 2, 3]);
    }
    activate() {
      super.activate();
      const g = this.group, S = WT.SUP, proc = this.recipe.proc;
      const prim = S.MAT[this.recipe.in.find((m) => S.MAT[m].item) || this.recipe.in[0]];
      this.inBelt = new FX.Conveyor(g, [[19, 1.2, 25], [19, 1.2, 6], [26, 1.2, -6], [26, 1.2, -13]], { item: prim.item || 'can', speed: 3.5, spacing: 1.4, colors: prim.colors || [0xdfe3f2, 0xcfd5ee] });
      const outMat = this.intermediate ? S.MAT[this.recipe.out] : null;
      const midItem = outMat ? outMat.item || 'can' : { smelter: 'ingot', press: 'plank', tanks: 'can', sawmill: 'plank' }[proc];
      const midCol = outMat ? outMat.colors || [0xe9ecf7] : { smelter: [0xff9a3c, 0xffb347], press: [0xb8c2dc, 0xd6dbef], tanks: this.recipe.colors, sawmill: [0xdcb47e, 0xe2c79b] }[proc];
      this.midBelt = new FX.Conveyor(g, [[33.5, 3.4, -24], [37.5, 7.6, -24], [52, 7.6, -24], [67, 7.6, -24], [70, 7.6, -24]], { item: midItem, speed: 4, spacing: 1.7, glow: proc === 'smelter', colors: midCol, noPost: (x) => x > 36 && x < 68 });
      // roller beds from beside the parked mover straight through the dock door
      this.docks.forEach((d) => {
        if (d.ops[0] === 'ship') {
          d.obelt = new FX.Conveyor(g, [[70, 1.3, d.z], [67, 1.3, d.z], [BELT_X, 1.3, d.z]], { item: outMat.item || 'can', speed: 3, spacing: 1.4, colors: outMat.colors || [0xe9ecf7], onArrive: (it) => d.onOut && d.onOut(it) });
          return;
        }
        d.belt = new FX.Conveyor(g, [[BELT_X, 1.3, d.z], [67, 1.3, d.z], [70.5, 1.3, d.z]], { item: 'carton', speed: 3, spacing: 1.3 });
        d.cbelt = d.belt;
      });
      this.stacks.forEach((s) => this.emitters.push(FX.emitter(s.o, { rate: 1.6, color: s.c, size0: 3, size1: 14, life: 6, vy: 4.5, op: 0.55, jitter: 0.6 })));
      this.connectPartner();
      WT.spawn(this.run());
    }
    connectPartner() {
      const wh = this.partner;
      if (!wh || !wh.active || this.outBelt) return;
      const dir = Math.sign(wh.plot.zc - this.plot.zc) * this.plot.s;
      const a = this.toWorld(90, 36 * dir), b = this.toWorld(90, 50 * dir), c = wh.toWorld(90, -52 * dir), d = wh.toWorld(90, -44 * dir);
      this.outBelt = new FX.Conveyor(WT.scene, [[a[0], 8, a[1]], [b[0], 9, b[1]], [c[0], 9, c[1]], [d[0], 8, d[1]]], {
        item: 'carton', speed: 5, spacing: 1.5, colors: this.recipe.colors,
        onArrive: () => { wh.stock = Math.min(wh.capacity, wh.stock + 1); wh.product = this.lineName; WT.G && WT.G.earn(700, this); this.produced++; },
      });
    }
    *run() {
      let tIn = 0, tMid = 0, tOut = 0, tCycle = 0;
      // refining runs fastest; a component plant draws at a rate two refineries' worth of stock can keep up with, and
      // final assembly at a rate one component plant feeds two lines
      const need = { 1: 0.4, 2: 0.22, 3: 0.1 }[this.tier] || 0.12;
      // one plant of each kind serves every line that uses its output: each unit of input yields two of output
      const yieldK = this.tier === 1 ? 2 : this.tier === 2 ? 2.2 : 1;
      while (true) {
        const dt = WT.sim.dt;
        tIn += dt; tMid += dt; tOut += dt; tCycle += dt;
        const lack = this.recipe.in.find((m) => this.stock[m] < need);
        this.starved = lack || null;
        this.blocked = this.intermediate && this.outStock >= this.outCap;
        const running = !lack && !this.blocked;
        if (tCycle > 1.0) {
          tCycle = 0;
          if (running) {
            for (const m of this.recipe.in) this.stock[m] -= need;
            if (this.intermediate) { this.outStock = Math.min(this.outCap, this.outStock + need * yieldK); this.produced += need * yieldK; WT.G && WT.G.earn(300, this); }
          }
          for (const m of this.recipe.in) this.piles[m].set(this.stock[m] / this.cap);
          if (this.outPile) this.outPile.set(this.outStock / this.outCap);
        }
        if (running) {
          if (tIn > 0.7) { tIn = 0; this.inBelt.push(); }
          if (tMid > 1.1) { tMid = 0; this.midBelt.push(); }
          if (this.outBelt && tOut > 0.9) { tOut = 0; this.outBelt.push(); }
        }
        this.emitters.forEach((e) => (e.rate = running ? 1.6 : 0.15));
        for (const f of this.fans) f.rotation.y += dt * (running ? 9 : 1.5);
        if (this.furnace) this.furnace.material.color.setHSL(0.07, 1, running ? 0.55 + Math.sin(performance.now() / 300) * 0.08 : 0.25);
        if (this.blade && running) this.blade.rotation.y += dt * 20;
        this.income = running ? 14000 : 3000;
        if (!this.outBelt && this.partner && this.partner.active) this.connectPartner();
        yield;
      }
    }
    doors2(c) {
      const len = c.len || 11, w = 2.6, h = 2.7, leaves = [];
      for (const s of [1, -1]) {
        const piv = new T.Group();
        piv.position.set(-len / 2 - 0.05, 0, (s * w) / 2);
        const leaf = new T.Mesh(new T.BoxGeometry(0.1, h - 0.1, w / 2), M.mat(0x6a7194));
        leaf.position.set(0, h / 2, (-s * w) / 4);
        piv.add(leaf);
        c.mesh.add(piv);
        leaves.push([piv, s]);
      }
      return leaves;
    }
    // a transfer hose from the coupling on the dock wall down to the outlet on the back of the tank
    *hose(t, d, n) {
      t.status = 'Coupling hose';
      const len = Math.hypot(WALL_X - REAR_X + 0.3, 1.4);
      const hose = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, len, 8), M.mat(0x22263d));
      hose.position.set((WALL_X + REAR_X - 0.3) / 2, 2.6, d.z + 0.6);
      hose.rotation.z = Math.PI / 2 + Math.atan2(1.4, WALL_X - REAR_X + 0.3);
      hose.scale.y = 0.01;
      this.group.add(hose);
      yield* WT.tween(0.8, (k) => (hose.scale.y = Math.max(0.01, k)));
      t.status = 'Pumping';
      while (t.loaded < n) { t.loaded++; yield* WT.sleep(0.6); }
      yield* WT.tween(0.6, (k) => (hose.scale.y = Math.max(0.01, 1 - k)));
      this.group.remove(hose);
    }
    // world position of a point on a belt
    beltPoint(belt, i) {
      const p = belt.pts[i < 0 ? belt.pts.length + i : i];
      belt.mesh.parent.updateWorldMatrix(true, false);
      return belt.mesh.parent.localToWorld(new T.Vector3(p[0], p[1] + 0.2, p[2]));
    }
    // where cargo enters/leaves a closed trailer or box: just inside the rear doors
    rearPoint(t) {
      const c = t.mesh.userData.cargo;
      c.updateWorldMatrix(true, false);
      return c.localToWorld(new T.Vector3(-4.6, 0.6, 0));
    }
    // cartons from a closed box or ULD: carried out of the doors and across onto the dock belt one by one
    *unloadClosed(t, belt, col) {
      const to = this.beltPoint(belt, 0);
      while (t.loaded < t.total) {
        const last = belt.items[belt.items.length - 1];
        if (last && last.s < belt.spacing + 0.5) { yield; continue; }
        const c = col() || WT.pick(M.P.carton);
        t.loaded++;
        yield* FX.hop(this.rearPoint(t), to, c, 0.42, 'carton');
        while (!belt.push(c)) yield;
      }
    }
    // take items one by one off an open load (truck bed or open-frame container) and onto the dock belt
    *unloadOpen(t, belt, unit, col, item) {
      const to = this.beltPoint(belt, 0);
      while (t.loaded < t.total) {
        const last = belt.items[belt.items.length - 1];
        if (last && last.s < belt.spacing + 0.5) { yield; continue; }
        const from = unit.topPoint(), c = col();
        t.loaded++;
        unit.set(1 - t.loaded / t.total);
        yield* FX.hop(from, to, c, 0.42, item);
        while (!belt.push(c)) yield;
      }
    }
    *serve(t, leg) {
      const S = WT.SUP, d = leg.dock;
      t.where = `${this.id} · Dock ${d.n}`;
      t.loaded = 0;
      if (leg.op === 'ship') {
        const po = leg.po || t.po, outM = S.MAT[this.recipe.out];
        t.total = Math.max(3, Math.round((po ? po.qty : 10) / 1.5));
        if (po) S.ev(po, `Loading · ${t.id} at ${this.id}`);
        // a ring transfer leaves in a container on a flat mover: an ISO tank is pumped full, an open box loaded in view
        const cont = t.container, into = cont && cont.load ? cont.load : t.bedLoad;
        if (t.trailer === 'tanker' || (cont && cont.tank)) yield* this.hose(t, d, t.total);
        else {
          // each piece rides the dock belt out, then is swung onto the bed (or into the trailer)
          t.status = 'Loading';
          const from = this.beltPoint(d.obelt, -1), mat = this.recipe.out;
          let landed = 0;
          d.onOut = (it) => WT.spawn((function* () {
            yield* FX.hop(from, into ? into.topPoint() : this.rearPoint(t), it.c, 0.42, outM.item || 'can');
            landed++;
            if (cont && cont.load) cont.load.set(landed / t.total); else t.setBedLoad(mat, landed / t.total);
          }).call(this));
          while (t.loaded < t.total) { if (d.obelt.push(WT.pick(outM.colors || [0xe9ecf7]))) { t.loaded++; yield* WT.sleep(0.45); } else yield; }
          while (landed < t.total) yield;
          d.onOut = null;
        }
        if (cont && po) { S.fillPO(cont, po); cont.status = 'Loaded'; cont.loc = t.id; S.note(cont, `Loaded with ${outM.name} at ${this.id} for ${po.to.id} (${po.id})`); }
        if (po) S.ev(po, `In transit · ${t.id} → ${cont && po.ring ? po.ring.from.id + ' for the ring' : po.to.id}`);
        yield* WT.sleep(0.8);
        this.moves++;
        return;
      }
      const po = t.po && t.po.to === this ? t.po : null;
      const mat = po ? po.mat : t.cargo && t.cargo.mat;
      const M_ = mat ? S.MAT[mat] : null;
      const qty = po ? po.qty : 8;
      t.total = Math.max(3, Math.round(qty / 1.5));
      if (po) S.ev(po, `Receiving · ${t.id} at ${this.id} dock ${d.n}`);
      const col = () => (M_ && M_.colors ? WT.pick(M_.colors) : undefined);
      if (t.ulds && t.ulds.length) {
        t.status = 'Unloading ULD';
        for (const u of t.ulds) { S.note(u, `Broken down at ${this.id}`); u.status = 'Unloading'; u.loc = this.id; }
        yield* this.unloadClosed(t, d.belt, col);
        for (const u of t.ulds) { S.empty(u); u.status = 'Empty'; S.note(u, 'Empty — returning to airport'); }
      } else if (t.container && t.container.open) {
        // open-top / flat-rack: the load is lifted straight out of the frame
        const c = t.container;
        t.status = 'Unloading';
        c.status = 'Unloading'; c.loc = this.id;
        S.note(c, `Unloading at ${this.id}`);
        yield* this.unloadOpen(t, d.cbelt, c.load, col, M_ ? M_.item : undefined);
        S.empty(c);
        c.status = 'Empty'; c.loc = t.id;
        S.note(c, `Emptied at ${this.id}`);
      } else if (t.container && t.container.tank) {
        // ISO tank: pumped off through the transfer hose
        const c = t.container;
        c.status = 'Discharging'; c.loc = this.id;
        S.note(c, `Pumped off at ${this.id}`);
        yield* this.hose(t, d, t.total);
        S.empty(c);
        c.status = 'Empty'; c.loc = t.id;
        S.note(c, `Emptied at ${this.id}`);
      } else if (t.container) {
        const c = t.container;
        t.status = 'Destuffing';
        c.status = 'Destuffing'; c.loc = this.id;
        S.note(c, `Opened at ${this.id}`);
        const leaves = this.doors2(c);
        yield* WT.tween(1.2, (k) => leaves.forEach(([p, s]) => (p.rotation.y = s * k * 1.9)));
        yield* this.unloadClosed(t, d.cbelt, col);
        yield* WT.tween(1.0, (k) => leaves.forEach(([p, s]) => (p.rotation.y = s * (1 - k) * 1.9)));
        leaves.forEach(([p]) => c.mesh.remove(p));
        S.empty(c);
        c.status = 'Empty'; c.loc = t.id;
        S.note(c, `Emptied at ${this.id}`);
      } else if (t.trailer === 'tanker') {
        yield* this.hose(t, d, t.total);
      } else if (t.bedLoad) {
        t.status = 'Unloading';
        yield* this.unloadOpen(t, d.belt, t.bedLoad, col, M_ ? M_.item : t.bedLoad.mat && S.MAT[t.bedLoad.mat].item);
      } else {
        t.status = 'Unloading';
        yield* this.unloadClosed(t, d.belt, col);
      }
      if (po) { S.delivered(po); t.po = null; }
      t.cargo = null;
      yield* WT.sleep(0.8);
      this.moves++;
    }
    card() {
      const S = WT.SUP;
      const bars = this.recipe.in.map((m) => {
        const oo = S.openCount(this, m);
        return { label: S.MAT[m].name, val: this.stock[m], max: this.cap, sub: oo ? oo + ' on order' : '' };
      });
      if (this.intermediate) bars.push({ label: 'Output · ' + S.MAT[this.recipe.out].name, val: this.outStock, max: this.outCap });
      const consumers = this.intermediate ? S.plants().filter((p) => p.recipe.in.includes(this.recipe.out)).map((p) => p.id) : [];
      const status = !this.active ? 'Under construction' : this.starved ? 'Starved' : this.blocked ? 'Output full' : 'Running';
      return this.cardBase({
        kicker: `Facility · Tier ${this.tier} · ${S.TIER_NAME[this.tier]}`, icon: this.tier === 1 ? '🔥' : this.tier === 2 ? '⚙️' : '🏭',
        sub: `${this.recipe.in.map((m) => S.MAT[m].name).join(' + ')} → ${this.intermediate ? S.MAT[this.recipe.out].name : this.lineName}`,
        status, statusTone: status === 'Running' ? 'green' : 'amber',
        where: this.starved ? 'Waiting on ' + S.MAT[this.starved].name : this.intermediate ? (consumers.length ? 'Supplies ' + consumers.slice(0, 3).join(', ') : 'No customers yet') : this.partner ? 'Feeds ' + this.partner.id : 'Standalone',
        bars,
        rows: [...(this.pod ? [['Block', `${this.pod.key} · ${this.pod.name} · station ${(this.pod.depot && this.pod.depot.id) || 'planned'}`]] : []), ['Process', PROC_NAME[this.recipe.proc]], ['Produced', WT.fmtNum(this.produced) + (this.intermediate ? ' t' : ' units')],
          ['Open orders', String(S.orders.filter((o) => o.to === this && o.status !== 'Delivered' && o.status !== 'Cancelled').length)],
          ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
      });
    }
  }
  WT.Factory = Factory;
})();
