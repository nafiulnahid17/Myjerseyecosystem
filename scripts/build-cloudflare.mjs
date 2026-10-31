// Publish only explicit browser assets; never deploy .env, Python gateway or source/tests.
import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, relative, extname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const files = ['index.html', 'styles.css', 'app.js'];
for (const folder of ['assets', 'templates']) {
  const walk = dir => {
    for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
      const item = join(dir, entry.name);
      if (entry.isDirectory()) walk(item);
      else if (entry.isFile() && ['.svg', '.webp'].includes(extname(entry.name))) files.push(item);
    }
  };
  walk(folder);
}
files.sort();
const check = process.argv.includes('--check');
if (check) {
  if (!existsSync(output)) throw Error('dist/ is missing: run node scripts/build-cloudflare.mjs');
  const actual = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) actual.push(relative(output, path));
    }
  };
  walk(output);
  if (actual.sort().join('\n') !== files.join('\n')) throw Error('Public dist file manifest differs from approved source files');
  for (const file of files) {
    if (!readFileSync(resolve(root, file)).equals(readFileSync(resolve(output, file)))) {
      throw Error('Stale Cloudflare dist file: ' + file);
    }
  }
  console.log('Cloudflare dist matches all ' + files.length + ' approved assets');
} else {
  rmSync(output, { recursive: true, force: true });
  for (const file of files) {
    const target = resolve(output, file);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, readFileSync(resolve(root, file)));
  }
  console.log('Built Cloudflare dist with ' + files.length + ' public files');
}
