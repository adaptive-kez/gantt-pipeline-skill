'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const S=require('../scripts/aspro-sync.cjs');
const config={baseUrl:'https://example.aspro.cloud',projectIds:[1],stageMap:{'1:10':'design'},port:0};
function project(){return{version:1,id:'demo',name:'Demo',mode:'website',sync:{url:'/api/aspro/snapshot'},sources:[{id:'brief',text:'INTERNAL SOURCE'}],stages:[{id:'design',label:'Design',color:'#123456',pool:'design'}],settings:{start:'2026-09-01',capacities:{design:null},stageDurations:{design:null},holidays:[],overrides:{},preserveSourceDates:true},tasks:[task('T1',1)]};}
function task(id,remote){return{id,title:'Old',stage:'design',workstream:'Main',description:'INTERNAL DESCRIPTION',acceptance:['INTERNAL ACCEPTANCE'],sourceRefs:[{quote:'INTERNAL QUOTE'}],dependsOn:[],duration:2,sourceStart:'2026-09-01',sourceEnd:'2026-09-02',notBefore:null,blocker:null,status:'planned',milestone:false,resourceGroup:null,aspro:{id:remote,projectId:1,stageId:10,url:'https://example.aspro.cloud/verified/'+remote}};}
function row(id=1,extra={}){return{id,name:'Current',module:'st',model:'project',model_id:1,project_stage_id:10,workflow_stage_id:2,plan_start_date:'2026-09-03 09:00:00',deadline:'2026-09-04 18:00:00',status:3,archive_status:0,prev_task_id:0,...extra};}
function response(items,total=items.length,page=1){return new Response(JSON.stringify({response:{items,total_result:total,total:99999,page,count:items.length}}),{status:200,headers:{'Content-Type':'application/json'}});}
test('strict tenant config excludes arbitrary URLs, credentials and secret fields',()=>{
 for(const baseUrl of ['http://example.aspro.cloud','https://evil.com','https://example.aspro.cloud.evil.com','https://u:p@example.aspro.cloud','https://example.aspro.cloud:8443','https://example.aspro.cloud/?api_key=oops','https://foo.bar.aspro.cloud'])assert.throws(()=>S.validateConfig({...config,baseUrl}));
 assert.throws(()=>S.validateConfig({...config,apiKey:'secret'}));assert.throws(()=>S.validateConfig({...config,taskUrlTemplate:'//evil.com/{id}'}));assert.throws(()=>S.validateConfig({...config,projectIds:['1']}));assert.equal(S.validateConfig(config).baseUrl,config.baseUrl);
});
test('merge dates, stage, title and completion while preserving local business dependencies',()=>{
 const p=project();p.tasks.push(task('T2',2),task('T3',3));p.tasks[0].dependsOn=['T2','T3'];const result=S.mergeSnapshot(p,[row(1,{status:5,prev_task_id:2}),row(2),row(3)],config);assert.deepEqual(result.tasks[0].dependsOn,['T2','T3']);assert.equal(result.tasks[0].duration,2);assert.equal(result.tasks[0].sourceStart,'2026-09-03');assert.equal(result.tasks[0].sourceEnd,'2026-09-04');assert.equal(result.tasks[0].status,'completed');assert.equal(result.tasks[0].title,'Current');assert.equal(p.tasks[0].title,'Old');
});
test('zero Aspro predecessor does not erase the local graph or infer dates',()=>{const p=project();p.tasks.push(task('T2',2));p.tasks[0].dependsOn=['T2'];const r=S.mergeSnapshot(p,[row(1,{prev_task_id:0,plan_start_date:'0000-00-00 00:00:00',deadline:'2026-09-04 18:00:00'}),row(2)],config);assert.deepEqual(r.tasks[0].dependsOn,['T2']);assert.equal(r.tasks[0].sourceStart,null);assert.equal(r.tasks[0].sourceEnd,'2026-09-04');});
test('new, unmapped, archived and missing tasks are retained with review flags',()=>{
 const p=project();p.tasks.push(task('T2',2));const r=S.mergeSnapshot(p,[row(1,{archive_status:10}),row(3,{project_stage_id:99,prev_task_id:999})],config);
 assert.equal(r.tasks.length,3);assert.equal(r.tasks[0].aspro.syncState,'archived');assert.equal(r.tasks[1].aspro.syncState,'missing');assert.equal(r.tasks[2].duration,null);assert.equal(r.tasks[2].aspro.url,undefined);assert.equal(r.tasks[2].blocker,'Ожидаются вводные; уточните в задаче Aspro');assert.ok(r.syncWarnings.some(s=>s.includes('предшественник')));assert.equal(r.tasks[2].stage,'aspro-review');assert.ok(r.stages.some(s=>s.id==='aspro-review'));
});
test('new URL only from explicitly supplied tenant path and existing URL retained',()=>{
 const r=S.mergeSnapshot(project(),[row(),row(2)],{...config,taskUrlTemplate:'/verified/{id}'});assert.equal(r.tasks[0].aspro.url,'https://example.aspro.cloud/verified/1');assert.equal(r.tasks[1].aspro.url,'https://example.aspro.cloud/verified/2');
});
test('cross-tenant rows, duplicate rows and remote dependency cycles reject whole snapshot',()=>{
 for(const bad of [{model_id:2},{module:'crm'},{model:'lead'}])assert.throws(()=>S.mergeSnapshot(project(),[row(1,bad)],config),/UNAUTHORIZED_RECORD/);
 assert.throws(()=>S.mergeSnapshot(project(),[row(),row()],config),/DUPLICATE/);
 assert.throws(()=>S.mergeSnapshot(project(),[row(1,{prev_task_id:2}),row(2,{prev_task_id:1})],config),/CYCLE/);
});
test('client projection strips internal fields, unknown fields and signed URLs',()=>{
 const p=project();p.secret='PRIVATE';p.tasks[0].password='PRIVATE';p.tasks[0].blocker='PRIVATE INTERNAL BLOCKER';p.syncWarnings=['PRIVATE INTERNAL WARNING'];p.tasks[0].aspro.api_key='PRIVATE';p.tasks[0].aspro.url='https://example.aspro.cloud/task?token=PRIVATE';const serialized=JSON.stringify(S.projectToClient(p));assert.doesNotMatch(serialized,/PRIVATE|INTERNAL/);assert.equal(JSON.parse(serialized).tasks[0].aspro.url,undefined);assert.equal(JSON.parse(serialized).tasks[0].blocker,'Ожидаются вводные; уточните в задаче Aspro');
});
test('sync route survives refresh only as exact same-origin allowlisted path',()=>{const p=project();p.sync.apiKey='PRIVATE';const client=S.mergeSnapshot(p,[row()],config);assert.deepEqual(client.sync,{url:'/api/aspro/snapshot'});p.sync.url='https://evil.example/key';assert.equal(S.projectToClient(p).sync,undefined);assert.throws(()=>S.createBridge({config,apiKey:'SYNTHETIC',project:p,html:'<h1>Static</h1>'}),/SYNC_NOT_CONFIGURED/);});
test('verified group_id selects only its configured field without workflow inference',async()=>{let fields;const chosen={...config,stageField:'group_id',stageMap:{'1:77':'design'}};const a=S.createAdapter({config:chosen,apiKey:'SYNTHETIC',fetchImpl:async url=>{fields=new URL(url).searchParams.get('fields');return response([row(1,{group_id:77})]);}});const r=S.mergeSnapshot(project(),await a.readAll(),chosen);assert.equal(r.tasks[0].aspro.stageId,77);assert.ok(fields.includes('group_id'));assert.ok(!fields.includes('workflow_stage_id'));assert.ok(!fields.includes('project_stage_id'));});
test('adapter uses official pagination, allowlisted fields, server key and 1 request/sec',async()=>{
 let clock=0,calls=[],waits=[];const all=Array.from({length:101},(_,i)=>row(i+1));
 const a=S.createAdapter({config,apiKey:'SYNTHETIC_TEST_KEY',now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;},fetchImpl:async(url,options)=>{const u=new URL(url);calls.push({u,options,at:clock});const pg=Number(u.searchParams.get('page'));return response(pg===1?all.slice(0,100):all.slice(100),101,pg);}});
 const rows=await a.readAll();assert.equal(rows.length,101);assert.equal(calls.length,2);assert.deepEqual(waits,[1000]);assert.equal(calls[0].u.pathname,'/api/v1/module/task/tasks/list');assert.equal(calls[0].u.searchParams.get('api_key'),'SYNTHETIC_TEST_KEY');assert.doesNotMatch(calls[0].u.searchParams.get('fields'),/description|report|responsible|cost/);assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.method,'GET');
});
test('adapter bounds pagination and refuses ignored filters, changing totals and incomplete pages',async()=>{
 for(const bad of [response([row(1,{model_id:2})]),response([],1)]){const a=S.createAdapter({config,apiKey:'SYNTHETIC',fetchImpl:async()=>bad});await assert.rejects(a.readAll());}
 const a=S.createAdapter({config:{...config,maxPages:1},apiKey:'SYNTHETIC',fetchImpl:async()=>response(Array.from({length:100},(_,i)=>row(i+1)),101)});await assert.rejects(a.readAll(),/PAGE_LIMIT/);
 const b=S.createAdapter({config,apiKey:'SYNTHETIC',fetchImpl:async()=>{throw Error('upstream url contains SYNTHETIC');}});await assert.rejects(b.readAll(),e=>e.message==='UPSTREAM_FAILED');
});
test('changing filtered total and oversized response fail closed',async()=>{let clock=0,call=0;const a=S.createAdapter({config,apiKey:'SYNTHETIC',now:()=>clock,sleep:async ms=>{clock+=ms;},fetchImpl:async()=>++call===1?response(Array.from({length:100},(_,i)=>row(i+1)),101):response([row(101)],102,2)});await assert.rejects(a.readAll(),/SNAPSHOT_CHANGED/);const b=S.createAdapter({config,apiKey:'SYNTHETIC',fetchImpl:async()=>new Response('{}',{headers:{'Content-Length':'3000000'}})});await assert.rejects(b.readAll(),/RESPONSE_LIMIT/);});
function get(port,path='/',headers={},method='GET'){return new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port,path,headers,method},res=>{let data='';res.on('data',s=>data+=s);res.on('end',()=>resolve({code:res.statusCode,headers:res.headers,data}));});r.on('error',reject);r.end();});}
test('loopback bridge serves HTML and sanitized snapshot with Host/Origin boundaries and no CORS',async()=>{
 const bridge=S.createBridge({config,apiKey:'SYNTHETIC_TEST_KEY',project:project(),html:'<!doctype html><h1>Local</h1>',fetchImpl:async()=>response([row()])}),address=await bridge.listen();
 try{assert.equal(address.address,'127.0.0.1');assert.equal((await get(address.port)).code,200);
  assert.equal((await get(address.port,'/',{Host:'evil.example'})).code,403);assert.equal((await get(address.port,'/api/aspro/snapshot',{Origin:'https://evil.example'})).code,403);assert.equal((await get(address.port,'/api/aspro/snapshot',{'Sec-Fetch-Site':'cross-site'})).code,403);
  assert.equal((await get(address.port,'/api/aspro/snapshot',{},'POST')).code,405);assert.equal((await get(address.port,'/private.json')).code,404);
  const good=await get(address.port,'/api/aspro/snapshot',{Origin:'http://127.0.0.1:'+address.port});assert.equal(good.code,200);assert.equal(good.headers['access-control-allow-origin'],undefined);assert.equal(good.headers['cache-control'],'no-store');assert.doesNotMatch(good.data,/SYNTHETIC|INTERNAL/);const body=JSON.parse(good.data);assert.equal(body.revision.length,24);assert.ok(body.updatedAt);assert.equal(body.project.tasks[0].sourceEnd,'2026-09-04');
 }finally{await new Promise(r=>bridge.server.close(r));}
});
test('bridge errors never reflect API credentials or raw upstream error',async()=>{
 const bridge=S.createBridge({config,apiKey:'SYNTHETIC_TEST_KEY',project:project(),html:'<h1>Local</h1>',fetchImpl:async()=>{throw Error('SYNTHETIC_TEST_KEY raw secret');}}),address=await bridge.listen();
 try{const result=await get(address.port,'/api/aspro/snapshot');assert.equal(result.code,502);assert.equal(result.data,'{"error":"UPSTREAM_FAILED"}');}finally{await new Promise(r=>bridge.server.close(r));}
});
