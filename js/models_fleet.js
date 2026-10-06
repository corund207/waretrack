/* WareTrack – vehicle variety (rigs, trailers, cars, buses), rolling stock, ships, road + site infrastructure */
(function () {
  const T = THREE, M = WT.M, MB = M.MB, P = M.P, shade = M.shade;

  /* ================= road vehicles ================= */
  const CHROME = 0xc7cde3, GLASS = 0x26305e, DARK = 0x2a2f4a;
  function wheels(b, xs, w = 1.2, r = 0.6) {
    for (const wx of xs) for (const wz of [-w, w]) {
      b.cyl(r, r, 0.55, P.tire, wx, r, wz, 12, Math.PI / 2);
      b.cyl(r * 0.5, r * 0.5, 0.58, P.hub, wx, r, wz, 8, Math.PI / 2);
    }
  }
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
      wheels(b, [-6.0, -4.75, 6.4], 1.2, 0.6);
    } else {
      b.box(2.7, 2.9, 3.1, color, 5.0, 0.9, 0);
      b.box(1.8, 0.65, 3.0, color, 4.6, 3.8, 0);
      b.box(0.08, 1.25, 2.6, GLASS, 6.37, 2.2, 0);
      b.box(1.2, 0.95, 3.14, GLASS, 5.3, 2.35, 0);
      b.box(0.35, 0.45, 3.15, DARK, 6.45, 0.65, 0);
      for (const z of [-1.0, 1.0]) b.box(0.08, 0.3, 0.55, 0xfff1b8, 6.4, 1.3, z);
      b.box(0.5, 0.12, 2.4, shade(color, 0.8), 6.2, 1.8, 0);
      wheels(b, [-6.0, -4.75, 4.95], 1.2, 0.6);
    }
  }
  // Articulated rig. trailer: box | reefer | curtain | tanker | coil | logs | flat | dump
  M.rig = (o = {}) => {
    const g = new T.Group();
    const b = new MB();
    const color = o.cab || P.blue, stripe = o.stripe || color, tr = o.trailer || 'box';
    b.box(14.0, 0.45, 2.3, DARK, -0.6, 0.5, 0);
    cab(b, o.style || 'cabover', color);
    let decal = false;
    const W = 3.3;
    if (tr === 'box' || tr === 'reefer' || tr === 'curtain') {
      const body = tr === 'curtain' ? shade(stripe, 1.35) : o.trailerColor || P.white;
      b.box(11.4, 3.5, W, body, -2.0, 0.9, 0);
      b.box(11.46, 0.12, W + 0.06, shade(body, 0.9), -2.0, 4.4, 0);
      b.box(0.12, 3.3, W - 0.1, shade(body, 0.85), -7.72, 1.0, 0);
      if (tr === 'curtain') for (let x = -7.2; x < 3.6; x += 1.3) b.box(0.12, 3.4, W + 0.05, shade(stripe, 0.9), x, 0.95, 0);
      else b.box(11.46, 0.6, W + 0.06, stripe, -2.0, 0.95, 0);
      if (tr === 'reefer') {
        b.box(0.9, 2.2, 2.8, 0xdfe3f2, 3.9, 1.8, 0);
        b.box(0.92, 1.0, 1.0, 0x3a4166, 3.9, 2.4, 0);
      }
      decal = tr !== 'curtain';
    } else if (tr === 'tanker') {
      b.box(11.6, 0.4, 2.2, DARK, -2.0, 0.9, 0);
      b.cyl(1.5, 1.5, 10.4, 0xd5dae9, -2.0, 2.75, 0, 18, 0, 0, Math.PI / 2);
      b.sphere(1.5, 0xd5dae9, 3.2, 2.75, 0, 0.35, 1, 1, 14);
      b.sphere(1.5, 0xd5dae9, -7.2, 2.75, 0, 0.35, 1, 1, 14);
      b.cyl(1.52, 1.52, 0.3, stripe, -2.0, 2.75, 0, 18, 0, 0, Math.PI / 2);
      b.box(9, 0.12, 0.8, 0x9aa1c4, -2.0, 4.25, 0);
      for (const x of [-5.5, -2, 1.5]) b.cyl(0.4, 0.4, 0.3, 0x9aa1c4, x, 4.35, 0, 10);
      b.box(0.1, 3, 0.6, 0x9aa1c4, -7.5, 1.2, 1.2);
    } else if (tr === 'coil' || tr === 'logs' || tr === 'flat') {
      b.box(11.6, 0.35, W - 0.6, tr === 'flat' ? DARK : 0x6a7194, -2.0, 0.9, 0);
      if (tr === 'coil') {
        for (const x of [-6, -2.2, 1.6]) {
          b.box(1.8, 0.4, 2.4, 0x3a4166, x, 1.25, 0);
          b.cyl(1.05, 1.05, 1.8, 0xb8c2dc, x, 2.55, 0, 16, 0, 0, Math.PI / 2);
          b.cyl(0.45, 0.45, 1.82, 0x6a7194, x, 2.55, 0, 10, 0, 0, Math.PI / 2);
        }
      } else if (tr === 'logs') {
        for (const x of [-7.4, -4.4, -1.4, 1.6, 3.4]) for (const z of [-1.4, 1.4]) b.box(0.2, 2.8, 0.2, 0x3a4166, x, 1.25, z);
        const logC = [0xa0754e, 0x8f6644, 0xb58a5d];
        let k = 0;
        for (const [y, zs] of [[1.75, [-0.9, 0, 0.9]], [2.55, [-0.45, 0.45]], [3.3, [0]]]) for (const z of zs) {
          b.cyl(0.45, 0.45, 11, logC[k++ % 3], -2.0, y, z, 10, 0, 0, Math.PI / 2);
          b.cyl(0.36, 0.36, 11.06, 0xe2c79b, -2.0, y, z, 10, 0, 0, Math.PI / 2);
        }
      }
    } else if (tr === 'uld') {
      b.box(11.6, 0.35, W - 0.4, 0x6a7194, -2.0, 0.9, 0);
      for (const z of [-0.9, -0.3, 0.3, 0.9]) b.box(11.4, 0.12, 0.12, 0xf0b429, -2.0, 1.25, z);
      for (const z of [-1.5, 1.5]) b.box(11.6, 0.5, 0.12, 0x9aa1c4, -2.0, 1.25, z);
    } else if (tr === 'dump') {
      b.box(9, 0.4, 2.6, DARK, -1.6, 0.9, 0);
      b.box(8.6, 2.4, 3.0, o.trailerColor || 0xf0b429, -1.8, 1.3, 0);
      b.box(8.2, 0.6, 2.6, 0x9c7a5b, -1.8, 3.5, 0);
      b.sphere(1.2, 0x9c7a5b, -1.8, 3.9, 0, 3, 0.4, 1, 10);
    }
    if (tr !== 'dump') wheels(b, [-6.0, -4.75], 1.2, 0.6);
    g.add(b.mesh());
    if (decal && o.label) {
      const tex = M.labelTex(o.label, stripe);
      for (const side of [1, -1]) {
        const d = M.decal(tex, 7.2, 1.8);
        d.position.set(-2.0, 3.0, side * (W / 2 + 0.03));
        if (side < 0) d.rotation.y = Math.PI;
        g.add(d);
      }
    }
    const cargo = new T.Group();
    cargo.position.set(-2.0, 1.35, 0);
    g.add(cargo);
    g.userData.cargo = cargo;
    g.userData.half = 1.7;
    return g;
  };

  M.CAR_KINDS = ['sedan', 'sedan', 'suv', 'van', 'pickup'];
  M.carKind = (color, kind = 'sedan') => {
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
    for (const x of [1.45, -1.45]) for (const z of [-0.92, 0.92]) b.cyl(0.37, 0.37, 0.3, P.tire, x, 0.37, z, 10, Math.PI / 2);
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
  M.wagonKind = (kind) => {
    if (kind === 'container') return M.wagon();
    const g = new T.Group();
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
  M.conifer = () => {
    const b = new MB();
    b.cyl(0.22, 0.28, 1.6, 0x8a6a4e, 0, 0.8, 0, 6);
    b.cyl(0.05, 1.7, 3.2, 0x4f9f6a, 0, 2.6, 0, 7);
    b.cyl(0.05, 1.3, 2.6, 0x5cb377, 0, 4.0, 0, 7);
    b.cyl(0.02, 0.8, 1.8, 0x6cc285, 0, 5.2, 0, 7);
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
