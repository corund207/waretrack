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
  const WALLS = [['#e9ecf7', '#d3d8ec'], ['#dfe6f2', '#c7d0e6'], ['#f1ede6', '#ddd6ca']];
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
      this.wall = WT.pick(WALLS);
      this.roof = WT.pick([0x3f66ee, 0x2aa198, 0x4a5578, 0x3f66ee]);
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
      const g = this.group, S = this.structure, proc = this.recipe.proc, acc = ACCENT[this.lineName];
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
      const hf = new T.Group();
      hf.rotation.y = -Math.PI / 2;
      hf.position.x = WALL_X;
      S.add(hf);
      M.shed(hf, {
        x0: -40, x1: 40, z0: -36, z1: 0, h: 13, doors: DOCKS, sawtooth: true, roof: this.roof, colors: this.wall, doorW: 4.6, doorH: 4.8,
        extra: (b) => b.box(80.2, 1.2, 36.2, acc, 0, 9.5, -18),
      });
      const b = new M.MB();
      for (const z of [-30, -10, 10]) b.box(4, 1.6, 4, 0xb9bfd8, 78, 16.8, z);
      // belt bridge truss over the apron (no posts in the truck lane)
      b.box(30, 0.5, 0.6, 0x9aa1c4, 52, 6.6, -24.8); b.box(30, 0.5, 0.6, 0x9aa1c4, 52, 6.6, -23.2);
      for (let x = 38; x <= 66; x += 3) b.boxC(0.18, 1.6, 0.18, 0x9aa1c4, x, 7.2, -24.8, 0, 0, 0.6);
      b.box(1.2, 7, 1.2, 0x9aa1c4, 37.5, 0, -24); b.box(1.2, 7, 1.2, 0x9aa1c4, 65, 0, -24);
      const stacks = [];
      const stack = (x, y, z, c = 0xeef0fa) => stacks.push({ p: [x, y, z], c });
      if (proc === 'smelter') {
        b.box(22, 9, 18, 0xb9bfd8, 22, 0, -24); b.box(22.4, 0.6, 18.4, 0x3a4166, 22, 9, -24);
        M.chimney(b, 14, -28, 1.4, 20, 0xb9bfd8); stack(14, 20.6, -28, 0x9aa1c4);
      } else if (proc === 'press') {
        b.box(24, 11, 20, 0xd6dbef, 22, 0, -24); b.box(24.4, 0.6, 20.4, acc, 22, 11, -24);
        M.silo(b, 8, -37, 2.4, 10, 0xf6f7fd); M.silo(b, 8, -30, 2.4, 10, 0xf6f7fd);
      } else if (proc === 'tanks') {
        for (const [x, z, h] of [[10, -40, 12], [18, -40, 14]]) { b.cyl(3, 3, h, 0xe1e6f2, x, h / 2, z, 18); b.sphere(3, 0xe1e6f2, x, h, z, 1, 0.45, 1, 14); b.cyl(3.05, 3.05, 0.4, acc, x, h * 0.6, z, 18); }
        b.box(22, 8, 18, 0xe9ecf7, 22, 0, -22); b.box(22.4, 0.6, 18.4, acc, 22, 8, -22);
      } else if (proc === 'sawmill') {
        b.box(22, 0.4, 18, 0x9c7a5b, 22, 8, -24);
        for (const x of [12, 22, 32]) for (const z of [-32, -16]) b.box(0.6, 8, 0.6, 0x7a5b46, x, 0, z);
        b.box(14, 2.4, 3, 0x9aa1c4, 22, 0, -24);
      } else if (proc === 'blast') {
        b.cyl(4.2, 5, 26, 0x6a7194, 20, 13, -24, 16);
        b.cyl(2.6, 4.2, 5, 0x4a5578, 20, 28.5, -24, 16);
        b.cyl(0.8, 0.8, 10, 0x9aa1c4, 20, 36, -24, 8);
        for (const z of [-36, -30]) { b.cyl(2.3, 2.3, 18, 0xd6dbef, 8, 9, z, 14); b.sphere(2.3, 0xd6dbef, 8, 18, z, 1, 0.6, 1, 12); }
        b.box(14, 1, 1, 0x9aa1c4, 14, 14, -33);
        b.box(16, 6, 12, 0x3a4166, 30, 0, -14);
        M.chimney(b, 30, -40, 1.8, 30, 0xb9bfd8); stack(30, 30.6, -40, 0x9aa1c4);
        stack(20, 41, -24, 0xffffff);
      } else if (proc === 'refinery') {
        b.box(22, 10, 16, 0xb9bfd8, 22, 0, -26); b.box(22.4, 0.6, 16.4, acc, 22, 10, -26);
        b.cyl(2.6, 2.6, 6, 0xc87533, 12, 13, -24, 14, 0, 0, 0.5);
        M.chimney(b, 30, -38, 1.6, 26, 0xb9bfd8); stack(30, 26.6, -38, 0x9aa1c4);
      } else if (proc === 'chem') {
        for (const [x, z, h] of [[10, -20, 30], [16, -16, 24], [10, -12, 20]]) {
          b.cyl(1.4, 1.4, h, 0xe9ecf7, x, h / 2, z, 12);
          for (let y = 5; y < h; y += 5) b.cyl(2, 2, 0.3, 0x9aa1c4, x, y, z, 12);
        }
        for (const [x, z] of [[26, -24], [26, -36]]) { b.sphere(4, 0xf3f5fd, x, 6, z, 1, 1, 1, 16); for (let i = 0; i < 4; i++) b.box(0.4, 4, 0.4, 0x9aa1c4, x + Math.cos(i * 1.57) * 3, 0, z + Math.sin(i * 1.57) * 3); }
        b.box(20, 0.6, 0.6, 0x9aa1c4, 18, 8, -28);
        b.cyl(0.5, 0.6, 26, 0xd9434b, 8, 13, -38, 8);
        stack(8, 27, -38, 0xffb347);
      } else if (proc === 'saw') {
        b.box(24, 0.4, 16, 0x9c7a5b, 22, 7, -24);
        for (const x of [11, 22, 33]) for (const z of [-31, -17]) b.box(0.6, 7, 0.6, 0x7a5b46, x, 0, z);
        b.box(16, 2.2, 3, 0x9aa1c4, 22, 0, -24);
      } else if (proc === 'potline') {
        // long low potroom with roof vents, alumina silos, fume-treatment stack
        b.box(30, 7, 12, 0xd6dbef, 22, 0, -26); b.box(30.4, 0.6, 12.4, acc, 22, 7, -26);
        for (let x = 10; x <= 34; x += 4) b.box(2.4, 1.6, 2.4, 0xb9bfd8, x, 7.6, -26);
        M.silo(b, 8, -38, 2.6, 13, 0xe9ecf7); M.silo(b, 14, -38, 2.6, 13, 0xe9ecf7);
        M.chimney(b, 36, -38, 1.5, 24, 0xb9bfd8); stack(36, 24.6, -38, 0x9aa1c4);
      } else if (proc === 'glassworks') {
        b.box(18, 9, 14, 0xb9bfd8, 16, 0, -24); b.box(18.4, 0.6, 14.4, acc, 16, 9, -24);
        b.box(3, 3, 30, 0xdfe3f2, 30, 0, -24);
        M.chimney(b, 12, -38, 1.6, 24, 0xb9bfd8); stack(12, 24.6, -38, 0x9aa1c4);
      }
      M.chimney(b, 94, -25, 1.6, 24); stack(94, 24.6, -25);
      if (!this.intermediate) { M.chimney(b, 94, 25, 1.6, 22); stack(94, 22.6, 25); }
      S.add(b.mesh());
      if (['smelter', 'blast', 'refinery', 'glassworks', 'potline'].includes(proc)) {
        const gl = proc === 'glassworks';
        this.furnace = new T.Mesh(new T.BoxGeometry(gl ? 0.1 : 5.6, 2, gl ? 4 : 0.1), new T.MeshBasicMaterial({ color: 0xff8a2a }));
        if (proc === 'blast') this.furnace.position.set(20, 2, -18.9);
        else if (gl) this.furnace.position.set(25.1, 2.4, -24);
        else this.furnace.position.set(22, 3, proc === 'refinery' ? -17.9 : -14.9);
        S.add(this.furnace);
      }
      if (proc === 'sawmill' || proc === 'saw') {
        this.blade = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 0.15, 16), M.mat(0xb8c2dc));
        this.blade.rotation.x = Math.PI / 2;
        this.blade.position.set(22, 3.4, -24);
        S.add(this.blade);
      }
      this.fans = [-30, -10, 10].map((z) => { const f = M.fan(); f.position.set(78, 18.5, z); S.add(f); return f; });
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
            if (this.intermediate) { this.outStock = Math.min(this.outCap, this.outStock + need); this.produced += need; WT.G && WT.G.earn(300, this); }
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
        if (t.trailer === 'tanker') yield* this.hose(t, d, t.total);
        else {
          // each piece rides the dock belt out, then is swung onto the bed (or into the trailer)
          t.status = 'Loading';
          const from = this.beltPoint(d.obelt, -1), mat = this.recipe.out;
          let landed = 0;
          d.onOut = (it) => WT.spawn((function* () {
            yield* FX.hop(from, t.bedLoad ? t.bedLoad.topPoint() : this.rearPoint(t), it.c, 0.42, outM.item || 'can');
            landed++;
            t.setBedLoad(mat, landed / t.total);
          }).call(this));
          while (t.loaded < t.total) { if (d.obelt.push(WT.pick(outM.colors || [0xe9ecf7]))) { t.loaded++; yield* WT.sleep(0.45); } else yield; }
          while (landed < t.total) yield;
          d.onOut = null;
        }
        if (po) S.ev(po, `In transit · ${t.id} → ${po.to.id}`);
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
        rows: [['Process', PROC_NAME[this.recipe.proc]], ['Produced', WT.fmtNum(this.produced) + (this.intermediate ? ' t' : ' units')],
          ['Open orders', String(S.orders.filter((o) => o.to === this && o.status !== 'Delivered' && o.status !== 'Cancelled').length)],
          ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
      });
    }
  }
  WT.Factory = Factory;
})();
