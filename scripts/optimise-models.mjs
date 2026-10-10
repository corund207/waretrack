// Optimises models downloaded from Sketchfab (see assets/models/CREDITS.md) into assets/models: welds, simplifies to a
// triangle budget, shrinks textures to WebP and strips material extensions three r147 can't read.
// Not part of the build. Needs the glTF-Transform toolchain, installed on demand:
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node scripts/optimise-models.mjs <folder with the downloaded .glb files> [name]
// then `npm run pack-models`.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/optimise-models.mjs <download folder> [name]'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// ratio: share of triangles to keep · tex: max texture size · smooth: drop split normals so flat-shaded exports
// can weld and simplify (assets.js rebuilds creased normals)
const JOBS = {
  cab: { ratio: 0.35, tex: 512, error: 0.01, smooth: true },
  car_bmw: { ratio: 0.45, tex: 256 },
  car_g: { ratio: 0.45, tex: 256 },
  van: { ratio: 1, tex: 256 },
  plane: { ratio: 0.7, tex: 256 },
  loco: { ratio: 0.6, tex: 256 },
  fork: { ratio: 0.6, tex: 256 },
};
await MeshoptSimplifier.ready;
const count = (doc) => { let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return Math.round(t); };
for (const [name, j] of Object.entries(JOBS)) {
  if (process.argv[3] && process.argv[3] !== name) continue;
  const doc = await io.read(join(src, name + '.glb'));
  const before = count(doc);
  for (const ext of doc.getRoot().listExtensionsUsed()) if (!/KHR_texture_transform|KHR_mesh_quantization|KHR_materials_emissive_strength/.test(ext.extensionName)) ext.dispose();
  if (j.smooth) for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null);
  await doc.transform(
    dedup(), weld(),
    ...(j.ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio: j.ratio, error: j.error || 0.004 })] : []),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [j.tex, j.tex], quality: 82 }),
    prune(),
  );
  const out = join(root, 'assets/models', name + '.glb');
  await io.write(out, doc);
  console.log(name, before, '→', count(doc), 'tris', (statSync(out).size / 1024) | 0, 'KB');
}
