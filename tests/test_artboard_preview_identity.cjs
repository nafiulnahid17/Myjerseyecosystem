'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../artboard-v2.js'),'utf8');
const source=src.slice(src.indexOf('  async function loadSideAssets('),src.indexOf('  function syncProductionStage()'));
async function run(stale){
 let projectId='p',calls=[],created=[];
 const ui={workspaceEpoch:1,generationStarted:true,productionDone:true,generatedUrls:{},vectorUrls:{},assetBusy:new Set(),assetRetry:{}};
 const parts=['front','back'].map(side=>({side:side+'_body',part_id:side,exports:{svg:'projects/p/exports/'+side+'.svg',premium_svg:'projects/p/exports/'+side+'-recolored.svg'}}));
 const context={ui,state:{tool:'artboard'},Date,project:()=>({project_id:projectId}),available:()=>parts,artifactEndpoint:(_id,path)=>path,render(){},URL:{createObjectURL:b=>{created.push(b);return 'blob:'+created.length},revokeObjectURL(){}},call:async(_engine,path)=>{
  calls.push(path);
  if(stale){projectId='next-project';ui.workspaceEpoch++;ui.generatedUrls={};ui.vectorUrls={};}
  return {size:50,path};
 }};
 const load=vm.runInNewContext(source+'\nloadSideAssets',context);await load();return {calls,created,ui};
}
(async()=>{
 const current=await run(false);
 assert(current.calls.includes('projects/p/exports/front.svg'));
 assert(current.calls.includes('projects/p/exports/back.svg'));
 assert(!current.calls.some(p=>p.includes('recolored')),'Final preview must use the unchanged print SVG, not a recolored editing companion');
 assert.equal(current.created.length,4);
 const stale=await run(true);
 assert.equal(stale.calls.length,1,'Stop obsolete workspace fetches');
 assert.equal(stale.created.length,0,'Discard old project response before creating a preview URL');
 assert.deepEqual(stale.ui.vectorUrls,{});
 console.log('Front/back print artifact identity and stale project response tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
