/* WareTrack – a building design of its own for every kind of plant
   Each design picks the main shed (roof style, height, cladding) and builds its process plant in the strip between
   the avenue and the truck lane, in the plant's local frame: the process hall sits at x 13–33, z −32…−14 (the raw
   material belt runs into its north face at x 26, the product belt leaves its east face at z −24); the west strip
   (x 4–12) and the south strip (z −41…−33) take the signature kit — furnaces, columns, silos, test cells, yards.
   build(b, c) adds to the mesh builder b; c.stack(x, y, z, colour) registers a smoking stack. It may return
   { glow: { at, size } } for a furnace mouth that glows while running, { blade: [x, y, z] } for a spinning saw and
   { meshes: [...] } for parts that are not merged (solar arrays). */
(function () {
  const T = THREE, M = WT.M;
  const D = (WT.PLANT_DESIGN = {});
  const STEEL = 0x9aa1c4, DARK = 0x3a4166;

  // a straight member (duct, conveyor gallery, pipe) between two points
  const beam = (b, a, c, w, h, col) => {
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], L = Math.hypot(dx, dy, dz);
    b.boxC(L, h, w, col, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, 0, Math.atan2(-dz, dx), Math.asin(dy / L));
  };
  // a plain hall with a capped flat roof
  const hall = (b, x, z, w, d, h, col, cap) => { b.box(w, h, d, col, x, 0, z); b.box(w + 0.4, 0.5, d + 0.4, cap, x, h, z); };
  const windows = (b, x, z, w, d, h, col = 0x3a4a86) => {
    for (let y = 2; y < h - 1.5; y += 3.2) { b.box(w + 0.06, 1.1, d * 0.86, col, x, y, z); b.box(w * 0.88, 1.1, d + 0.06, col, x, y, z); }
  };
  const tank = (b, x, z, r, h, col, band) => {
    b.cyl(r, r, h, col, x, h / 2, z, 18);
    b.sphere(r, col, x, h, z, 1, 0.4, 1, 14);
    if (band) b.cyl(r + 0.05, r + 0.05, 0.6, band, x, h * 0.62, z, 18);
  };
  const column = (b, x, z, r, h, col) => {
    b.cyl(r, r, h, col, x, h / 2, z, 12);
    for (let y = 5; y < h; y += 5) b.cyl(r + 0.6, r + 0.6, 0.25, STEEL, x, y, z, 12);
    b.sphere(r, col, x, h, z, 1, 0.5, 1, 10);
  };
  const stack = (b, c, x, z, r, h, col, smoke) => { M.chimney(b, x, z, r, h, col); c.stack(x, h + 0.6, z, smoke); };
  const hvac = (b, x, y, z) => {
    b.box(4, 1.6, 3, 0xdfe3f2, x, y, z);
    for (const dx of [-0.9, 0.9]) b.cyl(1, 1, 0.2, DARK, x + dx, y + 1.65, z, 12);
  };
  const coolCell = (b, x, z, col = 0xe3e6f2) => {
    b.box(5, 4.5, 5, col, x, 0, z);
    b.cyl(1.9, 1.9, 0.9, STEEL, x, 4.95, z, 16);
    b.cyl(1.6, 1.6, 0.2, DARK, x, 5.45, z, 16);
  };
  // cable drum standing on its flanges, axis along x
  const spool = (b, x, z, r, w, col, core) => {
    for (const s of [-1, 1]) b.cyl(r, r, 0.25, col, x + (s * w) / 2, r, z, 18, 0, 0, Math.PI / 2);
    b.cyl(r * 0.62, r * 0.62, w, core, x, r, z, 14, 0, 0, Math.PI / 2);
  };
  const posts = (b, xs, zs, h, col) => { for (const x of xs) for (const z of zs) b.box(0.6, h, 0.6, col, x, 0, z); };
  // a saw-tooth roof over a hall, teeth stepping along x
  const sawRoof = (b, x0, x1, z, d, y, col) => {
    for (let x = x0; x < x1 - 0.1; x += 5) {
      b.boxC(5 * 0.95, 0.25, d + 0.4, col, x + 2.4, y + 1.1, z, 0, 0, 0.42);
      b.box(0.25, 2.2, d + 0.4, 0xb9c8ff, x + 4.7, y, z);
    }
  };
  const gableRoof = (b, x, z, w, d, y, rise, col) => {
    const sl = Math.atan2(rise, d / 2 + 0.4), L = Math.hypot(rise, d / 2 + 0.4);
    for (const s of [-1, 1]) b.boxC(w + 0.8, 0.3, L, col, x, y + rise / 2, z + (s * (d / 2 + 0.4)) / 2, s * sl, 0, 0);
  };
  const barrelRoof = (b, x, z, w, d, y, rise, col) => {
    const r = d / 2 + 0.4, g = new T.CylinderGeometry(r, r, w + 0.6, 20, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2); g.scale(1, rise / r, 1);
    b.geo(g, col, x, y, z);
    for (const [ex, ry] of [[x - w / 2 - 0.3, -Math.PI / 2], [x + w / 2 + 0.3, Math.PI / 2]]) {
      const cg = new T.CircleGeometry(r, 20, 0, Math.PI);
      cg.rotateY(ry); cg.scale(1, rise / r, 1);
      b.geo(cg, M.shade(col, 0.88), ex, y, z);
    }
  };
  // logs lying along x in two layers
  const logPile = (b, x, z, len) => {
    for (let i = 0; i < 4; i++) b.cyl(0.52, 0.52, len, i % 2 ? 0xa0754e : 0x8f6644, x, 0.52, z - 1.6 + i * 1.06, 10, 0, 0, Math.PI / 2);
    for (let i = 0; i < 3; i++) b.cyl(0.52, 0.52, len - 0.6, 0xb58a5d, x, 1.42, z - 1.07 + i * 1.06, 10, 0, 0, Math.PI / 2);
  };

  /* ================= tier 1 · refining ================= */
  D['Steel Mill'] = {
    shed: { roof: 'gable', h: 15, rise: 4, wall: ['#5d6480', '#4b516b'], roofCol: 0x8a5a44 },
    build(b, c) {
      hall(b, 25, -23, 16, 16, 8, 0x4a5578, DARK); // cast house round the hearth
      b.cyl(4.2, 5, 26, 0x6a7194, 21, 13, -24, 18); // furnace shell
      b.cyl(2.6, 4.2, 5, 0x4a5578, 21, 28.5, -24, 16);
      b.cyl(0.8, 0.8, 10, STEEL, 21, 36, -24, 8);
      for (const z of [-34, -28, -22]) { b.cyl(2.3, 2.3, 18, 0xd6dbef, 7, 9, z, 14); b.sphere(2.3, 0xd6dbef, 7, 18, z, 1, 0.6, 1, 12); } // hot-blast stoves
      b.box(1, 1, 14, STEEL, 7, 11.5, -28);
      beam(b, [7, 12, -26], [17, 14, -24], 1.1, 1.1, STEEL); // hot-blast main
      b.cyl(2.4, 1, 7, 0xb9bfd8, 12, 14, -38, 12); posts(b, [10.5, 13.5], [-39.5, -36.5], 10.5, STEEL); // dust catcher
      beam(b, [21, 33, -24], [12, 17.5, -38], 1.2, 1.2, STEEL); // downcomer
      b.box(14, 6, 4.5, 0x3a3f52, 27, 0, -38.5); // coke oven battery
      for (let x = 21; x <= 33; x += 2) b.box(0.4, 0.8, 0.6, 0x6a7194, x, 6, -38.5);
      b.box(3.2, 15, 3.2, 0xb9bfd8, 35.8, 0, -38.2); // quench tower
      stack(b, c, 17, -39.5, 1.1, 28, 0xb9bfd8, STEEL);
      c.stack(21, 41, -24, 0xffffff);
      c.stack(35.8, 15.6, -38.2, 0xffffff);
      return { glow: { at: [25, 1.6, -14.9], size: [5.6, 2, 0.1] } };
    },
  };
  D['Copper Refinery'] = {
    shed: { roof: 'monitor', h: 13, rise: 3.6, wall: ['#ece0d4', '#d6c6b5'], roofCol: 0xb86a2c },
    build(b, c) {
      hall(b, 17.5, -23, 9, 18, 20, 0xcdb8a6, 0xb86a2c); // flash-smelting tower
      hall(b, 27.5, -23, 11, 18, 8, 0xe6d3c3, 0xb86a2c); // tankhouse
      for (let x = 23.5; x <= 31.5; x += 2) b.box(1.2, 1, 12, 0xb9bfd8, x, 8.5, -23);
      for (const x of [14, 27]) { // rotary anode furnaces on their cradles
        b.cyl(2, 2, 9, 0x6a7194, x, 3, -37.5, 16, 0, 0, Math.PI / 2);
        b.cyl(2.12, 2.12, 0.5, 0xc87533, x - 2.5, 3, -37.5, 16, 0, 0, Math.PI / 2);
        b.cyl(2.12, 2.12, 0.5, 0xc87533, x + 2.5, 3, -37.5, 16, 0, 0, Math.PI / 2);
        for (const dx of [-3, 3]) b.box(1, 1.3, 3.6, DARK, x + dx, 0, -37.5);
      }
      tank(b, 7, -30, 2.2, 8, 0xe9ecf7, 0xc87533); // acid plant
      tank(b, 7, -24, 2.2, 8, 0xe9ecf7, 0xc87533);
      beam(b, [13, 18, -28], [7, 9.5, -27], 0.9, 0.9, STEEL);
      stack(b, c, 8, -16, 1.5, 36, 0xe9ecf7, STEEL);
      return { glow: { at: [14, 2.6, -35.4], size: [3.4, 1.4, 0.1] } };
    },
  };
  D['Aluminium Smelter'] = {
    shed: { roof: 'monitor', h: 11, rise: 3, wall: ['#e4e8f2', '#ccd2e3'], roofCol: 0x9aa1c4 },
    build(b, c) {
      // potline: a long low potroom with a continuous roof monitor to let the heat out
      hall(b, 21, -23.5, 30, 11, 6.5, 0xd6dbef, c.acc);
      b.box(29, 1.6, 3, 0xb9bfd8, 21, 7, -23.5); b.box(29.4, 0.3, 3.8, STEEL, 21, 8.6, -23.5);
      b.box(6, 7, 5, 0xe9ecf7, 26, 0, -15.5); // receiving house at the alumina belt
      M.silo(b, 8, -37, 2.6, 14, 0xe9ecf7); M.silo(b, 14, -37, 2.6, 14, 0xe9ecf7);
      beam(b, [14, 14.5, -36], [18, 8, -29], 0.9, 0.9, STEEL);
      b.box(11, 4.5, 6, 0x6a7194, 25, 0, -37.5); // anode bake furnace
      for (let x = 21; x <= 29; x += 2) b.cyl(0.3, 0.3, 1.2, DARK, x, 5, -37.5, 6);
      stack(b, c, 35, -37.5, 1.4, 26, 0xb9bfd8, STEEL); // fume treatment
      return { glow: { at: [14, 2.5, -17.9], size: [5.6, 2, 0.1] } };
    },
  };
  D['Chemical Plant'] = {
    shed: { roof: 'flat', h: 11, wall: ['#f3f5f8', '#dde2ea'], roofCol: 0xd6dbe6 },
    build(b, c) {
      for (const [x, z, h] of [[9, -22, 30], [15, -17, 24], [9, -14.5, 20]]) column(b, x, z, 1.4, h, 0xe9ecf7);
      hall(b, 28, -21, 10, 12, 6, 0xf6f7fd, 0x37b26c); // pump + control house
      for (const [x, z] of [[16, -35], [27, -36]]) { // pressure spheres on legs
        b.sphere(4, 0xf3f5fd, x, 6.5, z, 1, 1, 1, 16);
        for (let i = 0; i < 4; i++) b.box(0.4, 4.5, 0.4, STEEL, x + Math.cos(i * 1.57 + 0.78) * 3, 0, z + Math.sin(i * 1.57 + 0.78) * 3);
      }
      b.box(30, 0.6, 0.6, STEEL, 21, 9, -28.5); // pipe rack
      b.box(30, 0.4, 0.4, 0x37b26c, 21, 8.2, -28.5);
      for (const x of [7, 15, 23, 31]) b.box(0.4, 9, 0.4, STEEL, x, 0, -28.5);
      b.cyl(0.5, 0.6, 26, 0xd9434b, 35.5, 13, -38, 8); // flare
      c.stack(35.5, 27, -38, 0xffb347);
      return {};
    },
  };
  D.Sawmill = {
    shed: { roof: 'gable', h: 11, rise: 3.6, wall: ['#c9a27a', '#ad865f'], roofCol: 0x7a5b46 },
    build(b, c) {
      b.box(22, 0.4, 18, 0x9c7a5b, 23, 7, -23); // open-sided saw line
      gableRoof(b, 23, -23, 22, 18, 7.4, 2.2, 0x7a5b46);
      posts(b, [13, 23, 33], [-31.5, -14.5], 7, 0x7a5b46);
      b.box(16, 2.2, 3, STEEL, 23, 0, -23);
      logPile(b, 19, -38, 10); logPile(b, 31, -38, 10); // log deck
      b.cyl(1.4, 1.4, 7, 0x6a7194, 8, 2, -36, 14, Math.PI / 2); // debarker drum
      for (const z of [-17, -24]) { // drying kilns
        b.box(7, 5.5, 5.5, 0xb08a63, 8, 0, z); b.box(7.4, 0.4, 5.9, 0x7a5b46, 8, 5.5, z);
        b.cyl(0.8, 0.8, 0.3, DARK, 8, 6, z, 10);
      }
      M.silo(b, 8, -30.5, 2, 9, 0xdcb47e); // sawdust silo + cyclone
      b.cyl(1.4, 0.3, 3, 0xb9bfd8, 8, 12.2, -30.5, 12);
      beam(b, [14, 7.5, -29], [8, 13, -30.5], 0.7, 0.7, STEEL);
      return { blade: [23, 3.4, -23] };
    },
  };
  D['Glass Works'] = {
    shed: { roof: 'barrel', h: 12, rise: 5, wall: ['#d8eef5', '#bcdbe6'], roofCol: 0x1aa6b7 },
    build(b, c) {
      hall(b, 17, -23, 14, 16, 10, 0xb9bfd8, 0x1aa6b7); // melting furnace hall
      b.box(3.2, 3.2, 26, 0xdfe3f2, 29, 0, -24); // annealing lehr
      for (let z = -36; z <= -12; z += 2.4) b.box(3.5, 0.3, 0.3, STEEL, 29, 3.2, z);
      hall(b, 7, -36, 5, 5, 18, 0xe9ecf7, 0x1aa6b7); // batch house
      beam(b, [7, 16, -33.5], [13, 10, -28], 1, 1, STEEL);
      b.box(4, 2, 4, 0x6a7194, 17, 0, -38); b.box(3.6, 0.6, 3.6, 0xa9d6ea, 17, 2, -38); // cullet bin
      stack(b, c, 7, -18, 1.6, 26, 0xb9bfd8, STEEL);
      return { glow: { at: [24.1, 2.4, -23], size: [0.1, 2, 4] } };
    },
  };

  /* ================= tier 2 · components ================= */
  D['Wire Mill'] = {
    shed: { roof: 'barrel', h: 12, rise: 5, wall: ['#f1e4d6', '#dacab7'], roofCol: 0xb86a2c },
    build(b, c) {
      b.box(20, 8, 14, 0xe6dccf, 23, 0, -21); // rod breakdown + drawing hall
      barrelRoof(b, 23, -21, 20, 14, 8, 3.5, 0xb86a2c);
      [9, 14, 19, 24, 29, 34].forEach((x, i) => spool(b, x, -37.5, 1.9, 1.4, i % 2 ? 0xa0754e : 0x6a7194, 0xc87533));
      hall(b, 7, -21, 5, 6, 12, STEEL, DARK); // continuous annealer
      stack(b, c, 7, -29, 0.9, 20, 0xe9ecf7, 0xeef0fa);
      return { glow: { at: [20, 2, -13.9], size: [4, 1.6, 0.1] } };
    },
  };
  D['Motor Works'] = {
    shed: { roof: 'sawtooth', h: 13, wall: ['#dfe3ee', '#c7cde0'], roofCol: 0x3a4166 },
    build(b, c) {
      b.box(20, 9, 18, DARK, 23, 0, -23); // winding + assembly hall
      sawRoof(b, 13, 33, -23, 18, 9, 0x4a5578);
      for (const x of [9, 15, 21, 27, 33]) { // motor test cells
        b.box(4.4, 3.6, 4.4, 0xb9bfd8, x, 0, -38); b.box(2, 2.6, 0.1, 0xf08c2a, x, 0, -35.75);
        b.box(0.6, 1.2, 0.6, STEEL, x + 1.2, 3.6, -38);
      }
      for (const z of [-30, -22]) { // transformer yard
        b.box(3, 3, 2.4, 0x6a7194, 8, 0, z);
        for (const dx of [-0.9, 0, 0.9]) b.cyl(0.18, 0.25, 1.4, 0xe9ecf7, 8 + dx, 3.7, z, 8);
      }
      b.box(0.15, 2.2, 14, STEEL, 4.5, 0, -26);
      return {};
    },
  };
  D['Circuit Fab'] = {
    shed: { roof: 'flat', h: 12, wall: ['#f6f7fb', '#e1e4ee'], roofCol: 0xe9ecf7 },
    build(b, c) {
      hall(b, 23, -23, 20, 18, 10, 0xf6f7fd, 0xe2e5ef); // windowless clean room
      b.box(20.1, 1.2, 18.1, c.acc, 23, 8, -23);
      for (const x of [16, 23, 30]) hvac(b, x, 10.5, -23);
      for (const z of [-17, -29]) b.cyl(0.4, 0.4, 6, STEEL, 14, 13.5, z, 8);
      for (const z of [-36, -30]) { // bulk nitrogen
        b.cyl(1.3, 1.3, 13, 0xf3f5fd, 7, 6.5, z, 14); b.sphere(1.3, 0xf3f5fd, 7, 13, z, 1, 0.5, 1, 10);
        b.cyl(1.35, 1.35, 0.5, 0x2f56e0, 7, 9, z, 14);
      }
      for (const x of [16, 24, 32]) coolCell(b, x, -38); // chillers
      return {};
    },
  };
  D['Panel Press'] = {
    shed: { roof: 'gable', h: 16, rise: 3.6, wall: ['#b9bfd2', '#a1a8bf'], roofCol: 0x6a7194 },
    build(b, c) {
      hall(b, 23, -23, 20, 18, 17, STEEL, 0x6a7194); // high-bay press hall
      b.box(20.1, 1.4, 18.1, 0xf0b429, 23, 12, -23);
      b.box(6, 3, 8, 0x4a5578, 23, 17.5, -23); // press crowns through the roof
      for (const x of [9, 13, 17, 21, 25, 29, 33]) b.cyl(1.2, 1.2, 1.6, 0xb8c2dc, x, 1.2, -38, 16, Math.PI / 2); // coil store
      b.box(6, 3.4, 5, 0x6a7194, 8, 0, -28); // scrap baler
      b.box(5, 1.8, 6, 0x8a5a44, 8, 0, -19); // scrap bin
      for (let i = 0; i < 5; i++) b.box(1.2, 0.5, 0.8, 0xb9bfd8, 6.5 + (i % 3), 1.8, -21 + i);
      return {};
    },
  };
  D['Moulding Shop'] = {
    shed: { roof: 'gable', h: 12, rise: 3.2, wall: ['#e9eef8', '#d0d8ec'], roofCol: 0x2f56e0 },
    build(b, c) {
      b.box(20, 9, 18, 0xe9ecf7, 23, 0, -23);
      gableRoof(b, 23, -23, 20, 18, 9, 2.6, 0x2f56e0);
      for (const z of [-38, -33, -28]) M.silo(b, 7, z, 1.8, 13, 0xf6f7fd); // resin silos
      for (const z of [-38, -33, -28]) beam(b, [7, 13.6, z], [14, 10.5, z + 4], 0.35, 0.35, STEEL); // pneumatic lines
      for (const x of [18, 25, 32]) coolCell(b, x, -38, 0xdfe6f6); // mould chillers
      return {};
    },
  };
  D['Frame Shop'] = {
    shed: { roof: 'monitor', h: 12, rise: 3.2, wall: ['#d9c7ad', '#c1ad92'], roofCol: 0xa0754e },
    build(b, c) {
      b.box(22, 0.4, 18, 0x6a7194, 23, 8, -23); // welding bays under a steel canopy
      posts(b, [13, 23, 33], [-31.5, -14.5], 8, 0x4a5578);
      for (const x of [16, 23, 30]) { b.box(5, 2.8, 4, 0xa0754e, x, 0, -23); b.cyl(0.5, 0.5, 4, STEEL, x, 10.4, -23, 10); }
      b.box(20, 0.6, 0.6, STEEL, 23, 6.5, -23); // fume extraction duct
      for (const x of [10, 17, 24, 31]) { b.box(5, 1.8, 3, 0xdcb47e, x, 0, -38); b.box(5.05, 0.15, 3.05, 0xb98b55, x, 0.9, -38); } // timber store
      b.boxC(30, 0.3, 6, 0x9c7a5b, 21, 3.8, -38, 0.18, 0, 0);
      posts(b, [6.5, 35.5], [-40.5], 3.3, 0x7a5b46);
      b.box(2.4, 2.6, 14, 0x4a5578, 7, 0, -24); // steel rack
      for (let i = 0; i < 4; i++) b.box(0.4, 0.4, 13, 0x9aa1c4, 6.2 + i * 0.55, 2.6, -24);
      return {};
    },
  };

  /* ================= tier 3 · final assembly ================= */
  D.Electronics = {
    shed: { roof: 'flat', h: 13, wall: ['#eef2fb', '#d6dcef'], roofCol: 0xdfe3f2 },
    build(b, c) {
      b.box(20, 12, 18, 0xf3f5fd, 23, 0, -23); windows(b, 23, -23, 20, 18, 12);
      b.box(20.6, 0.6, 18.6, c.acc, 23, 12, -23);
      const sf = M.solarField(18, 14); sf.position.set(23, 12.6, -23);
      b.box(1.6, 14, 4, 0x2f56e0, 7, 0, -20); b.box(1.8, 3, 4.2, 0xffffff, 7, 10, -20); // logo pylon
      b.box(26, 0.3, 6, 0xe9ecf7, 21, 5, -38); posts(b, [9, 21, 33], [-40.5, -35.5], 5, STEEL); // dispatch canopy
      return { meshes: [sf] };
    },
  };
  D.Appliances = {
    shed: { roof: 'sawtooth', h: 13, wall: ['#e7f3f5', '#cde1e6'], roofCol: 0x1aa6b7 },
    build(b, c) {
      hall(b, 23, -23, 20, 18, 10, 0xe7f3f5, 0x1aa6b7); windows(b, 23, -23, 20, 18, 10);
      b.box(28, 6, 6, 0xd6dbef, 22, 0, -38); // paint shop
      for (const x of [12, 22, 32]) b.cyl(0.6, 0.6, 5, STEEL, x, 8.5, -38, 10);
      c.stack(22, 11.2, -38, 0xeef0fa);
      b.box(4, 16, 4, 0xb9bfd8, 7, 0, -24); b.cyl(2.6, 2.6, 4, 0x1aa6b7, 7, 18, -24, 16); // water test tower
      return {};
    },
  };
  D['Auto Parts'] = {
    shed: { roof: 'gable', h: 14, rise: 3.6, wall: ['#c8ccd8', '#adb2c2'], roofCol: 0x4a5578 },
    build(b, c) {
      hall(b, 23, -23, 20, 18, 11, 0x6a7194, 0x4a5578); // foundry
      b.box(18, 2, 4, 0xb9bfd8, 23, 11.5, -23);
      b.cyl(1.8, 2.2, 22, 0x4a5578, 8, 11, -24, 12); c.stack(8, 22.6, -24, STEEL); // cupola
      M.silo(b, 8, -36, 2, 10, 0xe8d6a8); // core sand
      b.box(24, 1.2, 2, STEEL, 24, 1, -37.5); // casting cooling line
      for (let x = 14; x <= 34; x += 3) b.box(1.2, 0.8, 1.2, 0x6a7194, x, 2.2, -37.5);
      return { glow: { at: [23, 2.4, -13.9], size: [5.6, 2, 0.1] } };
    },
  };
  D.Beverages = {
    shed: { roof: 'barrel', h: 12, rise: 4.5, wall: ['#e6efff', '#ccd8f2'], roofCol: 0x3a6ff7 },
    build(b, c) {
      hall(b, 25, -23, 16, 18, 9, 0xe6efff, 0x3a6ff7); windows(b, 25, -23, 16, 18, 9, 0x2a5fd0); // bottling hall
      for (const [x, z, h] of [[8, -38, 12], [8, -31, 14], [8, -24, 12], [16, -38, 10]]) tank(b, x, z, 2.6, h, 0xe1e6f2, c.acc);
      M.silo(b, 24, -38, 2.4, 13, 0xecd48a); M.silo(b, 30, -38, 2.4, 13, 0xecd48a); // grain
      return {};
    },
  };
  D.Furniture = {
    shed: { roof: 'gable', h: 11, rise: 3.6, wall: ['#efe2cf', '#d9c6ad'], roofCol: 0xb5543d },
    build(b, c) {
      b.box(20, 8, 18, 0xefe2cf, 23, 0, -23); // woodshop
      barrelRoof(b, 23, -23, 20, 18, 8, 4, 0xb5543d);
      b.box(26, 0.3, 6, 0x9c7a5b, 21, 4.4, -38); posts(b, [9, 21, 33], [-40.5, -35.5], 4.4, 0x7a5b46); // lumber canopy
      for (const x of [12, 19, 26, 33]) b.box(5, 1.6, 4, 0xdcb47e, x, 0, -38);
      b.cyl(2, 0.5, 5, 0xd6dbef, 8, 12, -24, 14); b.cyl(2, 2, 3, 0xd6dbef, 8, 16, -24, 14); // sawdust cyclone
      posts(b, [6.6, 9.4], [-25.4, -22.6], 9.5, STEEL);
      beam(b, [8, 16, -24], [14, 8.5, -22], 0.8, 0.8, STEEL);
      return {};
    },
  };
  D.Pharma = {
    shed: { roof: 'flat', h: 12, wall: ['#f4faf6', '#dceae2'], roofCol: 0xe9f2ec },
    build(b, c) {
      hall(b, 23, -23, 20, 18, 11, 0xf4faf6, 0x37b26c); windows(b, 23, -23, 20, 18, 11, 0x2f8f57);
      for (const x of [17, 29]) hvac(b, x, 11.5, -23);
      M.coolingTower(b, 8, -33, 0.3);
      for (const x of [17, 23, 29, 35]) tank(b, x, -38, 1.7, 7, 0xf3f5fd, 0x37b26c); // process vessels
      return {};
    },
  };
  D['E-Bikes'] = {
    shed: { roof: 'sawtooth', h: 12, wall: ['#e4f5f3', '#c8e5e1'], roofCol: 0x2aa198 },
    build(b, c) {
      hall(b, 23, -23, 20, 18, 9, 0xe4f5f3, 0x2aa198); windows(b, 23, -23, 20, 18, 9, 0x1f7a73);
      const ring = new T.RingGeometry(3.6, 5.2, 28); ring.rotateX(-Math.PI / 2); ring.scale(1, 1, 0.7); // test loop
      b.geo(ring, 0x3a4166, 9.5, 0.06, -36);
      b.box(14, 0.2, 5, 0x2140b8, 26, 3.2, -38); posts(b, [20, 32], [-40, -36], 3.2, STEEL); // solar carport
      for (const x of [22, 25, 28, 31]) b.box(1.6, 1, 0.4, 0x2aa198, x, 0, -38);
      return {};
    },
  };
  D['Solar Panels'] = {
    shed: { roof: 'flat', h: 12, wall: ['#e9edf8', '#cfd5e9'], roofCol: 0xdfe3f2 },
    build(b, c) {
      hall(b, 23, -23, 20, 18, 10, 0xe9edf8, 0x2140b8);
      for (const x of [17, 29]) hvac(b, x, 10.5, -31);
      const roof = M.solarField(18, 12); roof.position.set(23, 10.5, -21);
      const field = M.solarField(30, 7); field.position.set(21, 0, -38.5); // outdoor test field
      for (const z of [-17, -27]) b.cyl(0.45, 0.45, 5, STEEL, 9, 2.5, z, 8);
      return { meshes: [roof, field] };
    },
  };
  D.Machinery = {
    shed: { roof: 'monitor', h: 15, rise: 3.4, wall: ['#f4e9c8', '#e0d1a6'], roofCol: 0x4a5578 },
    build(b, c) {
      hall(b, 23, -23, 20, 18, 15, 0xf4e9c8, 0x4a5578); // high-bay erection hall
      b.box(20.1, 1.2, 18.1, 0xf0b429, 23, 11, -23);
      for (const x of [10, 34]) for (const z of [-40, -36]) b.box(0.8, 9, 0.8, 0xf0b429, x, 0, z); // test-bed gantry
      b.box(25, 1, 5, 0xf0b429, 22, 9, -38);
      b.box(6, 3, 4, 0xf0b429, 18, 0, -38); b.box(2.5, 2.2, 2.5, DARK, 17, 3, -38); // machine on test
      beam(b, [18, 4.2, -38], [25, 6.5, -38], 0.8, 0.8, 0xf0b429);
      for (const z of [-30, -24, -18]) b.box(5, 1.2, 4, 0x6a7194, 8, 0, z); // plate store
      return {};
    },
  };
})();
