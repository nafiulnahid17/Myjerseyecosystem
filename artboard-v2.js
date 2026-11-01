'use strict';
/* Artboard AI V2: frontend-only replacement. Existing gateways, endpoints and other tools untouched. */
(() => {
  const ui = {
    phase: 'input', selected: new Set(), prepared: [], inspected: false,
    view: null, dimensions: '', awaitingSurfaces: false, visibleChoice: new Set(['front_body']), processingStarted: false, cancelRequested: false
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
  function navigation(current){const idx=steps.indexOf(current);return `<div class="abv2-nav">${button('← Previous Step','previous','',idx<=0)}${button('■ Stop','stop','danger',!state.busy)}${button('Next Step →','next','primary',state.busy||idx===steps.length-1)}</div>`;}
  function bars(){return `<div class="abv2-progress ${state.busy&&state.progress==null?'indeterminate':''}" aria-label="Current engine progress"><span style="width:${state.progress==null?26:Math.max(0,Math.min(100,state.progress))}%"></span></div>`;}
  function liveLog(){
    const events=(state.artboardEvents||[]).slice(-12);
    const realLogs=events.length?events.map(e=>({message:e.step||'Engine event',progress:e.progress,at:e.at})):state.logs.slice(-10).map(v=>({message:v}));
    return `<aside class="abv2-card abv2-log"><header><h2>▤ Working Log</h2><small>${esc(state.lastJobId?state.lastJobId.slice(0,12):'Awaiting job')}</small></header>
      <div class="abv2-current"><strong>${esc(statusText())}</strong><b>${pct()}</b>${bars()}</div>
      <ol aria-label="Actual engine events">${realLogs.length?realLogs.map(x=>`<li><span>${esc(x.message)}</span><small>${x.progress!=null?Math.round(x.progress)+'%':safeTime(x.at)||'Event'}</small></li>`).join(''):'<li>No engine events yet.</li>'}</ol>
      <div class="abv2-log-footer"><span>Mode: ${esc(state.mode.artboard==='quality'?'Quality':'Normal')}</span><span>Source: real API</span></div></aside>`;
  }
  function originalPreview(){const url=state.objectURLs.artboard;return `<div class="abv2-visual abv2-scan ${state.busy?'active':''}">${url?`<img src="${url}" alt="Uploaded original design">`:`<div class="abv2-empty">Source preview is unavailable for this file format.</div>`}<span class="abv2-corners" aria-hidden="true"></span><span class="abv2-beam" aria-hidden="true"></span></div>`;}
  function artworkCard(side){
    const item=available().find(x=>x.side===side), label=surfaceLabel(side),chosen=ui.selected.has(side), url=previewUrl(item);
    const file=state.objectURLs.artboard;
    return `<article class="abv2-card abv2-artwork ${chosen?'selected':''}"><header><h2>${label} Artwork</h2><span>${item?'Detected':'Not detected'}</span></header>
      <div class="abv2-art-canvas">${url?`<img src="${url}" alt="Actual ${label} output">`:item&&file?`<img src="${file}" alt="Original source; no generated ${label} artwork yet">`:item?'<p>Available for processing</p>':'<p>No source artwork detected</p>'}<span class="abv2-art-grid" aria-hidden="true"></span></div>
      ${item?`<label class="abv2-select"><input type="checkbox" data-abv2-select="${side}" ${chosen?'checked':''}> Select ${label} for production</label>`:
      button('✦ Recreate '+label+' with AI','recreate:'+side,'secondary')}
      ${!url&&item?'<small class="abv2-source-note">Preview shows the source until an actual generated artifact is available.</small>':''}
    </article>`;
  }
  function input(){
    const file=state.files.artboard, url=state.objectURLs.artboard;
    return `${top('Artboard AI','AI JERSEY ARTWORK ENGINE')}<div class="abv2-input-shell">
      <div class="abv2-modes"><b>Production Mode</b><div>${button('◇ Quality Mode','mode:quality',state.mode.artboard==='quality'?'active':'')}${button('⚡ Normal Mode','mode:cost_effective',state.mode.artboard==='cost_effective'?'active':'')}</div></div>
      <div class="abv2-drop" data-droptool="artboard"><div class="abv2-upload-icon">⇧</div><strong>Drag &amp; Drop Your Design Here</strong><small>or click to upload</small><p>PNG · JPG · WEBP · PDF</p><input type="file" data-file="artboard" aria-label="Upload artwork" accept=".png,.jpg,.jpeg,.webp,.pdf"></div>
      ${file?`<div class="abv2-file">${url?`<img src="${url}" alt="Input thumbnail">`:''}<div><strong>${esc(file.name)}</strong><small>${fmtSize(file.size)} · ${esc(file.type||'Unknown media type')}${ui.dimensions?' · '+esc(ui.dimensions):''}</small></div><span>Selected input</span></div>`:''}
      <div class="abv2-commands">${button('▤ Clear Input','clear','danger',!file||state.busy)}${button('▷ Start Production','start','primary',!file||state.busy||!connected('artboard'))}</div>
    </div>`;
  }
  function analyze(){const gate=ui.awaitingSurfaces?`<div class="abv2-visible-gate"><strong>Select visible body surfaces in your original input</strong><p>The existing engine requires this selection before analyzing; it never assumes an unseen side exists.</p><div>${['front_body','back_body'].map(s=>`<label><input type="checkbox" data-abv2-visible="${s}" ${ui.visibleChoice.has(s)?'checked':''}> ${surfaceLabel(s)}</label>`).join('')}</div>${button('Scan Selected Surfaces →','analyze-surfaces','primary',!ui.visibleChoice.size)}</div>`:'';return `${top('Analyzing Original Input',ui.awaitingSurfaces?'Select the visible source side(s) for the existing engine':'Live scan of the uploaded reference; real engine results only')}<div class="abv2-process-grid"><div class="abv2-primary"><section class="abv2-card abv2-preview"><header><h2>● Live Preview</h2><span>${esc(statusText())} · ${pct()}</span></header>${originalPreview()}${gate}<div class="abv2-preview-foot"><span>Input received</span><span>${ui.awaitingSurfaces?'Select visible surfaces':state.busy?'Scanning original':'Analysis completed'}</span></div></section>${navigation('Analyze')}</div>${liveLog()}</div>`;}
  function select(){const p=project(), n=available().length;return `${top('Artwork Creation','Select only the side(s) you want to vectorize. AI recreation is optional.')}<div class="abv2-select-summary">${n?`${n} prepared visible ${n===1?'surface':'surfaces'} · Choose one or both`:'No independently visible surfaces confirmed by the engine'}</div><div class="abv2-art-grid-layout">${artworkCard('front_body')}${artworkCard('back_body')}${liveLog()}</div><div class="abv2-select-actions">${button('← Input Page','home')}${button('Continue to Vectorization →','produce','primary',!ui.selected.size||state.busy)}</div>`;}
  function processTitle(){const detected=artboardStageIndex();return detected>=5?'Export':detected===4?'Validation':detected===3?'Vectorization':'Artwork Creation';}
  function processing(){
    const title=ui.phase==='export'?'Export':processTitle();
    if(title==='Export')return exportPage();
    const subsets=ui.selected.size?[...ui.selected]:available().map(x=>x.side);
    return `${top(title,title==='Validation'?'Scanning vector integrity and print readiness':title==='Vectorization'?'Building real editable paths and clean contours':'Generating flat 22 × 31 inch artwork')}
      <div class="abv2-art-grid-layout ${subsets.length===1?'single':''}">
      ${subsets.map(side=>{const part=available().find(x=>x.side===side),url=previewUrl(part)||(subsets.length===1?state.objectURLs.artboard_live:'');const isVector=title==='Vectorization',isValid=title==='Validation';return `<section class="abv2-card abv2-artwork"><header><h2>${surfaceLabel(side)} — ${esc(title)}</h2><span>${pct()}</span></header><div class="abv2-art-canvas ${isVector?'vector-overlay':''} ${isValid?'validation-overlay':''}">${url?`<img src="${url}" alt="${surfaceLabel(side)} actual available preview">`:'<p>Waiting for actual engine preview</p>'}<span class="abv2-art-grid" aria-hidden="true"></span>${state.busy?'<span class="abv2-beam" aria-hidden="true"></span>':''}</div><div class="abv2-side-note">${esc(state.stage||'Awaiting server state')}</div></section>`}).join('')}${liveLog()}</div>${navigation(title)}`;
  }
  function v2Downloads(){
    const p=project();const found=[];
    const parts=(p.surfaces||[]).filter(x=>!ui.selected.size||ui.selected.has(surfName(x)));
    for(const part of parts)for(const [format,path] of Object.entries(part.exports||{}))if(typeof path==='string'&&path)found.push({format,path,label:part.name||surfaceLabel(surfName(part))});
    for(const [format,path] of Object.entries(p.exports||{}))if(typeof path==='string'&&path)found.push({format,path,label:'Project'});
    if(!found.length)return '<p>No completed engine export files are available yet.</p>';
    return `<ul class="output-list">${found.map(item=>{const relative=item.path.replace(/^projects\/[^/]+\//,'');const uri='api/artboard/projects/'+encodeURIComponent(p.project_id)+'/artifacts/'+relative.split('/').map(encodeURIComponent).join('/');return `<li><button type="button" class="chip" data-download="artboard|${esc(uri)}">${esc(item.label)} · ${esc(item.format.toUpperCase())} ↓</button></li>`}).join('')}</ul>`;
  }
  function exportPage(){
    const d=artboardTelemetry(), p=project(), parts=available().filter(x=>!ui.selected.size||ui.selected.has(x.side));
    const confirmed=p.true_vector_ready===true;
    return `${top('Export Production','Validated artwork files and Illustrator-compatible delivery')}
    <div class="abv2-export-grid"><div class="abv2-card abv2-export-preview"><header><h2>Live Preview — Final Output</h2><span>${confirmed?'True vector ready':'Awaiting validation'}</span></header><div class="abv2-export-arts">${parts.length?parts.map(part=>`<div><strong>${surfaceLabel(part.side)}</strong>${previewUrl(part)?`<img src="${previewUrl(part)}" alt="${surfaceLabel(part.side)} real output">`:'<p>No preview artifact supplied</p>'}</div>`).join(''):'<p>No prepared artwork available</p>'}</div></div>
    <div class="abv2-card abv2-export-settings"><header><h2>Export Options</h2><small>Existing API formats</small></header><div class="abv2-format-grid">${['eps','svg','pdf','png','zip'].map(f=>`<button type="button" class="abv2-format ${state.formats.artboard.includes(f)?'selected':''}" data-format="${f}" aria-pressed="${state.formats.artboard.includes(f)}">${f.toUpperCase()}</button>`).join('')}</div><div class="abv2-facts"><span>Canvas <b>22 × 31 in</b></span><span>Color mode <b>${esc(d.partValidation?.color_mode||'Not reported')}</b></span><span>Paths <b>${d.partValidation?.path_count??d.validation?.path_count??'Not reported'}</b></span></div>${button('Generate Selected Formats','export-formats','primary',state.busy||!project().project_id)}</div>
    <aside class="abv2-card abv2-package"><header><h2>Download Package</h2></header><p>Only real generated files are downloadable.</p>${v2Downloads()}${d.exports.some(x=>x.format==='zip')?`<p class="abv2-package-note">ZIP package available in downloads above.</p>`:''}<div>${button('Continue to Illustrator','illustrator','amber',!d.exports.some(x=>x.format==='svg'))}</div></aside></div>
    <div class="abv2-export-bottom">${button('⌂ Home (Input Page)','home')}${button('← Previous Step','previous')}${button('＋ Continue to New Production','new','primary')}</div>`;
  }
  function display(){
    if(ui.phase==='input'&&state.artboardProject?.project_id&&state.artboardJob?.job_id&&!state.files.artboard){ui.selected=new Set(available().map(x=>x.side));ui.phase=state.activePipeline==='Export'&&!state.busy?'export':state.busy?'processing':'select';}
    const phase=ui.view||ui.phase;
    return `<section class="abv2" data-abv2-root>${phase==='input'?input():phase==='analyze'?analyze():phase==='select'?select():phase==='export'?exportPage():processing()}</section>`;
  }
  const oldPreview=updateArtboardPreview, oldMonitor=updateMonitor;
  artboardPageV4=display;
  updateArtboardPreview=function(){if(state.tool==='artboard'&&document.querySelector('.abv2')){refresh();return;}return oldPreview()};
  updateMonitor=function(){if(state.tool==='artboard'&&document.querySelector('.abv2')){refresh();return;}return oldMonitor()};
  function refresh(){
    const root=document.querySelector('.abv2');if(!root)return;
    const monitor=root.querySelector('.abv2-current');
    if(monitor){monitor.querySelector('strong').textContent=statusText();monitor.querySelector('b').textContent=pct();const bar=monitor.querySelector('.abv2-progress');bar?.classList.toggle('indeterminate',state.busy&&state.progress==null);if(bar?.firstElementChild)bar.firstElementChild.style.width=(state.progress??26)+'%';}
    const events=root.querySelector('.abv2-log ol');if(events){const arr=(state.artboardEvents||[]).slice(-12);events.innerHTML=arr.length?arr.map(x=>`<li><span>${esc(x.step||'Engine event')}</span><small>${typeof x.progress==='number'?Math.round(x.progress)+'%':safeTime(x.at)}</small></li>`).join(''):state.logs.slice(-10).map(x=>`<li><span>${esc(x)}</span></li>`).join('');}
    const status=root.querySelector('.abv2-step-label');if(status)status.textContent=state.stage||statusText();
    const live=root.querySelector('.abv2-art-canvas img');if(live&&state.objectURLs.artboard_live&&['processing','artwork'].includes(ui.phase))live.src=state.objectURLs.artboard_live;
    if(ui.phase==='processing'&&ui.view==null){const next=processTitle();if(root.querySelector('.abv2-header h1')?.textContent!==next)render();}
  }
  async function start(){
    const f=state.files.artboard;if(!f) return notify('Upload a supported artwork file first');
    if(!connected('artboard'))return notify('Artboard engine is not available from the current gateway');
    ui.prepared=[];ui.selected.clear();ui.view=null;ui.phase='analyze';ui.awaitingSurfaces=true;ui.visibleChoice=new Set(['front_body']);ui.cancelRequested=false;
    await run('Artboard source upload',async()=>{
      state.lastError='';state.artboardEvents=[];state.artboardEventKeys.clear();state.artboardJob=null;state.lastMode=state.mode.artboard;
      const p=await call('artboard','api/artboard/projects',{method:'POST',json:{name:f.name.slice(0,120),processing_mode:state.lastMode}});
      state.artboardProject=p;state.artboardResult=p;
      const fd=new FormData();fd.append('project_id',p.project_id);fd.append('file',f);
      state.artboardResult=await call('artboard','api/artboard/upload',{method:'POST',body:fd});
      state.activePipeline='Upload';state.stage='Source uploaded';state.progress=null;ui.phase='analyze';
    });
  }
  async function analyzeSurfaces(){
    if(state.busy||!ui.visibleChoice.size)return notify('Select a visible front and/or back surface');
    const id=project().project_id;if(!id)return notify('Upload a design first');
    await run('Artboard original analysis',async()=>{
      ui.awaitingSurfaces=false;ui.phase='analyze';state.activePipeline='Prepare';state.stage='Analyzing selected surfaces';state.progress=null;render();
      let j=await call('artboard','api/artboard/prepare',{method:'POST',json:{project_id:id,surfaces:[...ui.visibleChoice],auto:true,width_in:22,height_in:31}});
      captureJob('Artboard',j);await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Prepare');
      state.artboardResult=await call('artboard','api/artboard/projects/'+id);
      ui.prepared=available();ui.selected=new Set(ui.prepared.map(x=>x.side));ui.phase='select';state.stage='Analysis complete';state.progress=null;
    });
    if(state.lastError)ui.awaitingSurfaces=true;
    render();
  }
  async function produce(){
    if(ui.selected.size<1)return notify('Select at least one available artwork side');
    const id=project().project_id;if(!id)return notify('No prepared Artboard project found');
    const actual=available().map(x=>x.side);const requested=[...ui.selected];
    if(requested.some(x=>!actual.includes(x)))return notify('The selected artwork was not prepared by the engine');
    await run('Artboard production',async()=>{
      // Re-prepare only the user-selected side(s) if this engine prepared additional visible surfaces.
      if(actual.length!==requested.length){
        state.activePipeline='Prepare';state.stage='Preparing selected sides';ui.phase='analyze';render();
        const j=await call('artboard','api/artboard/prepare',{method:'POST',json:{project_id:id,surfaces:requested,auto:true,width_in:22,height_in:31}});
        captureJob('Artboard',j);await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Prepare');
      }
      ui.phase='processing';state.activePipeline='Production';state.stage='Generating AI artwork';state.progress=null;render();
      let j=await call('artboard','api/artboard/production',{method:'POST',json:{project_id:id,ai_reconstruction:true,processing_mode:state.lastMode||state.mode.artboard}});
      captureJob('Artboard',j);await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Production');
      state.artboardResult=await call('artboard','api/artboard/projects/'+id);render();
      const formats=[...state.formats.artboard];if(!formats.length)throw Error('Select at least one export format');
      state.activePipeline='Export';state.stage='Exporting validated files';state.progress=null;render();
      j=await call('artboard','api/artboard/export',{method:'POST',json:{project_id:id,formats,bundle:formats.includes('zip')?'production_pack':'selected_files'}});
      captureJob('Artboard',j);await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Export');
      state.artboardResult=await call('artboard','api/artboard/projects/'+id);
      ui.phase='export';state.stage='Production complete';state.progress=100;
    });
  }
  async function exportFormats(){
    const id=project().project_id;if(!id||!state.formats.artboard.length)return notify('Select at least one supported export format');
    if(state.busy)return;
    await run('Artboard selected-format export',async()=>{
      ui.phase='processing';state.activePipeline='Export';state.stage='Generating selected export files';state.progress=null;render();
      const formats=[...state.formats.artboard];
      const j=await call('artboard','api/artboard/export',{method:'POST',json:{project_id:id,formats,bundle:formats.includes('zip')?'production_pack':'selected_files'}});
      captureJob('Artboard',j);await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Export');
      state.artboardResult=await call('artboard','api/artboard/projects/'+id);ui.phase='export';state.stage='Export completed';state.progress=100;
    });
    render();
  }
  async function stop(){if(!state.busy||!state.artboardJob?.job_id){notify('No cancellable Artboard job is currently active');return;}
    try {const j=state.artboardJob;await call('artboard','api/artboard/jobs/'+encodeURIComponent(j.job_id)+'/cancel',{method:'POST'});ui.cancelRequested=true;notify('Cancellation requested. Waiting for engine confirmation.');}
    catch(e){notify('Cancellation failed: '+e.message)}
  }
  function reset(){if(state.busy)return notify('Stop the running job before returning to input');ui.phase='input';ui.view=null;ui.awaitingSurfaces=false;ui.prepared=[];ui.selected.clear();state.files.artboard=null;state.artboardProject=null;state.artboardResult=null;state.artboardJob=null;for(const key of ['artboard','artboard_live']){if(state.objectURLs[key])URL.revokeObjectURL(state.objectURLs[key]);delete state.objectURLs[key];}state.stage='';state.progress=null;state.lastError='';state.logs=[];try{sessionStorage.removeItem('mj_artboard_job')}catch{}render();}
  // Protect all ecosystem buttons: intercept only Artboard V2-specific actions in capture phase.
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button[data-abv2]');if(!b)return;
    e.preventDefault();e.stopPropagation();const a=b.dataset.abv2;
    if(a==='start')return start();if(a==='analyze-surfaces')return analyzeSurfaces();if(a==='produce')return produce();if(a==='stop')return stop();
    if(a==='clear'){if(state.busy)return;state.files.artboard=null;const u=state.objectURLs.artboard;if(u)URL.revokeObjectURL(u);delete state.objectURLs.artboard;render();return}
    if(a==='home'||a==='new')return reset();
    if(a==='illustrator')return continueWithIllustrator();if(a==='export-formats')return exportFormats();
    if(a==='previous'){if(state.busy)return notify('Active job: stop processing before changing stages');if(ui.phase==='export')ui.view='processing';else if(ui.phase==='select')ui.view='analyze';else if(ui.phase==='analyze')ui.view='input';else ui.view='select';render();return}
    if(a==='next'){if(state.busy)return notify('Current stage is still processing');if(ui.view){ui.view=null;render();return}if(ui.phase==='select')return produce();notify('Waiting for actual engine completion');return}
    if(a.startsWith('mode:')){if(state.busy)return;state.mode.artboard=a.split(':')[1];render();return}
    if(a.startsWith('recreate:'))return notify('AI missing-side recreation is not exposed through this frontend’s existing Artboard gateway allowlist. No request was submitted.');
  },true);
  document.addEventListener('change',e=>{const visible=e.target.closest('[data-abv2-visible]');if(visible){const side=visible.dataset.abv2Visible;if(visible.checked)ui.visibleChoice.add(side);else ui.visibleChoice.delete(side);render();return;}const b=e.target.closest('[data-abv2-select]');if(!b)return;const side=b.dataset.abv2Select;if(b.checked)ui.selected.add(side);else ui.selected.delete(side);render();},true);
  document.addEventListener('change',e=>{if(e.target?.dataset?.file!=='artboard')return;ui.dimensions='';const f=e.target.files?.[0];if(!f||!f.type.startsWith('image/')||f.type.includes('svg'))return;const image=new Image();const url=URL.createObjectURL(f);image.onload=()=>{ui.dimensions=`${image.naturalWidth} × ${image.naturalHeight} px`;URL.revokeObjectURL(url);if(state.files.artboard===f)render()};image.onerror=()=>URL.revokeObjectURL(url);image.src=url;});
  // Preserve the ecosystem menu behavior, but collapse the sidebar when Artboard opens.
  document.addEventListener('click',e=>{const t=e.target.closest('[data-tool]');if(t?.dataset.tool==='artboard'){ui.view=null;if(!state.artboardProject&&!state.busy)ui.phase='input';document.body.classList.add('sidebar-collapsed')}},true);
  // Keep the existing start action available for code paths that call it directly.
  startArtboard=start;
  if(state.tool==='artboard')render();
})();
