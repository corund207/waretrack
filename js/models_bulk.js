/* WareTrack – ISO open-top bulk bins. Every bulk (heap) material — ores, coal, bauxite, sand, grain — travels in one
   of these 40-foot boxes: full-height walls hold the heap, so it can be craned, stacked and railed like any box.
   Crates, glass, coils and textiles use the low-walled open frame (models_fleet.js) instead. */
(function () {
  const T = THREE, M = WT.M, MB = M.MB, shade = M.shade;

  // solid corrugated walls, corner castings, end doors; grain gets a weatherproof roof with loading hatches
  M.openTopBin = (color, len = 11, mat) => {
    const g = new T.Group(), b = new MB();
    const w = 2.6, h = 2.7, frame = shade(color, 0.7), grain = mat === 'grain';
    b.box(len, 0.24, w, frame, 0, 0, 0);
    for (const z of [-1.24, 1.24]) {
      b.box(len - 0.25, 2.35, 0.1, color, 0, 0.24, z);
      b.box(len, 0.14, 0.16, frame, 0, 2.56, z);
      b.box(len, 0.18, 0.18, frame, 0, 0.24, z);
      for (let x = -len / 2 + 0.5; x < len / 2 - 0.3; x += 0.45) b.box(0.075, 2.16, 0.08, shade(color, 0.88), x, 0.4, z * 1.025);
      // identification / payload placard
      b.box(1.3, 0.4, 0.025, 0xe9ecf7, len / 2 - 1.2, 1.75, z * 1.045);
    }
    for (const x of [-len / 2 + 0.12, len / 2 - 0.12]) {
      b.box(0.13, 2.32, w - 0.25, color, x, 0.25, 0);
      for (const z of [-1.18, 1.18]) {
        b.box(0.24, h, 0.24, frame, x, 0, z);
        for (const y of [0, h - 0.22]) b.box(0.28, 0.22, 0.28, 0xb8c2dc, x, y, z);
      }
      // locking bars and hinges on the end doors
      for (const z of [-0.7, 0.7]) {
        b.box(0.08, 2.15, 0.065, 0xb8c2dc, x + Math.sign(x) * 0.09, 0.35, z);
        for (const y of [0.6, 2.1]) b.box(0.12, 0.13, 0.27, 0x6a7194, x + Math.sign(x) * 0.1, y, z);
      }
      b.box(0.18, 0.16, 2.3, frame, x, 2.54, 0);
    }
    if (grain) {
      b.box(len - 0.25, 0.14, w - 0.2, 0xd6dbdf, 0, 2.48, 0);
      for (const x of [-len * 0.3, 0, len * 0.3]) {
        b.box(1.5, 0.12, 1.35, 0x4a5578, x, 2.63, 0);
        b.box(0.16, 0.5, 0.75, 0x3a4166, x, 0.25, -1.3); // discharge gates
      }
    }
    g.add(b.mesh());
    g.userData.h = h;
    g.userData.bulkStyle = grain ? 'covered-grain' : 'reinforced-open-top';
    // how high the heap may mound inside: to just under the roof for grain, to the rim otherwise
    g.userData.heapH = grain ? 2.1 : 2.3;
    const hatches = [];
    if (grain) for (const x of [-len * 0.3, 0, len * 0.3]) {
      const hinge = new T.Group(); hinge.position.set(x, 2.75, -0.68);
      const lid = new T.Mesh(new T.BoxGeometry(1.6, 0.1, 1.4), M.mat(0xe9ecf7));
      lid.position.z = 0.7; hinge.add(lid); g.add(hinge); hatches.push(hinge);
    }
    g.userData.setHatches = (open) => hatches.forEach((p) => { p.rotation.x = -open * 1.9; });
    return g;
  };
})();
