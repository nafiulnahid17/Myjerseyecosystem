// Publish the shell, Studio client and only the explicitly approved static assets.
import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, relative, extname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const browser = resolve(root, 'production-studio/dist/client');
const studioWorker = resolve(root, 'production-studio/dist/worker/production-studio.mjs');
const workerTarget = resolve(root, 'src/production-studio.mjs');
const runtime = resolve(root, 'production-studio/.runtime');

if (!existsSync(studioWorker)) throw Error('Build Production Studio with npm --prefix production-studio run build.');

const files = new Map();
for (const name of ['index.html', 'styles.css', 'app.js', 'mockup-alignment.css', 'home-theme.css', 'home-theme.js', 'favicon.ico']) {
  files.set(name, resolve(root, name));
}

function walk(dir, outputPrefix, allowed) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const source = join(dir, entry.name);
    const target = join(outputPrefix, entry.name);
    if (entry.isDirectory()) walk(source, target, allowed);
    else if (entry.isFile() && allowed(entry.name)) files.set(target, source);
  }
}

for (const name of ['assets', 'templates']) {
  walk(resolve(root, name), name, name => ['.svg', '.webp'].includes(extname(name)));
}
walk(browser, 'production-studio', name => ['.html', '.js', '.css', '.webp'].includes(extname(name)));

if (existsSync(resolve(runtime, 'manifest.json'))) {
  walk(runtime, '_pipeline', name => /^(?:manifest\.json|launch\.py|runtime\.part\d{2})$/.test(name));
}

if (process.argv.includes('--check')) {
  const actual = [];
  function collect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) collect(path);
      else if (entry.isFile()) actual.push(relative(output, path));
    }
  }
  collect(output);
  if (actual.sort().join('\n') !== [...files.keys()].sort().join('\n')) {
    throw Error('Public dist manifest differs from the approved frontend and Studio build.');
  }
  for (const [name, source] of files) {
    if (!readFileSync(source).equals(readFileSync(resolve(output, name)))) throw Error('Stale Cloudflare asset: ' + name);
  }
  if (!readFileSync(studioWorker).equals(readFileSync(workerTarget))) throw Error('Stale Studio Worker bundle.');
  console.log('Cloudflare build verified: ' + files.size + ' assets and the Studio Worker.');
} else {
  rmSync(output, { recursive: true, force: true });
  for (const [name, source] of files) {
    const target = resolve(output, name);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, readFileSync(source));
  }
  writeFileSync(workerTarget, readFileSync(studioWorker));
  console.log('Built Cloudflare dist with ' + files.size + ' assets and the Studio Worker.');
}
