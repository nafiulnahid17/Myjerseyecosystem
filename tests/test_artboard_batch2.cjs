'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert').strict,path=require('path');
const src=fs.readFileSync(path.resolve(__dirname,'..','artboard-v2.js'),'utf8');
const css=fs.readFileSync(path.resolve(__dirname,'..','artboard-v2-workflow-fixes.css'),'utf8');
let listeners={},screens=[],requests=[],downloads=[],serverProject=null,jobN=0,currentJob=null,mode='normal';
let bodyClasses=new Set();
const classes={contains:x=>bodyClasses.has(x),add:x=>bodyClasses.add(x),remove:x=>bodyClasses.delete(x),toggle:(x,on)=>{if(on===undefined? !bodyClasses.has(x):on)bodyClasses.add(x);else bodyClasses.delete(x)}};
const file={name:'jersey-front-back.png',type:'image/png',size:260000};
const state={tool:'artboard',mode:{artboard:'quality'},status:{artboard:{state:'online',ai_configured:true}},files:{artboard:file},objectURLs:{artboard:'blob:real-upload',artboard_live:'blob:real-stage'},artboardPreviewPath:'',artboardProject:null,artboardResult:null,artboardJob:null,artboardEvents:[],artboardEventKeys:new Set(),logs:[],busy:false,progress:null,stage:'',lastError:'',lastJobId:'',activePipeline:'',formats:{artboard:['eps','svg','pdf']}};
const context={state,Date,setTimeout:(fn)=>setTimeout(fn,1),URL:{revokeObjectURL(){},createObjectURL(){return'blob:generated'}},Blob,File,FormData,Set,encodeURIComponent,Math,String,Number,Array,Boolean,Promise,console,innerWidth:1400,
 document:{body:{classList:classes},addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn),querySelector:(s)=>s==='.abv2'?{querySelector:()=>null}:s==='#menuButton'?{setAttribute(){}}:null},
 esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),fmtSize:n=>(n/1024).toFixed(1)+' KB',connected:()=>true,notify:x=>{},
 artboardTelemetry:()=>({exports:serverProject?.exports?Object.entries(serverProject.exports).map(([format,path])=>({format,path})):[],partValidation:{path_count:410,color_mode:'CMYK'},validation:{}}),renderArtboardOutputs:()=>'',continueWithIllustrator:()=>{},
 updateMonitor:()=>{},updateArtboardPreview:()=>{},artboardPageV4:()=>'',startArtboard:()=>{},closeMenu:()=>{},render:()=>screens.push(context.artboardPageV4()),newFile:()=>{},
 log:()=>{},download:(...args)=>downloads.push(args),captureJob:(_,j)=>{state.artboardJob=j;state.lastJobId=j.job_id},
 run:async(name,fn)=>{state.busy=true;state.lastError='';context.render();try{await fn()}catch(e){state.lastError=e.message;console.error('RUN ERROR',e)}finally{state.busy=false;context.render()}},
 jobPoll:async(engine,path,terminal)=>{
   assert.equal(engine,'artboard');assert.equal(currentJob.job_id,path.split('/').at(-1));
   if(terminal==='Production' && process.env.BATCH2_NO_STAGE_EVENTS !== '1'){
     for(const [step,stage] of [['Argon analyzing geometry, boundaries and micro-details','Analyzing'],['Generating flat rectangular print artwork','Artwork Creation'],['VTracer tracing vector paths','Artwork Creation'],['Validating vector fidelity','Artwork Creation']]){
       state.stage=step;state.progress=12;state.artboardEvents.push({step,at:'2026-11-01T00:00:00Z',progress:12});context.render();context.updateMonitor();
       assert(screens.at(-1).includes(stage),`Missing stage while real engine sends ${step}: ${stage}`);
      if(stage==='Analyzing')assert(screens.at(-1).includes('Live Design Analysis'),'Argon event must keep the scan screen visible');
       assert(screens.at(-1).includes('12%'),'Live UI must read the engine event progress field');
     }
   }else state.stage=terminal==='Prepare'?'Surface analysis complete':'Export complete';
   currentJob.status='completed';state.artboardJob=currentJob;
   return currentJob;
 },
 call:async(engine,path,opts={})=>{assert.equal(engine,'artboard');requests.push({path,opts});
  if(path==='api/artboard/projects'&&opts.method==='POST'){serverProject={project_id:'p1',surfaces:[],true_vector_ready:false,exports:{}};return serverProject;}
  if(path==='api/artboard/upload')return serverProject;
  if(path==='api/artboard/prepare'){serverProject.surfaces=opts.json.surfaces.map(x=>({type:x,name:x,part_id:x,exports:{},validation:{path_count:x==='front_body'?123:287,color_mode:'CMYK',postscript_level:2,dpi:300}}));return currentJob={job_id:'j'+(++jobN),project_id:'p1',status:'queued'};}
  if(path==='api/artboard/production'){serverProject.true_vector_ready=true;
    if(process.env.ARTBOARD_PROOF_MISSING!=='1'){
      serverProject.analysis_generation_audit=Object.fromEntries(serverProject.surfaces.map(item=>[
        item.part_id,{
          version:'analysis-generation-provenance/1',
          analysis:{
            status:item.type==='front_body'?'COMPLETED':'UNAVAILABLE',
            model:item.type==='front_body'?'google/gemini-4-argon':null,
            duration_ms:item.type==='front_body'?1902:null,
            summary:{fields:{base_colors:2,patterns:3,graphics:2,uncertain_details:1,layout_guidance:1}},
          },
          handoff:{
            status:item.type==='front_body'?'VERIFIED_IN_GENERATION_REQUEST':'SELF_ANALYSIS_ONLY',
            generation_model:'google/gemini-3-pro-image',
            included_analysis_characters:item.type==='front_body'?342:0,
            provider_prompt_confirmed:item.type==='front_body',
            prompt_sha256:item.type==='front_body'?'f'.repeat(64):null,
          },
          follow_through:{status:'REVIEW_REQUIRED',motifs_verified:false},
        }
      ]));
    }
    serverProject.validation={production_fidelity:{status:'REVIEW_REQUIRED'}};
    for(const item of serverProject.surfaces){
      item.validation={...item.validation,valid_svg:true,true_vector:true,embedded_rasters:0,
        gradient_count:2,segment_count:200,total_anchor_count:230,
        editability_status:'PASS',production_fidelity:{status:'PASS'},
        local_detail_fidelity:{status:item.type==='front_body'?'REVIEW_REQUIRED':'PASS',total_lost_dark_pixels:item.type==='front_body'?3:0,total_lost_bright_pixels:0},
        physical_artboard:{status:'PASS',width_in:22,height_in:31,raster_proof_dpi:600}};
    }
    return currentJob={job_id:'j'+(++jobN),project_id:'p1',status:'queued'};}
  if(path==='api/artboard/export'){
    if(opts.json?.bundle==='illustrator_handoff'){
      assert.equal(opts.json.formats.join(','),'eps,svg,zip');
      assert.equal(opts.json.part_ids.join(','),serverProject.surfaces
        .filter(x=>opts.json.part_ids.includes(x.part_id)).map(x=>x.part_id).join(','));
      serverProject.exports={...serverProject.exports,
        selected_zip_illustrator_handoff:'projects/p1/exports/illustrator-handoff-test_quality.zip'};
      serverProject.last_export={
        bundle:'illustrator_handoff',include_reference_raster:opts.json.include_reference_raster,
        zip_path:'projects/p1/exports/illustrator-handoff-test_quality.zip'};
      return currentJob={job_id:'j'+(++jobN),project_id:'p1',status:'queued'};
    }
    serverProject.exports={zip:'projects/p1/export/master.zip'};for(const item of serverProject.surfaces)item.exports={eps:`projects/p1/export/${item.type}.eps`,svg:`projects/p1/export/${item.type}.svg`,pdf:`projects/p1/export/${item.type}.pdf`,png:`projects/p1/export/${item.type}.png`,
    premium_svg:`projects/p1/export/${item.type}.premium-master.svg`,
    editability_report:`projects/p1/export/${item.type}.editability-report.json`,
    color_groups_report:`projects/p1/export/${item.type}.color-groups.json`};return currentJob={job_id:'j'+(++jobN),project_id:'p1',status:'queued'};}
  if(path.startsWith('api/artboard/projects/p1/artifacts/')&&opts.response==='blob')return new Blob(['real engine bytes'],{type:path.endsWith('.svg')?'image/svg+xml':'image/png'});
  if(path==='api/artboard/projects/p1')return serverProject;
  throw Error('Unexpected '+path);
 }};
vm.createContext(context);vm.runInContext(src,context);
const click=name=>({target:{closest:selector=>selector==='button[data-abv2]'?{dataset:{abv2:name}}:null},preventDefault(){},stopPropagation(){}});
const handler=listeners.click.find(f=>f.toString().includes("const b=e.target.closest('button[data-abv2]')"));
const test=(id,pass,reason)=>{assert(pass,reason||`Issue #${id}`);console.log('PASS Issue #'+id)};
(async()=>{
  context.render();test(27,css.includes('object-fit:contain!important')&&screens.at(-1).includes('abv2-upload-preview'),'analysis no-crop CSS');
  test(34,css.includes('artboard-workspace.sidebar-collapsed .shell')&&bodyClasses.has('sidebar-collapsed'));
  test(35,css.includes('artboard-workspace #menuButton{display:grid!important'));
  await handler(click('start'));
  test(27,src.includes('originalPreview()')&&css.includes('.abv2 .abv2-visual>img'));
  test('live-workflow-rail',screens.at(-1).includes('Artboard production workflow')&&screens.at(-1).includes('Artwork Creation'));
  test('dedicated-analyzing',screens.some(screen=>screen.includes('<h1>Analyzing</h1>')&&screen.includes('Live Design Analysis')));
  test('analyzer-engine-events',src.includes('abv2-analysis-live-status')&&src.includes("stageOf(state.stage,state.progress)==='Artwork Creation'"));
  test('analysis-handoff',src.includes('waitForPreparedProject')&&src.includes('Source references ready — syncing artwork inputs'));
  test(28,src.includes('interimPreview(side)')&&css.includes('abv2-reveal-real-image')&&screens.at(-1).includes('Artwork Creation'));
  test('no-vectorization-before-selection',screens.at(-1).includes('Review Saved Vectors')); 
  test('artwork-no-early-vectorization',!screens.some(v=>v.includes('<h1>Vectorization</h1>')));
  test('real-previews',screens.at(-1).includes('Real Front engine-produced artwork preview')&&screens.at(-1).includes('Real Back engine-produced artwork preview'));
  test('proof-panel-visible',screens.at(-1).includes('Analysis → Generation Proof'));
  if(process.env.ARTBOARD_PROOF_MISSING==='1'){
    test('legacy-proof-is-not-faked',screens.at(-1).includes('Audit not returned by deployed engine')&&!screens.at(-1).includes('Brief included in generator request'));
  }else{
    test('analyzer-completed-from-backend',screens.at(-1).includes('anthropic/claude-fable-5')&&screens.at(-1).includes('1.902 seconds'));
    test('verified-prompt-transfer',screens.at(-1).includes('Brief included in generator request')&&screens.at(-1).includes('342 chars verified'));
    test('visual-followthrough-stays-review',screens.at(-1).includes('Generated artwork follows brief')&&screens.at(-1).includes('Review required'));
    test('fallback-shown-honestly',screens.at(-1).includes('Unavailable — image-model self-analysis'));
  }
  const selection=listeners.change.find(f=>f.toString().includes("const b=e.target.closest('[data-abv2-select]')"));
  const chosen=process.env.ARTBOARD_TEST_PARTS==='both'?['front_body','back_body']:[process.env.ARTBOARD_TEST_PARTS==='back'?'back_body':'front_body'];
  for(const side of chosen)selection({target:{closest:(sel)=>sel==='[data-abv2-select]'?{dataset:{abv2Select:side},checked:true}:null}});
  test('select-'+chosen.join('+'),screens.at(-1).includes('Review Saved Vectors')&&screens.at(-1).includes(chosen.length+' selected'));
  await handler(click('continue-vectorization'));
  const displayed=screens.map(s=>s.match(/abv2-header[\s\S]*?<h1>(.*?)<\/h1>/)?.[1]||'').filter(Boolean);
  test(29,displayed.includes('Vectorization')&&src.includes('abv2-real-paths'));
  test(30,displayed.includes('Validation')&&src.includes('validation-overlay'));
  test(31,screens.at(-1).includes('Production Details')&&screens.at(-1).includes('Vector paths')&&screens.at(-1).includes('PostScript level')&&screens.at(-1).includes('Raster proof DPI'));
  test(32,screens.at(-1).includes('<h2>Master ZIP</h2>')&&screens.at(-1).includes('data-abv2="download-master-zip"'));
  test('export-order',screens.at(-1).indexOf('abv2-export-settings')<screens.at(-1).indexOf('abv2-package')&&screens.at(-1).indexOf('abv2-package')<screens.at(-1).indexOf('abv2-illustrator')&&screens.at(-1).indexOf('abv2-illustrator')<screens.at(-1).indexOf('abv2-new-production'));
  test('production-details-right',screens.at(-1).indexOf('abv2-export-right')<screens.at(-1).indexOf('Production Details'));
  await handler(click('select-format:svg'));
  test('selected-export-only',screens.at(-1).includes('Download Front')===chosen.includes('front_body')&&screens.at(-1).includes('Download Back')===chosen.includes('back_body'));
  test('zip-fallback',src.includes('assembleMasterZip(entries)')&&src.includes('download-master-zip')&&src.includes("response:'blob'")&&src.includes('new Blob([...local,...central,end]'));
  test('premium-artifacts-real',screens.at(-1).includes('<h2>Illustrator Editing Files</h2>')&&screens.at(-1).includes('Premium Master SVG')&&screens.at(-1).includes('Editability Report')&&screens.at(-1).includes('Color Groups Report'));
  test('native-ai-honest',screens.at(-1).includes('Native .AI requires desktop Illustrator')&&!screens.at(-1).includes('Download Native AI'));
  test('handoff-actions-visible',screens.at(-1).includes('Illustrator Handoff ZIP')&&screens.at(-1).includes('ZIP + Reference PNG'));
  const beforeHandoffAi=requests.filter(r=>r.path==='api/artboard/production').length;
  await handler(click('illustrator-handoff'));
  const zipJob=requests.filter(r=>r.path==='api/artboard/export').at(-1);
  test('handoff-default-reference-excluded',zipJob.opts.json.bundle==='illustrator_handoff'&&zipJob.opts.json.include_reference_raster===false);
  test('handoff-respects-selected-sides',zipJob.opts.json.part_ids.length===chosen.length);
  test('handoff-zip-download',downloads.some(args=>String(args[1]).includes('illustrator-handoff-test_quality.zip')));
  await handler(click('illustrator-handoff-reference'));
  const zipReferenceJob=requests.filter(r=>r.path==='api/artboard/export').at(-1);
  test('reference-explicit-opt-in',zipReferenceJob.opts.json.include_reference_raster===true&&zipReferenceJob.opts.json.part_ids.length===chosen.length);
  test('handoff-no-paid-ai-retry',requests.filter(r=>r.path==='api/artboard/production').length===beforeHandoffAi);

  test('renderer-preserves-report-filenames',screens.at(-1).includes('editability-report.json')&&screens.at(-1).includes('color-groups.json'));
  test(33,screens.at(-1).includes('<h2>Adobe Illustrator</h2>')&&screens.at(-1).includes('Continue to Illustrator')&&!screens.at(-1).includes('Master ZIP & Illustrator'));
  test('scope',!requests.some(r=>r.path.startsWith('api/revector')));
  test('auto-flow',displayed.indexOf('Vectorization')>=0&&displayed.indexOf('Validation')>displayed.indexOf('Vectorization')&&displayed.indexOf('Export Production')>displayed.indexOf('Validation'));
  const beforeReviewCalls=requests.length;
  await handler(click('previous'));
  test('quality-validation-visible',screens.at(-1).includes('<h2>Validation Results</h2>')&&screens.at(-1).includes('Artwork fidelity')&&screens.at(-1).includes('Micro details')&&screens.at(-1).includes('Editability'));
  test('quality-metadata-from-backend',screens.at(-1).includes('gradient_count')===false&&screens.at(-1).includes('2</b><small>Gradients')&&screens.at(-1).includes('3 dark / 0 bright pixels flagged')===chosen.includes('front_body'));
  await handler(click('toggle-compare'));
  test('actual-artwork-vector-comparison',screens.at(-1).includes('AI artwork master')&&screens.at(-1).includes('Final vector'));
  if(chosen.length===2){
    await handler(click('review-side:back_body'));
    test('side-specific-validation',screens.at(-1).includes('Review validation by artwork side')&&screens.at(-1).includes('No flagged dark/bright marks')&&!screens.at(-1).includes('3 dark / 0 bright pixels flagged'));
  }
  test('review-does-not-call-paid-engine',requests.length===beforeReviewCalls);
  test('proof-visible-in-validation',screens.at(-1).includes('Analysis → Generation Proof'));
  test('no-visual-accuracy-fake-pass',!screens.at(-1).includes('Generated artwork follows brief</small><b class="verified">'));

  if(process.env.EXPORT_SNAPSHOT==='1')fs.writeFileSync('/mnt/data/artboard_final_work/export-qa.html','<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>'+fs.readFileSync('/mnt/data/artboard_v2_draft/artboard-v2.css','utf8')+'\\n'+css+'</style><body style=\"margin:0;background:#010b1b;color:white\">'+screens.at(-1)+'</body>');
  console.log('PASS Batch 02 frontend mocked integration & static checks');
})().catch(e=>{console.error(e);process.exitCode=1});
