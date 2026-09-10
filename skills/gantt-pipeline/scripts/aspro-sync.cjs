#!/usr/bin/env node
'use strict';
// Read-only local bridge. API credentials stay in this process, never in project JSON.
const http=require('node:http'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const FIELDS=['id','name','module','model','model_id','plan_start_date','deadline','status','archive_status','prev_task_id'];
const CLIENT_BLOCKER='Ожидаются вводные; уточните в задаче Aspro';
const MAX_TASKS=500,MAX_BYTES=2*1024*1024;
class SyncError extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new SyncError(code);};
const isInt=n=>Number.isSafeInteger(n)&&n>=0;
function numeric(v,allowZero=false){if(typeof v==='string'&&/^\d+$/.test(v))v=Number(v);if(!isInt(v)||(!allowZero&&v===0))fail('INVALID_RECORD');return v;}
function text(v,max=500){if(typeof v!=='string'||v.length>max)fail('INVALID_PROJECT');return v;}
function iso(v){if(v==null||v===''||/^0000-00-00/.test(v))return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(v))fail('INVALID_DATE');const s=v.slice(0,10),d=new Date(s+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)fail('INVALID_DATE');return s;}
function safeURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search)return null;return u.href;}catch{return null;}}
function validateConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_CONFIG');
 const allowed=new Set(['baseUrl','projectIds','stageMap','stageField','taskUrlTemplate','maxPages','maxTasks','port']);
 if(Object.keys(input).some(k=>!allowed.has(k)))fail('INVALID_CONFIG');
 let u;try{u=new URL(input.baseUrl);}catch{fail('INVALID_CONFIG');}
 if(u.protocol!=='https:'||!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.aspro\.cloud$/i.test(u.hostname)||u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/')fail('INVALID_CONFIG');
 if(!Array.isArray(input.projectIds)||!input.projectIds.length||input.projectIds.length>10||input.projectIds.some(n=>!Number.isSafeInteger(n)||n<1)||new Set(input.projectIds).size!==input.projectIds.length)fail('INVALID_CONFIG');
 if(!input.stageMap||typeof input.stageMap!=='object'||Array.isArray(input.stageMap)||Object.entries(input.stageMap).some(([k,v])=>!/^[1-9]\d*:\d+$/.test(k)||!input.projectIds.includes(Number(k.split(':')[0]))||typeof v!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(v)))fail('INVALID_CONFIG');
 const stageField=input.stageField||'project_stage_id';if(!['project_stage_id','workflow_stage_id','group_id'].includes(stageField))fail('INVALID_CONFIG');
 const maxPages=input.maxPages??5,maxTasks=input.maxTasks??MAX_TASKS,port=input.port??8765;
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>10||!Number.isInteger(maxTasks)||maxTasks<1||maxTasks>MAX_TASKS||!Number.isInteger(port)||port<0||port>65535)fail('INVALID_CONFIG');
 if(input.taskUrlTemplate!=null){const template=input.taskUrlTemplate;if(typeof template!=='string'||!template.startsWith('/')||template.startsWith('//')||template.includes('\\')||(template.match(/\{id\}/g)||[]).length!==1||/[?#]/.test(template))fail('INVALID_CONFIG');const trial=new URL(template.replace('{id}','1'),u);if(trial.origin!==u.origin||!safeURL(trial.href))fail('INVALID_CONFIG');}
 return{baseUrl:u.origin,projectIds:[...input.projectIds],stageMap:{...input.stageMap},stageField,maxPages,maxTasks,port,taskUrlTemplate:input.taskUrlTemplate??null};
}
function projectToClient(project){
 if(!project||project.version!==1||!Array.isArray(project.tasks)||project.tasks.length>MAX_TASKS||!Array.isArray(project.stages)||project.stages.length>50)fail('INVALID_PROJECT');
 const clean={version:1,id:text(project.id,200),name:text(project.name,200),mode:project.mode,sources:[],stages:project.stages.map(s=>({id:text(s.id,64),label:text(s.label,200),color:/^#[0-9a-f]{6}$/i.test(s.color)?s.color:'#77887c',pool:s.pool==null?null:text(s.pool,64)})),settings:{},tasks:[]};
 if(!['website','identity','mobile'].includes(clean.mode))fail('INVALID_PROJECT');
 if(project.sync?.url==='/api/aspro/snapshot')clean.sync={url:'/api/aspro/snapshot'};
 const settings=project.settings||{};clean.settings.start=iso(settings.start);clean.settings.holidays=Array.isArray(settings.holidays)?settings.holidays.map(iso):[];if(clean.settings.holidays.length>500)fail('INVALID_PROJECT');
 for(const field of ['capacities','stageDurations']){clean.settings[field]=Object.create(null);for(const [k,v] of Object.entries(settings[field]||{})){if(!/^[a-z][a-z0-9-]{0,63}$/.test(k)||v!==null&&(!Number.isInteger(v)||v<1||v>(field==='capacities'?20:260)))fail('INVALID_PROJECT');clean.settings[field][k]=v;}}
 clean.settings.preserveSourceDates=settings.preserveSourceDates!==false;clean.settings.overrides=Object.create(null);
 for(const [id,o] of Object.entries(settings.overrides||{})){if(!o||typeof o!=='object')fail('INVALID_PROJECT');const out={};for(const k of ['moveTo','ready'])if(o[k]!=null)out[k]=iso(o[k]);if(o.duration!=null){if(!Number.isInteger(o.duration)||o.duration<0||o.duration>260)fail('INVALID_PROJECT');out.duration=o.duration;}clean.settings.overrides[id]=out;}
 const ids=new Set(),stageIds=new Set(clean.stages.map(s=>s.id));
 for(const t of project.tasks){if(!t||typeof t!=='object'||typeof t.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(t.id)||ids.has(t.id))fail('INVALID_PROJECT');ids.add(t.id);
  if(!stageIds.has(t.stage)||!Array.isArray(t.dependsOn)||t.dependsOn.length>MAX_TASKS||t.dependsOn.some(x=>typeof x!=='string')||!['planned','completed','included'].includes(t.status))fail('INVALID_PROJECT');
  if(t.duration!==null&&(!Number.isInteger(t.duration)||t.duration<0||t.duration>260))fail('INVALID_PROJECT');
  const out={id:t.id,title:text(t.title),stage:t.stage,workstream:typeof t.workstream==='string'?text(t.workstream,500):'',description:'',acceptance:[],sourceRefs:[],dependsOn:[...t.dependsOn],duration:t.duration,sourceStart:iso(t.sourceStart),sourceEnd:iso(t.sourceEnd),notBefore:iso(t.notBefore),blocker:t.blocker?CLIENT_BLOCKER:null,status:t.status,milestone:t.milestone===true,resourceGroup:t.resourceGroup==null?null:text(t.resourceGroup,100),aspro:null};
  if(t.aspro){const a=t.aspro;out.aspro={id:numeric(a.id),projectId:numeric(a.projectId),stageId:numeric(a.stageId,true)};const url=safeURL(a.url);if(url)out.aspro.url=url;if(['active','new','missing','archived'].includes(a.syncState))out.aspro.syncState=a.syncState;if(isInt(a.sourceStatus))out.aspro.sourceStatus=a.sourceStatus;}
  clean.tasks.push(out);
 }
 for(const t of clean.tasks)if(t.dependsOn.some(id=>!ids.has(id)))fail('INVALID_PROJECT');
 return clean;
}
function checkedRows(rows,config){
 if(!Array.isArray(rows)||rows.length>config.maxTasks)fail('ROW_LIMIT');const ids=new Set();
 return rows.map(r=>{if(!r||r.module!=='st'||r.model!=='project')fail('UNAUTHORIZED_RECORD');const projectId=numeric(r.model_id);if(!config.projectIds.includes(projectId))fail('UNAUTHORIZED_RECORD');const id=numeric(r.id);if(ids.has(id))fail('DUPLICATE_REMOTE_ID');ids.add(id);const stageId=numeric(r[config.stageField],true),status=numeric(r.status,true),archive=numeric(r.archive_status,true);if(![0,10].includes(archive)||![1,2,3,4,5].includes(status)||typeof r.name!=='string'||!r.name.trim()||r.name.length>500)fail('INVALID_RECORD');
  return{id,title:r.name,projectId,stageId,status,archived:archive===10,start:iso(r.plan_start_date),end:iso(r.deadline),prev:r.prev_task_id==null?null:numeric(r.prev_task_id,true)};
 });
}
function addBlocker(t,message){if(!t.blocker)t.blocker=message;else if(!t.blocker.includes(message))t.blocker=(t.blocker+'; '+message).slice(0,2000);}
function mergeSnapshot(original,rawRows,inputConfig){
 const config=validateConfig(inputConfig),rows=checkedRows(rawRows,config),project=projectToClient(original),warnings=[],byRemote=new Map(),byId=new Set(project.tasks.map(t=>t.id)),stageIds=new Set(project.stages.map(s=>s.id));
 for(const stage of Object.values(config.stageMap))if(!stageIds.has(stage))fail('UNKNOWN_MAPPED_STAGE');
 for(const t of project.tasks)if(t.aspro){if(byRemote.has(t.aspro.id))fail('DUPLICATE_LOCAL_REMOTE_ID');byRemote.set(t.aspro.id,t);}
 const seen=new Set();for(const r of rows){
  seen.add(r.id);let t=byRemote.get(r.id),fresh=!t;const mapped=config.stageMap[r.projectId+':'+r.stageId];
  if(!t){let id='aspro-'+r.id;while(byId.has(id))id+='-new';if(project.tasks.length>=config.maxTasks)fail('ROW_LIMIT');byId.add(id);
   let stage=mapped;if(!stage){stage='aspro-review';if(!stageIds.has(stage)){project.stages.push({id:stage,label:'Проверить этап Aspro',color:'#8b8b8b',pool:stage});project.settings.capacities[stage]=null;stageIds.add(stage);}}
   t={id,title:r.title,stage,workstream:'',description:'',acceptance:[],sourceRefs:[],dependsOn:[],duration:null,sourceStart:r.start,sourceEnd:r.end,notBefore:null,blocker:'Новая задача Aspro: проверить объём, этап, оценку и зависимости',status:'planned',milestone:false,resourceGroup:null,aspro:{id:r.id,projectId:r.projectId,stageId:r.stageId}};project.tasks.push(t);byRemote.set(r.id,t);warnings.push('Добавлена новая задача '+id+'; необходима проверка.');
   if(config.taskUrlTemplate)t.aspro.url=new URL(config.taskUrlTemplate.replace('{id}',String(r.id)),config.baseUrl).href;
  }else if(!config.projectIds.includes(t.aspro.projectId))fail('UNAUTHORIZED_LOCAL_MATCH');
  t.title=r.title;t.sourceStart=r.start;t.sourceEnd=r.end;if(t.status!=='included')t.status=r.status===5?'completed':'planned';t.aspro={...t.aspro,projectId:r.projectId,stageId:r.stageId,sourceStatus:r.status,syncState:r.archived?'archived':fresh?'new':'active'};
  if(mapped)t.stage=mapped;else{addBlocker(t,'Не сопоставлен этап Aspro');warnings.push(t.id+': этап Aspro не сопоставлен.');}
  if(r.archived){addBlocker(t,'Задача архивирована в Aspro: проверить дальнейшее участие');warnings.push(t.id+': архивная задача сохранена.');}
 }
 for(const t of project.tasks)if(t.aspro&&config.projectIds.includes(t.aspro.projectId)&&!seen.has(t.aspro.id)){t.aspro.syncState='missing';addBlocker(t,'Задача не получена из Aspro: проверить доступ, фильтры или архив');warnings.push(t.id+': не получена из Aspro, сохранена без удаления.');}
 // Aspro exposes one predecessor; local multiple business links are never replaced by that field.
 for(const r of rows){const t=byRemote.get(r.id);if(r.prev){const prev=byRemote.get(r.prev);if(!prev||!seen.has(r.prev)||prev.aspro.syncState==='archived'){addBlocker(t,'Предшественник Aspro недоступен или архивирован');warnings.push(t.id+': предшественник Aspro требует проверки.');}else if(!t.dependsOn.includes(prev.id))t.dependsOn.push(prev.id);}}
 const active=new Set(),done=new Set(),tasks=new Map(project.tasks.map(t=>[t.id,t]));function visit(id){if(active.has(id))fail('DEPENDENCY_CYCLE');if(done.has(id))return;active.add(id);for(const d of tasks.get(id).dependsOn)visit(d);active.delete(id);done.add(id);}for(const t of project.tasks)visit(t.id);
 const client=projectToClient(project);client.syncWarnings=warnings;return client;
}
async function readJSON(response){
 if(!response||response.status!==200||response.redirected)fail('UPSTREAM_FAILED');
 const length=Number(response.headers?.get('content-length')||0);if(length>MAX_BYTES)fail('RESPONSE_LIMIT');
 const reader=response.body?.getReader();if(!reader)fail('UPSTREAM_FORMAT');let bytes=0,parts=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();fail('RESPONSE_LIMIT');}parts.push(Buffer.from(value));}}catch(e){if(e instanceof SyncError)throw e;fail('UPSTREAM_FAILED');}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail('UPSTREAM_FORMAT');}
}
function createAdapter({config:input,apiKey,fetchImpl=globalThis.fetch,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const config=validateConfig(input);if(typeof apiKey!=='string'||!apiKey.trim()||apiKey.length>4096)fail('MISSING_API_KEY');let last=-Infinity,queue=Promise.resolve();
 async function readAll(){const all=[];for(const projectId of config.projectIds){let expected=null,received=0;for(let page=1;;page++){
   if(page>config.maxPages)fail('PAGE_LIMIT');const wait=1000-(now()-last);if(wait>0)await sleep(wait);last=now();
   const u=new URL('/api/v1/module/task/tasks/list',config.baseUrl);for(const [k,v] of Object.entries({api_key:apiKey,limit:100,page,fields:[...FIELDS,config.stageField].join(','),'filter[module]':'st','filter[model]':'project','filter[model_id]':projectId,'filter[archive_status]':'0,10','order_by[asc][]':'id'}))u.searchParams.set(k,String(v));
   let body;try{body=await readJSON(await fetchImpl(u.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}}));}catch(e){if(e instanceof SyncError)throw e;fail('UPSTREAM_FAILED');}
   const r=body?.response;if(!r||!Array.isArray(r.items)||!isInt(r.total_result)||!isInt(r.page)||!isInt(r.count)||r.page!==page||r.count!==r.items.length||r.items.length>100)fail('UPSTREAM_FORMAT');
   if(expected===null)expected=r.total_result;if(r.total_result!==expected)fail('SNAPSHOT_CHANGED');if(expected>config.maxTasks||all.length+r.items.length>config.maxTasks)fail('ROW_LIMIT');
   checkedRows(r.items,config);if(r.items.some(item=>numeric(item.model_id)!==projectId))fail('UNAUTHORIZED_RECORD');
   all.push(...r.items);received+=r.items.length;if(received===expected)break;if(received>expected||r.items.length===0)fail('INCOMPLETE_SNAPSHOT');
  }}checkedRows(all,config);return all;}
 return{config,readAll(){const result=queue.then(readAll);queue=result.catch(()=>{});return result;}};
}
function createBridge({config:input,apiKey,project,html,fetchImpl,now,sleep}){
 if(project?.sync?.url!=='/api/aspro/snapshot')fail('SYNC_NOT_CONFIGURED');
 const config=validateConfig(input),adapter=createAdapter({config:input,apiKey,fetchImpl,now,sleep});let current=projectToClient(project),inflight=null;
 if(typeof html!=='string'||Buffer.byteLength(html)>10*MAX_BYTES||html.includes(apiKey))fail('INVALID_HTML');
 const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"};
 const server=http.createServer(async(req,res)=>{
  for(const [k,v]of Object.entries(security))res.setHeader(k,v);
  const address=server.address(),origin='http://127.0.0.1:'+address.port;const respond=(code,value)=>{res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));};
  if(req.headers.host!=='127.0.0.1:'+address.port||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return respond(403,{error:'LOCAL_ORIGIN_REQUIRED'});
  if(req.method!=='GET')return respond(405,{error:'READ_ONLY'});
  if(req.url==='/'){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(req.url!=='/api/aspro/snapshot')return respond(404,{error:'NOT_FOUND'});
  try{if(!inflight)inflight=(async()=>{const rows=await adapter.readAll(),next=mergeSnapshot(current,rows,input),updatedAt=new Date().toISOString(),serialized=JSON.stringify(next);if(serialized.includes(apiKey))fail('SECRET_IN_PAYLOAD');current=next;return{project:next,revision:crypto.createHash('sha256').update(serialized).digest('hex').slice(0,24),updatedAt};})().finally(()=>{inflight=null;});respond(200,await inflight);}catch(e){const code=e instanceof SyncError?e.code:'SYNC_FAILED';respond(502,{error:code});}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;server.maxHeadersCount=30;
 return{server,listen(){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'127.0.0.1',()=>resolve(server.address()));});}};
}
async function main(){
 const args=process.argv.slice(2);if(args.length!==3)fail('USAGE_CONFIG_PROJECT_HTML');
 const [configText,projectText,html]=await Promise.all(args.map(p=>fs.readFile(p,'utf8')));const bridge=createBridge({config:JSON.parse(configText),project:JSON.parse(projectText),html,apiKey:process.env.ASPRO_API_KEY});const address=await bridge.listen();process.stdout.write('Read-only Gantt bridge: http://127.0.0.1:'+address.port+'\n');
}
if(require.main===module)main().catch(e=>{process.stderr.write('Aspro bridge: '+(e instanceof SyncError?e.code:'START_FAILED')+'\n');process.exitCode=1;});
module.exports={SyncError,FIELDS,validateConfig,projectToClient,mergeSnapshot,createAdapter,createBridge};
