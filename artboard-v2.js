'use strict';
/* Artboard AI V2: frontend-only replacement. Existing gateways, endpoints and other tools untouched. */
(() => {
  const ui = {
    vectorOverlaySource:null, analysisDone:false, generationStarted:false, processingStage:'', downloadFormat:'',
    phase: 'input', preferInput:false, workspaceEpoch:0, selected: new Set(), prepared: [], inspected: false,
    view: null, visitedStages: new Set(), stageStatus: '', lastPreviewPath:'', dimensions: '', awaitingSurfaces: false, visibleChoice: new Set(['front_body']), processingStarted: false, cancelRequested: false, productionDone:false, continued:false, finishing:false, exportStarted:false, zipBusy:false, generatedUrls:{}, vectorUrls:{}, assetBusy:new Set(), assetRetry:{}, generationError:""
  };
  const steps = ['Input','Artwork Creation','Vectorization','Validation','Export'];
  const surfName = x => /back/i.test(String(x?.type || x?.name || x || '')) ? 'back_body' : 'front_body';
  const surfaceLabel = x => x === 'back_body' ? 'Back' : 'Front';
  const project = () => state.artboardResult || state.artboardProject || {};
  const available = () => {
    const canonical=new Map();
    for(const item of (project().surfaces||[])){
      const raw=String(item?.type||item?.name||'');
      if(!/front|back/i.test(raw))continue;
      const side=surfName(item);if(!canonical.has(side))canonical.set(side,{...item,side});
    }
    return [...canonical.values()];
  };
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
  function navigation(current){const idx=steps.indexOf(current);return `<div class="abv2-nav">${button('← Previous Step','previous','',idx<=0)}${button('■ Cancel Job','stop','danger',!state.busy&&!state.artboardJob?.job_id&&!state.pendingArtboardJob?.job_id)}</div>`;}
  function bars(){return `<div class="abv2-progress ${state.busy&&state.progress==null?'indeterminate':''}" aria-label="Current engine progress"><span style="width:${state.progress==null?26:Math.max(0,Math.min(100,state.progress))}%"></span></div>`;}
  function stageOf(message){const t=String(message||'').toLowerCase();if(/validat|print.ready|quality check|preflight|integrity|fidelity/.test(t))return 'Validation';if(/vector|trac|path|vtracer|potrace|optimi|compos|svg/.test(t))return 'Vectorization';if(/generat|artwork|reconstruct|provider|model|image/.test(t))return 'Artwork Creation';if(/export|deliver|bundle|format/.test(t))return 'Export';if(/analy|upload|prepar|surface|locat|geometry|scan/.test(t))return 'Artwork Creation';return null;}
  function currentStage(){if(ui.phase==='input')return 'Input';if(ui.phase==='analyze')return 'Artwork Creation';if(ui.phase==='artwork'||ui.phase==='select')return 'Artwork Creation';if(ui.phase==='export')return 'Export';return ui.processingStage||stageOf(state.stage)||'Artwork Creation';}
  function stageEvents(){const stage=currentStage();return (state.artboardEvents||[]).filter(e=>stageOf(e.step||e.stage||'')===stage).slice(-20);}
  function progressValue(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):null;}
  function eventProgress(event){for(const value of [event?.stage_progress,event?.progress,event?.percent]){const normalized=progressValue(value);if(normalized!==null)return normalized;}return null;}
  function stageProgress(){
    const eventValue=eventProgress(stageEvents().at(-1)),jobValue=progressValue(state.progress);
    if(jobValue===100)return 100;
    if(eventValue!==null&&jobValue!==null)return Math.max(eventValue,jobValue);
    return eventValue??jobValue;
  }
  function workflowRail(){const active=currentStage(),current=Math.max(0,steps.indexOf(active));return `<nav class="abv2-workflow" aria-label="Artboard production workflow">${steps.map((step,index)=>`<span class="${index<current?'complete':index===current?'current':'pending'}"><b>${index<current?'✓':index+1}</b><strong>${esc(step)}</strong><small>${index<current?'Completed':index===current?(state.busy?'Live':'Current'):'Waiting'}</small></span>`).join('')}</nav>`;}
  function liveLog(){const events=stageEvents(),percent=stageProgress();const stage=currentStage();const current=events.at(-1);
    return `<aside class="abv2-card abv2-log"><header><h2>Working Log — ${esc(stage)}</h2><small>${esc(state.lastJobId?state.lastJobId.slice(0,10):'Awaiting job')}</small></header>
      <div class="abv2-current"><strong>${esc(state.lastError?'Error':state.busy?'Processing':events.length?'Latest stage activity':'Awaiting events')}</strong><b>${percent==null?(state.busy?'Live':'—'):Math.round(percent)+'%'}</b><div class="abv2-progress ${state.busy&&percent==null?'indeterminate':''}"><span style="width:${percent==null?25:percent}%"></span></div></div>
      <ol aria-label="Real engine events for this stage">${events.length?events.map(e=>{const p=eventProgress(e);return `<li><span>${esc(e.step||e.stage||'Engine event')}</span><small>${p!==null?Math.round(p)+'%':safeTime(e.at)||'Reported'}</small></li>`}).join(''):'<li><span>No stage events reported yet.</span></li>'}</ol>
      <div class="abv2-log-footer"><span>${esc(state.mode.artboard==='quality'?'Quality':'Normal')} Mode</span><span>Engine-reported data only</span></div></aside>`;
  }
  function originalPreview(){const url=state.objectURLs.artboard;return `<div class="abv2-visual abv2-scan ${state.busy?'active':''}">${url?`<img src="${url}" alt="Uploaded original design">`:`<div class="abv2-empty">Source preview is unavailable for this file format.</div>`}<span class="abv2-corners" aria-hidden="true"></span><span class="abv2-beam" aria-hidden="true"></span></div>`;}
  function artworkCard(side){
    const item=available().find(x=>x.side===side),label=surfaceLabel(side),chosen=ui.selected.has(side);
    const url=ui.generatedUrls[side] || (ui.productionDone?(ui.vectorUrls[side]||previewUrl(item)):'') || interimPreview(side);
    const generating=ui.generationStarted&&!ui.productionDone&&state.busy;
    return `<article class="abv2-card abv2-artwork ${chosen?'selected':''}"><header><h2>${label} Artwork</h2><span>${!item?'Not detected':url?'Generated artwork ready':generating?'Creating artwork':'Awaiting artwork'}</span></header>
      <div class="abv2-art-canvas ${generating?'abv2-creating':''}">${url?`<img class="abv2-genuine-image" src="${url}" alt="Real ${label} engine-produced artwork preview">`:
      `<div class="abv2-generation-placeholder"><span class="abv2-creation-orb" aria-hidden="true"></span><p>${generating?'AI creating '+label+' artwork — awaiting real preview':item?'Artwork preview awaiting engine output':'No independently visible '+label+' detected'}</p></div>`}
      <span class="abv2-art-grid" aria-hidden="true"></span>${generating?'<span class="abv2-beam" aria-hidden="true"></span>':''}</div>
      ${item?`<label class="abv2-select"><input type="checkbox" data-abv2-select="${side}" ${chosen?'checked':''} ${url?'':'disabled'}> Select ${label} for Vectorization</label>`:
      button('✦ Recreate '+label+' with AI (Unavailable)','recreate:'+side,'secondary',true)}
      ${!url&&item?'<small class="abv2-source-note">No invented preview: authentic artwork appears when the engine exposes it.</small>':''}
    </article>`;
  }
  function savedJob(){return state.pendingArtboardJob || (state.artboardJob?.job_id&&project().project_id?state.artboardJob:null);}
  function jobNotice(){
    const job=savedJob();if(!job?.job_id)return '';
    const active=['queued','processing','cancelling'].includes(job.status);
    const lastAt=Date.parse(job.updated_at||job.events?.at(-1)?.at||job.started_at||'');
    const stale=active&&Number.isFinite(lastAt)&&Date.now()-lastAt>180000;
    const status=job.status==='cancelling'?'Cancellation in progress':stale?'No progress recently':job.status==='failed'?'Previous job failed':job.status==='completed'?'Previous job completed':'Unfinished production found';
    const info=job.status==='cancelling'?'The server is stopping at the next safe boundary.':active?'The job is on the server; refreshing never cancels paid work.':'You can review saved output or begin a new input.';
    return `<section class="abv2-card abv2-recovery" role="status"><header><h2>${esc(status)}</h2><small>${esc(job.job_id.slice(0,12))}</small></header><p>${esc(info)}</p><div class="abv2-commands">${button('Resume Production','resume-job','primary',job.status==='cancelling')}${button(active?'Cancel & New Input':'Start New Input','stop','danger')}${active?button('Check Status','refresh-job','secondary'):''}</div></section>`;
  }
  function input(){
    const file=state.files.artboard, url=state.objectURLs.artboard;
    return `${top('Artboard AI','AI JERSEY ARTWORK ENGINE')}<div class="abv2-input-shell">
      <div class="abv2-modes"><b>Production Mode</b><div>${button('◇ Quality Mode','mode:quality',state.mode.artboard==='quality'?'active':'')}${button('⚡ Normal Mode','mode:cost_effective',state.mode.artboard==='cost_effective'?'active':'')}</div></div>
      <div class="abv2-drop" data-droptool="artboard">${url?`<img class="abv2-upload-preview" src="${url}" alt="Uploaded artwork preview">`:file?`<span class="abv2-pdf-preview">${esc(file.name)}</span>`:""}<div class="abv2-upload-icon">${file?"✓":"⇧"}</div><strong>${file?"Replace Uploaded Design":"Drag &amp; Drop Your Design Here"}</strong><small>${file?"Click to replace this file":"or click to upload"}</small><p>PNG · JPG · WEBP · PDF</p><input type="file" data-file="artboard" aria-label="Upload artwork" accept=".png,.jpg,.jpeg,.webp,.pdf"></div>
      ${file?`<div class="abv2-file">${url?`<img src="${url}" alt="Input thumbnail">`:''}<div><strong>${esc(file.name)}</strong><small>${fmtSize(file.size)} · ${esc(file.type||'Unknown media type')}${ui.dimensions?' · '+esc(ui.dimensions):''}</small></div><span>Selected input</span></div>`:''}
      ${jobNotice()}<div class="abv2-commands">${button('▤ Clear Input','clear','danger',!file||state.busy)}${button('▷ Start Production','start','primary',!file||state.busy||!connected('artboard')||['queued','processing','cancelling'].includes(savedJob()?.status))}</div>
    </div>`;
  }
  function analyze(){return `${top('Artwork Creation','Image model prepares the source and builds the print artwork')}${workflowRail()}<div class="abv2-process-grid"><div class="abv2-primary"><section class="abv2-card abv2-preview"><header><h2>Live Input Scan</h2><span>${esc(statusText())}</span></header>${originalPreview()}<div class="abv2-preview-foot"><span>Original input • ${esc(state.files.artboard?.name||'No file')}</span><span>${ui.analysisDone?'Source prepared':state.busy?'Preparing reference':'Awaiting source'}</span></div>${ui.analysisDone?`<div class="abv2-result-summary"><b>Source preparation</b><span>${available().length} ${available().length===1?'print field':'print fields'} ready for image-model reconstruction</span></div>`:''}</section>${navigation('Analyze')}</div>${liveLog()}</div>`;}
  function select(){ui.phase='artwork';const prepared=available();
    if(!ui.analysisDone)return analyze();
    const ready=prepared.filter(x=>Boolean(ui.generatedUrls[x.side]||ui.vectorUrls[x.side]||previewUrl(x)||interimPreview(x.side)));
    const canContinue=ui.selected.size>0&&[...ui.selected].every(side=>ready.some(x=>x.side===side));
    const status=ui.generationError?'Artwork generation failed: '+esc(ui.generationError):ui.productionDone?'Generated artwork ready — select Front, Back or Both and continue':state.busy?'Engine creating flat 2D artwork; previews appear as real files arrive':'Waiting for artwork generation';
    return `${top('Artwork Creation','AI artwork is generated and previewed here. Select one or both sides to proceed.')}${workflowRail()}<div class="abv2-select-summary" role="status">${esc(status)} • ${ui.selected.size} selected</div>
    <div class="abv2-art-grid-layout ${prepared.length===1?'single':''}">${artworkCard('front_body')}${artworkCard('back_body')}${liveLog()}</div>
    <div class="abv2-select-actions">${navigation('Artwork Creation')}${ui.analysisDone&&!ui.generationStarted?button('▷ Generate Artwork','produce','primary'):''}${button('Continue to Vectorization →','continue-vectorization','primary',!canContinue||ui.continued)}</div>`;
  }
  function processTitle(){const stage=stageOf(state.stage);return stage==='Validation'?'Validation':stage==='Vectorization'?'Vectorization':stage==='Export'?'Export':'Artwork Creation';}
  function processing(){const title=ui.processingStage||processTitle();
    const isVector=title==='Vectorization',isValid=title==='Validation';
    const subsets=ui.selected.size?[...ui.selected]:available().map(x=>x.side);
    const onlyValid=subsets.filter(side=>available().some(x=>x.side===side));
    const verified=project().true_vector_ready===true;
    return `${top(title,title==='Validation'?'Engine validation and print-readiness review':isVector?'Real vector geometry / live engine progress when available':'AI artwork generation from the connected engine' )}${workflowRail()}
    <div class="abv2-art-grid-layout ${onlyValid.length===1?'single':''}">${onlyValid.map(side=>{
      const part=available().find(x=>x.side===side),url=(isVector||isValid?ui.vectorUrls[side]:ui.generatedUrls[side]) || previewUrl(part) || ui.generatedUrls[side] || interimPreview(side);
      const active=(state.busy&&state.activePipeline==='Production'&&ui.stageStatus!=='completed')||(isValid&&ui.finishing);
      return `<section class="abv2-card abv2-artwork"><header><h2>${surfaceLabel(side)} ${title}</h2><span>${esc(ui.stageStatus==='completed'?'Engine completed':state.stage||'Awaiting engine')}</span></header>
      <div class="abv2-art-canvas ${isVector?'vector-overlay':''} ${isValid?'validation-overlay':''}">
      ${url?`<img class="abv2-genuine-image" src="${url}" alt="${surfaceLabel(side)} verified engine preview">`:'<p>Waiting for actual engine output. No generated image is fabricated.</p>'}
      <span class="abv2-art-grid" aria-hidden="true"></span>
      ${isVector?'<svg class="abv2-real-paths" data-abv2-paths-side="${side}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>':''}
      ${active?'<span class="abv2-beam" aria-hidden="true"></span>':''}
      ${isVector?'<div class="abv2-path-status">Only paths extracted from a real Artboard SVG are drawn; completed jobs show a verified vector replay.</div>':''}</div>
      ${isValid?`<div class="abv2-validation-results">${[['Valid SVG',part?.validation?.valid_svg],['True vector',part?.validation?.true_vector],['Raster count',part?.validation?.embedded_rasters],['Editability',part?.validation?.editability_status],['Print readiness',part?.validation?.physical_artboard?.status]].map(([name,value])=>`<span><small>${esc(name)}</small><b class="${value===true?'pass':value===false?'fail':''}">${esc(value===true?'PASS':value===false?'FAILED':value??'Not reported')}</b></span>`).join('')}</div>`:''}
      <div class="abv2-side-note">${esc(ui.stageStatus==='completed'?(verified?'Validated by engine — actual saved result':'Backend completion reported'):state.stage||'Awaiting stage data')}</div></section>`;
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
  // A returned server ZIP is preferred. When the existing API returns only individual
  // artifacts, assemble an uncompressed, standards-compliant ZIP in the browser.
  // This does NOT run AI, alter vector files, or make any new production API requests.
  function exportedArtifacts(){
    const p=project(),parts=available().filter(x=>!ui.selected.size||ui.selected.has(x.side)),items=[];
    for(const part of parts)for(const [format,path] of Object.entries(part.exports||{}))
      if(typeof path==='string'&&path)items.push({format:format.toLowerCase(),path,label:surfaceLabel(part.side)});
    if(ui.selected.size===available().length)for(const [format,path] of Object.entries(p.exports||{}))
      if(typeof path==='string'&&path)items.push({format:format.toLowerCase(),path,label:'Project'});
    return items;
  }
  function artifactEndpoint(projectId,path){
    if(typeof path!=='string'||!path||!projectId)throw Error('Missing verified export path');
    const relative=path.replace(/^projects\/[^/]+\//,'');
    if(!relative||relative.startsWith('/')||relative.split('/').some(segment=>segment==='..'||segment==='.'||!segment))
      throw Error('Invalid export path in engine manifest');
    return 'api/artboard/projects/'+encodeURIComponent(projectId)+'/artifacts/'+relative.split('/').map(encodeURIComponent).join('/');
  }
  function crc32(bytes){
    let crc=0xffffffff;
    for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    return (crc^0xffffffff)>>>0;
  }
  function assembleMasterZip(entries){
    if(!entries.length)throw Error('No exported files are available to package');
    if(entries.length>65535)throw Error('Too many files for a standard ZIP');
    const encoder=new TextEncoder(),local=[],central=[];
    let offset=0,centralSize=0;
    for(const entry of entries){
      const filename=encoder.encode(entry.name),data=entry.data;
      if(!filename.length||filename.length>65535||data.length>=0xffffffff)throw Error('ZIP entry exceeds standard size limits');
      const sum=crc32(data);
      const header=new Uint8Array(30+filename.length),h=new DataView(header.buffer);
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);
      h.setUint16(8,0,true);h.setUint32(14,sum,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);
      h.setUint16(26,filename.length,true);header.set(filename,30);local.push(header,data);
      const record=new Uint8Array(46+filename.length),c=new DataView(record.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);
      c.setUint16(10,0,true);c.setUint32(16,sum,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);
      c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);record.set(filename,46);central.push(record);
      centralSize+=record.length;offset+=header.length+data.length;
      if(offset>=0xffffffff||centralSize>=0xffffffff)throw Error('Master ZIP exceeds the standard 4 GB ZIP limit');
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);
    e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    return new Blob([...local,...central,end],{type:'application/zip'});
  }
  async function downloadMasterZip(){
    if(ui.zipBusy)return;
    const p=project(),items=exportedArtifacts(),serverZip=items.find(item=>item.format==='zip');
    if(!p.project_id)return notify('No completed project is available');
    // Download an actual engine-supplied ZIP untouched when the API returns one.
    if(serverZip&&ui.selected.size===available().length)return download('artboard',artifactEndpoint(p.project_id,serverZip.path));
    const files=items.filter(item=>item.format!=='zip');
    if(!files.length)return notify('No exported files are available for a master ZIP');
    const button=document.querySelector('[data-abv2="download-master-zip"]');
    const label=document.querySelector('[data-abv2-zip-status]');
    ui.zipBusy=true;if(button)button.disabled=true;
    const update=message=>{if(label)label.textContent=message;};
    try{
      const seen=new Set(),entries=[];
      for(let i=0;i<files.length;i++){
        const item=files[i];update('Packaging existing files: '+(i+1)+' / '+files.length);
        const blob=await call('artboard',artifactEndpoint(p.project_id,item.path),{response:'blob'});
        if(!blob?.size)throw Error('Engine returned an empty '+item.format.toUpperCase()+' file');
        const data=new Uint8Array(await blob.arrayBuffer());
        const raw=(item.path.split('/').pop()||'artifact.'+item.format).replace(/[^a-zA-Z0-9_. -]/g,'_');
        const folder=item.label==='Project'?'Project':item.label;
        let name=folder+'/'+raw,index=1;
        while(seen.has(name))name=folder+'/'+index+++'_'+raw;
        seen.add(name);entries.push({name,data});
      }
      update('Building ZIP from '+entries.length+' exported files…');
      const zip=assembleMasterZip(entries);
      const href=URL.createObjectURL(zip),a=document.createElement('a');
      a.href=href;a.download='Artboard_'+String(p.project_id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48)+'_Master.zip';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(href),60000);
      update('ZIP downloaded: '+entries.length+' existing files. No new production was started.');
      log('Downloaded client-assembled ZIP from '+entries.length+' actual Artboard artifacts');
    }catch(error){update('ZIP download failed: '+error.message);notify('ZIP download failed: '+error.message);}
    finally{ui.zipBusy=false;if(button)button.disabled=false;}
  }
  async function continueSelectedIllustrator(){
    const p=project(),items=exportedArtifacts(),item=items.find(x=>x.format==='svg'&&x.label!=='Project')||items.find(x=>x.format==='svg');
    if(!p.project_id||!item)return notify('No selected-side editable SVG export is available');
    try{
      const blob=await call('artboard',artifactEndpoint(p.project_id,item.path),{response:'blob'});
      if(!blob?.size)throw Error('The selected SVG artifact is empty');
      const cleanName=(item.label||'Artboard').replace(/[^a-zA-Z0-9_-]/g,'_')+'.svg';
      const file=new File([blob],cleanName,{type:'image/svg+xml'});
      if(navigator.canShare?.({files:[file]})){
        await navigator.share({files:[file],title:'Open '+item.label+' SVG in Illustrator'});
        log('Offered selected '+item.label+' SVG to OS app chooser');return;
      }
      const href=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=href;a.download=cleanName;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(href),60000);
      window.open('https://www.adobe.com/products/illustrator.html','_blank','noopener,noreferrer');
      log('Downloaded selected '+item.label+' SVG and opened Adobe Illustrator website');
    }catch(e){if(e?.name==='AbortError'){notify('Illustrator handoff cancelled');return;}
      notify('Illustrator handoff failed: '+e.message);log('Illustrator handoff failed: '+e.message);}
  }
  function exportPage(){
    const p=project(),parts=available().filter(x=>!ui.selected.size||ui.selected.has(x.side)),confirmed=p.true_vector_ready===true;
    const items=exportedArtifacts(),formats=[...new Set(items.map(x=>x.format))];
    const format=ui.downloadFormat||'';
    const links=items.filter(x=>x.format===format);
    const dl=item=>`<button type="button" class="abv2-btn" data-download="artboard|${esc(artifactEndpoint(p.project_id,item.path))}">↓ Download ${esc(item.label)}</button>`;
    const hasZip=items.some(x=>x.format==='zip'),canZip=items.length>0;
    return `${top('Export Production','Validated output files — select a format or download the complete available package')}${workflowRail()}<div class="abv2-export-grid">
      <section class="abv2-export-left"><div class="abv2-card abv2-export-preview"><header><h2>Validated Artwork Preview</h2><span>${confirmed?'Validated vector':'Review engine validation'}</span></header>
      <div class="abv2-export-arts">${parts.map(part=>`<div><strong>${surfaceLabel(part.side)}</strong>${previewUrl(part)?`<img src="${previewUrl(part)}" alt="Real ${surfaceLabel(part.side)} completed artwork">`:'<p>Preview not available from the engine</p>'}</div>`).join('')||'<p>No final artwork detected.</p>'}</div></div></section>
      <div class="abv2-export-center">
        <section class="abv2-card abv2-export-settings"><header><h2>Available Downloads</h2><small>${formats.filter(f=>f!=='zip').length} real formats</small></header>
          <div class="abv2-format-grid">${['eps','svg','pdf','png'].map(f=>`<button type="button" class="abv2-format ${format===f?'selected':''}" data-abv2="select-format:${f}" aria-pressed="${format===f}" ${!formats.includes(f)?'disabled':''}>${f.toUpperCase()}</button>`).join('')}</div>
          <p class="abv2-info">${format?'Available '+format.toUpperCase()+' files':'No format preselected. Choose a ready format to download.'}</p>
          <div class="abv2-format-downloads">${links.map(dl).join('')}</div>
        </section>
        <section class="abv2-card abv2-package"><header><h2>Master ZIP</h2></header><p>${hasZip?'Download the verified master ZIP returned by the engine.':'Download a ZIP containing all existing, available export files — assembled in your browser without regenerating artwork.'}</p>
          ${button('↓ Download Master ZIP','download-master-zip','primary',!canZip)}<p class="abv2-info" role="status" aria-live="polite" data-abv2-zip-status>${hasZip?'Engine ZIP ready':canZip?'Ready to package '+items.length+' existing exported files':'No downloadable files returned by engine'}</p>
        </section>
        <section class="abv2-card abv2-illustrator"><header><h2>Adobe Illustrator</h2></header><p>Open an editable SVG via a supported desktop handoff, or download it for Illustrator.</p>
          ${button('Continue to Illustrator','illustrator','amber',!formats.includes('svg'))}</section>
        <section class="abv2-card abv2-new-production"><header><h2>New Production</h2></header><p>Start again with a new design.</p>${button('＋ New Production','new','primary')}</section>
      </div>
      <aside class="abv2-export-right">${productionDetails()}</aside>
    </div><div class="abv2-export-bottom">${button('⌂ Home (Input Page)','home')}${button('← Previous Step','previous')}</div>`;
  }

  function display(){
    // Never reopen old processing screens automatically on refresh or tool entry.
    const phase=ui.preferInput?'input':ui.view||ui.phase;
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
  // Verified engine output only: both panels use their own real SVG paths.
  const traced=new WeakMap();
  async function paintVectorOverlay(){
    if(ui.processingStage!=='Vectorization')return;
    const roots=[...document.querySelectorAll('[data-abv2-paths-side]')];
    for(const root of roots){
      const side=root.dataset.abv2PathsSide,url=ui.vectorUrls[side];
      if(!url||traced.get(root)===url)continue;
      try{
        const response=await fetch(url);if(!response.ok)throw Error('SVG geometry not available');
        const text=await response.text();if(text.length>5_000_000)continue;
        const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror'))continue;
        const origin=doc.documentElement,raw=origin.getAttribute('viewBox');
        if(!raw||!/^[-\d., eE+]+$/.test(raw))continue;
        root.replaceChildren();root.setAttribute('viewBox',raw);root.setAttribute('preserveAspectRatio','xMidYMid meet');
        const paths=[...doc.querySelectorAll('path[d]')].slice(0,160);
        for(const node of paths){
          const d=node.getAttribute('d');if(!d||d.length>100_000||!/^[MmLlHhVvCcSsQqTtAaZz0-9.eE,+\-\s]+$/.test(d))continue;
          const path=document.createElementNS('http://www.w3.org/2000/svg','path');
          path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','#16f8ff');path.setAttribute('stroke-width','1.25');
          const transforms=[];for(let x=node;x&&x!==origin;x=x.parentElement)if(x.getAttribute('transform'))transforms.unshift(x.getAttribute('transform'));
          if(transforms.length&&transforms.join(' ').length<500)path.setAttribute('transform',transforms.join(' '));
          root.appendChild(path);let length=0;try{length=path.getTotalLength()}catch{}
          if(length>0){path.style.strokeDasharray=String(length);path.style.strokeDashoffset=String(length);path.style.setProperty('--path-length',String(length));path.classList.add('abv2-trace-path');}
        }
        traced.set(root,url);
      }catch(e){/* The UI does not invent geometry when SVG cannot be read. */}
    }
  }
  async function loadSideAssets(force=false){
    const p=project(),id=p.project_id;if(!id||!available().length)return;
    for(const part of available())for(const [kind,suffix] of [['generated','working/'+part.part_id+'-ai-vectorization-source.png'],['vector','vectors/'+part.part_id+'.svg']]){
      const cache=kind==='generated'?ui.generatedUrls:ui.vectorUrls,key=kind+':'+part.part_id;
      if(cache[part.side]||ui.assetBusy.has(key)||!force&&Date.now()-(ui.assetRetry[key]||0)<3500)continue;
      // Do not probe before the engine has started production.
      if(!ui.generationStarted)continue;
      ui.assetBusy.add(key);ui.assetRetry[key]=Date.now();
      try{
        const blob=await call('artboard',artifactEndpoint(id,'projects/'+id+'/'+suffix),{response:'blob'});
        if(!blob?.size)continue;
        // Only a real artifact from the engine becomes a preview, never a mockup.
        cache[part.side]=URL.createObjectURL(blob);
        if(state.tool==='artboard')render();
      }catch(e){/* 404 until generated: normal, no invented preview. */}
      finally{ui.assetBusy.delete(key)}
    }
  }
  function syncProductionStage(){
    if(ui.phase!=='processing'||!ui.continued||ui.finishing||ui.view||state.activePipeline!=='Production')return;
    const candidates=[...(state.artboardEvents||[]).map(e=>stageOf(e.step||e.stage||'')),stageOf(state.stage)].filter(x=>x&&['Artwork Creation','Vectorization','Validation'].includes(x));
    const order={'Artwork Creation':0,'Vectorization':1,'Validation':2};
    const next=candidates.reduce((a,b)=>order[b]>order[a]?b:a,ui.processingStage||'Artwork Creation');
    if(next!==ui.processingStage){ui.processingStage=next;ui.visitedStages.add(next);render();}
  }
  function refresh(){
    const root=document.querySelector('.abv2');if(!root)return;
    const monitor=root.querySelector('.abv2-current');
    if(monitor){const title=currentStage(),v=stageProgress(),events=stageEvents();monitor.querySelector('strong').textContent=ui.stageStatus==='completed'?'Stage completed':state.lastError?'Error':state.busy&&events.length?'Engine processing':'Awaiting stage events';monitor.querySelector('b').textContent=v==null?(state.busy?'Live':'—'):Math.round(v)+'%';const bar=monitor.querySelector('.abv2-progress');bar?.classList.toggle('indeterminate',state.busy&&v==null);if(bar?.firstElementChild)bar.firstElementChild.style.width=(v??25)+'%';}
    const events=root.querySelector('.abv2-log ol');if(events)events.innerHTML=stageEvents().length?stageEvents().map(x=>{const p=eventProgress(x);return `<li><span>${esc(x.step||x.stage||'Engine event')}</span><small>${p!==null?Math.round(p)+'%':safeTime(x.at)||'Reported'}</small></li>`}).join(''):'<li><span>No stage events reported yet.</span></li>';
    const status=root.querySelector('.abv2-step-label');if(status)status.textContent=state.stage||statusText();
    if((ui.phase==='artwork'||ui.phase==='processing')&&ui.generationStarted)void loadSideAssets();
    if(ui.phase==='processing'){
      const live=state.objectURLs.artboard_live;
      if(live){for(const [side,item] of available().map(x=>[x.side,x])){
        const img=root.querySelector('.abv2-artwork img[alt="'+surfaceLabel(side)+' verified engine preview"]');
        const url=ui.vectorUrls[side]||previewUrl(item)||ui.generatedUrls[side]||interimPreview(side);if(img&&url&&img.getAttribute('src')!==url)img.src=url;
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
    if(['queued','processing','cancelling'].includes(savedJob()?.status))return notify('Resume or cancel existing job before starting a paid production');
    const epoch=++ui.workspaceEpoch;
    state.pendingArtboardJob=null;state.artboardJob=null;try{sessionStorage.removeItem('mj_artboard_job')}catch{}
    ui.preferInput=false;ui.selected.clear();ui.prepared=[];ui.visitedStages.clear();ui.stageStatus='';ui.lastPreviewPath='';state.artboardPreviewPath='';ui.view=null;ui.phase='artwork';ui.analysisDone=false;ui.generationStarted=false;ui.processingStage='';ui.downloadFormat='';ui.cancelRequested=false;ui.productionDone=false;ui.continued=false;ui.finishing=false;ui.exportStarted=false;ui.generationError='';ui.generatedUrls={};ui.vectorUrls={};ui.assetRetry={};ui.assetBusy.clear();
    await run('Artboard source upload',async()=>{state.artboardEvents=[];state.artboardEventKeys.clear();state.artboardJob=null;state.lastMode=state.mode.artboard;state.progress=null;
      const p=await call('artboard','api/artboard/projects',{method:'POST',json:{name:f.name.slice(0,120),processing_mode:state.lastMode}});state.artboardProject=p;state.artboardResult=p;
      const fd=new FormData();fd.append('project_id',p.project_id);fd.append('file',f);state.artboardResult=await call('artboard','api/artboard/upload',{method:'POST',body:fd});state.activePipeline='Upload';state.stage='Source uploaded';state.progress=null;});
    if(ui.workspaceEpoch!==epoch)return;
    if(ui.cancelRequested){reset(true);return;}
    if(!state.lastError)await analyzeSurfaces();
  }
  async function waitForPreparedProject(id,attempts=7){
    let latest=null;
    for(let attempt=0;attempt<attempts;attempt++){
      latest=await call('artboard','api/artboard/projects/'+id,{timeoutMs:30000});
      state.artboardResult=latest;
      if(available().length)return latest;
      state.stage='Source references ready — syncing artwork inputs';state.progress=100;render();
      if(attempt<attempts-1)await sleep(450+attempt*250);
    }
    return latest;
  }
  async function analyzeSurfaces(){const id=project().project_id,epoch=ui.workspaceEpoch;if(!id||ui.cancelRequested)return;await run('Analyze uploaded artwork',async()=>{
    ui.phase='artwork';state.activePipeline='Prepare';state.stage='Preparing artwork reference';state.progress=null;render();
    // The v0.3.1 engine needs surface names in its prepare request. Try both, then
    // automatically fall back to a verified single surface only if detection fails.
    let prepared=false,lastFailure=null;const attempts=[['front_body','back_body'],['front_body'],['back_body']];
    for(const surfaces of attempts){try{
      state.artboardEvents=[];state.artboardEventKeys.clear();state.stage='Scanning '+surfaces.map(surfaceLabel).join(' + ');state.progress=null;render();
      const job=await call('artboard','api/artboard/prepare',{method:'POST',json:{project_id:id,surfaces,auto:true,self_analysis:true,width_in:22,height_in:31}});
      captureJob('Artboard',job);if(ui.cancelRequested){void stop();return;}await jobPoll('artboard','api/artboard/jobs/'+job.job_id,'Prepare');
      if(ui.cancelRequested||epoch!==ui.workspaceEpoch)return;
      state.stage='Source references ready — syncing artwork inputs';state.progress=100;render();
      await waitForPreparedProject(id);
      if(available().length){prepared=true;break;}throw Error('Engine returned no prepared surfaces');
    }catch(e){lastFailure=e;
      if(!/surface|not visible|not found|locat|detect|independently|component|geometry|missing/i.test(e.message))throw e;
      log('Auto-detection attempt reported: '+e.message);
    }}
    if(ui.cancelRequested||epoch!==ui.workspaceEpoch)return;
    if(!prepared)throw Error('Unable to verify a visible surface automatically: '+(lastFailure?.message||'No result'));
    ui.analysisDone=true;ui.prepared=available();ui.selected.clear();ui.phase='artwork';ui.processingStage='Artwork Creation';state.stage='Reference ready — generating artwork';state.progress=null;render();
  });
    if(ui.analysisDone&&!state.lastError&&!ui.cancelRequested&&ui.workspaceEpoch===epoch)await produce();
  }
  async function produce(){
    if(ui.cancelRequested)return;
    const epoch=ui.workspaceEpoch,id=project().project_id;if(!id||!available().length)return notify('Prepare a visible artwork surface first');
    ui.generationStarted=true;ui.productionDone=false;ui.phase='artwork';ui.processingStage='Artwork Creation';ui.visitedStages.clear();ui.stageStatus='';
    await run('Artboard AI artwork creation',async()=>{
      state.activePipeline='Production';state.stage='Generating flat 2D artwork';state.progress=null;state.artboardEvents=[];state.artboardEventKeys.clear();render();
      const j=await call('artboard','api/artboard/production',{method:'POST',json:{project_id:id,ai_reconstruction:true,processing_mode:state.lastMode||state.mode.artboard}});
      captureJob('Artboard',j);if(ui.cancelRequested){void stop();return;}await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Production');
      if(ui.cancelRequested||ui.workspaceEpoch!==epoch||project().project_id!==id)return;
      state.artboardResult=await call('artboard','api/artboard/projects/'+id);
      if(state.artboardResult.true_vector_ready!==true)throw Error('Vector validation is not confirmed by the engine');
      ui.productionDone=true;ui.stageStatus='completed';state.stage='Artwork generated — choose Front, Back or Both';state.progress=null;
      await loadSideAssets(true);
      render();
    });
    if(ui.workspaceEpoch!==epoch)return;
    if(state.lastError)ui.generationError=state.lastError;
    if(!ui.cancelRequested&&ui.continued&&ui.productionDone)void completeSelectedWorkflow();
    render();
  }
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  async function continueToVectorization(){
    if(ui.continued)return;
    if(!ui.selected.size)return notify('Select at least one generated artwork side');
    const ready=[...ui.selected].every(side=>Boolean(ui.generatedUrls[side]||ui.vectorUrls[side]||previewUrl(available().find(x=>x.side===side))||interimPreview(side)));
    if(!ready)return notify('Selected artwork preview is not ready yet');
    ui.continued=true;ui.phase='processing';ui.view=null;ui.processingStage='Vectorization';ui.stageStatus=ui.productionDone?'completed':'';ui.visitedStages.add('Vectorization');render();
    if(ui.productionDone)await completeSelectedWorkflow();
  }
  async function completeSelectedWorkflow(){
    const epoch=ui.workspaceEpoch;
    if(ui.cancelRequested||ui.finishing||ui.exportStarted||!ui.continued||!ui.productionDone)return;
    ui.finishing=true;
    try{
      // The current engine runs artwork + vectorization + validation inside one job.
      // When selection follows completion, show only its real, saved vector geometry
      // and confirmed historical events. Never pretend this is a new engine job.
      ui.phase='processing';ui.processingStage='Vectorization';ui.stageStatus='completed';state.activePipeline='Vectorization';
      state.stage='Engine-confirmed vector result — showing saved geometry';render();await loadSideAssets(true);await sleep(1500);
      if(ui.cancelRequested||ui.workspaceEpoch!==epoch)return;
      ui.processingStage='Validation';ui.visitedStages.add('Validation');state.activePipeline='Validation';
      state.stage='Engine-confirmed validation — reviewing quality';render();await sleep(1600);
      if(ui.exportStarted||ui.cancelRequested||ui.workspaceEpoch!==epoch)return;
      ui.exportStarted=true;
      const id=project().project_id;
      await run('Prepare Artboard export files',async()=>{
        ui.phase='processing';ui.processingStage='Validation';ui.stageStatus='completed';state.activePipeline='Export';state.stage='Preparing EPS SVG PDF PNG ZIP';state.progress=null;render();
        const j=await call('artboard','api/artboard/export',{method:'POST',json:{project_id:id,formats:['eps','svg','pdf','png','zip'],bundle:'production_pack'}});
        captureJob('Artboard',j);if(ui.cancelRequested){void stop();return;}await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Export');
        if(ui.cancelRequested||ui.workspaceEpoch!==epoch)return;
        state.artboardResult=await call('artboard','api/artboard/projects/'+id);
        if(!exportedArtifacts().length)throw Error('Engine returned no export files');
        ui.phase='export';ui.processingStage='Export';ui.downloadFormat='';state.stage='Production complete';state.progress=null;
      });
      if(state.lastError)ui.exportStarted=false;
    }finally{ui.finishing=false;render()}
  }

  async function resumeSavedJob(){
    const old=savedJob();if(!old?.job_id)return notify('No saved job to resume');
    const epoch=ui.workspaceEpoch;
    ui.preferInput=false;
    if(old.status==='cancelling')return notify('Cancellation is in progress; check status');
    const isPrepare=old.stage==='artboard-prepare',isExport=old.stage==='export';
    ui.view=null;ui.phase=isPrepare?'artwork':isExport?'processing':'artwork';
    ui.processingStage=isPrepare?'Artwork Creation':isExport?'Export':'Artwork Creation';
    ui.analysisDone=!isPrepare&&available().length>0;
    ui.generationStarted=!isPrepare;
    ui.generationError='';
    if(state.busy){render();return}
    try{
      const job=await call('artboard','api/artboard/jobs/'+encodeURIComponent(old.job_id));
      state.artboardJob=job;state.pendingArtboardJob=null;
      if(job.status==='cancelled'){reset(true);return}
      if(['completed','failed'].includes(job.status)){
        state.artboardResult=await call('artboard','api/artboard/projects/'+encodeURIComponent(project().project_id));
        ui.analysisDone=available().length>0;
        if(isPrepare){ui.phase='artwork';ui.generationStarted=false}
        else if(isExport&&job.status==='completed')ui.phase='export';
        else if(job.status==='completed'){ui.phase='artwork';ui.productionDone=state.artboardResult.true_vector_ready===true}
        if(job.status==='failed'){ui.generationError=job.error?.message||'Previous job failed';ui.phase='artwork'}
        if(ui.productionDone)await loadSideAssets(true);
        render();return;
      }
      render();
      await run('Resume Artboard job',async()=>{
        await jobPoll('artboard','api/artboard/jobs/'+job.job_id,isPrepare?'Prepare':isExport?'Export':'Production');
        if(ui.cancelRequested||ui.workspaceEpoch!==epoch)return;
        state.artboardResult=await call('artboard','api/artboard/projects/'+encodeURIComponent(project().project_id));
        ui.analysisDone=available().length>0;
        if(isPrepare){ui.phase='artwork';ui.generationStarted=false}
        else if(isExport){ui.phase='export';ui.exportStarted=true}
        else{ui.phase='artwork';ui.productionDone=state.artboardResult.true_vector_ready===true;ui.generationStarted=true;await loadSideAssets(true)}
      });
      render();
    }catch(e){state.pendingArtboardJob=old;ui.phase='input';ui.view=null;render();notify('Unable to resume: '+e.message)}
  }
  let cancellationPollInFlight=false;
  async function refreshSavedJob(){
    const j=savedJob();if(!j?.job_id)return;
    try{
      const latest=await call('artboard','api/artboard/jobs/'+encodeURIComponent(j.job_id));
      state.artboardJob=latest;state.pendingArtboardJob=latest;
      state.stage=latest.step||latest.status;state.progress=typeof latest.progress==='number'?latest.progress:null;
      if(latest.status==='cancelled'&&ui.cancelRequested){reset(true);return}
      render();
    }catch(e){notify('Job status unavailable: '+e.message)}
  }
  async function stop(){
    if(cancellationPollInFlight)return;
    const job=savedJob();
    if(!job?.job_id){
      if(state.busy){ui.cancelRequested=true;state.stage='Stopping current upload before next job';render();notify('Stop requested; new AI jobs will not start');return}
      reset();return;
    }
    if(['cancelled','completed','failed'].includes(job.status)){reset(true);return}
    ui.cancelRequested=true;ui.stageStatus='cancelling';state.stage='Cancelling job…';render();
    cancellationPollInFlight=true;
    try{
      const id=encodeURIComponent(job.job_id);
      const response=await call('artboard','api/artboard/jobs/'+id+'/cancel',{method:'POST'});
      if(!response.cancellation_requested&&!['cancelled','completed','failed'].includes(response.status))notify('Worker unavailable; checking its stored state');
      for(let attempt=0;attempt<45;attempt++){
        const latest=await call('artboard','api/artboard/jobs/'+id);
        state.artboardJob=latest;state.pendingArtboardJob=latest;
        if(['cancelled','completed','failed'].includes(latest.status)){
          reset(true);notify('Previous job closed. New input is ready.');return;
        }
        state.stage='Cancelling — waiting for engine safe boundary';
        if(attempt%4===0)render();
        await sleep(2000);
      }
      ui.phase='input';ui.view=null;render();
      notify('Still cancelling on server. Use Check Status; no new paid job started.');
    }catch(e){ui.phase='input';ui.view=null;render();notify('Could not confirm cancellation: '+e.message)}
    finally{cancellationPollInFlight=false}
  }
  function reset(force=false){
    if(state.busy&&!force)return notify('Cancel the active job before starting a new input');
    ++ui.workspaceEpoch;ui.preferInput=false;ui.phase='input';ui.view=null;ui.analysisDone=false;ui.generationStarted=false;ui.processingStage='';ui.downloadFormat='';ui.prepared=[];
    ui.selected.clear();ui.visitedStages.clear();ui.stageStatus='';ui.lastPreviewPath='';ui.continued=false;
    ui.productionDone=false;ui.finishing=false;ui.exportStarted=false;ui.cancelRequested=false;
    ui.generationError='';ui.assetBusy.clear();ui.assetRetry={};
    for(const url of Object.values({...ui.generatedUrls,...ui.vectorUrls}))URL.revokeObjectURL(url);
    ui.generatedUrls={};ui.vectorUrls={};state.artboardPreviewPath='';state.files.artboard=null;
    state.artboardProject=null;state.artboardResult=null;state.artboardJob=null;state.pendingArtboardJob=null;
    for(const key of ['artboard','artboard_live']){if(state.objectURLs[key])URL.revokeObjectURL(state.objectURLs[key]);delete state.objectURLs[key]}
    state.activePipeline='';state.busy=false;state.stage='';state.progress=null;state.lastError='';state.logs=[];
    state.artboardEvents=[];state.artboardEventKeys.clear();
    try{sessionStorage.removeItem('mj_artboard_job')}catch{}
    render();
  }
  // Protect all ecosystem buttons: intercept only Artboard V2-specific actions in capture phase.
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button[data-abv2]');if(!b)return;
    e.preventDefault();e.stopPropagation();const a=b.dataset.abv2;
    if(a==='start')return start();if(a==='resume-job')return resumeSavedJob();if(a==='refresh-job')return refreshSavedJob();if(a==='continue-vectorization')return continueToVectorization();if(a==='produce')return produce();if(a==='stop')return stop();
    if(a==='clear'){if(state.busy)return;state.files.artboard=null;const u=state.objectURLs.artboard;if(u)URL.revokeObjectURL(u);delete state.objectURLs.artboard;render();return}
    if(a==='home'||a==='new')return reset();
    if(a==='illustrator')return continueSelectedIllustrator();if(a==='download-master-zip')return downloadMasterZip();if(a.startsWith('select-format:')){ui.downloadFormat=a.split(':')[1];render();return;}
    if(a==='previous'){if(state.busy)return notify('Active job: cancel processing before changing stages');if(ui.phase==='export'){ui.view='processing';ui.processingStage='Validation';}else if(ui.phase==='artwork')ui.view='input';else {ui.view='artwork';}render();return}
    if(a.startsWith('mode:')){if(state.busy)return;state.mode.artboard=a.split(':')[1];render();return}
    if(a.startsWith('recreate:'))return notify('AI missing-side recreation is not exposed through this frontend’s existing Artboard gateway allowlist. No request was submitted.');
  },true);
  document.addEventListener('change',e=>{const visible=e.target.closest('[data-abv2-visible]');if(visible){const side=visible.dataset.abv2Visible;if(visible.checked)ui.visibleChoice.add(side);else ui.visibleChoice.delete(side);render();return;}const b=e.target.closest('[data-abv2-select]');if(!b)return;const side=b.dataset.abv2Select;if(b.checked)ui.selected.add(side);else ui.selected.delete(side);render();},true);
  document.addEventListener('change',e=>{if(e.target?.dataset?.file!=='artboard')return;ui.dimensions='';const f=e.target.files?.[0];if(!f||!f.type.startsWith('image/')||f.type.includes('svg'))return;const image=new Image();const url=URL.createObjectURL(f);image.onload=()=>{ui.dimensions=`${image.naturalWidth} × ${image.naturalHeight} px`;URL.revokeObjectURL(url);if(state.files.artboard===f)render()};image.onerror=()=>URL.revokeObjectURL(url);image.src=url;});
  // Preserve the ecosystem menu behavior, but collapse the sidebar when Artboard opens.
  document.addEventListener('click',e=>{const t=e.target.closest('[data-tool]');if(t?.dataset.tool==='artboard'){ui.view=null;ui.phase='input';ui.preferInput=Boolean(savedJob()?.job_id);document.body.classList.add('sidebar-collapsed');if(typeof closeMenu==='function')closeMenu()}},true);
  // Keep the existing start action available for code paths that call it directly.
  startArtboard=start;
  if(state.tool==='artboard'){document.body.classList.add('artboard-workspace');document.body.classList.add('sidebar-collapsed');render();}
})();
