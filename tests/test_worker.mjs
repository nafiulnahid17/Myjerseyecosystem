import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/worker.mjs';
const BASE='https://myjersey.example';
const ENGINE='e'.repeat(64);
const ORIGIN='https://artboard-ai-resolution-independent-production.up.railway.app';
const env=()=>({
  MYJERSEY_ACCESS_TOKEN:'w'.repeat(64),
  ARTBOARD_V031_TOKEN:ENGINE,ARTBOARD_V031_URL:ORIGIN,
  MYJERSEY_ARTBOARD_PRINCIPAL:'legacy_unused',
  API_LIMITER:{limit:async()=>({success:true})},
  AI_LIMITER:{limit:async()=>({success:true})},
  ASSETS:{fetch:async()=>new Response('STATIC')}
});
const req=(path,options={})=>new Request(BASE+path,options);
test('static frontend served normally without login',async()=>{
 assert.equal(await(await handleRequest(req('/'),env())).text(),'STATIC');
});
test('public status creates signed HttpOnly browser identity',async()=>{
 const upstream=async(url,opts)=>{assert.equal(url,ORIGIN+'/health/ready');return Response.json({status:'ready',ai_configured:true})};
 const response=await handleRequest(req('/api/status'),env(),upstream);
 assert.equal(response.status,200);
 assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 assert.equal((await response.json()).engines.artboard.state,'online');
});
test('two separate visitors do not share an Artboard principal',async()=>{
 const e=env(), who=[];
 const upstream=async incoming=>{
   who.push(incoming.headers.get('x-artboard-user'));
   assert.equal(incoming.headers.get('authorization'),'Bearer '+ENGINE);
   assert.equal(incoming.headers.has('cookie'),false);
   return Response.json({project_id:'a'}, {status:201});
 };
 const p='/api/engine/artboard/api/artboard/projects';
 const options={method:'POST',headers:{'Content-Type':'application/json'},body:'{"processing_mode":"quality"}'};
 const one=await handleRequest(req(p,options),e,upstream);
 const two=await handleRequest(req(p,options),e,upstream);
 assert.notEqual(who[0],who[1]);
 const cookie=one.headers.get('set-cookie').split(';')[0];
 await handleRequest(req(p,{...options,headers:{'Content-Type':'application/json','Cookie':cookie}}),e,upstream);
 assert.equal(who[0],who[2]);
 assert.match(who[0],/^guest_[a-f0-9]{32}$/);
 assert.equal(two.status,201);
});
test('production paid calls fail closed if limiter unavailable and block when exceeded',async()=>{
 const e=env(),path='/api/engine/artboard/api/artboard/production';
 delete e.AI_LIMITER;
 const body={method:'POST',headers:{'Content-Type':'application/json'},body:'{"project_id":"a"}'};
 assert.equal((await handleRequest(req(path,body),e)).status,503);
 e.AI_LIMITER={limit:async()=>({success:false})};
 assert.equal((await handleRequest(req(path,body),e)).status,429);
});
test('worker denies cross-origin writes, unsupported methods and paths',async()=>{
 const e=env(),path='/api/engine/artboard/api/artboard/projects';
 assert.equal((await handleRequest(req(path,{method:'POST',headers:{origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}),e)).status,403);
 assert.equal((await handleRequest(req(path,{method:'DELETE'}),e)).status,405);
 assert.equal((await handleRequest(req('/api/engine/artboard/api/artboard/admin'),e)).status,404);
});
test('invalid key configuration and unconfigured engine fail securely',async()=>{
 const e=env();delete e.MYJERSEY_ACCESS_TOKEN;
 assert.equal((await handleRequest(req('/api/status'),e)).status,503);
 const f=env();delete f.ARTBOARD_V031_TOKEN;
 assert.equal((await handleRequest(req('/api/status'),f)).status,200);
});
test('redirects rejected so server-side bearer is never leaked',async()=>{
 const resp=await handleRequest(req('/api/engine/artboard/api/artboard/projects/a'),env(),async()=>new Response(null,{status:302,headers:{Location:'https://evil.example'}}));
 assert.equal(resp.status,502);
});
test('wrangler has rate limit bindings and safe compatibility date', async()=>{
 const {readFileSync}=await import('node:fs');
 const c=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.ok(c.compatibility_date<=new Date().toISOString().slice(0,10));
 assert.deepEqual(c.ratelimits.map(x=>x.name),['API_LIMITER','AI_LIMITER']);
});
