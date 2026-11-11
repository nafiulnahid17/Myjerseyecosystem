'use strict';
// Homepage presentation only. Tool workflows and API calls are unchanged.
(() => {
 const root='assets/home-hq/';
 const paths={
 layers:'M12 2 2 7l10 5 10-5-10-5ZM2 12l10 5 10-5M2 17l10 5 10-5',
 film:'M3 7h18v14H3zM3 7 1 2h18l2 5M6 2l3 5m4-5 3 5m-6 4 6 3-6 3z',
 cube:'m12 2 10 5v10l-10 5-10-5V7Zm0 10 10-5M12 12 2 7m10 5v10',
 brush:'m14 3 7-2-2 7-9 9-5-5ZM5 12c-5 1 0 6-4 10 8 0 11-4 9-7',
 shield:'M12 2 3 6v6c0 5 4 8 9 10 5-2 9-5 9-10V6Z',
 file:'M5 2h10l5 5v15H5ZM15 2v6h5M8 13h9m-9 4h7',
 lock:'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v12H5Zm7 5v3',
 bolt:'m14 1-12 13h8l-1 9L22 9h-8Z',
 grid:'M3 3h6v6H3Zm12 0h6v6h-6ZM3 15h6v6H3Zm12 0h6v6h-6Z',
 screen:'M2 3h20v14H2Zm10 14v5m-5 0h10',
 shirt:'m7 3-5 4 3 5 3-2v12h8V10l3 2 3-5-5-4c-2 3-8 3-10 0Z',
 gear:'m10 2 4 0 1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1Z M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
 chart:'M2 21 8 14l5 3L22 3M16 3h6v6',
 arrow:'M3 12h18m-6-6 6 6-6 6',
 users:'M8 10a4 4 0 1 0 0-8 4 4 0 1 0 0 8Zm8 0a3 3 0 1 0 0-6M1 22v-5a7 7 0 0 1 14 0v5m1-10a6 6 0 0 1 7 6v4'
 };
 const icon=(name,cls='')=>`<svg class="home-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.layers}"/></svg>`;
 const cards=[
 ['revector','ReVector AI','Multi-Pattern Vectorization',null,true,'layers','lime'],
 ['artboard','Artboard AI','Create Designs, Instantly','artboard',false,'layers','green'],
 ['frame','Frame Forge AI','AI Video Creation Tool','frame',false,'film','cyan'],
 ['assets','AssetsX AI','Turn Assets into Possibilities','assets',false,'cube','violet'],
 ['artflux','ArtFlux AI','AI Creative Design Studio',null,false,'brush','pink'],
 ['tracelock','TraceLock AI','Design Protection & Ownership',null,true,'shield','cyan'],
 ['batchpilot','BatchPilot AI','AI-Powered Bulk Production',null,true,'layers','gold'],
 ['filecreator','AI File Creator','Native Illustrator (.ai)',null,true,'file','lime']
 ];
 const card=([asset,name,subtitle,tool,locked,symbol,tone])=>`<button type="button" class="reference-card reference-${asset} home-tone-${tone}" ${tool?`data-tool="${tool}"`:'disabled'} aria-label="${name} — ${subtitle}${locked?' — Locked':tool?'':' — Coming soon'}" ${!tool?'title="Coming soon"':''}>
 <span class="home-card-heading"><i>${icon(symbol)}</i><span><strong>${name}</strong><small>${subtitle}</small></span><b class="${locked?'home-locked-badge':'home-open-badge'}">${locked?'Locked':'−'}</b></span>
 <span class="home-card-art"><img src="${root}${asset}.${asset==='filecreator'?'svg':'webp'}" width="1536" height="1024" alt="" decoding="async">${locked?`<span class="home-lock-overlay">${icon('lock')}</span>`:''}</span></button>`;
 homeV4=function(){return `<section class="reference-home" aria-label="My Jersey Ecosystem dashboard">
 <section class="reference-hero"><img class="home-hero-art" src="${root}hero.webp" width="1536" height="1024" alt="Neon green digital jersey floating over a holographic production podium" fetchpriority="high"><img class="home-hero-insignia" src="${root}atherious-mark.svg" alt="" aria-hidden="true"><span class="home-hero-float layers">${icon('layers')}</span><span class="home-hero-float film">${icon('film')}</span><span class="home-hero-float ai" aria-hidden="true">Ai</span><div class="home-hero-copy"><h1>My Jersey <span>Ecosystem</span></h1><p>A COMPLETE AI ECOSYSTEM FOR JERSEY DESIGN,<br>PRODUCTION &amp; MANAGEMENT</p><div class="home-hero-badges"><span>${icon('bolt')}AI Powered</span><span>${icon('layers')}All-in-One</span><span>${icon('cube')}Production Ready</span><span>${icon('users')}For Brands &amp; Teams</span></div></div></section>
 <section class="reference-tools" aria-labelledby="reference-tools-heading"><header class="home-tools-heading"><h2 id="reference-tools-heading">${icon('grid')}All Tools</h2><p>8 Powerful AI Tools for Your Jersey Journey</p><b>8 TOOLS</b></header><div class="reference-board">${cards.map(card).join('')}<button type="button" class="reference-card reference-autofly" data-tool="autofly" aria-label="Open AutoFly — Private Tech bonus"><span class="home-bonus-pill">🎁 BONUS</span>${icon('bolt','home-bonus-bolt')}<strong>AutoFly</strong><small>Private Tech</small><span class="home-bonus-open">Open →</span><img src="${root}bonus-platform.svg" width="400" height="350" alt="" class="home-bonus-platform"></button></div></section>
 <nav class="reference-workflow" aria-label="Ecosystem workflow"><strong>${icon('layers')}Ecosystem Workflow</strong><ol>${[['screen','Design'],['layers','Prepare'],['shirt','Mockup'],['shield','Protect'],['gear','Produce'],['chart','Manage']].map(([i,label])=>`<li>${icon(i)}<span>${label}</span></li>`).join('')}</ol><button type="button" data-tool="artboard">${icon('bolt')}Start Creating ${icon('arrow')}</button></nav>
 <aside class="reference-notice">${icon('lock')}<p><strong>Strict Notice:</strong> Access is restricted to authorized My Jersey production teams.</p></aside></section>`;};
 let previousHome=false;const toolRender=render;
 render=function(...args){
 const home=state.tool==='home',collapsed=document.body.classList.contains('sidebar-collapsed');
 document.body.classList.toggle('reference-dashboard',home);
 const result=toolRender(...args);
 const logo=document.querySelector('.brand-logo');if(logo)logo.src=home?root+'atherious-mark.svg':'assets/atherious-labs.svg';
 if(home)document.body.classList.toggle('sidebar-collapsed',!previousHome||collapsed);
 previousHome=home;if(typeof syncNavigation==='function')syncNavigation();return result;
 };render();
})();
