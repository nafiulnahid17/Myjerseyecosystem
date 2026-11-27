import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const dataUri = path => `data:image/svg+xml;base64,${Buffer.from(read(path)).toString('base64')}`;

let html = read('index.html');
const site = 'https://myjerseyecosystem.atheriouslabs.workers.dev';
html = html.replace('href="/production-studio/"', 'href="' + site + '/production-studio/"');
const css = read('styles.css');
let js = read('app.js').replace("const studioPath = '/production-studio/';", "const studioPath = '" + site + "/production-studio/';");
let mockupCss = read('mockup-alignment.css');

const assets = [
  'atherious-labs.svg',
  'my-jersey.svg',
  'frame-forge-ai.svg',
  'assetsx-ai.svg',
  'autofly.svg',
  'ecosystem-hero.svg',
  'media/tool-revector.svg','media/tool-artflux.svg','media/tool-tracelock.svg','media/tool-batchpilot.svg','media/tool-filecreator.svg',
];
for (const name of assets) {
  const uri = dataUri(`assets/${name}`);
  html = html.replaceAll(`assets/${name}`, uri);
  js = js.replaceAll(`assets/${name}`, uri);
  mockupCss = mockupCss.replaceAll(`assets/${name}`, uri);
}

const webpAssets=['tool-studio','tool-frame','tool-assets','tool-autofly',
'mockup_luxury_float','mockup_stadium_hero','mockup_editorial_launch',
'video_luxury_360','video_stadium_reveal','video_kinetic_social'];
const standaloneMediaData=Object.fromEntries(webpAssets.map(name=>[name,
  'data:image/webp;base64,'+readFileSync(resolve(root,'assets/media/'+name+'.webp')).toString('base64')]));
for(const [name,uri] of Object.entries(standaloneMediaData)){
  html=html.replaceAll('assets/media/'+name+'.webp',uri);
  if (name === 'tool-studio') {
    js=js.replace("art:'assets/media/tool-studio.webp'", "art:standaloneMediaData['tool-studio']");
  } else {
    js=js.replaceAll('assets/media/'+name+'.webp',uri);
  }
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
html = html.replace('<link rel="stylesheet" href="mockup-alignment.css">', `<style>${mockupCss}</style>`);
html = html.replace('<script src="app.js" defer></script>', `<script>${js}</script>`);
writeFileSync(resolve(root, 'Standalone_Interactive_Preview.html'), html);
