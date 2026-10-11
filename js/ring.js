/* WareTrack – the industrial rail network
   Every factory lives in a pod west of the park, set apart by forest, each pod with a rail depot of its own:
   four pods south of the highway refine and make components, two north of it do final assembly beside their
   distribution centres. The pods are served the way a big rail base is laid out: double-track running lines
   (one track each way, trains keep right) with full junctions, and every stop on a loop of its own off the line.
     · the north trunk runs along the mainline and joins it at the west end (in off the eastbound main, out across
       it onto the westbound one),
     · the spine runs south from the trunk down the forest gap between the pods, over the highway on a viaduct,
     · each pod depot sits on a station loop off the spine: trains turn in from either direction, work the
       platform, run round the loop and leave either way,
     · the mine line (the existing branch past the mines and the container works) feeds the trunk from the east,
       across both main tracks, so ore goes from the pit straight to the pod that uses it,
     · a stabling yard on a balloon at the south end of the spine, where idle trains wait instead of circling.
   Junctions are worked like signalled blocks: a train reserves every conflict ahead of it in a junction at once
   (the merges, diverges and crossings it will foul) and releases each as its tail clears it.
   Pod shuttles carry boxes between pods, industrial freight brings imports from the mainline and takes the pods'
   product crates away, and ore trains collect empties at the container works, load at a mine and run to the
   pods. A mover covers the last stretch from a depot to a plant's dock. */
(function () {
  const T = THREE, M = WT.M, W = WT.W, CR = WT.CraneOps;
  const [AW, AE] = W.RING_AVENUES;
  const R = (WT.RING = { built: false, building: false, trains: [], stats: { moved: 0, empties: 0, issued: 0, calls: 0, freight: 0, imported: 0, exported: 0, ore: 0, oreBoxes: 0, stabled: 0 } });
  R.EXPORT = { id: 'export', name: 'Export by rail' }; // the destination of a crate that leaves on industrial freight
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  R.center = [-1200, -60];

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
  // One-way edges between nodes. Running lines are double track 6 m apart: the spine's southbound track on its west
  // side, the trunk's eastbound track on its south side (trains keep right).
  const RZ = W.RAIL.zE, RW = W.RAIL.zW, XO = W.EDGE + 250;
  const BR = -688, XB = W.EDGE + 400; // the mine branch past the remote sites (js/fac_remote.js) and its west end
  const SX = -1200, NT = -603, RAD = 22, FOUL = 4.5;
  const NODES = {}, EDGES = [], LOCKS = [];
  const node = (id) => (NODES[id] = NODES[id] || { id, out: [], in: [] });
  // corners filleted with true circular arcs (radius rad, or less where the straights between corners are short),
  // returned as points no more than 1.5 m apart
  function curve(pts, rad = RAD) {
    const n = pts.length, L = [], D = [], Tn = new Array(n).fill(0), PH = new Array(n).fill(0), SG = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz);
      L.push(l); D.push([dx / l, dz / l]);
    }
    for (let i = 1; i < n - 1; i++) {
      const a = D[i - 1], b = D[i], cr = a[0] * b[1] - a[1] * b[0];
      PH[i] = Math.atan2(Math.abs(cr), a[0] * b[0] + a[1] * b[1]); SG[i] = Math.sign(cr);
      Tn[i] = PH[i] > 1e-3 ? rad * Math.tan(PH[i] / 2) : 0;
    }
    for (let i = 0; i < n - 1; i++) { const t = Tn[i] + Tn[i + 1]; if (t > L[i]) { Tn[i] *= L[i] / t; Tn[i + 1] *= L[i] / t; } }
    const out = [[pts[0][0], pts[0][1]]];
    for (let i = 1; i < n - 1; i++) {
      const p = pts[i], a = D[i - 1];
      if (Tn[i] < 1e-3) { out.push([p[0], p[1]]); continue; }
      const A = [p[0] - a[0] * Tn[i], p[1] - a[1] * Tn[i]], r = Tn[i] / Math.tan(PH[i] / 2), s = SG[i];
      const c = [A[0] - a[1] * r * s, A[1] + a[0] * r * s], v0 = [A[0] - c[0], A[1] - c[1]];
      const steps = Math.max(2, Math.ceil((r * PH[i]) / 1.5));
      for (let k = 0; k <= steps; k++) {
        const th = (s * PH[i] * k) / steps, cs = Math.cos(th), sn = Math.sin(th);
        out.push([c[0] + v0[0] * cs - v0[1] * sn, c[1] + v0[0] * sn + v0[1] * cs]);
      }
    }
    out.push([pts[n - 1][0], pts[n - 1][1]]);
    const dense = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const [x0, z0] = dense[dense.length - 1], [x1, z1] = out[i], l = Math.hypot(x1 - x0, z1 - z0);
      if (l < 0.05) continue;
      const m = Math.ceil(l / 1.5);
      for (let k = 1; k <= m; k++) dense.push([x0 + ((x1 - x0) * k) / m, z0 + ((z1 - z0) * k) / m]);
    }
    return dense;
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
  // viaduct profile over the highway: deck 6.5 m up across it, ramps 38 m long either side
  const viaY = (z) => { const a = Math.abs(z); if (a <= 12) return 6.5; if (a >= 50) return 0; const u = (a - 12) / 38; return 6.5 * (1 - u * u * (3 - 2 * u)); };
  function edge(id, from, to, pts, o = {}) {
    const e = Object.assign({ id, from: node(from), to: node(to), zones: [] }, o);
    e.path = densePath(curve(pts, o.rad));
    e.len = e.path.len;
    e.yAt = (off) => viaY(e.path.at(off).z);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of e.path.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    e.bb = [x0, x1, z0, z1];
    e.from.out.push(e); e.to.in.push(e);
    EDGES.push(e);
    return e;
  }
  // the running lines: junction nodes are placed on them first, then the lines are cut into edges between them
  const LINES = {
    SB: { at: (t) => [SX - 3, t], dir: 1 }, NB: { at: (t) => [SX + 3, t], dir: -1 }, // t = z
    EB: { at: (t) => [t, NT + 3], dir: 1 }, WB: { at: (t) => [t, NT - 3], dir: -1 }, // t = x
  };
  const stops = { SB: [], NB: [], EB: [], WB: [] };
  const on = (line, t, id) => { stops[line].push({ t, id }); return id; };

  // A station loop beside the spine. In its own frame u runs across from the spine toward the platform and v along
  // the platform in the direction trains work it (south on the west side, north on the east side). The near running
  // line is the one on the station's side. Both lines can turn in and both can be joined on the way out, so a full
  // junction: the turns from and onto the far line cross the near one.
  function station(key, side, zc) {
    const P = ([u, v]) => (side < 0 ? [SX - u, zc + v] : [SX + u, zc - v]);
    const zOf = (v) => (side < 0 ? zc + v : zc - v);
    const near = side < 0 ? 'SB' : 'NB', far = side < 0 ? 'NB' : 'SB';
    const J = -72, L = J + 6, k = 'st' + key;
    const nd = on(near, zOf(J - 30), k + '-nd'), nm = on(near, zOf(L + 30), k + '-nm');
    const fd = on(far, zOf(J + 30), k + '-fd'), fm = on(far, zOf(L - 30), k + '-fm');
    edge(k + '-near-in', nd, k + '-in', [[3, J - 30], [3, J], [28, J]].map(P));
    edge(k + '-far-in', fd, k + '-in', [[-3, J + 30], [-3, J], [28, J]].map(P));
    const loop = edge(k, k + '-in', k + '-out', [[28, J], [128, J], [128, 82], [84, 82], [84, L], [28, L]].map(P), { station: key });
    edge(k + '-out-near', k + '-out', nm, [[28, L], [3, L], [3, L + 30]].map(P));
    edge(k + '-out-far', k + '-out', fm, [[28, L], [-3, L], [-3, L - 30]].map(P));
    return loop;
  }
  for (const pod of R.PODS) pod.station = station(pod.key, pod.A === AW ? -1 : 1, pod.depotPlot.zc);

  // the spine meets the north trunk: in from the trunk's eastbound track and from the mine line on its westbound
  // track, out onto the westbound track toward the mainline
  on('SB', -560, 'tS'); on('NB', -560, 'tN'); on('EB', -1255, 'tE'); on('WB', -1255, 'tWm');
  edge('t-es', 'tE', 'tS', [[-1255, NT + 3], [SX - 3, NT + 3], [SX - 3, -560]]);
  edge('t-ws', 'tWd', 'tS', [[-1150, NT - 3], [SX - 3, NT - 3], [SX - 3, -560]]);
  edge('t-ww', 'tWd', 'tWm', [[-1150, NT - 3], [-1255, NT - 3]]);
  edge('t-nw', 'tN', 'tWm', [[SX + 3, -560], [SX + 3, NT - 3], [-1255, NT - 3]]);
  // in off the eastbound main at the west edge of the map, out across it onto the westbound main
  on('EB', -1600, 'eIn'); on('WB', -1560, 'xOut');
  const ENTRY = edge('entry', 'edgeIn', 'eIn', [[-XO, RZ], [-1700, RZ], [-1650, NT + 3], [-1600, NT + 3]], { rad: 40, main: (p) => p.x < -1718 });
  const EXIT = edge('exit', 'xOut', 'edgeOut', [[-1560, NT - 3], [-1600, NT - 3], [-1656, RW], [-XO, RW]], { rad: 40, main: (p) => p.x < -1674 });
  // the mine line: in at the west end of the branch, past the container works and the mines, then off the branch
  // short of its own junction with the main, straight across both main tracks and round onto the trunk
  const MINE = edge('mine', 'brIn', 'brD', [[-XB, BR], [-985, BR]], { main: () => true });
  const ORE = edge('ore-link', 'brD', 'tWd', [[-985, BR], [-955, BR], [-955, NT - 3], [-1150, NT - 3]]);
  // the stabling yard: a balloon at the foot of the spine with four roads, every one long enough for a freight
  const sbEnd = stops.SB.reduce((a, b) => (b.t > a.t ? b : a));
  edge('yard-in', sbEnd.id, 'yD', [[SX - 3, sbEnd.t], [SX - 3, 520], [-1316, 520], [-1316, 562], [-1280, 562]]);
  const YARD = [0, 1, 2, 3].map((k) => {
    const z = 562 - 7 * k;
    return edge('yard-' + (k + 1), 'yD', 'yM', k ? [[-1280, 562], [-1262, z], [-1138, z], [-1120, 562]] : [[-1280, 562], [-1120, 562]], { siding: k + 1 });
  });
  on('NB', 496, 'yOut');
  edge('yard-out', 'yM', 'yOut', [[-1120, 562], [-1082, 562], [-1082, 520], [SX + 3, 520], [SX + 3, 496]]);
  for (const [k, L] of Object.entries(LINES)) {
    const list = stops[k].sort((a, b) => (a.t - b.t) * L.dir);
    for (let i = 0; i < list.length - 1; i++) edge(k + '-' + i, list[i].id, list[i + 1].id, [L.at(list[i].t), L.at(list[i + 1].t)], { line: k });
  }
  R.EDGES = EDGES; R.NODES = NODES; R.LOCKS = LOCKS; R.YARD = YARD;

  /* ----- conflicts: every place two routes foul each other is a lock with a zone on each edge ----- */
  const xz = (e, s) => { const p = e.path.at(s); return [p.x, p.z]; };
  const dist = (e, x, z) => {
    if (x < e.bb[0] - 9 || x > e.bb[1] + 9 || z < e.bb[2] - 9 || z > e.bb[3] + 9) return 99;
    let m = Infinity;
    for (const p of e.path.pts) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < m) m = d; }
    return Math.sqrt(m);
  };
  const mkLock = (kind, x, z, o) => { const k = Object.assign({ id: kind + '-' + LOCKS.length, kind, x, z, owner: null }, o); LOCKS.push(k); return k; };
  (function conflicts() {
    for (const n of Object.values(NODES)) {
      // a diverge: the roads leaving it run side by side for a few metres
      if (n.out.length > 1) {
        const p = n.out[0].path.at(0), k = mkLock('diverge', p.x, p.z);
        for (const e of n.out) {
          const sib = n.out.filter((o) => o !== e);
          let b = 0;
          while (b < e.len && sib.some((o) => dist(o, ...xz(e, b)) < FOUL)) b += 1;
          e.zones.push({ k, a: 0, b: b + 1 });
        }
      }
      // a merge: from the fouling point on each road in to a few metres past the join
      if (n.in.length > 1) {
        const p = n.in[0].path.at(n.in[0].len), k = mkLock('merge', p.x, p.z);
        for (const e of n.in) {
          const sib = n.in.filter((o) => o !== e);
          let a = e.len;
          while (a > 0 && sib.some((o) => dist(o, ...xz(e, a)) < FOUL)) a -= 1;
          e.zones.push({ k, a: Math.max(0, a - 1), b: e.len + 8 });
        }
      }
    }
    // level crossings between roads that share no node
    const cross = (p, q, r, s) => {
      const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
      if (Math.abs(d) < 1e-9) return null;
      const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d, u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
    };
    const shares = (a, b) => a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to;
    for (let i = 0; i < EDGES.length; i++) for (let j = i + 1; j < EDGES.length; j++) {
      const e1 = EDGES[i], e2 = EDGES[j], b2 = e2.bb;
      if (shares(e1, e2) || e1.bb[0] > b2[1] || b2[0] > e1.bb[1] || e1.bb[2] > b2[3] || b2[2] > e1.bb[3]) continue;
      const P = e1.path.pts, Q = e2.path.pts, hits = [];
      for (let a = 0; a < P.length - 1; a++) {
        const p = P[a], q = P[a + 1];
        if (Math.max(p[0], q[0]) < b2[0] || Math.min(p[0], q[0]) > b2[1] || Math.max(p[1], q[1]) < b2[2] || Math.min(p[1], q[1]) > b2[3]) continue;
        for (let b = 0; b < Q.length - 1; b++) {
          const h = cross(p, q, Q[b], Q[b + 1]);
          if (!h) continue;
          const s1 = e1.path.cum[a] + h[0] * (e1.path.cum[a + 1] - e1.path.cum[a]), s2 = e2.path.cum[b] + h[1] * (e2.path.cum[b + 1] - e2.path.cum[b]);
          if (!hits.some((x) => Math.abs(x[0] - s1) < 8)) hits.push([s1, s2]);
        }
      }
      for (const [s1, s2] of hits) {
        const p = e1.path.at(s1);
        if ((e1.main && e1.main(p)) || (e2.main && e2.main(p))) continue;
        const k = mkLock('crossing', p.x, p.z);
        for (const [e, s, o] of [[e1, s1, e2], [e2, s2, e1]]) {
          let a = s, b = s;
          while (a > 0 && dist(o, ...xz(e, a)) < FOUL) a -= 1;
          while (b < e.len && dist(o, ...xz(e, b)) < FOUL) b += 1;
          e.zones.push({ k, a: Math.max(0, a - 1), b: b + 1 });
        }
      }
    }
    // crossing the main line: held only while both main tracks are clear on the approach, and mainline trains are
    // signalled to stop short of it while it is held
    const mainZone = (e, enter, leave) => {
      let a = 0;
      while (a < e.len && !enter(e.path.at(a))) a += 1;
      let b = a;
      while (b < e.len && !leave(e.path.at(b))) b += 1;
      const p = e.path.at(a), x = p.x;
      const k = mkLock('main', x, p.z, { main: true, check: (tr) => R.mainClear(RZ, x - 420, x + 40, tr) && R.mainClear(RW, x - 60, x + 520, tr) });
      e.zones.push({ k, a, b: b + 6 });
    };
    mainZone(EXIT, (p) => p.z < RZ + 9, (p) => p.z <= RW + 0.5);
    mainZone(ORE, (p) => p.z > RW - 9, (p) => p.z > RZ + 6);
    for (const e of EDGES) e.zones.sort((a, b) => a.a - b.a);
  })();

  // shortest way (by length) from a node to the start of an edge, keeping out of yard roads taken by other trains
  function routeTo(fromNode, target, tr) {
    const dist = new Map([[fromNode, 0]]), prev = new Map(), q = [fromNode];
    while (q.length) {
      q.sort((a, b) => dist.get(a) - dist.get(b));
      const n = q.shift();
      if (n === target.from) break;
      for (const e of n.out) {
        if (e.taken && e.taken !== tr && e !== target) continue;
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

  /* ================= building the network (the "Industrial rail" project) ================= */
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
    if (WT.REMOTE && WT.REMOTE.buildBranch) WT.REMOTE.buildBranch(); // the mine line the trunk is fed from
    const g = new T.Group();
    WT.scene.add(g);
    R.PODS.forEach((pod) => precinct(g, pod));
    // lay every edge in turn, off the mainline: ballast and sleepers on the ground, a deck and piers on the viaduct
    const ballast = [], sleepers = [], runs = [], deck = new M.MB();
    let total = 0;
    for (const e of EDGES) {
      if (e.main && e.main(e.path.at(e.len / 2)) && e.main(e.path.at(0)) && e.main(e.path.at(e.len))) continue;
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
    // a signal at every place a train may be held: a mast beside the track ahead of each conflict
    const masts = new M.MB(), lamps = [];
    for (const e of EDGES) for (const z of e.zones) {
      if (z.a < 3 && !z.k.main) continue; // (the diverges: held where the line reaches them)
      const s = Math.max(0, z.a - 2), p = e.path.at(s);
      if (e.main && e.main(p)) continue;
      const nx = -Math.sin(p.a), nz = Math.cos(p.a), x = p.x + nx * 2.6, zz = p.z + nz * 2.6, y = e.yAt(s);
      masts.box(0.22, 4.2, 0.22, 0x4a5578, x, y, zz);
      masts.box(0.5, 0.9, 0.5, 0x2b2f3d, x, y + 4.2, zz);
      lamps.push({ x, y: y + 4.65, z: zz, k: z.k });
    }
    const mm = masts.mesh();
    mm.visible = false;
    g.add(mm);
    const lampGeo = new T.SphereGeometry(0.2, 8, 6), red = new T.MeshBasicMaterial({ color: 0xff3b30 }), green = new T.MeshBasicMaterial({ color: 0x34c759 });
    const lampMesh = new T.InstancedMesh(lampGeo, green, Math.max(1, lamps.length)), redMesh = new T.InstancedMesh(lampGeo, red, Math.max(1, lamps.length));
    lampMesh.count = redMesh.count = 0;
    g.add(lampMesh, redMesh);
    const bm = W.dashes(g, ballast, W.COL.ballast, 0.028), sm = W.dashes(g, sleepers, 0xa49c90, 0.06);
    const dm = deck.mesh();
    dm.visible = false;
    g.add(dm);
    bm.count = sm.count = 0;
    const layer = M.trackLayer();
    WT.scene.add(layer);
    let bi = 0, si = 0;
    yield* WT.tween(40, (k) => {
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
    dm.visible = mm.visible = true;
    WT.scene.remove(layer);
    // signal aspects: red while another train holds the conflict beyond, green otherwise
    const mtx = new T.Matrix4();
    WT.on('frame', () => {
      let gi = 0, ri = 0;
      for (const l of lamps) {
        mtx.makeTranslation(l.x, l.y, l.z);
        if (l.k.owner) redMesh.setMatrixAt(ri++, mtx); else lampMesh.setMatrixAt(gi++, mtx);
      }
      lampMesh.count = gi; redMesh.count = ri;
      lampMesh.instanceMatrix.needsUpdate = redMesh.instanceMatrix.needsUpdate = true;
    });
    // the network's name board beside the junction of the trunk and the spine, facing the pods
    const board = sign([['INDUSTRIAL RAIL', 60, 0.36], ['Trunk · spine · station loops', 28, 0.72]], 16, 5, '#2f56e0');
    board.rotation.y = -Math.PI / 2;
    board.position.set(-1290, 0, -572);
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
        c.status = 'Awaiting pod shuttle';
        S.note(c, `Dropped at ${this.id} for ${c.ringTo.id}`);
        S.ev(po, `At ${this.id} · awaiting pod shuttle → ${c.ringTo.id}`);
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
          c.status = c.full ? 'On pod shuttle' : 'Empty · on pod shuttle';
          WT.SUP.note(c, `Loaded on ${tr.id} at ${this.id} → ${c.ringTo.id}`);
          if (c.full && c.po) WT.SUP.ev(c.po, `On pod shuttle · ${tr.id} → ${c.ringTo.id}`);
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
  // a crossing of the main held by the network: no new mainline train may start near it ...
  R.crossingHeld = (x) => LOCKS.some((k) => k.main && k.owner && Math.abs(x - k.x) < 450);
  // ... and one already running stops at its signal: the distance to the nearest held crossing ahead (or Infinity)
  R.signalAhead = (hx, dir) => {
    let g = Infinity;
    for (const k of LOCKS) if (k.main && k.owner) { const d = (k.x - hx) * dir; if (d > 0) g = Math.min(g, d); }
    return g;
  };
  let seqS = 11, seqF = 701;
  class NetTrain extends WT.Entity {
    constructor(kind, n, ore) {
      super();
      this.kind = 'train';
      this.role = kind; // 'shuttle' or 'freight'
      this.id = kind === 'shuttle' ? 'PS-' + seqS++ : (ore ? 'OR-' : 'IF-') + seqF++;
      this.operator = kind === 'shuttle' ? 'WareTrack Pod Shuttle' : ore ? 'Ridgeline Mining · ore to the pods' : 'WareTrack Industrial Freight';
      this.status = 'Running';
      const lv = kind === 'shuttle' ? [0x2aa198, 0xf6f7fd, 'cab'] : ore ? [0x9c5d47, 0xf0b429, 'hood'] : [0x4a5578, 0xf0b429, 'hood'];
      this.cars = [{ g: M.loco(...lv) }];
      for (let i = 0; i < n; i++) this.cars.push({ g: M.wagonKind('container'), kind: 'container', cont: null });
      this.mesh = this.cars[0].g;
      this.cars.forEach((c) => WT.scene.add(c.g));
      WT.register(this);
      this.cars.forEach((c) => { c.g.userData.entityId = this.uid; WT.pickables.add(c.g); });
      this.v = 0; this.s = 0; this.holds = []; this.waitT = 0;
      R.trains.push(this);
    }
    radius() { return 30; }
    // y on the route at distance s (viaducts), and pose every car
    yAt(s) {
      const segs = this.route.segs;
      for (let i = segs.length - 1; i >= 0; i--) if (s >= segs[i].s0) return segs[i].e.yAt(segs[i].o0 + s - segs[i].s0);
      return segs.length ? segs[0].e.yAt(segs[0].o0) : 0;
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
      this.holds.forEach((h) => { if (h.k.owner === this) h.k.owner = null; });
      for (const s of YARD) if (s.taken === this) s.taken = null;
      for (const d of depots()) if (d.claim === this) d.claim = null;
      WT.unregister(this);
      R.trains.splice(R.trains.indexOf(this), 1);
    }
    card() {
      const boxes = this.cars.filter((c) => c.cont);
      const to = (c) => (c.cont.ringTo ? c.cont.ringTo.id : c.cont.contents ? c.cont.contents.name : '—');
      return {
        kicker: (this.role === 'shuttle' ? 'Pod shuttle · ' : this.ore ? 'Ore train · ' : 'Industrial freight · ') + this.operator, title: this.id,
        sub: this.role === 'shuttle' ? 'Carries boxes between the pods' : this.ore ? `${WT.SUP.MAT[this.ore.site.mat].name} from ${this.ore.site.id} to the pods` : 'Imports to the pods, product crates out',
        icon: '🚆', iconBg: this.role === 'shuttle' ? '#7fe0d6' : '#ffd479', status: this.status, statusTone: WT.toneFor(this.status), where: this.at ? this.at.id + ' platform' : this.parked ? 'Stabling yard · road ' + this.parked.siding : 'Industrial rail network',
        rows: [['Consist', `1 loco + ${this.cars.length - 1} container flats`], ['Boxes aboard', boxes.length ? boxes.map((c) => `${c.cont.id} → ${to(c)}`).join(' · ') : 'None'],
          ['Next stop', this.route && this.route.stop ? this.route.stop.id : this.route && this.route.exit ? 'Mainline · leaving the network' : '—'], ['Speed', Math.round(this.v * 3.6) + ' km/h']],
      };
    }
    label() { return this.id + (this.role === 'shuttle' ? ' · Pod shuttle' : this.ore ? ' · Ore train' : ' · Industrial freight'); }
  }
  const depots = () => WT.facilities.filter((f) => f.type === 'Ring depot' && f.active);

  // A route is one path from 60 m behind the head (so the cars trail on real track) through a list of edges.
  // pos: { e, o } where the head is now; plan: edges to follow after the current one; end: offset on the last edge
  function makeRoute(tr, pos, plan, end, extra = {}) {
    const pts = [], segs = [];
    let s = 0;
    const push = (x, z) => { const l = pts[pts.length - 1]; if (l) { const d = Math.hypot(x - l[0], z - l[1]); if (d < 0.3) return; s += d; } pts.push([x, z]); };
    // history: the last stretch of the old route, with the old segments that cover it (for viaduct heights)
    if (tr.route) {
      const P = tr.route.path, h0 = Math.max(0, tr.s - 13 * tr.cars.length - 10);
      for (let d = h0; d < tr.s; d += 2) { const q = P.at(d); push(q.x, q.z); }
      for (const sg of tr.route.segs) if (sg.s1 > h0 && sg.s0 < tr.s) segs.push({ e: sg.e, o0: sg.o0 + Math.max(0, h0 - sg.s0), s0: Math.max(0, sg.s0 - h0), s1: Math.min(sg.s1, tr.s) - h0, hist: true });
      s = tr.s - h0;
    }
    const list = [{ e: pos.e, from: pos.o }, ...plan.map((e) => ({ e, from: 0 }))];
    const head = pts.length ? s : 0;
    list.forEach((it, i) => {
      const last = i === list.length - 1, to = last && end !== undefined ? end : it.e.len, s0 = s;
      for (let d = it.from; d < to; d += 2) { const q = it.e.path.at(d); push(q.x, q.z); }
      const q = it.e.path.at(to); push(q.x, q.z);
      segs.push({ e: it.e, o0: it.from, s0: i === 0 ? head : s0, s1: s, end: to });
    });
    segs.sort((a, b) => a.s0 - b.s0);
    const path = densePath(pts);
    // the conflicts ahead: those it already holds carry over, then every zone on the way
    const holds = [];
    if (tr.route) {
      const shift = tr.s - head;
      for (const h of tr.route.holds) if (!h.passed && h.k.owner === tr) holds.push({ k: h.k, s: h.s - shift, c: h.c - shift });
    }
    for (const sg of segs) {
      if (sg.hist) continue;
      for (const z of sg.e.zones) {
        if (z.a > sg.end || z.b < sg.o0) continue;
        const hs = sg.s0 + z.a - sg.o0, hc = sg.s0 + z.b - sg.o0;
        if (!holds.some((h) => h.k === z.k && Math.abs(h.s - hs) < 3)) holds.push({ k: z.k, s: hs, c: hc });
      }
    }
    holds.sort((a, b) => a.s - b.s);
    tr.holds = tr.holds.filter((h) => h.k.owner === tr);
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
    const r = routeTo(pos.e.to, d.stopEdge, tr);
    if (!r) return null;
    return { pos, plan: [...r.edges, d.stopEdge], end: stopO, len: pos.e.len - pos.o + r.len + stopO };
  }
  // the nearest depot this train has work at, leaving alone any platform another train is booked into
  function findJob(tr) {
    let best = null;
    for (const d of depots()) {
      if (!d.stopEdge) continue;
      const mine = tr.cars.some((k) => k.cont && k.cont.ringTo === d);
      if ((d === tr.lastDepot && !mine) || !d.hasWorkFor(tr)) continue;
      // trains holding boxes for a busy platform queue for it, and go first once it is free
      const q = (d.queue = (d.queue || []).filter((t) => R.trains.includes(t) && t.cars.some((k) => k.cont && k.cont.ringTo === d)));
      if (d.claim && d.claim !== tr && R.trains.includes(d.claim)) { if (mine && !q.includes(tr)) q.push(tr); continue; }
      if (q.length && q[0] !== tr) continue;
      const r = routeToDepot(tr, d);
      if (r && (!best || r.len < best.r.len)) best = { d, r };
    }
    return best;
  }
  const delivering = (tr) => tr.cars.some((k) => k.cont && k.cont.ringTo && k.cont.ringTo !== R.EXPORT);
  function exitRoute(tr) {
    const pos = headPos(tr);
    if (pos.e === EXIT) { makeRoute(tr, pos, [], undefined, { exit: true }); return true; }
    const r = routeTo(pos.e.to, EXIT, tr);
    if (!r) return false;
    makeRoute(tr, pos, [...r.edges, EXIT], undefined, { exit: true });
    return true;
  }
  // a yard road short of the conflicts at either end of it
  const parkAt = (sd) => Math.min(...sd.zones.filter((z) => z.b > sd.len).map((z) => z.a), sd.len) - 8;
  // a yard road nobody else has taken or is about to run through
  const roadFree = (sd, tr) => (!sd.taken || sd.taken === tr) && !R.trains.some((t) => t !== tr && t.route && t.route.segs.some((sg) => sg.e === sd && !sg.hist));
  function* stable(tr, sd) {
    tr.parked = sd; tr.lastDepot = null;
    R.stats.stabled++;
    tr.status = 'Stabled · yard road ' + sd.siding;
    while (!findJob(tr) && !(tr.role === 'freight' && !delivering(tr))) yield* WT.sleep(1);
    sd.taken = null; tr.parked = null;
  }
  // nothing to do: into the nearest free yard road to wait there
  function park(tr) {
    const pos = headPos(tr);
    let best = null;
    for (const sd of YARD) {
      if (!roadFree(sd, tr)) continue;
      const end = parkAt(sd);
      if (pos.e === sd) { if (end > pos.o - 1) best = { sd, pos, plan: [], end: Math.max(end, pos.o), len: 0 }; break; }
      const r = routeTo(pos.e.to, sd, tr);
      if (r && (!best || r.len < best.len)) best = { sd, pos, plan: [...r.edges, sd], end, len: r.len };
    }
    if (!best) return false;
    best.sd.taken = tr;
    makeRoute(tr, best.pos, best.plan, best.end, { stop: { id: 'Stabling yard', call: () => stable(tr, best.sd) } });
    return true;
  }
  function* pause() { yield* WT.sleep(1); }
  // pick the next move: the ore run first, then the nearest depot with work, else out (freight) or to the yard
  function plan(tr) {
    if (tr.ore && tr.ore.stage < 2) { oreLeg(tr); return; }
    const job = findJob(tr);
    if (job) {
      job.d.claim = tr;
      job.d.queue = (job.d.queue || []).filter((t) => t !== tr);
      makeRoute(tr, job.r.pos, job.r.plan, job.r.end, { stop: { id: job.d.id, d: job.d, call: () => job.d.trainCall(tr) } });
      return;
    }
    if (tr.role === 'freight' && !delivering(tr) && exitRoute(tr)) return;
    if (park(tr)) return;
    // nowhere to go just now: stand and look again
    const pos = headPos(tr);
    makeRoute(tr, pos, [], pos.o, { stop: { id: 'Signal', call: pause } });
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
    if (!tr.route || tr.route.replan) plan(tr);
    while (true) {
      const dt = WT.sim.dt;
      if (dt <= 0) { yield; continue; }
      const rt = tr.route, n = tr.cars.length - 1;
      const onMain = rt.segs.some((sg) => sg.e.main && tr.s >= sg.s0 && tr.s <= sg.s1 && sg.e.main(rt.path.at(tr.s)));
      let target = onMain ? 20 : 16;
      const k = rt.path.maxK(tr.s, tr.s + 40);
      if (k > 1e-4) target = Math.min(target, Math.sqrt(1.3 / k));
      const endS = rt.stop ? rt.len : rt.len + 13 * (n + 2);
      if (rt.stop) target = Math.min(target, Math.sqrt(2 * 0.8 * Math.max(0, rt.len - tr.s)) + 0.25);
      // spacing behind whatever is ahead
      const gap = blockedAhead(tr, 30 + (tr.v * tr.v) / 2.4 + 10);
      if (gap < Infinity) target = Math.min(target, Math.sqrt(2 * 1.2 * Math.max(0, gap - 16)));
      // signals: release every conflict the tail has cleared, then reserve the next junction's conflicts all at once
      // (those that follow closer than a train length are taken together, so no train ever waits inside a junction)
      const tail = tr.s - 13 * n - 7;
      for (const h of rt.holds) if (!h.passed && tail > h.c) { h.passed = true; if (h.k.owner === tr) h.k.owner = null; }
      tr.why = null;
      const pend = rt.holds.filter((h) => !h.passed && h.k.owner !== tr && h.s < endS);
      if (pend.length) {
        const h0 = pend[0], d = h0.s - tr.s - 7;
        if (d < 40 + (tr.v * tr.v) / 2) {
          const cl = [h0];
          let reach = h0.c;
          for (const h of pend.slice(1)) { if (h.s > reach + 13 * (n + 1) + 15) break; cl.push(h); reach = Math.max(reach, h.c); }
          const ok = cl.every((h) => !h.k.owner || !R.trains.includes(h.k.owner)) && cl.every((h) => !h.k.check || h.k.check(tr));
          tr.waitT = ok ? 0 : tr.waitT + dt;
          // (a junction held for minutes by a train that is stuck itself: go anyway, never a circular wait)
          if (ok || (tr.waitT > 120 && !cl.some((h) => h.k.main))) { for (const h of cl) { h.k.owner = tr; tr.holds.push(h); } tr.waitT = 0; }
          else {
            target = Math.min(target, Math.sqrt(2 * 1.2 * Math.max(0, d - 1)));
            tr.why = cl.some((h) => h.k.main) ? 'Signal · waiting to cross the main line' : 'Signal · junction occupied';
          }
        }
      }
      tr.v = Math.max(0, tr.v + WT.clamp(target - tr.v, -2.4 * dt, 1.1 * dt));
      tr.s = Math.min(tr.s + tr.v * dt, endS);
      tr.status = tr.why || (tr.v < 0.3 ? 'Waiting · train ahead' : rt.exit ? 'Leaving for the mainline' : rt.stop ? 'Bound for ' + rt.stop.id : 'Running');
      tr.place();
      if (rt.stop && tr.s >= rt.len - 0.05) {
        tr.v = 0;
        yield* rt.stop.call();
        if (rt.stop.d) tr.lastDepot = rt.stop.d;
        plan(tr);
        continue;
      }
      if (rt.exit && tr.s - 13 * n >= rt.len) {
        tr.remove();
        return;
      }
      yield;
    }
  }

  /* ================= running the network ================= */
  // pod shuttles: two once two depots work, a third with five; each starts from a yard road
  R.startShuttles = function () {
    if (!R.built) return;
    const n = depots().length, want = n >= 2 ? Math.min(3, 1 + Math.floor(n / 2)) : 0;
    while (R.trains.filter((t) => t.role === 'shuttle').length < want) {
      const sd = YARD.find((s) => roadFree(s, null));
      if (!sd) return;
      const tr = new NetTrain('shuttle', 4), end = parkAt(sd);
      tr.route = null;
      sd.taken = tr;
      makeRoute(tr, { e: sd, o: end - 0.5 }, [], end, { stop: { id: 'Stabling yard', call: () => stable(tr, sd) } });
      tr.s = 0;
      tr.place();
      WT.log(`🚆 Pod shuttle ${tr.id} enters service from the stabling yard`, 'blue', true);
      WT.spawn(runNet(tr));
    }
  };
  const freights = () => R.trains.filter((t) => t.role === 'freight');
  // industrial freight: brings pod imports in from the mainline, takes product crates out
  function crates() { return depots().reduce((n, d) => n + d.outbound({ role: 'freight' }).length, 0); }
  function dispatchFreight() {
    const S = WT.SUP, Rm = WT.REMOTE;
    if (!R.built || !W.railBuilt || freights().filter((t) => !t.ore).length >= 2 || freights().length >= 3) return;
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
    tr.route = null;
    makeRoute(tr, { e: ENTRY, o: 0 }, [], undefined, { replan: true });
    tr.s = 0;
    tr.place();
    R.stats.freight++;
    WT.log(`🚂 Industrial freight ${tr.id} inbound with ${want.length} box${want.length === 1 ? '' : 'es'} for the pods`, 'blue', true);
    WT.spawn(runNet(tr));
  }
  // ore trains: in at the west end of the mine line, empties from the container works, loaded at the mine, then
  // across the main onto the trunk and down the spine to the pods that ordered it
  function dispatchOre() {
    const S = WT.SUP, Rm = WT.REMOTE;
    if (!R.built || !W.railBuilt || !Rm || !Rm.branch || freights().length >= 3 || freights().some((t) => t.ore && t.ore.stage < 2)) return;
    const factory = Rm.containerFactory && Rm.containerFactory();
    if (!factory || factory.trainBusy) return;
    const ours = (po, mat) => po.mat === mat && R.serves(po.to) && po.to.pod.depot.roomFor() > 1;
    const site = WT.facilities.find((f) => f.remote && f.active && !f.trainBusy && factory.available(f.mat) > 0 && S.backlog.rail.some((po) => ours(po, f.mat)));
    if (!site || !R.mainClear(BR, -XB - 50, -XB + 420)) return;
    const room = new Map();
    const manifest = S.takeManifest('rail', Math.min(6, factory.available(site.mat)), (po) => {
      if (!ours(po, site.mat)) return false;
      const d = po.to.pod.depot, r = room.has(d) ? room.get(d) : d.roomFor();
      if (r < 2) return false;
      room.set(d, r - 1);
      return true;
    });
    if (!manifest.length) return;
    const boxes = factory.reserve(site.mat, manifest.length);
    factory.trainBusy = true; site.trainBusy = true;
    const tr = new NetTrain('freight', Math.max(2, manifest.length), true);
    tr.ore = { site, factory, manifest, boxes, stage: 0 };
    for (const po of manifest) { po.to.pod.depot.incoming++; S.ev(po, `Ore train ${tr.id} sent for it · via ${site.id}`); }
    tr.route = null;
    makeRoute(tr, { e: MINE, o: 0 }, [], undefined, { replan: true });
    tr.s = 0;
    tr.place();
    R.stats.ore++;
    WT.log(`⛏️ Ore train ${tr.id} up the mine line for ${manifest.length} box${manifest.length === 1 ? '' : 'es'} of ${S.MAT[site.mat].name.toLowerCase()} for the pods`, 'blue', true);
    WT.spawn(runNet(tr));
  }
  // the ore run's two calls on the mine line, each with the wagons centred under the loader
  function oreLeg(tr) {
    const o = tr.ore, n = tr.cars.length - 1, off = (x) => x + XB + 6.5 * (n + 1);
    const pos = headPos(tr);
    if (o.stage === 0) {
      o.stage = 1;
      makeRoute(tr, pos, [], off(o.factory.x), { stop: { id: o.factory.id, call: () => o.factory.loadEmpties(tr, o.boxes, o.site) } });
    } else {
      o.stage = 2;
      makeRoute(tr, pos, [], off(o.site.x), { stop: { id: o.site.id, call: () => loadOre(tr) } });
    }
  }
  function* loadOre(tr) {
    const o = tr.ore;
    yield* o.site.loadTrain(tr, o.manifest);
    o.site.trainBusy = false;
    const loaded = tr.manifest || [];
    for (const po of o.manifest) if (!loaded.includes(po)) { const d = po.to.pod && po.to.pod.depot; if (d) d.incoming = Math.max(0, d.incoming - 1); }
    for (const car of tr.cars) {
      const c = car.cont;
      if (c && c.full && c.po && loaded.includes(c.po)) { c.ringTo = c.po.to.pod.depot; c.status = 'On ore train · bound for ' + c.ringTo.id; }
    }
    R.stats.oreBoxes += loaded.length;
    tr.status = 'Loaded · bound for the pods';
  }
  WT.spawn((function* () {
    while (true) {
      yield* WT.sleep(4);
      try { dispatchOre(); dispatchFreight(); } catch (e) { console.error('[Industrial rail] dispatch:', e); }
    }
  })());
})();
