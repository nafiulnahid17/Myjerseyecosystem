'use strict';
/* My Jersey frontend: all job data comes from the configured API gateway.
   No sample jobs, fake counts, simulated model responses, or invented outputs. */
const realTemplates = {
  mockup: [
    {template_id:'mockup_luxury_float',name:'Luxury 3D Float',description:'Cinematic floating product composition'},
    {template_id:'mockup_stadium_hero',name:'Stadium Hero',description:'Premium floodlit stadium campaign'},
    {template_id:'mockup_editorial_launch',name:'Editorial Launch',description:'Fashion and lifestyle campaign'}
  ],
  video: [
    {template_id:'video_luxury_360',name:'Luxury 360°',description:'Smooth studio rotation'},
    {template_id:'video_stadium_reveal',name:'Stadium Reveal',description:'Tunnel-to-stadium reveal'},
    {template_id:'video_kinetic_social',name:'Kinetic Social Promo',description:'Fast premium social cuts'}
  ]
};
const engineMeta={artboard:{name:'Artboard AI',icon:'assets/artboard-ai.svg',desc:'AI Artwork Reconstruction & Editable Vector Production',tag:'One or two independently visible jersey surfaces'},frame:{name:'Frame Forge AI',icon:'assets/frame-forge-ai.svg',desc:'Template-Driven Mockup & Video Generation',tag:'3 mockup templates · 3 video templates'},assets:{name:'AssetsX AI',icon:'assets/assetsx-ai.svg',desc:'Visual Asset Analysis, Editing & Vectorization',tag:'Universal asset workflow · basic editing v0.1.0'},autofly:{name:'Autofly',icon:'assets/autofly.svg',desc:'One-Click Artboard AI Orchestration',tag:'Brief · Separate Panels · Combined Image'}};
const toolCardSteps={artboard:['Upload','Analyze','Artwork','Vectorize','Export'],frame:['Input','Template','Mockup','Video','Download'],assets:['Input','Analyze','Edit','Vectorize','Export'],autofly:['Input','Artboard','One Click','Export']};
const state={tool:'home',mode:{artboard:'quality',frame:'quality',assets:'quality',autofly:'quality'},status:{},files:{artboard:null,frame:null,assets:null,autofly:null,autofly_back:null,logo:null},objectURLs:{},selectedMockup:'mockup_luxury_float',selectedVideo:'video_luxury_360',templates:structuredClone(realTemplates),formats:{artboard:['eps','svg','pdf'],assets:['png','transparent_png','svg','eps','pdf','zip'],autofly:['svg','eps']},assetInfo:null,assetsJob:null,assetElements:new Set(),editing:'none',frames:{mockup:null,video:null},formValues:{},artboardProject:null,artboardResult:null,artboardJob:null,artboardEvents:[],artboardEventKeys:new Set(),activePipeline:'',autoflyJob:null,autoflyWorkflow:'combined',jobs:[],busy:false,stage:'',progress:null,output:null,logs:[],lastError:'',lastTask:'',artboardPreviewPath:'',failedStage:'',failedFormats:[],lastMode:'',lastJobId:'',restoredArtboardJob:false,pendingArtboardJob:null};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtSize=n=>n==null?'':n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`;
const m=()=>state.mode[state.tool]||'quality';
const displayState=t=>state.status[t]?.state||'unknown';
const connected=t=>displayState(t)==='online';
const healthText=t=>({online:'Live API reachable',not_configured:'Not configured',unreachable:'Unreachable',not_ready:'Not ready',missing_identity:'Missing identity',unknown:'Not checked'})[displayState(t)]||'Not checked';
function notify(s){const e=document.querySelector('#notification');e.textContent=s;e.hidden=false;clearTimeout(notify._t);notify._t=setTimeout(()=>e.hidden=true,4500)}
function stamp(){return new Date().toLocaleTimeString('en-GB',{hour12:false})}
function log(message){state.logs.push(`[${stamp()}] ${String(message)}`);if(state.logs.length>80)state.logs.shift();updateMonitor()}
function apiError(j){return j?.error?.message||j?.error?.technical_summary||j?.detail?.message||j?.detail||j?.message||'Request failed'}
async function call(engine,path,{method='GET',json=null,body=null,response='json',timeoutMs=null}={}){
 const headers={};let content=body;
 if(json!==null){headers['Content-Type']='application/json';content=JSON.stringify(json)}
 const controller=typeof AbortController==='function'?new AbortController():null;
 const requestTimeout=timeoutMs??(method==='GET'?45000:180000);
 const timer=controller&&requestTimeout>0?setTimeout(()=>controller.abort(),requestTimeout):null;
 try{
  const r=await fetch('/api/engine/'+engine+'/'+path,{method,headers,body:content,cache:'no-store',credentials:'same-origin',signal:controller?.signal});
  if(!r.ok){
   const payload=await r.json().catch(()=>({}));
   const error=new Error(engine+': '+apiError(payload)+' (HTTP '+r.status+')');
   error.httpStatus=r.status;
   throw error;
  }
  return response==='blob'?r.blob():r.json();
 }catch(e){
  if(e?.name==='AbortError')throw Error(engine+': request timed out while waiting for the server');
  throw e;
 }finally{if(timer)clearTimeout(timer)}
}
async function statusCheck(){
 try{
  const r=await fetch('/api/status',{cache:'no-store',credentials:'same-origin'});
  if(!r.ok){const details=await r.json().catch(()=>({}));throw Error('Engine status HTTP '+r.status+': '+apiError(details))}
  const j=await r.json();if(j.source!=='live_health_requests')throw Error('Unverified health response');
  state.status=j.engines||{};
  log('Live health check received');
  if(connected('frame')){try{const c=await call('frame','api/frameforge/templates');if(Array.isArray(c.mockup)&&Array.isArray(c.video))state.templates=c}catch(e){log('Frame Forge catalog unavailable: '+e.message)}}
 }catch(e){state.status={};log('Gateway unavailable: '+e.message);notify(e.message)}
 render();
 if(!state.restoredArtboardJob){state.restoredArtboardJob=true;await restoreArtboardSession()}
}
async function restoreArtboardSession(){
 // Never automatically reopen a previous workflow or start job polling on page load.
 let saved=null;
 try{saved=JSON.parse(sessionStorage.getItem('mj_artboard_job')||'null')}catch{return}
 if(!saved?.project_id||!saved?.job_id)return;
 try{
  const project=await call('artboard','api/artboard/projects/'+encodeURIComponent(saved.project_id));
  const job=await call('artboard','api/artboard/jobs/'+encodeURIComponent(saved.job_id));
  if(job.project_id!==project.project_id)throw Error('Job/project identity mismatch');
  state.artboardProject=project;state.artboardResult=project;state.artboardJob=job;
  state.pendingArtboardJob=job;
  state.lastMode=saved.mode||project.processing_mode||state.mode.artboard;
  state.lastJobId=job.job_id;
  state.activePipeline=job.stage==='export'?'Export':job.stage==='artboard-prepare'?'Prepare':'Production';
  state.stage=job.step||job.stage||'Previous job';
  state.progress=typeof job.progress==='number'?job.progress:null;
  log('Saved Artboard job verified: '+job.status+' — user choice required');
  render();
 }catch(e){log('Saved Artboard job could not be verified: '+e.message)}
}
function resetJob(){if(state.busy)return;state.logs=[];state.progress=null;state.stage='';state.lastError='';state.lastTask=''}
function toolIcon(t,cls='tool-icon'){const x=engineMeta[t];return `<img class="${cls}" src="${x.icon}" alt="${esc(x.name)} logo">`}
function head(t){const x=engineMeta[t];return `<section class="ribbon theme-${t}"><div class="ribbon-head"><div class="ribbon-icon" style="color:var(--accent)">${toolIcon(t,'ribbon-logo')}</div><div class="ribbon-title"><span class="eyebrow">MY JERSEY AI TOOL</span><h1>${esc(x.name)}</h1><p>${esc(x.desc)}</p></div><div class="ribbon-aside"><b>${esc(x.tag)}</b><span>Quality + Fast & Cost-Effective modes</span><small>By Atherious Labs</small></div></div></section>`}
function tagStatus(t){let s=displayState(t);return `<span class="badge ${s==='online'?'good':s==='not_configured'?'muted':'warn'}">${esc(healthText(t))}</span>`}
function launchCard(t,color){const x=engineMeta[t];return `<button type="button" class="toolcard theme-${t}" style="--ac:${color}" data-tool="${t}"><span class="toolcard-top">${toolIcon(t,'card-logo')} ${t==='autofly'?'<span class="badge warn">BONUS</span>':''}</span><h3>${x.name}</h3><p>${x.desc}</p><div class="toolcard-art"><img src="assets/media/tool-${t}.webp" loading="lazy" alt="${esc(x.name)} illustration from approved design reference"></div><div class="mini-workflow" aria-label="${esc(x.name)} workflow">${(toolCardSteps[t]||[]).map((step,i)=>`<span class="mini-step"><b>${i+1}</b>${esc(step)}</span>`).join("<i aria-hidden=\"true\">›</i>")}</div><span class="mode-pills"><b>QUALITY</b><b>FAST & COST-EFFECTIVE</b></span><span class="card-status">${tagStatus(t)}</span><span class="card-foot">Open workspace <b>→</b></span></button>`}
function home(){return `<section class="home-hero"><div class="hero-copy"><span class="eyebrow">ATHERIOUS LABS PRESENTS</span><h1>One ecosystem.<br><span>Every jersey workflow.</span></h1><p>Reconstruct artwork, edit visual assets, create premium mockups and run the full Artboard workflow in one click.</p><div class="button-row"><button type="button" class="primary-button" data-tool="overview">Open Dashboard</button><button type="button" class="outline-button" data-tool="home">Explore AI Tools</button></div><div class="hero-trust"><span>4 engine-aligned workspaces</span><span>No fabricated output</span><span>Server-side credentials</span></div></div><div class="hero-visual"><img src="assets/ecosystem-hero.svg" alt="Artboard AI, Frame Forge AI, AssetsX AI and Autofly connected inside My Jersey Ecosystem"></div></section><section class="home-section"><div class="sectionheader"><div><span class="eyebrow">AI CREATIVE SUITE</span><h2>Choose your workflow</h2></div><button type="button" class="text-button" data-tool="home">Compare all tools →</button></div><div class="toolcards four">${launchCard('artboard','#26e7be')}${launchCard('frame','#36a8ff')}${launchCard('assets','#ae78ff')}${launchCard('autofly','#ffce6e')}</div></section><section class="workflow-strip"><div><span>01</span><strong>Upload</strong><small>Your real source file</small></div><i></i><div><span>02</span><strong>Choose Mode</strong><small>Quality or fast & cost-effective</small></div><i></i><div><span>03</span><strong>Process</strong><small>Connected engine workflow</small></div><i></i><div><span>04</span><strong>Validate & Export</strong><small>Only real returned outputs</small></div></section>`}
function overview(){const online=Object.values(state.status).filter(x=>x?.state==='online').length;return `<section class="dashboard-head"><div><span class="eyebrow">MAIN DASHBOARD</span><h1>Workspace Overview</h1><p>Live engine state, quick access and actual session activity in one place.</p></div><button id="refreshStatus" class="outline-button">${state.key?'Refresh live status':'Connect & check engines'}</button></section><div class="status-summary"><article><span>ENGINE CONNECTION</span><strong>${state.key?`${online} of 4 reachable`:'Not checked'}</strong><small>${state.key?'Based on live gateway health responses':'Connect the private gateway to verify'}</small></article><article><span>SESSION JOBS</span><strong>${state.jobs.length?state.jobs.length:'No jobs'}</strong><small>Only submissions from this browser session</small></article><article><span>CREDIT BALANCE</span><strong>Not connected</strong><small>Billing source is not configured</small></article><article><span>USERS</span><strong>Not connected</strong><small>Supabase user source is not configured</small></article></div><div class="sectionheader spaced"><h2>AI Tools</h2><span class="badge">Actual engine contracts</span></div><section class="toolcards four compact-cards">${launchCard('artboard','#26e7be')}${launchCard('frame','#36a8ff')}${launchCard('assets','#ae78ff')}${launchCard('autofly','#ffce6e')}</section><div class="dashboard-grid spaced"><section class="panel"><div class="sectionheader"><h2>Engine status</h2><span class="tiny muted">Live checks only</span></div><div class="engine-status-list">${Object.keys(engineMeta).map(t=>`<button type="button" data-tool="${t}">${toolIcon(t,'status-logo')}<span><b>${engineMeta[t].name}</b><small>${engineMeta[t].tag}</small></span>${tagStatus(t)}</button>`).join('')}</div></section><section class="panel"><div class="sectionheader"><h2>Recent session activity</h2><button type="button" class="text-button" data-tool="history">View jobs →</button></div>${state.jobs.length?`<div class="session-list">${state.jobs.slice(-5).reverse().map(j=>`<div><span>${esc(j.engine||'Engine job')}</span><b>${esc(j.status||'Submitted')}</b></div>`).join('')}</div>`:'<div class="honest-empty"><span>◷</span><strong>No jobs in this session</strong><p>Jobs will appear here only after a real engine submission.</p></div>'}</section></div>`}
function toolOverview(){const rows={artboard:['Upload → Source Analysis → AI Artwork → Semantic-Guided Vectorization → AI Review / Targeted Fix → Technical Validation → Export','SVG · EPS · PDF · PNG · ZIP'],frame:['Upload → Select Mockup Template → Generate → Optional Video Template → Export','Mockup file · MP4'],assets:['Upload → Analyze → Select/Edit → Vectorize → Validate → Export','PNG · Transparent PNG · SVG · EPS · PDF · AI handoff · ZIP'],autofly:['Choose Artboard input → One-click orchestration → Artboard production handoff','SVG · EPS · Artboard bundle']};return `<section class="dashboard-head"><div><span class="eyebrow">TOOL OVERVIEW</span><h1>Four focused AI workflows</h1><p>Each workspace follows its backend engine. Autofly is the bonus one-click Artboard workflow.</p></div></section><div class="tool-overview-grid">${Object.keys(engineMeta).map(t=>`<article class="tool-overview-card theme-${t}"><div class="overview-card-head">${toolIcon(t,'overview-logo')}<div><span class="eyebrow">${t==='autofly'?'BONUS TOOL':'AI ENGINE'}</span><h2>${engineMeta[t].name}</h2></div></div><p>${engineMeta[t].desc}</p><div class="workflow-line">${rows[t][0].split(' → ').map((x,i)=>`<span><b>${i+1}</b>${esc(x)}</span>`).join('')}</div><div class="overview-card-foot"><span><small>MODES</small><b>Quality · Fast & Cost-Effective</b></span><span><small>OUTPUTS</small><b>${rows[t][1]}</b></span></div><button type="button" class="outline-button full" data-tool="${t}">Open ${engineMeta[t].name}</button></article>`).join('')}</div>`}
function utilityHead(k,title,desc){return `<section class="dashboard-head utility-head"><div><span class="eyebrow">WORKSPACE</span><h1>${title}</h1><p>${desc}</p></div><img src="assets/my-jersey.svg" alt="" aria-hidden="true"></section>`}
function creditsPage(){return utilityHead('credits','Add Credits','Billing controls will use verified account data only.')+`<section class="panel utility-panel"><div class="honest-empty large"><span>＋</span><strong>Credit system is not connected yet</strong><p>No balance, price, conversion rate or payment status is displayed until the billing backend and Supabase ledger are configured.</p><button type="button" class="primary-button" data-local-action="billing">Configure billing before adding credits</button></div></section>`}
function usersPage(){return utilityHead('users','Users','Manage workspace access from the real Supabase user source.')+`<section class="panel utility-panel"><div class="honest-empty large"><span>♙</span><strong>User directory is not connected yet</strong><p>No sample members are shown. User roles, invitations and seat usage will appear after Supabase Auth and the workspace membership tables are connected.</p><button type="button" class="primary-button" data-local-action="users">Connect Supabase before managing users</button></div></section>`}
function supportPage(){return utilityHead('support','Support Center','Guidance for files, modes, outputs and engine connections.')+`<div class="support-grid"><button type="button" data-tool="home"><span>◫</span><strong>All Tools</strong><small>Compare workflows, modes and outputs</small></button><button type="button" data-tool="get-support"><span>◉</span><strong>Get Support</strong><small>Prepare a support request</small></button><button type="button" data-tool="report"><span>!</span><strong>Report a Problem</strong><small>Capture an issue without fake submission</small></button><button type="button" data-tool="overview"><span>⌁</span><strong>Engine Status</strong><small>Check live gateway connections</small></button><button type="button" data-tool="emergency"><span>△</span><strong>Emergency Tools</strong><small>Explore configured fallback services</small></button></div><section class="panel spaced"><h3>Before contacting support</h3><div class="support-steps"><span><b>1</b>Choose the affected tool</span><span><b>2</b>Keep the real Job ID if one exists</span><span><b>3</b>Describe the expected and actual result</span><span><b>4</b>Do not paste API keys or secrets</span></div></section>`}
function supportForm(kind){const problem=kind==='report';return utilityHead(kind,problem?'Report a Problem':'Get Support',problem?'Document a reproducible issue for the development team.':'Prepare a request for workspace or production help.')+`<section class="panel form-panel"><div class="notice warn">Support submission backend is not connected. Completing this form will not claim that a ticket was sent.</div><label class="field"><span>Affected area</span><select id="supportArea"><option>Artboard AI</option><option>Frame Forge AI</option><option>AssetsX AI</option><option>Autofly</option><option>Dashboard / Account</option></select></label><label class="field"><span>${problem?'Problem summary':'How can we help?'}</span><input id="supportSubject" maxlength="140" placeholder="Short summary"></label><label class="field"><span>Details</span><textarea id="supportDetails" maxlength="3000" placeholder="What happened, what did you expect, and is there a real Job ID?"></textarea></label><button type="button" class="primary-button" data-local-action="support">Save request after support API is connected</button></section>`}
function modes(t){return `<div class="mode-choice"><button data-mode="quality" class="${state.mode[t]==='quality'?'active':''}" aria-pressed="${state.mode[t]==='quality'}"><strong>◇ Quality Mode</strong><small>Premium AI routing, same validation rules</small></button><button data-mode="cost_effective" class="cost ${state.mode[t]==='cost_effective'?'active':''}" aria-pressed="${state.mode[t]==='cost_effective'}"><strong>⚡ Fast & Cost-Effective Mode</strong><small>Value AI routing, validation quality unchanged</small></button></div>`}
function upload(t,opts={}){const f=state.files[t],types=opts.types||'image/png,image/jpeg,image/webp,image/svg+xml,.eps,.pdf,.psd,.ai';const ob=state.objectURLs[t];return `<div class="dropzone" data-droptool="${t}"><span class="upload-icon">⇧</span><strong>${f?'Replace file':'Upload or drag your file'}</strong><small>${esc(opts.help||'Choose an input supported by the selected engine. File is not uploaded until an API action runs.')}</small>${f?`<span class="file-pill">${esc(f.name)} · ${fmtSize(f.size)}</span>`:''}<input aria-label="Upload file for ${esc(t)}" type="file" data-file="${t}" accept="${esc(types)}"></div>${f&&ob?`<div class="mini-note spaced">Local preview from the file you selected; not an AI-generated result.</div>`:''}`}
function imagePreview(t,alt='Selected source preview'){const f=state.files[t],url=state.objectURLs[t];return `<div class="preview-box ${url?'':'empty'}">${url?`<img src="${url}" alt="${esc(alt)}">`:`<div class="preview-empty">${toolIcon(t,'preview-tool-logo')}${f?`<b>${esc(f.name)}</b><p>Preview not available for this file type.</p>`:`<b>No artwork loaded</b>`}<p>Only actual uploaded files or real API results appear here.</p></div>`}</div>`}
function formats(t,all){return `<div class="option-chips">${all.map(s=>`<button type="button" class="chip ${state.formats[t].includes(s)?'active':''}" data-format="${s}" aria-pressed="${state.formats[t].includes(s)}">${s.toUpperCase().replace('_',' ')}</button>`).join('')}</div>`}
function monitor(t){return `<section class="panel pipeline" data-monitor><div class="pipeline-head"><h3>⌁ Processing Terminal</h3><span class="badge ${state.busy?'warn':state.lastError?'error':'muted'}" id="monitorLabel">${state.busy?'Live request running':state.lastError?'Request failed':'No active processing'}</span></div><div class="status-row"><span>Engine:</span><strong>${esc(engineMeta[t]?.name||'—')}</strong><span>· Current stage:</span><strong id="stageValue">${esc(state.stage||'—')}</strong><span id="percentValue">${state.progress!=null?`· ${state.progress}%`:''}</span></div><div class="progress"><div id="progressValue" style="width:${state.progress??0}%"></div></div><pre class="log ${state.logs.length?'':'empty'}" id="terminalText">${state.logs.length?esc(state.logs.join('\n')):'No API job has been submitted in this session.'}</pre>${state.lastError?`<p class="notice warn">${esc(state.lastError)}</p>`:''}</section>`}
function updateMonitor(){const logNode=document.querySelector('#terminalText');if(!logNode)return;logNode.textContent=state.logs.length?state.logs.join('\n'):'No API job has been submitted in this session.';logNode.classList.toggle('empty',!state.logs.length);logNode.scrollTop=logNode.scrollHeight;const st=document.querySelector('#stageValue');if(st)st.textContent=state.stage||'Idle';const pct=document.querySelector('#percentValue');if(pct)pct.textContent=pct.classList.contains('orb-value')?(state.progress==null?(state.busy?'Working':'—'):state.progress+'%'):state.progress==null?'':'· '+state.progress+'%';const p=document.querySelector('#progressValue');if(p){p.style.width=(state.progress??0)+'%';p.parentElement.classList.toggle('indeterminate',state.busy&&state.progress==null)}document.querySelectorAll('.live-stepper').forEach(stepper=>{const labels=[...stepper.querySelectorAll('[data-step-index]')],current=pipelineStepIndex(stepper.dataset.liveSteps,labels);labels.forEach((node,i)=>{node.classList.toggle('complete',i<current);node.classList.toggle('current',i===current&&(state.busy||state.progress===100));const small=node.querySelector('small');if(small)small.textContent=i<current?'Completed':i===current&&state.busy?'Processing':i===current&&state.progress===100?'Completed':'Waiting'})});updateArtboardPreview();updateArtboardDetails();const label=document.querySelector('#monitorLabel');if(label){label.textContent=state.busy?'Live request running':state.lastError?'Request failed':'No active processing';label.className='badge '+(state.busy?'warn':state.lastError?'error':'muted')}}
function actionButton(label,action,t,extra=''){return `<button class="primary-button full" type="button" data-action="${action}" ${connected(t)&&!state.busy?'':'disabled'} ${extra}>${label}</button>`}
function artboardPage(){const t='artboard';let p=state.artboardProject;let outputs=state.artboardResult;return head(t)+`<div class="banner-notice"><span>Artboard AI v0.3.1 · One or two <b>independently visible</b> surfaces · 22 × 31 in output</span>${tagStatus(t)}</div><div class="work-area theme-artboard"><section class="panel"><h3>① Input Artwork</h3><p class="sub">Source image containing the visible jersey body</p>${upload(t,{types:'.png,.jpg,.jpeg,.webp,.pdf',help:'Supported by the connected Artboard engine; source is submitted to your project.'})}<div class="subhead">Visible surfaces to prepare</div><div class="pickrow"><label><input type="checkbox" id="artFront" checked> Front body</label><label><input type="checkbox" id="artBack"> Back body</label></div><p class="notice">Select only surfaces actually visible in the input. The engine will not invent hidden artwork. AI reconstruction remains subject to fidelity review.</p><div class="subhead">Processing mode</div>${modes(t)}</section><section class="panel"><h3>② Source Preview</h3><p class="sub">Original local input, before processing</p>${imagePreview(t)}<div class="metric-row"><div class="metric"><span>Requested size</span><strong>22 × 31 in</strong></div><div class="metric"><span>Project ID</span><strong>${esc(p?.project_id||'Not created')}</strong></div></div><h3>Actual project result</h3>${p?`<div class="table-grid"><div><strong>State</strong><span>${esc(outputs?.state||p.state||'—')}</span></div><div><strong>True vector</strong><span>${outputs?.true_vector_ready===true?'Validated by engine':outputs?.true_vector_ready===false?'Not yet engine-validated':'Awaiting result'}</span></div></div>`:`<p class="muted small">No Artboard job submitted. Validation appears only after API response.</p>`}</section><section class="panel"><h3>③ Production Output</h3><p class="sub">Actual Artboard API formats</p><div class="subhead">Formats</div>${formats(t,['eps','svg','pdf','png','zip'])}<div class="subhead">Production policy</div><div class="notice">The engine performs AI artwork reconstruction, vectorization and validation. Real output is subject to engine QC and may require manual inspection.</div><div class="spaced">${actionButton('Start Artboard Production','startArtboard',t)}</div><div class="subhead">Output files (server response only)</div><div id="artboardOutputs">${renderArtboardOutputs()}</div></section></div>${monitor(t)}`}
function renderArtboardOutputs(){const p=state.artboardResult;if(!p)return '<p class="muted small">No production files returned yet.</p>';const items=[];for(const part of (p.surfaces||[])){for(const [fmt,path] of Object.entries(part.exports||{})){if(typeof path==='string'&&path)items.push({fmt,part:part.name||part.part_id,path});}}
 for(const [fmt,path] of Object.entries(p.exports||{})){if(typeof path==='string'&&path)items.push({fmt,part:'Project',path});}
 if(!items.length)return '<p class="muted small">No export paths supplied in project response.</p>';
 const id=p.project_id;return `<ul class="output-list">${items.map(x=>{let path=x.path.replace(/^projects\/[^/]+\//,'');return `<li><button type="button" class="chip" data-download="artboard|api/artboard/projects/${encodeURIComponent(id)}/artifacts/${path.split('/').map(encodeURIComponent).join('/')}">${esc(x.part)} · ${esc(x.fmt.toUpperCase())} ↓</button></li>`}).join('')}</ul>`}
function templateCards(kind){const t=kind==='mockup'?'selectedMockup':'selectedVideo';return `<div class="template-grid">${state.templates[kind].map(x=>{const id=x.template_id;const chosen=state[t]===id;return `<button type="button" class="template-card ${chosen?'active':''}" data-templatekind="${kind}" data-template="${esc(id)}" aria-pressed="${chosen}"><img src="assets/media/${encodeURIComponent(id)}.webp" loading="lazy" alt="${esc(x.name)} illustrative template artwork, not a generated output"><span class="text"><strong>${esc(x.name)}</strong><small>${esc(x.description)}</small></span></button>`}).join('')}</div>`}
function framePage(){const t='frame',mock=state.frames.mockup,vid=state.frames.video;return head(t)+`<div class="banner-notice"><span>Template IDs match the Frame Forge engine. Images are approved visual references, not generated outputs; generation requires the backend.</span>${tagStatus(t)}</div><div class="work-area col3 theme-frame"><section class="panel"><h3>① Input</h3><p class="sub">Upload the design or product reference</p>${upload(t,{help:'PNG/JPG/WebP, SVG, EPS, PDF, PSD, and supported source images — validated by the engine.'})}<div class="subhead">Optional exact logo</div><label class="field"><span>Logo file</span><input data-file="logo" type="file" accept=".png,.jpg,.jpeg,.webp"></label>${state.files.logo?`<p class="file-pill">${esc(state.files.logo.name)}</p>`:''}<div class="subhead">AI mode</div>${modes(t)}<label class="field"><span>Aspect ratio</span><select id="frameRatio"><option>9:16</option><option>16:9</option><option>1:1</option><option>4:5</option></select></label></section><section class="panel"><h3>② Select Mockup Template</h3><p class="sub">Exactly three mockup templates shipped with the engine</p>${templateCards('mockup')}<div class="subhead">Optional creative direction</div><textarea id="frameNotes" maxlength="1000" placeholder="Optional style notes"></textarea><div class="info-grid"><label class="field"><span>Brand name</span><input id="brandName" maxlength="120" placeholder="Optional brand name"></label><label class="field"><span>Tagline</span><input id="brandTagline" maxlength="180" placeholder="Optional tagline"></label><label class="field"><span>Phone</span><input id="brandPhone" maxlength="40" placeholder="Optional"></label><label class="field"><span>Website</span><input id="brandWebsite" maxlength="180" placeholder="Optional"></label></div>${actionButton('Generate Real Mockup','startFrame',t)}<div class="subhead">Mockup output</div>${state.objectURLs.frame_result?`<div class="preview-box" style="height:190px;margin-bottom:10px"><img src="${state.objectURLs.frame_result}" alt="Real generated mockup from connected Frame Forge API"></div>`:''}${mock?.output_ready?`<button type="button" class="outline-button" data-download="frame|api/frameforge/jobs/${esc(mock.job_id)}/output">Download generated mockup ↓</button>`:`<p class="muted small">No completed mockup available.</p>`}</section><section class="panel"><h3>③ Optional Video Generation</h3><p class="sub">Video requires a completed mockup job</p>${templateCards('video')}<div class="info-grid"><label class="field"><span>Duration (10–30 seconds)</span><input id="videoDuration" type="number" min="10" max="30" value="10"></label><label class="field"><span>Video ratio</span><select id="videoRatio"><option>9:16</option><option>16:9</option><option>1:1</option><option>4:5</option></select></label></div><label class="field"><span>Optional video direction</span><textarea id="videoNotes" maxlength="1000" placeholder="Optional visual direction"></textarea></label><button type="button" class="primary-button full" data-action="startVideo" ${connected(t)&&mock?.output_ready&&!state.busy?'':'disabled'}>Generate Real Video</button><div class="subhead">Video output</div>${state.objectURLs.video_result?`<div class="preview-box" style="height:180px;margin-bottom:10px"><video controls playsinline src="${state.objectURLs.video_result}"></video></div>`:''}${vid?.output_ready?`<button type="button" class="outline-button" data-download="frame|api/frameforge/jobs/${esc(vid.job_id)}/output">Download generated MP4 ↓</button>`:`<p class="muted small">No completed video available.</p>`}<div class="notice spaced">The engine validates provider support for selected duration/ratio. Credits and video availability are verified by the upstream service, not assumed by this UI.</div></section></div>${monitor(t)}`}
function assetsPage(){const t='assets',a=state.assetInfo;const selection=[...state.assetElements];return head(t)+`<div class="banner-notice"><span>AssetsX v0.1.0 supports deterministic edits and vector tracing. Advanced font recognition and generative image editing are not available.</span>${tagStatus(t)}</div><div class="work-area theme-assets"><section class="panel"><h3>① Upload Asset</h3><p class="sub">Select an image or supported vector document</p>${upload(t,{types:'.png,.jpg,.jpeg,.webp,.svg,.eps,.pdf,.ai',help:'PNG, JPG, WebP, SVG, EPS, PDF and PDF-compatible AI. Native proprietary .AI is not supported.'})}<button class="outline-button full spaced" data-action="analyzeAssets" ${connected(t)&&state.files.assets&&!state.busy?'':'disabled'}>Upload & Analyze Asset</button><div class="subhead">Source information</div>${a?`<div class="table-grid"><div><strong>Type</strong><span>${esc(a.asset_type)}</span></div><div><strong>Size</strong><span>${esc(a.width)} × ${esc(a.height)} px</span></div><div><strong>Elements</strong><span>${esc(a.elements?.length||0)} detected candidates</span></div><div><strong>Format</strong><span>${esc(a.format)}</span></div></div>${(a.import_warnings||[]).map(x=>`<div class="notice warn spaced">${esc(x)}</div>`).join('')}`:'<p class="muted small">Analysis appears only after upload to a live AssetsX engine.</p>'}</section><section class="panel"><h3>② Analyze & Edit</h3><p class="sub">Select detected elements or apply a supported edit</p>${imagePreview(t)}<div class="subhead">Selectable elements from analysis</div>${a?.elements?.length?`<div class="checkbox-stack">${a.elements.slice(0,80).map((x,i)=>{const id=String(x.id||'');return `<label><input type="checkbox" data-element="${esc(id)}" ${selection.includes(id)?'checked':''}><span>${esc(x.type||x.kind||x.label||'Element')} · ${esc(id||i+1)}</span></label>`}).join('')}</div>`:`<p class="muted small">No elements from engine analysis yet.</p>`}<div class="subhead">Supported edit operation</div><select id="editAction"><option value="none" ${state.editing==='none'?'selected':''}>No edit</option><option value="recolor" ${state.editing==='recolor'?'selected':''}>Recolor selected elements</option><option value="remove" ${state.editing==='remove'?'selected':''}>Remove selected elements</option><option value="rotate" ${state.editing==='rotate'?'selected':''}>Rotate</option><option value="add_text" ${state.editing==='add_text'?'selected':''}>Add text</option><option value="add_shape" ${state.editing==='add_shape'?'selected':''}>Add rectangle</option><option value="background_remove" ${state.editing==='background_remove'?'selected':''}>Corner-color background removal (raster)</option></select><div id="editParameters">${editFields()}</div><div class="disabled-feature spaced">Not implemented in v0.1: true semantic object removal, font matching/TTF modification, complex automatic pattern tiling, generative AI image edits.</div></section><section class="panel"><h3>③ Vectorize & Export</h3><p class="sub">Actual strategies from the AssetsX engine</p><div class="subhead">Mode selection</div>${modes(t)}<label class="field"><span>Vectorization strategy</span><select id="assetsStrategy"><option value="auto">Auto · asset-based</option><option value="shapes">Clean shapes</option><option value="monochrome">Monochrome line tracing</option><option value="multicolor">Multicolor tracing</option><option value="color_regions">Color regions</option><option value="existing_vector">Existing SVG vector</option></select></label><label class="field"><span>Max trace colors (2–32)</span><input id="assetsColors" type="number" value="12" min="2" max="32"></label><div class="subhead">Output formats</div>${formats(t,['png','transparent_png','svg','eps','pdf','ai_handoff','zip'])}<div class="notice spaced">AI handoff is not a native .ai writer. Final true-vector files require engine validation; the UI does not override QC.</div><div class="spaced">${actionButton('Process Using AssetsX Engine','startAssets',t)}</div><div class="subhead">Returned downloads</div>${assetOutputs()}</section></div>${monitor(t)}`}
function editFields(){const x=state.editing;const field=(id,label,typ='text',value='')=>`<label class="field"><span>${label}</span><input id="${id}" type="${typ}" value="${esc(value)}"></label>`;
 if(x==='recolor')return field('editColor','New hex color','text','#00baff');if(x==='rotate')return field('editDegrees','Rotate degrees','number',0);if(x==='add_text')return field('editText','Text content')+`<div class="info-grid">${field('editX','X','number',10)}${field('editY','Y','number',40)}</div>`+field('editColor','Text hex color','text','#ffffff');if(x==='add_shape')return `<div class="info-grid">${field('editX','X','number',0)}${field('editY','Y','number',0)}${field('editWidth','Width','number',120)}${field('editHeight','Height','number',80)}</div>`+field('editColor','Fill hex color','text','#00baff');if(x==='background_remove')return field('editThreshold','Corner-color threshold (0–200)','number',25);return ''}
function assetOutputs(){const j=state.assetsJob;if(!j||j.state!=='completed')return '<p class="muted small">No completed AssetsX job available.</p>';return `<ul class="output-list">${(j.outputs||[]).map(f=>`<li><button class="chip" data-download="assets|v1/jobs/${encodeURIComponent(j.id)}/download/${encodeURIComponent(f)}">${esc(f)} ↓</button></li>`).join('')}</ul>${j.report?.production_ready===false?`<div class="notice warn spaced">Engine report requires operator review before production use.</div>`:''}`}
function autoflyPage(){const t='autofly',w=state.autoflyWorkflow,job=state.autoflyJob;return head(t)+`<div class="banner-notice"><span>Autofly = <b>one-click Artboard AI workflow</b>. It does not have independent templates or video generation.</span>${tagStatus(t)}</div><div class="work-area col3 theme-autofly"><section class="panel"><h3>① Choose Artboard Input</h3><p class="sub">Autofly supports three real submission workflows</p><div class="tool-choice">${[['combined','Combined Image'],['panels','Front + Back'],['brief','Text Brief']].map(([id,label])=>`<button class="chip ${w===id?'active':''}" data-workflow="${id}">${label}</button>`).join('')}</div>${w==='brief'?`<label class="field"><span>Artwork brief (10–4000 characters)</span><textarea id="autoBrief" maxlength="4000" placeholder="Describe the front and back jersey design"></textarea></label><label class="field"><span>Front notes (optional)</span><input id="autoFrontNotes" maxlength="800"></label><label class="field"><span>Back notes (optional)</span><input id="autoBackNotes" maxlength="800"></label>`:upload(t,{types:'.png,.jpg,.jpeg,.webp,.svg,.pdf,.eps',help:w==='combined'?'Combined file must visibly contain both front and back. Otherwise select separate panels.':'Front body file — a separate back body file is required.'})}${w==='panels'?`<label class="field"><span>Back body image</span><input type="file" data-file="autofly_back" accept=".png,.jpg,.jpeg,.webp,.svg,.pdf,.eps"></label>${state.files.autofly_back?`<p class="file-pill">${esc(state.files.autofly_back.name)}</p>`:''}`:''}<div class="subhead">AI mode</div>${modes(t)}</section><section class="panel"><h3>② One-Click Artboard Workflow</h3><p class="sub">Upload → analyze/identify → reconstruct → vectorize → export</p>${imagePreview(t)}<div class="subhead">Output formats</div>${formats(t,['svg','eps'])}<label class="field"><span>Processing DPI</span><select id="autoDpi"><option value="330">330 DPI</option><option value="600">600 DPI</option></select></label><button type="button" data-action="startAutofly" class="primary-button full" ${connected(t)&&!state.busy?'':'disabled'}>➤ &nbsp; Generate with Autofly — One Click</button><div class="notice warn spaced">Current Autofly backend targets legacy <code>/api/engine</code> Artboard endpoints. The new Artboard v0.3.1 uses <code>/api/artboard</code>. Update/verify backend compatibility before connecting Autofly to v0.3.1.</div></section><section class="panel"><h3>③ Artboard Production Handoff</h3><p class="sub">Outputs come from Artboard through Autofly</p><div class="table-grid"><div><strong>Job ID</strong><span>${esc(job?.job_id||'No submission')}</span></div><div><strong>Job status</strong><span>${esc(job?.status||'Not started')}</span></div><div><strong>Stage</strong><span>${esc(job?.stage||'—')}</span></div><div><strong>Mode</strong><span>${state.mode[t]==='quality'?'Quality':'Fast & Cost-Effective'}</span></div></div><div class="subhead">Real output</div>${job?.downloads?.bundle?`<button class="outline-button" data-download="autofly|api/autofly/jobs/${esc(job.job_id)}/bundle">Download Artboard result ZIP ↓</button>`:'<p class="muted small">Download available after backend finishes successfully.</p>'}<div class="notice spaced">No template picker here. Autofly's role is to orchestrate Artboard, not to duplicate Frame Forge.</div></section></div>${monitor(t)}`}
function historyPage(){return `<section class="ribbon"><div class="ribbon-head"><div class="ribbon-icon">◷</div><div class="ribbon-title"><h1>Session Jobs</h1><p>Only real API jobs submitted during this browser session</p></div></div></section><section class="panel"><h3>Real job activity</h3>${state.jobs.length?state.jobs.map(x=>`<div class="table-grid spaced"><div><strong>Engine</strong><span>${esc(x.engine)}</span></div><div><strong>Job</strong><span>${esc(x.job_id)}</span></div><div><strong>Status</strong><span>${esc(x.status)}</span></div><div><strong>Submitted</strong><span>${esc(x.created_at)}</span></div></div>`).join(''):'<p class="muted">No jobs have been submitted during this session. History is not fabricated or loaded from a nonexistent account API.</p>'}</section>`}
function steps(items,current=0){return `<div class="stepper" style="--steps:${items.length}">${items.map((x,i)=>`<span class="${i===current?'current':''}"><b>${i+1}</b><strong>${esc(x[0])}</strong><small>${esc(x[1])}</small></span>`).join('')}</div>`}
function recentEmpty(label='Recent files'){return `<div class="subhead">${label}</div><div class="honest-placeholder"><strong>No workspace files loaded</strong><small>Real files will appear after Supabase Storage is connected.</small></div>`}
function artboardStageIndex(){
 const step=(state.stage||'').toLowerCase(),pipeline=(state.activePipeline||'').toLowerCase();
 if(/export|format conversion|manifest/.test(step)||pipeline==='export'&&/complete|ready/.test(step))return 5;
 if(/ai vector review|vector review|re.review|targeted fix|targeted correction/.test(step))return 4;
 if(/semantic|guidance|guided vector/.test(step))return 3;
 if(/validat|saving validated/.test(step)||pipeline==='production'&&/complete|ready/.test(step))return 4;
 if(/vector|optimi|compos/.test(step))return 3;
 if(/generat|ai artwork|reconstruct/.test(step)||pipeline==='production')return 2;
 if(/analy|prepar|locat|surface|geometry/.test(step)||pipeline==='prepare')return 1;
 return 0;
}
function pipelineStepIndex(t,labels){if(t==='artboard')return Math.min(labels.length-1,artboardStageIndex());return state.progress===100?labels.length-1:0}
function terminalV4(t,labels,{summary=true}={}){
 const pct=state.progress??0,current=pipelineStepIndex(t,labels);
 const progressText=state.progress==null?(state.busy?'Working':'—'):state.progress+'%';
 return `<section class="panel pipeline ${summary?'':'terminal-dock'}" data-monitor><div class="pipeline-head"><div><h3>▱ &nbsp; Processing Terminal</h3><span class="tiny muted">Real-time progress from the connected engine</span></div><span class="badge ${state.busy?'warn':state.lastError?'error':'muted'}" id="monitorLabel">${state.busy?'Live request running':state.lastError?'Request failed':'No active processing'}</span></div><div class="processing-shell ${summary?'':'without-summary'}"><div><div class="stepper live-stepper" data-live-steps="${esc(t)}" style="--steps:${labels.length}">${labels.map((x,i)=>`<span data-step-index="${i}" class="${i<current?'complete':i===current&&(state.busy||state.progress===100)?'current':''}"><b>${i+1}</b><strong>${esc(x)}</strong><small>${i<current?'Completed':i===current&&state.busy?'Processing':i===current&&state.progress===100?'Completed':'Waiting'}</small></span>`).join('')}</div><pre class="log ${state.logs.length?'':'empty'}" id="terminalText">${state.logs.length?esc(state.logs.join('\n')):'No API job has been submitted in this session.'}</pre></div>${summary?`<div class="processing-summary"><div class="progress-orb"><span id="percentValue" class="orb-value">${progressText}</span></div><p><b>Processing mode:</b> ${state.mode[t]==='quality'?'Quality':'Fast & Cost-Effective'}</p><p><b>Backend:</b> ${connected(t)?'Connected':'Not connected'}</p><p><b>Stage:</b> <span id="stageValue">${esc(state.stage||'Idle')}</span></p><div class="progress ${state.busy&&state.progress==null?'indeterminate':''}"><div id="progressValue" style="width:${pct}%"></div></div></div>`:''}</div>${state.lastError?`<p class="notice warn spaced">${esc(state.lastError)}</p>`:''}</section>`
}

function artboardProgressDock(){
 const pct=state.progress??0,mode=state.mode.artboard==='quality'?'Quality':'Fast & Cost-Effective';
 const progressText=state.progress==null?(state.busy?'Working':'—'):state.progress+'%';
 return `<section class="tool-panel artboard-progress-dock"><div class="progress-orb"><span id="percentValue" class="orb-value">${progressText}</span></div><div class="progress-copy"><span class="eyebrow">LIVE PROGRESS</span><b id="stageValue">${esc(state.stage||'Ready')}</b><small>${esc(mode)} mode</small><div class="progress ${state.busy&&state.progress==null?'indeterminate':''}"><div id="progressValue" style="width:${pct}%"></div></div></div></section>`;
}
function ecosystemCard({name,subtitle,tool='',tone='cyan',locked=false,art=''}){return `<button type="button" class="ecosystem-card tone-${tone}" ${tool?`data-tool="${tool}"`:'disabled'}><span class="ecosystem-card-title"><i>${locked?'▣':'◇'}</i><span><strong>${esc(name)}</strong><small>${esc(subtitle)}</small></span><b>${locked?'Locked':'→'}</b></span><span class="ecosystem-card-art">${art?`<img src="${art}" loading="lazy" alt="">`:`<i>${locked?'▱':'✦'}</i>`}</span></button>`}
function homeV4(){return `<section class="ecosystem-hero"><div class="ecosystem-hero-brand"><img src="assets/my-jersey.svg" alt="My Jersey"><span>My Jersey</span><i>×</i><img src="assets/atherious-labs.svg" alt="Atherious Labs"><span>Atherious Labs</span></div><h1>My Jersey <span>Ecosystem</span></h1><p>A COMPLETE AI ECOSYSTEM FOR JERSEY DESIGN, PRODUCTION &amp; MANAGEMENT</p><div><span>ϟ AI Powered</span><span>▱ All-in-One</span><span>♢ Production Ready</span><span>∞ For Brands &amp; Teams</span></div></section><section class="home-section ecosystem-tools"><div class="sectionheader all-tools-title"><div><h2>▦ &nbsp; All Tools</h2><span>8 Powerful AI Tools for Your Jersey Journey</span></div><span class="badge">8 TOOLS</span></div><div class="ecosystem-board"><div class="ecosystem-card-grid">${ecosystemCard({name:'ReVector AI',subtitle:'MultiCraft Studio',tone:'cyan',locked:true,art:'assets/media/tool-revector.svg'})}${ecosystemCard({name:'Artboard AI',subtitle:'Create Designs, Instantly',tool:'artboard',tone:'green',art:'assets/media/tool-artboard-3d.webp'})}${ecosystemCard({name:'Frame Forge AI',subtitle:'For My Jersey',tool:'frame',tone:'blue',art:'assets/media/tool-frame.webp'})}${ecosystemCard({name:'AssetsX AI',subtitle:'Turn Assets into Possibilities',tool:'assets',tone:'violet',art:'assets/media/tool-assets.webp'})}${ecosystemCard({name:'ArtFlux AI',subtitle:'AI Creative Design Studio',tone:'pink',art:'assets/media/tool-artflux.svg'})}${ecosystemCard({name:'TraceLock AI',subtitle:'Design Protection & Ownership',tone:'cyan',locked:true,art:'assets/media/tool-tracelock.svg'})}${ecosystemCard({name:'BatchPilot AI',subtitle:'AI-Powered Bulk Production',tone:'gold',locked:true,art:'assets/media/tool-batchpilot.svg'})}${ecosystemCard({name:'AI File Creator',subtitle:'Native Illustrator (.ai)',tone:'teal',locked:true,art:'assets/media/tool-filecreator.svg'})}</div><button class="ecosystem-bonus" type="button" data-tool="autofly"><span>🎁 BONUS</span><img src="assets/autofly.svg" alt=""><strong>AutoFly</strong><small>Private Tech</small><i>Open →</i></button></div><div class="ecosystem-flow"><b>Ecosystem Workflow</b><span>Design</span><i>›</i><span>Prepare</span><i>›</i><span>Mockup</span><i>›</i><span>Protect</span><i>›</i><span>Produce</span><i>›</i><span>Manage</span><button type="button" data-tool="artboard">Start Creating →</button></div></section><section class="ecosystem-notice"><b>⚠ Strict Notice:</b> Access is restricted to authorized My Jersey production teams.</section><footer class="ecosystem-footer">© 2026 Atherious Labs · My Jersey Ecosystem</footer>`}
function overviewV4(){return overview()}

function artboardVisualStage(){
 const step=(state.stage||'').toLowerCase();
 if(!state.busy)return 'is-idle';
 if(/analy|prepar|scan|surface|upload/.test(step))return 'is-scanning';
 if(/generat|artwork|ai /.test(step))return 'is-generating';
 if(/vector|reconstruct|optimi|compos|validat|export/.test(step))return 'is-vectorizing';
 return 'is-scanning';
}
function artboardPreview(){
 const processed=state.objectURLs.artboard_live;
 const original=state.objectURLs.artboard;
 const url=processed||original;
 const label=processed?'Real engine preview · '+(state.artboardPreviewPath.endsWith('.svg')?'Vector':'AI artwork'):'Uploaded source preview';
 return '<div id="artboardLive" class="artboard-live-preview '+artboardVisualStage()+'">'+
  '<div id="artboardLiveMedia" class="preview-box">'+
  (url?'<img src="'+url+'" alt="'+esc(label)+'">':
   '<div class="preview-empty"><b>No artwork uploaded</b><p>Upload a reference to begin</p></div>')+
  '<div class="scan-beam" aria-hidden="true"></div></div>'+
  '<div class="preview-caption"><b id="artboardLiveStage">'+esc(state.stage||'Ready for artwork')+'</b>'+
  '<small id="artboardLiveType">'+esc(label)+'</small></div></div>';
}
function updateArtboardPreview(){
 const el=document.querySelector('#artboardLive');
 if(!el)return;
 el.className='artboard-live-preview '+artboardVisualStage();
 const stage=document.querySelector('#artboardLiveStage');
 if(stage)stage.textContent=state.stage||'Ready for artwork';
 const type=document.querySelector('#artboardLiveType');
 if(type)type.textContent=state.objectURLs.artboard_live?'Verified server artifact · '+(state.artboardPreviewPath.endsWith('.svg')?'editable vector':'AI-generated artwork'):'Original source · awaiting engine output';
 const img=document.querySelector('#artboardLiveMedia img');
 const url=state.objectURLs.artboard_live||state.objectURLs.artboard;
 if(img&&url&&img.getAttribute('src')!==url)img.src=url;
}
function artboardTelemetry(){
 const p=state.artboardResult||state.artboardProject||{},surfaces=p.surfaces||[],surface=surfaces[0]||p.surface||{};
 const validation=p.validation||{},partValidation=surface.validation||validation.parts?.[0]||{};
 const physical=partValidation.physical_artboard||validation.artboard||{};
 const analysis=p.artwork_analysis?.result||{},reconstruction=p.ai_reconstruction||state.artboardJob?.result?.ai_reconstruction||{};
 const route=Object.values(reconstruction.by_part||{})[0]||reconstruction;
 const provider=route.provider||{};
 const exports=[];
 for(const item of surfaces){for(const [format,path] of Object.entries(item.exports||{})){if(path)exports.push({format,path,part:item.name||item.type||item.part_id})}}
 for(const [format,path] of Object.entries(p.exports||{})){if(path)exports.push({format,path,part:'Project'})}
 const colors=analysis.dominant_colors||[];
 return {p,surfaces,surface,validation,partValidation,physical,analysis,reconstruction,provider,exports,colors};
}
function telemetryValue(value,fallback='Awaiting engine'){return value===undefined||value===null||value===''?fallback:esc(value)}
function liveProductionDetails(){
 const d=artboardTelemetry(),v=d.validation,pv=d.partValidation,physical=d.physical;
 const visible=d.analysis.visible_parts||[],logos=d.analysis.logos||[],texts=d.analysis.text_regions||[],patterns=d.analysis.patterns||[];
 const analyzed=Boolean(Object.keys(d.analysis).length||d.p.surface_analysis),generated=d.reconstruction.complete===true||Boolean(d.provider.model),vectorized=Boolean(pv.trace_backend||pv.path_count||v.path_count),validated=d.p.true_vector_ready===true||v.status==='PASS',exported=d.exports.length>0;
 const current=artboardStageIndex(),mode=d.reconstruction.processing_mode||state.lastMode||state.mode.artboard;
 if(!state.busy&&!analyzed&&!generated&&!vectorized&&!validated&&!exported){
  return `<div class="production-start"><span class="production-start-icon">✦</span><h4>Ready for production</h4><p>One verified request runs analysis, AI artwork reconstruction, vectorization, validation and export.</p>${actionButton('Start Production →','startArtboard','artboard')}</div>`;
 }
 let title='Preparing production',description=state.stage||'Engine request running',facts=[];
 if(exported&&!state.busy){
  title='Production complete';description=`${d.exports.length} validated file(s) are ready on the Export & Delivery page`;
  facts=[['True vector',d.p.true_vector_ready===true?'PASS':'Review'],['Canvas',physical.width_in&&physical.height_in?`${physical.width_in} × ${physical.height_in} in`:'22 × 31 in'],['Delivery','Open Export & Delivery below']];
 }else if(current===1){
  title='Analyzing artwork';description='Reading only the selected visible surface and its production composition';
  facts=[['Visible surfaces',analyzed?visible.length:'Scanning'],['Logos',analyzed?logos.length:'Scanning'],['Text regions',analyzed?texts.length:'Scanning'],['Patterns',analyzed?patterns.length:'Scanning'],['Palette',d.colors.length?d.colors.slice(0,4).join(', '):'Detecting'],['Surface',d.surface.name||d.surface.type||'Locating']];
 }else if(current===2){
  title='Creating AI artwork';description='Building full-bleed, flat production artwork from the analyzed design language';
  facts=[['Provider',d.provider.provider||'Routing'],['Model',d.provider.model||'Selecting model'],['Mode',mode],['Canvas fit',d.reconstruction.canvas?.fit||'22:31 full canvas'],['Vector source',generated?'AI artwork locked':'Generating']];
 }else if(current===3){
  title='Vectorizing artwork';description='Tracing the generated AI artwork into editor-friendly production paths';
  facts=[['Vectorizer',pv.trace_backend||'Processing'],['Paths',pv.path_count??v.path_count??'Counting'],['Rasters',pv.embedded_rasters??v.embedded_rasters??'Checking'],['Editability',pv.editability_status||'Optimizing'],['Source',generated?'AI-generated artwork':'Waiting']];
 }else if(current===4){
  title='Validating production file';description='Checking vector integrity, editability, dimensions, rendering and fidelity';
  facts=[['Valid SVG',pv.valid_svg===true?'PASS':'Checking'],['True vector',pv.true_vector===true?'PASS':'Checking'],['Embedded rasters',pv.embedded_rasters??'Checking'],['Illustrator',pv.illustrator_compatibility||'Checking'],['Physical size',pv.physical_artboard?.status||'Checking'],['Fidelity',pv.production_fidelity?.status||'Checking']];
 }else if(current===5){
  title='Preparing exports';description='Converting only validated vectors into the requested delivery formats';
  facts=[['Requested',state.formats.artboard.map(x=>x.toUpperCase()).join(', ')],['Ready files',d.exports.length],['EPS contract',d.exports.some(x=>x.format==='eps')?'EPSF 3.0 · PS Level ≤ 2 · CMYK':'Processing'],['Bundle',state.formats.artboard.includes('zip')?'Production pack':'Selected files']];
 }else{
  title='Uploading artwork';description='Securing the client source before analysis begins';facts=[['Source',state.files.artboard?.name||'Selected artwork'],['Mode',mode],['Canvas','22 × 31 in']];
 }
 const latest=state.artboardEvents.at(-1);
 return `<div class="active-production-card"><div class="live-dialog-head"><span class="live-dot ${state.busy?'on':''}"></span><div><b>${esc(title)}</b><small>${esc(description)}</small></div></div><div class="production-facts stage-facts">${facts.map(([label,value])=>`<span><small>${esc(label)}</small><b>${telemetryValue(value,'Working')}</b></span>`).join('')}</div>${latest?`<div class="current-engine-event"><time>${esc((latest.at||'').slice(11,19)||'live')}</time><span>${esc(latest.step||state.stage||'Engine update')}${typeof latest.progress==='number'?` · ${latest.progress}%`:''}</span></div>`:''}${current===4?validationChecklist():''}</div>`;
}
function validationChecklist(){
 const d=artboardTelemetry(),v=d.partValidation;
 const checks=[['Valid SVG',v.valid_svg],['True vector',v.true_vector],['No raster',v.embedded_rasters===0?true:v.embedded_rasters===undefined?null:false],['Renderable',v.render_succeeded],['Editability',v.editability_status==='PASS'?true:v.editability_status?false:null],['Illustrator',v.illustrator_compatibility?.startsWith('PASS')?true:v.illustrator_compatibility?false:null],['Physical size',v.physical_artboard?.status==='PASS'?true:v.physical_artboard?false:null],['Fidelity',v.production_fidelity?.status==='PASS'?true:v.production_fidelity?.status?false:null]];
 return `<div class="validation-checks">${checks.map(([label,status])=>`<span class="${status===true?'pass':status===false?'fail':''}"><i>${status===true?'✓':status===false?'!':'·'}</i>${esc(label)}</span>`).join('')}</div>`;
}
function artboardExportPanel(){
 const d=artboardTelemetry(),failed=state.failedStage==='export'&&state.failedFormats.length;
 const exportStage=artboardStageIndex()===5||d.exports.length||failed;
 if(!exportStage)return '';
 const hasEps=d.exports.some(x=>x.format==='eps');
 return `<section class="tool-panel artboard-export-page"><div class="export-page-head"><div><span class="eyebrow">FINAL DELIVERY</span><h3>Export & Delivery</h3><p>Only validated files returned by the engine appear here.</p></div><span class="export-ready-badge">${d.exports.length?`${d.exports.length} FILE${d.exports.length===1?'':'S'} READY`:'EXPORTING'}</span></div><div class="export-page-grid"><div><div class="subhead">Production validation</div>${validationChecklist()}<div class="export-contracts"><span><small>Canvas</small><b>${d.physical.width_in&&d.physical.height_in?`${esc(d.physical.width_in)} × ${esc(d.physical.height_in)} in`:'22 × 31 in'}</b></span><span><small>EPS</small><b>${hasEps?'EPSF 3.0 · Level ≤ 2 · CMYK':'Not returned'}</b></span><span><small>Raster layers</small><b>${telemetryValue(d.partValidation.embedded_rasters??d.validation.embedded_rasters)}</b></span></div></div><div><div class="subhead">Download files</div><div id="artboardOutputs">${renderArtboardOutputs()}</div><button type="button" class="illustrator-button" data-action="continueIllustrator" ${d.exports.some(x=>x.format==='svg')&&!state.busy?'':'disabled'}>Continue with Illustrator ↗</button>${failed?`<p class="notice warn">Failed formats: ${esc(state.failedFormats.join(', '))}</p>`:''}<div class="recovery-actions"><button type="button" class="outline-button" data-action="diagnoseArtboard" ${!state.lastError&&!failed?'disabled':''}>Diagnose Error</button><button type="button" class="outline-button" data-action="retryArtboardExport" ${failed&&!state.busy?'':'disabled'}>Retry Failed Export Only</button><button type="button" class="outline-button" data-action="retryArtboardProduction" ${state.failedStage==='production'&&state.artboardResult?.ai_reconstruction?.complete&&!state.busy?'':'disabled'}>Resume Vector Stage · No AI Calls</button></div>${state.diagnosis?`<p class="mini-note">${esc(state.diagnosis)}</p>`:''}</div></div></section>`;
}
function updateArtboardDetails(){const dialog=document.querySelector('#productionLiveDialog');if(dialog)dialog.innerHTML=liveProductionDetails();const exportPanel=document.querySelector('#artboardExportPanel');if(exportPanel)exportPanel.innerHTML=artboardExportPanel()}
function artboardPageV4(){
 const t='artboard',o=state.artboardResult;
 return '<section class="artboard-console theme-artboard">'+
  '<div class="artboard-console-top"><div class="console-heading"><strong>Artboard AI</strong>'+
  '<small>Live production workspace · 22 × 31 in · '+esc(healthText(t))+'</small></div>'+
  modes(t)+'</div>'+
  '<div class="artboard-workbench">'+
   '<div class="artboard-left-rail"><section class="tool-panel compact-input"><div class="tool-panel-title"><span>1</span>'+
   '<div><h3>Input & Settings</h3><small>Client artwork and production controls</small></div></div>'+
   upload(t,{types:'.png,.jpg,.jpeg,.webp,.pdf',help:'PNG · JPG · WEBP · PDF · up to 50MB'})+
   '<div class="subhead">Visible surfaces</div><div class="pickrow"><label><input type="checkbox" id="artFront" checked> Front</label>'+
   '<label><input type="checkbox" id="artBack"> Back</label></div>'+
   '<div class="subhead">Requested export formats</div>'+formats(t,['svg','eps','pdf','png','zip'])+
   '<p class="mini-note">AI output is the vectorization source. No original-image identity gate.</p>'+
   '<p class="mini-note">Active route: '+esc(state.lastMode||state.mode.artboard)+'</p></section>'+artboardProgressDock()+'</div>'+
   '<div class="artboard-center-stage"><section class="tool-panel compact-preview"><div class="tool-panel-title"><span>2</span>'+
   '<div><h3>Live Artwork Preview</h3><small>Scanner → AI artwork → vector</small></div></div>'+
   artboardPreview()+
   '<div class="metric-row"><div class="metric"><span>Canvas</span><strong>22 × 31 in</strong></div>'+
   '<div class="metric"><span>Vector</span><strong>'+(o?.true_vector_ready===true?'Validated':'Pending')+'</strong></div>'+
   '<div class="metric"><span>Job</span><strong>'+esc(state.lastJobId.slice(0,8)||'—')+'</strong></div></div></section>'+terminalV4(t,['Upload','Analyze','AI Artwork','Vectorize','Validate','Export'],{summary:false})+'</div>'+
   '<section class="tool-panel compact-output"><div class="tool-panel-title"><span>3</span>'+
   '<div><h3>Live Production Details</h3><small>Current stage intelligence only</small></div></div>'+
   '<div id="productionLiveDialog" class="production-live-dialog">'+liveProductionDetails()+'</div>'+
   '</section></div><div id="artboardExportPanel">'+artboardExportPanel()+'</div>'+
 '</section>';
}
function framePageV4(){const t='frame',mock=state.frames.mockup,vid=state.frames.video;return head(t)+steps([['Input','Upload or select design'],['Select Template','Choose mockup template'],['Analyze','AI-powered design check'],['Ready Mockup','Generate quality mockup'],['Video Template','Select video style'],['Video Generation','Create & download']],0)+`<div class="workspace-grid frame-layout theme-frame"><section class="tool-panel"><div class="tool-panel-title"><span>1</span><div><h3>Input</h3><small>Upload your jersey design</small></div></div>${upload(t,{help:'PNG · JPG · WEBP · SVG · EPS · PDF · PSD'})}<div class="subhead">Optional exact logo</div><input data-file="logo" type="file" accept=".png,.jpg,.jpeg,.webp">${state.files.logo?`<p class="file-pill">${esc(state.files.logo.name)}</p>`:''}${recentEmpty()}</section><section class="tool-panel"><div class="tool-panel-title"><span>2</span><div><h3>Select Template</h3><small>Three templates shipped by Frame Forge</small></div></div>${templateCards('mockup')}<label class="field"><span>Creative direction</span><textarea id="frameNotes" maxlength="1000" placeholder="Optional style notes"></textarea></label><div class="info-grid"><input id="brandName" maxlength="120" placeholder="Brand name"><input id="brandTagline" maxlength="180" placeholder="Tagline"><input id="brandPhone" maxlength="40" placeholder="Phone"><input id="brandWebsite" maxlength="180" placeholder="Website"></div></section><section class="tool-panel"><div class="tool-panel-title"><span>3</span><div><h3>Preview</h3><small>Uploaded source or real generated mockup</small></div></div><div class="preview-box tool-preview">${state.objectURLs.frame_result?`<img src="${state.objectURLs.frame_result}" alt="Generated Frame Forge mockup">`:imagePreview(t).replace(/^<div class="preview-box[^>]*>|<\/div>$/g,'')}</div><div class="info-grid"><label class="field"><span>Quality</span><select><option>${state.mode[t]==='quality'?'Quality-Full':'Cost-Effective'}</option></select></label><label class="field"><span>Ratio</span><select id="frameRatio"><option>9:16</option><option>16:9</option><option>1:1</option><option>4:5</option></select></label></div>${actionButton('Generate Mockup →','startFrame',t)}${mock?.output_ready?`<button type="button" class="outline-button full spaced" data-download="frame|api/frameforge/jobs/${esc(mock.job_id)}/output">Download Mockup</button>`:''}</section><section class="tool-panel accent-violet"><div class="tool-panel-title"><span>4</span><div><h3>Video Generation</h3><small>Create video from completed mockup</small></div></div>${templateCards('video')}<div class="info-grid"><label class="field"><span>Duration</span><input id="videoDuration" type="number" min="10" max="30" value="10"></label><label class="field"><span>Ratio</span><select id="videoRatio"><option>9:16</option><option>16:9</option><option>1:1</option><option>4:5</option></select></label></div><textarea id="videoNotes" maxlength="1000" placeholder="Optional video direction"></textarea><button type="button" class="primary-button full spaced" data-action="startVideo" ${connected(t)&&mock?.output_ready&&!state.busy?'':'disabled'}>Generate Video →</button>${vid?.output_ready?`<button class="outline-button full spaced" data-download="frame|api/frameforge/jobs/${esc(vid.job_id)}/output">Download MP4</button>`:''}</section></div>${terminalV4(t,['Upload & Validate','Analyze Design','Select Template','Generate Mockup','Create Video','Complete'])}`}
function assetsPageV4(){const t='assets',a=state.assetInfo,selection=[...state.assetElements];return head(t)+steps([['Upload','Add your asset'],['Analyze','Detect elements'],['Edit','Optional changes'],['Vectorize','Core engine'],['Export','Download']],0)+`<div class="workspace-grid assets-layout theme-assets"><section class="tool-panel"><div class="tool-panel-title"><span>1</span><div><h3>Upload Asset</h3><small>Any supported visual asset</small></div></div>${upload(t,{types:'.png,.jpg,.jpeg,.webp,.svg,.eps,.pdf,.ai',help:'PNG · JPG · JPEG · WEBP · SVG · AI · EPS · PDF'})}<button class="outline-button full spaced" data-action="analyzeAssets" ${connected(t)&&state.files.assets&&!state.busy?'':'disabled'}>Upload & Analyze</button>${recentEmpty('Workspace assets')}</section><section class="tool-panel"><div class="tool-panel-title"><span>2</span><div><h3>Asset Editor</h3><small>Engine-detected elements and supported edits</small></div></div><div class="asset-editor"><div class="editor-tools"><button>↖</button><button>✎</button><button>◫</button><button>⌁</button><button>T</button></div>${imagePreview(t)}<div class="editor-thumbs"><button>${toolIcon(t,'status-logo')}</button><button>TEXT</button><button>PATH</button><button>COLOR</button></div></div><div class="subhead">Detected elements</div>${a?.elements?.length?`<div class="checkbox-stack">${a.elements.slice(0,60).map((x,i)=>{const id=String(x.id||'');return `<label><input type="checkbox" data-element="${esc(id)}" ${selection.includes(id)?'checked':''}> ${esc(x.type||x.kind||x.label||'Element')} · ${esc(id||i+1)}</label>`}).join('')}</div>`:'<div class="honest-placeholder"><strong>No engine analysis yet</strong><small>Upload and analyze a real file to populate elements.</small></div>'}<label class="field"><span>Edit operation</span><select id="editAction"><option value="none">No edit</option><option value="recolor">Recolor selected</option><option value="remove">Remove selected</option><option value="rotate">Rotate</option><option value="add_text">Add text</option><option value="add_shape">Add rectangle</option><option value="background_remove">Background remove</option></select></label><div id="editParameters">${editFields()}</div></section><section><div class="tool-panel"><div class="tool-panel-title"><span>3</span><div><h3>Processing Options</h3><small>Actual AssetsX job configuration</small></div></div><div class="subhead">Mode Selection</div>${modes(t)}<label class="field"><span>Vectorization strategy</span><select id="assetsStrategy"><option value="auto">Auto · asset-based</option><option value="shapes">Clean shapes</option><option value="monochrome">Monochrome</option><option value="multicolor">Multicolor</option><option value="color_regions">Color regions</option><option value="existing_vector">Existing SVG</option></select></label><label class="field"><span>Max colors</span><input id="assetsColors" type="number" value="12" min="2" max="32"></label><div class="subhead">Output format</div>${formats(t,['png','transparent_png','svg','eps','pdf','ai_handoff','zip'])}<div class="spaced">${actionButton('⚡ Start Processing →','startAssets',t)}</div></div><div class="tool-panel spaced quick-info"><h3>Quick Info</h3><p><b>Tool:</b> AssetsX AI</p><p><b>Category:</b> Asset processing</p><p><b>Storage:</b> Direct download only</p><p><b>Status:</b> ${esc(healthText(t))}</p><div class="notice">No source or output is shown unless returned by the real engine.</div></div></section></div>${terminalV4(t,['Upload & Validate','Analyze Asset','Edit','Vectorize','Prepare Export'])}`}
function autoflyPageV4(){const t='autofly',w=state.autoflyWorkflow,job=state.autoflyJob;return head(t)+`<div class="mode-choice spaced">${modes(t).replace('<div class="mode-choice">','').replace('</div>','')}</div><div class="workspace-grid autofly-layout theme-autofly"><section class="tool-panel"><div class="tool-panel-title"><span>1</span><div><h3>Input</h3><small>Choose the real Artboard source workflow</small></div></div><div class="tool-choice">${[['combined','Combined'],['panels','Front + Back'],['brief','Text Brief']].map(([id,label])=>`<button class="${w===id?'active':''}" data-workflow="${id}">${label}</button>`).join('')}</div>${w==='brief'?`<label class="field"><span>Artwork brief</span><textarea id="autoBrief" maxlength="4000" placeholder="Describe the front and back jersey design"></textarea></label><input id="autoFrontNotes" maxlength="800" placeholder="Front notes"><input id="autoBackNotes" maxlength="800" placeholder="Back notes">`:upload(t,{types:'.png,.jpg,.jpeg,.webp,.svg,.pdf,.eps',help:w==='combined'?'One image with visible front and back':'Upload the front file first'})}${w==='panels'?`<label class="field"><span>Back body file</span><input type="file" data-file="autofly_back" accept=".png,.jpg,.jpeg,.webp,.svg,.pdf,.eps"></label>`:''}${recentEmpty()}</section><section class="tool-panel"><div class="tool-panel-title"><span>2</span><div><h3>One-Click Artboard Setup</h3><small>No mockup or video templates</small></div></div><div class="honest-placeholder"><strong>Artboard orchestration</strong><small>Analyze → reconstruct → vectorize → validate → export</small></div><label class="field"><span>Processing DPI</span><select id="autoDpi"><option value="330">330 DPI</option><option value="600">600 DPI</option></select></label><div class="subhead">Output formats</div>${formats(t,['svg','eps'])}<div class="notice">Autofly follows the Artboard engine workflow in one submission.</div></section><section class="tool-panel"><div class="tool-panel-title"><span>3</span><div><h3>Preview & Generate</h3><small>Only actual selected input is shown</small></div></div>${imagePreview(t)}<button type="button" data-action="startAutofly" class="primary-button full spaced" ${connected(t)&&!state.busy?'':'disabled'}>Generate One-Click →</button>${job?.downloads?.bundle?`<button class="outline-button full spaced" data-download="autofly|api/autofly/jobs/${esc(job.job_id)}/bundle">Download Artboard Result</button>`:''}</section><section class="tool-panel accent-gold quick-info"><h3>✧ Tool Information</h3>${toolIcon(t,'overview-logo')}<h2>Autofly</h2><p>Automates the Artboard production workflow from one validated input.</p><p>● One-shot orchestration</p><p>● Quality / cost mode</p><p>● Artboard output review</p><div class="notice warn">Backend compatibility with Artboard v0.3.1 must be verified before launch.</div></section></div>${terminalV4(t,['Upload','Analyze','Reconstruct','Vectorize','Export'])}`}
function emergencyPage(){return utilityHead('emergency','Emergency Tools','Fallback services are shown only after a verified engine contract is configured.')+`<div class="emergency-grid"><article class="emergency-card"><h3>Fallback Vectorization</h3><p>No fallback vector engine is configured.</p><span class="badge error">NOT CONNECTED</span></article><article class="emergency-card"><h3>Asset Recovery</h3><p>No recovery engine is configured.</p><span class="badge error">NOT CONNECTED</span></article></div>`}
function settingsPage(){return utilityHead('settings','Settings','Public testing: browser access requires no login; private engine tokens remain server-side.')+`<div class="settings-grid"><section class="panel"><h3>Public Testing</h3><p class="muted small">This browser gets its own signed session and the Cloudflare Worker limits paid requests.</p><button class="outline-button" id="refreshStatus">Refresh live engine status</button></section><section class="panel"><h3>Data Connections</h3><div class="table-grid"><div><strong>Supabase</strong><span>Not configured in this frontend</span></div><div><strong>Billing</strong><span>Not configured</span></div><div><strong>Support API</strong><span>Not configured</span></div></div></section></div>`}
function preserveForm(){document.querySelectorAll('#mainContent input:not([type=file]),#mainContent textarea,#mainContent select').forEach(el=>{if(el.id)state.formValues[el.id]=el.type==='checkbox'?el.checked:el.value;})}
function restoreForm(){document.querySelectorAll('#mainContent input:not([type=file]),#mainContent textarea,#mainContent select').forEach(el=>{if(!el.id||!(el.id in state.formValues))return;if(el.type==='checkbox')el.checked=Boolean(state.formValues[el.id]);else el.value=state.formValues[el.id];})}
function render(){preserveForm();const pages={home:homeV4,overview:overviewV4,artboard:artboardPageV4,frame:framePageV4,assets:assetsPageV4,autofly:autoflyPageV4,emergency:emergencyPage,credits:creditsPage,users:usersPage,history:historyPage,support:supportPage,'get-support':()=>supportForm('get-support'),report:()=>supportForm('report'),settings:settingsPage};const e=document.querySelector('#mainContent');e.innerHTML=(pages[state.tool]||homeV4)();document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('selected',b.dataset.tool===state.tool));const indicators=document.querySelector('#serviceIndicators');const statuses=Object.entries(state.status);const n=statuses.filter(([k,v])=>v.state==='online').length;const checked=Boolean(statuses.length);const aiReady=state.status.artboard?.ai_configured;const aiLabel=!checked?'Not checked':aiReady===true?'Configured':aiReady===false?'Not configured':'Unknown';indicators.innerHTML=`<span class="service-cell"><i>◆</i><small>Engines</small><b>${checked?`${n}/4 reachable`:'Not connected'}</b></span><span class="service-cell"><i>⬡</i><small>AI Config</small><b title="AI credentials available to the connected engines.">${aiLabel}</b></span>`;restoreForm();updateMonitor()}
async function loadArtboardPreview(projectId, path) {
 if(!projectId || !path || !path.startsWith('projects/'+projectId+'/'))return;
 if(state.artboardPreviewPath===path)return;
 state.artboardPreviewPath=path;
 const relative=path.slice(('projects/'+projectId+'/').length);
 try {
  const file=await call('artboard','api/artboard/projects/'+encodeURIComponent(projectId)+'/artifacts/'+relative.split('/').map(encodeURIComponent).join('/'),{response:'blob'});
  const url=URL.createObjectURL(file);
  if(state.objectURLs.artboard_live)URL.revokeObjectURL(state.objectURLs.artboard_live);
  state.objectURLs.artboard_live=url;
  updateArtboardPreview();
 } catch(e){log('Intermediate preview unavailable: '+e.message)}
}
function transientJobStatusError(error){
 const code=Number(error?.httpStatus);
 return [408,429,500,502,503,504,520,521,522,523,524].includes(code)
   || (!code && /network|failed to fetch|load failed|timed out|connection|fetch failed/i.test(String(error?.message||'')));
}
async function jobPoll(engine,path,terminal,limitMs=600000){
 const started=Date.now(),production=(engine==='artboard'&&terminal==='Production');
 // Poll the existing two-sided Quality job for the server's full time budget.
 // Polling must never issue another paid production request.
 const maximumMs=production&&limitMs===600000?35*60*1000:limitMs;
 let lastEvent='',consecutivePollErrors=0,disconnectedAt=null;
 state.activePipeline=terminal;
 while(Date.now()-started<maximumMs){
  let j;
  try{
   j=await call(engine,path,{timeoutMs:30000});
   if(disconnectedAt!==null)log(terminal+': existing job reconnected; no new generation submitted');
   consecutivePollErrors=0;disconnectedAt=null;
  }catch(e){
   // 404/410 for a lost saved checkpoint is not a transient network 503.
   // Preserve project, job ID and last confirmed artwork; never submit new AI.
   const checkpointLost=engine==='artboard' &&
     (Number(e?.httpStatus)===410 ||
      (Number(e?.httpStatus)===404 &&
       /requested artifact does not exist|job_checkpoint_missing|project_checkpoint_missing/i.test(String(e.message||''))));
   if(checkpointLost){
    state.stage='Saved job/project checkpoint unavailable';
    const old=state.artboardJob||state.pendingArtboardJob;
    if(old?.job_id){
     const unavailable={...old,status:'checkpoint_missing'};
     state.artboardJob=unavailable;
     state.pendingArtboardJob=unavailable;
    }
    log(terminal+': server checkpoint missing; verify persistent storage and restarts');
    updateMonitor();
    let savedArtwork='unverified';
    const projectId=state.artboardProject?.project_id||state.artboardResult?.project_id;
    if(projectId){
     try{
      const project=await call('artboard','api/artboard/projects/'+encodeURIComponent(projectId),{timeoutMs:15000});
      if(project.project_id===projectId){
       state.artboardResult=project;
       savedArtwork=project.ai_reconstruction?.complete===true?'present':'not_confirmed';
      }
     }catch(checkError){
      log(terminal+': project cannot be verified: '+checkError.message);
     }
    }
    const detail=terminal==='Prepare'
     ?'Analysis job checkpoint disappeared before artwork generation was confirmed.'
     :savedArtwork==='present'
      ?'Saved AI artwork metadata is readable, but the job record is missing. Verify source files before resuming.'
      :'Saved AI artwork could not be verified on this server.';
    throw Error('Artboard storage checkpoint missing (HTTP '+e.httpStatus+'). '+detail+
     ' Verify the persistent volume, instance routing and restart logs before any paid retry.');
   }
   if(!transientJobStatusError(e))throw e;
   consecutivePollErrors++;
   if(disconnectedAt===null)disconnectedAt=Date.now();
   // 503 means polling failed, NOT that the remote job failed. Keep the
   // last verified progress, project, session and job identifier.
   state.stage=engine==='artboard'
    ?'Reconnecting to live job status'+(e.httpStatus?' (HTTP '+e.httpStatus+')':' (network)')
    :'Reconnecting to live job status';
   if(consecutivePollErrors===1||consecutivePollErrors%5===0){
    log(terminal+': temporary status outage '+(e.httpStatus?'HTTP '+e.httpStatus:'network')+
      '; reconnect attempt '+consecutivePollErrors+' (job retained)');
   }
   updateMonitor();
   if(Date.now()-disconnectedAt>=180000){
    throw Error(terminal+' status unavailable for 3 minutes; job may still be running. '+
      'Use Check Status / Resume Production for the saved job. Do not start a duplicate production.');
   }
   const waitMs=Math.min(12000,1500*Math.pow(2,Math.min(consecutivePollErrors-1,3)));
   await new Promise(resolve=>setTimeout(resolve,waitMs));
   continue;
  }
  state.lastJobId=j.job_id||'';
  state.stage=j.step||j.stage||j.status||'processing';
  state.progress=typeof j.progress==='number'?Math.max(0,Math.min(100,j.progress)):null;
  if(engine==='artboard'){
   state.artboardJob=j;
   if(state.pendingArtboardJob?.job_id===j.job_id)state.pendingArtboardJob=j;
   for(const event of (j.events||[])){
    const key=[j.job_id,event.at,event.step,event.progress].join('|');
    if(state.artboardEventKeys.has(key))continue;
    state.artboardEventKeys.add(key);state.artboardEvents.push(event);
    if(state.artboardEvents.length>30)state.artboardEvents.shift();
    log('ENGINE: '+(event.step||j.stage)+(typeof event.progress==='number'?' · '+event.progress+'%':''));
   }
  }
  const event=(j.events||[]).at(-1);
  const signature=event?.at||state.stage;
  if(signature!==lastEvent){log(terminal+': '+state.stage+(state.progress!=null?' · '+state.progress+'%':''));lastEvent=signature}
  updateMonitor();
  if(engine==='artboard'&&j.preview_path)await loadArtboardPreview(j.project_id,j.preview_path);
  const status=j.status||j.state;
  if(status==='completed'||status==='ready'||status==='review_required'||status==='awaiting_desktop'){
   state.progress=100;state.stage=j.step||terminal+' complete';updateMonitor();
   if(j.result?.export_errors&&Object.keys(j.result.export_errors).length){
    state.failedFormats=[...new Set(Object.values(j.result.export_errors).map(e=>e.format).filter(Boolean))];
    state.failedStage='export';state.lastExportErrors=j.result.export_errors;
    log('Partial export: '+state.failedFormats.join(', ')+' failed; successful files preserved');
   }else if(terminal==='Export'){state.failedFormats=[];state.failedStage='';state.lastExportErrors=null}
   return j;
  }
  if(status==='failed'||status==='cancelled'){
   state.failedStage=terminal.toLowerCase();
   state.lastExportErrors=j.result?.export_errors||null;
   state.failedFormats=[...new Set(Object.values(state.lastExportErrors||{}).map(e=>e.format).filter(Boolean))];
   const details=Object.values(state.lastExportErrors||{}).map(e=>e.format.toUpperCase()+': '+e.message).join(' | ');
   throw Error(details||j.error?.message||j.error?.technical_summary||terminal+' failed');
  }
  await new Promise(resolve=>setTimeout(resolve,2200));
 }
 throw Error(terminal+' monitoring reached its time limit. The saved job may still be running; Check Status / Resume Production before any new paid request.');
}
function captureJob(engine,obj){
 if(!obj?.job_id)return;
 state.jobs.unshift({engine,job_id:obj.job_id,status:obj.status||obj.state||'queued',created_at:obj.created_at||new Date().toISOString()});
 if(engine.toLowerCase().includes('artboard')&&obj.project_id){
  state.artboardJob=obj;state.pendingArtboardJob=null;
  try{sessionStorage.setItem('mj_artboard_job',JSON.stringify({
   project_id:obj.project_id,job_id:obj.job_id,stage:obj.stage,mode:state.lastMode||state.mode.artboard
  }))}catch(e){log('Could not persist current job reference: '+e.message)}
 }
}
async function run(name,fn){
 if(state.busy)return;
 state.busy=true;state.lastError='';state.lastTask=name;state.stage='Submitting';state.progress=null;
 log('REQUEST: '+name);render();
 try{await fn();log(name+' finished with verified backend response');notify('Review the actual engine output and production warnings')}
 catch(e){
  state.lastError=e.message;log('ERROR: '+e.message);notify(e.message);
  if(state.tool==='artboard'&&state.artboardProject?.project_id){
   try{state.artboardResult=await call('artboard','api/artboard/projects/'+state.artboardProject.project_id)}
   catch(inner){log('Could not load saved project: '+inner.message)}
  }
 }finally{state.busy=false;render()}
}
async function startArtboard(){
 const f=state.files.artboard;if(!f)throw Error('Select a visible jersey reference first');
 const surfaces=[];if(document.querySelector('#artFront')?.checked)surfaces.push('front_body');if(document.querySelector('#artBack')?.checked)surfaces.push('back_body');
 if(!surfaces.length)throw Error('Select at least one visible surface');const formats=[...state.formats.artboard];if(!formats.length)throw Error('Choose an output format');
 await run('Artboard AI production',async()=>{
  state.failedStage='';state.failedFormats=[];state.lastExportErrors=null;state.lastMode=state.mode.artboard;state.artboardEvents=[];state.artboardEventKeys.clear();state.artboardJob=null;state.activePipeline='Upload';
  state.stage='Creating project';state.progress=0;log('Requested mode: '+state.lastMode);updateMonitor();
  const p=await call('artboard','api/artboard/projects',{method:'POST',json:{name:f.name.slice(0,120),processing_mode:state.lastMode}});state.artboardProject=p;state.artboardResult=p;log('Created project '+p.project_id);
  const fd=new FormData();fd.append('project_id',p.project_id);fd.append('file',f);state.stage='Uploading source';state.progress=1;updateMonitor();
  state.artboardResult=await call('artboard','api/artboard/upload',{method:'POST',body:fd});state.stage='Upload completed';state.progress=100;log('Uploaded original source');updateMonitor();
  state.activePipeline='Prepare';state.stage='Analyzing uploaded artwork';state.progress=0;render();
  let j=await call('artboard','api/artboard/prepare',{method:'POST',json:{project_id:p.project_id,surfaces,auto:true,width_in:22,height_in:31}});captureJob('Artboard',j);await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Prepare');
  state.artboardResult=await call('artboard','api/artboard/projects/'+p.project_id);render();
  state.activePipeline='Production';state.stage='Generating AI artwork';state.progress=0;updateMonitor();
  j=await call('artboard','api/artboard/production',{method:'POST',json:{project_id:p.project_id,ai_reconstruction:true,processing_mode:state.lastMode}});captureJob('Artboard',j);j=await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Production');
 const details=j.result?.ai_reconstruction;
 for(const record of Object.values(details?.by_part||{})){
  const provider=record.provider||{};
  log('AI MODE '+state.lastMode+' · '+(provider.processing_mode||'unknown route')+' · '+(provider.model||'model not reported'));
 }
  state.artboardResult=await call('artboard','api/artboard/projects/'+p.project_id);render();
  state.activePipeline='Export';state.stage='Exporting validated files';state.progress=0;updateMonitor();
  j=await call('artboard','api/artboard/export',{method:'POST',json:{project_id:p.project_id,formats,bundle:formats.includes('zip')?'production_pack':'selected_files'}});captureJob('Artboard',j);await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Export');
  state.artboardResult=await call('artboard','api/artboard/projects/'+p.project_id);state.stage='Production complete';state.progress=100;log('Project state: '+state.artboardResult.state+' · true_vector_ready='+state.artboardResult.true_vector_ready)
 })
}
async function startFrame(){const f=state.files.frame;if(!f)throw Error('Upload an image/product/jersey source first');const ratio=document.querySelector('#frameRatio')?.value||'9:16';const opts={template_id:state.selectedMockup,mode:state.mode.frame,aspect_ratio:ratio,style_notes:document.querySelector('#frameNotes')?.value||null,brand:{brand_name:document.querySelector('#brandName')?.value||null,tagline:document.querySelector('#brandTagline')?.value||null,phone:document.querySelector('#brandPhone')?.value||null,website:document.querySelector('#brandWebsite')?.value||null}};await run('Frame Forge mockup',async()=>{const fd=new FormData();fd.append('source',f);if(state.files.logo)fd.append('logo',state.files.logo);fd.append('options_json',JSON.stringify(opts));let j=await call('frame','api/frameforge/jobs/mockup',{method:'POST',body:fd});captureJob('Frame Forge mockup',j);log('Submitted mockup: '+j.job_id+' · '+opts.template_id);j=await jobPoll('frame','api/frameforge/jobs/'+j.job_id,'Mockup');state.frames.mockup=j;state.frames.video=null;log('Mockup status: '+j.status);if(j.output_ready){try{const blob=await call('frame',`api/frameforge/jobs/${j.job_id}/output`,{response:'blob'});if(state.objectURLs.frame_result)URL.revokeObjectURL(state.objectURLs.frame_result);state.objectURLs.frame_result=URL.createObjectURL(blob);}catch(err){log('Preview unavailable; download remains available: '+err.message)}}})}
async function startVideo(){if(!state.frames.mockup?.output_ready)throw Error('Complete a mockup first');const ratio=document.querySelector('#videoRatio')?.value||'9:16',dur=Number(document.querySelector('#videoDuration')?.value);if(!Number.isInteger(dur)||dur<10||dur>30)throw Error('Video duration must be an integer between 10 and 30 seconds');const opts={template_id:state.selectedVideo,mode:state.mode.frame,aspect_ratio:ratio,duration_seconds:dur,style_notes:document.querySelector('#videoNotes')?.value||null};await run('Frame Forge video',async()=>{let j=await call('frame',`api/frameforge/jobs/${state.frames.mockup.job_id}/video`,{method:'POST',json:opts});captureJob('Frame Forge video',j);log('Submitted video: '+j.job_id+' · '+opts.template_id);j=await jobPoll('frame','api/frameforge/jobs/'+j.job_id,'Video');state.frames.video=j;log('Video status: '+j.status);if(j.output_ready){try{const blob=await call('frame',`api/frameforge/jobs/${j.job_id}/output`,{response:'blob'});if(state.objectURLs.video_result)URL.revokeObjectURL(state.objectURLs.video_result);state.objectURLs.video_result=URL.createObjectURL(blob);}catch(err){log('Video preview unavailable; download remains available: '+err.message)}}})}
async function analyzeAssets(){const f=state.files.assets;if(!f)throw Error('Select an asset first');await run('AssetsX upload & analysis',async()=>{const fd=new FormData();fd.append('file',f);const j=await call('assets','v1/assets',{method:'POST',body:fd});state.assetInfo=await call('assets','v1/assets/'+j.id);state.assetElements.clear();log('Detected '+(state.assetInfo.elements||[]).length+' element candidate(s) in '+state.assetInfo.format)})}
function edits(){const action=state.editing;if(action==='none')return [];const value=id=>document.querySelector('#'+id)?.value;let params={};if(action==='recolor'){params={color:value('editColor')}}else if(action==='rotate'){params={degrees:Number(value('editDegrees'))}}else if(action==='add_text'){params={text:value('editText'),x:Number(value('editX')),y:Number(value('editY')),color:value('editColor')}}else if(action==='add_shape'){params={x:Number(value('editX')),y:Number(value('editY')),width:Number(value('editWidth')),height:Number(value('editHeight')),color:value('editColor'),shape:'rectangle'}}else if(action==='background_remove'){params={threshold:Number(value('editThreshold'))}}const selected=[...state.assetElements];if(['recolor','remove'].includes(action)&&!selected.length)throw Error('Select one or more analyzed elements first');if(action==='background_remove'&&state.assetInfo?.input_mode==='vector_svg')throw Error('Background removal is not implemented on native SVG sources');return [{action,element_ids:selected,params}]}
async function startAssets(){if(!state.assetInfo?.id)throw Error('Upload and analyze the asset first');const strategy=document.querySelector('#assetsStrategy')?.value||'auto',max_colors=Number(document.querySelector('#assetsColors')?.value||12),formats=[...state.formats.assets];if(!formats.length)throw Error('Select at least one output format');if(max_colors<2||max_colors>32)throw Error('Colors must be 2–32');const requestedEdits=edits();await run('AssetsX vectorization',async()=>{let j=await call('assets','v1/jobs',{method:'POST',json:{asset_id:state.assetInfo.id,mode:state.mode.assets,strategy,selected_element_ids:[...state.assetElements],edits:requestedEdits,formats,max_colors,strict_true_vector:true}});captureJob('AssetsX', {job_id:j.id,status:j.state,created_at:j.created_at});log('Started AssetsX job '+j.id);j=await jobPoll('assets','v1/jobs/'+j.id,'Vectorization');state.assetsJob=j;log('AssetsX state: '+j.state)})}
async function startAutofly(){const w=state.autoflyWorkflow,mode=state.mode.autofly,dpi=Number(document.querySelector('#autoDpi')?.value||330),formats=[...state.formats.autofly];if(!formats.length)throw Error('Choose SVG and/or EPS output');if(w==='brief'){const brief=document.querySelector('#autoBrief')?.value.trim()||'';if(brief.length<10)throw Error('Brief must be at least 10 characters');const body={brief,front_notes:document.querySelector('#autoFrontNotes')?.value||'',back_notes:document.querySelector('#autoBackNotes')?.value||'',mode,dpi,formats};await run('Autofly one-click Artboard brief',async()=>{let j=await call('autofly','api/autofly/jobs/from-brief',{method:'POST',json:body});captureJob('Autofly',j);log('Submitted one-click Artboard job '+j.job_id);j=await jobPoll('autofly','api/autofly/jobs/'+j.job_id,'Autofly');state.autoflyJob=j;log('Status: '+j.status)})}
 else{const f=state.files.autofly;if(!f)throw Error('Select an input image');if(w==='panels'&&!state.files.autofly_back)throw Error('Separate front and back files are required');await run('Autofly one-click Artboard workflow',async()=>{const fd=new FormData();if(w==='combined')fd.append('file',f);else{fd.append('front',f);fd.append('back',state.files.autofly_back)}fd.append('options_json',JSON.stringify({mode,dpi:dpi===330?330:600,formats,reconstruction_mode:'auto',run_ocr:true}));const path=w==='combined'?'from-combined':'from-panels';let j=await call('autofly','api/autofly/jobs/'+path,{method:'POST',body:fd});captureJob('Autofly',j);log('Submitted one-click Artboard job '+j.job_id);j=await jobPoll('autofly','api/autofly/jobs/'+j.job_id,'Autofly');state.autoflyJob=j;log('Autofly status: '+j.status)})}}
async function download(engine,path){try{const data=await call(engine,path,{response:'blob'});const href=URL.createObjectURL(data);const a=document.createElement('a');a.href=href;a.download=path.split('/').pop()||'engine-output';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);log('Downloaded actual engine file: '+a.download)}catch(e){notify(e.message);log('Download failed: '+e.message)}}

async function continueWithIllustrator(){
 const d=artboardTelemetry(),item=d.exports.find(x=>x.format==='svg');
 if(!item||!d.p.project_id){notify('A validated SVG export is required first');return}
 const relative=item.path.replace(/^projects\/[^/]+\//,'');
 const path='api/artboard/projects/'+encodeURIComponent(d.p.project_id)+'/artifacts/'+relative.split('/').map(encodeURIComponent).join('/');
 try{
  const blob=await call('artboard',path,{response:'blob'}),file=new File([blob],(item.part||'artboard')+'.svg',{type:'image/svg+xml'});
  if(navigator.canShare?.({files:[file]})){
   await navigator.share({files:[file],title:'Continue validated Artboard SVG in Illustrator'});
   log('Sent validated SVG to the operating-system app chooser');return;
  }
  const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);
  window.open('https://www.adobe.com/products/illustrator.html','_blank','noopener,noreferrer');
  log('Downloaded validated SVG and opened the official Illustrator page');
 }catch(e){if(e?.name==='AbortError'){notify('Illustrator handoff cancelled');return}notify(e.message);log('Illustrator handoff failed: '+e.message)}
}

function diagnoseArtboardFailure(){
 const problems=Object.values(state.lastExportErrors||{});
 const reasons=problems.length?problems.map(x=>(x.format||'file').toUpperCase()+': '+x.message):[state.lastError||'Unknown engine failure'];
 state.diagnosis=reasons.join(' | ');
 log('DIAGNOSIS: '+state.diagnosis);
 if(state.failedStage==='export')log('SAFE REPAIR: retry export only, reusing validated vectors. No new AI generation.');
 else log('Recovery: review source/provider/model result before explicit paid retry. No automatic AI retry.');
 render();
}

async function resumeFailedArtboardProduction(){
 if(state.busy||state.failedStage!=='production'||!state.artboardProject?.project_id)return;
 if(!state.artboardResult?.ai_reconstruction?.complete){
  notify('No saved complete AI artwork exists. This job cannot be resumed without another paid generation.');
  return;
 }
 const id=state.artboardProject.project_id;
 const mode=state.artboardResult.ai_reconstruction.processing_mode||state.lastMode||state.mode.artboard;
 const requested=[...state.formats.artboard];
 await run('Resume Artboard from saved artwork',async()=>{
  log('Reusing saved artwork. No new image generation; semantic guidance and vector review may use paid AI calls.');
  let j=await call('artboard','api/artboard/production',{
   method:'POST',json:{project_id:id,processing_mode:mode,
    ai_reconstruction:true,resume_from_ai:true}
  });
  captureJob('Artboard safe resume',j);
  j=await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Production');
  log('Production resumed from saved artwork. Verify review and technical validation before export.');
  j=await call('artboard','api/artboard/export',{
   method:'POST',json:{project_id:id,formats:requested,
    bundle:requested.includes('zip')?'production_pack':'selected_files'}
  });
  captureJob('Artboard resumed export',j);
  await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Export');
  state.artboardResult=await call('artboard','api/artboard/projects/'+id);
  state.failedStage='';
 });
}
async function retryFailedArtboardStage(){
 if(state.busy||!state.artboardProject?.project_id) return;
 if(state.failedStage!=='export'||!state.failedFormats.length){
  notify('Only failed export formats can be safely retried without buying another AI generation.');
  return;
 }
 const projectId=state.artboardProject.project_id, formats=[...state.failedFormats];
 await run('Retry export formats only',async()=>{
  log('Recovering '+formats.join(', ')+' from already validated vectors; AI is NOT called');
  let j=await call('artboard','api/artboard/export',{
   method:'POST',json:{project_id:projectId,formats,bundle:'selected_files'}
  });
  captureJob('Artboard export recovery',j);
  j=await jobPoll('artboard','api/artboard/jobs/'+j.job_id,'Export');
  state.artboardResult=await call('artboard','api/artboard/projects/'+projectId);
 });
}
function newFile(t,file){if(!file)return;if(state.objectURLs[t])URL.revokeObjectURL(state.objectURLs[t]);state.files[t]=file;state.objectURLs[t]=file.type.startsWith('image/')&&!file.type.includes('svg')?URL.createObjectURL(file):'';if(t==='assets'){state.assetInfo=null;state.assetsJob=null;state.assetElements.clear();}if(t==='frame'){state.frames={mockup:null,video:null};for(const x of ['frame_result','video_result']){if(state.objectURLs[x])URL.revokeObjectURL(state.objectURLs[x]);delete state.objectURLs[x]}}if(t==='artboard'){state.artboardProject=null;state.artboardResult=null;state.artboardJob=null;state.artboardEvents=[];state.artboardEventKeys.clear();state.activePipeline='';state.diagnosis='';state.failedStage='';state.failedFormats=[];state.artboardPreviewPath='';if(state.objectURLs.artboard_live)URL.revokeObjectURL(state.objectURLs.artboard_live);delete state.objectURLs.artboard_live;}if(t==='autofly'){state.autoflyJob=null;}log('Selected local file: '+file.name+' ('+fmtSize(file.size)+')');render()}
document.addEventListener('input',e=>{const el=e.target;if(el.closest('#mainContent')&&el.id&&el.type!=='file')state.formValues[el.id]=el.type==='checkbox'?el.checked:el.value});
document.addEventListener('change',e=>{const el=e.target;if(el.closest('#mainContent')&&el.id&&el.type!=='file')state.formValues[el.id]=el.type==='checkbox'?el.checked:el.value;if(el.dataset.file){newFile(el.dataset.file,el.files[0]);return}if(el.dataset.element){if(el.checked)state.assetElements.add(el.dataset.element);else state.assetElements.delete(el.dataset.element);return}if(el.id==='editAction'){state.editing=el.value;document.querySelector('#editParameters').innerHTML=editFields()}});
document.addEventListener('dragover',e=>{const dz=e.target.closest('[data-droptool]');if(dz){e.preventDefault();dz.classList.add('over')}});
document.addEventListener('dragleave',e=>{const dz=e.target.closest('[data-droptool]');if(dz)dz.classList.remove('over')});
document.addEventListener('drop',e=>{const dz=e.target.closest('[data-droptool]');if(dz){e.preventDefault();dz.classList.remove('over');newFile(dz.dataset.droptool,e.dataTransfer.files[0])}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.tool){state.tool=b.dataset.tool;resetJob();render();if(innerWidth<=780)closeMenu();return}if(b.dataset.localAction){notify(b.dataset.localAction==='support'?'Support API is not connected; no ticket was sent.':'This section will activate after its verified backend is connected.');return}if(b.dataset.mode){if(state.busy){notify('Mode is locked while a job is running');return}state.mode[state.tool]=b.dataset.mode;render();return}if(b.dataset.format){const s=state.formats[state.tool];if(s){if(s.includes(b.dataset.format))s.splice(s.indexOf(b.dataset.format),1);else s.push(b.dataset.format)}render();return}if(b.dataset.template){if(b.dataset.templatekind==='mockup')state.selectedMockup=b.dataset.template;else state.selectedVideo=b.dataset.template;render();return}if(b.dataset.workflow){state.autoflyWorkflow=b.dataset.workflow;render();return}if(b.dataset.download){const split=b.dataset.download.indexOf('|');return download(b.dataset.download.slice(0,split),b.dataset.download.slice(split+1))}if(b.id==='refreshStatus'){await statusCheck();return}if(b.dataset.action==='diagnoseArtboard'){diagnoseArtboardFailure();return}if(b.dataset.action==='retryArtboardExport'){await retryFailedArtboardStage();return}if(b.dataset.action==='retryArtboardProduction'){await resumeFailedArtboardProduction();return}if(b.dataset.action==='continueIllustrator'){await continueWithIllustrator();return}if(b.dataset.action){try{if(b.dataset.action==='startArtboard')await startArtboard();if(b.dataset.action==='startFrame')await startFrame();if(b.dataset.action==='startVideo')await startVideo();if(b.dataset.action==='startAutofly')await startAutofly();if(b.dataset.action==='analyzeAssets')await analyzeAssets();if(b.dataset.action==='startAssets')await startAssets()}catch(err){state.lastError=err.message;log('ERROR: '+err.message);notify(err.message);render()}return}});
function syncNavigation(){
 const mobile=innerWidth<=780;
 const open=mobile?document.body.classList.contains('menu-open'):!document.body.classList.contains('sidebar-collapsed');
 document.querySelector('#menuButton').setAttribute('aria-expanded',String(open));
 document.querySelector('#sidebar').inert=!open;
 document.querySelector('#menuBackdrop').hidden=!mobile||!open;
}
function closeMenu(){document.body.classList.remove('menu-open');syncNavigation()}
document.querySelector('#menuButton').addEventListener('click',()=>{
 document.body.classList.toggle(innerWidth>780?'sidebar-collapsed':'menu-open');
 syncNavigation();
});
document.querySelector('#menuClose').addEventListener('click',closeMenu);
document.querySelector('#menuBackdrop').addEventListener('click',closeMenu);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('menu-open')){closeMenu();document.querySelector('#menuButton').focus()}});
window.addEventListener('resize',syncNavigation);
syncNavigation();
render();
statusCheck();
