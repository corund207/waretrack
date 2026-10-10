/* WareTrack – multi-crane container terminals: the shared engine behind the rail yards and the seaport.
   Two or more cranes share one pair of rails, each working its own stretch of yard between moving split lines. Trucks use a service lane with spots beside a bypass lane, so they can pass
   each other. Every lift is planned ahead: the spot is picked next to the truck's box, the crane starts as soon as
   the truck clears the gate, and boxes still on a train or ship go straight from wagon or deck onto the truck. */
(function () {
  const T = THREE;

  /* ================= crane motion ================= */
  const CR = (WT.CraneOps = {});
  CR.setC = (c, tx, hy) => { c.tx = tx; c.hy = hy; c.set(tx, hy); };
  CR.hoist = function* (c, hy, v = 6) {
    const h0 = c.hy, dur = Math.abs(hy - h0) / v;
    if (dur > 0.01) yield* WT.tween(dur, (t) => CR.setC(c, c.tx, WT.lerp(h0, hy, WT.ease(t))));
  };
  CR.travel = function* (c, gx, tx, v = 6) {
    const g0 = c.group.position.x, t0 = c.tx;
    const dur = Math.max(Math.abs(gx - g0) / v, Math.abs(tx - t0) / (v * 1.3), 0.2);
    yield* WT.tween(dur, (t) => {
      const e = WT.ease(t);
      c.group.position.x = WT.lerp(g0, gx, e);
      CR.setC(c, WT.lerp(t0, tx, e), c.hy);
    });
  };
  CR.grab = (c, mesh) => {
    c.spreader.add(mesh);
    mesh.position.set(0, -2.95, 0);
    mesh.rotation.set(0, c.carryRot, 0);
    mesh.scale.set(1, 1, 1);
    c.carry = mesh;
  };
  CR.release = (c) => {
    const m = c.carry;
    WT.scene.attach(m);
    c.carry = null;
    return m;
  };
  // One fluid motion, like a crane driver works: lift clear, run gantry and trolley together while still rising,
  // and start lowering on the way in. `clr` is the cruise height that clears every stack.
  CR.transfer = function* (c, gx, tx, hEnd, clr, v = 6) {
    const g0 = c.group.position.x, t0 = c.tx, h0 = c.hy, hv = v * 0.85;
    const horiz = Math.max(Math.abs(gx - g0), Math.abs(tx - t0) / 1.3);
    if (horiz < 0.05) {
      const d = Math.abs(hEnd - h0) / hv;
      if (d > 0.01) yield* WT.tween(d, (k) => CR.setC(c, c.tx, WT.lerp(h0, hEnd, WT.ease(k))));
      CR.setC(c, tx, hEnd);
      return;
    }
    const top = Math.max(clr, h0, hEnd);
    const tUp = (top - h0) / hv, tDn = (top - hEnd) / hv, tH = horiz / v + 0.5;
    const s0 = tUp * 0.75, s1 = s0 + tH, dur = Math.max(s1 + tDn * 0.75, tUp, 0.2), dStart = dur - tDn;
    yield* WT.tween(dur, (k) => {
      const time = k * dur, e = WT.ease(WT.clamp((time - s0) / tH, 0, 1));
      c.group.position.x = WT.lerp(g0, gx, e);
      let h = time < tUp ? WT.lerp(h0, top, WT.ease(time / tUp)) : top;
      if (tDn > 0 && time > dStart) h = Math.min(h, WT.lerp(top, hEnd, WT.ease((time - dStart) / tDn)));
      CR.setC(c, WT.lerp(t0, tx, e), h);
    });
    c.group.position.x = gx;
    CR.setC(c, tx, hEnd);
  };
  // from/to: {x (world gantry position), t (trolley coordinate), top|base}
  CR.move = function* (c, mesh, from, to, safe, v = 6) {
    yield* CR.transfer(c, from.x, from.t, from.top + 0.25, safe, v);
    CR.grab(c, mesh);
    yield* WT.sleep(0.25);
    yield* CR.transfer(c, to.x, to.t, to.base + 2.95, safe, v);
    const m = CR.release(c);
    yield* WT.sleep(0.15);
    return m;
  };

  /* ================= multi-crane terminal ================= */
  const overlaps = (a, c) => a[1] > c.lo && a[0] < c.hi;
  class CraneTerminal extends WT.Facility {
    // lane: { srv, byp, spots: [x…] } — service-lane z, bypass-lane z, spot x positions
    initYard(lane) {
      this.lane = lane;
      this.jobs = [];
      this.pendingPick = 0;
      this.pendingDrop = 0;
      this.directMoves = 0;
      this.docks = lane.spots.map((x, i) => ({ n: i + 1, x, z: lane.srv, truck: null, job: null, ops: ['pick', 'drop'] }));
    }
    // cranes: crane meshes from M.gantry / M.quayCrane, west to east; homes: their parking x (the end cranes park at
    // the ends of the rails); pad: half claim width
    setupCranes(cranes, homes, pad, safe, speed) {
      this.cpad = pad; this.safe = safe; this.cspeed = speed;
      this.cranes = cranes.map((c, i) => {
        Object.assign(c, { id: (this.craneTag || 'CR') + '-' + (i + 1), idx: i, home: homes[i], task: 'Idle', lifts: 0, want: null, prio: 0, waited: 0, busy: false });
        c.group.position.x = c.home;
        c.lo = c.home - pad; c.hi = c.home + pad;
        return c;
      });
      // only neighbours on the rails can ever meet
      this.cranes.forEach((c, i) => { c.west = this.cranes[i - 1] || null; c.east = this.cranes[i + 1] || null; c.nbrs = [c.west, c.east].filter(Boolean); });
      this.splits = homes.slice(1).map((h, i) => (homes[i] + h) / 2);
      this.bias = this.splits.map(() => 0);
      this.crane = this.cranes[0];
    }
    startCranes() {
      this.cranes.forEach((c) => WT.spawn(this.craneWorker(c)));
      WT.on('frame', () => { if (WT.sim.dt > 0) this.updateSplit(WT.sim.dt); });
    }

    /* ----- truck lanes: in along the bypass, across onto a spot, back out onto the bypass ----- */
    // long, gentle lane change, then a straight run-in a trailer-length long so the rig is in line before it stops
    inPath(d) { d = d || this.docks[0]; const L = this.lane, m = L.merge || 20; return [...this.laneIn(), [d.x - 14 - m, L.byp], [d.x - 14, L.srv], [d.x, L.srv]]; }
    outPath(d) { d = d || this.docks[0]; const L = this.lane, m = L.merge || 20; return [[d.x, L.srv], [d.x + 6, L.srv], [d.x + 6 + m, L.byp], ...this.laneOut()]; }
    laneTail() { return { d: 30, v: 6 }; }

    /* ----- yard ----- */
    topOf(s) { return s.items[s.items.length - 1]; }
    isImport(c) { return c && c.contents && c.contents.kind === 'mat'; }
    isFullExport(c) { return c && !this.isImport(c) && c.full; }
    isEmpty(c) { return c && !c.full && !c.contents; }
    stackCount() { return this.slots.reduce((n, s) => n + s.items.length, 0); }
    stackRoom() { return this.slots.length * 2 - this.stackCount(); }
    exportCount() { return this.slots.reduce((n, s) => n + s.items.filter((c) => this.isFullExport(c)).length, 0); }
    importCount() { return this.slots.reduce((n, s) => n + s.items.filter((c) => this.isImport(c)).length, 0); }
    emptyCount() { return this.slots.reduce((n, s) => n + s.items.filter((c) => this.isEmpty(c)).length, 0); }
    findImport(m) {
      for (const s of this.slots) { const c = this.topOf(s); if (c && !c.reserved && this.isImport(c) && c.contents.mat === m) return c; }
      return null;
    }
    // an empty on top of a stack that nobody has claimed yet (for a truck to take to the depot)
    emptyOnTop() {
      for (const s of this.slots) { const c = this.topOf(s); if (c && !s.busy && !c.reserved && !c.lifting && this.isEmpty(c)) return c; }
      return null;
    }
    pickSlot(filter) {
      const c = this.slots.filter((s) => s.items.length && (filter ? filter(this.topOf(s)) : !this.topOf(s).reserved));
      return c.length ? c.reduce((a, b) => (b.items.length > a.items.length ? b : a)) : null;
    }
    containerX(c) { const p = new T.Vector3(); c.mesh.getWorldPosition(p); return p.x; }
    // never stack on a box a truck is coming for (or that is booked), so pickups are always on top
    stackable(s) { return !s.busy && s.items.length < 2 && !(s.items.length && (this.topOf(s).reserved || this.topOf(s).at === this)); }

    /* ----- crane rail claims ----- */
    // a crane works between its neighbours' parking spots, so each can always back off home to make way
    reach(c, x) { const P2 = 2 * this.cpad; return (!c.west || x >= c.west.home + P2) && (!c.east || x <= c.east.home - P2); }
    shrink(c) { const x = c.group.position.x; c.lo = x - this.cpad; c.hi = x + this.cpad; }
    // move just far enough away from neighbour o to clear the stretch it is asking for — never past our own end of the
    // rails, nor into the claim of the crane on our other side
    *makeWay(c, o) {
      const x = c.group.position.x, P = this.cpad, want = o.want;
      if (!want) { yield* WT.sleep(0.1); return; }
      const target = o === c.west ? Math.min(c.east ? c.east.lo - P : c.home, Math.max(x, want[1] + P + 0.5)) : Math.max(c.west ? c.west.hi + P : c.home, Math.min(x, want[0] - P - 0.5));
      if (Math.abs(target - x) < 0.3) { yield* WT.sleep(0.2); return; }
      c.lo = Math.min(x, target) - P; c.hi = Math.max(x, target) + P;
      c.task = 'Making way for ' + o.id;
      yield* CR.transfer(c, target, c.tx, this.safe, this.safe, this.cspeed);
      this.shrink(c);
    }
    *acquire(c, xs, prio) {
      while (true) {
        const x = c.group.position.x, P = this.cpad, lo = Math.min(x, ...xs) - P, hi = Math.max(x, ...xs) + P;
        const hit = c.nbrs.filter((o) => hi > o.lo && lo < o.hi);
        if (!hit.length) { c.lo = lo; c.hi = hi; c.want = null; c.waited = 0; return; }
        if (!c.want) c.waited = 0;
        c.want = [lo, hi]; c.prio = prio;
        c.task = 'Waiting for ' + hit[0].id;
        // both waiting on each other: truck work goes first (ties: the more westerly crane), the other steps aside
        const o = hit.find((o) => o.want && overlaps(o.want, c) && (o.prio > prio || (o.prio === prio && o === c.west)));
        if (o) yield* this.makeWay(c, o);
        else { yield* WT.sleep(0.1); c.waited += 0.1; }
      }
    }

    /* ----- jobs -----
       job.plan(crane) → a lift, null (not now / not this crane) or 'skip' (nothing left to do).
       lift: { fx, tx, from(), to(), mesh(), slot, lock, fromReady(), toReady(), commit(mesh) } */
    addJob(j) { j.done = false; j.since = WT.sim.minutes; j.t0 = WT.TR.clock; this.jobs.push(j); return j; }
    *waitJobs(list) { while (list.some((j) => !j.done)) yield; }

    /* ----- the cranes work as one: moving split lines share the yard between them -----
       With n cranes the n-1 lines sit at the quantiles of all queued work, so each crane gets about an equal share. A
       crane plans only lifts that start and end in its own stretch, so neighbours never meet; a lift that genuinely
       spans two stretches is allowed after a short wait and handled with rail claims. */
    jobX(j) { return j.at !== undefined ? j.at : j.where ? j.where() : undefined; }
    updateSplit(dt) {
      const C = this.cranes, n = C.length, P = this.cpad;
      const xs = this.jobs.map((j) => this.jobX(j)).filter((x) => x !== undefined).sort((a, b) => a - b);
      for (let k = 0; k < n - 1; k++) {
        const w = C[k], e = C[k + 1], mid = (w.home + e.home) / 2;
        let target = mid;
        if (xs.length >= 2) {
          // (k+1)/n of the queue west of this line
          const q = (xs.length * (k + 1)) / n;
          target = (xs[WT.clamp(Math.ceil(q) - 1, 0, xs.length - 1)] + xs[WT.clamp(Math.floor(q), 0, xs.length - 1)]) / 2;
        } else if (xs.length === 1) target = xs[0] < mid ? xs[0] + 2 * P : xs[0] - 2 * P;
        // feedback: a crane starved of work while its neighbour has a queue is handed more of the yard
        this.bias[k] = WT.clamp(this.bias[k] + ((w.starved && !e.starved ? 1 : 0) - (e.starved && !w.starved ? 1 : 0)) * 10 * dt, -60, 60) * Math.pow(0.97, dt);
        target = WT.clamp(target + this.bias[k], w.home + 2 * P, e.home - 2 * P);
        // a line only moves through the gap between its two cranes' current claims, so no one is caught on the wrong side
        if (w.hi <= e.lo) target = WT.clamp(target, w.hi, e.lo);
        else target = this.splits[k];
        this.splits[k] += WT.clamp(target - this.splits[k], -12 * dt, 12 * dt);
      }
    }
    // each crane takes the yard between the lines either side of it (rail claims keep neighbours apart at the seams)
    inZone(c, x) { return (!c.west || x > this.splits[c.idx - 1]) && (!c.east || x <= this.splits[c.idx]); }
    zoneOf(x) { let i = 0; while (i < this.splits.length && x > this.splits[i]) i++; return i; }
    allowed(c, x) { return this.reach(c, x) && (c.relaxed || this.inZone(c, x)); }

    // carry out one lift: claim rail, run out ahead of a truck if needed, pick, place
    *runLift(c, lift, label, prio, truck) {
      c.busy = true;
      c.jobX = lift.fx;
      if (lift.slot) lift.slot.busy = c;
      if (lift.lock) lift.lock.lifting = true;
      if (lift.onTake) lift.onTake();
      yield* this.acquire(c, [lift.fx, lift.tx], prio);
      c.task = label;
      if (lift.fromReady && !lift.fromReady()) {
        c.task = 'Waiting over spot for ' + truck.id;
        yield* CR.transfer(c, lift.fx, lift.fromT, this.safe, this.safe, this.cspeed);
        yield* WT.waitFor(lift.fromReady);
      }
      const from = lift.from(), mesh = lift.mesh();
      yield* CR.transfer(c, from.x, from.t, from.top + 0.25, this.safe, this.cspeed);
      CR.grab(c, mesh);
      yield* WT.sleep(0.25);
      if (lift.toReady && !lift.toReady()) {
        c.task = 'Holding box for ' + truck.id;
        yield* CR.transfer(c, lift.tx, lift.toT, this.safe, this.safe, this.cspeed);
        yield* WT.waitFor(lift.toReady);
      }
      const to = lift.to();
      yield* CR.transfer(c, to.x, to.t, to.base + 2.95, this.safe, this.cspeed);
      const m = CR.release(c);
      lift.commit(m);
      if (lift.slot) lift.slot.busy = null;
      if (lift.lock) lift.lock.lifting = false;
      if (lift.onDone) lift.onDone();
      yield* WT.sleep(0.15);
      this.shrink(c);
      c.busy = false; c.jobX = undefined; c.task = 'Idle'; c.lifts++;
    }
    pickJob(c) {
      let job = null, lift = null, best = Infinity;
      const x = c.group.position.x, P = this.cpad;
      // rail a neighbour is waiting for is off limits for new work until it has been served
      const blocked = (p) => c.nbrs.some((o) => o.want && Math.max(x, p.fx, p.tx) + P > o.want[0] && Math.min(x, p.fx, p.tx) - P < o.want[1]);
      for (const relaxed of [false, true]) {
        // cross-yard lifts only while the neighbours are free to step aside
        if (relaxed && c.nbrs.some((o) => o.busy)) break;
        c.relaxed = relaxed;
        for (const j of this.jobs) {
          if (j.done) continue;
          // cross-yard work is only taken once it has waited a moment for the right crane
          if (relaxed && WT.TR.clock - j.t0 < (j.truck ? 2 : 4)) continue;
          const p = j.plan(c);
          if (p === 'skip') { j.done = true; continue; }
          if (!p) continue;
          if (!relaxed && !(this.inZone(c, p.fx) && this.inZone(c, p.tx))) continue;
          if (blocked(p)) continue;
          const score = Math.abs(p.fx - x) + Math.abs(p.tx - p.fx) * 0.4 - (j.truck ? 80 : 0) - Math.min(40, (WT.TR.clock - j.t0) * 2);
          if (score < best) { best = score; job = j; lift = p; }
        }
        if (job) break;
      }
      c.relaxed = false;
      this.jobs = this.jobs.filter((j) => !j.done && j !== job);
      return job ? { job, lift } : null;
    }
    // where this crane's next work will appear: a truck on its way to a spot on our side, a vessel's boxes, queued work
    nextWorkX(c) {
      let best;
      const x = c.group.position.x;
      const consider = (wx) => { if (wx !== undefined && this.inZone(c, wx) && (best === undefined || Math.abs(wx - x) < Math.abs(best - x))) best = wx; };
      for (const d of this.docks) if (d.truck && d.truck !== 'reserved') consider(d.x);
      for (const j of this.jobs) consider(this.jobX(j));
      return best;
    }
    // idle housekeeping: bring a box nearer the truck spots on our side, so later truck lifts are shorter
    tidyLift(c) {
      const spots = this.docks.filter((d) => this.allowed(c, d.x));
      if (!spots.length) return null;
      const dist = (x) => Math.min(...spots.map((d) => Math.abs(d.x - x)));
      let best = null, gain = 14;
      for (const s of this.slots) {
        const box = this.topOf(s);
        if (!box || s.busy || box.lifting || box.reserved || box.at === this || !this.allowed(c, s.x)) continue;
        for (const t of this.slots) {
          if (t === s || !this.stackable(t) || !this.allowed(c, t.x) || t.items.length >= s.items.length) continue;
          const g = dist(s.x) - dist(t.x);
          if (g > gain) { gain = g; best = [s, t, box]; }
        }
      }
      if (!best) return null;
      const [s, t, box] = best;
      return {
        slot: s, lock: box, fx: s.x, tx: t.x, fromT: this.ct(s.z), toT: this.ct(t.z), onTake: () => { t.busy = c; }, onDone: () => { t.busy = null; },
        mesh: () => box.mesh, from: () => ({ x: s.x, t: this.ct(s.z), top: s.items.length * 2.7 }), to: () => ({ x: t.x, t: this.ct(t.z), base: t.items.length * 2.7 }),
        commit: (m) => { s.items.pop(); m.position.set(t.x, t.items.length * 2.7, t.z); m.rotation.set(0, 0, 0); t.items.push(box); },
      };
    }
    *craneWorker(c) {
      let idleT = 0;
      while (true) {
        // a neighbour has been kept waiting on rail we hold: step aside before taking more work
        const kept = c.nbrs.find((o) => o.want && o.waited > 2 && overlaps(o.want, c));
        if (kept) { yield* this.makeWay(c, kept); continue; }
        const pick = this.pickJob(c);
        c.starved = !pick && this.jobs.some((j) => !j.done && !(j.truck && !j.truck.curLeg));
        if (pick) {
          idleT = 0;
          yield* this.runLift(c, pick.lift, pick.job.label, pick.job.truck ? 1 : 0, pick.job.truck);
          pick.job.done = true;
          this.moves++;
          WT.G && WT.G.earn(this.liftValue || 6000, this);
          continue;
        }
        const asking = c.nbrs.find((o) => o.want && overlaps(o.want, c));
        if (asking) { yield* this.makeWay(c, asking); continue; }
        idleT += 0.2;
        // never just parked: run out to where the next work will be, else tidy our side of the yard
        const nx = this.nextWorkX(c), x = c.group.position.x;
        const free = (t) => !c.nbrs.some((o) => o.want && Math.max(x, t) + this.cpad > o.want[0] && Math.min(x, t) - this.cpad < o.want[1]);
        if (nx !== undefined && Math.abs(nx - x) > 6 && free(nx)) {
          c.task = 'Positioning';
          yield* this.acquire(c, [nx], 0);
          yield* CR.transfer(c, nx, c.tx, this.safe, this.safe, this.cspeed);
          this.shrink(c);
          continue;
        }
        if (idleT > 2 && !c.nbrs.some((o) => o.want)) {
          const t = this.tidyLift(c);
          if (t) { idleT = 0; yield* this.runLift(c, t, 'Restacking near truck spots', 0); this.restacks = (this.restacks || 0) + 1; continue; }
        }
        // nothing on our side: drift back toward the middle of our stretch, ready for the next call
        const zl = c.west ? this.splits[c.idx - 1] + this.cpad : c.home, zr = c.east ? this.splits[c.idx] - this.cpad : c.home;
        const home = (zl + zr) / 2;
        if (Math.abs(home - x) > 10 && idleT > 3 && free(home)) {
          c.task = 'Positioning';
          yield* this.acquire(c, [home], 0);
          yield* CR.transfer(c, home, c.tx, this.safe, this.safe, this.cspeed);
          this.shrink(c);
          continue;
        }
        c.task = 'Idle';
        yield* WT.sleep(0.2);
      }
    }

    // lift a box (at world wx, wz) into the stack: lowest free slot this crane can reach, near the source,
    // away from the neighbouring cranes
    stackLift(c, mesh, wx, wz, top, commit, fromReady) {
      if (!this.reach(c, wx)) return null;
      const P = this.cpad;
      const cands = this.slots.filter((s) => this.stackable(s) && this.allowed(c, s.x));
      if (!cands.length) return null;
      const score = (s) => s.items.length * 30 + Math.abs(s.x - wx) + (c.nbrs.some((o) => s.x > o.lo - P && s.x < o.hi + P) ? 60 : 0);
      const s = cands.reduce((a, b) => (score(b) < score(a) ? b : a));
      return {
        slot: s, fx: wx, tx: s.x, fromT: this.ct(wz), toT: this.ct(s.z), fromReady,
        mesh: () => (typeof mesh === 'function' ? mesh() : mesh),
        from: () => ({ x: wx, t: this.ct(wz), top: typeof top === 'function' ? top() : top }),
        to: () => ({ x: s.x, t: this.ct(s.z), base: s.items.length * 2.7 }),
        commit: (m) => {
          m.position.set(s.x, s.items.length * 2.7, s.z);
          m.rotation.set(0, 0, 0);
          s.items.push(commit());
        },
      };
    }
    // lift the top box of a matching stack onto (wx, wz) at deck height `base`
    unstackLift(c, filter, wx, wz, base, commit, toReady) {
      const any = this.slots.some((s) => s.items.length && filter(this.topOf(s)));
      if (!any) return 'skip';
      if (!this.reach(c, wx)) return null;
      const cands = this.slots.filter((s) => s.items.length && !s.busy && filter(this.topOf(s)) && !this.topOf(s).lifting && this.allowed(c, s.x));
      if (!cands.length) return null;
      const s = cands.reduce((a, b) => (Math.abs(b.x - c.group.position.x) < Math.abs(a.x - c.group.position.x) ? b : a));
      const cont = this.topOf(s);
      return {
        slot: s, lock: cont, fx: s.x, tx: wx, fromT: this.ct(s.z), toT: this.ct(wz), toReady,
        mesh: () => cont.mesh,
        from: () => ({ x: s.x, t: this.ct(s.z), top: s.items.length * 2.7 }),
        to: () => ({ x: wx, t: this.ct(wz), base }),
        commit: (m) => { s.items.pop(); commit(cont, m); },
      };
    }

    /* ----- truck appointments ----- */
    // gate-in: choose the free spot closest to where this truck's work is, balanced across the cranes
    reserveFor(t, leg) {
      const free = this.docks.filter((d) => !d.truck);
      if (!free.length) return null;
      const mid = (this.cranes[0].home + this.cranes[this.cranes.length - 1].home) / 2;
      // balance across the cranes: spots in a crane's stretch weigh by the truck work already queued there
      const z = (x) => this.zoneOf(x);
      const load = (x) => this.docks.filter((o) => o.truck && z(o.x) === z(x)).length * 18 + this.jobs.filter((j) => j.truck && j.at !== undefined && z(j.at) === z(x)).length * 6;
      let workX;
      if (leg.op === 'pick') {
        const want = leg.cont || this.slots.map((s) => this.topOf(s)).find((c) => c && this.isImport(c) && !c.reserved);
        workX = want ? this.containerX(want) : mid;
      }
      const score = (d) => {
        let w = 0;
        if (workX !== undefined) w = Math.abs(d.x - workX);
        else {
          const room = this.slots.filter((s) => this.stackable(s));
          w = room.length ? Math.min(...room.map((s) => Math.abs(s.x - d.x) + s.items.length * 10)) : 0;
        }
        return w + load(d.x);
      };
      const d = free.reduce((a, b) => (score(b) < score(a) ? b : a));
      d.truck = t || 'reserved';
      if (t) { d.job = this.truckJob(t, leg, d); d.job.at = d.x; }
      return d;
    }
    reserve(op) { return this.reserveFor(null, { op }); }
    release(d) { if (d) { d.truck = null; d.job = null; } }
    // box still on a train wagon / ship deck at the berth: lift straight from there (subclass)
    aboard() { return null; }
    truckJob(t, leg, d) {
      const pick = leg.op === 'pick', want = leg.cont;
      const filt = want ? (c) => c === want : (c) => this.isImport(c) && !c.reserved;
      const parked = () => leg.parked;
      const deckTop = () => { const p = new T.Vector3(); t.container.mesh.getWorldPosition(p); return p.y + 2.7; };
      const load = (cont, m) => {
        const cargo = t.mesh.userData.cargo;
        cargo.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
        cont.reserved = false; cont.at = null; cont.wagon = null; cont.ship = null;
        t.container = cont; cont.status = 'On truck'; cont.loc = t.id;
        WT.SUP.note(cont, `Picked up by ${t.id} at ${this.id}`);
      };
      return this.addJob({
        truck: t, label: (pick ? 'Loading ' : 'Unloading ') + t.id,
        plan: (c) => {
          if (!WT.trucks.includes(t)) return 'skip';
          // forward thinking without waste: commit a crane only when the truck is a few seconds out
          if (!leg.parked && !(leg.passedGate && Math.hypot(t.actor.x - d.x, t.actor.z - d.z) < 70)) return null;
          if (pick) {
            const ab = want && !want.lifting && this.aboard(want);
            if (ab) {
              if (!this.reach(c, ab.x) || !this.reach(c, d.x)) return null;
              return {
                lock: want, fx: ab.x, tx: d.x, fromT: this.ct(ab.z), toT: this.ct(d.z), toReady: parked,
                mesh: () => want.mesh, from: () => ({ x: ab.x, t: this.ct(ab.z), top: ab.top }), to: () => ({ x: d.x, t: this.ct(d.z), base: 1.35 }),
                commit: (m) => { ab.take(); this.directMoves++; WT.SUP.note(want, `Direct transfer to ${t.id} at ${this.id}`); load(want, m); },
              };
            }
            const r = this.unstackLift(c, filt, d.x, d.z, 1.35, load, parked);
            // the box may still be on its way (under the other crane, or not yet off the train): give it time
            if (r === 'skip') return leg.parked && WT.sim.minutes - leg.parked > 20 ? 'skip' : null;
            return r;
          }
          const cont = t.container;
          if (!cont) return 'skip';
          return this.stackLift(c, () => cont.mesh, d.x, d.z, () => deckTop(), () => {
            t.container = null;
            cont.status = this.isImport(cont) ? 'Grounded' : cont.full ? 'Export · stacked' : 'Empty · stacked';
            cont.loc = this.id + ' · Stack';
            WT.SUP.note(cont, `Dropped at ${this.id}` + (cont.full ? ' for export' : ''));
            return cont;
          }, parked);
        },
      });
    }
    *serve(t, leg) {
      const d = leg.dock;
      leg.parked = WT.sim.minutes;
      t.where = `${this.id} · Crane lane · spot ${d.n}`;
      if (!d.job || d.job.truck !== t) { d.job = this.truckJob(t, leg, d); d.job.at = d.x; }
      t.status = leg.op === 'pick' ? 'Awaiting container' : 'Dropping container';
      yield* this.waitJobs([d.job]);
      d.job = null;
      if (leg.op === 'pick') { this.pendingPick = Math.max(0, this.pendingPick - 1); if (!t.container && t.cargo) t.cargo = null; }
      else this.pendingDrop = Math.max(0, this.pendingDrop - 1);
    }
    craneRows() {
      return [['Cranes', this.cranes.map((c) => `${c.id}: ${c.carry ? 'Lifting' : c.task}`).join(' · ')],
        ['Crane lifts', `${WT.fmtNum(this.moves)} (${this.cranes.map((c) => c.lifts).join(' + ')}) · ${this.directMoves} direct`],
        ['Truck spots', this.docks.map((d) => (d.truck ? '■' : '□')).join(' ') + ` · ${this.jobs.length} jobs queued`],
        ['Yard split', `${this.splits.map((x) => Math.round(x - this.A)).join(' / ')} m from centre · ${this.restacks || 0} restacks`]];
    }
  }
  WT.CraneTerminal = CraneTerminal;
})();
