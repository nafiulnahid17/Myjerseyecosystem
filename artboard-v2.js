'use strict';
/* Artboard AI V2: frontend-only replacement. Existing gateways, endpoints and other tools untouched. */
(() => {
  const ui = {
    startedAt:0, previewZoom:1, vectorOverlaySource:null, analysisDone:false, generationStarted:false, processingStage:'', downloadFormat:'',
    phase: 'input', preferInput:false, workspaceEpoch:0, exportJob:null, selected: new Set(), prepared: [], inspected: false,
    view: null, visitedStages: new Set(), stageStatus: '', lastPreviewPath:'', dimensions: '', awaitingSurfaces: false, processingStarted: false, cancelRequested: false, productionDone:false, continued:false, finishing:false, exportStarted:false, zipBusy:false, handoffBusy:false, generatedUrls:{}, vectorUrls:{}, assetBusy:new Set(), assetRetry:{}, generationError:"", compareSource:false, validationSide:null, recreatingSide:null, selectionTouched:false, stageProgressHigh:{}, stageProgressJob:null
  };
  const steps = ['Input','Analyzing','Artwork Creation','Vectorization','Validation','Export'];
  const surfName = x => /back/i.test(String(x?.type || x?.name || x || '')) ? 'back_body' : 'front_body';
  const surfaceLabel = x => x === 'back_body' ? 'Back' : 'Front';
  const project = () => state.artboardResult || state.artboardProject || {};
  const qualityMode = () => true;
  const vectorReview = p => p.validation?.ai_vector_review || null;
  // Never certify Quality output from SVG validity alone: the backend AI review
  // and deterministic technical gate must both have completed.
  function productionApproved(p=project()){
    if(p.true_vector_ready!==true)return false;
    const status=vectorReview(p)?.status;
    // An unreviewed second correction is not a certified AI review.
    // Backend may supply a separate REVIEW_REQUIRED designer-readiness
    // advisory even when a technically valid SVG is exportable for review.
    return p.validation?.status==='PASS' && ['PASS','AI_UNAVAILABLE_ADVISORY'].includes(status);
  }
  function deliveryAcceptance(p=project()){
    const items=(p.surfaces?.length?p.surfaces:p.surface?[p.surface]:[]).filter(part=>!ui.selected.size||ui.selected.has(surfName(part)));
    const status=v=>v==='PASS';
    const visual=items.length>0&&items.every(part=>status((part.validation?.production_fidelity||p.validation?.production_fidelity?.by_part?.[part.part_id]||p.validation?.production_fidelity||{}).status));
    const detail=items.length>0&&items.every(part=>status(part.validation?.local_detail_fidelity?.status));
    const editing=items.length>0&&items.every(part=>status(part.validation?.editability_status));
    const technical=productionApproved(p);
    return {technical,visual,detail,editing,passed:technical&&visual&&detail&&editing,
      illustrator:p.validation?.delivery_readiness?.native_illustrator_verified===true};
  }
  function vectorReviewPanel(){
    const p=project();if(!qualityMode(p))return '';
    const gate=vectorReview(p),status=gate?.status||'NOT_REPORTED';
    const readiness=p.validation?.delivery_readiness;
    const readinessItems=readiness
      ?[...(Array.isArray(readiness.reasons)?readiness.reasons:[]),
         ...(Array.isArray(readiness.advisories)?readiness.advisories:[])]
      :[];
    const readinessNote=readiness
      ?'Delivery status: '+readiness.status+
       (readinessItems.length
         ?' — '+readinessItems.join(', ') : '')+
       '. Native Illustrator sign-off is not certified.'
      :'Delivery readiness has not been reported; Illustrator sign-off is not certified.';
    const semanticRecords=(p.surfaces||[]).map(s=>s.semantic_editing).filter(s=>s?.status==='MEASURED');
    const sumSemantic=field=>semanticRecords.reduce((n,s)=>n+Math.max(0,Math.min(100000,Number(s[field])||0)),0);
    const designerNote=semanticRecords.length
      ? 'Vector engine measured '+sumSemantic('matched_shapes')+' semantic shapes, '+sumSemantic('adjacent_groups')+' adjacent editable groups and '+sumSemantic('selectable_color_families')+' shared color-family tags across selected surfaces. SVG class tags support same-family identification without changing path geometry; native Illustrator layers are not independently certified.'
      : 'Semantic SVG color-family grouping has not yet been measured by the vector engine.';
    const semanticStatus=p.semantic_guidance?.status||'PENDING';
    const guidanceNote=semanticStatus==='LOCAL_RASTER_FALLBACK'
      ? 'AI semantic response was invalid. The engine continued from the accepted artwork using local color analysis; this is NOT a passed AI semantic review.'
      :semanticStatus==='AI_GUIDED'
        ?'AI semantic guidance was validated and passed to the vector engine.'
        :'Semantic guidance has not been reported by the engine.';
    const label={
      PASS:'AI review passed',FINAL_FIX_TECHNICAL_PENDING:'Second targeted fix completed',
      AI_UNAVAILABLE_ADVISORY:'Technical validation passed — AI review unavailable',
      REVIEW_REQUIRED:'Review required — export blocked',NOT_REPORTED:'AI review not yet reported'
    }[status]||'AI review state not verified';
    const description=status==='PASS'
      ?'AI review passed. Technical geometry and print validation are separate checks.'
      :status==='AI_UNAVAILABLE_ADVISORY'
        ?'The semantic review provider did not return a valid structured response. Deterministic vector, editability, canvas and print checks completed; this production remains exportable with an advisory.'
      :status==='FINAL_FIX_TECHNICAL_PENDING'
        ?'Second correction has not received AI re-review. Delivery approval remains blocked.'
        :status==='REVIEW_REQUIRED'
          ?'Unresolved vector quality defects remain. Export must stay blocked.'
          :'No AI vector review result has been returned by the engine. Do not infer a PASS.';
    return '<section class="abv2-card abv2-quality-review" aria-label="Quality mode AI review and correction">'
      +'<header><h2>AI Vector Review &amp; Targeted Fix</h2><b class="'+(['PASS','AI_UNAVAILABLE_ADVISORY'].includes(status)?'pass':status==='REVIEW_REQUIRED'?'fail':'')+'">'+esc(label)+'</b></header>'
      +'<p class="abv2-source-note">'+esc(description)+'</p>'
      +'<p class="abv2-source-note">'+esc(guidanceNote)+'</p>'
      +'<p class="abv2-source-note">'+esc(readinessNote)+'</p>'
      +'<p class="abv2-source-note">'+esc(designerNote)+'</p>'
      +'<div class="abv2-validation-stats"><span><b>'+(gate&&Number.isInteger(gate.rounds)?gate.rounds:'—')+'</b><small>AI reviews</small></span>'
      +'<span><b>'+(gate&&Number.isInteger(gate.fixes)?gate.fixes:'—')+'</b><small>Engine fix passes</small></span>'
      +'<span><b>'+(gate?.accepted_artwork_source===true?'Confirmed':'Not reported')+'</b><small>Accepted AI artwork reference</small></span>'
      +'<span><b>'+esc(p.validation?.status||'—')+'</b><small>Technical validation</small></span></div></section>';
  }

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
    const a=state.status?.artboard||{}, ok=a.state==='online',
      active=state.busy && state.activePipeline==='Production' &&
        ['Analyzing','Artwork Creation'].includes(stageOf(state.stage,state.progress)) &&
        Boolean(state.artboardJob && state.artboardJob.status==='processing'),
      primaryReady=a.primary_ai_ready===true||a.ai_configured===true,
      fallbackReady=a.fallback_ai_ready===true,
      exportReady=a.export_engine_ready===true||ok;
    return `<div class="abv2-health" aria-label="Artboard engine status">
      <span><em class="abv2-health-icon">▣</em><span><strong>Primary AI</strong><b><i class="${active||primaryReady?'ok':'unknown'}"></i>${active?'Running':primaryReady?'Ready':'Checking'}</b></span></span>
      <span><em class="abv2-health-icon">◇</em><span><strong>Fallback AI</strong><b><i class="${fallbackReady?'ok':'unknown'}"></i>${fallbackReady?'Standby':'Not reported'}</b></span></span>
      <span><em class="abv2-health-icon">⚙</em><span><strong>Engine</strong><b><i class="${ok?'ok':'bad'}"></i>${ok?'Online':'Unavailable'}</b></span></span>
      <span><em class="abv2-health-icon">⇧</em><span><strong>Export Engine</strong><b><i class="${exportReady?'ok':'unknown'}"></i>${exportReady?'Online':'Checking'}</b></span></span>
    </div>`;
  }
  function top(title,description){return `<div class="abv2-top">${health()}<div class="abv2-centered-brand" aria-label="Artboard AI · My Jersey Ecosystem · Atherious Labs"><img src="assets/artboard-ai.svg" alt=""><strong>Artboard AI</strong><i>×</i><img src="assets/my-jersey.svg" alt=""><strong>My Jersey Ecosystem</strong><i>×</i><img src="assets/atherious-labs.svg" alt=""><strong>Atherious Labs</strong></div><div class="abv2-header"><img src="assets/artboard-ai.svg" alt=""><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><span class="abv2-step-label">${title==='Export Production'&&productionApproved()?(deliveryAcceptance().passed?'Desktop sign-off pending':'Review required'):ui.phase==='input'?'INPUT':esc(state.stage||statusText())}</span></div></div>`;}
  function button(text,action,cls='',disabled=false){return `<button type="button" class="abv2-btn ${cls}" data-abv2="${action}" ${disabled?'disabled':''}>${text}</button>`;}
  function navigation(current){
    const idx=steps.indexOf(current==='Analyze'?'Analyzing':current);
    const engineIndex=steps.indexOf(stageOf(state.stage,state.progress));
    const canNext=idx>0&&(ui.productionDone||engineIndex>idx||current==='Validation'&&productionApproved());
    return `<div class="abv2-nav">${button('❮ Previous Step','previous','',idx<=0||state.busy)}${button('□ Stop '+(current==='Artwork Creation'?'Generation':current==='Analyzing'?'Analysis':current),'stop','danger',!state.busy&&!savedJob()?.job_id)}${button('Next Step ❯','next-stage','primary',!canNext)}</div>`;
  }
  function bars(){return `<div class="abv2-progress ${state.busy&&state.progress==null?'indeterminate':''}" aria-label="Current engine progress"><span style="width:${state.progress==null?26:Math.max(0,Math.min(100,state.progress))}%"></span></div>`;}
  function stageOf(message, progress=null){
    const t=String(message||'').toLowerCase(),p=progressValue(progress);
    // Classify the actual engine event: no generated progress or imaginary micro-detail findings.
    if(/validating production request|validation of production request/.test(t))return 'Artwork Creation';
    if(/ai vector review|vector review|re.review|targeted fix|targeted correction|quality reviewer|review #/.test(t))return 'Validation';
    if(/running validate|validate completed|validating vector|saving validated|validation passed|print.ready|quality check|preflight|integrity|fidelity/.test(t))
      return 'Validation';
    if(/validat/.test(t))return 'Validation';
    if(/semantic|guidance|guided vector|protected region|vector plan|vector mapping/.test(t))return 'Vectorization';
    if(/vector|trac|path|vtracer|potrace|optimi|compos|svg/.test(t))return 'Vectorization';
    if(/generat|creating|reconstruct|render|artwork model|image generation|artwork ready/.test(t))return 'Artwork Creation';
    if(/analy|inspect|scann|scan|prepar|surface|locat|geometry|reference|source|fable|detail crop/.test(t))return 'Analyzing';
    if(/provider|model|image|artwork/.test(t))return 'Artwork Creation';
    if(/export|deliver|bundle|format/.test(t))return 'Export';
    return null;
  }
  function currentStage(){
    const phase=ui.preferInput?'input':ui.view||ui.phase;
    if(phase==='input')return 'Input';if(phase==='analyze')return 'Analyzing';
    if(phase==='artwork'||phase==='select')return 'Artwork Creation';if(phase==='export')return 'Export';
    return ui.processingStage||stageOf(state.stage,state.progress)||'Artwork Creation';
  }
  function friendlyActivity(message){const t=String(message||'').toLowerCase();if(/ai vector review|vector review|re.review|quality reviewer/.test(t))return /#2|second|re.review/.test(t)?'AI re-reviewing corrected vectors':'AI comparing accepted artwork with vectors';if(/targeted fix|targeted correction/.test(t))return 'Engine fixing affected vector regions';if(/semantic|guidance|guided vector|protected region|vector mapping/.test(t))return /deliver|receiv|handoff/.test(t)?'Semantic guidance delivered to vector engine':'Mapping shapes, gradients and protected details';if(/analy|inspect|scan|prepar|surface|locat/.test(t))return 'Understanding the input design';if(/generat|creating|artwork model|render/.test(t))return 'Creating production artwork';if(/reconstruct|cleaning artwork geometry/.test(t))return 'Cleaning artwork geometry';if(/vector|trac/.test(t))return 'Tracing editable vector paths';if(/optimi|path/.test(t))return 'Optimizing vector paths';if(/compos|canvas/.test(t))return 'Building the production canvas';if(/validat|readiness|fidelity|integrity/.test(t))return 'Checking production readiness';if(/export|packag|bundle/.test(t))return 'Packaging production files';if(/cancel|stop/.test(t))return 'Stopping safely';return String(message||'Production activity');}
  function stageEvents(){const stage=currentStage();return (state.artboardEvents||[]).filter(e=>stageOf(e.step||e.stage||'',eventProgress(e))===stage).slice(-20);}
  function progressValue(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):null;}
  function eventProgress(event){for(const value of [event?.stage_progress,event?.progress,event?.percent]){const normalized=progressValue(value);if(normalized!==null)return normalized;}return null;}
  function stageProgress(){
    // Only display real job percentages; prevent a stale activity entry from
    // regressing the progress value inside the same backend stage.
    const jobId=state.artboardJob?.job_id||state.lastJobId||'';
    if(ui.stageProgressJob!==jobId){ui.stageProgressJob=jobId;ui.stageProgressHigh={};}
    const stage=currentStage();
    const fromEvent=eventProgress(stageEvents().at(-1)),fromJob=progressValue(state.progress);
    let current=fromEvent!==null&&fromJob!==null?Math.max(fromEvent,fromJob):fromEvent??fromJob;
    if(ui.productionDone&&stage==='Validation')current=100;
    if(current!==null){ui.stageProgressHigh[stage]=Math.max(ui.stageProgressHigh[stage]||0,current);return ui.stageProgressHigh[stage];}
    return ui.stageProgressHigh[stage]??null;
  }
  function workflowRail(){
    const active=currentStage(),current=Math.max(0,steps.indexOf(active));
    return `<nav class="abv2-workflow" aria-label="Artboard production workflow">${steps.map((step,index)=>`<button type="button" data-abv2="view-stage:${index}" class="${index<current?'complete':index===current?'current':'pending'}" ${index>current&&!ui.productionDone&&!ui.visitedStages.has(step)?'disabled':''}><b>${index<current?'✓':index===current?'◌':index+1}</b><strong>${esc(step==='Input'?'Upload':step==='Analyzing'?'Analyze':step==='Artwork Creation'?'Generate':step==='Vectorization'?'Vectorize':step==='Validation'?'Validate':step)}</strong></button>`).join('')}</nav>`;
  }
  function elapsed(){const job=state.artboardJob||{},start=Date.parse(job.started_at||'')||ui.startedAt;const end=['completed','failed','cancelled'].includes(job.status)?Date.parse(job.completed_at||job.finished_at||job.updated_at||''):NaN;return start?new Date(Math.max(0,(Number.isFinite(end)?end:Date.now())-start)).toISOString().slice(14,19):'—';}
  function stageRows(stage){
    const p=project(),events=state.artboardEvents||[],reported=pattern=>events.some(e=>pattern.test(e.step||e.stage||''));
    const generated=side=>available().some(x=>x.side===side)&&Boolean(ui.generatedUrls[side]||p.ai_reconstruction?.by_part?.[available().find(x=>x.side===side)?.part_id]?.complete||ui.productionDone);
    if(stage==='Analyzing')return [
      ['Input received & validated',Boolean(p.project_id)],['Image properties analyzed',Boolean(ui.dimensions)],
      ['Design structure analysis',ui.analysisDone],['Color palette extraction',reported(/palette.*complet|colors.*extract/i)],
      ['Pattern & element detection',reported(/detect.*complet|surfaces.*ready/i)],['Production readiness check',productionApproved(p)]];
    if(stage==='Artwork Creation')return [
      ['Input analysis completed',ui.analysisDone],['Design structure mapped',ui.analysisDone&&available().length>0],
      ['AI artwork generation (Front)',generated('front_body')],['AI artwork generation (Back)',generated('back_body')],
      ['Artwork enhancement & cleanup',ui.productionDone||reported(/reconstruct completed|clean.*complet/i)],['Production validation',productionApproved(p)]];
    return [['Input & artwork analysis',ui.analysisDone],['AI artwork generation ('+available().map(x=>surfaceLabel(x.side)).join(' & ')+')',available().length>0&&available().every(x=>generated(x.side))],
      ['Design structure & part detection',available().length>0],['Vectorizing (path optimization)',ui.productionDone||reported(/optimize completed/i)],
      ['Path cleanup & simplification',ui.productionDone||reported(/compose completed/i)],['Vector validation & finalization',productionApproved(p)]];
  }
  function liveLog(){
    const stage=currentStage(),percent=stageProgress(),rows=stageRows(stage),active=rows.findIndex(row=>!row[1]);
    const step=Math.max(1,Math.min(5,steps.indexOf(stage))),file=state.files.artboard;
    return `<aside class="abv2-card abv2-log"><header><h2>▤ Working Log</h2><div class="abv2-log-step"><b>Step ${step} of 5</b><span>${[1,2,3,4,5].map(i=>`<i class="${i<=step?'active':''}"></i>`).join('')}</span></div></header>
      <div class="abv2-current"><strong>${esc(ui.stageStatus==='completed'?'Saved stage completed':friendlyActivity(state.stage||'Waiting for engine'))}</strong><b>${percent===null?(state.busy?'Live':'—'):Math.round(percent)+'%'}</b><div class="abv2-progress ${state.busy&&percent===null?'indeterminate':''}"><span style="width:${percent??25}%"></span></div></div>
      <ol aria-label="Production activity for this stage">${rows.map(([label,done],i)=>`<li class="${done?'complete':i===active&&state.busy&&ui.stageStatus!=='completed'?'active':'pending'}"><i>${done?'✓':i===active&&state.busy&&ui.stageStatus!=='completed'?'◌':'○'}</i><span>${esc(label)}</span><small>${done?'Reported':i===active&&state.busy&&ui.stageStatus!=='completed'?'In progress':ui.stageStatus==='completed'?'Not reported':'Pending'}</small></li>`).join('')}</ol>
      ${state.lastError?`<p role="alert" class="abv2-error-details">${esc(state.lastError)}</p>`:''}
      <div class="abv2-log-facts"><span><b>${esc(stage==='Analyzing'?ui.dimensions||'—':available().map(x=>surfaceLabel(x.side)).join(' & ')||'Awaiting surfaces')}</b><small>${stage==='Analyzing'?'Resolution':'Output'}</small></span><span><b>${stage==='Analyzing'?'RGB':'22 × 31 in'}</b><small>${stage==='Analyzing'?'Preview color':'Canvas'}</small></span><span><b>${file?esc(fmtSize(file.size)):'—'}</b><small>Input file</small></span></div>
      <div class="abv2-log-footer"><span>◷ Elapsed Time: <b data-abv2-elapsed>${elapsed()}</b></span><small>Engine-synced events</small></div></aside>`;
  }
  function originalPreview(){const url=state.objectURLs.artboard;return `<div class="abv2-visual abv2-scan ${ui.phase==='analyze'&&state.busy&&stageOf(state.stage,state.progress)==='Analyzing'?'active':''}">${url?`<img src="${url}" alt="Uploaded original design">`:`<img class="abv2-demo-visual" src="assets/artboard-v2/studio-front.webp" alt="Illustrative preview while the source renderer is unavailable"><span class="abv2-demo-caption">Visualization · source preview unavailable</span>`}<span class="abv2-corners" aria-hidden="true"></span><span class="abv2-beam" aria-hidden="true"></span><div class="abv2-analysis-hud" aria-hidden="true"><i class="abv2-hud-ring"></i><i class="abv2-hud-target"></i><i class="abv2-hud-corner top-left"></i><i class="abv2-hud-corner top-right"></i><i class="abv2-hud-corner bottom-left"></i><i class="abv2-hud-corner bottom-right"></i></div></div>`;}
  function selectedPartsBar(){
    const sides=available();if(!sides.length)return '';
    return '<div class="abv2-selection-bar" role="group" aria-label="Choose the artwork parts to review and export">'
      +'<strong>Artwork parts</strong>'
      +sides.map(part=>'<label class="abv2-part-toggle"><input type="checkbox" data-abv2-select="'+part.side+'" '+(ui.selected.has(part.side)?'checked':'')+'><span>'+surfaceLabel(part.side)+'</span></label>').join('')
      +'<small>'+ui.selected.size+' of '+sides.length+' selected · keep at least one</small></div>';
  }
  function artworkCard(side){
    const item=available().find(x=>x.side===side),label=surfaceLabel(side),chosen=ui.selected.has(side);
    const url=ui.generatedUrls[side] || (ui.productionDone?(ui.vectorUrls[side]||previewUrl(item)):'');
    const generating=Boolean(item)&&ui.generationStarted&&!ui.productionDone&&state.busy;
    const generated=Boolean(ui.generatedUrls[side]),vectorOnly=Boolean(!generated&&(ui.vectorUrls[side]||previewUrl(item)));
    return `<article class="abv2-card abv2-artwork ${chosen?'selected':''}"><header><h2>${label} Artwork</h2><span>${!item?'Not detected':generated?'AI artwork master':vectorOnly?'Saved vector preview':url?'Engine preview':generating?'Creating artwork':'Awaiting artwork'}</span></header>
      <div class="abv2-art-canvas ${generating?'abv2-creating':''}">${url?`<img class="abv2-genuine-image" src="${url}" alt="Real ${label} engine-produced artwork preview">`:
      `<div class="abv2-generation-placeholder"><img class="abv2-demo-visual" src="assets/artboard-v2/studio-${side==='back_body'?'back':'front'}.webp" alt="Illustrative ${label} design preview"><span class="abv2-demo-caption">Visual preview · engine result pending</span><p>${!item?'No independently visible '+label+' detected':generating?'AI creating '+label+' artwork — awaiting real preview':'Artwork preview awaiting engine output'}</p></div>`}
      <span class="abv2-art-grid" aria-hidden="true"></span></div>
      ${item?`<label class="abv2-select abv2-part-choice ${chosen?'is-selected':''}"><input type="checkbox" data-abv2-select="${side}" aria-label="Include ${label} in vector review and export" ${chosen?'checked':''}><span class="abv2-choice-indicator" aria-hidden="true">${chosen?'✓':'+'}</span><span>Include ${label} in vector review &amp; export</span></label>`:
      button(ui.recreatingSide===side?'Recreating '+label+'…':'✦ Recreate '+label+' with AI','recreate:'+side,'secondary',state.busy||Boolean(ui.recreatingSide))}
      ${!url&&item?'<small class="abv2-source-note">No invented preview: authentic artwork appears when the engine exposes it.</small>':''}
    </article>`;
  }
  function analysisProofPanel(sides){
    const p=project(),all=p.analysis_generation_audit||{},records=sides
      .map(side=>available().find(part=>part.side===side)).filter(Boolean);
    const status=(value,success)=>value===success?'verified':['REVIEW_REQUIRED','UNAVAILABLE','UNVERIFIED','PARTIAL_ANALYSIS_IN_GENERATION_REQUEST','NO_ACTIONABLE_DESIGN_FIELDS'].includes(value)?'review':'unknown';
    const label=value=>({
      COMPLETED:'Completed',UNAVAILABLE:'Unavailable — image-model self-analysis',
      SELF_ANALYSIS_ONLY:'Image-model self-analysis',
      VERIFIED_IN_GENERATION_REQUEST:'Brief included in generator request',
      PARTIAL_ANALYSIS_IN_GENERATION_REQUEST:'Partial brief included — truncated',
      NO_ACTIONABLE_DESIGN_FIELDS:'Brief contained no actionable design fields',
      UNVERIFIED:'Not verified',REVIEW_REQUIRED:'Review required',
    })[value]||'Not reported';
    return `<section class="abv2-card abv2-proof-panel" aria-label="Analysis-to-generation verification"><header><h2>Analysis → Generation Proof</h2><small>Real provider evidence only</small></header>
      <div class="abv2-proof-parts">${records.map(part=>{
        const audit=all[part.part_id]||p.ai_reconstruction?.by_part?.[part.part_id]?.analysis_generation_audit||{};
        const analysis=audit.analysis||{},handoff=audit.handoff||{},follow=audit.follow_through||{};
        const n=Number(analysis.duration_ms),duration=analysis.duration_ms!==null&&analysis.duration_ms!==undefined&&Number.isFinite(n)&&n>=0?Math.round(n)/1000+' seconds':'Not reported';
        const counts=analysis.summary?.fields||{},count=Object.values(counts).filter(x=>Number.isFinite(x)).reduce((a,b)=>a+b,0);
        return `<div class="abv2-proof-part"><div class="abv2-proof-part-title"><strong>${surfaceLabel(part.side)}</strong><small>${esc(audit.version||'Audit not returned by deployed engine')}</small></div>
          <div class="abv2-proof-cells">
            <div><small>Analyzer execution</small><b class="${status(analysis.status,'COMPLETED')}">${esc(label(analysis.status))}</b><span>${esc(analysis.model||'Model not reported')} · ${esc(duration)}</span></div>
            <div><small>Analysis sent to generator</small><b class="${status(handoff.status,'VERIFIED_IN_GENERATION_REQUEST')}">${esc(label(handoff.status))}</b><span>${esc(handoff.generation_model||'Generator not reported')}${handoff.included_analysis_characters?' · '+esc(handoff.included_analysis_characters)+' chars verified':''}</span></div>
            <div><small>Generated artwork follows brief</small><b class="${status(follow.status,'PASS')}">${esc(label(follow.status))}</b><span>Palette evidence is advisory; layout, motifs and micro-dots need review</span></div>
          </div>
          <div class="abv2-proof-meta"><span>Analysis fields: ${audit.version?esc(count):'Not reported'}</span><span>Prompt digest: ${handoff.provider_prompt_confirmed&&handoff.prompt_sha256?esc(handoff.prompt_sha256.slice(0,12))+'…':'Not verified'}</span></div>
        </div>`;
      }).join('')||'<p class="abv2-info">Awaiting a real prepared artwork surface.</p>'}</div>
      <p class="abv2-source-note">Source-analysis handoff is confirmed by a prompt receipt, not by appearance alone. Quality Mode separately runs semantic guidance, AI vector review and targeted corrections.</p>
    </section>`;
  }
  function savedJob(){return state.pendingArtboardJob || (state.artboardJob?.job_id&&project().project_id?state.artboardJob:null);}
  function jobNotice(){
    const job=savedJob();if(!job?.job_id)return '';
    if(job.status==='checkpoint_missing'){
      return '<section class="abv2-card abv2-recovery" role="alert">'+
        '<header><h2>Server job checkpoint unavailable</h2><small>'+esc(job.job_id.slice(0,12))+'</small></header>'+
        '<p>Job status disappeared from the backend storage. The previous artwork may still exist. Check the persistent volume and server restart logs before any new paid production.</p>'+
        '<div class="abv2-commands">'+button('Check Server Status','refresh-job','secondary')+'</div></section>';
    }
    const active=['queued','processing','cancelling'].includes(job.status);
    const lastAt=Date.parse(job.updated_at||job.events?.at(-1)?.at||job.started_at||'');
    const stale=active&&Number.isFinite(lastAt)&&Date.now()-lastAt>180000;
    const status=job.status==='cancelling'?'Cancellation in progress':stale?'No progress recently':job.status==='failed'?'Previous job failed':job.status==='completed'?'Previous job completed':'Unfinished production found';
    const info=job.status==='cancelling'?'The server is stopping at the next safe boundary.':active?'The job is on the server; refreshing never cancels paid work.':'You can review saved output or begin a new input.';
    return `<section class="abv2-card abv2-recovery" role="status"><header><h2>${esc(status)}</h2><small>${esc(job.job_id.slice(0,12))}</small></header><p>${esc(info)}</p><div class="abv2-commands">${button('Resume Production','resume-job','primary',job.status==='cancelling')}${button(active?'Cancel & New Input':'Start New Input','stop','danger')}${active?button('Check Status','refresh-job','secondary'):''}${job.status==='failed'&&project().ai_reconstruction?.complete===true?button('↻ Retry saved vector stages (no AI)','resume-vector','secondary'):''}</div></section>`;
  }
  function input(){
    const file=state.files.artboard, url=state.objectURLs.artboard;
    state.mode.artboard='quality';
    return `${top('Artboard AI','AI JERSEY ARTWORK ENGINE')}<div class="abv2-input-shell">
      <div class="abv2-modes abv2-production-only"><b><span>▱</span> Production Mode</b><div>
        <div class="abv2-mode-card active"><em>♔</em><span><strong>Maximum Quality Production</strong><small>Gemini analysis • Seedream artwork • AI-guided vectorization</small></span><i>✓</i></div>
      </div></div>
      <div class="abv2-auto-detect"><span>◎</span><div><b>Automatic Front / Back Detection</b><small>The analyzer identifies every independently visible jersey side. No manual side selection is required.</small></div></div>
      <div class="abv2-upload-panel">
        <div class="abv2-drop" data-droptool="artboard">${url?`<img class="abv2-upload-preview" src="${url}" alt="Uploaded artwork preview">`:file?`<span class="abv2-pdf-preview">${esc(file.name)}</span>`:""}<div class="abv2-upload-icon">${file?"✓":"⇧"}</div><strong>${file?"Replace Uploaded Design":"Drag &amp; Drop Your Design Here"}</strong><small>${file?"Click to replace this file":"or Click to Upload"}</small><div class="abv2-file-types"><span>PNG</span><span>JPG</span><span>WEBP</span><span>PDF</span><span>SVG</span></div><input type="file" data-file="artboard" aria-label="Upload artwork" accept=".png,.jpg,.jpeg,.webp,.pdf,.svg"></div>
        ${file?`<div class="abv2-file">${url?`<img src="${url}" alt="Input thumbnail">`:''}<div><strong>${esc(file.name)}</strong><small>${fmtSize(file.size)}${ui.dimensions?' · '+esc(ui.dimensions):''} · ${esc(file.type||'Artwork file')}</small></div><span>Input Ready</span><button type="button" data-abv2="clear" aria-label="Remove uploaded file">×</button></div>`:''}
        ${jobNotice()}<div class="abv2-commands">${button('▤ Clear Input','clear','danger',!file||state.busy)}${button('▷ Start Production  »','start','primary',!file||state.busy||!connected('artboard')||['queued','processing','cancelling'].includes(savedJob()?.status))}</div>
      </div>
    </div>`;
  }
  function analyze(){return `${top('Analyzing','Live design inspection • engine-synced artwork analysis')}<div class="abv2-process-grid abv2-analyzing" data-abv2-analysis-live="true"><div class="abv2-primary"><section class="abv2-card abv2-preview"><header><h2>Live Design Analysis</h2><span>${esc(statusText())}</span></header>${originalPreview()}<div class="abv2-analysis-live-status" role="status" aria-live="polite"><span class="abv2-analysis-dot" aria-hidden="true"></span><strong>${esc(state.stage||"Awaiting engine updates")}</strong><small>Scanning animation is visual; progress comes from the engine</small></div><div class="abv2-preview-foot"><span>Original input • ${esc(state.files.artboard?.name||'No file')}</span><span>${ui.analysisDone?'Reference prepared':state.busy?'Preparing reference':'Awaiting source'}</span></div>${ui.analysisDone?`<div class="abv2-result-summary"><b>Source preparation</b><span>${available().length} ${available().length===1?'print field':'print fields'} ready for image-model reconstruction</span></div>`:''}</section></div>${liveLog()}</div>${workflowRail()}${navigation('Analyzing')}`;}
  function select(){ui.phase='artwork';const prepared=available();
    if(!ui.analysisDone)return analyze();
    const ready=prepared.filter(x=>Boolean(ui.generatedUrls[x.side]||ui.vectorUrls[x.side]||previewUrl(x)||interimPreview(x.side)));
    const canContinue=ui.selected.size>0&&[...ui.selected].every(side=>ready.some(x=>x.side===side));
    const status=ui.generationError?'Production failed: '+esc(ui.generationError):ui.productionDone?'Generated artwork and validated vectors ready — select Front, Back or Both to review and export':state.busy?'Engine creating flat 2D artwork; previews appear as real files arrive':'Waiting for artwork generation';
    return `${top('Artwork Creation','Review AI-generated artwork. The engine already creates vectors during the same production job.')}<div class="abv2-select-summary" role="status">${esc(status)} • ${ui.selected.size} selected</div>
    <div class="abv2-art-grid-layout">${artworkCard('front_body')}${artworkCard('back_body')}<aside class="abv2-stage-rail">${workflowRail()}${liveLog()}</aside></div>

     <p class="abv2-source-note">No extra AI call: selection controls which saved Front/Back vectors you inspect and download.</p><div class="abv2-select-actions">${navigation('Artwork Creation')}${ui.analysisDone&&!ui.generationStarted?button('▷ Generate Artwork','produce','primary'):''}</div>`;
  }
  function processTitle(){const stage=stageOf(state.stage);return stage==='Validation'?'Validation':stage==='Vectorization'?'Vectorization':stage==='Export'?'Export':'Artwork Creation';}
  function validationView(sides,verified){
    const parts=sides.map(side=>available().find(item=>item.side===side)).filter(Boolean);
    const current=parts.find(item=>item.side===ui.validationSide)||parts[0]||{};
    const validation=current.validation||{},master=project().validation||{};
    const physical=validation.physical_artboard||master.artboard||{};
    const fidelity=validation.production_fidelity||master.production_fidelity?.by_part?.[current.part_id]||master.production_fidelity||{};
    const detail=validation.local_detail_fidelity||{};
    const valueStatus=value=>value==='PASS'?true:value==='REVIEW_REQUIRED'||value==='FAIL'?false:null;
    const percent=stageProgress()??(verified&&ui.stageStatus==='completed'?100:null);
    const acceptance=deliveryAcceptance();
    const result=(label,value,detailText)=>`<li><span><i>${value===true?'✓':value===false?'!':'•'}</i><span><strong>${esc(label)}</strong><small>${esc(detailText)}</small></span></span><b class="${value===true?'pass':value===false?'fail':''}">${esc(value===true?'PASS':value===false?'REVIEW':'Not reported')}</b></li>`;
    const checks=[
      ['SVG structure',validation.valid_svg===true?true:validation.valid_svg===false?false:null,'Actual SVG syntax and integrity'],
      ['True vector',validation.true_vector===true?true:validation.true_vector===false?false:null,'Raster-free, independently editable geometry'],
      ['Embedded rasters',Number.isFinite(validation.embedded_rasters)?validation.embedded_rasters===0:null,Number.isFinite(validation.embedded_rasters)?String(validation.embedded_rasters)+' embedded raster(s)':'Awaiting vector inspection'],
      ['Artwork fidelity',valueStatus(fidelity.status),fidelity.status==='REVIEW_REQUIRED'?'Review vector against accepted AI artwork':'Source-to-vector comparison'],
      ['Micro details',valueStatus(detail.status),detail.status==='REVIEW_REQUIRED'?String(detail.total_lost_dark_pixels??'—')+' dark / '+String(detail.total_lost_bright_pixels??'—')+' bright pixels flagged':detail.status==='PASS'?'No flagged dark/bright marks in diagnostic proof':'Diagnostic not yet reported'],
      ['Editability',valueStatus(validation.editability_status),validation.editability_status==='REVIEW_REQUIRED'?'Detail preserved; manual editing may be complex':'Designer editing targets'],
      ['Illustrator verification',deliveryAcceptance().illustrator?true:null,deliveryAcceptance().illustrator?'Verified in desktop Illustrator':'Pending actual desktop import and editing test'],
      ['Production canvas',valueStatus(physical.status),physical.width_in&&physical.height_in?String(physical.width_in)+' × '+String(physical.height_in)+' inches':'Physical dimensions not yet reported'],
    ];
    const hasCompare=Boolean(ui.generatedUrls[current.side]&&ui.vectorUrls[current.side]);
    const selectedSide=current.side||'front_body';
    return `${top('Validation','Verified quality results for the accepted AI artwork and final vector')}${selectedPartsBar()}<div class="abv2-validation-layout">
      <section class="abv2-card abv2-validation-meter"><div class="abv2-gauge" style="--value:${percent??0}"><div><strong>${percent===null?'—':Math.round(percent)+'%'}</strong><small>${verified?'Processing complete':'Validation running'}</small></div></div><ol>
        <li class="complete"><i>✓</i><span>Upload &amp; Analyze</span><b>Complete</b></li><li class="complete"><i>✓</i><span>Generate AI Artwork</span><b>Complete</b></li><li class="complete"><i>✓</i><span>Vectorize Paths</span><b>Complete</b></li><li class="${verified?'complete':'active'}"><i>${verified?'✓':'◌'}</i><span>Validate Output</span><b>${verified?'Complete':percent===null?'Checking':Math.round(percent)+'%'}</b></li><li><i>○</i><span>Prepare Export</span><b>Waiting</b></li>
      </ol><p class="abv2-source-note">Vector validation does not automatically certify perfect visual fidelity or native Illustrator layers.</p></section>
      <section class="abv2-card abv2-validation-preview"><header><div><h2>Live Preview — <span>Validation</span></h2><small>Saved artwork and true-vector output — no simulated quality scores</small></div><b>${verified?'Technical Vector PASS':'Checking…'}</b></header>
        <div class="abv2-validation-arts">${parts.map(part=>{const side=part.side,url=ui.vectorUrls[side]||previewUrl(part);return `<div><strong>${surfaceLabel(side)} vector</strong><div class="abv2-art-canvas validation-overlay">${url?`<img class="abv2-genuine-image" src="${esc(url)}" alt="${surfaceLabel(side)} real vector artwork preview">`:'<img class="abv2-demo-visual" src="assets/artboard-v2/studio-'+(side==='back_body'?'back':'front')+'.webp" alt="Illustrative validation visual"><span class="abv2-demo-caption">Visualization · awaiting saved vector</span>'}<span class="abv2-art-grid"></span>${!verified?'<span class="abv2-beam"></span>':''}</div></div>`;}).join('')}</div>
        <div class="abv2-compare-actions">${button(ui.compareSource?'Hide Artwork Comparison':'Compare AI Artwork vs Vector','toggle-compare','secondary',!hasCompare)}<small>${hasCompare?'Uses actual saved AI and vector artifacts':'Both saved AI and vector previews are required'}</small></div>
        ${ui.compareSource&&hasCompare?`<div class="abv2-source-comparison"><div><strong>AI artwork master</strong><img src="${esc(ui.generatedUrls[current.side])}" alt="Accepted ${surfaceLabel(current.side)} AI-generated artwork"></div><div><strong>Final vector</strong><img src="${esc(ui.vectorUrls[current.side])}" alt="${surfaceLabel(current.side)} verified SVG vector rendering"></div></div>`:''}
        <div class="abv2-validation-stats"><span><b>${esc(validation.path_count??'—')}</b><small>Total Paths</small></span><span><b>${esc(validation.segment_count??'—')}</b><small>Segments</small></span><span><b>${esc(validation.gradient_count??'—')}</b><small>Gradients</small></span><span><b>${esc(physical.width_in&&physical.height_in?String(physical.width_in)+' × '+String(physical.height_in)+' in':'Not reported')}</b><small>Canvas</small></span></div>
      </section>
      <section class="abv2-card abv2-validation-checks"><header><h2>Validation Results</h2><b class="${acceptance.passed?'pass':'fail'}">${acceptance.passed?'Quality checks PASS':acceptance.technical?'Review required':'Validation pending'}</b></header>
        <div class="abv2-side-switch" role="group" aria-label="Review validation by artwork side">${parts.map(part=>button(surfaceLabel(part.side),'review-side:'+part.side,part.side===selectedSide?'selected':'secondary')).join('')}</div>
        <ul>${checks.map(row=>result(...row)).join('')}</ul>
        ${detail.status==='REVIEW_REQUIRED'?'<p class="abv2-advisory" role="status">Local detail check flagged differences for review. The original AI artwork remains unchanged.</p>':''}
        ${Array.isArray(project().warnings)&&project().warnings.length?`<details class="abv2-warning-details"><summary>Production advisories (${project().warnings.length})</summary><ul>${project().warnings.slice(0,12).map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>`:''}
      </section>
    </div>${workflowRail()}${navigation('Validation')}`;
  }
  function vectorFinishing(sides){
    const parts=sides.map(side=>available().find(item=>item.side===side)).filter(Boolean);
    return `<section class="abv2-card abv2-vector-finishing" aria-label="Vector finishing details"><header><h2>Vector Finishing</h2><small>Saved engine output • no extra AI request</small></header>
      <div class="abv2-finishing-grid">${parts.map(part=>{
        const validation=part.validation||{},hasVector=Boolean(ui.vectorUrls[part.side]||part.exports?.svg);
        const detail=validation.local_detail_fidelity||{};
        return `<div class="abv2-finishing-part"><strong>${surfaceLabel(part.side)} vector</strong>
          <dl><div><dt>Bézier geometry</dt><dd>${hasVector?'SVG available for curve inspection':'Awaiting vector SVG'}</dd></div>
          <div><dt>Vector paths</dt><dd>${esc(validation.path_count??'Not reported')}</dd></div>
          <div><dt>Anchor points</dt><dd>${esc(validation.total_anchor_count??'Not reported')}</dd></div>
          <div><dt>Gradient paints</dt><dd>${esc(validation.gradient_count??'Not reported')}</dd></div>
          <div><dt>Artwork fidelity</dt><dd>${esc(validation.production_fidelity?.status||'Not reported')}</dd></div>
          <div><dt>Micro-details</dt><dd>${esc(detail.status||'Not reported')}</dd></div></dl>
        </div>`;}).join('')}</div>
      <p class="abv2-source-note">Detailed palette and curve-fitting decisions are not in the public project response. Inspect the real exported vector; do not infer them from animations.</p>
    </section>`;
  }
  function processing(){const title=ui.processingStage||processTitle();
    const isVector=title==='Vectorization',isValid=title==='Validation';
    const subsets=[...ui.selected];
    const onlyValid=subsets.filter(side=>available().some(x=>x.side===side));
    const verified=productionApproved();
    if(isValid)return validationView(onlyValid,verified);
    return `${top(title,title==='Validation'?'Live production-quality and print-readiness review':isVector?'AI-guided vector tracing, optimization and grouping':'Live artwork creation' )}${selectedPartsBar()}
    <div class="abv2-art-grid-layout ${onlyValid.length===1?'single':''}">${onlyValid.map(side=>{
      const part=available().find(x=>x.side===side),url=(isVector||isValid?ui.vectorUrls[side]:ui.generatedUrls[side]) || previewUrl(part) || ui.generatedUrls[side] || interimPreview(side);
      const active=(state.busy&&state.activePipeline==='Production'&&ui.stageStatus!=='completed')||(isValid&&ui.finishing);
      return `<section class="abv2-card abv2-artwork"><header><h2>${surfaceLabel(side)} ${title}</h2><span>${esc(ui.stageStatus==='completed'?'Completed':friendlyActivity(state.stage||'Preparing'))}</span></header>
      <div class="abv2-art-canvas ${isVector?'vector-overlay':''} ${isValid?'validation-overlay':''}">
      ${url?`<img class="abv2-genuine-image" src="${url}" alt="${surfaceLabel(side)} verified engine preview">`:`<img class="abv2-demo-visual" src="assets/artboard-v2/studio-${side==='back_body'?'back':'front'}.webp" alt="Illustrative ${surfaceLabel(side)} jersey visual"><span class="abv2-demo-caption">Illustrative visual · awaiting real artwork</span>`}
      <span class="abv2-art-grid" aria-hidden="true"></span>
      ${isVector&&active?'<span class="abv2-vector-simulation" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>':''}
      ${isVector?`<svg class="abv2-real-paths" data-abv2-paths-side="${side}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>`:''}
      ${isVector&&active?'<span class="abv2-beam" aria-hidden="true"></span>':''}
      ${isVector?'<div class="abv2-path-status">AI guidance informs tracing and optimization. Actual saved SVG geometry appears when available; corrections occur before validation.</div>':''}</div>
      ${isValid?`<div class="abv2-validation-results">${[['Valid SVG',part?.validation?.valid_svg],['True vector',part?.validation?.true_vector],['Raster count',part?.validation?.embedded_rasters],['Editability',part?.validation?.editability_status],['Print readiness',part?.validation?.physical_artboard?.status]].map(([name,value])=>`<span><small>${esc(name)}</small><b class="${value===true?'pass':value===false?'fail':''}">${esc(value===true?'PASS':value===false?'FAILED':value??'Not reported')}</b></span>`).join('')}</div>`:''}
      <div class="abv2-side-note">${esc(ui.stageStatus==='completed'?(verified?'Validated vector saved — Illustrator sign-off pending':'Stage completed'):friendlyActivity(state.stage||'Preparing stage data'))}</div></section>`;
      }).join('')}<aside class="abv2-stage-rail">${liveLog()}</aside></div>${workflowRail()}${navigation(title)}${state.lastError&&project().ai_reconstruction?.complete===true?`<div class="abv2-commands">${button('↻ Retry saved AI artwork (no image regeneration)','resume-vector','secondary',state.busy)}</div>`:''}`;
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
    const native=items[0]?.part_id ? (p.artwork_resolution||{})[items[0].part_id]||{} : {};
    const dims=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)?value.join(' × ')+' px':'Not reported';
    const specs=[
      ['Vector paths',paths],['Main paths',first(v.main_path_count,p.validation?.main_path_count)],
      ['AI image pixels',dims(native.received_dimensions)],
      ['AI requested pixels',dims(native.requested_dimensions)],
      ['AI requested tier',native.requested_tier==='MAX_SUPPORTED_4_6MP'?'Up to 4.6 MP (request only)':first(native.requested_tier)],
      ['Actual generated megapixels',Number.isFinite(native.received_megapixels)?native.received_megapixels+' MP':'Not reported'],
      ['Native 4K status',native.native_4k_confirmed===true?'Verified by backend':native.received_dimensions?'Below 4K / not confirmed':'Not reported'],
      ['Vector source pixels',dims(native.vectorization_source_dimensions)],
      ['Color mode',first(v.color_mode,p.validation?.color_mode)],
      ['PostScript level',first(v.postscript_level,p.validation?.postscript_level)],
      ['EPS version',first(v.eps_version,p.validation?.eps_version)],
      ['Canvas',physical.width_in&&physical.height_in?`${physical.width_in} × ${physical.height_in} in`:'22 × 31 in (requested)'],
      ['Anchor points',first(v.total_anchor_count,p.validation?.total_anchor_count)],
      ['Vector segments',first(v.segment_count,p.validation?.segment_count)],
      ['Gradient paints',first(v.gradient_count,p.validation?.gradient_count)],
      ['Artwork fidelity',first(v.production_fidelity?.status,p.validation?.production_fidelity?.status)],
      ['Micro-details',first(v.local_detail_fidelity?.status)],
      ['Raster proof DPI',first(v.dpi,physical.raster_proof_dpi,p.validation?.dpi)],
      ['Editable true vector',p.true_vector_ready===true?'Engine-confirmed':p.true_vector_ready===false?'Not confirmed':'Not reported'],
      ['AI review gate',qualityMode(p)?first(p.validation?.ai_vector_review?.status):'Not used in Normal Mode'],
      ['AI review calls',qualityMode(p)?first(p.validation?.ai_vector_review?.rounds):'Not used in Normal Mode'],
      ['Targeted fix passes',qualityMode(p)?first(p.validation?.ai_vector_review?.fixes):'Not used in Normal Mode'],
      ['Print validation',first(p.validation?.status,v.status)]];
    return `<section class="abv2-production-details" aria-label="Production details"><h2>Production Details</h2><div class="abv2-tech-grid">${specs.map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div></section>`;
  }
  // A returned server ZIP is preferred. When the existing API returns only individual
  // artifacts, assemble an uncompressed, standards-compliant ZIP in the browser.
  // This does NOT run AI, alter vector files, or make any new production API requests.
  function exportedArtifacts(){
    if(!productionApproved())return []; // Never surface stale files from a failed Quality review.
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
    if(!productionApproved())return notify('AI vector review and technical validation must pass before packaging');
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
      a.href=href;a.download='Artboard_'+String(p.project_id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48)+'_Master_'+(p.processing_mode==='quality'?'quality':'normal')+'.zip';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(href),60000);
      update('ZIP downloaded: '+entries.length+' existing files. No new production was started.');
      log('Downloaded client-assembled ZIP from '+entries.length+' actual Artboard artifacts');
    }catch(error){update('ZIP download failed: '+error.message);notify('ZIP download failed: '+error.message);}
    finally{ui.zipBusy=false;if(button)button.disabled=false;}
  }
  async function continueSelectedIllustrator(){
    const p=project(),items=exportedArtifacts(),item=items.find(x=>x.format==='premium_svg'&&x.label!=='Project')||
      items.find(x=>x.format==='svg'&&x.label!=='Project')||items.find(x=>x.format==='svg');
    if(!p.project_id||!item)return notify('No selected-side editable SVG is available');
    if(!productionApproved(p))return notify('Complete vector review and technical validation before Illustrator handoff');
    try{
      const blob=await call('artboard',artifactEndpoint(p.project_id,item.path),{response:'blob'});
      if(!blob?.size)throw Error('The selected SVG artifact is empty');
      const cleanName=(item.path.split('/').pop()||'Artboard_'+(p.processing_mode==='quality'?'quality':'normal')+'.svg').replace(/[^a-zA-Z0-9_.-]/g,'_');
      const file=new File([blob],cleanName,{type:'image/svg+xml'});
      if(navigator.canShare?.({files:[file]})){
        await navigator.share({files:[file],title:'Open '+item.label+' SVG in Illustrator'});
        log('Offered selected '+item.label+' SVG to OS app chooser');return;
      }
      const href=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=href;a.download=cleanName;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(href),60000);
      notify('Editable SVG downloaded. Open it in Adobe Illustrator on your desktop.');
      log('Downloaded selected '+item.label+' editable SVG for desktop Illustrator');
    }catch(e){if(e?.name==='AbortError'){notify('Illustrator handoff cancelled');return;}
      notify('Illustrator handoff failed: '+e.message);log('Illustrator handoff failed: '+e.message);}
  }

  async function downloadIllustratorHandoff(withReference=false){
    if(ui.handoffBusy||state.busy)return notify('An export is already running');
    if(['queued','processing','cancelling'].includes(savedJob()?.status))
      return notify('Finish or cancel the existing engine job before preparing a handoff');
    const p=project(),selected=available().filter(x=>!ui.selected.size||ui.selected.has(x.side));
    if(!p.project_id||!productionApproved(p)||!selected.length)
      return notify('A validated Front/Back vector is required for Illustrator handoff');
    const id=p.project_id, epoch=ui.workspaceEpoch;
    ui.handoffBusy=true;render();
    try{
      await run('Create Illustrator desktop handoff archive',async()=>{
        state.activePipeline='Export';state.stage='Packaging Illustrator desktop files';
        state.progress=null;render();
        const j=await call('artboard','api/artboard/export',{method:'POST',
          json:{project_id:id,part_ids:selected.map(part=>part.part_id),
            formats:['eps','svg','zip'],bundle:'illustrator_handoff',
            include_reference_raster:withReference}});
        captureJob('Artboard',j);
        await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Export');
        if(ui.workspaceEpoch!==epoch||project().project_id!==id||ui.cancelRequested)return;
        state.artboardResult=await call('artboard','api/artboard/projects/'+id);
        const latest=state.artboardResult.last_export||{};
        const output=latest.zip_path;
        if(latest.bundle!=='illustrator_handoff'||
           Boolean(latest.include_reference_raster)!==Boolean(withReference)||
           typeof output!=='string'||!output.endsWith('.zip'))
          throw Error('Engine did not confirm the requested Illustrator handoff ZIP');
        await download('artboard',artifactEndpoint(id,output));
        notify(withReference?
          'Illustrator ZIP downloaded. The generated reference PNG is optional and non-printing on desktop.':
          'Illustrator ZIP downloaded. Open validated EPS using the included desktop script.');
        state.stage='Illustrator handoff ZIP downloaded';state.progress=null;
      });
    }finally{ui.handoffBusy=false;render();}
  }

  function colorEditingPanel(parts){
    return parts.map(part=>{
      const report=part.validation?.premium_master;
      const groups=report?.main_color_groups||[];
      if(!groups.length)return '';
      const previous=new Map((report.explicit_group_recolors||[]).map(edit=>[edit.group_id,edit]));
      return `<details class="abv2-card abv2-color-editor" data-abv2-color-part="${esc(part.part_id)}"><summary>${esc(surfaceLabel(part.side))} · Edit main colors</summary>
        <p class="abv2-info">Shift a color family together, or edit an exact shade below. Review the downloaded SVG for shade clipping; gradients and original print files stay intact.</p>
        <details><summary>Main color families</summary>${(report.logical_color_families||[]).map(family=>`<label class="abv2-color-row"><span>${esc(family.representative_hex)} · ${family.shade_count} shades · ${family.path_objects} objects</span><input type="color" aria-label="${esc(surfaceLabel(part.side)+' family '+family.id)}" data-abv2-family="${esc(family.id)}" value="${esc(family.representative_hex)}"><select aria-label="Region for ${esc(family.id)}" data-abv2-family-region="${esc(family.id)}"><option value="">Whole color family</option>${(family.regions||[]).map(region=>`<option value="${esc(region)}">${esc(region)}</option>`).join('')}</select></label>`).join('')}</details>
        ${groups.slice(0,32).map(group=>{
          const edit=previous.get(group.id);
          return `<label class="abv2-color-row"><span>${esc(group.hex)} · ${Number(group.path_objects)||0} objects</span>
            <input type="color" aria-label="${esc(surfaceLabel(part.side)+' '+group.hex)}" data-abv2-color="${esc(group.id)}" value="${esc(edit?.new_hex||group.hex)}">
            <select aria-label="Region for ${esc(group.hex)}" data-abv2-color-region="${esc(group.id)}"><option value="">All objects with this exact fill</option>${(group.regions||[]).map(region=>`<option value="${esc(region)}" ${edit?.region===region?'selected':''}>${esc(region)}</option>`).join('')}</select></label>`;
        }).join('')}
        ${button('↓ Download recolored SVG','recolor:'+part.part_id,'secondary',state.busy)}
        <p class="abv2-info">${groups.length} exact colors retained. Showing the ${Math.min(32,groups.length)} most used colors. Additional colors remain editable in Illustrator.</p></details>`;
    }).join('');
  }

  async function downloadRecolored(partId){
    if(state.busy||!productionApproved())return;
    const p=project(),epoch=ui.workspaceEpoch;
    const part=available().find(item=>item.part_id===partId);
    const panel=[...document.querySelectorAll('[data-abv2-color-part]')].find(el=>el.dataset.abv2ColorPart===partId);
    if(!part||!panel)return;
    const groups=part.validation?.premium_master?.main_color_groups||[];
    const colors={};
    const families=part.validation?.premium_master?.logical_color_families||[];
    for(const input of panel.querySelectorAll('[data-abv2-family]')){
      const family=families.find(item=>item.id===input.dataset.abv2Family);
      if(!family||!/^#[0-9a-f]{6}$/i.test(input.value)||input.value.toLowerCase()===family.representative_hex.toLowerCase())continue;
      const region=[...panel.querySelectorAll('[data-abv2-family-region]')].find(el=>el.dataset.abv2FamilyRegion===family.id)?.value||'';
      colors[family.id]=region?{hex:input.value,region}:input.value;
    }
    for(const input of panel.querySelectorAll('[data-abv2-color]')){
      const group=groups.find(item=>item.id===input.dataset.abv2Color);
      if(!group||!/^#[0-9a-f]{6}$/i.test(input.value))continue;
      if(input.value.toLowerCase()===group.hex.toLowerCase())continue;
      const region=[...panel.querySelectorAll('[data-abv2-color-region]')].find(el=>el.dataset.abv2ColorRegion===group.id)?.value;
      colors[group.id]=region?{hex:input.value,region}:input.value;
    }
    if(!Object.keys(colors).length)return notify('Choose a new color first');
    await run('Export',async()=>{
      const job=await call('artboard','api/artboard/export',{method:'POST',json:{project_id:p.project_id,part_ids:[partId],formats:['svg'],master_edits:{[partId]:{colors}}}});
      captureJob('artboard',job);
      await jobPoll('artboard','api/artboard/jobs/'+job.job_id,'Export');
      if(ui.workspaceEpoch!==epoch||project().project_id!==p.project_id)return;
      state.artboardResult=await call('artboard','api/artboard/projects/'+p.project_id);
      const result=available().find(item=>item.part_id===partId);
      const applied=result?.validation?.premium_master?.explicit_group_recolors||[];
      if(!result?.exports?.premium_svg||!Object.keys(colors).every(id=>applied.some(edit=>edit.group_id===id&&edit.recolored_shapes>0)))throw Error('Engine did not confirm all requested color edits');
      await download('artboard',artifactEndpoint(p.project_id,result.exports.premium_svg));
      notify('Recolored editable SVG downloaded. Original print artwork is preserved.');
    });
  }

  function studioSettings(){
    const part=available().find(x=>ui.selected.has(x.side))||available()[0]||{},v=part.validation||{};
    const physical=v.physical_artboard||project().validation?.artboard||{};
    const color=v.color_mode||project().validation?.color_mode;
    return `<div class="abv2-studio-settings"><h3>⚙ Production Settings</h3><div><span>▱ Canvas Size</span><b>${esc(physical.width_in&&physical.height_in?physical.width_in+' × '+physical.height_in+' in':'22 × 31 in print canvas')}</b></div><div><span>◉ Color Mode</span><b>${esc(color||'See exported file profile')}</b></div><div><span>▦ Resolution</span><b>Resolution-independent vector</b></div></div>`;
  }
  function studioSummary(){
    const parts=available().filter(x=>!ui.selected.size||ui.selected.has(x.side));
    const total=key=>parts.length&&parts.every(x=>Number.isFinite(x.validation?.[key]))?parts.reduce((n,x)=>n+x.validation[key],0).toLocaleString():'—';
    return `<section class="abv2-studio-summary"><div><b>◇ Production Summary</b><small>Final output details and quality report</small></div><span><b>${total('path_count')}</b><small>Total Paths</small></span><span><b>${parts.length||'—'}</b><small>Selected Parts</small></span><span><b>${total('gradient_count')}</b><small>Gradients</small></span><span><b>22 × 31 in</b><small>Canvas Size</small></span><span class="${productionApproved()?'pass':''}"><b>${deliveryAcceptance().passed?'Quality checks PASS':productionApproved()?'Technical Vector PASS':'Review pending'}</b><small>Engine validation status</small></span></section>`;
  }
  function exportPage(){
    const p=project(),parts=available().filter(x=>!ui.selected.size||ui.selected.has(x.side)),confirmed=productionApproved(p);
    const needsReview=!deliveryAcceptance(p).passed;
    const items=exportedArtifacts(),formats=[...new Set(items.map(x=>x.format))];
    const printFormats=['eps','svg','pdf','png'];
    const designerKinds={premium_svg:'Premium Master SVG',editability_report:'Editability Report',color_groups_report:'Color Groups Report'};
    const designerFiles=items.filter(x=>Object.hasOwn(designerKinds,x.format));
    const format=ui.downloadFormat||(['svg','eps','pdf','png'].find(value=>formats.includes(value))||'');
    const links=confirmed?items.filter(x=>x.format===format&&printFormats.includes(x.format)):[];
    const dl=item=>`<button type="button" class="abv2-btn" data-download="artboard|${esc(artifactEndpoint(p.project_id,item.path))}">↓ Download ${esc(item.label)}</button>`;
    const hasZip=items.some(x=>x.format==='zip'),canZip=confirmed&&items.length>0;
    const exportRecovery=confirmed?(state.busy?'<p class="abv2-info" role="status">Preparing saved production files. Your artwork and validation are preserved.</p>':state.lastError||!items.length?'<div class="abv2-advisory" role="status"><p>'+esc(state.lastError||'Export files are not ready yet.')+'</p><p>Artwork and validation are saved. Retry export without regenerating artwork.</p>'+button(ui.exportJob?'↻ Reconnect Export':'↻ Retry Export','retry-export','primary')+'</div>':''):'';
    return `${top('Export Production','Validated output files — select a format or download the complete available package')}${selectedPartsBar()}${exportRecovery}${needsReview?'<p class="abv2-advisory" role="status">Technical exports are available. The engine flagged artwork fidelity, micro-detail or editability for review; inspect the original artwork against the final vector before client delivery.</p>':''}<div class="abv2-export-grid">
      <section class="abv2-export-left"><div class="abv2-card abv2-export-preview"><header><div><h2>● Live Preview — Final Output</h2><small>Editable Vector • Clean Paths • Saved engine output</small></div><div class="abv2-zoom-controls">${button('⊖','zoom-out','secondary')}${button('⊕','zoom-in','secondary')}${button('⛶','zoom-fit','secondary')}${button('◫ Compare','toggle-compare','secondary',!parts.some(part=>ui.generatedUrls[part.side]&&ui.vectorUrls[part.side]))}</div></header>
      <div class="abv2-export-arts" style="--preview-zoom:${ui.previewZoom}">${parts.map(part=>`<div><strong>${surfaceLabel(part.side)}</strong>${(ui.compareSource?ui.generatedUrls[part.side]:ui.vectorUrls[part.side])||previewUrl(part)?`<img src="${(ui.compareSource?ui.generatedUrls[part.side]:ui.vectorUrls[part.side])||previewUrl(part)}" alt="Real ${surfaceLabel(part.side)} completed artwork">`:'<p>Preview not available from the engine</p>'}</div>`).join('')||'<p>No final artwork detected.</p>'}</div></div></section>
      <div class="abv2-export-center">
        <section class="abv2-card abv2-export-settings"><header><div><h2>◇ Export Options</h2><small>Choose format and download your production files.</small></div></header><h3>File Format</h3>
          <div class="abv2-format-grid">${['ai','eps','pdf','svg','png'].map(f=>`<button type="button" class="abv2-format ${format===f?'selected':''}" data-abv2="select-format:${f}" aria-pressed="${format===f}" ${!confirmed||!printFormats.includes(f)||!formats.includes(f)?'disabled':''}><i class="format-${f}">${f==='ai'?'Ai':f.toUpperCase()}</i><strong>${f.toUpperCase()}</strong><small>${f==='ai'?'Desktop only':f==='eps'?'Print':f==='pdf'?'Press ready':f==='svg'?'Web / Vector':'Preview'}</small></button>`).join('')}</div>
          <p class="abv2-info">${format?'Available '+format.toUpperCase()+' files':'No format preselected. Choose a ready format to download.'}</p>
          <div class="abv2-format-downloads">${links.map(dl).join('')}</div>${studioSettings()}
        </section>
        ${confirmed?'<details class="abv2-color-details"><summary>Edit Artwork Colors</summary>'+colorEditingPanel(parts)+'</details>':''}
        <details class="abv2-card abv2-designer-files abv2-optional"><summary>Illustrator editing files · ${designerFiles.length} available</summary>
          <p class="abv2-info">Premium SVG preserves editable vector groups. Reports are metadata, not artwork images.</p>
          <div class="abv2-designer-list">${designerFiles.length?designerFiles.map(item=>`<button type="button" class="abv2-btn abv2-designer-download" data-download="artboard|${esc(artifactEndpoint(p.project_id,item.path))}"><b>↓ ${esc(designerKinds[item.format])}</b><small>${esc(item.label)} · ${esc(item.path.split('/').pop())}</small></button>`).join(''):'<p class="abv2-info">Editable-master companions are not available for the selected artwork.</p>'}</div>
          <p class="abv2-info">Native Illustrator layers require a desktop Illustrator check.</p>
        </details>
      </div>
      <aside class="abv2-export-right"><div class="abv2-export-primary-actions">${button('↓ Download Master ZIP','download-master-zip','primary',!canZip)}${button('Continue to Illustrator','illustrator','amber',!confirmed||(!formats.includes('svg')&&!formats.includes('premium_svg')))}</div><div class="abv2-export-actions">        <section class="abv2-card abv2-package"><header><h2>Master ZIP</h2><small>Download Package</small></header><ul class="abv2-package-checks">${parts.map(part=>`<li><i>${Object.keys(part.exports||{}).length?'✓':'○'}</i><span>${surfaceLabel(part.side)} Artwork <small>${esc(Object.keys(part.exports||{}).filter(x=>['ai','eps','pdf','svg','png'].includes(x)).join(', ').toUpperCase()||'Awaiting files')}</small></span></li>`).join('')}<li><i>${designerFiles.length?'✓':'○'}</i><span>Editable SVG &amp; color reports</span></li></ul><details class="abv2-optional"><summary>Package details</summary><p>${hasZip?'Download the verified master ZIP returned by the engine.':'Download a ZIP containing all existing, available export files — assembled in your browser without regenerating artwork.'}</p></details>
          <p class="abv2-info" role="status" aria-live="polite" data-abv2-zip-status>${hasZip?'Engine ZIP ready':canZip?'Ready to package '+items.length+' existing exported files':'No downloadable files returned by engine'}</p>
        </section>
        <section class="abv2-card abv2-illustrator"><header><h2>Adobe Illustrator</h2></header>
          <details class="abv2-optional"><summary>Illustrator import details</summary><p>Continue with the premium editable SVG when available; otherwise use validated SVG.</p></details>

          <div class="abv2-handoff-actions">
            ${button('↓ Illustrator Handoff ZIP','illustrator-handoff','secondary',!confirmed||state.busy||ui.handoffBusy)}
            ${button('↓ ZIP + Reference PNG','illustrator-handoff-reference','secondary',!confirmed||state.busy||ui.handoffBusy)}
          </div>
          <p class="abv2-source-note">Handoff ZIP runs export/packaging only, never new AI artwork generation. Reference image is opt-in, separate from true-vector print exports and must remain hidden/non-printing in desktop Illustrator.</p>
          <details class="abv2-illustrator-guide abv2-optional"><summary>Desktop .AI instructions</summary><strong>Native .AI requires desktop Illustrator</strong><span>Import the validated EPS, run the optional Illustrator script and compare before/after proofs. A browser cannot generate native AI layers.</span>
            <a href="https://github.com/nafiulnahid17/Artboard-AI---Resolution-Independent-/blob/main/desktop/illustrator-native-layers.jsx" target="_blank" rel="noopener noreferrer">View desktop handoff script</a>
          </details></section>
        <section class="abv2-card abv2-new-production"><header><h2>New Production</h2></header><p>Start again with a new design.</p>${button('＋ New Production','new','primary')}</section>
</div><details class="abv2-optional-report"><summary>Production Specs &amp; Quality Metrics</summary>${productionDetails()}</details></aside>
    </div>${studioSummary()}<div class="abv2-export-bottom">${workflowRail()}${button('＋ Continue to New Production','new','primary')}</div>`;
  }

  function display(){
    if(!ui.selectionTouched&&!ui.selected.size&&available().length)ui.selected=new Set(available().map(part=>part.side));
    // Never reopen old processing screens automatically on refresh or tool entry.
    const phase=ui.preferInput?'input':ui.view||ui.phase;
    return `<section class="abv2" data-abv2-root data-screen="${phase==='processing'?ui.processingStage:phase}">${phase==='input'?input():phase==='analyze'?analyze():phase==='artwork'||phase==='select'?select():phase==='export'?exportPage():processing()}</section>`;
  }
  let lastRenderedTool=state.tool,lastRenderedStage=null;
  const ecosystemRender=render;
  render=function(...args){
    const entering=state.tool==='artboard'&&lastRenderedTool!=='artboard';
    document.body.classList.toggle('artboard-workspace',state.tool==='artboard');
    if(entering){document.body.classList.add('sidebar-collapsed');if(typeof closeMenu==='function')closeMenu();}
    if(state.tool!=='artboard')document.body.classList.remove('sidebar-collapsed');
    lastRenderedTool=state.tool;
    const btn=document.querySelector('#menuButton');
    if(btn&&state.tool==='artboard'&&typeof innerWidth!=='undefined'&&innerWidth>780)btn.setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-collapsed')));
    const result=ecosystemRender(...args);
    if(state.tool==='artboard'&&lastRenderedStage!==currentStage()){lastRenderedStage=currentStage();if(typeof window!=='undefined')window.scrollTo?.({top:0,behavior:'instant'});}
    if(state.tool!=='artboard')lastRenderedStage=null;
    return result;
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
    const p=project(),id=p.project_id,epoch=ui.workspaceEpoch;if(!id||!available().length)return;
    for(const part of available())for(const [kind,suffix] of [['generated','working/'+part.part_id+'-ai-vectorization-source.png'],['vector','vectors/'+part.part_id+'.svg']]){
      const cache=kind==='generated'?ui.generatedUrls:ui.vectorUrls,key=kind+':'+part.part_id;
      if(cache[part.side]&&!force||ui.assetBusy.has(key)||!force&&Date.now()-(ui.assetRetry[key]||0)<3500)continue;
      // Do not probe before the engine has started production.
      if(!ui.generationStarted)continue;
      ui.assetBusy.add(key);ui.assetRetry[key]=Date.now();
      try{
        const finalKey=kind==='vector'&&ui.productionDone?(part.exports?.premium_svg||part.previews?.svg||part.exports?.svg):null;
        const blob=await call('artboard',artifactEndpoint(id,finalKey||'projects/'+id+'/'+suffix),{response:'blob'});
        if(!blob?.size||epoch!==ui.workspaceEpoch||project().project_id!==id||!available().some(item=>item.part_id===part.part_id&&item.side===part.side))continue;
        // Only a real artifact from the engine becomes a preview, never a mockup.
        const previous=cache[part.side];cache[part.side]=URL.createObjectURL(blob);if(previous)URL.revokeObjectURL(previous);
        if(state.tool==='artboard')render();
      }catch(e){/* 404 until generated: normal, no invented preview. */}
      finally{ui.assetBusy.delete(key)}
    }
  }
  function syncProductionStage(){
    if(ui.view||ui.finishing||!ui.generationStarted||ui.productionDone||state.activePipeline!=='Production')return false;
    const reportedStage=stageOf(state.stage,state.progress);
    const order={'Artwork Creation':0,'Vectorization':1,'Validation':2};
    const currentOrder=order[ui.processingStage||'Artwork Creation']??0;
    const next=order[reportedStage]>currentOrder+1?'Vectorization':reportedStage;
    if((ui.phase==='artwork'||ui.phase==='processing')&&(next==='Vectorization'||next==='Validation')){
      const current=ui.processingStage||'Artwork Creation';
      if(order[next]>order[current]){
        ui.phase='processing';ui.processingStage=next;ui.stageStatus=reportedStage!==next?'completed':'';ui.visitedStages.add(next);render();return true;
      }
    }
    return false;
  }
  function refresh(){
    const root=document.querySelector('.abv2');if(!root)return;
    // Move from the dedicated analyzer screen only when the engine actually
    // reports artwork generation. No synthetic timers or invented percentages.
    if(ui.phase==='analyze'&&ui.generationStarted&&state.activePipeline==='Production'&&!ui.view&&stageOf(state.stage,state.progress)==='Artwork Creation'){
      ui.phase='artwork';ui.processingStage='Artwork Creation';ui.visitedStages.add('Artwork Creation');render();return;
    }
    if(syncProductionStage())return;
    const monitor=root.querySelector('.abv2-current');
    if(monitor){const v=stageProgress(),events=stageEvents();monitor.querySelector('strong').textContent=ui.stageStatus==='completed'?'Stage completed':state.lastError?'Action needed':state.busy&&events.length?friendlyActivity(events.at(-1)?.step||events.at(-1)?.stage):'Preparing the next update';monitor.querySelector('b').textContent=v==null?(state.busy?'Live':'—'):Math.round(v)+'%';const bar=monitor.querySelector('.abv2-progress');bar?.classList.toggle('indeterminate',state.busy&&v==null);if(bar?.firstElementChild)bar.firstElementChild.style.width=(v??25)+'%';}
    const logPanel=root.querySelector('.abv2-log');if(logPanel)logPanel.outerHTML=liveLog();
    const status=root.querySelector('.abv2-step-label');if(status)status.textContent=state.stage||statusText();
    if((ui.phase==='artwork'||ui.phase==='processing')&&ui.generationStarted)void loadSideAssets();
    if(ui.phase==='processing'){
      const live=state.objectURLs.artboard_live;
      if(live){for(const [side,item] of available().map(x=>[x.side,x])){
        const img=root.querySelector('.abv2-artwork img[alt="'+surfaceLabel(side)+' verified engine preview"]');
        const url=ui.vectorUrls[side]||previewUrl(item)||ui.generatedUrls[side]||interimPreview(side);if(img&&url&&img.getAttribute('src')!==url)img.src=url;
      }}
      if(ui.processingStage==='Vectorization')void paintVectorOverlay();
    }
    if(ui.phase==='processing'&&ui.processingStage==='Artwork Creation'&&state.objectURLs.artboard_live){
      const previewSide=available().length===1?available()[0].side:null;
      if(previewSide){const image=root.querySelector('.abv2-artwork img');const url=interimPreview(previewSide);if(image&&url&&image.getAttribute('src')!==url)image.src=url;}
    }
  }
  async function start(){const f=state.files.artboard;if(!f)return notify('Upload a supported file first');if(!connected('artboard'))return notify('Artboard engine is unavailable');
    if(['queued','processing','cancelling'].includes(savedJob()?.status))return notify('Resume or cancel existing job before starting a paid production');
    const epoch=++ui.workspaceEpoch;ui.startedAt=Date.now();
    state.pendingArtboardJob=null;state.artboardJob=null;try{sessionStorage.removeItem('mj_artboard_job')}catch{}
    ui.preferInput=false;ui.exportJob=null;ui.selected.clear();ui.selectionTouched=false;ui.stageProgressHigh={};ui.stageProgressJob=null;ui.prepared=[];ui.visitedStages.clear();ui.stageStatus='';ui.lastPreviewPath='';state.artboardPreviewPath='';ui.view=null;ui.phase='analyze';ui.analysisDone=false;ui.generationStarted=false;ui.processingStage='';ui.downloadFormat='';ui.cancelRequested=false;ui.productionDone=false;ui.continued=false;ui.finishing=false;ui.exportStarted=false;ui.generationError='';ui.compareSource=false;ui.validationSide=null;ui.generatedUrls={};ui.vectorUrls={};ui.assetRetry={};ui.assetBusy.clear();
    state.mode.artboard='quality';
    await run('Artboard source upload',async()=>{state.artboardEvents=[];state.artboardEventKeys.clear();state.artboardJob=null;state.lastMode='quality';state.progress=null;
      const p=await call('artboard','api/artboard/projects',{method:'POST',json:{name:f.name.slice(0,120),processing_mode:state.lastMode}});state.artboardProject=p;state.artboardResult=p;
      const fd=new FormData();fd.append('project_id',p.project_id);fd.append('file',f);state.artboardResult=await call('artboard','api/artboard/upload',{method:'POST',body:fd});state.activePipeline='Upload';state.stage='Source uploaded';state.progress=null;});
    if(ui.workspaceEpoch!==epoch)return;
    if(ui.cancelRequested){reset(true);return;}
    if(!state.lastError)await analyzeSurfaces();
  }
  async function waitForPreparedProject(id,required=[],attempts=7){
    let latest=null;
    for(let attempt=0;attempt<attempts;attempt++){
      latest=await call('artboard','api/artboard/projects/'+id,{timeoutMs:30000});
      state.artboardResult=latest;
      const returned=new Set(available().map(part=>part.side));
      if(required.length?required.every(side=>returned.has(side)):returned.size>0)return latest;
      state.stage='Source references ready — syncing artwork inputs';state.progress=100;render();
      if(attempt<attempts-1)await sleep(450+attempt*250);
    }
    return latest;
  }
  async function analyzeSurfaces(){const id=project().project_id,epoch=ui.workspaceEpoch;if(!id||ui.cancelRequested)return;await run('Analyze uploaded artwork',async()=>{
    ui.phase='analyze';state.activePipeline='Prepare';state.stage='Preparing artwork reference';state.progress=null;render();
    // The backend vision analyzer is authoritative for surface discovery.
    // This removes the old manual Front/Back contract and prevents a user
    // selection from silently dropping a visible side.
    const requested=[];
    let prepared=false,lastFailure=null;
    try{
      state.artboardEvents=[];state.artboardEventKeys.clear();state.stage='Detecting visible Front / Back artwork';state.progress=null;render();
      const job=await call('artboard','api/artboard/prepare',{method:'POST',json:{project_id:id,detect_visible_surfaces:true,auto:true,self_analysis:false,width_in:22,height_in:31}});
      captureJob('Artboard',job);if(ui.cancelRequested){void stop();return;}await jobPoll('artboard','api/artboard/jobs/'+job.job_id,'Prepare');
      if(ui.cancelRequested||epoch!==ui.workspaceEpoch)return;
      state.stage='Source references ready — syncing artwork inputs';state.progress=100;render();
      await waitForPreparedProject(id,requested);
      if(available().length)prepared=true;
      else throw Error('No independently visible Front or Back artwork was detected');
    }catch(e){lastFailure=e;
      log('Required-surface preparation reported: '+e.message);
    }
    if(ui.cancelRequested||epoch!==ui.workspaceEpoch)return;
    if(!prepared)throw Error('Required artwork sides were not prepared; production was not started: '+(lastFailure?.message||'No result'));
    ui.analysisDone=true;ui.prepared=available();ui.selected=new Set(available().map(part=>part.side));ui.selectionTouched=false;ui.phase='analyze';ui.processingStage='Analyzing';state.stage='Reference prepared — starting detailed analysis';state.progress=null;render();
  });
    if(ui.analysisDone&&!state.lastError&&!ui.cancelRequested&&ui.workspaceEpoch===epoch)await produce();
  }
  async function produce(){
    if(ui.cancelRequested)return;
    const epoch=ui.workspaceEpoch,id=project().project_id;if(!id||!available().length)return notify('Prepare a visible artwork surface first');
    ui.generationStarted=true;ui.productionDone=false;ui.phase='analyze';ui.processingStage='Analyzing';ui.visitedStages.clear();ui.stageStatus='';
    await run('Artboard AI artwork creation',async()=>{
      state.activePipeline='Production';state.stage='Starting artwork analysis';state.progress=null;state.artboardEvents=[];state.artboardEventKeys.clear();render();
      const j=await call('artboard','api/artboard/production',{method:'POST',json:{project_id:id,ai_reconstruction:true,processing_mode:state.lastMode||state.mode.artboard}});
      captureJob('Artboard',j);if(ui.cancelRequested){void stop();return;}await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Production');
      if(ui.cancelRequested||ui.workspaceEpoch!==epoch||project().project_id!==id)return;
      state.artboardResult=await syncedExportProject(id,epoch);
      if(!productionApproved(state.artboardResult))throw Error('The Quality AI review or technical validation is not confirmed by the engine');
      ui.productionDone=true;if(!ui.selectionTouched&&!ui.selected.size)ui.selected=new Set(available().map(part=>part.side));ui.phase='processing';ui.processingStage='Validation';ui.stageStatus='completed';ui.visitedStages.add('Validation');state.stage='Vectorization and validation completed';state.progress=100;
      await loadSideAssets(true);
      await reviewUnseenStages(epoch);
      render();
    });
    if(ui.workspaceEpoch!==epoch)return;
    if(state.lastError){
      ui.generationError=state.lastError;
      // The engine may have stored a REVIEW_REQUIRED gate before its job failed.
      // Fetch it without a new AI request so the UI can explain the blocked output.
      try{state.artboardResult=await call('artboard','api/artboard/projects/'+id);}catch{}
    }
    if(!ui.cancelRequested&&ui.productionDone&&ui.selected.size){ui.continued=true;await completeSelectedWorkflow();}
    render();
  }
  async function recreateSurface(side){
    if(!['front_body','back_body'].includes(side)||state.busy||ui.recreatingSide)return;
    const id=project().project_id;if(!id)return notify('Start a production before recreating a missing side');
    const epoch=ui.workspaceEpoch;ui.recreatingSide=side;state.lastError='';render();
    try{
      await run('Recreate missing '+surfaceLabel(side)+' artwork',async()=>{
        state.activePipeline='Production';state.stage='Recreating missing '+surfaceLabel(side)+' artwork with AI';state.progress=null;render();
        const job=await call('artboard','api/artboard/recreate',{method:'POST',json:{project_id:id,surface:side,processing_mode:'quality'}});
        captureJob('Artboard',job);await jobPoll('artboard','api/artboard/jobs/'+job.job_id,'Production');
        if(epoch!==ui.workspaceEpoch)return;
        state.artboardResult=await call('artboard','api/artboard/projects/'+id);
        if(!ui.selectionTouched)ui.selected=new Set(available().map(part=>part.side));
        await loadSideAssets(true);
        state.stage=surfaceLabel(side)+' artwork recreated and added to production';state.progress=null;
      });
    }finally{if(epoch===ui.workspaceEpoch){ui.recreatingSide=null;render();}}
  }
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  async function syncedExportProject(id,epoch=ui.workspaceEpoch){
    // A completed job can be followed by a transient R2/proxy read failure.
    // Retry only the saved project GET, never the paid production request.
    for(let attempt=0;;attempt++){
      if(ui.cancelRequested||ui.workspaceEpoch!==epoch)throw Error('Export sync cancelled');
      try{return await call('artboard','api/artboard/projects/'+id)}
      catch(error){
        const code=Number(error?.httpStatus);
        const temporary=[408,429,500,502,503,504,520,521,522,523,524].includes(code)||
          (!code&&/network|failed to fetch|load failed|timed out|connection/i.test(error?.message||''));
        if(!temporary||attempt>=4)throw error;
        state.stage='Reconnecting to saved export data'+(code?' (HTTP '+code+')':'');
        log(state.stage+'; artwork and validation retained');render();
        await sleep(Math.min(8000,1000*2**attempt));
      }
    }
  }
  async function continueToVectorization(){
    if(ui.continued)return;
    if(!ui.selected.size)return notify('Select at least one generated artwork side');
    const ready=[...ui.selected].every(side=>Boolean(ui.generatedUrls[side]||ui.vectorUrls[side]||previewUrl(available().find(x=>x.side===side))||interimPreview(side)));
    if(!ready)return notify('Selected artwork preview is not ready yet');
    ui.continued=true;ui.phase='processing';ui.view=null;ui.processingStage='Vectorization';ui.stageStatus=ui.productionDone?'completed':'';ui.visitedStages.add('Vectorization');render();
    if(ui.productionDone)await completeSelectedWorkflow();
  }
  async function reviewUnseenStages(epoch){
    for(const stage of ['Artwork Creation','Vectorization','Validation']){
      if(ui.cancelRequested||ui.workspaceEpoch!==epoch)return;
      if(ui.visitedStages.has(stage))continue;
      ui.phase=stage==='Artwork Creation'?'artwork':'processing';ui.processingStage=stage;
      ui.stageStatus='completed';ui.visitedStages.add(stage);render();
      // Review saved output, never pretend that a finished engine is still processing.
      await sleep(1100);
    }
  }
  async function completeSelectedWorkflow(){
    const epoch=ui.workspaceEpoch;
    if(ui.cancelRequested||ui.finishing||ui.exportStarted||!ui.continued||!ui.productionDone)return;
    if(!productionApproved())return notify('AI review and technical validation have not cleared this production');
    ui.finishing=true;
    try{
      // Vectorization and validation already ran in the REAL production job.
      // Never replay finished stages or move back to 52% to simulate activity.
      ui.phase='export';ui.view=null;ui.processingStage='Export';ui.stageStatus='completed';
      ui.visitedStages.add('Validation');state.activePipeline='Validation';
      state.stage='Saved vectorization and validation complete';state.progress=100;render();
      await loadSideAssets(true);
      if(ui.cancelRequested||ui.workspaceEpoch!==epoch)return;
      if(ui.exportStarted||ui.cancelRequested||ui.workspaceEpoch!==epoch)return;
      ui.exportStarted=true;
      const id=project().project_id;
      await run('Prepare Artboard export files',async()=>{
        ui.phase='export';ui.processingStage='Export';ui.stageStatus='completed';state.activePipeline='Export';state.stage='Preparing EPS SVG PDF PNG ZIP';state.progress=null;render();
        // Retain an accepted export job across polling/project-sync outages.
        // Reconnect to that job on retry instead of submitting another export.
        const j=ui.exportJob||await call('artboard','api/artboard/export',{method:'POST',json:{project_id:id,formats:['eps','svg','pdf','png','zip'],bundle:'production_pack'}});
        ui.exportJob=j;captureJob('Artboard',j);if(ui.cancelRequested){void stop();return;}await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Export');
        if(ui.cancelRequested||ui.workspaceEpoch!==epoch)return;
        state.artboardResult=await syncedExportProject(id,epoch);
        if(!exportedArtifacts().length)throw Error('Engine returned no export files');
        await loadSideAssets(true);
        ui.exportJob=null;
        ui.phase='export';ui.processingStage='Export';ui.downloadFormat='';state.stage='Production complete';state.progress=null;
      });
      if(state.lastError){ui.exportStarted=false;if(state.artboardJob?.status==='failed')ui.exportJob=null;}
    }finally{ui.finishing=false;render()}
  }


  async function resumeVectorStages(){
    const saved=project(),id=saved.project_id,mode=saved.ai_reconstruction?.processing_mode||state.lastMode||state.mode.artboard;
    if(state.busy)return notify('A job is still running. Check status before retrying');
    if(!id||saved.ai_reconstruction?.complete!==true)return notify('No saved AI artwork exists for a retry without paid image regeneration');
    if(['queued','processing','cancelling'].includes(savedJob()?.status))return notify('Previous server job is still active; do not duplicate it');
    const epoch=ui.workspaceEpoch;
    ui.preferInput=false;ui.view=null;ui.phase='processing';ui.processingStage='Vectorization';ui.generationStarted=true;
    ui.productionDone=false;ui.stageStatus='';ui.generationError='';
    await run('Resume saved vectorization without paid artwork regeneration',async()=>{
      state.activePipeline='Production';state.stage='Reusing saved artwork — guided vector retry and AI review may incur calls';state.progress=null;
      state.artboardEvents=[];state.artboardEventKeys.clear();render();
      const j=await call('artboard','api/artboard/production',{method:'POST',
        json:{project_id:id,processing_mode:mode,ai_reconstruction:true,resume_from_ai:true}});
      captureJob('Artboard',j);
      await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Production');
      if(ui.cancelRequested||ui.workspaceEpoch!==epoch)return;
      state.artboardResult=await call('artboard','api/artboard/projects/'+id);
      if(!productionApproved(state.artboardResult))throw Error('AI review or technical validation did not approve the saved vector');
      ui.productionDone=true;ui.stageStatus='completed';ui.phase='processing';ui.processingStage='Validation';
      state.stage='Saved AI artwork vectorized and validated';state.progress=100;
      await loadSideAssets(true);
    });
    if(state.lastError)ui.generationError=state.lastError;
    render();
  }
  async function resumeSavedJob(){
    const old=savedJob();if(!old?.job_id)return notify('No saved job to resume');
    const epoch=ui.workspaceEpoch;
    ui.preferInput=false;
    if(old.status==='cancelling')return notify('Cancellation is in progress; check status');
    const isPrepare=old.stage==='artboard-prepare',isExport=old.stage==='export';
    ui.view=null;ui.phase=isPrepare?'analyze':isExport?'processing':stageOf(old.step||old.stage,old.progress)==='Analyzing'?'analyze':'artwork';
    ui.processingStage=isPrepare?'Analyzing':isExport?'Export':ui.phase==='analyze'?'Analyzing':'Artwork Creation';
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
        if(!isPrepare)ui.productionDone=productionApproved(state.artboardResult);
        if(isPrepare){ui.phase='artwork';ui.generationStarted=false}
        else if(isExport&&job.status==='completed')ui.phase='export';
        else if(job.status==='completed'){ui.phase='artwork';ui.productionDone=productionApproved(state.artboardResult)}
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
        if(!isPrepare)ui.productionDone=productionApproved(state.artboardResult);
        if(isPrepare){ui.phase='artwork';ui.generationStarted=false}
        else if(isExport){ui.phase='export';ui.exportStarted=true;await loadSideAssets(true)}
        else{ui.phase='artwork';ui.productionDone=productionApproved(state.artboardResult);ui.generationStarted=true;await loadSideAssets(true)}
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
    ++ui.workspaceEpoch;ui.exportJob=null;ui.preferInput=false;ui.phase='input';ui.view=null;ui.analysisDone=false;ui.generationStarted=false;ui.processingStage='';ui.downloadFormat='';ui.prepared=[];ui.recreatingSide=null;
    ui.selected.clear();ui.selectionTouched=false;ui.stageProgressHigh={};ui.stageProgressJob=null;ui.visitedStages.clear();ui.stageStatus='';ui.lastPreviewPath='';ui.continued=false;
    ui.productionDone=false;ui.finishing=false;ui.exportStarted=false;ui.cancelRequested=false;ui.handoffBusy=false;
    ui.generationError='';ui.compareSource=false;ui.validationSide=null;ui.assetBusy.clear();ui.assetRetry={};
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
    if(a==='toggle-navigation'){document.querySelector('#menuButton')?.click();return;}
    if(a==='retry-export'){if(state.busy)return;ui.continued=true;await completeSelectedWorkflow();return;}
    if(a==='next-stage'||a.startsWith('view-stage:')){
      const index=a==='next-stage'?Math.min(5,steps.indexOf(currentStage())+1):Number(a.split(':')[1]);
      const live=steps.indexOf(stageOf(state.stage,state.progress));
      if(index>live&&!ui.productionDone&&!ui.visitedStages.has(steps[index]))return notify('This stage is still awaiting the engine');
      if(index===5&&!exportedArtifacts().length){
        if(!state.busy&&ui.productionDone&&productionApproved()){ui.continued=true;ui.view=null;await completeSelectedWorkflow();}
        else notify('Export files are still being prepared');
        return;
      }
      ui.view=index===0?'input':index===1?'analyze':index===2?'artwork':index===5?'export':'processing';
      ui.processingStage=steps[index];ui.stageStatus=ui.productionDone?'completed':'';render();return;
    }
    if(a==='zoom-in'||a==='zoom-out'||a==='zoom-fit'){ui.previewZoom=a==='zoom-fit'?1:Math.max(.65,Math.min(2,ui.previewZoom+(a==='zoom-in'?.15:-.15)));render();return;}
    if(a==='resume-vector')return resumeVectorStages();if(a==='start')return start();if(a==='resume-job')return resumeSavedJob();if(a==='refresh-job')return refreshSavedJob();if(a==='continue-vectorization')return continueToVectorization();if(a==='produce')return produce();if(a==='stop')return stop();
    if(a==='clear'){if(state.busy)return;state.files.artboard=null;const u=state.objectURLs.artboard;if(u)URL.revokeObjectURL(u);delete state.objectURLs.artboard;render();return}
    if(a==='home'||a==='new')return reset();
    if(a==='toggle-compare'){
      const selected=available().find(part=>part.side===ui.validationSide)||available().find(part=>ui.selected.has(part.side))||available()[0];
      if(!selected||!ui.generatedUrls[selected.side]||!ui.vectorUrls[selected.side])return notify('AI artwork and saved SVG previews are both required for comparison');
      ui.compareSource=!ui.compareSource;render();return;
    }
    if(a.startsWith('review-side:')){
      const side=a.slice('review-side:'.length);
      if(!available().some(part=>part.side===side)||ui.selected.size&&!ui.selected.has(side))return;
      ui.validationSide=side;ui.compareSource=false;render();return;
    }
    if(a==='illustrator-handoff')return downloadIllustratorHandoff(false);
    if(a.startsWith('recolor:'))return downloadRecolored(a.slice('recolor:'.length));
    if(a==='illustrator-handoff-reference')return downloadIllustratorHandoff(true);
    if(a==='illustrator')return continueSelectedIllustrator();if(a==='download-master-zip')return downloadMasterZip();if(a.startsWith('select-format:')){ui.downloadFormat=a.split(':')[1];render();return;}
    if(a==='previous'){
      if(state.busy)return notify('Active job: cancel processing before changing stages');
      const index=Math.max(0,steps.indexOf(currentStage())-1);
      ui.view=index===0?'input':index===1?'analyze':index===2?'artwork':index===5?'export':'processing';
      ui.processingStage=steps[index];ui.compareSource=false;render();return;
    }
    if(a.startsWith('mode:')){state.mode.artboard='quality';render();return}
    if(a.startsWith('recreate:'))return recreateSurface(a.slice('recreate:'.length));
    if(a.startsWith('recreate:'))return notify('AI missing-side recreation is not exposed through this frontend’s existing Artboard gateway allowlist. No request was submitted.');
  },true);
  document.addEventListener('change',e=>{const b=e.target.closest('[data-abv2-select]');if(!b)return;const side=b.dataset.abv2Select;if(!available().some(item=>item.side===side))return;if(!b.checked&&ui.selected.size<=1){b.checked=true;notify('Keep at least one Front or Back part selected');return;}if(b.checked)ui.selected.add(side);else ui.selected.delete(side);ui.selectionTouched=true;ui.validationSide=ui.selected.has(ui.validationSide)?ui.validationSide:[...ui.selected][0];render();},true);
  document.addEventListener('change',e=>{if(e.target?.dataset?.file!=='artboard')return;ui.dimensions='';const f=e.target.files?.[0];if(!f||!f.type.startsWith('image/')||f.type.includes('svg'))return;const image=new Image();const url=URL.createObjectURL(f);image.onload=()=>{ui.dimensions=`${image.naturalWidth} × ${image.naturalHeight} px`;URL.revokeObjectURL(url);if(state.files.artboard===f)render()};image.onerror=()=>URL.revokeObjectURL(url);image.src=url;});
  // Preserve the ecosystem menu behavior, but collapse the sidebar when Artboard opens.
  document.addEventListener('click',e=>{const t=e.target.closest('[data-tool]');if(t?.dataset.tool==='artboard'){ui.view=null;ui.phase='input';ui.preferInput=Boolean(savedJob()?.job_id);document.body.classList.add('sidebar-collapsed');if(typeof closeMenu==='function')closeMenu()}},true);
  // Keep the existing start action available for code paths that call it directly.
  startArtboard=start;
  if(state.tool==='artboard'){document.body.classList.add('artboard-workspace');document.body.classList.add('sidebar-collapsed');render();}
})();
