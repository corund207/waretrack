/* WareTrack – downloaded 3D models (see CREDITS in the README). The optimised .glb files in assets/models are packed
   into js/models_data.js (npm run pack-models) so they load from file:// too. Each is decoded once at start-up,
   turned to face +X with its wheels on y = 0 and fitted to the size the simulation expects; M.asset() hands out
   clones that share geometry and materials. The park boots once WT.ASSETS.ready resolves. */
(function () {
  const T = THREE, M = WT.M;
  // fwd: the model's forward axis · len: length along it in the park · front: x of the nose (default: centred)
  // dropFront: cut low geometry this fraction of len behind the nose (fixed forks) · refront: x of the nose after
  // tint: material names that take the vehicle's livery colour · gear: node names that retract in flight
  const SPEC = {
    cab: { fwd: '+z', len: 7.2, front: 7.4, tint: ['base'], crease: true },
    sedan: { file: 'car_bmw', fwd: '-x', len: 4.45, tint: ['Body'] },
    suv: { file: 'car_g', fwd: '+z', len: 4.75 },
    van: { fwd: '+x', len: 6.1, front: 3.1 },
    plane: { fwd: '+z', len: 52, front: 19, gear: ['FRONT_LG', 'REAR_LEFT_LG', 'REAR_RIGHT_LG'] },
    loco: { fwd: '+z', len: 13.4 },
    forklift: { file: 'fork', fwd: '+z', len: 3.9, front: 1.75, dropFront: 0.3, refront: 1.66 },
  };
  const ROT = { '+x': 0, '-x': Math.PI, '+z': Math.PI / 2, '-z': -Math.PI / 2 };
  const A = (WT.ASSETS = { models: {}, failed: [] });

  function decode(b64) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  function fit(name, scene, s) {
    const g = new T.Group();
    const inner = new T.Group();
    inner.add(scene);
    inner.rotation.y = ROT[s.fwd];
    g.add(inner);
    g.updateMatrixWorld(true);
    let bb = new T.Box3().setFromObject(g);
    const k = s.len / (bb.max.x - bb.min.x);
    inner.scale.setScalar(k);
    g.updateMatrixWorld(true);
    bb = new T.Box3().setFromObject(g);
    const front = s.front === undefined ? s.len / 2 : s.front;
    inner.position.set(front - bb.max.x, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    g.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      if (s.crease || !o.geometry.attributes.normal) o.geometry = T.BufferGeometryUtils.toCreasedNormals(o.geometry, Math.PI / 5);
      if (s.dropFront !== undefined) dropAhead(o, front - s.dropFront * s.len);
      for (const m of [].concat(o.material)) {
        m.userData.auto = false; // the model's own roughness / metalness stand
        if (m.map) m.map.anisotropy = 4;
        if (m.transparent && m.opacity > 0.95) m.transparent = false;
      }
    });
    if (s.refront !== undefined) {
      // fit the trimmed model's new nose (the mast) to where the park hangs its own lift
      bb = new T.Box3().setFromObject(g);
      inner.position.x += s.refront - bb.max.x;
      g.updateMatrixWorld(true);
    }
    return g;
  }
  // the downloaded forklift has fixed forks; the park animates its own, so cut away everything ahead of the mast
  function dropAhead(mesh, x0) {
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pos = geo.attributes.position, v = new T.Vector3(), keep = [];
    const toPark = mesh.matrixWorld;
    for (let i = 0; i < pos.count; i += 3) {
      let ahead = 0, low = 0;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, i + k).applyMatrix4(toPark);
        if (v.x > x0) ahead++;
        if (v.y < 1.3) low++;
      }
      if (!(ahead === 3 && low === 3)) keep.push(i);
    }
    const out = new T.BufferGeometry();
    for (const [key, attr] of Object.entries(geo.attributes)) {
      const n = attr.itemSize, src = attr.array, dst = new src.constructor(keep.length * 3 * n);
      keep.forEach((i, j) => dst.set(src.subarray(i * n, (i + 3) * n), j * 3 * n));
      out.setAttribute(key, new T.BufferAttribute(dst, n, attr.normalized));
    }
    mesh.geometry = out;
  }

  A.ready = new Promise((resolve) => {
    const data = WT.MODEL_DATA || {};
    const names = Object.keys(SPEC).filter((n) => data[SPEC[n].file || n]);
    if (!T.GLTFLoader || !names.length) { resolve(); return; }
    const loader = new T.GLTFLoader();
    let left = names.length;
    const done = () => { if (--left === 0) resolve(); };
    for (const name of names) {
      const s = SPEC[name];
      try {
        loader.parse(decode(data[s.file || name]), '', (gltf) => {
          try { A.models[name] = fit(name, gltf.scene, s); } catch (e) { console.warn('model', name, e); A.failed.push(name); }
          done();
        }, (e) => { console.warn('model', name, e); A.failed.push(name); done(); });
      } catch (e) { console.warn('model', name, e); A.failed.push(name); done(); }
    }
  });

  // a clone of a fitted model, or null when it isn't available (the caller falls back to its procedural model)
  const tinted = {};
  M.asset = (name, color) => {
    const src = A.models[name];
    if (!src) return null;
    const g = src.clone(true);
    const s = SPEC[name];
    if (s.tint && color !== undefined) {
      g.traverse((o) => {
        if (!o.isMesh || !s.tint.includes(o.material.name)) return;
        const key = name + o.material.name + color;
        if (!tinted[key]) {
          tinted[key] = o.material.clone();
          tinted[key].color.setHex(color);
          if (!o.material.map) { tinted[key].roughness = 0.42; tinted[key].metalness = 0; }
        }
        o.material = tinted[key];
      });
    }
    if (s.gear) {
      const parts = [];
      g.traverse((o) => { if (s.gear.includes(o.name)) parts.push(o); });
      let vis = true;
      g.userData.gear = { get visible() { return vis; }, set visible(v) { vis = v; for (const p of parts) p.visible = v; } };
    }
    return g;
  };
})();
