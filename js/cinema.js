/* WareTrack – autonomous cinematic camera */
(function () {
  const C = (WT.Cinema = { on: true, resumeAt: 0, shot: null, left: 0, events: [], spin: 0.03 });
  const now = () => performance.now() / 1000;

  WT.on('event', (e) => {
    e.at = now();
    C.events.push(e);
    if (C.events.length > 30) C.events.shift();
  });
  C.userInput = () => { C.resumeAt = now() + 30; };
  C.idleLeft = () => Math.max(0, Math.ceil(C.resumeAt - now()));
  C.active = () => C.on && now() >= C.resumeAt;
  C.toggle = (v) => { C.on = v === undefined ? !C.on : v; C.resumeAt = 0; C.left = 0; WT.emit('cinema'); };

  function builtBounds() {
    const xs = [], zs = [];
    for (const f of WT.facilities) { const c = f.center(); xs.push(c[0]); zs.push(c[1]); }
    if (!xs.length) return { cx: -60, cz: -80, ext: 200 };
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ext: Math.max(x1 - x0, (z1 - z0) * 1.6, 160) };
  }
  const alive = (e) => e && WT.entities.has(e.uid) && e.mesh && e.mesh.parent;
  function shotFor(e) {
    const ent = e.ent;
    switch (e.kind) {
      case 'construct': case 'built': {
        if (!alive(ent)) return null;
        const c = ent.center();
        return { kind: e.kind, x: c[0], z: c[1], size: Math.max(120, ent.radius() * 2.6), dur: e.kind === 'built' ? 10 : 12, sel: ent, pitch: 0.62 };
      }
      case 'plane': return alive(ent) ? { kind: 'follow', ent, size: 150, dur: 14, pitch: 0.5 } : null;
      case 'train': return alive(ent) ? { kind: 'follow', ent, size: 150, dur: 12, pitch: 0.58 } : null;
      case 'ship': return alive(ent) ? { kind: 'follow', ent, size: 190, dur: 12, pitch: 0.6 } : null;
      case 'rail-build': return WT.W.railLayer ? { kind: 'follow-obj', obj: WT.W.railLayer, size: 140, dur: 12, pitch: 0.55 } : null;
    }
    return null;
  }
  function filler() {
    const r = Math.random();
    const trucks = WT.trucks.filter((t) => t.legs.length && t.actor.speed > 3 && t.variant !== 'car');
    const facs = WT.facilities.filter((f) => f.active);
    const factories = facs.filter((f) => f.type === 'Factory');
    const building = WT.G.projects.filter((p) => p.fac && p.stage !== 'Online' && p.stage !== 'Queued');
    if (building.length && r < 0.25) {
      const f = WT.pick(building).fac, c = f.center();
      return { kind: 'construct', x: c[0], z: c[1], size: Math.max(110, f.radius() * 2.4), dur: 10, sel: f, pitch: 0.6 };
    }
    if (r < 0.45 && trucks.length) {
      // favour the interesting rigs: container drayage, tankers, log + coil haulers
      const fun = trucks.filter((t) => t.container || t.trailer !== 'box');
      return { kind: 'follow', ent: WT.pick(fun.length && Math.random() < 0.75 ? fun : trucks), size: 70, dur: 12, pitch: 0.55 };
    }
    if (r < 0.62 && factories.length) {
      const f = WT.pick(factories), c = f.toWorld(40, 0);
      return { kind: 'spot', x: c[0], z: c[1], size: 75, dur: 11, sel: f, pitch: 0.68 };
    }
    if (r < 0.8 && facs.length) {
      const f = WT.pick(facs), c = f.center();
      return { kind: 'spot', x: c[0], z: c[1], size: Math.max(100, f.radius() * 2.2), dur: 10, sel: f, pitch: 0.6 };
    }
    const b = builtBounds();
    return { kind: 'overview', x: b.cx, z: b.cz, size: WT.clamp(b.ext * 1.25, 260, 1300), dur: 14, pitch: 0.72 };
  }
  function pickShot() {
    const t = now();
    const fresh = C.events.filter((e) => !e.used && t - e.at < 25).sort((a, b) => b.weight - a.weight || b.at - a.at);
    for (const e of fresh) {
      e.used = true;
      const s = shotFor(e);
      if (s) { s.event = true; return s; }
    }
    return filler();
  }
  function apply(s) {
    C.shot = s;
    C.left = s.dur;
    C.spin = (Math.random() < 0.5 ? -1 : 1) * WT.rnd(0.025, 0.05);
    if (s.kind === 'follow') {
      WT.select(s.ent, false, true);
      const p = s.ent.pos();
      WT.camGoal({ x: p.x, z: p.z, size: s.size, pitch: s.pitch });
      WT.follow = s.ent;
    } else if (s.kind === 'follow-obj') {
      WT.follow = null;
      WT.select(null);
    } else {
      WT.follow = null;
      WT.select(s.sel || null, false, true);
      WT.camGoal({ x: s.x, z: s.z, size: s.size, pitch: s.pitch });
    }
  }
  C.update = (realDt) => {
    if (!C.active()) return;
    C.left -= realDt;
    const s = C.shot;
    const urgent = C.events.some((e) => !e.used && e.weight >= 3 && now() - e.at < 8);
    const lost = s && s.kind === 'follow' && !alive(s.ent);
    if (!s || C.left <= 0 || lost || (urgent && (!s.event || (s.kind !== 'built' && C.left < s.dur - 4)))) apply(pickShot());
    if (C.shot && C.shot.kind === 'follow-obj' && C.shot.obj) {
      const o = C.shot.obj;
      if (!o.parent) { C.left = 0; return; }
      WT.camGoal({ x: o.position.x, z: o.position.z, size: C.shot.size, pitch: C.shot.pitch });
    }
    WT.camGoal({ yawDelta: C.spin * realDt });
  };
})();
