/* WareTrack – the industrial rail network
   Every factory lives in a pod west of the park, set apart by forest, each pod with a rail depot of its own:
   four pods south of the highway refine and make components, two north of it do final assembly beside their
   distribution centres. The network's heart is a circular hub north of the highway, a one-way rail roundabout.
   Branch lines leave it to every pod and to the mainline:
     · a double-track line over the highway on a viaduct to the southern pods' loop (pods A–D),
     · a side loop past each northern pod's depot (pods E and F),
     · an entry link from the eastbound main and an exit link onto the westbound main, so trains run in from the edge
       of the map, round the hub to their pods and back out again.
   Every track is one-way, so trains only ever follow or merge; a train takes a merge only when it is clear.
   Ring shuttles carry boxes between pods. Industrial freight brings imports for the pods straight from the
   mainline to their depots and takes the pods' product crates away. A mover covers the last stretch from a
   depot to a plant's dock. Empties ride back to the depot that issued them. */
(function () {
  const T = THREE, M = WT.M, W = WT.W, CR = WT.CraneOps;
  const [AW, AE] = W.RING_AVENUES;
  const R = (WT.RING = { built: false, building: false, trains: [], stats: { moved: 0, empties: 0, issued: 0, calls: 0, freight: 0, imported: 0, exported: 0 } });
  R.EXPORT = { id: 'export', name: 'Export by rail' }; // the destination of a crate that leaves on industrial freight
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const XW = AW + 8 + 104, XE = AE - 8 - 104; // depot platform tracks on the inner edge of the depot plots
  R.center = [(XW + XE) / 2, -120];

  /* ================= pods ================= */
  R.PODS = [
    { key: 'A', name: 'Metals', tier: 1, A: AW, h: 1, rows: [0, 1], color: 0xd9622b, plants: ['Steel Mill', 'Copper Refinery', 'Aluminium Smelter'] },
    { key: 'B', name: 'Materials', tier: 1, A: AW, h: 1, rows: [4, 3], color: 0x37b26c, plants: ['Chemical Plant', 'Sawmill', 'Glass Works'] },
    { key: 'C', name: 'Drives & Circuits', tier: 2, A: AE, h: 1, rows: [0, 1], color: 0x2f56e0, plants: ['Wire Mill', 'Motor Works', 'Circuit Fab'] },
    { key: 'D', name: 'Bodies & Fittings', tier: 2, A: AE, h: 1, rows: [4, 3], color: 0x7a5cd6, plants: ['Panel Press', 'Moulding Shop', 'Frame Shop'] },
    { key: 'E', name: 'Assembly West', tier: 3, A: AW, h: -1, color: 0xf0b429, plants: ['Appliances', 'Auto Parts', 'Machinery', 'Electronics', 'E-Bikes'] },
    { key: 'F', name: 'Assembly East', tier: 3, A: AE, h: -1, color: 0x1aa6b7, plants: ['Beverages', 'Furniture', 'Pharma', 'Solar Panels', null] },
  ];
  const plot = (pod, s, k, extra) => Object.assign(W.makePlot(pod.A, s, pod.h, k), { pod }, extra);
  for (const pod of R.PODS) {
    const sIn = pod.A === AW ? 1 : -1;
    if (pod.tier < 3) {
      // two rows: both plots on the outer side and the far one on the inner side are plants, the inner plot next to
      // the forest gap between the pods is the depot
      const [far, near] = pod.rows;
      pod.slots = [[-sIn, far], [-sIn, near], [sIn, far]].map(([s, k], i) => plot(pod, s, k, { podPlant: pod.plants[i] }));
      pod.dcs = [];
      pod.depotPlot = plot(pod, sIn, near, { podDepot: true });
      pod.z0 = pod.rows[0] === 0 ? 9 : 331; pod.z1 = pod.rows[0] === 0 ? 229 : 553;
      pod.ends = pod.rows[0] === 0 ? [229] : [331, 553];
    } else {
      // the whole avenue half: five assembly lines, each belting its cartons into a distribution centre next door
      // (one centre serves the lines either side of it), and the depot on the inner side mid-way along
      const dc = { o1: plot(pod, -sIn, 1, { podDC: true }), o3: plot(pod, -sIn, 3, { podDC: true }), i1: plot(pod, sIn, 1, { podDC: true }), i3: plot(pod, sIn, 3, { podDC: true }) };
      pod.slots = [[-sIn, 0], [-sIn, 2], [-sIn, 4], [sIn, 0], [sIn, 4]].map(([s, k], i) => plot(pod, s, k, { podPlant: pod.plants[i] }));
      pod.dcs = [dc.o1, dc.o3, dc.o3, dc.i1, dc.i3];
      pod.depotPlot = plot(pod, sIn, 2, { podDepot: true });
      pod.z0 = -553; pod.z1 = -9; pod.ends = [-553];
    }
    pod.depot = null;
  }
  R.podFor = (name) => R.PODS.find((p) => p.plants.includes(name)) || null;
  const idx = (pod, name) => pod.plants.indexOf(name);
  // the pod plot reserved for a plant of this kind, while it is free
  R.slotFor = (name) => {
    const pod = R.podFor(name), p = pod && pod.slots[idx(pod, name)];
    return p && !p.used ? p : null;
  };
  // an assembly line's distribution centre: its plot, and the centre itself once it is planned or built
  R.dcSlot = (name) => { const pod = R.podFor(name); return pod && pod.tier === 3 ? pod.dcs[idx(pod, name)] : null; };
  R.dcOf = (name) => { const p = R.dcSlot(name); return p && p.used && p.used.type === 'Warehouse' ? p.used : null; };
  // pods with a plant but no depot yet (the growth director builds one for each once the network is down)
  R.needsDepot = () => R.PODS.find((pod) => !pod.depot && pod.slots.some((p) => p.used));
  // a transfer goes by rail when both plants sit in different pods whose depots are working
  R.route = (p, q) => {
    const a = p.pod && p.pod.depot, b = q.pod && q.pod.depot;
    return a && b && a !== b && a.active && b.active && R.trains.some((t) => t.role === 'shuttle') ? { from: a, to: b } : null;
  };
  // a pod plant's imports come by industrial freight once its depot and the mainline links are working
  R.serves = (f) => !!(R.built && W.railBuilt && f && f.pod && f.pod.depot && f.pod.depot.active);

  /* ================= track network ================= */
  // one-way edges between nodes; the hub is a circle travelled anticlockwise on the map (south side westward)
  const HX = (XW + XE) / 2, HZ = -300, HR = 110, RZ = W.RAIL.zE, RW = W.RAIL.zW, XO = W.EDGE + 250;
  const hub = (deg) => { const a = (deg * Math.PI) / 180; return [HX + HR * Math.cos(a), HZ + HR * Math.sin(a)]; };
  const arc = (d0, d1) => { const pts = []; for (let d = d0; d < d1 - 0.01; d += 3) pts.push(hub(d)); pts.push(hub(d1)); return pts; };
  // southern loop past pods A–D: the down line from the hub joins its top, the up line leaves just after
  const SX0 = XW, SX1 = XE, SZ0 = 65, SZ1 = 495, SRAD = 60, DX = -1160, UX = -1240, XD = -1110;
  const SWm = [-1195, SZ0], SWd = [-1205, SZ0];
  const NODES = {}, EDGES = [];
  const node = (id) => (NODES[id] = NODES[id] || { id, out: [], in: [], owner: null, waitT: 0 });
  // smooth a polyline into a dense one (fillets of radius r at the corners)
  const smooth = (pts, r) => { const p = WT.buildPath(pts, r), out = []; for (let s = 0; s < p.len; s += 2) { const q = p.at(s); out.push([q.x, q.z]); } const e = p.at(p.len); out.push([e.x, e.z]); return out; };
  function edge(id, from, to, pts, o = {}) {
    const e = Object.assign({ id, from: node(from), to: node(to), pts }, o);
    e.path = WT.buildPath(pts, 0.5);
    e.len = e.path.len;
    e.yAt = o.yAt || (() => 0);
    e.from.out.push(e); e.to.in.push(e);
    EDGES.push(e);
    return e;
  }
  // viaduct profile over the highway: deck 6.5 m up across it, ramps 40 m long either side
  const viaY = (z) => { const a = Math.abs(z); if (a <= 12) return 6.5; if (a >= 52) return 0; const u = (a - 12) / 40; return 6.5 * (1 - u * u * (3 - 2 * u)); };
  const stemY = (e) => (off) => viaY(e.path.at(off).z);
  {
    const J = { Fin: 50, Down: 62, Up: 118, Eout: 130, Ein: 230, In: 262, Out: 278, Fout: 310 };
    const order = Object.entries(J).sort((a, b) => a[1] - b[1]);
    order.forEach(([id, d], i) => {
      const [nid, nd] = order[(i + 1) % order.length];
      edge('hub-' + id, 'h' + id, 'h' + nid, arc(d, nd > d ? nd : nd + 360), { hub: true });
    });
    edge('petal-E', 'hEout', 'hEin', smooth([hub(J.Eout), [XW, -210], [XW, -350], hub(J.Ein)], 18), { petal: 'E' });
    edge('petal-F', 'hFout', 'hFin', smooth([hub(J.Fout), [XE, -350], [XE, -210], hub(J.Fin)], 18), { petal: 'F' });
    const down = edge('down', 'hDown', 'SWm', smooth([hub(J.Down), [DX, -190], [DX, SZ0], SWm], 18), { stem: true });
    down.yAt = stemY(down);
    const up = edge('up', 'SWd', 'hUp', smooth([SWd, [UX, SZ0], [UX, -190], hub(J.Up)], 18), { stem: true });
    up.yAt = stemY(up);
    edge('south-top', 'SWm', 'SWd', [SWm, SWd]);
    edge('south-loop', 'SWd', 'SWm', smooth([SWd, [SX0, SZ0], [SX0, SZ1], [SX1, SZ1], [SX1, SZ0], SWm], SRAD), { loop: true });
    // in from the eastbound main at the west edge of the map, out over the eastbound main onto the westbound one
    edge('entry', 'edgeIn', 'hIn', smooth([[-XO, RZ], [-1330, RZ], [-1290, -615], [-1282, -480], [-1252, -428], hub(J.In)], 30), { main: (p) => p.x < -1335 });
    edge('exit', 'hOut', 'edgeOut', smooth([hub(J.Out), [-1140, -424], [XD, -480], [XD, RW], [-XO, RW]], 30), { main: (p) => p.x < XD - 24 });
  }
  R.EDGES = EDGES; R.NODES = NODES;
  const DIAMOND = { x: XD, z: RZ }; // the exit link crosses the eastbound main here
  // shortest way (by length) from a node to the start of an edge
  function routeTo(fromNode, target) {
    const dist = new Map([[fromNode, 0]]), prev = new Map(), q = [fromNode];
    while (q.length) {
      q.sort((a, b) => dist.get(a) - dist.get(b));
      const n = q.shift();
      if (n === target.from) break;
      for (const e of n.out) {
        const d = dist.get(n) + e.len;
        if (!dist.has(e.to) || d < dist.get(e.to)) { dist.set(e.to, d); prev.set(e.to, e); q.push(e.to); }
      }
    }
    if (!dist.has(target.from)) return null;
    const list = [];
    for (let n = target.from; n !== fromNode; n = prev.get(n).from) list.unshift(prev.get(n));
    return { edges: list, len: dist.get(target.from) };
  }
  // the edge (and offset along it) nearest a world point
  function locate(x, z) {
    let best = null;
    for (const e of EDGES) {
      if (e.main) continue;
      for (let s = 0; s <= e.len; s += 1) { const p = e.path.at(s), d = (p.x - x) ** 2 + (p.z - z) ** 2; if (!best || d < best.d) best = { e, s, d }; }
    }
    return best;
  }

  /* ================= building the network (the "Production ring" project) ================= */
  function sign(lines, w, h, bg) {
    const tex = M.canvasTex(512, Math.round((512 * h) / w), (ctx) => {
      const H = ctx.canvas.height;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, H);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach(([text, size, y]) => { ctx.font = `800 ${size}px Inter, "Segoe UI", Arial`; ctx.fillText(text, 256, y * H); });
    });
    const g = new T.Group(), b = new M.MB();
    for (const s of [-1, 1]) b.box(0.5, h + 3, 0.5, 0x9aa1c4, 0, 0, (s * (w - 0.6)) / 2);
    g.add(b.mesh());
    const p = M.decal(tex, w, h);
    p.material.depthWrite = true; p.material.transparent = false;
    p.rotation.y = -Math.PI / 2; p.position.set(-0.3, 3 + h / 2, 0);
    g.add(p);
    return g;
  }
  // each pod is a precinct of its own: cleared ground, a border in the pod's colour and a hedge along its outer side
  // and its far ends (open to the avenue, the highway and the rail)
  function precinct(g, pod) {
    const sIn = pod.A === AW ? 1 : -1, { z0, z1 } = pod;
    W.clearTrees({ x0: pod.A - 120, x1: pod.A + 120, z0, z1 });
    const line = [], xo = pod.A - sIn * 120, xi = pod.A + sIn * 104;
    W.dashLine(line, xo, z0, xo, z1, z1 - z0, 0, 0.6);
    for (const z of pod.ends) {
      W.dashLine(line, Math.min(xo, pod.A - sIn * 10), z, Math.max(xo, pod.A - sIn * 10), z, 110, 0, 0.6);
      W.dashLine(line, Math.min(xi, pod.A + sIn * 10), z, Math.max(xi, pod.A + sIn * 10), z, 94, 0, 0.6);
    }
    W.dashes(g, line, pod.color, 0.05);
    const b = new M.MB(), shrub = (x, z, i) => b.blob(1.3, i % 3 ? 0x4f7d3a : 0x5c8a42, x, 1.1, z, 1.2, 0.85, 1.2, 1, 0.3, i + 1);
    let i = 0;
    for (let z = z0 + 3; z <= z1 - 3; z += 3.2) shrub(xo - sIn * 2.5, z, i++);
    for (const z of pod.ends) {
      const out = z === Math.max(z0, z1) ? 2.5 : -2.5;
      for (let x = pod.A - sIn * 14; Math.abs(x - pod.A) <= 120; x -= sIn * 3.2) shrub(x, z + out, i++);
      for (let x = pod.A + sIn * 14; Math.abs(x - pod.A) <= 100; x += sIn * 3.2) shrub(x, z + out, i++);
    }
    g.add(b.mesh());
  }
  R.build = function* () {
    R.building = true;
    const g = new T.Group();
    WT.scene.add(g);
    R.PODS.forEach((pod) => precinct(g, pod));
    // lay every edge in turn, off the mainline: ballast and sleepers on the ground, a deck and piers on the viaduct
    const ballast = [], sleepers = [], runs = [], deck = new M.MB();
    let total = 0;
    for (const e of EDGES) {
      const rb = new M.MB();
      for (let s = 0; s < e.len; s += 2) {
        const p = e.path.at(s), y = e.yAt(s);
        if (e.main && e.main(p)) continue;
        if (s % 18 < 2) W.clearTrees({ x0: p.x - 12, x1: p.x + 12, z0: p.z - 12, z1: p.z + 12 });
        const nx = -Math.sin(p.a), nz = Math.cos(p.a);
        for (const o of [-0.75, 0.75]) rb.boxC(2.04, 0.2, 0.16, 0x6a7194, p.x + nx * o, y + 0.15, p.z + nz * o, 0, -p.a, 0);
        if (y < 0.05) {
          if (s % 3 < 2) ballast.push({ x: p.x, z: p.z, len: 3.3, w: 4.6, rot: -p.a, at: total + s });
          sleepers.push({ x: p.x, z: p.z, len: 0.45, w: 2.9, rot: -p.a, at: total + s }, { x: p.x + Math.cos(p.a), z: p.z + Math.sin(p.a), len: 0.45, w: 2.9, rot: -p.a, at: total + s + 1 });
        } else {
          deck.boxC(2.1, 0.7, 4.6, 0xb9bfd8, p.x, y - 0.3, p.z, 0, -p.a, 0);
          for (const o of [-2.2, 2.2]) deck.boxC(2.1, 0.9, 0.25, 0x9aa1c4, p.x + nx * o, y + 0.45, p.z + nz * o, 0, -p.a, 0);
          if (y > 1.4 && s % 14 < 2 && Math.abs(p.z) > 11) deck.box(1.4, y - 0.6, 2.2, 0xa9aec6, p.x, 0, p.z, 0, -p.a, 0);
        }
      }
      const m = rb.mesh(false, true);
      m.visible = false;
      g.add(m);
      runs.push({ m, at: total, e });
      total += e.len;
    }
    const bm = W.dashes(g, ballast, W.COL.ballast, 0.028), sm = W.dashes(g, sleepers, 0xa49c90, 0.06);
    const dm = deck.mesh();
    dm.visible = false;
    g.add(dm);
    bm.count = sm.count = 0;
    const layer = M.trackLayer();
    WT.scene.add(layer);
    let bi = 0, si = 0;
    yield* WT.tween(36, (k) => {
      const d = total * k;
      while (bi < ballast.length && ballast[bi].at <= d) bi++;
      while (si < sleepers.length && sleepers[si].at <= d) si++;
      bm.count = bi; sm.count = si;
      let cur = runs[0];
      for (const r of runs) { r.m.visible = r.at <= d; if (r.at <= d) cur = r; }
      dm.visible = k > 0.2;
      const p = cur.e.path.at(Math.min(cur.e.len, d - cur.at));
      layer.position.set(p.x, cur.e.yAt(Math.min(cur.e.len, d - cur.at)), p.z); layer.rotation.y = -p.a;
    });
    bm.count = ballast.length; sm.count = sleepers.length;
    runs.forEach((r) => (r.m.visible = true));
    dm.visible = true;
    WT.scene.remove(layer);
    // the hub's name board in the middle of the roundabout, facing the highway
    const board = sign([['RAIL HUB', 70, 0.36], ['WareTrack industrial network', 30, 0.72]], 16, 5, '#2f56e0');
    board.rotation.y = -Math.PI / 2;
    board.position.set(HX, 0, HZ + 40);
    g.add(board);
    R.built = true; R.building = false;
  };

  /* ================= pod rail depot ================= */
  // Plot-local layout: entry road along z 46, a bypass lane at x 54 with two crane bays at x 62, the box yard
  // (four rows) and the through track at x 104 under one rail-mounted gantry spanning x 48–114, travelling z −30…30.
  const BAYS = [12, -20], BAY_X = 62, BYP_X = 54, TRACK_X = 104, XC = 81, SPAN = 66, SAFE = 10.5, SPEED = 6, U_MAX = 30;
  const ROWS = [74, 80, 86, 92], COLS = [-26, -13, 0, 13, 26];
  class RingDepot extends WT.Facility {
    constructor(pod) {
      super('Ring depot', 'RD', `Pod ${pod.key} Rail Depot`, pod.depotPlot);
      this.pod = pod;
      pod.depot = this;
      this.docks = BAYS.map((z, i) => ({ n: i + 1, x: BAY_X, z, truck: null, job: null, ops: ['pick', 'drop'] }));
      this.slots = [];
      for (const x of ROWS) for (const z of COLS) this.slots.push({ x, z, items: [] });
      this.jobs = [];
      this.train = null;
      this.pendingDrop = 0; // movers booked to drop a box here
      this.incoming = 0; // boxes on their way here by rail (or booked to be)
      this.income = 6000;
      this.site = { x: XC, z: 0, w: 60, d: 66, h: 18 };
    }
    get gateIn() { return { A: this.plot.A, z: this.toWorld(0, 46)[1] }; }
    get gateOut() { return { A: this.plot.A, z: this.toWorld(0, -46)[1] }; }
    stagePath() { return [[0, 46], [30, 46]].map(([x, z]) => this.toWorld(x, z)); }
    get stageSkip() { return 1; }
    get stageRoom() { return 2; }
    // down the bypass, a gentle change onto the bay, out ahead and back onto the bypass to the exit
    inPath(d) { d = d || this.docks[0]; return [[0, 46], [BYP_X, 46], [BYP_X, d.z + 22], [BAY_X, d.z + 10], [BAY_X, d.z]].map(([x, z]) => this.toWorld(x, z)); }
    outPath(d) { d = d || this.docks[0]; return [[BAY_X, d.z], [BAY_X, d.z - 4], [BYP_X, d.z - 14], [BYP_X, -46], [0, -46]].map(([x, z]) => this.toWorld(x, z)); }
    radius() { return 70; }
    get yaw() { return -Math.PI / 2 + this.plot.rot; }
    local(obj) {
      const v = new T.Vector3();
      obj.getWorldPosition(v);
      this.structure.updateWorldMatrix(true, false);
      return this.structure.worldToLocal(v);
    }
    world(x, y, z) { this.structure.updateWorldMatrix(true, false); return this.structure.localToWorld(new T.Vector3(x, y, z)); }

    build() {
      this.pad();
      this.addGates();
      const g = this.group, S = this.structure, pod = this.pod;
      W.flat(g, BYP_X + 3, 6, W.COL.road, (BYP_X + 3) / 2, 46, 0.029);
      W.flat(g, BYP_X + 3, 6, W.COL.road, (BYP_X + 3) / 2, -46, 0.029);
      W.flat(g, 6, 98, W.COL.road, BYP_X, 0, 0.029);
      W.flat(g, 6, 52, W.COL.road, BAY_X, -5, 0.03);
      W.flat(g, 30, 66, W.COL.concrete, 85, 0, 0.027);
      const yel = [], white = [];
      for (const d of this.docks) W.dashRect(yel, BAY_X, d.z - 0.6, 4.4, 15.6, 1, 0.5, 0.22);
      for (const s of this.slots) W.dashRect(yel, s.x, s.z, 3.2, 12.4, 1, 0.6, 0.2);
      W.dashLine(white, 58, 30, 58, -30, 3, 2.4, 0.22);
      W.dashLine(yel, 100.6, 36, 100.6, -36, 36 * 2, 0, 0.3); // platform edge
      for (let z = 40; z > -44; z -= 14) white.push({ x: BYP_X, z, len: 2.2, w: 0.5, rot: Math.PI / 2 });
      W.dashes(g, yel, W.COL.yellow, 0.062);
      W.dashes(g, white, 0xffffff, 0.06);
      W.groundText(g, 'POD ' + pod.key, 66, 34, 10, 5, hex(pod.color), Math.PI / 2, 90);
      const b = new M.MB();
      for (const x of [XC - SPAN / 2, XC + SPAN / 2]) b.box(0.5, 0.15, 72, 0x7a81a4, x, 0.04, 0); // crane rails
      for (const z of [-24, 0, 24]) { b.box(0.25, 6, 0.25, 0x9aa1c4, 100.9, 0, z); b.box(1.6, 0.3, 0.5, 0xeef0fa, 100.2, 6, z); } // platform lamps
      S.add(b.mesh());
      M.block(S, { x: 20, z: 0, w: 14, d: 12, h: 8, trim: pod.color }); // depot office
      const board = sign([['POD ' + pod.key, 120, 0.34], [pod.name.toUpperCase(), 52, 0.66], ['Tier ' + pod.tier + ' · ' + WT.SUP.TIER_NAME[pod.tier] + ' · rail depot', 26, 0.87]], 9, 6, hex(pod.color));
      board.position.set(5, 0, 20);
      S.add(board);
      // one rail-mounted gantry: its rails run along local z, so it is mounted in a frame whose x is the depot's z
      const rf = new T.Group();
      rf.rotation.y = -Math.PI / 2;
      S.add(rf);
      const c = M.gantry(SPAN, 17);
      c.group.rotation.y = Math.PI / 2;
      c.group.position.set(0, 0, -XC);
      rf.add(c.group);
      this.crane = Object.assign(c, { id: 'RMG-' + pod.key, task: 'Idle', lifts: 0, trainBox: false });
    }
    activate() {
      super.activate();
      // where on the network the platform is: trains stop with their wagons centred on it
      const w = this.world(TRACK_X, 0, 0), at = locate(w.x, w.z);
      this.stopEdge = at.e; this.stopOff = at.s;
      WT.spawn(this.craneWorker());
      R.startShuttles();
    }

    /* ----- the box yard ----- */
    topOf(s) { return s.items[s.items.length - 1]; }
    idle(c) { return c && !c.full && !c.ringTo && !c.reserved && !c.lifting && !c.hold; }
    freeSlots() { return this.slots.filter((s) => !s.items.length && !s.busy).length; }
    roomFor() { return this.freeSlots() - this.pendingDrop - this.incoming; }
    // boxes waiting here to leave by rail: crates for industrial freight, everything else for a shuttle
    outbound(tr) {
      return this.slots.filter((s) => {
        const c = this.topOf(s);
        if (!c || s.busy || c.lifting || !c.ringTo || c.ringTo === this) return false;
        return !tr || (tr.role === 'freight') === (c.ringTo === R.EXPORT);
      });
    }
    // boxes leaving or waiting for a mover are never built on: only an idle empty goes on top of another
    slotFor(c) {
      if (this.idle(c) || (c && !c.full && !c.ringTo && !c.crate)) {
        const on = this.slots.find((s) => s.items.length === 1 && !s.busy && this.idle(this.topOf(s)));
        if (on) return on;
      }
      const free = this.slots.filter((s) => !s.items.length && !s.busy);
      if (!free.length) return null;
      const toTrack = (c && c.ringTo && c.ringTo !== this) || (c && c.crate);
      return free.reduce((a, b) => ((toTrack ? b.x > a.x : b.x < a.x) ? b : a));
    }
    store(s, c, m) {
      m.position.copy(this.world(s.x, s.items.length * 2.7, s.z));
      m.rotation.set(0, this.yaw, 0);
      s.items.push(c);
      c.loc = this.id + ' · Yard';
    }
    // an empty of the right kind for this material, sitting idle in this pod's pool
    findEmpty(mat) {
      const tank = WT.SUP.MAT[mat].pack === 'tanker', open = WT.SUP.openFor(mat);
      for (const s of this.slots) {
        const c = this.topOf(s);
        if (!s.busy && this.idle(c) && c.ringHome === this && !c.crate && (tank ? c.tank : !c.tank && c.open === open)) return c;
      }
      return null;
    }
    // a pool keeps three idle empties of a kind; more go back to the leasing pool
    trimPool(c) {
      const same = this.slots.flatMap((s) => s.items).filter((x) => this.idle(x) && x.tank === c.tank && x.open === c.open);
      if (same.length <= 3) return;
      const s = this.slots.find((q) => this.topOf(q) === c);
      if (!s) return;
      s.items.pop();
      WT.scene.remove(c.mesh);
      WT.unregister(c);
    }
    // a mover dropped a box here: a loaded one or a crate waits for a train, an empty goes home (or joins this pool)
    dropped(c, t) {
      const S = WT.SUP, po = c.full && c.po;
      if (c.crate) {
        c.ringTo = R.EXPORT; c.status = 'Export · awaiting industrial freight';
        S.note(c, `Dropped at ${this.id} for export by rail`);
        return;
      }
      if (po && po.ring) {
        c.ringTo = po.ring.to; c.ringHome = c.ringHome || this;
        c.status = 'Awaiting ring shuttle';
        S.note(c, `Dropped at ${this.id} for ${c.ringTo.id}`);
        S.ev(po, `At ${this.id} · awaiting ring shuttle → ${c.ringTo.id}`);
        if (t.po === po) { t.po = null; t.cargo = null; }
        return;
      }
      if (c.ringHome && c.ringHome !== this && c.ringHome.active) {
        c.ringTo = c.ringHome; c.ringHome.incoming++;
        c.status = 'Empty · going home by rail';
      } else {
        c.ringTo = null; c.ringHome = this; c.status = 'Empty · rail pool';
        this.trimPool(c);
      }
      S.note(c, `Empty dropped at ${this.id}`);
    }
    // a box came off a train here
    arrived(c) {
      this.incoming = Math.max(0, this.incoming - 1);
      c.ringTo = null;
      if (c.full) { R.stats.moved++; c.status = 'Grounded · awaiting mover'; WT.SUP.note(c, `Off the train at ${this.id}`); }
      else { R.stats.empties++; c.ringHome = this; c.status = 'Empty · rail pool'; WT.SUP.note(c, `Home at ${this.id}`); this.trimPool(c); }
    }
    // where a box is for a crane to take it: on top of a stack, or still on the train at the platform
    whereIs(c) {
      for (const s of this.slots) if (this.topOf(s) === c) return s.busy || c.lifting ? null : { slot: s, from: { x: s.x, z: s.z, top: s.items.length * 2.7 }, take: () => s.items.pop() };
      const car = this.train && this.train.cars.find((k) => k.cont === c);
      if (!car || c.lifting) return null;
      const p = this.local(c.mesh);
      return { from: { x: p.x, z: p.z, top: p.y + 2.7 }, take: () => { car.cont = null; this.arrived(c); } };
    }

    /* ----- trucks ----- */
    reserveFor(t) {
      const d = this.docks.find((x) => !x.truck);
      if (!d) return null;
      d.truck = t || 'reserved';
      return d;
    }
    reserve() { return this.reserveFor(null); }
    release(d) { if (d) { d.truck = null; d.job = null; } }
    *serve(t, leg) {
      const d = leg.dock;
      leg.parked = WT.sim.minutes;
      t.where = `${this.id} · Bay ${d.n}`;
      t.status = leg.op === 'pick' ? 'Awaiting container' : 'Dropping container';
      const job = (d.job = { truck: t, label: (leg.op === 'pick' ? 'Loading ' : 'Unloading ') + t.id, plan: () => this.truckLift(t, leg) });
      this.jobs.push(job);
      while (!job.done) yield;
      d.job = null;
      if (leg.op === 'drop') this.pendingDrop = Math.max(0, this.pendingDrop - 1);
      // the box never turned up: the order goes back in the queue for another mover, and this one heads home
      if (leg.op === 'pick' && !t.container) {
        for (const l of t.legs) if (l.lazy && !l.dock) l.fac.lazyN = Math.max(0, (l.fac.lazyN || 0) - 1);
        t.legs.length = 0;
        if (t.po) { WT.SUP.dispatchQ.push(t.po); t.po = null; t.cargo = null; }
      }
    }
    truckLift(t, leg) {
      if (!WT.trucks.includes(t)) return 'skip';
      const cargo = t.mesh.userData.cargo;
      if (leg.op === 'drop') {
        const c = t.container;
        if (!c) return 'skip';
        const s = this.slotFor(c);
        if (!s) return null;
        const p = this.local(c.mesh);
        return { cont: c, slot: s, from: { x: p.x, z: p.z, top: p.y + 2.7 }, to: { x: s.x, z: s.z, base: s.items.length * 2.7 },
          commit: (m) => { t.container = null; this.store(s, c, m); this.dropped(c, t); } };
      }
      const c = leg.cont;
      if (!c || !WT.entities.has(c.uid)) return 'skip';
      const src = this.whereIs(c);
      if (!src) return WT.sim.minutes - leg.parked > 30 ? 'skip' : null;
      const p = this.local(cargo);
      return { cont: c, slot: src.slot, from: src.from, to: { x: p.x, z: p.z, base: p.y },
        commit: (m) => {
          src.take();
          cargo.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
          t.container = c; c.status = 'On truck'; c.loc = t.id; c.at = null; c.hold = false; c.reserved = false;
          WT.SUP.note(c, `Picked up by ${t.id} at ${this.id}`);
        } };
    }

    /* ----- trains ----- */
    hasWorkFor(tr) {
      return tr.cars.some((k) => k.cont && k.cont.ringTo === this) || (tr.cars.some((k, i) => i && !k.cont) && this.outbound(tr).length > 0);
    }
    *trainCall(tr) {
      this.train = tr; tr.at = this;
      tr.status = 'Working at ' + this.id;
      R.stats.calls++;
      WT.emit('event', { kind: 'train', ent: tr, weight: 2 });
      // pre-advice: the boxes for this pod are released to the movers as the train pulls in
      for (const car of tr.cars) {
        const c = car.cont;
        if (c && c.ringTo === this && c.full && c.po && !c.advised) { c.advised = true; c.at = this; c.hold = true; c.status = 'On train at ' + this.id; WT.SUP.grounded(c.po, this.id); }
      }
      const job = { train: tr, label: 'Working ' + tr.id, plan: () => this.trainLift(tr) };
      this.jobs.push(job);
      // boxes for this pod always come off (their yard room was booked with them); loading gives up after a while
      const t0 = WT.sim.minutes;
      while (!job.done && (WT.sim.minutes - t0 < 30 || tr.cars.some((k) => k.cont && k.cont.ringTo === this))) yield;
      job.done = true;
      while (this.crane.trainBox) yield;
      this.train = null; tr.at = null;
      if (this.claim === tr) this.claim = null;
    }
    trainLift(tr) {
      // everything for this pod comes off first ...
      const off = tr.cars.find((k) => k.cont && k.cont.ringTo === this && !k.cont.lifting);
      if (off) {
        const c = off.cont, s = this.slotFor(c);
        if (!s && !c.full) {
          // an empty coming home to a full yard is handed back to the leasing pool
          off.cont = null; this.incoming = Math.max(0, this.incoming - 1);
          WT.scene.remove(c.mesh); WT.unregister(c);
          return null;
        }
        if (!s) return null; // a mover will clear a slot shortly
        const p = this.local(c.mesh);
        return { train: true, cont: c, slot: s, from: { x: p.x, z: p.z, top: p.y + 2.7 }, to: { x: s.x, z: s.z, base: s.items.length * 2.7 },
          commit: (m) => { off.cont = null; this.store(s, c, m); this.arrived(c); } };
      }
      if (tr.cars.some((k) => k.cont && k.cont.ringTo === this)) return null; // one still on the move to a truck
      // ... then boxes waiting here for this train go on, each onto the nearest free wagon
      const free = tr.cars.filter((k, i) => i && !k.cont), out = this.outbound(tr);
      if (!free.length || !out.length) return 'skip';
      const s = out[0], c = this.topOf(s);
      const car = free.reduce((a, b) => (Math.abs(this.local(b.g).z - s.z) < Math.abs(this.local(a.g).z - s.z) ? b : a));
      const p = this.local(car.g.userData.slot);
      return { train: true, cont: c, slot: s, from: { x: s.x, z: s.z, top: s.items.length * 2.7 }, to: { x: p.x, z: p.z, base: p.y },
        commit: (m) => {
          s.items.pop();
          car.g.userData.slot.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
          car.cont = c; c.loc = tr.id;
          if (c.ringTo === R.EXPORT) { c.status = 'On industrial freight'; WT.SUP.cratesRailed++; R.stats.exported++; WT.SUP.note(c, `Loaded on ${tr.id} at ${this.id} for export`); return; }
          c.status = c.full ? 'On ring shuttle' : 'Empty · on ring shuttle';
          WT.SUP.note(c, `Loaded on ${tr.id} at ${this.id} → ${c.ringTo.id}`);
          if (c.full && c.po) WT.SUP.ev(c.po, `On ring shuttle · ${tr.id} → ${c.ringTo.id}`);
        } };
    }

    /* ----- the gantry: truck work first, then the train at the platform ----- */
    *craneWorker() {
      const c = this.crane;
      while (true) {
        let pick = null;
        const order = this.jobs.filter((j) => !j.done).sort((a, b) => (b.truck ? 1 : 0) - (a.truck ? 1 : 0));
        for (const j of order) {
          const lift = j.plan();
          if (lift === 'skip') { j.done = true; continue; }
          if (lift) { pick = { j, lift }; break; }
        }
        this.jobs = this.jobs.filter((j) => !j.done);
        if (!pick) { c.task = 'Idle'; yield* WT.sleep(0.25); continue; }
        yield* this.lift(pick.lift, pick.j.label);
        if (!pick.lift.train) pick.j.done = true;
      }
    }
    *lift(Lf, label) {
      const c = this.crane, box = Lf.cont, u = (z) => WT.clamp(z, -U_MAX, U_MAX);
      c.task = label; c.trainBox = !!Lf.train;
      box.lifting = true;
      if (Lf.slot) Lf.slot.busy = true;
      yield* CR.transfer(c, u(Lf.from.z), Lf.from.x - XC, Lf.from.top + 0.25, SAFE, SPEED);
      CR.grab(c, box.mesh);
      yield* WT.sleep(0.25);
      yield* CR.transfer(c, u(Lf.to.z), Lf.to.x - XC, Lf.to.base + 2.95, SAFE, SPEED);
      const m = CR.release(c);
      Lf.commit(m);
      if (Lf.slot) Lf.slot.busy = false;
      box.lifting = false; c.trainBox = false;
      c.lifts++; this.moves++;
      WT.G && WT.G.earn(3000, this);
      yield* WT.sleep(0.15);
    }
    card() {
      const items = this.slots.flatMap((s) => s.items);
      const pool = items.filter((c) => this.idle(c)).length, out = items.filter((c) => c.ringTo && c.ringTo !== this && c.ringTo !== R.EXPORT).length;
      const crates = items.filter((c) => c.ringTo === R.EXPORT).length, wait = items.filter((c) => c.full && !c.ringTo).length;
      return this.cardBase({
        kicker: `Facility · Rail depot · Pod ${this.pod.key}`, icon: '🚉', sub: `Pod ${this.pod.key} · ${this.pod.name} — ${this.pod.plants.filter(Boolean).join(', ')}`,
        where: this.train ? this.train.id + ' at the platform' : 'Platform clear',
        rows: [['To other pods', String(out)], ['Crates for export', String(crates)], ['Awaiting a mover', String(wait)], ['Empties in pool', String(pool)], ['Inbound by rail', String(this.incoming)],
          ['Yard', `${items.length} boxes · ${this.freeSlots()} of ${this.slots.length} slots free`], ['Gantry', `${this.crane.carry ? 'Lifting' : this.crane.task} · ${this.crane.lifts} lifts`],
          ['Truck bays', this.docks.map((d) => (d.truck ? '■' : '□')).join(' ')], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
      });
    }
  }
  WT.RingDepot = RingDepot;

  /* ================= trains on the network ================= */
  // every car of every train, mainline ones included, for spacing
  R.allCars = () => [...WT.trains, ...R.trains].flatMap((t) => t.cars.map((c) => ({ t, p: c.g.position })));
  // is a stretch of a main track clear of every train (mainline trains and ours)?
  R.mainClear = (z, x0, x1, except) => R.allCars().every(({ t, p }) => t === except || Math.abs(p.z - z) > 3 || p.x < x0 || p.x > x1);
  // the exit link's crossing of the eastbound main is held: no new mainline train may start near it
  R.crossingHeld = (x) => !!NODES.xing && !!NODES.xing.owner && Math.abs(x - DIAMOND.x) < 450;
  let seqS = 11, seqF = 701;
  class NetTrain extends WT.Entity {
    constructor(kind, n) {
      super();
      this.kind = 'train';
      this.role = kind; // 'shuttle' or 'freight'
      this.id = kind === 'shuttle' ? 'RS-' + seqS++ : 'IF-' + seqF++;
      this.operator = kind === 'shuttle' ? 'WareTrack Ring' : 'WareTrack Industrial Freight';
      this.status = 'Running';
      const lv = kind === 'shuttle' ? [0x2aa198, 0xf6f7fd, 'cab'] : [0x4a5578, 0xf0b429, 'hood'];
      this.cars = [{ g: M.loco(...lv) }];
      for (let i = 0; i < n; i++) this.cars.push({ g: M.wagonKind('container'), kind: 'container', cont: null });
      this.mesh = this.cars[0].g;
      this.cars.forEach((c) => WT.scene.add(c.g));
      WT.register(this);
      this.cars.forEach((c) => { c.g.userData.entityId = this.uid; WT.pickables.add(c.g); });
      this.v = 0; this.s = 0; this.holds = [];
      R.trains.push(this);
    }
    radius() { return 30; }
    // y on the route at distance s (viaducts), and pose every car
    yAt(s) {
      const segs = this.route.segs;
      for (let i = segs.length - 1; i >= 0; i--) if (s >= segs[i].s0) return segs[i].e ? segs[i].e.yAt(segs[i].o0 + s - segs[i].s0) : 0;
      return segs.length && segs[0].e ? segs[0].e.yAt(segs[0].o0) : 0;
    }
    place() {
      const P = this.route.path;
      this.cars.forEach((c, i) => {
        const d = this.s - 13 * i, p = P.at(WT.clamp(d, 0, P.len)), ex = d < 0 ? d : d > P.len ? d - P.len : 0;
        const y = this.yAt(d), yf = this.yAt(d + 5), yb = this.yAt(d - 5);
        c.g.position.set(p.x + Math.cos(p.a) * ex, y, p.z + Math.sin(p.a) * ex);
        c.g.rotation.set(0, -p.a, Math.atan2(yf - yb, 10));
      });
    }
    remove() {
      this.cars.forEach((c) => { WT.scene.remove(c.g); WT.pickables.delete(c.g); if (c.cont) WT.unregister(c.cont); });
      this.holds.forEach((h) => { if (h.n.owner === this) h.n.owner = null; });
      WT.unregister(this);
      R.trains.splice(R.trains.indexOf(this), 1);
    }
    card() {
      const boxes = this.cars.filter((c) => c.cont);
      const to = (c) => (c.cont.ringTo ? c.cont.ringTo.id : c.cont.contents ? c.cont.contents.name : '—');
      return {
        kicker: (this.role === 'shuttle' ? 'Ring shuttle · ' : 'Industrial freight · ') + this.operator, title: this.id,
        sub: this.role === 'shuttle' ? 'Carries boxes between the pods' : 'Imports to the pods, product crates out',
        icon: '🚆', iconBg: this.role === 'shuttle' ? '#7fe0d6' : '#ffd479', status: this.status, statusTone: WT.toneFor(this.status), where: this.at ? this.at.id + ' platform' : this.where || 'Rail network',
        rows: [['Consist', `1 loco + ${this.cars.length - 1} container flats`], ['Boxes aboard', boxes.length ? boxes.map((c) => `${c.cont.id} → ${to(c)}`).join(' · ') : 'None'],
          ['Next stop', this.route && this.route.stop ? this.route.stop.d.id : this.route && this.route.exit ? 'Mainline · leaving the network' : '—'], ['Speed', Math.round(this.v * 3.6) + ' km/h']],
      };
    }
    label() { return this.id + (this.role === 'shuttle' ? ' · Ring shuttle' : ' · Industrial freight'); }
  }

  // a path through densely spaced points, with bends measured over a few metres (not point to point)
  function densePath(pts) {
    const cum = [0], ang = [];
    for (let i = 1; i < pts.length; i++) { cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); ang.push(Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])); }
    ang.push(ang[ang.length - 1] || 0);
    const len = cum[cum.length - 1];
    const at = (s) => {
      s = WT.clamp(s, 0, len);
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
      const u = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
      return { x: pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u, z: pts[lo][1] + (pts[hi][1] - pts[lo][1]) * u, a: ang[lo] };
    };
    const maxK = (s0, s1) => { let m = 0; for (let s = s0; s <= s1; s += 3) m = Math.max(m, Math.abs(WT.angDiff(at(s - 4).a, at(s + 4).a)) / 8); return m; };
    return { pts, cum, len, at, maxK };
  }
  // A route is one path from 60 m behind the head (so the cars trail on real track) through a list of edges.
  // pos: { e, o } where the head is now; plan: edges to follow after the current one; end: offset on the last edge
  function makeRoute(tr, pos, plan, end, extra = {}) {
    const pts = [], segs = [];
    let s = 0;
    const push = (x, z) => { const l = pts[pts.length - 1]; if (l) { const d = Math.hypot(x - l[0], z - l[1]); if (d < 0.3) return; s += d; } pts.push([x, z]); };
    // history: the last stretch of the old route
    if (tr.route) {
      const P = tr.route.path, h0 = Math.max(0, tr.s - 13 * tr.cars.length - 10);
      for (let d = h0; d < tr.s; d += 2) { const q = P.at(d); push(q.x, q.z); }
      // carry over the old segments that cover the history (for viaduct heights)
      const back = tr.s - h0;
      for (const sg of tr.route.segs) if (sg.s1 > h0) segs.push({ e: sg.e, o0: sg.o0 + Math.max(0, h0 - sg.s0), s0: Math.max(0, sg.s0 - h0), s1: sg.s1 - h0 });
      s = back;
    }
    const list = [{ e: pos.e, from: pos.o }, ...plan.map((e) => ({ e, from: 0 }))];
    const head = pts.length ? s : 0;
    list.forEach((it, i) => {
      const last = i === list.length - 1, to = last && end !== undefined ? end : it.e.len, s0 = s;
      for (let d = it.from; d < to; d += 2) { const q = it.e.path.at(d); push(q.x, q.z); }
      const q = it.e.path.at(to); push(q.x, q.z);
      segs.push({ e: it.e, o0: it.from, s0: i === 0 ? head : s0, s1: s });
    });
    segs.sort((a, b) => a.s0 - b.s0);
    const path = densePath(pts);
    // the merges ahead, where the train must hold the junction (and those it still holds behind it)
    const holds = [];
    if (tr.route) {
      const shift = tr.s - head;
      for (const h of tr.route.holds) if (!h.passed && h.n.owner === tr && !holds.some((x) => x.n === h.n)) holds.push({ n: h.n, s: h.s - shift, main: h.main });
    }
    for (const sg of segs) if (sg.s0 >= head - 1 && sg.e.from.in.length > 1 && sg.o0 === 0 && !holds.some((x) => x.n === sg.e.from && x.s >= head - 1)) holds.push({ n: sg.e.from, s: sg.s0 });
    for (const sg of segs) if (sg.e.id === 'exit' && sg.s0 >= head - 1) {
      // the diamond over the eastbound main and the merge onto the westbound one
      for (let d = 0; d < sg.e.len; d += 1) { const q = sg.e.path.at(d); if (q.z <= DIAMOND.z + 6) { holds.push({ n: node('xing'), s: sg.s0 + d - sg.o0, main: true }); break; } }
    }
    tr.route = Object.assign({ path, segs, holds, len: path.len }, extra);
    tr.s = head;
    return tr.route;
  }
  // where the head is: the segment containing s
  function headPos(tr) {
    const segs = tr.route.segs;
    for (let i = segs.length - 1; i >= 0; i--) if (tr.s >= segs[i].s0 - 0.01) return { e: segs[i].e, o: Math.min(segs[i].e.len, segs[i].o0 + tr.s - segs[i].s0) };
    return { e: segs[0].e, o: segs[0].o0 };
  }
  // route from the head to a depot's platform (wagons centred on it), or null
  function routeToDepot(tr, d) {
    const pos = headPos(tr), n = tr.cars.length - 1, stopO = d.stopOff + 6.5 * (n + 1);
    if (pos.e === d.stopEdge && stopO > pos.o + 1) return { pos, plan: [], end: stopO, len: stopO - pos.o };
    const r = routeTo(pos.e.to, d.stopEdge);
    if (!r) return null;
    return { pos, plan: [...r.edges, d.stopEdge], end: stopO, len: pos.e.len - pos.o + r.len + stopO };
  }
  // keep moving with no particular place to go: round the hub (or on along a branch) for a few hundred metres
  function cruise(tr) {
    const pos = headPos(tr), plan = [];
    let n = pos.e.to, len = pos.e.len - pos.o;
    while (len < 320) {
      const e = n.out.find((x) => x.hub) || n.out.find((x) => x.loop || x.id === 'south-top') || n.out[0];
      plan.push(e); len += e.len; n = e.to;
    }
    makeRoute(tr, pos, plan, undefined, { cruise: true });
  }
  function exitRoute(tr) {
    const pos = headPos(tr), ex = EDGES.find((e) => e.id === 'exit');
    if (pos.e === ex) { makeRoute(tr, pos, [], undefined, { exit: true }); return; }
    const r = routeTo(pos.e.to, ex);
    makeRoute(tr, pos, [...r.edges, ex], undefined, { exit: true });
  }
  // pick the next job: the nearest depot this train has work at
  function plan(tr) {
    let best = null;
    for (const d of WT.facilities) {
      if (d.type !== 'Ring depot' || !d.active || !d.stopEdge || d === tr.lastDepot && !tr.cars.some((k) => k.cont && k.cont.ringTo === d)) continue;
      if (!d.hasWorkFor(tr)) continue;
      // another train already on its way to collect there: leave it to that one
      const mine = tr.cars.some((k) => k.cont && k.cont.ringTo === d);
      if (!mine && d.claim && d.claim !== tr && R.trains.includes(d.claim)) continue;
      const r = routeToDepot(tr, d);
      if (r && (!best || r.len < best.r.len)) best = { d, r };
    }
    if (best) { best.d.claim = tr; makeRoute(tr, best.r.pos, best.r.plan, best.r.end, { stop: { d: best.d } }); return; }
    // freight with nothing left to do here leaves for the mainline
    if (tr.role === 'freight' && !tr.cars.some((k) => k.cont && k.cont.ringTo && k.cont.ringTo !== R.EXPORT)) { exitRoute(tr); return; }
    cruise(tr);
  }
  // distance to the nearest car of another train on our way ahead (Infinity if clear)
  function blockedAhead(tr, look) {
    const P = tr.route.path, cars = R.allCars().filter((c) => c.t !== tr);
    for (let d = 3; d <= look; d += 2.5) {
      const s = tr.s + d;
      let q;
      if (s <= P.len) q = P.at(s);
      else { const e = P.at(P.len), k = s - P.len; q = { x: e.x + Math.cos(e.a) * k, z: e.z + Math.sin(e.a) * k }; }
      for (const c of cars) if (Math.abs(c.p.x - q.x) < 2.6 && Math.abs(c.p.z - q.z) < 2.6) return d;
    }
    return Infinity;
  }
  function* runNet(tr) {
    plan(tr);
    while (true) {
      const dt = WT.sim.dt;
      if (dt <= 0) { yield; continue; }
      const rt = tr.route, n = tr.cars.length - 1;
      const onMain = rt.segs.some((sg) => sg.e.main && tr.s >= sg.s0 && tr.s <= sg.s1 && sg.e.main(rt.path.at(tr.s)));
      let target = onMain ? 20 : 14;
      const k = rt.path.maxK(tr.s, tr.s + 40);
      if (k > 1e-4) target = Math.min(target, Math.sqrt(1.3 / k));
      const endS = rt.stop ? rt.len : rt.exit ? rt.len + 13 * (n + 2) : rt.len + 400; // a cruise is extended before it runs out
      if (rt.stop) target = Math.min(target, Math.sqrt(2 * 0.8 * Math.max(0, rt.len - tr.s)) + 0.25);
      // spacing behind whatever is ahead
      const gap = blockedAhead(tr, 30 + (tr.v * tr.v) / 2.4 + 10);
      if (gap < Infinity) target = Math.min(target, Math.sqrt(2 * 1.2 * Math.max(0, gap - 16)));
      // junctions: hold each merge (and the crossing of the main) before entering it; release behind the tail
      tr.why = null;
      for (const h of rt.holds) {
        if (h.passed) continue;
        const d = h.s - tr.s;
        if (tr.s - 13 * n - 10 > h.s) { h.passed = true; if (h.n.owner === tr) h.n.owner = null; continue; }
        if (h.n.owner === tr || d > 80) continue;
        const free = !h.n.owner && (!h.main || (R.mainClear(RZ, DIAMOND.x - 420, DIAMOND.x + 40, tr) && R.mainClear(RW, DIAMOND.x - 60, DIAMOND.x + 520, tr)));
        if (free) { h.n.owner = tr; tr.holds.push(h); h.n.waitT = 0; continue; }
        h.n.waitT = (h.n.waitT || 0) + dt;
        // a junction held for minutes by a train that is stuck itself: go anyway (never a circular wait)
        if (h.n.waitT > 90 && !h.main) { h.n.owner = tr; tr.holds.push(h); h.n.waitT = 0; continue; }
        target = Math.min(target, Math.sqrt(2 * 1.2 * Math.max(0, d - 14)));
        tr.why = h.main ? 'Waiting to cross the main line' : 'Held at junction';
        break;
      }
      tr.v = Math.max(0, tr.v + WT.clamp(target - tr.v, -2.4 * dt, 1.1 * dt));
      tr.s = Math.min(tr.s + tr.v * dt, endS);
      tr.status = tr.why || (tr.v < 0.3 ? 'Waiting · signal' : rt.exit ? 'Leaving for the mainline' : rt.stop ? 'Bound for ' + rt.stop.d.id : 'Running');
      tr.place();
      if (rt.stop && tr.s >= rt.len - 0.05) {
        tr.v = 0;
        yield* rt.stop.d.trainCall(tr);
        tr.lastDepot = rt.stop.d;
        plan(tr);
        continue;
      }
      if (rt.exit && tr.s - 13 * n >= rt.len) {
        tr.remove();
        return;
      }
      if (rt.cruise && rt.len - tr.s < 140) plan(tr);
      yield;
    }
  }

  /* ================= running the network ================= */
  // shuttles: two once two depots work, one more for every two depots after that
  R.startShuttles = function () {
    if (!R.built) return;
    const depots = WT.facilities.filter((f) => f.type === 'Ring depot' && f.active);
    const want = depots.length >= 2 ? Math.min(4, 1 + Math.floor(depots.length / 2)) : 0;
    while (R.trains.filter((t) => t.role === 'shuttle').length < want) {
      // start on the hub, away from the shuttles already there
      const used = R.trains.map((t) => t.route && headPos(t).e);
      const hubEdges = EDGES.filter((e) => e.hub && !used.includes(e) && e.len > 70);
      const e = hubEdges[R.trains.length % Math.max(1, hubEdges.length)] || EDGES.find((x) => x.hub);
      const tr = new NetTrain('shuttle', 4);
      tr.route = null;
      makeRoute(tr, { e, o: Math.min(e.len, 13 * 5 + 2) }, [], undefined, { cruise: true });
      tr.s = 0; // the route starts at the head
      tr.place();
      WT.log(`🚆 Ring shuttle ${tr.id} enters service on the rail hub`, 'blue', true);
      WT.spawn(runNet(tr));
    }
  };
  // industrial freight: brings pod imports in from the mainline, takes product crates out
  function crates() { return WT.facilities.filter((f) => f.type === 'Ring depot' && f.active).reduce((n, d) => n + d.outbound({ role: 'freight' }).length, 0); }
  function dispatchFreight() {
    const S = WT.SUP, Rm = WT.REMOTE;
    if (!R.built || !W.railBuilt || R.trains.filter((t) => t.role === 'freight').length >= 2) return;
    const room = new Map();
    const want = S.takeManifest('rail', 6, (po) => {
      if (!R.serves(po.to) || (Rm && Rm.siteFor && Rm.siteFor(po.mat))) return false;
      const d = po.to.pod.depot, r = room.has(d) ? room.get(d) : d.roomFor();
      if (r < 2) return false;
      room.set(d, r - 1);
      return true;
    });
    const out = crates();
    if (!want.length && out < 3) return;
    // a train needs a clear run in from the west edge
    if (!R.mainClear(RZ, -XO - 50, -XO + 420)) { S.backlog.rail.unshift(...want); return; }
    const tr = new NetTrain('freight', Math.min(8, Math.max(want.length, Math.min(4, out), 2)));
    want.forEach((po, i) => {
      const d = po.to.pod.depot, c = S.newContainer(11, po.mat);
      S.fillPO(c, po);
      c.ringTo = d; d.incoming++;
      c.status = 'On industrial freight'; c.loc = tr.id;
      S.note(c, `Loaded at the origin ramp for ${po.to.id} (${po.id})`);
      S.ev(po, `On industrial freight · ${tr.id} → ${d.id}`);
      po.vehicle = tr;
      tr.cars[i + 1].g.userData.slot.add(c.mesh);
      tr.cars[i + 1].cont = c;
      R.stats.imported++;
    });
    const e = EDGES.find((x) => x.id === 'entry');
    tr.route = null;
    makeRoute(tr, { e, o: 0 }, [], undefined, { cruise: true });
    tr.s = 0;
    tr.place();
    R.stats.freight++;
    WT.log(`🚂 Industrial freight ${tr.id} inbound with ${want.length} box${want.length === 1 ? '' : 'es'} for the pods`, 'blue', true);
    WT.spawn(runNet(tr));
  }
  WT.spawn((function* () {
    while (true) {
      yield* WT.sleep(4);
      try { dispatchFreight(); } catch (e) { console.error('[Rail hub] freight dispatch:', e); }
    }
  })());
})();
