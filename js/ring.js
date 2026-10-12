/* WareTrack – the rail grid
   The whole map is laid out around rail, the way a big rail base is: double-track running lines (one track each way,
   trains keep right) in a grid, full junctions where they meet, and every stop on a loop of its own.
     · two trunks run the width of the map and off both edges, where freight comes and goes: the north trunk and the
       middle trunk (just north of the highway),
     · a spine runs north–south between every two columns of blocks, from the north trunk across the middle trunk
       and over the highway on a viaduct, down to a stabling yard at its foot,
     · every block (a column of plots either side of a short road of its own, north or south of the highway) is
       served by a station on a loop off its spine: trains turn in from either direction, work the platform, run round
       the loop and leave either way,
     · the mine line past the mines and the container works feeds the north trunk from the west.
   Nothing crosses the map by road. A block's road only runs inside the block, for the movers that carry a box the
   last hundred metres between its station and a dock; between blocks everything goes by train.
   Junctions are worked like signalled blocks: a train reserves every conflict ahead of it in a junction at once
   (the merges, diverges and crossings it will foul) and releases each as its tail clears it.
   Block shuttles carry boxes between blocks, freight brings imports in from the map edge straight to the block
   that ordered them and takes product crates away, and ore trains load at the mines for the blocks that use ore. */
(function () {
  const T = THREE, M = WT.M, W = WT.W, CR = WT.CraneOps;
  const R = (WT.RING = { built: false, trains: [], stats: { moved: 0, empties: 0, issued: 0, calls: 0, freight: 0, imported: 0, exported: 0, ore: 0, oreBoxes: 0, stabled: 0, crateWait: 0, crateWaitMax: 0 } });
  R.EXPORT = { id: 'export', name: 'Export by rail' }; // the destination of a crate that leaves on freight
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  R.center = [0, -60];

  /* ================= blocks ================= */
  // A block is one column (avenue) north or south of the highway: four rows of plots either side of its road. Every
  // block with work to do has a station on the side facing its spine (row 1), a mover depot beside it (row 0), and
  // the rest of its plots for plants, distribution centres and utilities.
  const ROLES = {
    N1: { name: 'Metals', tier: 1, plants: ['Steel Mill', 'Copper Refinery', 'Aluminium Smelter'], color: 0xd9622b },
    N2: { name: 'Materials', tier: 1, plants: ['Chemical Plant', 'Sawmill', 'Glass Works'], color: 0x37b26c },
    N3: { name: 'Drives & Circuits', tier: 2, plants: ['Wire Mill', 'Motor Works', 'Circuit Fab'], color: 0x2f56e0 },
    N4: { name: 'Assembly North', tier: 3, plants: ['Appliances', 'Auto Parts', 'Machinery'], color: 0xf0b429 },
    N5: { name: 'Assembly Tech', tier: 3, plants: ['Electronics', 'E-Bikes', 'Solar Panels'], color: 0x1aa6b7 },
    S3: { name: 'Bodies & Fittings', tier: 2, plants: ['Panel Press', 'Moulding Shop', 'Frame Shop'], color: 0x7a5cd6 },
    S4: { name: 'Port', port: true, plants: [], color: 0x3a6ff7 },
    S5: { name: 'Assembly South', tier: 3, plants: ['Beverages', 'Furniture', 'Pharma'], color: 0xd9434b },
  };
  R.BLOCKS = [];
  W.AVENUES.forEach((A, i) => {
    for (const h of [-1, 1]) {
      const key = (h < 0 ? 'N' : 'S') + (i + 1), role = ROLES[key] || { name: 'Utilities', utility: true, plants: [], color: 0x8e95b8 };
      // the spine its station is on: the one west of it, except the westmost column, which faces east
      const si = i === 0 ? 0 : i - 1, sx = W.SPINES[si], sSt = sx < A ? -1 : 1;
      const b = Object.assign({ key, A, h, spine: si, sx, sSt, tier: role.tier || 0, depot: null }, role);
      const plot = (s, k, extra) => Object.assign(W.plotAt(A, s, h, k), { pod: b }, extra);
      b.plots = [-1, 1].flatMap((s) => [0, 1, 2, 3].map((k) => plot(s, k)));
      b.dcs = [];
      if (!b.utility) {
        b.stationPlot = plot(sSt, 1, { podDepot: true });
        b.moverPlot = plot(sSt, 0);
      }
      if (b.tier === 3) {
        // three assembly lines, each belting its cartons into a distribution centre next door (one centre serves the
        // two lines either side of it)
        b.slots = [[-sSt, 0], [-sSt, 2], [sSt, 2]].map(([s, k], j) => plot(s, k, { podPlant: b.plants[j] }));
        const dcA = plot(-sSt, 1, { podDC: true }), dcB = plot(sSt, 3, { podDC: true });
        b.dcs = [dcA, dcA, dcB];
      } else if (b.tier) b.slots = [[-sSt, 1], [-sSt, 0], [sSt, 2]].map(([s, k], j) => plot(s, k, { podPlant: b.plants[j] }));
      else b.slots = [];
      const taken = [b.stationPlot, b.moverPlot, ...b.slots, ...b.dcs];
      b.fillers = b.plots.filter((p) => !taken.includes(p));
      const zs = b.plots.map((p) => p.zc);
      b.z0 = Math.min(...zs) - 53; b.z1 = Math.max(...zs) + 53;
      R.BLOCKS.push(b);
    }
  });
  R.PODS = R.BLOCKS; // (older name)
  R.block = (key) => R.BLOCKS.find((b) => b.key === key);
  R.podFor = (name) => R.BLOCKS.find((b) => b.plants.includes(name)) || null;
  const idx = (b, name) => b.plants.indexOf(name);
  // the block plot reserved for a plant of this kind, while it is free
  R.slotFor = (name) => {
    const b = R.podFor(name), p = b && b.slots[idx(b, name)];
    return p && !p.used ? p : null;
  };
  // an assembly line's distribution centre: its plot, and the centre itself once it is planned or built
  R.dcSlot = (name) => { const b = R.podFor(name); return b && b.tier === 3 ? b.dcs[idx(b, name)] : null; };
  R.dcOf = (name) => { const p = R.dcSlot(name); return p && p.used && p.used.type === 'Warehouse' ? p.used : null; };
  // the block a facility belongs to (its plot's, or the port's)
  R.blockOf = (f) => (f && (f.pod || (f.plot && f.plot.pod))) || null;
  // a station that is working
  const working = (d) => !!(d && d.active && d.platforms && d.platforms[0].edge.built);
  // a transfer goes by rail when the two plants sit in different blocks whose stations are working
  R.route = (p, q) => {
    const a = R.blockOf(p), b = R.blockOf(q), da = a && a.depot, db = b && b.depot;
    return a && b && a !== b && working(da) && working(db) && R.trains.some((t) => t.role === 'shuttle') ? { from: da, to: db } : null;
  };
  // a block facility's imports come by freight once the trunk and its station are working
  R.serves = (f) => { const b = R.blockOf(f); return !!(R.built && b && working(b.depot)); };

  /* ================= track network ================= */
  // One-way edges between nodes. Running lines are double track 6 m apart: a spine's southbound track on its west
  // side, a trunk's eastbound track on its south side (trains keep right).
  const XO = W.EDGE + 250, BR = -688, XB = W.EDGE + 400; // portals beyond the map edge; the mine line and its west end
  const NT = -632, MT = -150, RAD = 22, FOUL = 4.5, H = 40;
  R.NT = NT; R.MT = MT;
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
  let curWork = null; // the works the edges being defined belong to (each is laid by its own project)
  function edge(id, from, to, pts, o = {}) {
    const e = Object.assign({ id, from: node(from), to: node(to), zones: [], work: curWork, built: false }, o);
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
  const LINES = {};
  const line = (id, at, dir, work) => (LINES[id] = { at, dir, work, stops: [] });
  const on = (lid, t, id) => { LINES[lid].stops.push({ t, id }); return id; };
  for (const [tk, zc] of [['N', NT], ['M', MT]]) {
    line(tk + 'EB', (t) => [t, zc + 3], 1, 'trunk');
    line(tk + 'WB', (t) => [t, zc - 3], -1, 'trunk');
    // the portals: in from the west on the eastbound track, from the east on the westbound one, out the other ways
    on(tk + 'EB', -XO, tk + '-in-W'); on(tk + 'EB', XO, tk + '-out-E');
    on(tk + 'WB', XO, tk + '-in-E'); on(tk + 'WB', -XO, tk + '-out-W');
  }
  W.SPINES.forEach((sx, i) => {
    line('SB' + i, (t) => [sx - 3, t], 1, 'spine' + i);
    line('NB' + i, (t) => [sx + 3, t], -1, 'spine' + i);
  });
  // A junction where a trunk meets a spine. Each arm is double track: in on one track, out on the other; every
  // turn is an edge of its own from the arm's entry node to the other arm's exit node, the straights run on the lines.
  function junction(id, xc, zc, arms, tk, si) {
    curWork = 'spine' + si;
    const SB = 'SB' + si, NB = 'NB' + si, A = {};
    if (arms.includes('W')) A.W = { inL: tk + 'EB', inT: xc - H, inP: [xc - H, zc + 3], outL: tk + 'WB', outT: xc - H, outP: [xc - H, zc - 3], inZ: zc + 3, outZ: zc - 3 };
    if (arms.includes('E')) A.E = { inL: tk + 'WB', inT: xc + H, inP: [xc + H, zc - 3], outL: tk + 'EB', outT: xc + H, outP: [xc + H, zc + 3], inZ: zc - 3, outZ: zc + 3 };
    if (arms.includes('N')) A.N = { inL: SB, inT: zc - H, inP: [xc - 3, zc - H], outL: NB, outT: zc - H, outP: [xc + 3, zc - H], inX: xc - 3, outX: xc + 3 };
    if (arms.includes('S')) A.S = { inL: NB, inT: zc + H, inP: [xc + 3, zc + H], outL: SB, outT: zc + H, outP: [xc - 3, zc + H], inX: xc + 3, outX: xc - 3 };
    for (const [k, a] of Object.entries(A)) { a.inN = on(a.inL, a.inT, `${id}-${k}i`); a.outN = on(a.outL, a.outT, `${id}-${k}o`); }
    const opp = { W: 'E', E: 'W', N: 'S', S: 'N' };
    for (const [ka, a] of Object.entries(A)) for (const [kb, b] of Object.entries(A)) {
      if (ka === kb || opp[ka] === kb) continue; // (straight through runs on the line itself)
      // the corner: where the incoming track's line meets the outgoing track's
      const corner = a.inZ !== undefined ? [b.outX, a.inZ] : [a.inX, b.outZ];
      edge(`${id}-${ka}${kb}`, a.inN, b.outN, [a.inP, corner, b.outP]);
    }
    curWork = null;
  }
  W.SPINES.forEach((sx, i) => {
    junction('jN' + i, sx, NT, 'WES', 'N', i);
    junction('jM' + i, sx, MT, 'WENS', 'M', i);
  });

  // A station loop beside a spine. In its own frame u runs across from the spine toward the platform and v along the
  // platform in the direction trains work it (south on the west side, north on the east side). The near running line
  // is the one on the station's side. Both lines can turn in and both can be joined on the way out, so a full
  // junction: the turns from and onto the far line cross the near one.
  function station(key, si, side, zc) {
    const sx = W.SPINES[si];
    curWork = 'st' + key;
    const P = ([u, v]) => (side < 0 ? [sx - u, zc + v] : [sx + u, zc - v]);
    const zOf = (v) => (side < 0 ? zc + v : zc - v);
    const near = (side < 0 ? 'SB' : 'NB') + si, far = (side < 0 ? 'NB' : 'SB') + si;
    const J = -72, L = J + 6, k = 'st' + key;
    const nd = on(near, zOf(J - 30), k + '-nd'), nm = on(near, zOf(L + 30), k + '-nm');
    const fd = on(far, zOf(J + 30), k + '-fd'), fm = on(far, zOf(L - 30), k + '-fm');
    edge(k + '-near-in', nd, k + '-in', [[3, J - 30], [3, J], [28, J]].map(P));
    edge(k + '-far-in', fd, k + '-in', [[-3, J + 30], [-3, J], [28, J]].map(P));
    // two platforms side by side under the gantry, so two trains are worked at once; they part off the lead and
    // join again on the way back
    edge(k + '-lead', k + '-in', k + '-pd', [[28, J], [100, J]].map(P));
    const loop = edge(k + '-p1', k + '-pd', k + '-pm', [[100, J], [128, J], [128, 82], [84, 82], [84, 42]].map(P), { station: key, platform: 0 });
    edge(k + '-p2', k + '-pd', k + '-pm', [[100, J], [122, J], [122, 76], [84, 76], [84, 42]].map(P), { station: key, platform: 1 });
    edge(k + '-p3', k + '-pd', k + '-pm', [[100, J], [134, J], [134, 88], [84, 88], [84, 42]].map(P), { station: key, platform: 2 });
    edge(k + '-ret', k + '-pm', k + '-out', [[84, 42], [84, L], [28, L]].map(P));
    edge(k + '-out-near', k + '-out', nm, [[28, L], [3, L], [3, L + 30]].map(P));
    edge(k + '-out-far', k + '-out', fm, [[28, L], [-3, L], [-3, L - 30]].map(P));
    curWork = null;
    return loop;
  }
  for (const b of R.BLOCKS) if (b.stationPlot) b.station = station(b.key, b.spine, b.sx < b.A ? 1 : -1, b.stationPlot.zc);

  // a stabling yard at the foot of every spine: four roads off the southbound line, round a balloon onto the
  // northbound one; idle trains wait here instead of circling, and a train that has to turn round runs through
  const YARD = [];
  W.SPINES.forEach((sx, i) => {
    curWork = 'spine' + i;
    const yD = on('SB' + i, 310, 'y' + i + 'D'), yOut = on('NB' + i, 296, 'y' + i + 'Out');
    for (let k = 0; k < 6; k++) {
      const x = sx - 3 - 7 * k;
      YARD.push(edge(`yard${i}-${k + 1}`, yD, 'y' + i + 'M', k ? [[sx - 3, 310], [sx - 3, 322], [x, 340 + 4 * k], [x, 500 - 4 * k], [sx - 3, 518], [sx - 3, 530]] : [[sx - 3, 310], [sx - 3, 530]], { siding: k + 1, spine: i }));
    }
    edge(`yard${i}-out`, 'y' + i + 'M', yOut, [[sx - 3, 530], [sx - 3, 552], [sx + 41, 552], [sx + 41, 352], [sx + 3, 316], [sx + 3, 296]]);
    curWork = null;
  });
  // the mine line: in at the west end of the branch past the container works and the mines, then down across the
  // north trunk's westbound track onto its eastbound one
  curWork = 'trunk';
  const MINE = edge('mine', 'brIn', 'brD', [[-XB, BR], [-985, BR]], { main: () => true });
  edge('ore-link', 'brD', on('NEB', -880, 'oreM'), [[-985, BR], [-955, BR], [-910, NT + 3], [-880, NT + 3]]);
  curWork = null;
  for (const [lid, L] of Object.entries(LINES)) {
    const list = L.stops.filter((s, i, a) => a.findIndex((o) => o.id === s.id) === i).sort((a, b) => (a.t - b.t) * L.dir);
    curWork = L.work;
    for (let i = 0; i < list.length - 1; i++) edge(lid + '-' + i, list[i].id, list[i + 1].id, [L.at(list[i].t), L.at(list[i + 1].t)], { line: lid });
    curWork = null;
  }
  const PORTALS = ['N', 'M'].flatMap((tk) => [{ tk, side: 'W', edge: NODES[tk + '-in-W'].out[0] }, { tk, side: 'E', edge: NODES[tk + '-in-E'].out[0] }]);
  const EXITS = ['N-out-E', 'N-out-W', 'M-out-E', 'M-out-W'].map((id) => NODES[id].in[0]);
  R.EDGES = EDGES; R.NODES = NODES; R.LOCKS = LOCKS; R.YARD = YARD;

  /* ----- conflicts: every place two routes foul each other is a lock with a zone on each edge ----- */
  const xz = (e, s) => { const p = e.path.at(s); return [p.x, p.z]; };
  const dist = (e, x, z) => {
    if (x < e.bb[0] - 9 || x > e.bb[1] + 9 || z < e.bb[2] - 9 || z > e.bb[3] + 9) return 99;
    let m = Infinity;
    for (const p of e.path.pts) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < m) m = d; }
    return Math.sqrt(m);
  };
  const mkLock = (kind, x, z) => { const k = { id: kind + '-' + LOCKS.length, kind, x, z, owner: null }; LOCKS.push(k); return k; };
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
    for (const e of EDGES) e.zones.sort((a, b) => a.a - b.a);
  })();

  /* ----- routing: shortest ways over built track, keeping out of yard roads taken by other trains ----- */
  function search(from, tr) {
    const dist = new Map([[from, 0]]), prev = new Map(), heap = [[0, from]];
    const push = (it) => { heap.push(it); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        while (true) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
      }
      return top;
    };
    heap.pop(); push([0, from]);
    while (heap.length) {
      const [d, n] = pop();
      if (d > dist.get(n)) continue;
      for (const e of n.out) {
        if (!e.built || (e.taken && e.taken !== tr)) continue;
        const nd = d + e.len;
        if (!dist.has(e.to) || nd < dist.get(e.to)) { dist.set(e.to, nd); prev.set(e.to, e); push([nd, e.to]); }
      }
    }
    return { from, dist, prev };
  }
  // the edges from the search's start to the start of the target edge
  function pathTo(S, target) {
    if (!target.built || !S.dist.has(target.from)) return null;
    const list = [];
    for (let n = target.from; n !== S.from; n = S.prev.get(n).from) list.unshift(S.prev.get(n));
    return { edges: list, len: S.dist.get(target.from) };
  }
  // the edge (and offset along it) nearest a world point
  function locate(x, z, filter) {
    let best = null;
    for (const e of EDGES) {
      if (e.main || (filter && !filter(e))) continue;
      if (x < e.bb[0] - 20 || x > e.bb[1] + 20 || z < e.bb[2] - 20 || z > e.bb[3] + 20) continue;
      for (let s = 0; s <= e.len; s += 1) { const p = e.path.at(s), d = (p.x - x) ** 2 + (p.z - z) ** 2; if (!best || d < best.d) best = { e, s, d }; }
    }
    return best;
  }

  /* ================= laying track ================= */
  function sign(lines, w, h, bg) {
    const tex = M.canvasTex(512, Math.round((512 * h) / w), (ctx) => {
      const Hh = ctx.canvas.height;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, Hh);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach(([text, size, y]) => { ctx.font = `800 ${size}px Inter, "Segoe UI", Arial`; ctx.fillText(text, 256, y * Hh); });
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
  // signal aspects for every laid conflict: red while a train holds it, green otherwise
  const LAMPS = [];
  const lampGeo = new T.SphereGeometry(0.2, 8, 6), lampRed = new T.MeshBasicMaterial({ color: 0xff3b30 }), lampGreen = new T.MeshBasicMaterial({ color: 0x34c759 });
  let lampG = null, lampR = null;
  const lampMtx = new T.Matrix4();
  function updateLamps() {
    if (!lampG || lampG.instanceMatrix.count < LAMPS.length) {
      if (lampG) WT.scene.remove(lampG, lampR);
      const n = Math.max(64, LAMPS.length * 2);
      lampG = new T.InstancedMesh(lampGeo, lampGreen, n); lampR = new T.InstancedMesh(lampGeo, lampRed, n);
      lampG.frustumCulled = lampR.frustumCulled = false;
      WT.scene.add(lampG, lampR);
    }
    let gi = 0, ri = 0;
    for (const l of LAMPS) {
      lampMtx.makeTranslation(l.x, l.y, l.z);
      if (l.k.owner) lampR.setMatrixAt(ri++, lampMtx); else lampG.setMatrixAt(gi++, lampMtx);
    }
    lampG.count = gi; lampR.count = ri;
    lampG.instanceMatrix.needsUpdate = lampR.instanceMatrix.needsUpdate = true;
  }
  WT.on('frame', () => { if (LAMPS.length) updateLamps(); });
  // Lay one works (its edges in turn, behind a track-laying machine): ballast and sleepers on the ground, a deck and
  // piers on a viaduct, rails as long runs on the straights. The edges carry trains once the works is complete.
  R.works = {};
  R.layWorks = function* (work, secs) {
    const es = EDGES.filter((e) => e.work === work && !e.built && !(e.main && e.main(e.path.at(0)) && e.main(e.path.at(e.len))));
    if (!es.length) { EDGES.filter((e) => e.work === work).forEach((e) => (e.built = true)); return; }
    R.works[work] = 'laying';
    const g = new T.Group();
    WT.scene.add(g);
    const ballast = [], sleepers = [], runs = [], deck = new M.MB();
    let total = 0;
    for (const e of es) {
      const rb = new M.MB(), straight = e.path.maxK(0, e.len) < 1e-4;
      if (straight) {
        // one long rail each side
        const p0 = e.path.at(0), p1 = e.path.at(e.len), a = p0.a, nx = -Math.sin(a), nz = Math.cos(a);
        let y0 = 0;
        for (let s = 0; s <= e.len; s += 8) y0 = Math.max(y0, e.yAt(s));
        if (y0 < 0.05) for (const o of [-0.75, 0.75]) rb.boxC(e.len, 0.2, 0.16, 0x6a7194, (p0.x + p1.x) / 2 + nx * o, 0.15, (p0.z + p1.z) / 2 + nz * o, 0, -a, 0);
      }
      for (let s = 0; s < e.len; s += 2) {
        const p = e.path.at(s), y = e.yAt(s);
        if (e.main && e.main(p)) continue;
        if (s % 18 < 2) W.clearTrees({ x0: p.x - 12, x1: p.x + 12, z0: p.z - 12, z1: p.z + 12 });
        const nx = -Math.sin(p.a), nz = Math.cos(p.a);
        if (!straight || y >= 0.05) for (const o of [-0.75, 0.75]) rb.boxC(2.04, 0.2, 0.16, 0x6a7194, p.x + nx * o, y + 0.15, p.z + nz * o, 0, -p.a, 0);
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
    // a signal mast ahead of every conflict a train may be held at, in short runs of their own so each piece is only
    // ever tested against what passes near it
    const masts = [], lamps = [];
    for (const e of es) {
      const mb = new M.MB();
      for (const z of e.zones) {
        if (z.a < 3) continue; // (the diverges: held where the line reaches them)
        const s = Math.max(0, z.a - 2), p = e.path.at(s);
        const nx = -Math.sin(p.a), nz = Math.cos(p.a), x = p.x + nx * 2.6, zz = p.z + nz * 2.6, y = e.yAt(s);
        mb.box(0.22, 4.2, 0.22, 0x4a5578, x, y, zz);
        mb.box(0.5, 0.9, 0.5, 0x2b2f3d, x, y + 4.2, zz);
        lamps.push({ x, y: y + 4.65, z: zz, k: z.k });
      }
      if (!mb.p.length) continue;
      const mm = mb.mesh();
      mm.visible = false;
      g.add(mm);
      masts.push(mm);
    }
    const bm = W.dashes(g, ballast, W.COL.ballast, 0.028), sm = W.dashes(g, sleepers, 0xa49c90, 0.06);
    const dm = deck.p.length ? deck.mesh() : null;
    if (dm) { dm.visible = false; g.add(dm); }
    bm.count = sm.count = 0;
    const layer = (R.layer = M.trackLayer()); // (the machine at work, for the camera)
    WT.scene.add(layer);
    let bi = 0, si = 0;
    yield* WT.tween(secs || Math.max(8, Math.min(60, total / 120)), (k) => {
      const d = total * k;
      while (bi < ballast.length && ballast[bi].at <= d) bi++;
      while (si < sleepers.length && sleepers[si].at <= d) si++;
      bm.count = bi; sm.count = si;
      let cur = runs[0];
      for (const r of runs) { r.m.visible = r.at <= d; if (r.at <= d) cur = r; }
      if (dm) dm.visible = k > 0.2;
      const p = cur.e.path.at(Math.min(cur.e.len, d - cur.at));
      layer.position.set(p.x, cur.e.yAt(Math.min(cur.e.len, d - cur.at)), p.z); layer.rotation.y = -p.a;
    });
    bm.count = ballast.length; sm.count = sleepers.length;
    runs.forEach((r) => (r.m.visible = true));
    if (dm) dm.visible = true;
    masts.forEach((m) => (m.visible = true));
    WT.scene.remove(layer);
    if (R.layer === layer) R.layer = null;
    LAMPS.push(...lamps);
    EDGES.filter((e) => e.work === work).forEach((e) => (e.built = true));
    R.works[work] = 'built';
  };
  R.workBuilt = (work) => R.works[work] === 'built';
  // the trunks (and the mine line's link): the first thing ever built, before any block
  R.buildTrunk = function* () {
    if (WT.REMOTE && WT.REMOTE.buildBranch) WT.REMOTE.buildBranch();
    yield* R.layWorks('trunk', 70);
    const board = sign([['RIVERSIDE RAIL GRID', 52, 0.36], ['Trunks · spines · station loops', 28, 0.72]], 18, 5, '#2f56e0');
    board.rotation.y = -Math.PI / 2;
    board.position.set(-60, 0, MT + 26);
    WT.scene.add(board);
    R.built = true; W.railBuilt = true;
  };
  R.buildSpine = function* (i) { yield* R.layWorks('spine' + i, 45); R.startShuttles(); };
  R.spineFor = (b) => b.spine;
  R.spineBuilt = (i) => R.workBuilt('spine' + i);

  /* ================= blocks on the ground ================= */
  // each block is a precinct of its own: a border in its colour, and a hedge along its sides except where its
  // station loop runs out to the spine
  R.precinct = function (b) {
    if (b.fenced) return;
    b.fenced = true;
    const g = new T.Group(), A = b.A, z0 = b.z0 - 4, z1 = b.z1 + 4, line = [];
    for (const x of [A - 118, A + 118]) W.dashLine(line, x, z0, x, z1, z1 - z0, 0, 0.6);
    W.dashLine(line, A - 118, z0, A + 118, z0, 236, 0, 0.6); W.dashLine(line, A - 118, z1, A + 118, z1, 236, 0, 0.6);
    W.dashes(g, line, b.color, 0.05);
    let mb = null, i = 0;
    const shrub = (x, z) => { if (i % 12 === 0) { if (mb) g.add(mb.mesh()); mb = new M.MB(); } mb.blob(1.3, i % 3 ? 0x4f7d3a : 0x5c8a42, x, 1.1, z, 1.2, 0.85, 1.2, 1, 0.3, i + 1); i++; };
    for (const sd of [-1, 1]) {
      if (b.stationPlot && sd === b.sSt) continue;
      for (let z = z0 + 3; z <= z1 - 3; z += 3.2) shrub(A + sd * 121, z);
    }
    // across the far end (away from the highway), and across the near end either side of the road's turning head
    const zf = b.h < 0 ? z0 - 3 : z1 + 3, zn = b.h < 0 ? z1 + 3 : z0 - 3;
    if (!b.port) for (let x = A - 118; x <= A + 118; x += 3.2) shrub(x, zf);
    for (let x = A - 118; x <= A + 118; x += 3.2) if (Math.abs(x - A) > 13) shrub(x, zn);
    if (mb) g.add(mb.mesh());
    W.groundText(g, 'BLOCK ' + b.key, A + (b.sSt || 1) * 10, b.h < 0 ? b.z0 + 4 : b.z1 - 4, 16, 6, hex(b.color), b.h < 0 ? Math.PI : 0, 80);
    WT.scene.add(g);
  };

  /* ================= block station ================= */
  // Plot-local layout: entry road along z 46, a bypass lane at x 54 with three crane bays at x 62, the box yard
  // (five rows of six) and three platform tracks at x 98, 104 and 110 under one rail-mounted gantry spanning x 48–114,
  // travelling z −33…33.
  const BAYS = [20, -2, -24], BAY_X = 62, BYP_X = 54, TRACK_X = 104, XC = 81, SPAN = 66, SAFE = 10.5, SPEED = 28, U_MAX = 33;
  const ROWS = [68, 74, 80, 86, 92], COLS = [-32.5, -19.5, -6.5, 6.5, 19.5, 32.5];
  class BlockStation extends WT.Facility {
    constructor(pod) {
      super('Block station', 'ST', `Block ${pod.key} Station`, pod.stationPlot);
      this.pod = pod;
      pod.depot = this;
      this.docks = BAYS.map((z, i) => ({ n: i + 1, x: BAY_X, z, truck: null, job: null, ops: ['pick', 'drop'] }));
      this.slots = [];
      for (const x of ROWS) for (const z of COLS) this.slots.push({ x, z, items: [] });
      this.jobs = [];
      this.trains = []; // the trains at its platforms
      this.pendingDrop = 0; // movers booked to drop a box here
      this.incoming = 0; // boxes on their way here by rail (or booked to be)
      this.income = 6000;
      this.site = { x: XC, z: 0, w: 60, d: 66, h: 18 };
    }
    get gateIn() { return { A: this.plot.A, z: this.toWorld(0, 46)[1] }; }
    get gateOut() { return { A: this.plot.A, z: this.toWorld(0, -46)[1] }; }
    get train() { return this.trains[0] || null; }
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
      W.flat(g, 36, 80, W.COL.concrete, 82, 0, 0.027);
      const yel = [], white = [];
      for (const d of this.docks) W.dashRect(yel, BAY_X, d.z - 0.6, 4.4, 15.6, 1, 0.5, 0.22);
      for (const s of this.slots) W.dashRect(yel, s.x, s.z, 3.2, 12.4, 1, 0.6, 0.2);
      W.dashLine(white, 58, 30, 58, -30, 3, 2.4, 0.22);
      W.dashLine(yel, 100.6, 36, 100.6, -36, 36 * 2, 0, 0.3); // platform edge
      for (let z = 40; z > -44; z -= 14) white.push({ x: BYP_X, z, len: 2.2, w: 0.5, rot: Math.PI / 2 });
      W.dashes(g, yel, W.COL.yellow, 0.062);
      W.dashes(g, white, 0xffffff, 0.06);
      W.groundText(g, 'BLOCK ' + pod.key, 66, 34, 10, 5, hex(pod.color), Math.PI / 2, 90);
      const b = new M.MB();
      for (const x of [XC - SPAN / 2, XC + SPAN / 2]) b.box(0.5, 0.15, 80, 0x7a81a4, x, 0.04, 0); // crane rails
      for (const z of [-24, 0, 24]) { b.box(0.25, 6, 0.25, 0x9aa1c4, 100.9, 0, z); b.box(1.6, 0.3, 0.5, 0xeef0fa, 100.2, 6, z); } // platform lamps
      S.add(b.mesh());
      M.block(S, { x: 20, z: 0, w: 14, d: 12, h: 8, trim: pod.color }); // depot office
      const board = sign([['BLOCK ' + pod.key, 104, 0.34], [pod.name.toUpperCase(), 52, 0.66], [(pod.tier ? 'Tier ' + pod.tier + ' · ' + WT.SUP.TIER_NAME[pod.tier] : 'Sea freight') + ' · station', 26, 0.87]], 9, 6, hex(pod.color));
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
      WT.spawn(R.layWorks('st' + pod.key, 16)); // its loop off the spine goes down with it
    }
    activate() {
      super.activate();
      // where on the network the platform is: trains stop with their wagons centred on it
      this.platforms = [TRACK_X, TRACK_X + 6, TRACK_X - 6].map((x, i) => {
        const w = this.world(x, 0, 0), at = locate(w.x, w.z, (e) => e.station === this.pod.key && e.platform === i);
        return { i, edge: at.e, off: at.s, claim: null };
      });
      this.stopEdge = this.platforms[0].edge; this.stopOff = this.platforms[0].off;
      this.lead = EDGES.find((e) => e.id === 'st' + this.pod.key + '-lead');
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
        if (!tr) return true;
        const exporter = tr.role === 'freight' || !!tr.crateRun;
        return exporter === (c.ringTo === R.EXPORT);
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
    // an empty of the right kind for this material, sitting idle in this block's pool
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
      const all = this.slots.flatMap((s) => s.items).filter((x) => this.idle(x));
      if (same.length <= 2 && all.length <= 3) return;
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
        c.ringTo = R.EXPORT; c.status = 'Export · awaiting freight'; c.waitFrom = WT.sim.minutes;
        S.note(c, `Dropped at ${this.id} for export by rail`);
        return;
      }
      if (po && po.ring) {
        c.ringTo = po.ring.to; c.ringHome = c.ringHome || this;
        c.status = 'Awaiting block shuttle';
        S.note(c, `Dropped at ${this.id} for ${c.ringTo.id}`);
        S.ev(po, `At ${this.id} · awaiting block shuttle → ${c.ringTo.id}`);
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
      let car = null;
      for (const t of this.trains) if ((car = t.cars.find((k) => k.cont === c))) break;
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
    *trainCall(tr, pf) {
      pf = pf || this.platforms.find((p) => p.claim === tr) || this.platforms[0];
      pf.claim = tr;
      this.trains.push(tr); tr.at = this;
      tr.status = 'Working at ' + this.id;
      R.stats.calls++;
      WT.emit('event', { kind: 'train', ent: tr, weight: 2 });
      // pre-advice: the boxes for this block are released to the movers as the train pulls in
      for (const car of tr.cars) {
        const c = car.cont;
        if (c && c.ringTo === this && c.full && c.po && !c.advised) { c.advised = true; c.at = this; c.hold = true; c.status = 'On train at ' + this.id; WT.SUP.grounded(c.po, this.id); }
      }
      const job = { train: tr, label: 'Working ' + tr.id, plan: () => this.trainLift(tr) };
      this.jobs.push(job);
      // boxes for this block always come off (their yard room was booked with them); loading gives up after a while
      const t0 = WT.sim.minutes;
      while (!job.done && (WT.sim.minutes - t0 < 30 || tr.cars.some((k) => k.cont && k.cont.ringTo === this))) yield;
      job.done = true;
      while (this.crane.trainBox) yield;
      this.trains = this.trains.filter((t) => t !== tr); tr.at = null;
      if (pf.claim === tr) pf.claim = null;
    }
    trainLift(tr) {
      // everything for this block comes off first ...
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
          if (c.ringTo === R.EXPORT) {
            const w = WT.sim.minutes - (c.waitFrom || WT.sim.minutes);
            R.stats.crateWait += w; R.stats.crateWaitMax = Math.max(R.stats.crateWaitMax, w);
            c.status = 'On freight'; WT.SUP.cratesRailed++; R.stats.exported++; WT.SUP.note(c, `Loaded on ${tr.id} at ${this.id} for export`); return; }
          c.status = c.full ? 'On block shuttle' : 'Empty · on block shuttle';
          WT.SUP.note(c, `Loaded on ${tr.id} at ${this.id} → ${c.ringTo.id}`);
          if (c.full && c.po) WT.SUP.ev(c.po, `On block shuttle · ${tr.id} → ${c.ringTo.id}`);
        } };
    }

    /* ----- the gantry: truck work first, then the train at the platform ----- */
    *craneWorker() {
      const c = this.crane;
      while (true) {
        let pick = null;
        // the train at the platform first (it holds the platform), then the movers
        const order = this.jobs.filter((j) => !j.done).sort((a, b) => (b.train ? 1 : 0) - (a.train ? 1 : 0));
        for (const j of order) {
          const lift = j.plan();
          if (lift === 'skip') { j.done = true; continue; }
          if (lift) { pick = { j, lift }; break; }
        }
        this.jobs = this.jobs.filter((j) => !j.done);
        if (!pick) { c.task = 'Idle'; yield* WT.sleep(0.1); continue; }
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
      yield* WT.sleep(0.08);
      yield* CR.transfer(c, u(Lf.to.z), Lf.to.x - XC, Lf.to.base + 2.95, SAFE, SPEED);
      const m = CR.release(c);
      Lf.commit(m);
      if (Lf.slot) Lf.slot.busy = false;
      box.lifting = false; c.trainBox = false;
      c.lifts++; this.moves++;
      WT.G && WT.G.earn(3000, this);
      yield* WT.sleep(0.04);
    }
    card() {
      const items = this.slots.flatMap((s) => s.items);
      const pool = items.filter((c) => this.idle(c)).length, out = items.filter((c) => c.ringTo && c.ringTo !== this && c.ringTo !== R.EXPORT).length;
      const crates = items.filter((c) => c.ringTo === R.EXPORT).length, wait = items.filter((c) => c.full && !c.ringTo).length;
      return this.cardBase({
        kicker: `Facility · Block station · Block ${this.pod.key}`, icon: '🚉', sub: `Block ${this.pod.key} · ${this.pod.name}${this.pod.plants.length ? ' — ' + this.pod.plants.join(', ') : ''}`,
        where: this.trains.length ? this.trains.map((t) => t.id).join(' + ') + ' at the platforms' : 'Platforms clear',
        rows: [['To other blocks', String(out)], ['Crates for export', String(crates)], ['Awaiting a mover', String(wait)], ['Empties in pool', String(pool)], ['Inbound by rail', String(this.incoming)],
          ['Yard', `${items.length} boxes · ${this.freeSlots()} of ${this.slots.length} slots free`], ['Gantry', this.crane ? `${this.crane.carry ? 'Lifting' : this.crane.task} · ${this.crane.lifts} lifts` : 'Being erected'],
          ['Truck bays', this.docks.map((d) => (d.truck ? '■' : '□')).join(' ')], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
      });
    }
  }
  WT.BlockStation = BlockStation;
  WT.RingDepot = BlockStation; // (older name)

  /* ================= trains on the network ================= */
  // every car of every train, mainline ones included, for spacing
  R.allCars = () => [...WT.trains, ...R.trains].flatMap((t) => t.cars.map((c) => ({ t, p: c.g.position })));
  // is a stretch of a main track clear of every train (mainline trains and ours)?
  R.mainClear = (z, x0, x1, except) => R.allCars().every(({ t, p }) => t === except || Math.abs(p.z - z) > 3 || p.x < x0 || p.x > x1);
  // (there is no mainline any more: nothing of ours ever holds one)
  R.crossingHeld = () => false;
  R.signalAhead = () => Infinity;
  let seqS = 11, seqF = 701;
  class NetTrain extends WT.Entity {
    constructor(kind, n, ore) {
      super();
      this.kind = 'train';
      this.role = kind; // 'shuttle' or 'freight'
      this.id = kind === 'shuttle' ? 'BS-' + seqS++ : (ore ? 'OR-' : 'FR-') + seqF++;
      this.operator = kind === 'shuttle' ? 'WareTrack Block Shuttle' : ore ? 'Ridgeline Mining · ore to the blocks' : 'WareTrack Rail Freight';
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
      for (const d of depots()) { for (const p of d.platforms) if (p.claim === this) p.claim = null; if (d.waitSlot === this) d.waitSlot = null; }
      WT.unregister(this);
      R.trains.splice(R.trains.indexOf(this), 1);
    }
    card() {
      const boxes = this.cars.filter((c) => c.cont);
      const to = (c) => (c.cont.ringTo ? c.cont.ringTo.id : c.cont.contents ? c.cont.contents.name : '—');
      return {
        kicker: (this.role === 'shuttle' ? 'Block shuttle · ' : this.ore ? 'Ore train · ' : 'Freight · ') + this.operator, title: this.id,
        sub: this.role === 'shuttle' ? 'Carries boxes between blocks' : this.ore ? `${WT.SUP.MAT[this.ore.site.mat].name} from ${this.ore.site.id} to the blocks` : 'Imports to the blocks, product crates out',
        icon: '🚆', iconBg: this.role === 'shuttle' ? '#7fe0d6' : '#ffd479', status: this.status, statusTone: WT.toneFor(this.status), where: this.at ? this.at.id + ' platform' : this.parked ? 'Stabling yard · road ' + this.parked.siding : 'Rail grid',
        rows: [['Consist', `1 loco + ${this.cars.length - 1} container flats`], ['Boxes aboard', boxes.length ? boxes.map((c) => `${c.cont.id} → ${to(c)}`).join(' · ') : 'None'],
          ['Next stop', this.route && this.route.stop ? this.route.stop.id : this.route && this.route.exit ? 'Portal · leaving the map' : '—'], ['Speed', Math.round(this.v * 3.6) + ' km/h']],
      };
    }
    label() { return this.id + (this.role === 'shuttle' ? (this.crateRun ? ' · Block shuttle · export run' : ' · Block shuttle') : this.ore ? ' · Ore train' : ' · Freight'); }
  }
  const depots = () => WT.facilities.filter((f) => f.type === 'Block station' && working(f));

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
      { const q = P.at(tr.s); push(q.x, q.z); } // (ending exactly at the head, so the new route never folds back on it)
      for (const sg of tr.route.segs) if (sg.s1 > h0 && sg.s0 < tr.s) segs.push({ e: sg.e, o0: sg.o0 + Math.max(0, h0 - sg.s0), s0: Math.max(0, sg.s0 - h0), s1: Math.min(sg.s1, tr.s) - h0, hist: true });
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
  function routeToDepot(tr, d, S, pf) {
    pf = pf || d.platforms[0];
    const pos = headPos(tr), n = tr.cars.length - 1, stopO = pf.off + 6.5 * (n + 1);
    if (pos.e === pf.edge && stopO > pos.o + 1) return { pos, plan: [], end: stopO, len: stopO - pos.o };
    const r = pathTo(S || search(pos.e.to, tr), pf.edge);
    if (!r) return null;
    return { pos, plan: [...r.edges, pf.edge], end: stopO, len: pos.e.len - pos.o + r.len + stopO };
  }
  // a train standing at one of a station's platforms (working it, or waiting there for work)
  const atStation = (t, d) => t.at === d || !!(t.route && t.route.stop && t.route.stop.d === d && t.s >= t.route.len - 1);
  // route to the end of a station's lead, where a train waits for a platform
  function routeToLead(tr, d, S) {
    const pos = headPos(tr), L = d.lead, end = L.len - 3;
    if (pos.e === L && end > pos.o + 1) return { pos, plan: [], end, len: end - pos.o };
    const r = pathTo(S || search(pos.e.to, tr), L);
    if (!r) return null;
    return { pos, plan: [...r.edges, L], end, len: pos.e.len - pos.o + r.len + end };
  }
  function* waitPlatform(tr, d) {
    d.waitSlot = tr;
    tr.status = 'Waiting for a platform at ' + d.id;
    let pf = null;
    while (!(pf = d.platforms.find((p) => !p.claim || !R.trains.includes(p.claim)))) yield* WT.sleep(0.25);
    pf.claim = tr;
    if (d.waitSlot === tr) d.waitSlot = null;
  }
  // the nearest depot this train has work at, leaving alone any platform another train is booked into
  function findJob(tr) {
    let best = null;
    const S = search(headPos(tr).e.to, tr), carrying = delivering(tr);
    for (const d of depots()) {
      if (!d.platforms) continue;
      const mine = tr.cars.some((k) => k.cont && k.cont.ringTo === d);
      if ((d === tr.lastDepot && !mine) || !d.hasWorkFor(tr)) continue;
      // trains holding boxes for a busy platform queue for it, and go first once it is free
      const q = (d.queue = (d.queue || []).filter((t) => R.trains.includes(t) && t.cars.some((k) => k.cont && k.cont.ringTo === d)));
      // a free platform (or the one already booked)
      // a train waiting on the lead has the next platform: nobody else books one meanwhile
      const waiter = d.waitSlot && d.waitSlot !== tr && R.trains.includes(d.waitSlot);
      const pf = d.platforms.find((p) => p.claim === tr) || (!waiter && d.platforms.find((p) => !p.claim || !R.trains.includes(p.claim)));
      // both platforms taken by trains standing at them: one more may wait on the lead in, short of the platforms,
      // and takes whichever frees first (never while a train booked in is still on its way, which it would block)
      const leadFree = !waiter && d.platforms.every((p) => p.claim && atStation(p.claim, d));
      if (!pf && !(leadFree && tr.cars.length <= 6)) { if (mine && !q.includes(tr)) q.push(tr); continue; }
      if (q.length && q[0] !== tr) continue;
      const r = pf ? routeToDepot(tr, d, S, pf) : routeToLead(tr, d, S);
      // boxes aboard come off before more go on: a stop only to collect counts as three times as far while carrying
      const score = r && r.len * (!mine && carrying ? 3 : 1);
      if (r && (!best || score < best.score)) best = { d, r, pf, score, wait: !pf };
    }
    return best;
  }
  const delivering = (tr) => tr.cars.some((k) => k.cont && k.cont.ringTo && k.cont.ringTo !== R.EXPORT);
  // product crates still waiting somewhere for a freight with room for them
  const exporter = (tr) => (tr.role === 'freight' && !tr.ore) || tr.crateRun;
  const cratesFor = (tr) => exporter(tr) && tr.cars.some((k, i) => i && !k.cont) && depots().some((d) => d.outbound(tr).length > 0);
  // crates waiting at any station, and how many shuttles are already out collecting them
  const cratesWaiting = () => depots().reduce((n, d) => n + d.outbound({ role: 'freight' }).length, 0);
  // out to the nearest portal
  function exitRoute(tr) {
    const pos = headPos(tr);
    if (EXITS.includes(pos.e)) { makeRoute(tr, pos, [], undefined, { exit: true }); return true; }
    const S = search(pos.e.to, tr);
    let best = null;
    for (const x of EXITS) { const r = pathTo(S, x); if (r && (!best || r.len < best.r.len)) best = { x, r }; }
    if (!best) return false;
    makeRoute(tr, pos, [...best.r.edges, best.x], undefined, { exit: true });
    return true;
  }
  // a yard road short of the conflicts at either end of it
  const parkAt = (sd) => Math.min(...sd.zones.filter((z) => z.b > sd.len).map((z) => z.a), sd.len) - 8;
  // a yard road nobody else has taken or is about to run through
  const roadFree = (sd, tr) => sd.built && (!sd.taken || sd.taken === tr) && !R.trains.some((t) => t !== tr && t.route && t.route.segs.some((sg) => sg.e === sd && !sg.hist));
  function* stable(tr, sd) {
    tr.parked = sd; tr.lastDepot = null;
    R.stats.stabled++;
    tr.status = 'Stabled · yard road ' + sd.siding;
    while (!findJob(tr) && !((tr.role === 'freight' || (tr.crateRun && tr.cars.some((k) => k.cont))) && !delivering(tr) && !cratesFor(tr)) && !takeCrateRun(tr)) yield* WT.sleep(1);
    sd.taken = null; tr.parked = null;
  }
  // nothing to do: into the nearest free yard road to wait there
  function park(tr) {
    const pos = headPos(tr), S = search(pos.e.to, tr);
    let best = null;
    for (const sd of YARD) {
      if (!roadFree(sd, tr)) continue;
      const end = parkAt(sd);
      if (pos.e === sd) { if (end > pos.o - 1) best = { sd, pos, plan: [], end: Math.max(end, pos.o), len: 0 }; break; }
      const r = pathTo(S, sd);
      if (r && (!best || r.len < best.len)) best = { sd, pos, plan: [...r.edges, sd], end, len: r.len };
    }
    if (!best) return false;
    best.sd.taken = tr;
    makeRoute(tr, best.pos, best.plan, best.end, { stop: { id: 'Stabling yard', call: () => stable(tr, best.sd) } });
    return true;
  }
  function* pause() { yield* WT.sleep(1); }
  // a train standing at the end of its route waits there: the route itself stays as it is
  function standBy(tr, stop) {
    const rt = tr.route;
    if (rt && tr.s >= rt.len - 0.5) { rt.stop = stop; rt.exit = false; rt.replan = false; rt.cruise = false; return; }
    const pos = headPos(tr);
    makeRoute(tr, pos, [], pos.o, { stop });
  }
  function* dwell(tr, d, pf) {
    pf.claim = tr;
    // (as long as half a working hour: work turns up quickly, the stabling yard is a long way off)
    for (let i = 0; i < 60; i++) {
      tr.status = 'Waiting for work at ' + d.id;
      if (d.hasWorkFor(tr)) yield* d.trainCall(tr, pf);
      pf.claim = tr;
      // off as soon as there is work elsewhere, or a train with boxes for here finds the other platform taken too
      const other = d.platforms.some((p) => p !== pf && (!p.claim || !R.trains.includes(p.claim)));
      if (findJob(tr) || (d.waitSlot && d.waitSlot !== tr && R.trains.includes(d.waitSlot)) || (!other && R.trains.some((t) => t !== tr && t.cars.some((k) => k.cont && k.cont.ringTo === d)))) break;
      yield* WT.sleep(0.5);
    }
    if (pf.claim === tr) pf.claim = null;
  }
  // pick the next move: the ore run first, then the nearest depot with work, else out (freight) or to the yard
  // An empty shuttle with nothing to do goes out on an export run when product crates are waiting: it collects
  // crates from the stations and leaves the map with them, and a fresh shuttle enters service from a yard. (At most a
  // third of the shuttles at once, so transfers between blocks never wait for it.)
  function takeCrateRun(tr) {
    if (tr.role !== 'shuttle' || tr.crateRun || tr.cars.some((k) => k.cont)) return false;
    const n = R.trains.filter((t) => t.role === 'shuttle').length, out = R.trains.filter((t) => t.crateRun).length;
    if (out >= Math.max(2, Math.floor(n / 3)) || cratesWaiting() <= out * 3) return false;
    tr.crateRun = true;
    tr.operator = 'WareTrack Block Shuttle · export run';
    return true;
  }
  function plan(tr) {
    if (tr.ore && tr.ore.stage < 2) { oreLeg(tr); return; }
    // an export run that found every crate already collected goes back to ordinary work
    if (tr.crateRun && !tr.cars.some((k) => k.cont) && !cratesFor(tr)) { tr.crateRun = false; tr.operator = 'WareTrack Block Shuttle'; }
    const job = findJob(tr);
    if (job) {
      tr.dwelt = false;
      job.d.queue = (job.d.queue || []).filter((t) => t !== tr);
      if (job.wait) {
        job.d.waitSlot = tr;
        makeRoute(tr, job.r.pos, job.r.plan, job.r.end, { stop: { id: job.d.id, call: () => waitPlatform(tr, job.d) } });
        return;
      }
      job.pf.claim = tr;
      makeRoute(tr, job.r.pos, job.r.plan, job.r.end, { stop: { id: job.d.id, d: job.d, call: () => job.d.trainCall(tr, job.pf) } });
      return;
    }
    // freight leaves once it has nothing to bring and no crate is left for it to collect
    if ((tr.role === 'freight' || tr.crateRun) && !delivering(tr) && !cratesFor(tr) && (!tr.crateRun || tr.cars.some((k) => k.cont)) && exitRoute(tr)) return;
    if (!job && takeCrateRun(tr)) { plan(tr); return; }
    // a shuttle that has just worked a platform waits there a little for the next box before heading for the yard
    const ld = tr.lastDepot, here = headPos(tr), pfHere = ld && ld.platforms && ld.platforms.find((p) => p.edge === here.e);
    if (tr.role === 'shuttle' && !tr.dwelt && pfHere && (!pfHere.claim || pfHere.claim === tr)) {
      tr.dwelt = true;
      standBy(tr, { id: ld.id, d: ld, call: () => dwell(tr, ld, pfHere) });
      return;
    }
    tr.dwelt = false;
    if (park(tr)) return;
    // nowhere to go just now: stand and look again
    standBy(tr, { id: 'Signal', call: pause });
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
  let frameNo = 0;
  WT.on('frame', () => frameNo++);
  function* runNet(tr) {
    tr.spin = 0;
    if (!tr.route || tr.route.replan) plan(tr);
    while (true) {
      const dt = WT.sim.dt;
      if (dt <= 0) { yield; continue; }
      const rt = tr.route, n = tr.cars.length - 1;
      const onMain = rt.segs.some((sg) => sg.e.main && tr.s >= sg.s0 && tr.s <= sg.s1 && sg.e.main(rt.path.at(tr.s)));
      let target = onMain ? 20 : 33;
      const k = rt.path.maxK(tr.s, tr.s + 40);
      if (k > 1e-4) target = Math.min(target, Math.sqrt(3.6 / k)); // (junction curves at about 32 km/h)
      const endS = rt.stop ? rt.len : rt.len + 13 * (n + 2);
      if (rt.stop) target = Math.min(target, Math.sqrt(2 * 1.3 * Math.max(0, rt.len - tr.s)) + 0.25);
      // spacing behind whatever is ahead
      const gap = blockedAhead(tr, 30 + (tr.v * tr.v) / 2.4 + 10);
      if (gap < Infinity) target = Math.min(target, Math.sqrt(2 * 1.6 * Math.max(0, gap - 16)));
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
          const owners = new Set(cl.map((h) => h.k.owner).filter((o) => o && o !== tr && R.trains.includes(o)));
          let ok = !owners.size && cl.every((h) => !h.k.check || h.k.check(tr)), full = false;
          // a chain signal: never into a junction without room beyond it for the whole train (checked every half second)
          if (ok) {
            if (!tr.roomT || WT.sim.minutes - tr.roomT.t > 0.25 || tr.roomT.h !== h0) {
              const need = Math.min(reach - tr.s + 13 * (n + 1) + 10, rt.stop ? rt.len - tr.s + 5 : Infinity);
              tr.roomT = { t: WT.sim.minutes, h: h0, ok: need <= 0 || blockedAhead(tr, need) >= need };
            }
            if (!tr.roomT.ok) { ok = false; full = true; }
          }
          tr.waitFor = ok ? null : owners;
          tr.waitT = ok ? 0 : tr.waitT + dt;
          // the deadlock breaker: two trains each waiting on the other, or a wait of a quarter of an hour
          const cycle = [...owners].some((o) => o.waitFor && o.waitFor.has(tr));
          if (ok || ((cycle && tr.waitT > 20) || tr.waitT > 900)) { for (const h of cl) { h.k.owner = tr; tr.holds.push(h); } tr.waitT = 0; tr.roomT = null; }
          else {
            target = Math.min(target, Math.sqrt(2 * 1.6 * Math.max(0, d - 1)));
            tr.why = full ? 'Signal · waiting for room beyond the junction' : 'Signal · junction occupied';
          }
        }
      }
      tr.v = Math.max(0, tr.v + WT.clamp(target - tr.v, -3.2 * dt, 2.2 * dt));
      tr.s = Math.min(tr.s + tr.v * dt, endS);
      tr.status = tr.why || (tr.v < 0.3 ? 'Waiting · train ahead' : rt.exit ? 'Leaving the map' : rt.stop ? 'Bound for ' + rt.stop.id : 'Running');
      tr.place();
      if (rt.stop && tr.s >= rt.len - 0.05) {
        tr.v = 0;
        const f0 = frameNo, id = rt.stop.id;
        yield* rt.stop.call();
        if (rt.stop.d) tr.lastDepot = rt.stop.d;
        plan(tr);
        // (a stop that ends at once must not spin: never more than a few calls in one frame)
        if (frameNo !== f0) tr.spin = 0;
        else if (++tr.spin > 4) { if (!tr.spinLogged) { tr.spinLogged = true; console.warn('[Rail grid] ' + tr.id + ' spinning at ' + id + ' → ' + (tr.route.stop ? tr.route.stop.id : tr.route.exit ? 'exit' : '?') + ' · ' + tr.status); } tr.spin = 0; yield; }
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
  // block shuttles: two once two stations work, one more for every two after that; each starts from a yard road
  R.startShuttles = function () {
    if (!R.built) return;
    const n = depots().length, want = n >= 2 ? Math.min(16, 2 * n) : 0;
    while (R.trains.filter((t) => t.role === 'shuttle').length < want) {
      const sd = YARD.find((s) => roadFree(s, null));
      if (!sd) return;
      const tr = new NetTrain('shuttle', 5), end = parkAt(sd);
      tr.route = null;
      sd.taken = tr;
      makeRoute(tr, { e: sd, o: end - 0.5 }, [], end, { stop: { id: 'Stabling yard', call: () => stable(tr, sd) } });
      tr.s = 0;
      tr.place();
      WT.log(`🚆 Block shuttle ${tr.id} enters service from the stabling yard`, 'blue', true);
      WT.spawn(runNet(tr));
    }
  };
  const freights = () => R.trains.filter((t) => t.role === 'freight');
  // a portal's first few hundred metres in are clear of every train
  const portalClear = (p) => {
    if (!p.edge.built) return false;
    const a = p.edge.path.at(0), dir = p.side === 'W' ? 1 : -1;
    return R.allCars().every(({ p: q }) => Math.abs(q.z - a.z) > 3 || (q.x - a.x) * dir < -60 || (q.x - a.x) * dir > 480);
  };
  // freight: brings the blocks' imports in from a portal at the map edge, takes product crates out
  function crates() { return depots().reduce((n, d) => n + d.outbound({ role: 'freight' }).length, 0); }
  function dispatchFreight() {
    const S = WT.SUP, Rm = WT.REMOTE;
    if (!R.built) return false;
    // imports on up to eight freights at once; export trains (out only to collect crates) on four more of their own
    const importing = freights().filter((t) => !t.ore && !t.exportRun).length, exporting = freights().filter((t) => t.exportRun).length;
    if (importing >= 8 && exporting >= 4) return false;
    const room = new Map();
    const want = importing >= 8 ? [] : S.takeManifest('rail', 5, (po) => {
      if (!R.serves(po.to) || (Rm && Rm.siteFor && Rm.siteFor(po.mat))) return false;
      const d = R.blockOf(po.to).depot, r = room.has(d) ? room.get(d) : d.roomFor();
      if (r < 2) return false;
      room.set(d, r - 1);
      return true;
    });
    const out = crates();
    // crates never wait for long: another freight goes out to collect whenever the ones already collecting have
    // fewer free wagons between them than there are crates waiting
    const spare = R.trains.filter((t) => exporter(t) && !delivering(t) && !(t.route && t.route.exit)).reduce((n, t) => n + t.cars.filter((k, i) => i && !k.cont).length, 0);
    if (!want.length && (out <= spare || exporting >= 4)) return false;
    // in at whichever portal has a clear run in
    const portal = PORTALS.slice().sort(() => Math.random() - 0.5).find(portalClear);
    if (!portal) { S.backlog.rail.unshift(...want); return false; }
    const tr = new NetTrain('freight', Math.min(5, Math.max(want.length, Math.min(5, out), 2)));
    if (!want.length) { tr.exportRun = true; tr.operator = 'WareTrack Rail Freight · export'; }
    want.forEach((po, i) => {
      const d = R.blockOf(po.to).depot, c = S.newContainer(11, po.mat);
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
    makeRoute(tr, { e: portal.edge, o: 0 }, [], undefined, { replan: true });
    tr.s = 0;
    tr.place();
    R.stats.freight++;
    WT.log(`🚂 Freight ${tr.id} inbound from the ${portal.side === 'W' ? 'west' : 'east'} with ${want.length} box${want.length === 1 ? '' : 'es'} for the blocks`, 'blue', true);
    WT.spawn(runNet(tr));
    return true;
  }
  // ore trains: in at the west end of the mine line, empties from the container works, loaded at the mine, then
  // across the main onto the trunk and down the spine to the pods that ordered it
  function dispatchOre() {
    const S = WT.SUP, Rm = WT.REMOTE;
    if (!R.built || !Rm || !Rm.branch || freights().filter((t) => t.ore).length >= 2 || freights().some((t) => t.ore && t.ore.stage < 2)) return;
    const factory = Rm.containerFactory && Rm.containerFactory();
    if (!factory || factory.trainBusy) return;
    const ours = (po, mat) => po.mat === mat && R.serves(po.to) && R.blockOf(po.to).depot.roomFor() > 1;
    const site = WT.facilities.find((f) => f.remote && f.active && !f.trainBusy && factory.available(f.mat) > 0 && S.backlog.rail.some((po) => ours(po, f.mat)));
    if (!site || !R.mainClear(BR, -XB - 50, -XB + 420)) return;
    const room = new Map();
    const manifest = S.takeManifest('rail', Math.min(5, factory.available(site.mat)), (po) => {
      if (!ours(po, site.mat)) return false;
      const d = R.blockOf(po.to).depot, r = room.has(d) ? room.get(d) : d.roomFor();
      if (r < 2) return false;
      room.set(d, r - 1);
      return true;
    });
    if (!manifest.length) return;
    const boxes = factory.reserve(site.mat, manifest.length);
    factory.trainBusy = true; site.trainBusy = true;
    const tr = new NetTrain('freight', Math.max(2, manifest.length), true);
    tr.ore = { site, factory, manifest, boxes, stage: 0 };
    for (const po of manifest) { R.blockOf(po.to).depot.incoming++; S.ev(po, `Ore train ${tr.id} sent for it · via ${site.id}`); }
    tr.route = null;
    makeRoute(tr, { e: MINE, o: 0 }, [], undefined, { replan: true });
    tr.s = 0;
    tr.place();
    R.stats.ore++;
    WT.log(`⛏️ Ore train ${tr.id} up the mine line for ${manifest.length} box${manifest.length === 1 ? '' : 'es'} of ${S.MAT[site.mat].name.toLowerCase()} for the blocks`, 'blue', true);
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
    for (const po of o.manifest) if (!loaded.includes(po)) { const d = R.blockOf(po.to) && R.blockOf(po.to).depot; if (d) d.incoming = Math.max(0, d.incoming - 1); }
    for (const car of tr.cars) {
      const c = car.cont;
      if (c && c.full && c.po && loaded.includes(c.po)) { c.ringTo = R.blockOf(c.po.to).depot; c.status = 'On ore train · bound for ' + c.ringTo.id; }
    }
    R.stats.oreBoxes += loaded.length;
    tr.status = 'Loaded · bound for the blocks';
  }
  WT.spawn((function* () {
    while (true) {
      yield* WT.sleep(2);
      try { R.startShuttles(); dispatchOre(); if (dispatchFreight()) dispatchFreight(); } catch (e) { console.error('[Rail grid] dispatch:', e); }
    }
  })());
})();
