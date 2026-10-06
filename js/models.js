/* WareTrack – low-poly model library. All models: local +X is forward, origin at ground. */
(function () {
  const T = THREE;
  const M = (WT.M = {});

  /* ---------- materials ---------- */
  const matCache = {};
  M.mat = (color, o = {}) => {
    const key = color + JSON.stringify(o);
    if (!matCache[key]) matCache[key] = new T.MeshLambertMaterial(Object.assign({ color }, o));
    return matCache[key];
  };
  M.vc = new T.MeshLambertMaterial({ vertexColors: true });
  M.glass = new T.MeshLambertMaterial({ color: 0x2b3866, emissive: 0x0d1430 });

  /* ---------- merged-geometry builder ---------- */
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const geoCache = {};
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3(), _n = new T.Matrix3(), _c = new T.Color();

  class MB {
    constructor() { this.p = []; this.n = []; this.c = []; this.i = []; this.off = 0; }
    add(geo, m4, color) {
      _c.set(color);
      const pos = geo.attributes.position, nor = geo.attributes.normal;
      _n.getNormalMatrix(m4);
      for (let k = 0; k < pos.count; k++) {
        _v.fromBufferAttribute(pos, k).applyMatrix4(m4);
        this.p.push(_v.x, _v.y, _v.z);
        _v.fromBufferAttribute(nor, k).applyMatrix3(_n).normalize();
        this.n.push(_v.x, _v.y, _v.z);
        this.c.push(_c.r, _c.g, _c.b);
      }
      if (geo.index) for (let k = 0; k < geo.index.count; k++) this.i.push(geo.index.getX(k) + this.off);
      else for (let k = 0; k < pos.count; k++) this.i.push(k + this.off);
      this.off += pos.count;
      return this;
    }
    // center-positioned box
    boxC(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
      _q.setFromEuler(_e.set(rx, ry, rz));
      _m.compose(_v.set(x, y, z), _q, _s.set(w, h, d));
      return this.add(unitBox, _m.clone(), color);
    }
    // bottom-positioned box
    box(w, h, d, color, x, yb, z, rx, ry, rz) { return this.boxC(w, h, d, color, x, yb + h / 2, z, rx, ry, rz); }
    cyl(rt, rb, h, color, x, y, z, seg = 14, rx = 0, ry = 0, rz = 0) {
      const key = 'c' + rt + ',' + rb + ',' + h + ',' + seg;
      const g = geoCache[key] || (geoCache[key] = new T.CylinderGeometry(rt, rb, h, seg));
      _q.setFromEuler(_e.set(rx, ry, rz));
      _m.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
      return this.add(g, _m.clone(), color);
    }
    sphere(r, color, x, y, z, sx = 1, sy = 1, sz = 1, seg = 12) {
      const key = 's' + r + ',' + seg;
      const g = geoCache[key] || (geoCache[key] = new T.SphereGeometry(r, seg, Math.max(6, seg >> 1)));
      _m.compose(_v.set(x, y, z), _q.identity(), _s.set(sx, sy, sz));
      return this.add(g, _m.clone(), color);
    }
    ico(r, color, x, y, z, sy = 1) {
      const key = 'i' + r;
      const g = geoCache[key] || (geoCache[key] = new T.IcosahedronGeometry(r, 0));
      _m.compose(_v.set(x, y, z), _q.identity(), _s.set(1, sy, 1));
      return this.add(g, _m.clone(), color);
    }
    geo(g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      _q.setFromEuler(_e.set(rx, ry, rz));
      _m.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1));
      return this.add(g, _m.clone(), color);
    }
    build() {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.i);
      g.computeBoundingSphere();
      return g;
    }
    mesh(cast = true, recv = true) {
      const m = new T.Mesh(this.build(), M.vc);
      m.castShadow = cast; m.receiveShadow = recv;
      return m;
    }
  }
  M.MB = MB;

  /* ---------- canvas textures ---------- */
  M.canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  };
  function hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 2;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  M.hexPath = hexPath;
  const css = (c) => '#' + c.toString(16).padStart(6, '0');
  const labelCache = {};
  M.labelTex = (text, color = 0x2b4fd8, logo = true) => {
    const key = text + color;
    if (labelCache[key]) return labelCache[key];
    return (labelCache[key] = M.canvasTex(512, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      let x = 18;
      if (logo) {
        ctx.fillStyle = css(color);
        hexPath(ctx, 60, 64, 42); ctx.fill();
        ctx.fillStyle = '#fff';
        hexPath(ctx, 60, 64, 20); ctx.fill();
        x = 118;
      }
      ctx.fillStyle = css(color);
      ctx.font = 'italic 800 64px Inter, "Segoe UI", Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, 66);
    }));
  };
  // flat decal plane (faces +Z by default)
  M.decal = (tex, w, h) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.renderOrder = 2;
    return m;
  };

  const shade = (hex, f) => {
    const c = new T.Color(hex);
    c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f);
    return c.getHex();
  };
  M.shade = shade;

  /* ---------- palette ---------- */
  const P = (M.P = {
    blue: 0x2f56e0, blueDark: 0x2140b8, blueLight: 0x5d7ff0, navy: 0x252c4f,
    carton: [0xcf9d62, 0xd9ad74, 0xc4925a, 0xdcb47e], tape: 0xe9d3a4,
    wood: 0xdcbf8f, wood2: 0xc8a777, tire: 0x262a3d, hub: 0xa7aec9,
    white: 0xf6f7fd, grey: 0xb9bfd8, dark: 0x3a4062, skin: 0xf0c7a0,
    orange: 0xf5a524, teal: 0x2aa198, green: 0x6cc570, leaf: [0x7cc96a, 0x5fb85a, 0x8fd476],
  });

  /* ---------- pallet ---------- */
  M.pallet = (style = 'carton', layers = 2, tint) => {
    const b = new MB();
    b.box(2.0, 0.16, 0.36, P.wood2, 0, 0, -0.8);
    b.box(2.0, 0.16, 0.36, P.wood2, 0, 0, 0);
    b.box(2.0, 0.16, 0.36, P.wood2, 0, 0, 0.8);
    b.box(2.0, 0.12, 2.0, P.wood, 0, 0.16, 0);
    let y = 0.28;
    if (style === 'wrap') {
      const c = tint || P.blue;
      b.box(1.9, 2.0, 1.9, c, 0, y, 0);
      b.box(1.94, 0.12, 1.94, shade(c, 1.25), 0, y + 0.5, 0);
      b.box(1.94, 0.12, 1.94, shade(c, 1.25), 0, y + 1.4, 0);
      b.box(1.7, 0.06, 1.7, shade(c, 1.15), 0, y + 2.0, 0);
      y += 2.06;
    } else if (style === 'crate') {
      const c = tint || 0xb98b55;
      b.box(1.9, 1.4, 1.9, c, 0, y, 0);
      b.box(1.95, 0.14, 1.95, shade(c, 0.8), 0, y + 0.2, 0);
      b.box(1.95, 0.14, 1.95, shade(c, 0.8), 0, y + 1.1, 0);
      y += 1.4;
    } else {
      for (let l = 0; l < layers; l++) {
        const hgt = 0.78;
        for (let i = 0; i < 4; i++) {
          const ox = i & 1 ? 0.48 : -0.48, oz = i & 2 ? 0.48 : -0.48;
          const c = tint && l === layers - 1 ? tint : P.carton[(i + l * 3 + layers) % 4];
          b.box(0.92, hgt, 0.92, c, ox, y, oz);
          b.box(0.16, 0.025, 0.93, P.tape, ox, y + hgt, oz);
        }
        y += hgt;
      }
    }
    const m = b.mesh();
    m.userData.top = y;
    return m;
  };

  /* ---------- forklift ---------- */
  M.forklift = (color = P.orange) => {
    const g = new T.Group();
    const b = new MB();
    b.box(2.9, 0.9, 1.7, color, -0.15, 0.35, 0);
    b.box(0.8, 1.1, 1.72, P.dark, -1.45, 0.35, 0);
    b.box(1.0, 0.25, 1.5, shade(color, 0.85), 0.7, 1.25, 0);
    // cage
    for (const px of [-0.9, 0.55]) for (const pz of [-0.72, 0.72]) b.box(0.1, 1.25, 0.1, P.dark, px, 1.25, pz);
    b.box(1.65, 0.12, 1.7, shade(color, 0.9), -0.17, 2.5, 0);
    // seat + driver
    b.box(0.7, 0.35, 0.8, P.dark, -0.5, 1.25, 0);
    b.box(0.7, 0.7, 0.5, P.dark, -0.85, 1.25, 0);
    b.box(0.5, 0.7, 0.75, 0x3b6cf6, -0.4, 1.6, 0);
    b.sphere(0.26, P.skin, -0.35, 2.55 - 0.3, 0);
    b.sphere(0.27, 0xffffff, -0.35, 2.36, 0, 1, 0.55, 1);
    // mast
    b.box(0.16, 3.0, 0.18, P.dark, 1.62, 0.2, -0.55);
    b.box(0.16, 3.0, 0.18, P.dark, 1.62, 0.2, 0.55);
    b.box(0.16, 0.14, 1.3, P.dark, 1.62, 3.0, 0);
    // wheels
    for (const [wx, r] of [[0.95, 0.5], [-1.15, 0.42]]) for (const wz of [-0.92, 0.92]) {
      b.cyl(r, r, 0.38, P.tire, wx, r, wz, 12, Math.PI / 2);
      b.cyl(r * 0.5, r * 0.5, 0.4, P.hub, wx, r, wz, 10, Math.PI / 2);
    }
    // beacon
    b.cyl(0.1, 0.1, 0.18, 0xffb020, -0.6, 2.7, 0, 8);
    g.add(b.mesh());
    const lift = new T.Group();
    lift.position.set(1.75, 0.1, 0);
    const fb = new MB();
    fb.box(0.12, 1.1, 1.4, P.dark, 0, 0, 0);
    fb.box(2.0, 0.1, 0.22, 0x50577a, 1.0, 0, -0.5);
    fb.box(2.0, 0.1, 0.22, 0x50577a, 1.0, 0, 0.5);
    lift.add(fb.mesh());
    g.add(lift);
    g.userData.lift = lift;
    return g;
  };

  /* ---------- trucks ---------- */
  M.truck = ({ cab = P.blue, trailer = P.white, stripe = P.blue, label = 'WareTrack', box = true } = {}) => {
    const g = new T.Group();
    const b = new MB();
    b.box(14.0, 0.45, 2.3, P.dark, -0.6, 0.5, 0);
    if (box) {
      b.box(11.4, 3.5, 3.3, trailer, -2.0, 0.9, 0);
      b.box(11.46, 0.6, 3.36, stripe, -2.0, 0.95, 0);
      b.box(11.46, 0.12, 3.36, shade(trailer, 0.9), -2.0, 4.4, 0);
      b.box(0.12, 3.3, 3.2, shade(trailer, 0.85), -7.72, 1.0, 0);
    } else {
      b.box(11.4, 0.4, 3.0, P.dark, -2.0, 0.9, 0);
    }
    // cab
    b.box(2.7, 2.9, 3.1, cab, 5.0, 0.9, 0);
    b.box(1.8, 0.65, 3.0, cab, 4.6, 3.8, 0);
    b.box(0.08, 1.25, 2.6, 0x26305e, 6.37, 2.2, 0);
    b.box(1.2, 0.95, 3.14, 0x26305e, 5.3, 2.35, 0);
    b.box(0.35, 0.45, 3.15, P.dark, 6.45, 0.65, 0);
    b.box(0.08, 0.3, 0.55, 0xfff1b8, 6.4, 1.3, 1.0);
    b.box(0.08, 0.3, 0.55, 0xfff1b8, 6.4, 1.3, -1.0);
    b.box(0.5, 0.12, 2.4, shade(cab, 0.8), 6.2, 1.8, 0);
    for (const wx of [-6.0, -4.75, 4.95]) for (const wz of [-1.2, 1.2]) {
      b.cyl(0.6, 0.6, 0.55, P.tire, wx, 0.6, wz, 14, Math.PI / 2);
      b.cyl(0.3, 0.3, 0.58, P.hub, wx, 0.6, wz, 10, Math.PI / 2);
    }
    g.add(b.mesh());
    if (box && label) {
      const tex = M.labelTex(label, stripe);
      for (const side of [1, -1]) {
        const d = M.decal(tex, 7.2, 1.8);
        d.position.set(-2.0, 3.0, side * 1.68);
        if (side < 0) d.rotation.y = Math.PI;
        g.add(d);
      }
    }
    // cargo anchor (pallets slide in here)
    const cargo = new T.Group();
    cargo.position.set(-2.0, 1.35, 0);
    g.add(cargo);
    g.userData.cargo = cargo;
    return g;
  };

  /* ---------- containers ---------- */
  M.CONT_COLORS = [0x2aa198, 0xe2703a, 0x3a6ff7, 0xf2f3f8, 0x2f56e0, 0xd9434b, 0x7a5cd6, 0x37b26c, 0xf0b429];
  M.container = (color, len = 11) => {
    const b = new MB();
    const w = 2.6, h = 2.7;
    b.box(len, h, w, color, 0, 0, 0);
    const rib = shade(color, 0.82);
    const n = Math.round(len / 0.7);
    for (let i = 1; i < n; i++) {
      const x = -len / 2 + i * (len / n);
      b.box(0.12, h - 0.3, 0.06, rib, x, 0.15, w / 2 + 0.02);
      b.box(0.12, h - 0.3, 0.06, rib, x, 0.15, -w / 2 - 0.02);
    }
    for (const ex of [-len / 2, len / 2]) {
      b.box(0.08, h, w - 0.2, shade(color, 0.75), ex, 0, 0);
      b.box(0.1, h - 0.4, 0.06, shade(color, 0.6), ex, 0.2, 0);
    }
    b.box(len + 0.04, 0.1, w + 0.04, shade(color, 0.9), 0, h - 0.1, 0);
    const m = b.mesh();
    m.userData.h = h;
    return m;
  };

  /* ---------- rail ---------- */
  M.wagon = () => {
    const g = new T.Group();
    const b = new MB();
    b.box(12.4, 0.45, 2.9, 0x3a4166, 0, 1.0, 0);
    b.box(12.6, 0.2, 2.6, 0x2d3352, 0, 0.85, 0);
    for (const bx of [-4.6, 4.6]) {
      b.box(2.8, 0.5, 2.2, 0x22263d, bx, 0.45, 0);
      for (const wx of [-0.8, 0.8]) for (const wz of [-1.0, 1.0]) b.cyl(0.42, 0.42, 0.2, 0x5a6080, bx + wx, 0.42, wz, 10, Math.PI / 2);
    }
    b.box(0.4, 0.3, 0.3, 0x22263d, 6.4, 0.95, 0);
    g.add(b.mesh());
    const slot = new T.Group();
    slot.position.set(0, 1.45, 0);
    g.add(slot);
    g.userData.slot = slot;
    return g;
  };
  M.loco = (color = P.blue) => {
    const b = new MB();
    b.box(13, 0.5, 3.0, 0x2d3352, 0, 0.9, 0);
    b.box(8, 2.6, 2.9, color, -1.8, 1.4, 0);
    b.box(3.2, 3.4, 3.1, color, 4.2, 1.4, 0);
    b.box(3.24, 0.9, 3.14, 0x26305e, 4.3, 3.0, 0);
    b.box(13.1, 0.35, 3.14, 0xf6f7fd, 0, 1.6, 0);
    b.box(0.6, 0.6, 2.4, shade(color, 0.85), 6.0, 1.4, 0);
    b.box(0.1, 0.3, 0.5, 0xfff1b8, 6.32, 2.0, 0);
    for (const fx of [-4.5, -2.5, -0.5]) b.cyl(0.55, 0.55, 0.25, 0x3a4166, fx, 4.15, 0, 12);
    for (const bx of [-4.2, 4.2]) {
      b.box(3.4, 0.6, 2.3, 0x22263d, bx, 0.3, 0);
      for (const wx of [-1.1, 0, 1.1]) for (const wz of [-1.05, 1.05]) b.cyl(0.45, 0.45, 0.2, 0x5a6080, bx + wx, 0.45, wz, 10, Math.PI / 2);
    }
    const g = new T.Group();
    g.add(b.mesh());
    return g;
  };

  /* ---------- aircraft ---------- */
  M.plane = (tail = P.blue) => {
    const g = new T.Group();
    const b = new MB();
    const W = P.white, fy = 4.2, R = 2.5;
    b.cyl(R, R, 26, W, 1, fy, 0, 18, 0, 0, Math.PI / 2);
    b.sphere(R, W, 14, fy, 0, 2.0, 1, 1, 18);
    b.cyl(0.8, R, 10, W, -16.9, fy + 0.6, 0, 18, 0, 0, Math.PI / 2);
    // belly stripe and windshield
    b.cyl(R + 0.03, R + 0.03, 26, tail, 1, fy - 0.15, 0, 18, 0, 0, Math.PI / 2);
    b.cyl(R + 0.04, R + 0.04, 26, W, 1, fy + 0.25, 0, 18, 0, 0, Math.PI / 2);
    b.boxC(1.3, 0.55, 3.0, 0x26305e, 15.0, fy + 1.15, 0, 0, 0, -0.35);
    // cargo door outline
    for (const s of [1, -1]) b.boxC(5.6, 2.6, 0.06, 0xd9deef, 7.5, fy + 0.6, s * (R + 0.05));
    // swept, tapered wings: points are [x, z] in plane-local space
    const planform = (pts, y, th, col) => {
      for (const side of [1, -1]) {
        const sh = new T.Shape();
        pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z * side) : sh.moveTo(x, -z * side)));
        const g = new T.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        g.translate(0, y, 0);
        b.geo(g, col);
      }
    };
    planform([[4.5, 1.5], [-3.5, 1.5], [-9.5, 18.5], [-6.0, 18.5]], fy - 1.45, 0.45, 0xe9ecf7);
    planform([[-16.5, 0.5], [-21.0, 0.5], [-23.6, 8.0], [-21.6, 8.0]], fy + 1.0, 0.35, 0xe9ecf7);
    for (const s of [1, -1]) for (const ez of [6.5, 11.5]) {
      const ex = 2.2 - (ez - 1.5) * 0.6;
      b.cyl(0.95, 0.95, 3.6, 0xdfe3f2, ex, fy - 2.4, s * ez, 14, 0, 0, Math.PI / 2);
      b.cyl(0.7, 0.7, 3.62, 0x3a4166, ex, fy - 2.4, s * ez, 14, 0, 0, Math.PI / 2);
      b.boxC(1.8, 1.0, 0.3, 0xdfe3f2, ex - 0.4, fy - 1.6, s * ez);
    }
    // tail
    b.boxC(5.2, 7.5, 0.45, tail, -19.8, fy + 4.6, 0, 0, 0, 0.42);
    g.add(b.mesh());
    // tail logo
    const tex = M.labelTex('', 0xffffff, true);
    for (const s of [1, -1]) {
      const d = M.decal(tex, 6, 1.5);
      d.position.set(-19.4, fy + 4.6, s * 0.26);
      if (s < 0) d.rotation.y = Math.PI;
      g.add(d);
    }
    // gear
    const gb = new MB();
    gb.box(0.3, fy - 2.0, 0.3, 0x50577a, 11, 0.7, 0);
    gb.cyl(0.65, 0.65, 0.5, P.tire, 11, 0.65, 0, 12, Math.PI / 2);
    for (const s of [1, -1]) {
      gb.box(0.4, fy - 2.0, 0.4, 0x50577a, -2, 0.7, s * 2.2);
      for (const wx of [-2.9, -1.1]) gb.cyl(0.75, 0.75, 0.9, P.tire, wx, 0.75, s * 2.2, 12, Math.PI / 2);
    }
    const gear = gb.mesh();
    g.add(gear);
    g.userData.gear = gear;
    return g;
  };
  M.uld = () => {
    const b = new MB();
    b.box(2.9, 0.12, 2.5, 0x8f97b8, 0, 0, 0);
    b.box(2.8, 2.0, 2.4, 0xd4d9ea, 0, 0.12, 0);
    b.boxC(2.82, 1.0, 0.8, 0xc3c9de, 0, 2.0, 0.85, -0.6, 0, 0);
    b.box(2.85, 0.3, 2.45, P.blue, 0, 0.5, 0);
    return b.mesh();
  };
  M.tug = (color = 0xf5c518) => {
    const b = new MB();
    b.box(3.0, 0.9, 1.8, color, 0, 0.4, 0);
    b.box(1.2, 1.1, 1.7, color, -0.7, 1.3, 0);
    b.box(1.22, 0.6, 1.72, 0x26305e, -0.7, 1.6, 0);
    for (const wx of [1.0, -1.0]) for (const wz of [-0.95, 0.95]) b.cyl(0.42, 0.42, 0.3, P.tire, wx, 0.42, wz, 10, Math.PI / 2);
    b.cyl(0.1, 0.1, 0.2, 0xff8a00, -0.7, 2.5, 0, 8);
    const g = new T.Group();
    g.add(b.mesh());
    return g;
  };
  M.dolly = () => {
    const b = new MB();
    b.box(3.4, 0.25, 2.7, 0x7d86ad, 0, 0.6, 0);
    b.box(1.6, 0.1, 0.12, 0x50577a, 2.4, 0.7, 0);
    for (const wx of [1.2, -1.2]) for (const wz of [-1.1, 1.1]) b.cyl(0.32, 0.32, 0.25, P.tire, wx, 0.32, wz, 10, Math.PI / 2);
    const g = new T.Group();
    g.add(b.mesh());
    const slot = new T.Group();
    slot.position.y = 0.85;
    g.add(slot);
    g.userData.slot = slot;
    return g;
  };

  /* ---------- ship ---------- */
  M.ship = (hull = 0x24336e) => {
    const g = new T.Group();
    const shape = new T.Shape();
    const pts = [[-42, -7.5], [28, -7.5], [44, -2], [46, 0], [44, 2], [28, 7.5], [-42, 7.5], [-44, 4], [-44, -4]];
    shape.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach((p) => shape.lineTo(p[0], p[1]));
    const hullGeo = new T.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false });
    hullGeo.rotateX(-Math.PI / 2);
    hullGeo.translate(0, -2.5, 0);
    const b = new MB();
    b.geo(hullGeo, hull);
    const deckGeo = new T.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    deckGeo.rotateX(-Math.PI / 2);
    deckGeo.scale(0.97, 1, 0.93);
    deckGeo.translate(0, 3.5, 0);
    b.geo(deckGeo, 0xcfd5ee);
    const redGeo = new T.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false });
    redGeo.rotateX(-Math.PI / 2);
    redGeo.scale(1.005, 1, 1.01);
    redGeo.translate(0, -0.2, 0);
    b.geo(redGeo, 0xc8463d);
    // superstructure (stern)
    b.box(9, 9, 13, P.white, -36, 3.5, 0);
    b.box(9.1, 0.8, 13.1, 0x26305e, -36, 10.6, 0);
    b.box(5, 2.2, 15.5, P.white, -35, 12.5, 0);
    b.box(5.1, 0.8, 15.6, 0x26305e, -35, 13.3, 0);
    for (let wy = 5.2; wy < 10; wy += 1.7) b.box(9.12, 0.4, 13.12, 0xcfd5ee, -36, wy, 0);
    b.box(3, 5, 3, P.blue, -40, 12.5, 0);
    b.box(3.05, 0.6, 3.05, 0x26305e, -40, 17.0, 0);
    // bow mast
    b.box(0.5, 6, 0.5, 0xcfd5ee, 40, 3.5, 0);
    g.add(b.mesh());
    // container bays
    const stacks = [];
    const bayXs = [];
    for (let x = -26; x <= 36; x += 6.2) bayXs.push(x);
    for (const x of bayXs) for (let r = -2; r <= 2; r++) {
      const st = { x, z: r * 2.75, items: [] };
      const lv = WT.rint(1, 3);
      for (let l = 0; l < lv; l++) {
        const c = M.container(WT.pick(M.CONT_COLORS), 5.8);
        c.position.set(x, 3.8 + l * 2.75, st.z);
        g.add(c);
        st.items.push(c);
      }
      stacks.push(st);
    }
    g.userData.stacks = stacks;
    return g;
  };

  /* ---------- nature / props ---------- */
  M.tree = (s = 1) => {
    const b = new MB();
    b.cyl(0.22 * s, 0.3 * s, 2.2 * s, 0x9c7a5b, 0, 1.1 * s, 0, 7);
    const c = WT.pick(P.leaf);
    b.sphere(1.55 * s, c, 0, 3.1 * s, 0, 1, 1.15, 1, 9);
    b.sphere(1.0 * s, shade(c, 1.1), 0.3 * s, 4.3 * s, 0.2 * s, 1, 1.1, 1, 8);
    return b.mesh();
  };
  M.lamp = () => {
    const b = new MB();
    b.cyl(0.12, 0.15, 7, 0x9aa1c4, 0, 3.5, 0, 8);
    b.box(1.6, 0.15, 0.3, 0x9aa1c4, 0.7, 6.9, 0);
    b.box(0.6, 0.15, 0.4, 0xfff6d0, 1.3, 6.8, 0);
    return b.mesh();
  };
  M.rack = (len = 12, levels = 3, color = P.blue) => {
    const b = new MB();
    const bays = Math.round(len / 2.6);
    for (let i = 0; i <= bays; i++) for (const z of [-1.1, 1.1]) b.box(0.18, levels * 2.4 + 0.3, 0.18, color, -len / 2 + i * (len / bays), 0, z);
    for (let l = 1; l <= levels; l++) for (const z of [-1.1, 1.1]) b.box(len, 0.22, 0.14, 0xf08c2a, 0, l * 2.4 - 0.25, z);
    for (let l = 0; l < levels; l++) for (let i = 0; i < bays; i++) {
      if (Math.random() < 0.15) continue;
      const cx = -len / 2 + (i + 0.5) * (len / bays);
      const y = l === 0 ? 0 : l * 2.4;
      b.box(1.9, 0.14, 1.9, P.wood, cx, y, 0);
      const style = Math.random();
      if (style < 0.5) {
        b.box(0.88, 0.8, 0.88, P.carton[i % 4], cx - 0.46, y + 0.14, -0.46);
        b.box(0.88, 0.8, 0.88, P.carton[(i + 1) % 4], cx + 0.46, y + 0.14, -0.46);
        b.box(0.88, 0.8, 0.88, P.carton[(i + 2) % 4], cx - 0.46, y + 0.14, 0.46);
        b.box(0.88, 0.8, 0.88, P.carton[(i + 3) % 4], cx + 0.46, y + 0.14, 0.46);
        b.box(0.88, 0.75, 0.88, P.carton[i % 4], cx - 0.46, y + 0.94, 0.46);
      } else if (style < 0.8) b.box(1.8, 1.7, 1.8, P.blue, cx, y + 0.14, 0);
      else b.box(1.8, 1.4, 1.8, 0xb98b55, cx, y + 0.14, 0);
    }
    return b.mesh();
  };
  M.fence = (len, axis = 'x') => {
    const b = new MB();
    const n = Math.max(1, Math.round(len / 4));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i * len) / n;
      if (axis === 'x') b.box(0.18, 2.2, 0.18, 0x9aa1c4, t, 0, 0);
      else b.box(0.18, 2.2, 0.18, 0x9aa1c4, 0, 0, t);
    }
    for (const y of [0.4, 1.3, 2.05]) {
      if (axis === 'x') b.box(len, 0.08, 0.06, 0xb7bdd9, 0, y, 0);
      else b.box(0.06, 0.08, len, 0xb7bdd9, 0, y, 0);
    }
    // mesh panels
    for (let i = 0; i < n * 4; i++) {
      const t = -len / 2 + (i + 0.5) * (len / (n * 4));
      if (axis === 'x') b.box(0.03, 1.9, 0.03, 0xcfd4ea, t, 0.2, 0);
      else b.box(0.03, 1.9, 0.03, 0xcfd4ea, 0, 0.2, t);
    }
    return b.mesh();
  };

  /* ---------- cranes ---------- */
  // Rail gantry: spans along local X (legs at ±span/2), travels along Z.
  M.gantry = (span = 44, height = 17) => {
    const g = new T.Group();
    const b = new MB();
    const C = P.blue, Y = 0xf0b429;
    for (const sx of [-1, 1]) {
      const x = (sx * span) / 2;
      b.box(1.2, 1.0, 12, C, x, 0, 0);
      for (const z of [-5, 5]) b.box(1.0, height, 1.0, C, x, 0.8, z);
      b.box(1.2, 1.4, 11.5, C, x, height * 0.55, 0);
      for (const z of [-5.5, -3.5, 3.5, 5.5]) b.cyl(0.5, 0.5, 0.6, P.tire, x, 0.5, z, 10, 0, 0, Math.PI / 2);
    }
    for (const z of [-4, 4]) b.box(span + 2, 1.6, 1.2, C, 0, height, z);
    b.box(span + 2, 0.3, 9.2, Y, 0, height + 1.6, 0);
    b.box(4, 2.6, 3, P.white, (span / 2) - 3, height + 1.9, 5.8);
    g.add(b.mesh());
    const trolley = new T.Group();
    trolley.position.y = height;
    const tb = new MB();
    tb.box(4.5, 1.6, 9.6, 0x3a4166, 0, 1.6, 0);
    tb.box(2.2, 1.8, 2.2, 0x26305e, 0, -0.9, -5.5);
    trolley.add(tb.mesh());
    g.add(trolley);
    const spreader = new T.Group();
    const sb = new MB();
    sb.box(1.0, 0.5, 11.8, Y, 0, 0, 0);
    sb.box(2.7, 0.35, 1.0, Y, 0, 0, 0);
    spreader.add(sb.mesh());
    g.add(spreader);
    const cable = new T.Mesh(new T.BoxGeometry(0.12, 1, 0.12), M.mat(0x3a4166));
    g.add(cable);
    const cable2 = cable.clone();
    g.add(cable2);
    const crane = { group: g, trolley, spreader, cables: [cable, cable2], height, carry: null };
    crane.set = (tx, hy) => {
      trolley.position.x = tx;
      spreader.position.set(tx, hy, 0);
      for (const [i, c] of crane.cables.entries()) {
        const len = height - hy;
        c.scale.y = Math.max(0.1, len);
        c.position.set(tx, hy + len / 2 + 0.3, i ? 3 : -3);
      }
    };
    crane.tx = 0; crane.hy = height - 4;
    crane.set(0, crane.hy);
    // container under spreader is oriented along Z
    crane.carryRot = Math.PI / 2;
    return crane;
  };
  // Quay crane: boom along local +Z (toward water), travels along X.
  M.quayCrane = () => {
    const g = new T.Group();
    const b = new MB();
    const C = P.blue, H = 24;
    for (const x of [-6, 6]) for (const z of [-4, 6]) b.box(1.1, H, 1.1, C, x, 0, z);
    for (const z of [-4, 6]) b.box(14, 1.0, 1.3, C, 0, 0, z);
    for (const z of [-4, 6]) b.box(13, 1.2, 1.2, C, 0, H * 0.45, z);
    for (const x of [-6, 6]) b.box(1.2, 1.2, 11, C, x, H * 0.45, 1);
    for (const x of [-2.6, 2.6]) b.box(1.2, 2.0, 58, C, x, H, 12);
    b.box(6.4, 0.3, 58, 0xf0b429, 0, H + 2, 12);
    b.box(8, 4, 8, P.white, 0, H + 2, -10);
    b.box(1.2, 10, 1.2, C, 0, H + 2, 0);
    b.boxC(0.4, 0.4, 30, 0x9aa1c4, 0, H + 7, 18, -0.33, 0, 0);
    b.boxC(0.4, 0.4, 16, 0x9aa1c4, 0, H + 7, -6, 0.55, 0, 0);
    for (const x of [-6, 6]) for (const z of [-4, 6]) b.cyl(0.55, 0.55, 0.6, P.tire, x, 0.55, z, 10, 0, 0, Math.PI / 2);
    g.add(b.mesh());
    const trolley = new T.Group();
    trolley.position.y = H - 0.2;
    const tb = new MB();
    tb.box(5, 1.5, 4, 0x3a4166, 0, -1.2, 0);
    tb.box(2.2, 1.8, 2.2, 0x26305e, 2.6, -2.6, 0);
    trolley.add(tb.mesh());
    g.add(trolley);
    const spreader = new T.Group();
    const sb = new MB();
    sb.box(6.2, 0.45, 1.0, 0xf0b429, 0, 0, 0);
    sb.box(1.0, 0.35, 2.7, 0xf0b429, 0, 0, 0);
    spreader.add(sb.mesh());
    g.add(spreader);
    const cables = [0, 1].map(() => { const c = new T.Mesh(new T.BoxGeometry(0.12, 1, 0.12), M.mat(0x3a4166)); g.add(c); return c; });
    const crane = { group: g, trolley, spreader, cables, height: H - 1.4, carry: null, carryRot: 0 };
    crane.set = (tz, hy) => {
      trolley.position.z = tz;
      spreader.position.set(0, hy, tz);
      cables.forEach((c, i) => {
        const len = crane.height - hy;
        c.scale.y = Math.max(0.1, len);
        c.position.set(i ? 1.6 : -1.6, hy + len / 2 + 0.3, tz);
      });
    };
    crane.tx = 0; crane.hy = 16;
    crane.set(0, 16);
    return crane;
  };

  /* ---------- pin sprite ---------- */
  let pinTex = null;
  M.pin = (color = '#2f56e0') => {
    if (!pinTex) pinTex = M.canvasTex(128, 160, (ctx) => {
      ctx.shadowColor = 'rgba(30,40,90,.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(64, 58, 44, Math.PI * 0.82, Math.PI * 2.18);
      ctx.lineTo(64, 150);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(64, 58, 18, 0, Math.PI * 2); ctx.fill();
    });
    const s = new T.Sprite(new T.SpriteMaterial({ map: pinTex, depthTest: false, transparent: true }));
    s.center.set(0.5, 0.02);
    s.scale.set(2.6, 3.25, 1);
    s.renderOrder = 10;
    return s;
  };
})();
