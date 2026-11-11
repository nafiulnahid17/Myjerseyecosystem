'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','artboard-v2.js'),'utf8');
assert(app.includes('pendingArtboardJob:null'));
const restored=app.slice(app.indexOf('async function restoreArtboardSession(){'),app.indexOf('function resetJob(){'));
assert(!restored.includes("state.tool='artboard'"),'Do not navigate after refresh');
assert(!restored.includes("await jobPoll("),'Do not auto-poll stale jobs');
assert(ui.includes('Resume Production')&&ui.includes('Cancel & New Input'));
assert(ui.includes('ui.preferInput'), 'Respect user returning to input after leaving tool');
assert(ui.includes('cancellationPollInFlight'),'Prevent duplicate cancel requests');
assert(ui.includes("['cancelled','completed','failed'].includes(latest.status)"),'Only confirmed terminal state resets');
assert(ui.includes("sessionStorage.removeItem('mj_artboard_job')"),'Forget previous job on new input');
assert(ui.includes('if(ui.cancelRequested){void stop();return;}'),'Never dispatch followup job after cancel');
assert(ui.includes("'□ Stop '+") && ui.includes("'stop','danger'"),'Stage-specific Stop action visible on all processing pages');
assert(ui.includes("status==='cancelling'"),'Show backend cancelling state');
assert(!ui.includes("if(ui.phase==='input'&&state.artboardProject?.project_id"),'Legacy auto-reentry removed');

// Stage classification must follow the CURRENT engine milestone, never the
// early 3% "Validating production request" preflight event.
const vm=require('node:vm');
const progressValue=ui.match(/function progressValue\(value\)\{[^\n]*\}/)?.[0];
const stageOf=ui.match(/function stageOf\(message, progress=null\)\{[\s\S]*?\n  \}/)?.[0];
assert(progressValue&&stageOf,'Stage/progress classifiers must remain inspectable');
const classify=vm.runInNewContext(progressValue+'\n'+stageOf+'\nstageOf', {});
for(const [message,pct,expected] of [
  ['Validating production request',3,'Artwork Creation'],
  ['Running vectorize',58,'Vectorization'],
  ['Running optimize',72,'Vectorization'],
  ['Running compose',83,'Vectorization'],
  ['Running validate',92,'Validation'],
  ['Validate completed',96,'Validation'],
]) assert.equal(classify(message,pct),expected,message);
assert(ui.includes('const reportedStage=stageOf(state.stage,state.progress)'),'Live stage must use current job update');
// If polling misses the vector event, show its completed view before validation.
const stageUi={view:null,finishing:false,generationStarted:true,productionDone:false,phase:'artwork',processingStage:'Artwork Creation',visitedStages:new Set()};
const stageState={activePipeline:'Production',stage:'Validating vector output',progress:92};
const syncSource=ui.slice(ui.indexOf('  function syncProductionStage(){'),ui.indexOf('  function refresh(){'));
const syncStage=vm.runInNewContext(syncSource+'\nsyncProductionStage',{ui:stageUi,state:stageState,stageOf:classify,render(){}});
assert.equal(syncStage(),true);assert.equal(stageUi.processingStage,'Vectorization');assert.equal(stageUi.stageStatus,'completed');
assert.equal(syncStage(),true);assert.equal(stageUi.processingStage,'Validation');

assert(!ui.includes('const candidates=[...(state.artboardEvents'),'Historic events must not skip stages');
assert(ui.includes('resume_from_ai:true'),'Resume must reuse saved artwork without paid AI regeneration');
assert(ui.includes("if(a==='resume-vector')"),'Recovery button must have an active handler');
assert(ui.includes('productionApproved('),'Quality export requires backend review and technical validation');
assert(ui.includes('vectorReviewPanel()'),'Quality AI review appears in UI without extra calls');
assert(ui.includes('FINAL_FIX_TECHNICAL_PENDING'),'Second fix is distinguished from an AI-review PASS');
assert(ui.includes('AI vector review')&&ui.includes('Semantic guidance'),'New AI workflow progress must be classified');

assert(ui.includes("'_Master_'+(p.processing_mode==='quality'?'quality':'normal')+'.zip'"),
  'Client-assembled ZIP must expose quality/normal mode in its filename');
assert(ui.includes("item.path.split('/').pop()"),
  'Illustrator handoff must retain the actual mode-suffixed artifact filename');
assert(ui.includes("p.processing_mode==='quality'?'quality':'normal'"),
  'Artboard download filenames must distinguish quality from normal mode');

// Production status must not approve an unreviewed final AI correction.
const approvalStart=ui.indexOf('const qualityMode = () => true;');
const approvalEnd=ui.indexOf('  function vectorReviewPanel(){',approvalStart);
assert(approvalStart>=0&&approvalEnd>approvalStart,'Inspect actual approval logic');
const approval=vm.runInNewContext(
  ui.slice(approvalStart,approvalEnd)+'\nproductionApproved',
  {state:{lastMode:'quality',mode:{artboard:'quality'}},project:()=>({})},
);
const baseValidation={true_vector_ready:true,processing_mode:'quality',
  validation:{status:'PASS',ai_vector_review:{status:'PASS'}}};
assert.equal(approval(baseValidation),true,'Reviewed technical vector is exportable for desktop inspection');
assert.equal(approval({...baseValidation,validation:{
  status:'PASS',ai_vector_review:{status:'FINAL_FIX_TECHNICAL_PENDING'},
}}),false,'Never approve an unreviewed final AI correction');
assert.equal(approval({...baseValidation,validation:{
  status:'REVIEW_REQUIRED',ai_vector_review:{status:'PASS'},
}}),false,'Technical gate must still pass');
assert(ui.includes('delivery_readiness'),'Display backend delivery readiness separately');
assert(ui.includes('Native Illustrator sign-off is not certified'),'Never claim native AI approval');
assert(!ui.includes('Production-ready saved result'),'Never claim production delivery from SVG alone');

console.log('Artboard refresh/cancel/re-entry and export naming regression contract passed');
