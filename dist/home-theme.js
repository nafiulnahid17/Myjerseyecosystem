'use strict';
// Homepage presentation only. Tool workflows and API calls are unchanged.
(() => {
  const root='assets/home-2026/';
  const cards=[
    ['revector','ReVector AI','Multi-Pattern Vectorization',null,true],
    ['artboard','Artboard AI','Create Designs, Instantly','artboard'],
    ['frame','Frame Forge AI','AI Video Creation Tool','frame'],
    ['assets','AssetsX AI','Turn Assets into Possibilities','assets'],
    ['artflux','ArtFlux AI','AI Creative Design Studio',null],
    ['tracelock','TraceLock AI','Design Protection & Ownership',null,true],
    ['batchpilot','BatchPilot AI','AI-Powered Bulk Production',null,true],
    ['filecreator','AI File Creator','Native Illustrator (.ai)',null,true],
  ];
  homeV4=function(){
    return `<section class="reference-home" aria-label="My Jersey Ecosystem dashboard">
      <section class="reference-hero"><h1 class="reference-sr">My Jersey Ecosystem</h1><img src="${root}hero.webp" width="1672" height="295" alt="A complete AI ecosystem for jersey design, production and management. Neon green jersey artwork engine. AI Powered, All-in-One, Production Ready, For Brands and Teams." fetchpriority="high"></section>
      <section class="reference-tools" aria-labelledby="reference-tools-heading"><h2 id="reference-tools-heading" class="reference-sr">All Tools — 8 Powerful AI Tools for Your Jersey Journey</h2><img class="reference-tools-heading" src="${root}all-tools.webp" width="1634" height="50" alt="All Tools — 8 Powerful AI Tools for Your Jersey Journey. 8 tools.">
        <div class="reference-board">${cards.map(([asset,name,subtitle,tool,locked])=>`<button type="button" class="reference-card reference-${asset}" ${tool?`data-tool="${tool}"`:'disabled'} aria-label="${name} — ${subtitle}${locked?' — Locked':tool?'':' — Coming soon'}" ${!tool?'title="Coming soon"':''}><img src="${root}${asset}.webp" alt="${name}: ${subtitle}${locked?'. Locked.':''}" width="${asset==='revector'||asset==='artflux'?354:asset==='assets'||asset==='filecreator'?334:asset==='frame'||asset==='batchpilot'?331:330}" height="${['artflux','tracelock','batchpilot','filecreator'].includes(asset)?169:168}"></button>`).join('')}
        <button type="button" class="reference-card reference-autofly" data-tool="autofly" aria-label="Open AutoFly — Private Tech bonus"><img src="${root}autofly.webp" width="213" height="348" alt="Bonus: AutoFly. Private Tech. Open."></button></div>
      </section>
      <nav class="reference-workflow" aria-label="Ecosystem workflow"><img src="${root}workflow.webp" width="1634" height="56" alt="Ecosystem Workflow: Design, Prepare, Mockup, Protect, Produce, Manage."><button type="button" data-tool="artboard" aria-label="Start Creating"><span class="reference-sr">Start Creating →</span></button></nav>
      <aside class="reference-notice"><img src="${root}notice.webp" width="1612" height="38" alt="Strict Notice: Access is restricted to authorized My Jersey production teams."></aside>
    </section>`;
  };
  let previousHome=false;
  const toolRender=render;
  render=function(...args){
    const home=state.tool==='home',collapsed=document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('reference-dashboard',home);
    const result=toolRender(...args);
    if(home){document.body.classList.toggle('sidebar-collapsed',!previousHome||collapsed);}
    previousHome=home;
    if(typeof syncNavigation==='function')syncNavigation();
    return result;
  };
  render();
})();
