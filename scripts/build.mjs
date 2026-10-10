// Builds the static site into dist/ and stamps it with the commit hash, so every deploy
// busts browser caches and the version badge shows exactly which build is live.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');

// hash of everything the browser loads, so a build that is not a clean commit still gets a unique cache tag
function contentHash() {
  const h = createHash('sha1');
  const walk = (dir) => { for (const f of readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) f.isDirectory() ? walk(join(dir, f.name)) : h.update(f.name).update(readFileSync(join(root, dir, f.name))); };
  walk('js'); walk('css'); h.update(readFileSync(join(root, 'index.html')));
  return h.digest('hex').slice(0, 7);
}
// the commit shown on the version badge
function commit() {
  const env = process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA;
  if (env) return env.slice(0, 7);
  try { return execSync('git rev-parse --short=7 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'local'; }
}

const version = readFileSync(join(root, 'js/core.js'), 'utf8').match(/WT\.VERSION = '([^']+)'/)[1];
const build = commit();

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of ['index.html', 'css', 'js']) cpSync(join(root, p), join(out, p), { recursive: true });
if (existsSync(join(root, 'docs/social-preview.png'))) cpSync(join(root, 'docs/social-preview.png'), join(out, 'og.png'));

// cache tags hash the files themselves: assets are cached as immutable, so any change in content must change the URL
// (a commit hash alone is not enough — CLI deploys of uncommitted work report the last commit)
const tag = contentHash();
const html = join(out, 'index.html');
writeFileSync(html, readFileSync(html, 'utf8').replaceAll(`?v=${version}"`, `?v=${version}-${tag}"`));
const core = join(out, 'js/core.js');
writeFileSync(core, readFileSync(core, 'utf8').replace("WT.BUILD = 'dev';", `WT.BUILD = '${build}';`));

console.log(`built dist/ · v${version} · ${build} · assets ?v=${version}-${tag}`);
