/* WareTrack – road traffic engine: collision avoidance, signals, gates, vehicles and their missions */
(function () {
  const T = THREE, M = WT.M, W = WT.W;
  const TR = (WT.TR = { vehicles: [], junctions: [], gates: [], cell: 40, grid: new Map() });
  WT.trucks = [];
  const DEC = 6.5, T_PRED = [0.35, 0.7, 1.05, 1.5, 2.0, 2.6];

  /* ================= spatial hash ================= */
  const ck = (x, z) => ((Math.floor(x / TR.cell) + 1000) << 12) | (Math.floor(z / TR.cell) + 1000);
  TR.nearby = function (x, z, r, out) {
    out.length = 0;
    const c = TR.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const l = TR.grid.get(((i + 1000) << 12) | (j + 1000));
      if (l) for (const v of l) out.push(v);
    }
    return out;
  };
  TR.add = (v) => { if (!TR.vehicles.includes(v)) TR.vehicles.push(v); };
  TR.remove = (v) => { const i = TR.vehicles.indexOf(v); if (i >= 0) TR.vehicles.splice(i, 1); };

  function roadClass(x, z) {
    for (const j of TR.junctions) if (Math.abs(x - j.x) < 8.5 && Math.abs(z) < 8.5) return 4;
    if (Math.abs(z) < 8) return 3;
    for (const A in W.av) if (Math.abs(x - A) < 7) return 2;
    return 1;
  }
  const tmpA = [], tmpB = [], tmpG = [];
  // world-space stand-ins for yard forklifts so trucks stop for them
  const _fp = new THREE.Vector3(), _ff = new THREE.Vector3();
  TR.addProxy = (fork) => TR.add({ proxyOf: fork, id: fork.id, actor: { x: 0, z: 0, h: 0, speed: 0 }, circ: [-0.6, 1.4], r: 1.4, half: 1.0, front: 2.6, bodies: [], pred: [], ghost: new Map(), prio: -1, driving: false });
  TR.clock = 0;
  TR.jam = 0; // smoothed share of moving-traffic road users currently stuck in a queue
  TR.prepass = function () {
    TR.clock += WT.sim.dt;
    TR.grid.clear();
    let nDrive = 0, nStuck = 0;
    for (const v of TR.vehicles) {
      if (v.driving && !v.proxyOf && /En route|Leaving|Passing|Departing/.test(v.status || '')) { nDrive++; if (v.actor.speed < 0.3) nStuck++; }
      if (v.proxyOf) {
        const m = v.proxyOf.mesh;
        if (!m.parent) continue;
        m.getWorldPosition(_fp);
        _ff.set(1, 0, 0).applyQuaternion(m.getWorldQuaternion(new THREE.Quaternion()));
        v.actor.x = _fp.x; v.actor.z = _fp.z; v.actor.h = Math.atan2(_ff.z, _ff.x); v.actor.speed = v.proxyOf.actor.speed;
      }
      const a = v.actor, ch = Math.cos(a.h), sh = Math.sin(a.h);
      v.bodies.length = 0;
      for (const o of v.circ) v.bodies.push(a.x + ch * o, a.z + sh * o);
      v.pred.length = 0;
      if (v.driving && v.path) {
        const ve = Math.max(a.speed, 3.5);
        for (const t of T_PRED) { const p = v.path.at(v.s + ve * t); v.pred.push(p.x, p.z); }
      }
      // class by the vehicle's nose: once the front is in a junction it is committed
      const nose = roadClass(a.x + ch * v.front * 0.8, a.z + sh * v.front * 0.8);
      v.cls = nose === 4 ? 4 : roadClass(a.x, a.z);
      const k = ck(a.x, a.z);
      let l = TR.grid.get(k);
      if (!l) TR.grid.set(k, (l = []));
      l.push(v);
    }
    TR.jam += ((nDrive > 12 ? nStuck / nDrive : 0) - TR.jam) * Math.min(1, WT.sim.dt * 0.08);
    // gate barriers lift for anything approaching
    for (const g of TR.gates) {
      const near = TR.nearby(g.x, g.z, 18, tmpG).some((v) => Math.hypot(v.actor.x - g.x, v.actor.z - g.z) < 17);
      g.open += WT.clamp((near ? 1 : 0) - g.open, -WT.sim.dt * 1.4, WT.sim.dt * 2.2);
      g.arm.rotation.x = -g.open * 1.35;
    }
  };

  function yields(v, o) {
    if (o.yieldTo === v) return false;
    if (o.cls !== v.cls) return o.cls > v.cls;
    return o.prio < v.prio;
  }
  // speed limit imposed by other road users
  TR.limit = function (v) {
    const a = v.actor, ch = Math.cos(a.h), sh = Math.sin(a.h);
    const look = v.front + 10 + a.speed * 2.4;
    let lim = Infinity, blocker = null;
    v.yieldTo = null;
    const samp = tmpB;
    samp.length = 0;
    for (let d = 1.5; d <= look; d += 1.6) { const p = v.path.at(v.s + d); samp.push(p.x, p.z, d); }
    const now = TR.clock;
    const others = TR.nearby(a.x + ch * look * 0.5, a.z + sh * look * 0.5, look * 0.5 + 16, tmpA);
    for (const o of others) {
      if (o === v) continue;
      const gh = v.ghost.get(o);
      if (gh && gh > now) continue;
      // (a) somebody's body sits in my lane ahead
      const rr = v.half + o.r + 0.3, rr2 = rr * rr;
      let hit = -1;
      for (let k = 0; k < samp.length && hit < 0; k += 3) {
        for (let q = 0; q < o.bodies.length; q += 2) {
          const dx = samp[k] - o.bodies[q], dz = samp[k + 1] - o.bodies[q + 1];
          if (dx * dx + dz * dz < rr2) { hit = samp[k + 2]; break; }
        }
      }
      if (hit >= 0) {
        // a truck manoeuvring onto a reverse dock claims room behind it
        const gap = o.yieldGap && Math.cos(a.h - o.actor.h) > 0.5 ? o.yieldGap : 1.6;
        // mutual blockage (each in the other's path): the vehicle with right of way keeps going
        let mutual = false;
        if (o.pred.length && Math.cos(a.h - o.actor.h) < 0.7) {
          for (let i = 0; i < o.pred.length && !mutual; i += 2) for (let q = 0; q < v.bodies.length; q += 2) {
            const dx = o.pred[i] - v.bodies[q], dz = o.pred[i + 1] - v.bodies[q + 1];
            if (dx * dx + dz * dz < rr2) { mutual = true; break; }
          }
        }
        if (mutual && !yields(v, o)) continue;
        const l = Math.sqrt(2 * DEC * Math.max(0, hit - v.front - gap));
        if (l < lim) { lim = l; blocker = o; }
        continue;
      }
      // (b) predicted crossing conflict
      if (!o.pred.length || !v.pred.length) continue;
      // followers never make me yield; leaders were handled by the lane check above
      const relx = o.actor.x - a.x, relz = o.actor.z - a.z;
      if (Math.cos(a.h - o.actor.h) > 0.8 && relx * ch + relz * sh < 0) continue;
      for (let i = 0; i < v.pred.length; i += 2) {
        const dx = v.pred[i] - o.pred[i], dz = v.pred[i + 1] - o.pred[i + 1];
        if (dx * dx + dz * dz < 4.4 * 4.4) {
          if (yields(v, o)) {
            const dC = Math.max(a.speed, 3.5) * T_PRED[i >> 1];
            const l = Math.sqrt(2 * DEC * Math.max(0, dC - v.front - 3.5));
            if (l < lim) { lim = l; blocker = o; v.yieldTo = o; }
          }
          break;
        }
      }
    }
    v.blocker = blocker;
    return lim;
  };

  /* ================= junction signals ================= */
  class Junction {
    constructor(x) {
      this.x = x;
      this.state = 'hwG';
      this.t = 0;
      this.demand = { hw: 0, av: 0 }; // vehicles approaching each axis (counted per frame)
      this.q = { hw: 0, av: 0 };
      this.occ = new Map(); // vehicles inside the box -> their stop record (approach + movement)
      const mk = (c) => new T.MeshBasicMaterial({ color: c });
      this.mats = { hw: [mk(0x40121a), mk(0x40351a), mk(0x1a4026)], av: [mk(0x40121a), mk(0x40351a), mk(0x1a4026)] };
      const g = new T.Group();
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const p = M.signalPole(this.mats, sx < 0 ? Math.PI : 0, sz < 0 ? Math.PI / 2 : -Math.PI / 2);
        p.position.set(x + sx * 9.5, 0, sz * 9.5);
        g.add(p);
      }
      const bars = [];
      for (const s of [-1, 1]) {
        W.dashLine(bars, x + s * 9.2, s > 0 ? -6.2 : 0.2, x + s * 9.2, s > 0 ? -0.2 : 6.2, 6, 0, 0.6);
        W.dashLine(bars, s > 0 ? x - 5.6 : x + 0.2, s * 9.2, s > 0 ? x - 0.2 : x + 5.6, s * 9.2, 5.4, 0, 0.6);
      }
      const zebra = [];
      for (const s of [-1, 1]) for (let k = -5; k <= 5; k += 1.4) zebra.push({ x: x + k, z: s * 11.5, len: 0.7, w: 2.6 });
      W.dashes(g, bars, 0xffffff, 0.06);
      W.dashes(g, zebra, 0xf8f9ff, 0.058);
      WT.scene.add(g);
      this.paint();
    }
    go(s) { this.state = s; this.t = 0; this.paint(); }
    paint() {
      const on = { R: [0xff3b4b, 0x40351a, 0x1a4026], Y: [0x40121a, 0xffc93c, 0x1a4026], G: [0x40121a, 0x40351a, 0x3ddc84] };
      const hw = this.state === 'hwG' ? 'G' : this.state === 'hwY' ? 'Y' : 'R';
      const av = this.state === 'avG' ? 'G' : this.state === 'avY' ? 'Y' : 'R';
      this.mats.hw.forEach((m, i) => m.color.setHex(on[hw][i]));
      this.mats.av.forEach((m, i) => m.color.setHex(on[av][i]));
    }
    // queue-actuated: each green runs while its own queue is draining, longer for longer queues,
    // and hands over as soon as it is empty and the cross street is waiting
    update(dt) {
      this.t += dt;
      const s = this.state, q = this.q;
      // smoothed queue counts from last frame's approach tally
      for (const k of ['hw', 'av']) { q[k] += (this.demand[k] - q[k]) * Math.min(1, dt * 2); this.demand[k] = 0; }
      const maxG = (own, other) => WT.clamp(6 + own * 2.2 - other * 0.4, 9, 36);
      if (s === 'hwG' && this.t > 9 && q.av > 0.3 && (q.hw < 0.3 || this.t > maxG(q.hw, q.av))) this.go('hwY');
      else if (s === 'hwY' && this.t > 2.2) this.go('R1');
      else if (s === 'R1' && this.t > 1.3) this.go('avG');
      else if (s === 'avG' && this.t > 5 && (q.av < 0.3 || (q.hw > 0.3 && this.t > maxG(q.av, q.hw)))) this.go('avY');
      else if (s === 'avY' && this.t > 2.2) this.go('R2');
      else if (s === 'R2' && this.t > 1.3) this.go('hwG');
    }
  }
  TR.addJunction = (x) => { if (!TR.junctions.find((j) => j.x === x)) TR.junctions.push(new Junction(x)); };
  // where along a path do we enter a junction box, and along which axis
  function stopsFor(path) {
    const out = [];
    for (const j of TR.junctions) {
      const x0 = j.x - 8.6, x1 = j.x + 8.6, z0 = -8.6, z1 = 8.6;
      for (let i = 1; i < path.pts.length; i++) {
        const [ax, az] = path.pts[i - 1], [bx, bz] = path.pts[i];
        if (ax > x0 && ax < x1 && az > z0 && az < z1) continue;
        const dx = bx - ax, dz = bz - az;
        let t0 = 0, t1 = 1, ok = true;
        for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
          if (Math.abs(p) < 1e-9) { if (q < 0) { ok = false; break; } continue; }
          const r = q / p;
          if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
        }
        if (!ok || t0 > t1) continue;
        const seg = path.cum[i] - path.cum[i - 1];
        const s0 = path.cum[i - 1] + seg * t0;
        // exact point where the path leaves the box (same segment, or a later one)
        let exit = t1 < 1 ? path.cum[i - 1] + seg * t1 : path.len;
        if (t1 >= 1) for (let q = i + 1; q < path.pts.length; q++) {
          const [qx, qz] = path.pts[q - 1], [rx, rz] = path.pts[q];
          const ex = rx - qx, ez = rz - qz;
          let u1 = 1;
          for (const [p, qq] of [[-ex, qx - x0], [ex, x1 - qx], [-ez, qz - z0], [ez, z1 - qz]]) {
            if (Math.abs(p) < 1e-9) continue;
            const r = qq / p;
            if (p > 0 && r < u1) u1 = r;
          }
          if (u1 < 1) { exit = path.cum[q - 1] + (path.cum[q] - path.cum[q - 1]) * Math.max(0, u1); break; }
        }
        const axis = Math.abs(dx) > Math.abs(dz) ? 'hw' : 'av';
        // straight through or turning? compare heading entering vs leaving the box
        const pe = path.at(Math.min(path.len, exit + 2));
        const ain = Math.atan2(dz, dx);
        const turn = Math.abs(WT.angDiff(ain, pe.a)) > 0.5;
        // swept centre-line through the box, used to decide which movements can share it
        const box = [];
        for (let s = s0; s <= exit + 0.01; s += 1.5) { const p = path.at(s); box.push(p.x, p.z); }
        out.push({ s: s0, exit, j, axis, turn, box, key: axis + (axis === 'hw' ? Math.sign(dx) : Math.sign(dz)), done: false, inside: false });
        break;
      }
    }
    return out.sort((p, q) => p.s - q.s);
  }

  // do two movements through a junction box come within a truck-width of each other?
  function crosses(a, b) {
    for (let i = 0; i < a.length; i += 2) for (let k = 0; k < b.length; k += 2) {
      const dx = a[i] - b[k], dz = a[i + 1] - b[k + 1];
      if (dx * dx + dz * dz < 3.6 * 3.6) return true;
    }
    return false;
  }
  // is the stretch [s0, s1] of v's path free of stopped / slow vehicles?
  function roomOn(v, s0, s1) {
    const p0 = v.path.at((s0 + s1) / 2);
    const others = TR.nearby(p0.x, p0.z, (s1 - s0) / 2 + 12, tmpG);
    for (let s = s0; s <= s1; s += 1.6) {
      const p = v.path.at(s);
      for (const o of others) {
        if (o === v || o.actor.speed > 2.5) continue;
        const gh = v.ghost.get(o);
        if (gh && gh > TR.clock) continue;
        const rr = v.half + o.r + 0.2, rr2 = rr * rr;
        for (let q = 0; q < o.bodies.length; q += 2) {
          const dx = p.x - o.bodies[q], dz = p.z - o.bodies[q + 1];
          if (dx * dx + dz * dz < rr2) return o;
        }
      }
    }
    return null;
  }

  /* ================= vehicle driving ================= */
  TR.drive = function* (v, pts, o = {}) {
    const a = v.actor;
    const path = WT.buildPath(pts, o.radius === undefined ? 5 : o.radius);
    v.path = path; v.s = 0; v.driving = true;
    const stops = stopsFor(path);
    const vmax = o.speed || 16, acc = o.accel || 4.5, latA = o.latAccel || 4;
    const fwdFront = v.front;
    if (o.reverse) v.front = v.rear || 7.8; // when backing up, the trailer end leads
    while (v.s < path.len - 0.05) {
      const dt = WT.sim.dt;
      if (dt <= 0) { yield; continue; }
      const rem = path.len - v.s;
      let target = vmax, boxWait = null;
      v.why = null;
      const k = path.maxK(v.s, v.s + 8);
      if (k > 1e-3) target = Math.min(target, Math.max(2.2, Math.sqrt(latA / k)));
      target = Math.min(target, Math.sqrt(2 * DEC * rem) + 0.5);
      for (const st of stops) {
        if (st.done) continue;
        if (st.inside) {
          // released once the whole vehicle has cleared the box
          if (v.s - v.rear > st.exit) { st.j.occ.delete(v); st.done = true; continue; }
          break;
        }
        const d = st.s - v.front - v.s;
        if (d > 80) break;
        if (d < 70) st.j.demand[st.axis]++;
        const need = (a.speed * a.speed) / (2 * DEC * 1.5);
        let stop = false;
        if (st.j.state !== st.axis + 'G' && d > -0.5 && (st.j.state !== st.axis + 'Y' || d > need)) { stop = true; v.why = 'Red light'; }
        // box manager: only enter when nobody from a conflicting approach is inside
        // movements whose swept paths never meet (opposing through traffic, paired right turns) share the box
        if (!stop) for (const [o, os] of st.j.occ) {
          if (o === v || os.key === st.key) continue;
          const gh = v.ghost.get(o);
          if (gh && gh > TR.clock) continue;
          const conflict = crosses(os.box, st.box);
          if (conflict && d > need * 0.6 - 0.5) { stop = true; boxWait = o; v.why = 'Junction busy'; break; }
        }
        // don't block the box: only commit when the whole vehicle fits beyond the exit
        if (!stop && d > need * 0.6 - 0.5 && d < need + 6) {
          const o = roomOn(v, st.exit, Math.min(path.len, st.exit + v.front + (v.rear || 2) + 2.5));
          if (o) { stop = true; boxWait = o; v.why = 'Exit blocked'; }
        }
        if (stop) target = Math.min(target, Math.sqrt(2 * DEC * Math.max(0, d)));
        else if (d < 2.5) { st.inside = true; st.j.occ.set(v, st); }
        break;
      }
      target = Math.min(target, TR.limit(v));
      if (!v.blocker && boxWait) v.blocker = boxWait;
      // deadlock breaker: only for genuine circular waits (or a lane blocked by something parked for ages)
      if (a.speed < 0.3 && target < 0.5 && v.blocker) {
        v.waitT += dt;
        if (v.waitT > 6) {
          let o = v.blocker, cyc = false, parked = false;
          for (let i = 0; i < 8 && o; i++) {
            if (o === v) { cyc = true; break; }
            if (!o.driving) { parked = true; break; }
            o = o.blocker;
          }
          if (cyc || (parked && v.waitT > 30)) {
            if (WT.DEBUG_TRAFFIC) { const b = v.blocker; WT.DEBUG_TRAFFIC.push({ cyc, a: [v.id, Math.round(a.x), Math.round(a.z), v.cls, v.status, !!v.yieldTo], b: [b.id, Math.round(b.actor.x), Math.round(b.actor.z), b.cls, b.status, !!b.yieldTo, b.blocker && b.blocker.id] }); }
            v.ghost.set(v.blocker, TR.clock + 5); v.waitT = 0;
          }
        }
      } else v.waitT = Math.max(0, v.waitT - dt);
      a.speed += WT.clamp(target - a.speed, -DEC * 1.3 * dt, acc * dt);
      if (a.speed < 0) a.speed = 0;
      v.s += a.speed * dt;
      const p = path.at(v.s);
      a.setPose(p.x, p.z, o.reverse ? p.a + Math.PI : p.a, null, dt);
      if (o.onTick) o.onTick(v.s, path);
      yield;
    }
    for (const st of stops) if (st.inside && !st.done) { st.j.occ.delete(v); st.done = true; }
    const p = path.at(path.len);
    a.setPose(p.x, p.z, o.reverse ? p.a + Math.PI : p.a, null, 1);
    a.speed = 0;
    v.driving = false;
    v.front = fwdFront;
  };

  /* ================= vehicles ================= */
  const CIRC = { truck: { circ: [-5.2, -0.6, 3.9], r: 1.9, front: 6.8, rear: 7.8 }, car: { circ: [-1.2, 1.2], r: 1.3, front: 2.4, rear: 2.4 }, bus: { circ: [-4, 0, 4], r: 1.6, front: 5.9, rear: 5.9 } };
  class Truck extends WT.Entity {
    constructor(o) {
      super();
      const cls = o.variant === 'car' ? 'car' : o.variant === 'bus' ? 'bus' : 'truck';
      this.kind = cls;
      this.variant = o.variant || 'box';
      this.carrier = o.carrier || WT.pick(WT.CARRIERS);
      this.id = cls === 'car' ? 'CAR-' + WT.rint(100, 999) : cls === 'bus' ? 'BUS-' + WT.rint(10, 99) : this.variant === 'mixer' ? 'MIX-' + WT.rint(10, 99) : this.variant === 'dump' ? 'DMP-' + WT.rint(10, 99) : WT.nextTruckId();
      this.legs = o.legs || [];
      this.plan = o.plan || null;
      this.spawnX = o.spawnX;
      this.startAt = o.startAt;
      this.from = o.from || (Math.random() < 0.5 ? 'W' : 'E');
      this.to = o.to || (this.legs.length ? (Math.random() < 0.5 ? 'W' : 'E') : this.from === 'W' ? 'E' : 'W');
      this.mission = o.mission || 'Transit';
      this.status = 'En route';
      this.where = 'Highway';
      this.loaded = 0; this.total = 0;
      this.driver = WT.pick(WT.DRIVERS);
      this.trailer = o.trailer || (this.variant === 'flat' ? 'flat' : this.variant === 'tanker' ? 'tanker' : 'box');
      if (cls === 'car') this.mesh = M.carKind(WT.pick(M.CAR_COLORS), o.carKind || WT.pick(M.CAR_KINDS));
      else if (cls === 'bus') this.mesh = M.bus(WT.pick([0x2f56e0, 0x1aa6b7, 0xd9434b]));
      else if (this.variant === 'mixer') this.mesh = M.mixer();
      else this.mesh = M.rig({ cab: this.carrier.cab, stripe: this.carrier.stripe, label: this.carrier.name, trailer: this.variant === 'dump' ? 'dump' : this.trailer, style: Math.random() < 0.4 ? 'conv' : 'cabover' });
      if (!this.mesh.userData.cargo) { const c = new T.Group(); c.position.set(-2, 1.35, 0); this.mesh.add(c); this.mesh.userData.cargo = c; }
      if (o.container) this.load(o.container);
      Object.assign(this, CIRC[cls]);
      this.half = this.mesh.userData.half || 1.7;
      this.bodies = []; this.pred = []; this.ghost = new Map(); this.waitT = 0;
      this.ulds = [];
      this.actor = new WT.Actor('truck', this.mesh, 'road');
      this.actor.entity = this;
      this.prio = this.actor.prio;
      WT.register(this);
      WT.trucks.push(this);
    }
    load(c) {
      this.container = c;
      this.mesh.userData.cargo.add(c.mesh);
      c.mesh.position.set(0, 0, 0); c.mesh.rotation.set(0, 0, 0);
      c.status = 'On truck'; c.loc = this.id;
    }
    radius() { return this.kind === 'car' ? 3 : 8; }
    card() {
      const st = /Load|Unload|Stuff|Destuff|Pump/.test(this.status) && this.total ? `${this.status} ${this.loaded}/${this.total}` : this.status;
      const icon = { car: '🚗', bus: '🚌', mixer: '🚧', dump: '🚧', flat: '🚛', tanker: '🛢️' }[this.kind === 'truck' ? this.variant : this.kind] || '🚚';
      const cargo = this.container ? `${this.container.id} · ${WT.SUP.describe(this.container)}` : this.cargo ? `${WT.SUP.MAT[this.cargo.mat].name} · ${this.cargo.qty} t` : this.total ? `${this.loaded}/${this.total} pallets` : '—';
      return {
        kicker: (this.kind === 'car' ? 'Car' : this.kind === 'bus' ? 'Staff shuttle' : this.variant === 'mixer' ? 'Concrete mixer' : 'Truck · ' + this.trailer) + ' · ' + (this.kind === 'car' ? 'Traffic' : this.carrier.name),
        title: this.id, sub: this.mission, icon, iconBg: '#' + this.carrier.cab.toString(16).padStart(6, '0'),
        status: st, statusTone: WT.toneFor(this.status), where: this.where,
        rows: [['Driver', this.driver], ['Order', this.po ? `${this.po.id} → ${this.po.to.id}` : '—'], ['Cargo', this.ulds.length ? this.ulds.map((u) => u.id).join(', ') + ' · ' + WT.SUP.describe(this.ulds[0]) : cargo], ['Next stops', [...(this.curLeg ? [this.curLeg] : []), ...this.legs].map((l) => l.fac.id).join(' → ') || 'Exit'],
          ['Speed', Math.round(this.actor.speed * 3.6) + ' km/h'], ['Traffic', this.why ? this.why + (this.blocker ? ' · ' + this.blocker.id : '') : this.yieldTo ? 'Yielding to ' + this.yieldTo.id : this.blocker ? 'Queued behind ' + this.blocker.id : 'Clear road'],
          ['Shipment', this.shipment ? '#' + this.shipment.id : '—']],
      };
    }
    label() { return this.id + (this.kind === 'car' ? '' : ' · ' + (this.kind === 'bus' ? 'Shuttle' : this.carrier.name)); }
  }
  WT.Truck = Truck;

  function* despawn(t) {
    TR.remove(t);
    for (const j of TR.junctions) j.occ.delete(t);
    if (t.po && t.po.status !== 'Delivered') WT.SUP.cancel(t.po, 'left the park undelivered');
    for (const u of t.ulds || []) WT.unregister(u);
    yield* WT.tween(0.4, (k) => t.mesh.scale.setScalar(Math.max(0.01, 1 - k)));
    t.actor.remove();
    if (t.container) WT.unregister(t.container);
    WT.unregister(t);
    WT.trucks.splice(WT.trucks.indexOf(t), 1);
  }
  const clearAt = (x, z, r) => !TR.nearby(x, z, r, tmpA).some((v) => Math.hypot(v.actor.x - x, v.actor.z - z) < r);
  WT.runTruck = function* (t) {
    const a = t.actor;
    let sp, pos;
    if (t.spawnX !== undefined) {
      const tx = t.legs.length ? t.legs[0].fac.gateIn.A : 0, dir = Math.sign(tx - t.spawnX) || 1;
      sp = [t.spawnX, dir * W.HW_LANE];
      pos = { hw: t.spawnX };
      a.place(sp[0], sp[1], dir > 0 ? 0 : Math.PI);
    } else {
      sp = W.spawnPoint(t.from);
      pos = { edge: t.from };
      a.place(sp[0], sp[1], t.from === 'W' ? 0 : Math.PI);
    }
    let based = false;
    if (t.startAt) {
      // plant-based shuttle: starts parked at its bay
      const leg = t.legs[0], ip = leg.fac.inPath(leg.dock), p1 = ip[ip.length - 1], p0 = ip[ip.length - 2];
      a.place(p1[0], p1[1], Math.atan2(p1[1] - p0[1], p1[0] - p0[0]));
      based = true;
    } else {
      t.status = 'Waiting to enter';
      TR.spawnT = TR.spawnT || {};
      let tries = 0, sk = '';
      // join the highway at a gap in traffic; if the entry is jammed try another one
      while (true) {
        sk = Math.round(sp[0] / 20) + ':' + Math.sign(sp[1]);
        if (clearAt(sp[0], sp[1], 17) && WT.sim.minutes - (TR.spawnT[sk] || -1) > 0.32) break;
        tries++;
        yield* WT.sleep(0.5);
        if (tries % 4 === 0) {
          const dir = Math.sign(sp[1]);
          if (t.spawnX !== undefined) sp = [t.spawnX + WT.rnd(-260, 260), sp[1]];
          else sp = [sp[0] - dir * WT.rnd(0, 60), sp[1]];
          pos = t.spawnX !== undefined ? { hw: sp[0] } : pos;
          a.place(sp[0], sp[1], dir > 0 ? 0 : Math.PI);
        }
      }
      TR.spawnT[sk] = WT.sim.minutes;
    }
    TR.add(t);
    WT.scene.add(t.mesh);
    t.mesh.scale.setScalar(0.01);
    WT.spawn(WT.tween(0.5, (k) => t.mesh.scale.setScalar(Math.max(0.01, k))));
    const opts = { speed: t.kind === 'car' ? 21 : 17 };
    let first = true;
    while (true) {
      let leg = t.legs.shift();
      if (!leg && t.plan) { const more = t.plan(t); t.plan = null; if (more) { t.legs.push(...more); leg = t.legs.shift(); } }
      if (!leg) break;
      t.curLeg = leg;
      t.status = 'En route';
      t.where = '→ ' + leg.fac.id;
      if (based && first) {
        first = false;
        yield* leg.fac.serve(t, leg);
        t.status = 'Departing';
        let rel0 = false;
        yield* TR.drive(t, [[a.x, a.z], ...leg.fac.outPath(leg.dock)], Object.assign({}, opts, { onTick: (s) => { if (!rel0 && s > 18) { leg.fac.release(leg.dock); rel0 = true; } } }));
        if (!rel0) leg.fac.release(leg.dock);
        pos = leg.fac.gateOut;
        t.curLeg = null;
        continue;
      }
      first = false;
      let pre = [[a.x, a.z], ...W.route(pos, leg.fac.gateIn)];
      let skip = 0;
      if (!leg.dock && leg.lazy) {
        // appointment: drive to the gate (or the plant's staging lane), queue, take the next free bay
        if (leg.fac.stagePath) { pre.push(...leg.fac.stagePath()); skip = leg.fac.stageSkip || 0; }
        yield* TR.drive(t, pre, opts);
        pre = [[a.x, a.z]];
        t.status = 'Queued at gate';
        t.driving = true;
        yield* WT.waitFor(() => (leg.dock = leg.fac.reserve(leg.op)));
        t.driving = false;
        leg.fac.lazyN = Math.max(0, (leg.fac.lazyN || 0) - 1);
      } else if (!leg.dock) { leg.dock = leg.fac.reserve(leg.op); if (!leg.dock) { t.curLeg = null; continue; } }
      const ip = leg.fac.inPath(leg.dock).slice(skip), gk = skip ? undefined : leg.fac.gateIdx;
      const willReverse = !!(leg.fac.dockPath && leg.fac.dockPath(leg.dock));
      if (gk !== undefined) {
        // terminal gate: stop under the OCR portal for the gate-in check
        yield* TR.drive(t, [...pre, ...ip.slice(0, gk + 1)], opts);
        t.status = 'Gate-in · OCR + seal check';
        t.driving = true;
        yield* WT.sleep(1.6);
        t.driving = false;
        yield* TR.drive(t, [[a.x, a.z], ...ip.slice(gk + 1)], opts);
      } else {
        if (willReverse) {
          // drive to the plant gate normally, then claim manoeuvring room on the apron lane
          const k = ip.length > 2 ? 1 : 0;
          yield* TR.drive(t, [...pre, ...ip.slice(0, k + 1)], opts);
          t.yieldGap = 16;
          yield* TR.drive(t, [[a.x, a.z], ...ip.slice(k + 1)], { speed: 8 });
        } else yield* TR.drive(t, [...pre, ...ip], opts);
      }
      const dp = leg.fac.dockPath && leg.fac.dockPath(leg.dock);
      if (dp) {
        // pull past the bay, then reverse in so the doors meet the dock
        t.status = 'Reversing onto dock';
        yield* TR.drive(t, [[a.x, a.z], ...dp], { speed: 3.2, accel: 2, radius: 6, latAccel: 2.5, reverse: true });
      }
      t.yieldGap = 0;
      yield* leg.fac.serve(t, leg);
      t.status = 'Departing';
      let released = false;
      yield* TR.drive(t, [[a.x, a.z], ...leg.fac.outPath(leg.dock)], Object.assign({}, opts, { onTick: (s) => { if (!released && s > 18) { leg.fac.release(leg.dock); released = true; } } }));
      if (!released) leg.fac.release(leg.dock);
      pos = leg.fac.gateOut;
      t.curLeg = null;
      if (t.shipment && t.shipment.stage < 3 && leg.op === 'load') WT.advanceShipment(t.shipment, 3);
    }
    t.status = t.busy ? 'Leaving park' : 'Passing through';
    t.where = 'Highway';
    // finished work: head for the nearest way out rather than across the whole park
    if (t.busy) t.to = a.x < 0 ? 'W' : 'E';
    yield* TR.drive(t, [[a.x, a.z], ...W.route(pos, { edge: t.to })], opts);
    yield* despawn(t);
  };

  /* ================= ambient traffic ================= */
  WT.startTraffic = function () {
    WT.spawn((function* () {
      while (true) {
        const n = WT.trucks.filter((t) => !t.busy).length;
        if (n < 8 + Math.floor(WT.facilities.length / 9) && TR.jam < 0.35) {
          const r = Math.random();
          const stops = WT.facilities.filter((f) => f.type === 'Truck stop' && f.active && f.freeDocks('rest'));
          const hq = WT.facilities.filter((f) => (f.type === 'Headquarters' || f.type === 'Parking') && f.active && f.freeDocks('board'));
          let t;
          if (r < 0.14 && stops.length) t = new Truck({ variant: 'box', trailer: WT.pick(['box', 'curtain', 'tanker', 'logs', 'coil', 'reefer']), mission: 'Rest + refuel', legs: [{ fac: WT.pick(stops), op: 'rest' }] });
          else if (r < 0.22 && hq.length) t = new Truck({ variant: 'bus', mission: 'Staff shuttle', legs: [{ fac: WT.pick(hq), op: 'board' }] });
          else if (r < 0.64) t = new Truck({ variant: 'car', mission: 'Commuter traffic' });
          else t = new Truck({ variant: 'box', trailer: WT.pick(['box', 'curtain', 'tanker', 'reefer', 'logs', 'coil', 'flat']), mission: 'Through freight' });
          for (const l of t.legs) l.dock = l.fac.reserve(l.op);
          if (t.legs.some((l) => !l.dock)) { t.legs.forEach((l) => l.dock && l.fac.release(l.dock)); t.legs = []; }
          WT.spawn(WT.runTruck(t));
        }
        yield* WT.sleep(WT.rnd(0.9, 2.6));
      }
    })());
    WT.on('frame', () => { for (const j of TR.junctions) j.update(WT.sim.dt); TR.prepass(); });
  };
})();
