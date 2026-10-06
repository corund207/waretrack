/* WareTrack – core utilities: sim clock, coroutines, path following, entity registry */
(function () {
  const WT = (window.WT = {});
  WT.VERSION = '5.1.0';
  WT.BUILD = 'dev'; // replaced with the commit hash by scripts/build.mjs

  WT.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  WT.lerp = (a, b, t) => a + (b - a) * t;
  WT.rnd = (a, b) => a + Math.random() * (b - a);
  WT.rint = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  WT.pick = (a) => a[Math.floor(Math.random() * a.length)];
  WT.ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  WT.angDiff = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  /* ---------- sim clock ---------- */
  WT.sim = { speed: 1, paused: false, dt: 0, minutes: 9 * 60 + 42, MIN_PER_SEC: 0.5 };
  WT.secToMin = (s) => s * WT.sim.MIN_PER_SEC;
  WT.fmtTime = (m) => {
    m = ((m % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
  };

  /* ---------- tiny event bus ---------- */
  const handlers = {};
  WT.on = (ev, fn) => (handlers[ev] = handlers[ev] || []).push(fn);
  WT.emit = (ev, ...a) => (handlers[ev] || []).forEach((f) => f(...a));

  /* ---------- coroutines (generators advanced with sim.dt) ---------- */
  WT.tasks = [];
  WT.spawn = (gen) => { WT.tasks.push(gen); return gen; };
  WT.stepTasks = () => {
    for (let i = WT.tasks.length - 1; i >= 0; i--) {
      try {
        if (WT.tasks[i].next().done) WT.tasks.splice(i, 1);
      } catch (e) {
        console.error(e);
        WT.tasks.splice(i, 1);
      }
    }
  };
  WT.sleep = function* (sec) {
    let t = 0;
    while (t < sec) { t += WT.sim.dt; yield; }
  };
  WT.waitFor = function* (fn) { while (!fn()) yield; };
  WT.tween = function* (sec, fn) {
    let t = 0;
    while (t < sec) { t += WT.sim.dt; fn(Math.min(1, t / sec)); yield; }
    fn(1);
  };

  /* ---------- entity registry ---------- */
  WT.entities = new Map();
  WT.pickables = new Set();
  let uid = 1;
  WT.register = (e) => {
    e.uid = e.uid || 'e' + uid++;
    WT.entities.set(e.uid, e);
    if (e.mesh) {
      e.mesh.userData.entityId = e.uid;
      if (e.pickable !== false) WT.pickables.add(e.mesh);
    }
    return e;
  };
  WT.unregister = (e) => {
    WT.entities.delete(e.uid);
    if (e.mesh) WT.pickables.delete(e.mesh);
    if (WT.selected === e) WT.select(null);
  };
  WT.findEntity = (obj) => {
    while (obj) {
      if (obj.userData && obj.userData.entityId) return WT.entities.get(obj.userData.entityId);
      obj = obj.parent;
    }
    return null;
  };

  /* ---------- log / notifications ---------- */
  WT.events = [];
  WT.log = (msg, tone = 'info', toast = false) => {
    const ev = { msg, tone, t: WT.sim.minutes, unread: true };
    WT.events.unshift(ev);
    if (WT.events.length > 60) WT.events.pop();
    WT.emit('log', ev, toast);
  };

  /* ---------- paths ---------- */
  // pts: [[x,z],...]; rounds corners with quadratic curves of radius r.
  WT.buildPath = function (pts, r = 4) {
    const out = [[pts[0][0], pts[0][1]]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      if (l1 < 1e-6 || l2 < 1e-6) continue;
      const d1 = [(p1[0] - p0[0]) / l1, (p1[1] - p0[1]) / l1];
      const d2 = [(p2[0] - p1[0]) / l2, (p2[1] - p1[1]) / l2];
      const dot = WT.clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1);
      const phi = Math.acos(dot);
      if (phi < 0.02) { out.push([p1[0], p1[1]]); continue; }
      let t = Math.min(r * Math.tan(phi / 2), l1 * 0.5, l2 * 0.5);
      const a = [p1[0] - d1[0] * t, p1[1] - d1[1] * t];
      const b = [p1[0] + d2[0] * t, p1[1] + d2[1] * t];
      const N = 10;
      for (let k = 0; k <= N; k++) {
        const u = k / N, w = 1 - u;
        out.push([w * w * a[0] + 2 * w * u * p1[0] + u * u * b[0], w * w * a[1] + 2 * w * u * p1[1] + u * u * b[1]]);
      }
    }
    out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
    const cum = [0], ang = [], kap = [];
    for (let i = 1; i < out.length; i++) {
      const dx = out[i][0] - out[i - 1][0], dz = out[i][1] - out[i - 1][1];
      cum.push(cum[i - 1] + Math.hypot(dx, dz));
      ang.push(Math.atan2(dz, dx));
    }
    ang.push(ang[ang.length - 1] || 0);
    for (let i = 0; i < out.length; i++) {
      const j = Math.min(i + 1, out.length - 1), k = Math.max(i - 1, 0);
      const ds = Math.max(cum[j] - cum[k], 1e-4);
      kap.push(Math.abs(WT.angDiff(ang[k], ang[j])) / ds);
    }
    const path = { pts: out, cum, ang, kap, len: cum[cum.length - 1] };
    path.at = (s) => {
      s = WT.clamp(s, 0, path.len);
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
      const seg = cum[hi] - cum[lo] || 1, u = (s - cum[lo]) / seg;
      return { x: out[lo][0] + (out[hi][0] - out[lo][0]) * u, z: out[lo][1] + (out[hi][1] - out[lo][1]) * u, a: ang[lo] };
    };
    path.maxK = (s0, s1) => {
      let m = 0;
      for (let i = 0; i < cum.length; i++) if (cum[i] >= s0 && cum[i] <= s1) m = Math.max(m, kap[i]);
      return m;
    };
    return path;
  };

  /* ---------- actors ---------- */
  WT.actors = [];
  let prio = 0;
  class Actor {
    constructor(kind, mesh, group) {
      this.kind = kind; this.mesh = mesh; this.group = group || kind;
      this.x = 0; this.z = 0; this.y = 0; this.h = 0; this.speed = 0;
      this.prio = prio++; this.blockedT = 0;
      WT.actors.push(this);
    }
    place(x, z, h) { this.x = x; this.z = z; if (h !== undefined) this.h = h; this.sync(); }
    sync() {
      this.mesh.position.set(this.x, this.y, this.z);
      this.mesh.rotation.y = -this.h;
    }
    setPose(x, z, ang, turnRate, dt) {
      this.x = x; this.z = z;
      if (turnRate) {
        const d = WT.angDiff(this.h, ang), m = turnRate * dt;
        this.h += Math.abs(d) < m ? d : Math.sign(d) * m;
      } else this.h = ang;
      this.sync();
    }
    remove() {
      const i = WT.actors.indexOf(this);
      if (i >= 0) WT.actors.splice(i, 1);
      if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
    }
  }
  WT.Actor = Actor;

  // Should `a` yield to another actor ahead of it?
  function blockedBy(a, o) {
    const gap = o.avoidGap || a.avoidGap || 8;
    for (const b of WT.actors) {
      if (b === a || b.ghost || b.scope !== a.scope) continue;
      const same = b.group === a.group;
      if (!same && !(o.groups && o.groups.includes(b.group))) continue;
      if (same && b.prio > a.prio) continue;
      if (!same && b.speed < 0.3 && !o.yieldStopped) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d > gap || d < 1e-3) continue;
      const dir = o.dirAngle;
      const fx = Math.cos(dir), fz = Math.sin(dir);
      const along = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
      if (along > 0 && lat < (o.avoidLat || 3.6)) return Math.max(0, along - (o.avoidMin || 5));
    }
    return -1;
  }

  // Drive an actor along a rounded path. o: speed, accel, radius, turnRate, avoid, reverse, endSpeed, onTick
  WT.drive = function* (actor, pts, o = {}) {
    const path = WT.buildPath(pts, o.radius === undefined ? 4 : o.radius);
    const vmax = o.speed || 10, acc = o.accel || 7, dec = o.decel || acc * 1.4;
    const latA = o.latAccel || 7;
    let s = 0;
    actor.blockedT = 0;
    while (s < path.len - 0.03) {
      const dt = WT.sim.dt;
      if (dt <= 0) { yield; continue; }
      const rem = path.len - s;
      let target = vmax;
      const k = path.maxK(s, s + 7);
      if (k > 1e-3) target = Math.min(target, Math.max(2.2, Math.sqrt(latA / k)));
      target = Math.min(target, Math.sqrt(2 * dec * rem) + (o.endSpeed || 0) + 0.4);
      let blocked = false;
      if (o.hold && o.hold()) { target = 0; blocked = true; }
      if (o.avoid && actor.blockedT < 14) {
        const p = path.at(s + 0.5);
        const room = blockedBy(actor, { groups: o.groups, dirAngle: p.a, avoidLat: o.avoidLat, avoidMin: o.avoidMin, avoidGap: o.avoidGap });
        if (room >= 0) { target = Math.min(target, Math.sqrt(2 * dec * room)); blocked = true; }
      }
      actor.blockedT = blocked ? actor.blockedT + dt : Math.max(0, actor.blockedT - dt * 2);
      actor.speed += WT.clamp(target - actor.speed, -dec * dt, acc * dt);
      if (!blocked && actor.speed < 0.6 && rem > 0.1) actor.speed = 0.6;
      s += actor.speed * dt;
      const p = path.at(s);
      actor.setPose(p.x, p.z, o.reverse ? p.a + Math.PI : p.a, o.turnRate, dt);
      if (o.onTick) o.onTick(s, path, p);
      yield;
    }
    const p = path.at(path.len);
    actor.setPose(p.x, p.z, o.reverse ? p.a + Math.PI : p.a, o.turnRate, 99);
    actor.speed = 0;
  };

  // rotate in place to a heading
  WT.turnTo = function* (actor, ang, rate = 4) {
    while (Math.abs(WT.angDiff(actor.h, ang)) > 0.03) {
      const d = WT.angDiff(actor.h, ang), m = rate * WT.sim.dt;
      actor.h += Math.abs(d) < m ? d : Math.sign(d) * m;
      actor.sync();
      yield;
    }
    actor.h = ang; actor.sync();
  };

  // straight move forward/back along current heading
  WT.nudge = function* (actor, dist, speed = 3) {
    const dir = Math.sign(dist) || 1, total = Math.abs(dist);
    let done = 0;
    while (done < total) {
      const step = Math.min(total - done, speed * WT.sim.dt);
      actor.x += Math.cos(actor.h) * step * dir;
      actor.z += Math.sin(actor.h) * step * dir;
      done += step;
      actor.sync();
      yield;
    }
  };
})();
