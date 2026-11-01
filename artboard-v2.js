'use strict';
/* Artboard AI V2: frontend-only replacement. Existing gateways, endpoints and other tools untouched. */
(() => {
  const ui = {
    vectorOverlaySource:null, analysisDone:false, generationStarted:false, processingStage:'', downloadFormat:'',
    phase: 'input', selected: new Set(), prepared: [], inspected: false,
    view: null, visitedStages: new Set(), stageStatus: '', lastPreviewPath:'', dimensions: '', awaitingSurfaces: false, visibleChoice: new Set(['front_body']), processingStarted: false, cancelRequested: false
  };
  const steps = ['Input','Analyze','Artwork Creation','Vectorization','Validation','Export'];
  const surfName = x => /back/i.test(String(x?.type || x?.name || x || '')) ? 'back_body' : 'front_body';
  const surfaceLabel = x => x === 'back_body' ? 'Back' : 'Front';
  const project = () => state.artboardResult || state.artboardProject || {};
  const available = () => (project().surfaces || []).map(x => ({...x, side:surfName(x)}));
  const previewUrl = p => {
    if(!p || !project().project_id) return '';
    const key = p.previews?.svg || p.previews?.png || p.exports?.svg || p.exports?.png || p.preview_path;
    if(typeof key !== 'string' || !key.startsWith('projects/' + project().project_id + '/')) return '';
    const rel = key.slice(('projects/' + project().project_id + '/').length);
    return '/api/engine/artboard/api/artboard/projects/' + encodeURIComponent(project().project_id) + '/artifacts/' + rel.split('/').map(encodeURIComponent).join('/');
  };
  function interimPreview(side){
    const path=state.artboardPreviewPath||'',url=state.objectURLs.artboard_live||'';
    if(!path||!url||!path.startsWith('projects/'+project().project_id+'/'))return '';
    const normalized=path.toLowerCase();
    if(/front[_\/-]|front_body/.test(normalized))return side==='front_body'?url:'';
    if(/back[_\/-]|back_body/.test(normalized))return side==='back_body'?url:'';
    return available().length===1&&available()[0].side===side?url:'';
  }
  const pct = () => typeof state.progress === 'number' ? `${Math.round(state.progress)}%` : 'Processing';
  const statusText = () => state.lastError ? 'Error' : state.busy ? (state.stage || 'Processing') : 'Ready';
  const safeTime = v => {
    const ms=Date.parse(v||'');return Number.isFinite(ms)?new Date(ms).toLocaleTimeString():'';
  };
  function health(){
    const a=state.status?.artboard||{}, ok=a.state==='online', active=state.busy && Boolean(state.artboardJob && ['processing','queued'].includes(state.artboardJob.status));
    return `<div class="abv2-health" aria-label="Artboard engine status">
      <span><i class="${active?'ok':'unknown'}"></i>Primary AI <b>${active?'Running':a.ai_configured===true?'Configured':'Unknown'}</b></span>
      <span><i class="unknown"></i>Fallback AI <b>Not verified</b></span>
      <span><i class="${ok?'ok':'bad'}"></i>Engine <b>${ok?'Online':'Unavailable'}</b></span>
      <span><i class="${ok?'ok':'bad'}"></i>Export <b>${ok?'Engine reachable':'Unavailable'}</b></span>
    </div>`;
  }
  function top(title,description){return `<div class="abv2-top">${health()}<div class="abv2-header"><img src="assets/artboard-ai.svg" alt=""><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><span class="abv2-step-label">${ui.phase==='input'?'READY':esc(state.stage||statusText())}</span></div></div>`;}
  function button(text,action,cls='',disabled=false){return `<button type="button" class="abv2-btn ${cls}" data-abv2="${action}" ${disabled?'disabled':''}>${text}</button>`;}
  function navigation(current){const idx=steps.indexOf(current);return `<div class="abv2-nav">${button('← Previous Step','previous','',idx<=0)}${button('■ Stop','stop','danger',!state.busy)}</div>`;}
  function bars(){return `<div class="abv2-progress ${state.busy&&state.progress==null?'indeterminate':''}" aria-label="Current engine progress"><span style="width:${state.progress==null?26:Math.max(0,Math.min(100,state.progress))}%"></span></div>`;}
  function stageOf(message){const t=String(message||'').toLowerCase();if(/validat|print.ready|quality check|preflight|integrity|fidelity/.test(t))return 'Validation';if(/vector|trac|path|vtracer|potrace|optimi|compos|svg/.test(t))return 'Vectorization';if(/generat|artwork|reconstruct|provider|model|image/.test(t))return 'Artwork Creation';if(/export|deliver|bundle|format/.test(t))return 'Export';if(/analy|upload|prepar|surface|locat|geometry|scan/.test(t))return 'Analyze';return null;}
  function currentStage(){if(ui.phase==='input')return 'Input';if(ui.phase==='analyze')return 'Analyze';if(ui.phase==='artwork'||ui.phase==='select')return 'Artwork Creation';if(ui.phase==='export')return 'Export';return ui.processingStage||stageOf(state.stage)||'Artwork Creation';}
  function stageEvents(){const stage=currentStage();return (state.artboardEvents||[]).filter(e=>stageOf(e.step||e.stage||'')===stage).slice(-20);}
  function stageProgress(){const events=stageEvents();const last=events.at(-1);return typeof last?.stage_progress==='number'?Math.max(0,Math.min(100,last.stage_progress)):null;}
  function liveLog(){const events=stageEvents(),percent=stageProgress();const stage=currentStage();const current=events.at(-1);
    return `<aside class="abv2-card abv2-log"><header><h2>Working Log — ${esc(stage)}</h2><small>${esc(state.lastJobId?state.lastJobId.slice(0,10):'Awaiting job')}</small></header>
      <div class="abv2-current"><strong>${esc(state.lastError?'Error':state.busy?'Processing':events.length?'Latest stage activity':'Awaiting events')}</strong><b>${percent==null?(state.busy?'Live':'—'):Math.round(percent)+'%'}</b><div class="abv2-progress ${state.busy&&percent==null?'indeterminate':''}"><span style="width:${percent==null?25:percent}%"></span></div></div>
      <ol aria-label="Real engine events for this stage">${events.length?events.map(e=>`<li><span>${esc(e.step||e.stage||'Engine event')}</span><small>${typeof e.stage_progress==='number'?Math.round(e.stage_progress)+'%':safeTime(e.at)||'Reported'}</small></li>`).join(''):'<li><span>No stage events reported yet.</span></li>'}</ol>
      <div class="abv2-log-footer"><span>${esc(state.mode.artboard==='quality'?'Quality':'Normal')} Mode</span><span>Engine-reported data only</span></div></aside>`;
  }
  function originalPreview(){const url=state.objectURLs.artboard;return `<div class="abv2-visual abv2-scan ${state.busy?'active':''}">${url?`<img src="${url}" alt="Uploaded original design">`:`<div class="abv2-empty">Source preview is unavailable for this file format.</div>`}<span class="abv2-corners" aria-hidden="true"></span><span class="abv2-beam" aria-hidden="true"></span></div>`;}
  function artworkCard(side){
    const item=available().find(x=>x.side===side),label=surfaceLabel(side),chosen=ui.selected.has(side);
    const url=previewUrl(item)||interimPreview(side);
    const generating=ui.generationStarted&&state.busy;
    return `<article class="abv2-card abv2-artwork ${chosen?'selected':''}"><header><h2>${label} Artwork</h2><span>${item?'Detected':'Not detected'}</span></header>
      <div class="abv2-art-canvas ${generating?'abv2-creating':''}">${url?`<img class="abv2-genuine-image" src="${url}" alt="Real ${label} engine-produced artwork preview">`:
      `<div class="abv2-generation-placeholder"><span class="abv2-creation-orb" aria-hidden="true"></span><p>${generating?'AI creating '+label+' artwork — awaiting real preview':item?'Artwork preview awaiting engine output':'No independently visible '+label+' detected'}</p></div>`}
      <span class="abv2-art-grid" aria-hidden="true"></span>${generating?'<span class="abv2-beam" aria-hidden="true"></span>':''}</div>
      ${item?`<label class="abv2-select"><input type="checkbox" data-abv2-select="${side}" ${chosen?'checked':''} ${state.busy?'disabled':''}> Select ${label} for production</label>`:
      button('✦ Recreate '+label+' with AI (Unavailable)','recreate:'+side,'secondary',true)}
      ${!url&&item?'<small class="abv2-source-note">No invented preview: authentic artwork appears when the engine exposes it.</small>':''}
    </article>`;
  }
  function input(){
    const file=state.files.artboard, url=state.objectURLs.artboard;
    return `${top('Artboard AI','AI JERSEY ARTWORK ENGINE')}<div class="abv2-input-shell">
      <div class="abv2-modes"><b>Production Mode</b><div>${button('◇ Quality Mode','mode:quality',state.mode.artboard==='quality'?'active':'')}${button('⚡ Normal Mode','mode:cost_effective',state.mode.artboard==='cost_effective'?'active':'')}</div></div>
      <div class="abv2-drop" data-droptool="artboard">${url?`<img class="abv2-upload-preview" src="${url}" alt="Uploaded artwork preview">`:file?`<span class="abv2-pdf-preview">${esc(file.name)}</span>`:""}<div class="abv2-upload-icon">${file?"✓":"⇧"}</div><strong>${file?"Replace Uploaded Design":"Drag &amp; Drop Your Design Here"}</strong><small>${file?"Click to replace this file":"or click to upload"}</small><p>PNG · JPG · WEBP · PDF</p><input type="file" data-file="artboard" aria-label="Upload artwork" accept=".png,.jpg,.jpeg,.webp,.pdf"></div>
      ${file?`<div class="abv2-file">${url?`<img src="${url}" alt="Input thumbnail">`:''}<div><strong>${esc(file.name)}</strong><small>${fmtSize(file.size)} · ${esc(file.type||'Unknown media type')}${ui.dimensions?' · '+esc(ui.dimensions):''}</small></div><span>Selected input</span></div>`:''}
      <div class="abv2-commands">${button('▤ Clear Input','clear','danger',!file||state.busy)}${button('▷ Start Production','start','primary',!file||state.busy||!connected('artboard'))}</div>
    </div>`;
  }
  function analyze(){return `${top('Analyzing Original Input','AI scans the input and identifies independently visible surfaces automatically')}<div class="abv2-process-grid"><div class="abv2-primary"><section class="abv2-card abv2-preview"><header><h2>Live Input Scan</h2><span>${esc(statusText())}</span></header>${originalPreview()}<div class="abv2-preview-foot"><span>Original input • ${esc(state.files.artboard?.name||'No file')}</span><span>${state.busy?'Scanning source':ui.analysisDone?'Analysis complete':'Awaiting analysis'}</span></div>${ui.analysisDone?`<div class="abv2-result-summary"><b>Analysis report</b><span>${available().length} actual independently visible ${available().length===1?'side':'sides'} prepared</span></div>`:''}</section>${navigation('Analyze')}</div>${liveLog()}</div>`;}
  function select(){ui.phase='artwork';const prepared=available(),both=prepared.length===2;const selected=prepared.filter(s=>ui.selected.has(s.side));
    return `${top('Artwork Creation','Real artwork generation takes place on this page; optional side selection before production')}<div class="abv2-select-summary">${prepared.length?`${prepared.length} source ${prepared.length===1?'surface':'surfaces'} detected • ${ui.selected.size} selected`:'No visible surface confirmed — check analysis findings'}</div>
    <div class="abv2-art-grid-layout ${prepared.length===1?'single':''}">${artworkCard('front_body')}${artworkCard('back_body')}${liveLog()}</div>
    <div class="abv2-select-actions">${navigation('Artwork Creation')}${!ui.generationStarted?button('✦ Generate Selected Artwork','produce','primary',!ui.selected.size||state.busy):'<span class="abv2-current-message">AI is generating artwork; vectorization starts automatically after generation.</span>'}</div>`;
  }
  function processTitle(){const stage=stageOf(state.stage);return stage==='Validation'?'Validation':stage==='Vectorization'?'Vectorization':stage==='Export'?'Export':'Artwork Creation';}
  function processing(){const title=ui.processingStage||processTitle();
    const isVector=title==='Vectorization',isValid=title==='Validation';
    const subsets=ui.selected.size?[...ui.selected]:available().map(x=>x.side);
    const onlyValid=subsets.filter(side=>available().some(x=>x.side===side));
    const verified=project().true_vector_ready===true;
    return `${top(title,title==='Validation'?'Inspecting verified vector quality and print readiness':isVector?'Live vector paths from available engine SVG previews':'AI artwork generation from the connected engine')}
    <div class="abv2-art-grid-layout ${onlyValid.length===1?'single':''}">${onlyValid.map(side=>{
      const part=available().find(x=>x.side===side),url=previewUrl(part)||interimPreview(side);
      const active=state.busy&&state.activePipeline==='Production'&&ui.stageStatus!=='completed';
      return `<section class="abv2-card abv2-artwork"><header><h2>${surfaceLabel(side)} ${title}</h2><span>${esc(ui.stageStatus==='completed'?'Engine completed':state.stage||'Awaiting engine')}</span></header>
      <div class="abv2-art-canvas ${isVector?'vector-overlay':''} ${isValid?'validation-overlay':''}">
      ${url?`<img class="abv2-genuine-image" src="${url}" alt="${surfaceLabel(side)} verified engine preview">`:'<p>Waiting for actual engine output. No generated image is fabricated.</p>'}
      <span class="abv2-art-grid" aria-hidden="true"></span>
      ${isVector?'<svg class="abv2-real-paths" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>':''}
      ${active?'<span class="abv2-beam" aria-hidden="true"></span>':''}
      ${isVector?'<div class="abv2-path-status">Actual SVG paths will trace when the engine provides vector geometry.</div>':''}</div>
      <div class="abv2-side-note">${esc(ui.stageStatus==='completed'?(verified?'Validated file returned by engine': 'Backend completion reported'):state.stage||'Awaiting stage data')}</div></section>`;
      }).join('')}${liveLog()}</div>${navigation(title)}`;
  }
  function v2Downloads(){
    const p=project();const found=[];
    const parts=(p.surfaces||[]).filter(x=>!ui.selected.size||ui.selected.has(surfName(x)));
    for(const part of parts)for(const [format,path] of Object.entries(part.exports||{}))if(typeof path==='string'&&path)found.push({format,path,label:part.name||surfaceLabel(surfName(part))});
    for(const [format,path] of Object.entries(p.exports||{}))if(typeof path==='string'&&path)found.push({format,path,label:'Project'});
    if(!found.length)return '<p>No completed engine export files are available yet.</p>';
    return `<ul class="output-list">${found.map(item=>{const relative=item.path.replace(/^projects\/[^/]+\//,'');const uri='api/artboard/projects/'+encodeURIComponent(p.project_id)+'/artifacts/'+relative.split('/').map(encodeURIComponent).join('/');return `<li><button type="button" class="chip" data-download="artboard|${esc(uri)}">${esc(item.label)} · ${esc(item.format.toUpperCase())} ↓</button></li>`}).join('')}</ul>`;
  }
  function productionDetails(){
    const p=project(),items=available().filter(x=>!ui.selected.size||ui.selected.has(x.side));
    const validations=items.map(x=>x.validation||{}),v=validations[0]||p.validation||{};
    const first=(...values)=>{for(const value of values)if(value!==undefined&&value!==null&&value!=='')return value;return 'Not reported'};
    const total=items.map(x=>x.validation?.path_count).filter(x=>Number.isFinite(x));
    const paths=total.length===items.length&&total.length?total.reduce((a,b)=>a+b,0):first(v.path_count,p.validation?.path_count);
    const physical=v.physical_artboard||p.validation?.artboard||{};
    const specs=[
      ['Vector paths',paths],['Main paths',first(v.main_path_count,p.validation?.main_path_count)],
      ['Color mode',first(v.color_mode,p.validation?.color_mode)],
      ['PostScript level',first(v.postscript_level,p.validation?.postscript_level)],
      ['EPS version',first(v.eps_version,p.validation?.eps_version)],
      ['Canvas',physical.width_in&&physical.height_in?`${physical.width_in} × ${physical.height_in} in`:'22 × 31 in (requested)'],
      ['Raster DPI',first(v.dpi,p.validation?.dpi)],
      ['Editable true vector',p.true_vector_ready===true?'Engine-confirmed':p.true_vector_ready===false?'Not confirmed':'Not reported'],
      ['Print validation',first(v.status,p.validation?.status)]];
    return `<section class="abv2-production-details" aria-label="Production details"><h2>Production Details</h2><div class="abv2-tech-grid">${specs.map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div></section>`;
  }
  function exportPage(){const p=project(),parts=available().filter(x=>!ui.selected.size||ui.selected.has(x.side)),confirmed=p.true_vector_ready===true;
    const present=Object.entries(p.exports||{}).filter(([format,path])=>typeof path==='string'&&path);
    const formatEntries=[...new Set([...parts.flatMap(part=>Object.keys(part.exports||{})),...present.map(([f])=>f)])];
    const format=ui.downloadFormat||'';
    const links=[];for(const part of parts)for(const [fmt,path] of Object.entries(part.exports||{}))if(fmt===format&&typeof path==='string'&&path)links.push({label:surfaceLabel(part.side),path});
    for(const [fmt,path] of present)if(fmt===format)links.push({label:'Complete project',path});
    const dl=item=>{const relative=item.path.replace(/^projects\/[^/]+\//,'');const uri='api/artboard/projects/'+encodeURIComponent(p.project_id)+'/artifacts/'+relative.split('/').map(encodeURIComponent).join('/');return `<button type="button" class="abv2-btn" data-download="artboard|${esc(uri)}">↓ Download ${esc(item.label)}</button>`;};
    const zip=present.find(([fmt])=>fmt==='zip')||parts.flatMap(part=>Object.entries(part.exports||{})).find(([fmt,path])=>fmt==='zip'&&path);
    return `${top('Export Production','All delivered files are prepared before this page opens')}<div class="abv2-export-grid">
      <section class="abv2-export-left"><div class="abv2-card abv2-export-preview"><header><h2>Validated Artwork Preview</h2><span>${confirmed?'Validated vector':'Review engine validation'}</span></header>
      <div class="abv2-export-arts">${parts.map(part=>`<div><strong>${surfaceLabel(part.side)}</strong>${previewUrl(part)?`<img src="${previewUrl(part)}" alt="Real ${surfaceLabel(part.side)} completed artwork">`:'<p>Preview not available from the engine</p>'}</div>`).join('')||'<p>No final artwork detected.</p>'}</div></div>${productionDetails()}</section>
      <div class="abv2-card abv2-export-settings"><header><h2>Available Downloads</h2><small>${formatEntries.length} real formats</small></header><div class="abv2-format-grid">${['eps','svg','pdf','png'].map(f=>`<button type="button" class="abv2-format ${format===f?'selected':''}" data-abv2="select-format:${f}" aria-pressed="${format===f}" ${!formatEntries.includes(f)?'disabled':''}>${f.toUpperCase()}</button>`).join('')}</div><p class="abv2-info">${format?'Available '+format.toUpperCase()+' files':'No format selected. Select any available format to download.'}</p><div class="abv2-format-downloads">${links.map(dl).join('')}</div></div>
      <aside class="abv2-export-actions"><section class="abv2-card abv2-package"><header><h2>Master ZIP</h2></header><p>Download the complete pre-generated master package.</p>${zip?dl({label:'Master ZIP',path:zip[1]}):'<p class="abv2-info">ZIP artifact not returned by engine.</p>'}</section>
      <section class="abv2-card abv2-illustrator"><header><h2>Adobe Illustrator</h2></header><p>Open an editable SVG through your available desktop handoff, or download it for Illustrator.</p>${button('Continue to Illustrator','illustrator','amber',!formatEntries.includes('svg'))}</section></aside></div>
      <div class="abv2-export-bottom">${button('⌂ Home (Input Page)','home')}${button('← Previous Step','previous')}${button('＋ New Production','new','primary')}</div>`;
  }
  function display(){
    if(ui.phase==='input'&&state.artboardProject?.project_id&&state.artboardJob?.job_id&&!state.files.artboard){ui.selected=new Set(available().map(x=>x.side));ui.phase=state.activePipeline==='Export'&&!state.busy?'export':state.busy?'processing':'artwork';}
    const phase=ui.view||ui.phase;
    return `<section class="abv2" data-abv2-root>${phase==='input'?input():phase==='analyze'?analyze():phase==='artwork'||phase==='select'?select():phase==='export'?exportPage():processing()}</section>`;
  }
  let lastRenderedTool=state.tool;
  const ecosystemRender=render;
  render=function(...args){
    const entering=state.tool==='artboard'&&lastRenderedTool!=='artboard';
    document.body.classList.toggle('artboard-workspace',state.tool==='artboard');
    if(entering){document.body.classList.add('sidebar-collapsed');if(typeof closeMenu==='function')closeMenu();}
    if(state.tool!=='artboard')document.body.classList.remove('sidebar-collapsed');
    lastRenderedTool=state.tool;
    const btn=document.querySelector('#menuButton');
    if(btn&&state.tool==='artboard'&&typeof innerWidth!=='undefined'&&innerWidth>870)btn.setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-collapsed')));
    return ecosystemRender(...args);
  };
  const oldPreview=updateArtboardPreview, oldMonitor=updateMonitor;
  artboardPageV4=display;
  updateArtboardPreview=function(){if(state.tool==='artboard'&&document.querySelector('.abv2')){if(state.artboardPreviewPath&&state.artboardPreviewPath!==ui.lastPreviewPath){ui.lastPreviewPath=state.artboardPreviewPath;render();return;}refresh();return;}return oldPreview()};
  updateMonitor=function(){if(state.tool==='artboard'&&document.querySelector('.abv2')){refresh();return;}return oldMonitor()};
  // Actual SVG geometry only: parse an engine-served SVG preview and trace its real paths.
  // Never manufacture nodes when the engine offers only raster or an unavailable preview.
  let tracingUrl='', tracingPending=false;
  async function paintVectorOverlay(){
    if(ui.processingStage!=='Vectorization'||!state.artboardPreviewPath?.toLowerCase().endsWith('.svg'))return;
    const url=state.objectURLs.artboard_live,root=document.querySelector('.abv2-real-paths');
    if(!url||!root||tracingUrl===url||tracingPending)return;
    tracingPending=true;
    try{
      const response=await fetch(url);if(!response.ok)throw Error('SVG preview not available');
      const text=await response.text();if(text.length>5_000_000)throw Error('SVG too large for live path overlay');
      const doc=new DOMParser().parseFromString(text,'image/svg+xml');
      if(doc.querySelector('parsererror'))throw Error('Malformed SVG preview');
      const source=doc.documentElement, raw=source.getAttribute('viewBox');
      const viewBox=raw&&/^[-\d., eE+]+$/.test(raw)?raw:null;
      if(!viewBox)return;
      root.replaceChildren();root.setAttribute('viewBox',viewBox);
      root.setAttribute('preserveAspectRatio','xMidYMid meet');
      const nodes=[...doc.querySelectorAll('path[d]')].slice(0,170);
      for(const node of nodes){
        const d=node.getAttribute('d');if(!d||d.length>100_000||!/^[MmLlHhVvCcSsQqTtAaZz0-9.eE,+\-\s]+$/.test(d))continue;
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','#16f8ff');path.setAttribute('stroke-width','1.25');
        const transforms=[];for(let p=node;p&&p!==source;p=p.parentElement)if(p.getAttribute('transform'))transforms.unshift(p.getAttribute('transform'));
        if(transforms.length&&transforms.join(' ').length<500)path.setAttribute('transform',transforms.join(' '));
        root.appendChild(path);
        let length=0;try{length=path.getTotalLength();}catch{}
        if(length>0){path.style.strokeDasharray=String(length);path.style.strokeDashoffset=String(length);path.style.setProperty('--path-length',String(length));path.classList.add('abv2-trace-path');
          if(root.childElementCount<65){for(let i=1;i<=3;i++){
            const pt=path.getPointAtLength(length*i/4),dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
            dot.setAttribute('cx',String(pt.x));dot.setAttribute('cy',String(pt.y));dot.setAttribute('r','1.5');dot.setAttribute('fill','#96fff9');root.appendChild(dot);
          }}
        }
      }
      tracingUrl=url;
    }catch(e){tracingUrl='';}finally{tracingPending=false;}
  }
  function syncProductionStage(){
    if(ui.phase!=='processing'||ui.view||state.activePipeline!=='Production')return;
    const candidates=[...(state.artboardEvents||[]).map(e=>stageOf(e.step||e.stage||'')),stageOf(state.stage)].filter(x=>x&&['Artwork Creation','Vectorization','Validation'].includes(x));
    const order={'Artwork Creation':0,'Vectorization':1,'Validation':2};
    const next=candidates.reduce((a,b)=>order[b]>order[a]?b:a,ui.processingStage||'Artwork Creation');
    if(next!==ui.processingStage){ui.processingStage=next;ui.visitedStages.add(next);render();}
  }
  function refresh(){
    const root=document.querySelector('.abv2');if(!root)return;
    const monitor=root.querySelector('.abv2-current');
    if(monitor){const title=currentStage(),v=stageProgress(),events=stageEvents();monitor.querySelector('strong').textContent=ui.stageStatus==='completed'?'Stage completed':state.lastError?'Error':state.busy&&events.length?'Engine processing':'Awaiting stage events';monitor.querySelector('b').textContent=v==null?(state.busy?'Live':'—'):Math.round(v)+'%';const bar=monitor.querySelector('.abv2-progress');bar?.classList.toggle('indeterminate',state.busy&&v==null);if(bar?.firstElementChild)bar.firstElementChild.style.width=(v??25)+'%';}
    const events=root.querySelector('.abv2-log ol');if(events)events.innerHTML=stageEvents().length?stageEvents().map(x=>`<li><span>${esc(x.step||x.stage||'Engine event')}</span><small>${typeof x.stage_progress==='number'?Math.round(x.stage_progress)+'%':safeTime(x.at)}</small></li>`).join(''):'<li><span>No stage events reported yet.</span></li>';
    const status=root.querySelector('.abv2-step-label');if(status)status.textContent=state.stage||statusText();
    if(ui.phase==='processing'){
      const live=state.objectURLs.artboard_live;
      if(live){for(const [side,item] of available().map(x=>[x.side,x])){
        const img=root.querySelector('.abv2-artwork img[alt="'+surfaceLabel(side)+' verified engine preview"]');
        const url=previewUrl(item)||interimPreview(side);if(img&&url&&img.getAttribute('src')!==url)img.src=url;
      }}
      if(ui.processingStage==='Vectorization')void paintVectorOverlay();
      syncProductionStage();
    }
    if(ui.phase==='processing'&&ui.processingStage==='Artwork Creation'&&state.objectURLs.artboard_live){
      const previewSide=available().length===1?available()[0].side:null;
      if(previewSide){const image=root.querySelector('.abv2-artwork img');const url=interimPreview(previewSide);if(image&&url&&image.getAttribute('src')!==url)image.src=url;}
    }
  }
  async function start(){const f=state.files.artboard;if(!f)return notify('Upload a supported file first');if(!connected('artboard'))return notify('Artboard engine is unavailable');
    ui.selected.clear();ui.prepared=[];ui.visitedStages.clear();ui.stageStatus='';ui.lastPreviewPath='';state.artboardPreviewPath='';ui.view=null;ui.phase='analyze';ui.analysisDone=false;ui.generationStarted=false;ui.processingStage='';ui.downloadFormat='';ui.cancelRequested=false;
    await run('Artboard source upload',async()=>{state.artboardEvents=[];state.artboardEventKeys.clear();state.artboardJob=null;state.lastMode=state.mode.artboard;state.progress=null;
      const p=await call('artboard','api/artboard/projects',{method:'POST',json:{name:f.name.slice(0,120),processing_mode:state.lastMode}});state.artboardProject=p;state.artboardResult=p;
      const fd=new FormData();fd.append('project_id',p.project_id);fd.append('file',f);state.artboardResult=await call('artboard','api/artboard/upload',{method:'POST',body:fd});state.activePipeline='Upload';state.stage='Source uploaded';state.progress=null;});
    if(!state.lastError)await analyzeSurfaces();
  }
  async function analyzeSurfaces(){const id=project().project_id;if(!id)return;await run('Analyze uploaded artwork',async()=>{
    ui.phase='analyze';state.activePipeline='Prepare';state.stage='Analyzing artwork';state.progress=null;render();
    // The v0.3.1 engine needs surface names in its prepare request. Try both, then
    // automatically fall back to a verified single surface only if detection fails.
    let prepared=false,lastFailure=null;const attempts=[['front_body','back_body'],['front_body'],['back_body']];
    for(const surfaces of attempts){try{
      state.artboardEvents=[];state.artboardEventKeys.clear();state.stage='Scanning '+surfaces.map(surfaceLabel).join(' + ');render();
      const job=await call('artboard','api/artboard/prepare',{method:'POST',json:{project_id:id,surfaces,auto:true,width_in:22,height_in:31}});
      captureJob('Artboard',job);await jobPoll('artboard','api/artboard/jobs/'+job.job_id,'Prepare');
      state.artboardResult=await call('artboard','api/artboard/projects/'+id);
      if(available().length){prepared=true;break;}throw Error('Engine returned no prepared surfaces');
    }catch(e){lastFailure=e;
      if(!/surface|not visible|not found|locat|detect|independently|component|geometry|missing/i.test(e.message))throw e;
      log('Auto-detection attempt reported: '+e.message);
    }}
    if(!prepared)throw Error('Unable to verify a visible surface automatically: '+(lastFailure?.message||'No result'));
    ui.analysisDone=true;ui.prepared=available();ui.selected=new Set(available().map(x=>x.side));ui.phase='artwork';ui.processingStage='Artwork Creation';state.stage='Analysis complete';state.progress=null;render();
  });
  }
  async function produce(){if(!ui.selected.size)return notify('Select one or more available artwork sides');const id=project().project_id;if(!id)return notify('No prepared project');
    const actual=available().map(x=>x.side),requested=[...ui.selected];if(requested.some(x=>!actual.includes(x)))return notify('Selected side was not detected');
    ui.view=null;ui.generationStarted=true;ui.visitedStages.clear();ui.stageStatus='';
    await run('Artboard artwork generation and vector processing',async()=>{
      if(actual.length!==requested.length){state.activePipeline='Prepare';state.stage='Preparing selected side(s)';ui.phase='artwork';render();
        const j=await call('artboard','api/artboard/prepare',{method:'POST',json:{project_id:id,surfaces:requested,auto:true,width_in:22,height_in:31}});captureJob('Artboard',j);await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Prepare');state.artboardResult=await call('artboard','api/artboard/projects/'+id);}
      ui.phase='processing';ui.processingStage='Artwork Creation';ui.visitedStages.add('Artwork Creation');state.activePipeline='Production';state.stage='Generating AI artwork';state.progress=null;state.artboardEvents=[];state.artboardEventKeys.clear();render();
      let j=await call('artboard','api/artboard/production',{method:'POST',json:{project_id:id,ai_reconstruction:true,processing_mode:state.lastMode||state.mode.artboard}});captureJob('Artboard',j);await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Production');
      state.artboardResult=await call('artboard','api/artboard/projects/'+id);
      if(state.artboardResult.true_vector_ready!==true)throw Error('Vector validation is not confirmed by the engine; export cannot proceed');
      // Replay confirmed stages only if the backend finished between polls.
      // This is a completed-result review, not a fabricated live processing stage.
      ui.stageStatus='completed';
      for(const stage of ['Vectorization','Validation']){
        if(!ui.visitedStages.has(stage)){
          ui.processingStage=stage;ui.visitedStages.add(stage);
          state.stage=stage+' complete — verified engine result';render();
          await new Promise(resolve=>setTimeout(resolve,1800));
        }
      }
      // Validate the engine-confirmed result before preparing exports.
      ui.processingStage='Validation';state.activePipeline='Validation';state.stage='Validated vector — preparing export files';render();
      // All supported formats generated before final Export page.
      // Do not show the final Export page until backend files exist.
      state.activePipeline='Export';state.stage='Preparing EPS SVG PDF PNG ZIP';state.progress=null;
      j=await call('artboard','api/artboard/export',{method:'POST',json:{project_id:id,formats:['eps','svg','pdf','png','zip'],bundle:'production_pack'}});
      captureJob('Artboard',j);await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Export');state.artboardResult=await call('artboard','api/artboard/projects/'+id);
      if(!artboardTelemetry().exports.length)throw Error('Engine returned no exported files');
      ui.phase='export';ui.processingStage='Export';ui.downloadFormat='';state.stage='Production complete';state.progress=null;
    });render();
  }
  async function stop(){if(!state.busy||!state.artboardJob?.job_id){notify('No cancellable Artboard job is currently active');return;}
    try {const j=state.artboardJob;await call('artboard','api/artboard/jobs/'+encodeURIComponent(j.job_id)+'/cancel',{method:'POST'});ui.cancelRequested=true;notify('Cancellation requested. Waiting for engine confirmation.');}
    catch(e){notify('Cancellation failed: '+e.message)}
  }
  function reset(){if(state.busy)return notify('Stop the running job before returning to input');ui.phase='input';ui.view=null;ui.analysisDone=false;ui.generationStarted=false;ui.processingStage='';ui.downloadFormat='';ui.prepared=[];ui.selected.clear();ui.visitedStages.clear();ui.stageStatus='';ui.lastPreviewPath='';state.artboardPreviewPath='';state.files.artboard=null;state.artboardProject=null;state.artboardResult=null;state.artboardJob=null;for(const key of ['artboard','artboard_live']){if(state.objectURLs[key])URL.revokeObjectURL(state.objectURLs[key]);delete state.objectURLs[key];}state.stage='';state.progress=null;state.lastError='';state.logs=[];try{sessionStorage.removeItem('mj_artboard_job')}catch{}render();}
  // Protect all ecosystem buttons: intercept only Artboard V2-specific actions in capture phase.
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button[data-abv2]');if(!b)return;
    e.preventDefault();e.stopPropagation();const a=b.dataset.abv2;
    if(a==='start')return start();if(a==='produce')return produce();if(a==='stop')return stop();
    if(a==='clear'){if(state.busy)return;state.files.artboard=null;const u=state.objectURLs.artboard;if(u)URL.revokeObjectURL(u);delete state.objectURLs.artboard;render();return}
    if(a==='home'||a==='new')return reset();
    if(a==='illustrator')return continueWithIllustrator();if(a.startsWith('select-format:')){ui.downloadFormat=a.split(':')[1];render();return;}
    if(a==='previous'){if(state.busy)return notify('Active job: stop processing before changing stages');if(ui.phase==='export'){ui.view='processing';ui.processingStage='Validation';}else if(ui.phase==='artwork')ui.view='analyze';else if(ui.phase==='analyze')ui.view='input';else {ui.view='artwork';} render();return}
    if(a.startsWith('mode:')){if(state.busy)return;state.mode.artboard=a.split(':')[1];render();return}
    if(a.startsWith('recreate:'))return notify('AI missing-side recreation is not exposed through this frontend’s existing Artboard gateway allowlist. No request was submitted.');
  },true);
  document.addEventListener('change',e=>{const visible=e.target.closest('[data-abv2-visible]');if(visible){const side=visible.dataset.abv2Visible;if(visible.checked)ui.visibleChoice.add(side);else ui.visibleChoice.delete(side);render();return;}const b=e.target.closest('[data-abv2-select]');if(!b)return;const side=b.dataset.abv2Select;if(b.checked)ui.selected.add(side);else ui.selected.delete(side);render();},true);
  document.addEventListener('change',e=>{if(e.target?.dataset?.file!=='artboard')return;ui.dimensions='';const f=e.target.files?.[0];if(!f||!f.type.startsWith('image/')||f.type.includes('svg'))return;const image=new Image();const url=URL.createObjectURL(f);image.onload=()=>{ui.dimensions=`${image.naturalWidth} × ${image.naturalHeight} px`;URL.revokeObjectURL(url);if(state.files.artboard===f)render()};image.onerror=()=>URL.revokeObjectURL(url);image.src=url;});
  // Preserve the ecosystem menu behavior, but collapse the sidebar when Artboard opens.
  document.addEventListener('click',e=>{const t=e.target.closest('[data-tool]');if(t?.dataset.tool==='artboard'){ui.view=null;if(!state.artboardProject&&!state.busy)ui.phase='input';document.body.classList.add('sidebar-collapsed');if(typeof closeMenu==='function')closeMenu()}},true);
  // Keep the existing start action available for code paths that call it directly.
  startArtboard=start;
  if(state.tool==='artboard'){document.body.classList.add('artboard-workspace');document.body.classList.add('sidebar-collapsed');render();}
})();
