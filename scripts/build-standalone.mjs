import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const dataUri = path => `data:image/svg+xml;base64,${Buffer.from(read(path)).toString('base64')}`;

let html = read('index.html');
const css = read('styles.css');
let js = read('app.js');

const assets = [
  'atherious-labs.svg',
  'my-jersey.svg',
  'artboard-ai.svg',
  'frame-forge-ai.svg',
  'assetsx-ai.svg',
  'autofly.svg',
  'ecosystem-hero.svg'
];
for (const name of assets) {
  const uri = dataUri(`assets/${name}`);
  html = html.replaceAll(`assets/${name}`, uri);
  js = js.replaceAll(`assets/${name}`, uri);
}

const templates = [
  'mockup_luxury_float',
  'mockup_stadium_hero',
  'mockup_editorial_launch',
  'video_luxury_360',
  'video_stadium_reveal',
  'video_kinetic_social'
];
const templateMap = Object.fromEntries(templates.map(id => [id, dataUri(`templates/${id}.svg`)]));
js = `const standaloneTemplateData=${JSON.stringify(templateMap)};\n${js}`;
js = js.replace('src="templates/${encodeURIComponent(id)}.svg"', 'src="${standaloneTemplateData[id]||\'\'}"');

html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`);
html = html.replace('<script src="app.js" defer></script>', `<script>${js}</script>`);
writeFileSync(resolve(root, 'Standalone_Interactive_Preview.html'), html);
