/* WareTrack – models for the growing park: construction kit, industry, power, cars, trees */
(function () {
  const T = THREE, M = WT.M, MB = M.MB, P = M.P, shade = M.shade;

  /* ---------- instanced tree geometry ---------- */
  // broadleaf: a tapering trunk with two limbs under a clump of lumpy foliage, lit lighter on top
  M.treeGeometry = () => {
    const b = new MB();
    b.cyl(0.14, 0.3, 3.2, 0x5b4636, 0, 1.6, 0, 7);
    b.cyl(0.07, 0.11, 1.6, 0x5b4636, 0.45, 2.9, 0.1, 4, 0, 0, -0.6);
    b.blob(1.7, 0x3f6d29, 0, 4.0, 0, 1, 0.85, 1, 1, 0.3, 1);
    b.blob(1.25, 0x4b7b30, 0.9, 4.4, 0.5, 1, 0.9, 1, 1, 0.32, 2);
    b.blob(1.2, 0x37622a, -0.9, 4.2, -0.4, 1, 0.9, 1, 0, 0.32, 3);
    b.blob(1.05, 0x55853a, 0.1, 5.3, -0.2, 1, 0.9, 1, 0, 0.3, 4);
    b.blob(0.95, 0x426f2c, -0.3, 4.6, 1.0, 1, 0.9, 1, 0, 0.25, 5);
    return b.build();
  };

  /* ---------- tower crane ---------- */
  M.towerCrane = (H = 34) => {
    const g = new T.Group();
    const Y = 0xf5b82e, Yd = shade(0xf5b82e, 0.78);
    const mb = new MB();
    mb.box(5, 1, 5, 0x9aa1c4, 0, 0, 0);
    for (const x of [-0.8, 0.8]) for (const z of [-0.8, 0.8]) mb.box(0.28, H, 0.28, Y, x, 1, z);
    for (let y = 2; y < H; y += 2.4) {
      mb.box(1.9, 0.16, 0.16, Yd, 0, y, 0.8); mb.box(1.9, 0.16, 0.16, Yd, 0, y, -0.8);
      mb.box(0.16, 0.16, 1.9, Yd, 0.8, y, 0); mb.box(0.16, 0.16, 1.9, Yd, -0.8, y, 0);
      mb.boxC(0.12, 2.9, 0.12, Yd, 0, y + 1.2, 0.8, 0, 0, 0.62);
      mb.boxC(0.12, 2.9, 0.12, Yd, 0, y + 1.2, -0.8, 0, 0, -0.62);
      mb.boxC(0.12, 2.9, 0.12, Yd, 0.8, y + 1.2, 0, 0.62, 0, 0);
      mb.boxC(0.12, 2.9, 0.12, Yd, -0.8, y + 1.2, 0, -0.62, 0, 0);
    }
    const mast = mb.mesh();
    g.add(mast);
    const slew = new T.Group();
    slew.position.y = H + 1;
    g.add(slew);
    const sb = new MB();
    sb.box(2.2, 1.0, 2.2, Y, 0, -0.2, 0);
    sb.box(2.4, 2.0, 2.0, 0xf6f7fd, 0.4, 0.6, 1.8);
    sb.box(2.42, 0.8, 2.02, 0x26305e, 0.4, 1.4, 1.8);
    sb.box(34, 1.0, 1.1, Y, 18, 0.8, 0);
    for (let x = 2; x < 35; x += 2.2) sb.boxC(0.12, 1.2, 0.12, Yd, x, 1.3, 0, 0, 0, 0.6);
    sb.box(12, 1.0, 1.6, Y, -6, 0.8, 0);
    sb.box(3.2, 2.6, 2.4, 0x8a90ad, -10.4, -0.4, 0);
    sb.box(1.0, 6.0, 1.0, Y, 0, 1.8, 0);
    const tie = (x1, y1) => {
      const dx = x1, dy = y1 - 7.8, L = Math.hypot(dx, dy);
      sb.boxC(L, 0.14, 0.14, 0x9aa1c4, dx / 2, 7.8 + dy / 2, 0, 0, 0, Math.atan2(dy, dx));
    };
    tie(24, 1.8); tie(-11, 1.8);
    slew.add(sb.mesh());
    const trolley = new T.Group();
    const tb = new MB();
    tb.box(1.6, 0.5, 1.4, 0x3a4166, 0, 0.2, 0);
    trolley.add(tb.mesh());
    slew.add(trolley);
    const cable = new T.Mesh(new T.BoxGeometry(0.1, 1, 0.1), M.mat(0x3a4166));
    slew.add(cable);
    const hb = new MB();
    hb.box(0.8, 0.9, 0.8, 0xd9434b, 0, 0, 0);
    hb.box(2.6, 0.6, 2.6, 0xb98b55, 0, -1.6, 0);
    const hook = hb.mesh();
    slew.add(hook);
    const crane = { group: g, slew, trolley, cable, hook, H };
    crane.set = (x, drop) => {
      trolley.position.set(x, 0.2, 0);
      const len = Math.max(0.5, drop);
      cable.scale.y = len;
      cable.position.set(x, 0.3 - len / 2, 0);
      hook.position.set(x, 0.2 - len - 0.9, 0);
    };
    crane.set(18, 10);
    return crane;
  };

  /* ---------- construction vehicles ---------- */
  M.mixer = () => {
    const g = M.truck({ box: false, cab: 0xf08c2a, label: '' });
    const tilt = new T.Group();
    tilt.position.set(-2.4, 3.1, 0);
    tilt.rotation.z = 0.2;
    const spin = new T.Group();
    tilt.add(spin);
    const db = new MB();
    db.cyl(1.55, 1.55, 6.2, 0xf6f7fd, 0, 0, 0, 14, 0, 0, Math.PI / 2);
    db.cyl(0.9, 1.55, 1.6, 0xf08c2a, -3.9, 0, 0, 14, 0, 0, Math.PI / 2);
    db.cyl(1.55, 1.0, 1.2, 0xf08c2a, 3.7, 0, 0, 14, 0, 0, Math.PI / 2);
    for (const x of [-1.8, 0, 1.8]) db.cyl(1.58, 1.58, 0.35, 0xf08c2a, x, 0, 0, 14, 0, 0, Math.PI / 2);
    spin.add(db.mesh());
    g.add(tilt);
    g.userData.drum = spin;
    return g;
  };
  M.paver = () => {
    const b = new MB();
    b.box(5, 1.4, 3.2, 0xf5b82e, 0, 0.6, 0);
    b.box(2, 1.6, 2.2, 0xf5b82e, -1.2, 2.0, 0);
    b.box(2.04, 0.8, 2.24, 0x26305e, -1.2, 2.6, 0);
    b.box(1.8, 0.2, 2.6, 0x3a4166, -1.2, 3.6, 0);
    b.cyl(0.9, 0.9, 3.4, 0x50577a, 2.4, 0.9, 0, 14, Math.PI / 2);
    b.cyl(0.7, 0.7, 3.0, P.tire, -2.0, 0.7, 0, 12, Math.PI / 2);
    b.cyl(0.12, 0.12, 0.3, 0xff8a00, -1.2, 3.9, 0, 8);
    const g = new T.Group();
    g.add(b.mesh());
    return g;
  };
  M.trackLayer = () => {
    const g = M.loco(0xf5b82e);
    const b = new MB();
    b.box(6, 1.2, 3.4, 0xf08c2a, 9, 0.9, 0);
    b.box(1.5, 2.2, 3.6, 0x3a4166, 11.5, 0.6, 0);
    g.add(b.mesh());
    return g;
  };

  /* ---------- cars ---------- */
  M.CAR_COLORS = [0xf6f7fd, 0x2f56e0, 0xd9434b, 0x3a4166, 0xb9bfd8, 0x1aa6b7, 0xf0b429, 0x22263d];
  M.car = (color) => {
    const b = new MB();
    b.box(4.4, 0.9, 1.95, color, 0, 0.35, 0);
    b.box(2.4, 0.8, 1.8, color, -0.3, 1.25, 0);
    b.box(2.42, 0.55, 1.84, 0x2b3866, -0.3, 1.35, 0);
    b.box(0.08, 0.25, 0.5, 0xfff1b8, 2.21, 0.75, 0.6);
    b.box(0.08, 0.25, 0.5, 0xfff1b8, 2.21, 0.75, -0.6);
    for (const x of [1.4, -1.4]) for (const z of [-0.9, 0.9]) b.cyl(0.36, 0.36, 0.3, P.tire, x, 0.36, z, 10, Math.PI / 2);
    const g = new T.Group();
    g.add(b.mesh());
    return g;
  };

  /* ---------- industry ---------- */
  M.silo = (b, x, z, r, h, color = 0xdfe3f2) => {
    b.cyl(r, r, h, color, x, h / 2, z, 16);
    b.cyl(0.4, r, r * 0.6, shade(color, 0.92), x, h + r * 0.3, z, 16);
    for (let y = 2; y < h; y += 3) b.cyl(r + 0.05, r + 0.05, 0.25, shade(color, 0.85), x, y, z, 16);
    b.box(0.5, h, 0.5, 0x9aa1c4, x + r + 0.1, 0, z);
  };
  M.chimney = (b, x, z, r, h, color = 0xe9ecf7) => {
    b.cyl(r * 0.8, r, h, color, x, h / 2, z, 12);
    b.cyl(r * 0.82, r * 0.82, 1.4, 0xd9434b, x, h - 1.6, z, 12);
    b.cyl(r * 0.82, r * 0.82, 1.4, 0xd9434b, x, h - 4.4, z, 12);
    b.cyl(r * 0.85, r * 0.85, 0.5, 0x3a4166, x, h, z, 12);
  };
  M.coolingTower = (b, x, z, s = 1) => {
    const pts = [[12, 0], [10.6, 5], [9.2, 11], [8.1, 17], [7.6, 22], [7.9, 27], [8.6, 31]].map(([r, y]) => new T.Vector2(r * s, y * s));
    const g = new T.LatheGeometry(pts, 28);
    b.geo(g, 0xe3e6f2, x, 0, z);
    b.cyl(8.0 * s, 8.0 * s, 0.4, 0x6a7194, x, 29 * s, z, 28);
    b.cyl(8.7 * s, 8.7 * s, 0.5, 0xc7cce2, x, 31 * s, z, 28);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      b.boxC(0.5, 2.4, 0.5, 0x9aa1c4, x + Math.cos(a) * 11.6 * s, 1.2, z + Math.sin(a) * 11.6 * s);
    }
  };
  M.pylon = () => {
    const b = new MB();
    const c = 0x9aa1c4;
    b.cyl(0.3, 1.3, 26, c, 0, 13, 0, 4, 0, Math.PI / 4, 0);
    b.box(11, 0.4, 0.5, c, 0, 19, 0);
    b.box(8, 0.4, 0.5, c, 0, 23, 0);
    b.box(0.2, 2.5, 0.2, c, 0, 26, 0);
    for (const x of [-5.2, 5.2]) b.box(0.25, 1.0, 0.25, 0x3a4166, x, 18.2, 0);
    for (const x of [-3.7, 3.7]) b.box(0.25, 1.0, 0.25, 0x3a4166, x, 22.2, 0);
    return b.mesh();
  };
  M.solarField = (w, d) => {
    const b = new MB();
    for (let z = -d / 2 + 3; z < d / 2 - 2; z += 7) {
      for (let x = -w / 2 + 3; x < w / 2 - 2; x += 3.9) {
        b.box(0.2, 1.4, 0.2, 0x9aa1c4, x, 0, z);
        b.boxC(3.7, 0.12, 3.4, 0x2a3f99, x, 1.9, z, -0.55, 0, 0);
        b.boxC(3.72, 0.02, 0.06, 0x8ea6ff, x, 1.98, z, -0.55, 0, 0);
      }
    }
    return b.mesh();
  };

  /* ---------- soft puff texture ---------- */
  M.puffTex = M.canvasTex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
})();
