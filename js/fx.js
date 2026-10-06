/* WareTrack – effects: smoke/steam/dust particles and conveyor belts */
(function () {
  const T = THREE, M = WT.M;
  const FX = (WT.FX = { pool: [], live: [], emitters: [], belts: [] });
  const MAX = 700;
  const _v = new T.Vector3();

  function sprite() {
    const s = new T.Sprite(new T.SpriteMaterial({ map: M.puffTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.renderOrder = 4;
    WT.scene.add(s);
    return s;
  }
  // o: color, size0, size1, life, vx, vy, vz, op
  FX.puff = (x, y, z, o = {}) => {
    if (FX.live.length >= MAX) return;
    const s = FX.pool.pop() || sprite();
    s.visible = true;
    s.material.color.set(o.color === undefined ? 0xffffff : o.color);
    s.position.set(x, y, z);
    FX.live.push({
      s, t: 0, life: o.life || 4, s0: o.size0 || 2, s1: o.size1 || 8, op: o.op === undefined ? 0.7 : o.op,
      vx: (o.vx || 0) + WT.rnd(-0.4, 0.4), vy: o.vy === undefined ? 3 : o.vy, vz: (o.vz || 0) + WT.rnd(-0.4, 0.4),
    });
  };
  // src: Object3D (world position read each spawn) or Vector3
  FX.emitter = (src, o = {}) => {
    const e = Object.assign({ src, rate: 2, acc: Math.random(), on: true, offset: new T.Vector3() }, o);
    FX.emitters.push(e);
    return e;
  };
  FX.update = (dt) => {
    for (const e of FX.emitters) {
      if (!e.on) continue;
      e.acc += e.rate * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        if (e.src.isObject3D) e.src.getWorldPosition(_v); else _v.copy(e.src);
        _v.add(e.offset);
        FX.puff(_v.x + WT.rnd(-e.jitter || 0, e.jitter || 0), _v.y, _v.z + WT.rnd(-e.jitter || 0, e.jitter || 0), e);
      }
    }
    for (let i = FX.live.length - 1; i >= 0; i--) {
      const p = FX.live[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.s.visible = false; FX.pool.push(p.s); FX.live.splice(i, 1); continue; }
      p.s.position.x += (p.vx + 0.9) * dt;
      p.s.position.y += p.vy * dt * (1 - k * 0.6);
      p.s.position.z += p.vz * dt;
      const sc = p.s0 + (p.s1 - p.s0) * Math.sqrt(k);
      p.s.scale.set(sc, sc, 1);
      p.s.material.opacity = p.op * Math.min(1, k * 6) * (1 - k);
    }
    for (const b of FX.belts) b.update(dt);
  };

  /* ---------- conveyor belts ---------- */
  const ITEM = {
    carton: { geo: new T.BoxGeometry(0.95, 0.8, 0.95), y: 0.4 },
    ore: { geo: new T.DodecahedronGeometry(0.42, 0), y: 0.38 },
    ingot: { geo: new T.BoxGeometry(1.1, 0.35, 0.55), y: 0.18 },
    uld: { geo: new T.BoxGeometry(1.5, 1.3, 1.3), y: 0.65 },
    can: { geo: new T.CylinderGeometry(0.36, 0.36, 0.8, 10), y: 0.4 },
    log: { geo: new T.CylinderGeometry(0.35, 0.35, 2.2, 8).rotateZ(Math.PI / 2), y: 0.36 },
    plank: { geo: new T.BoxGeometry(1.6, 0.18, 0.7), y: 0.1 },
  };
  const itemMat = new T.MeshLambertMaterial({ color: 0xffffff });
  const glowMat = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x7a2a00 });
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _s = new T.Vector3(1, 1, 1), _p = new T.Vector3(), _c = new T.Color(), _up = new T.Vector3(0, 1, 0);

  class Conveyor {
    // pts: [[x,y,z],...] in parent's local frame (y = belt top height)
    constructor(parent, pts, o = {}) {
      this.speed = o.speed || 5;
      this.spacing = o.spacing || 1.6;
      this.items = [];
      this.onArrive = o.onArrive;
      this.colors = o.colors || [0xcf9d62, 0xd9ad74, 0xc4925a];
      this.pts = pts;
      this.cum = [0];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        this.cum.push(this.cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
      }
      this.len = this.cum[this.cum.length - 1];
      const w = o.width || 1.5;
      const b = new M.MB();
      const belt = 0x3a4166, rail = o.railColor || 0x7d93f5, post = 0x9aa1c4;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay, az] = pts[i - 1], [bx, by, bz] = pts[i];
        const dx = bx - ax, dy = by - ay, dz = bz - az, hl = Math.hypot(dx, dz) || 1e-6, L = Math.hypot(hl, dy);
        const yaw = -Math.atan2(dz, dx), pitch = Math.atan2(dy, hl);
        const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
        const nx = -dz / hl, nz = dx / hl;
        b.boxC(L + w * 0.5, 0.26, w, belt, mx, my - 0.15, mz, 0, yaw, pitch);
        for (const sd of [1, -1]) b.boxC(L + w * 0.5, 0.42, 0.16, rail, mx + nx * sd * (w / 2 + 0.06), my + 0.02, mz + nz * sd * (w / 2 + 0.06), 0, yaw, pitch);
        if (Math.max(ay, by) > 1.2) {
          const n = Math.max(1, Math.floor(L / 6));
          for (let k = 0; k <= n; k++) {
            const t = n ? k / n : 0.5;
            const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
            if (py < 1.2) continue;
            if (o.noPost && o.noPost(px, pz)) continue;
            b.box(0.32, py - 0.3, 0.32, post, px + nx * (w / 2 - 0.1), 0, pz + nz * (w / 2 - 0.1));
            b.box(0.32, py - 0.3, 0.32, post, px - nx * (w / 2 - 0.1), 0, pz - nz * (w / 2 - 0.1));
          }
        }
      }
      this.mesh = b.mesh();
      parent.add(this.mesh);
      const kind = ITEM[o.item || 'carton'];
      this.kind = kind;
      const cap = Math.ceil(this.len / this.spacing) + 2;
      this.im = new T.InstancedMesh(kind.geo, o.glow ? glowMat : itemMat, cap);
      this.im.castShadow = true;
      this.im.setColorAt(0, _c.setHex(0xffffff));
      this.im.count = 0;
      this.im.frustumCulled = false;
      parent.add(this.im);
      FX.belts.push(this);
    }
    push(color) {
      const last = this.items[this.items.length - 1];
      if (last && last.s < this.spacing) return false;
      this.items.push({ s: 0, c: color === undefined ? WT.pick(this.colors) : color, r: Math.random() * 0.3 - 0.15 });
      return true;
    }
    at(s) {
      let i = 1;
      while (i < this.cum.length - 1 && this.cum[i] < s) i++;
      const a = this.pts[i - 1], b = this.pts[i], seg = this.cum[i] - this.cum[i - 1] || 1, u = WT.clamp((s - this.cum[i - 1]) / seg, 0, 1);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, -Math.atan2(b[2] - a[2], b[0] - a[0])];
    }
    update(dt) {
      const it = this.items;
      for (let i = 0; i < it.length; i++) {
        const ahead = i > 0 ? it[i - 1].s - this.spacing * 0.9 : Infinity;
        it[i].s = Math.min(it[i].s + this.speed * dt, ahead);
      }
      while (it.length && it[0].s >= this.len) {
        const x = it.shift();
        if (this.onArrive) this.onArrive(x);
      }
      for (let i = 0; i < it.length; i++) {
        const [x, y, z, yaw] = this.at(it[i].s);
        _q.setFromAxisAngle(_up, yaw + it[i].r);
        _m.compose(_p.set(x, y + this.kind.y, z), _q, _s);
        this.im.setMatrixAt(i, _m);
        this.im.setColorAt(i, _c.setHex(it[i].c));
      }
      this.im.count = it.length;
      this.im.instanceMatrix.needsUpdate = true;
      if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true;
    }
    dispose() {
      FX.belts.splice(FX.belts.indexOf(this), 1);
      this.mesh.parent.remove(this.mesh);
      this.im.parent.remove(this.im);
    }
  }
  FX.Conveyor = Conveyor;

  /* ---------- physical stockpiles that track inventory ---------- */
  const SP = {
    coils: { geo: new T.CylinderGeometry(0.95, 0.95, 1.4, 14).rotateZ(Math.PI / 2), h: 1.9, gap: [1.7, 2.0] },
    logs: { geo: new T.CylinderGeometry(0.42, 0.42, 6, 8).rotateZ(Math.PI / 2), h: 0.8, gap: [6.4, 0.9] },
    planks: { geo: new T.BoxGeometry(5, 0.9, 1.6), h: 0.95, gap: [5.4, 1.8] },
    crates: { geo: new T.BoxGeometry(1.7, 1.4, 1.7), h: 1.45, gap: [1.9, 1.9] },
    drums: { geo: new T.CylinderGeometry(0.9, 0.9, 1.6, 12), h: 1.65, gap: [2.0, 2.0] },
  };
  class Stockpile {
    // grid: [cols, rows, levels]
    constructor(parent, x, z, mat, grid = [3, 4, 3]) {
      const m = WT.SUP.MAT[mat];
      this.kind = m.pack === 'tanker' ? 'tank' : m.item === 'ore' ? 'heap' : m.item === 'log' ? 'logs' : m.item === 'can' && mat === 'steel' ? 'coils' : m.item === 'can' ? 'drums' : m.item === 'plank' ? 'planks' : 'crates';
      this.color = (m.colors && m.colors[0]) || 0xdfe3f2;
      this.g = new T.Group();
      this.g.position.set(x, 0, z);
      parent.add(this.g);
      this.frac = -1;
      if (this.kind === 'heap') {
        this.mesh = new T.Mesh(new T.ConeGeometry(4.2, 4.2, 10), new T.MeshLambertMaterial({ color: this.color }));
        this.mesh.castShadow = this.mesh.receiveShadow = true;
        this.g.add(this.mesh);
        const bin = new M.MB();
        bin.box(10, 1.4, 0.4, 0x9aa1c4, 0, 0, -4.8); bin.box(0.4, 1.4, 9.6, 0x9aa1c4, -5, 0, 0); bin.box(0.4, 1.4, 9.6, 0x9aa1c4, 5, 0, 0);
        this.g.add(bin.mesh());
      } else if (this.kind === 'tank') {
        const b = new M.MB();
        b.cyl(3.4, 3.4, 0.4, 0x9aa1c4, 0, 0.2, 0, 18);
        for (let i = 0; i < 4; i++) b.box(0.3, 9.6, 0.3, 0x9aa1c4, Math.cos(i * 1.57) * 3.3, 0, Math.sin(i * 1.57) * 3.3);
        b.cyl(3.45, 3.45, 0.3, 0x9aa1c4, 0, 9.6, 0, 18);
        this.g.add(b.mesh());
        this.shell = new T.Mesh(new T.CylinderGeometry(3.2, 3.2, 9, 18, 1, true), new T.MeshLambertMaterial({ color: 0xdfe5f5, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
        this.shell.position.y = 4.9;
        this.g.add(this.shell);
        this.level = new T.Mesh(new T.CylinderGeometry(3.05, 3.05, 1, 18), new T.MeshLambertMaterial({ color: mat === 'syrup' ? 0xb5543d : mat === 'chem' ? 0x8fd476 : 0xe9ecf7 }));
        this.g.add(this.level);
      } else {
        const sp = SP[this.kind];
        this.sp = sp;
        this.grid = grid;
        this.cap = grid[0] * grid[1] * grid[2];
        this.im = new T.InstancedMesh(sp.geo, new T.MeshLambertMaterial({ color: this.kind === 'crates' ? 0xc89b63 : this.color }), this.cap);
        this.im.castShadow = this.im.receiveShadow = true;
        this.im.count = 0;
        this.g.add(this.im);
        const _m = new T.Matrix4();
        let k = 0;
        for (let l = 0; l < grid[2]; l++) for (let r = 0; r < grid[1]; r++) for (let c = 0; c < grid[0]; c++) {
          _m.makeTranslation((c - (grid[0] - 1) / 2) * sp.gap[0], sp.h / 2 + l * sp.h, (r - (grid[1] - 1) / 2) * sp.gap[1]);
          this.im.setMatrixAt(k++, _m);
        }
        if (this.kind === 'crates' && m.colors) this.im.material.color.setHex(m.colors[0]);
        const pad = new M.MB();
        pad.box(grid[0] * sp.gap[0] + 1, 0.15, grid[1] * sp.gap[1] + 1, 0xc6cbe3, 0, 0, 0);
        this.g.add(pad.mesh(false, true));
      }
    }
    set(frac) {
      frac = WT.clamp(frac, 0, 1);
      if (Math.abs(frac - this.frac) < 0.01) return;
      this.frac = frac;
      if (this.kind === 'heap') { const s = Math.max(0.05, Math.sqrt(frac)); this.mesh.scale.set(s, Math.max(0.02, frac), s); this.mesh.position.y = 2.1 * Math.max(0.02, frac); }
      else if (this.kind === 'tank') { const h = Math.max(0.05, frac * 9); this.level.scale.y = h; this.level.position.y = 0.4 + h / 2; }
      else this.im.count = Math.round(frac * this.cap);
    }
  }
  FX.Stockpile = Stockpile;
})();
