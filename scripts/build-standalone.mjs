import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const dataUri = path => `data:image/svg+xml;base64,${Buffer.from(read(path)).toString('base64')}`;

let html = read('index.html');
const css = read('styles.css');
let js = read('app.js');
const artboardCss = read('artboard-v2.css');
const artboardWorkflowCss = read('artboard-v2-workflow-fixes.css');
let mockupCss = read('mockup-alignment.css');
let artboardJs = read('artboard-v2.js');

const assets = [
  'atherious-labs.svg',
  'my-jersey.svg',
  'artboard-ai.svg',
  'frame-forge-ai.svg',
  'assetsx-ai.svg',
  'autofly.svg',
  'ecosystem-hero.svg',
  'media/tool-revector.svg','media/tool-artflux.svg','media/tool-tracelock.svg','media/tool-batchpilot.svg','media/tool-filecreator.svg',
  'artboard-v2/jersey-front.svg','artboard-v2/jersey-back.svg','artboard-v2/energy-waves.svg'
];
for (const name of assets) {
  const uri = dataUri(`assets/${name}`);
  html = html.replaceAll(`assets/${name}`, uri);
  js = js.replaceAll(`assets/${name}`, uri);
  artboardJs = artboardJs.replaceAll(`assets/${name}`, uri);
  mockupCss = mockupCss.replaceAll(`assets/${name}`, uri);
}

const webpAssets=['tool-artboard','tool-frame','tool-assets','tool-autofly',
'mockup_luxury_float','mockup_stadium_hero','mockup_editorial_launch',
'video_luxury_360','video_stadium_reveal','video_kinetic_social'];
const standaloneMediaData=Object.fromEntries(webpAssets.map(name=>[name,
  'data:image/webp;base64,'+readFileSync(resolve(root,'assets/media/'+name+'.webp')).toString('base64')]));
for(const [name,uri] of Object.entries(standaloneMediaData)){
  html=html.replaceAll('assets/media/'+name+'.webp',uri);
  js=js.replaceAll('assets/media/'+name+'.webp',uri);
}
js=js.replace('src="assets/media/tool-${t}.webp"','src="${standaloneMediaData[\'tool-\'+t]||\'\'}"');
js=js.replace('src="assets/media/${encodeURIComponent(id)}.webp"','src="${standaloneMediaData[id]||\'\'}"');
js=`const standaloneMediaData=${JSON.stringify(standaloneMediaData)};\n${js}`;
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
html = html.replace('<link rel="stylesheet" href="artboard-v2.css">', `<style>${artboardCss}</style>`);
html = html.replace('<link rel="stylesheet" href="artboard-v2-workflow-fixes.css">', `<style>${artboardWorkflowCss}</style>`);
html = html.replace('<link rel="stylesheet" href="mockup-alignment.css">', `<style>${mockupCss}</style>`);
html = html.replace('<script src="app.js" defer></script>', `<script>${js}</script>`);
html = html.replace('<script src="artboard-v2.js" defer></script>', `<script>${artboardJs}</script>`);
writeFileSync(resolve(root, 'Standalone_Interactive_Preview.html'), html);
