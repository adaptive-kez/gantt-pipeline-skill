const test=require('node:test');
const assert=require('node:assert/strict');
const {validate,calculate,calendar}=require('../assets/scheduler.js');
const task=(id,stage,dependsOn=[],extra={})=>({id,title:id,stage,dependsOn,duration:2,sourceStart:null,sourceEnd:null,notBefore:null,blocker:null,status:'planned',milestone:false,resourceGroup:null,...extra});
function project(tasks,settings={}){return {version:1,id:'demo',name:'Example project',mode:'website',stages:[{id:'design',label:'Design',pool:'design',color:'#8899aa'},{id:'qa',label:'QA',pool:'qa',color:'#77aaaa'},{id:'front',label:'Frontend',pool:'front',color:'#999999'},{id:'back',label:'Backend',pool:'back',color:'#888888'},{id:'verify',label:'Implementation QA',pool:'qa',color:'#77aaaa'},{id:'gate',label:'Readiness',pool:null,color:'#777777'}],settings:{start:'2027-03-01',holidays:[],capacities:{design:1,qa:1,front:1,back:1},stageDurations:{},preserveSourceDates:true,overrides:{},...settings},tasks};}
const get=(r,id)=>r.tasks.find(t=>t.id===id);
test('dependencies and explicit readiness milestones use distinct day boundaries',()=>{
 const p=project([task('gate','gate',[],{duration:0,milestone:true,sourceEnd:'2027-03-03'}),task('d','design',['gate']),task('q','qa',['d'],{duration:1})]);
 assert.deepEqual(validate(p),[]);const r=calculate(p);assert.equal(get(r,'gate').start,'2027-03-03');assert.equal(get(r,'d').start,'2027-03-03');assert.equal(get(r,'d').end,'2027-03-04');assert.equal(get(r,'q').start,'2027-03-05');assert.equal(r.complete,true);
});
test('parallel resource capacity shortens an explicit backend batch without starting it early',()=>{
 const p=project([task('a','front'),task('b','front'),task('batch','back',['a','b'])]);const one=calculate(p),two=calculate(p,{capacities:{front:2}});
 assert.equal(get(one,'b').start,'2027-03-03');assert.equal(get(two,'b').start,'2027-03-01');assert.ok(two.finish<one.finish);assert.ok(get(two,'batch').start>get(two,'a').end);
});
test('unknown duration, capacity and start remain unplanned',()=>{
 assert.match(get(calculate(project([task('t','design',[],{duration:null})])),'t').blocked,/Длительность/);
 assert.match(get(calculate(project([task('t','design')],{capacities:{design:null}})),'t').blocked,/потоков/);
 assert.match(get(calculate(project([task('t','design')],{start:null})),'t').blocked,/Дата/);
 const r=calculate(project([task('t','design',[],{duration:null,sourceEnd:'2027-02-26'})]));assert.equal(r.finish,null);assert.equal(get(r,'t').start,null);assert.equal(get(r,'t').totalFloat,null);
});
test('ready clears only own blocker, and moveTo cannot bypass an unmet predecessor',()=>{
 const p=project([task('a','design',[],{blocker:'Brief missing'}),task('b','front',['a'],{blocker:'Assets missing'}),task('c','back',['b'])]);
 const locked=calculate(p,{overrides:{b:{ready:'2027-03-02',moveTo:'2027-03-02'}}});assert.ok(get(locked,'b').blocked);assert.equal(get(locked,'c').end,null);
 const open=calculate(p,{overrides:{a:{ready:'2027-03-02'},b:{ready:'2027-03-02'}}});assert.equal(open.complete,true);assert.ok(get(open,'b').start>get(open,'a').end);
});
test('source intervals remain immutable under resource and predecessor conflicts',()=>{
 const p=project([task('a','design',[],{sourceStart:'2027-03-01',sourceEnd:'2027-03-05'}),task('b','design',['a'],{sourceStart:'2027-03-02',sourceEnd:'2027-03-04'})]);const before=JSON.stringify(p),r=calculate(p);
 assert.equal(get(r,'b').start,'2027-03-02');assert.ok(get(r,'b').conflicts.some(s=>s.includes('раньше готовности')));assert.equal(r.complete,false);assert.equal(get(r,'a').totalFloat,null);assert.equal(JSON.stringify(p),before);
 const capacity=calculate(project([task('a','design',[],{sourceStart:'2027-03-01',sourceEnd:'2027-03-03'}),task('b','design',[],{sourceStart:'2027-03-01',sourceEnd:'2027-03-03'})]));assert.equal(capacity.resourceOrderValid,false);assert.equal(get(capacity,'a').totalFloat,null);
});
test('complete source interval is preserved with unknown pool, never certified feasible',()=>{
 const p=project([task('a','design',[],{duration:null,sourceStart:'2027-03-01',sourceEnd:'2027-03-03'})],{capacities:{design:null}});const r=calculate(p);
 assert.equal(get(r,'a').end,'2027-03-03');assert.equal(get(r,'a').duration,3);assert.equal(r.complete,false);assert.equal(r.resourceOrderValid,false);assert.equal(get(r,'a').freeFloat,null);
});
test('resourceGroup counts once and retains all rows; incompatible packages fail validation',()=>{
 const p=project([task('a','design',[],{resourceGroup:'package'}),task('b','design',[],{resourceGroup:'package'}),task('c','design')]);const r=calculate(p);
 assert.equal(r.tasks.length,3);assert.equal(get(r,'a').start,get(r,'b').start);assert.equal(get(r,'a').end,get(r,'b').end);assert.equal(get(r,'c').start,'2027-03-03');
 const bad=structuredClone(p);bad.tasks[1].duration=3;assert.ok(validate(bad).some(s=>s.includes('resourceGroup')));
 const moved=calculate(p,{overrides:{b:{moveTo:'2027-03-08'}}});assert.equal(get(moved,'a').start,'2027-03-08');assert.equal(get(moved,'b').start,'2027-03-08');assert.equal(get(moved,'c').start,'2027-03-01');
});
test('drag moves source task left and preserves interval duration; future move leaves free slots',()=>{
 const p=project([task('a','design',[],{duration:null,sourceStart:'2027-03-08',sourceEnd:'2027-03-11'}),task('q','qa',['a'],{duration:1})]);const r=calculate(p,{overrides:{a:{moveTo:'2027-03-01'}}});assert.equal(get(r,'a').duration,4);assert.equal(get(r,'a').end,'2027-03-04');assert.equal(get(r,'q').start,'2027-03-05');
 const shifted=calculate(project([task('a','front'),task('b','front'),task('batch','back',['a','b'])]),{overrides:{a:{moveTo:'2027-03-15'}}});assert.equal(get(shifted,'b').start,'2027-03-01');assert.ok(get(shifted,'batch').start>get(shifted,'a').end);
});
test('shared QA stages cannot overlap and calendar holidays come only from input',()=>{
 const p=project([task('a','qa'),task('b','verify')],{holidays:['2027-03-02']});const r=calculate(p);assert.equal(get(r,'a').end,'2027-03-03');assert.equal(get(r,'b').start,'2027-03-04');
 assert.equal(calendar([]).isWorkday('2027-11-04'),true);
});
test('critical path exposes real float and resource edges; a free-float move preserves finish',()=>{
 const p=project([task('a','front',[],{duration:4}),task('b','front',[],{duration:2}),task('long','back',['a'],{duration:4}),task('short','back',['b'],{duration:1})],{capacities:{front:2,back:2}});const r=calculate(p);
 assert.equal(get(r,'a').totalFloat,0);assert.equal(get(r,'long').critical,true);assert.ok(get(r,'short').freeFloat>0);const t=get(r,'short');let move=t.start;for(let i=0;i<t.freeFloat;i++)move=calendar().nextWorkday(move);const later=calculate(p,{overrides:{short:{moveTo:move}}});assert.equal(later.finish,r.finish);
 const serial=calculate(project([task('a','front'),task('b','front')]));assert.ok(serial.criticalEdges.some(e=>e.from==='a'&&e.to==='b'&&e.resource));
});
test('completed dated task satisfies dependency without consuming future capacity; included cannot be a predecessor',()=>{
 const p=project([task('a','front',[],{status:'completed',sourceEnd:'2027-03-01'}),task('b','front',['a'])]);const r=calculate(p);assert.equal(get(r,'b').start,'2027-03-02');assert.equal(get(r,'a').critical,false);
 p.tasks[0].status='included';assert.ok(validate(p).some(s=>s.includes('Включённая')));
});
test('validation rejects cycles, malformed dates, group overrides and unbounded inputs',()=>{
 const p=project([task('a','front',['b']),task('b','front',['a'])]);assert.ok(validate(p).some(s=>s.includes('цикл')));
 assert.ok(validate(project([task('a','front')],{start:'2027-02-30'})).length);assert.throws(()=>calculate(project([task('a','front')]),{capacities:{front:21}}));
 const malformed=project([task('a','front')]);malformed.tasks[0].dependsOn=123;assert.ok(validate(malformed).length);
 assert.ok(validate(project([task('a','front',[],{sourceStart:'2020-01-01',sourceEnd:'2020-01-02'})])).some(s=>s.includes('пять')));
 const long=project(Array.from({length:501},(_,i)=>task('t'+i,'design')));assert.ok(validate(long).length);
});
test('preserved package interval governs drag duration even when estimates differ from elapsed source days',()=>{
 const p=project([task('a','design',[],{resourceGroup:'g',sourceStart:'2027-03-08',sourceEnd:'2027-03-11'}),task('b','design',[],{resourceGroup:'g',sourceStart:'2027-03-08',sourceEnd:'2027-03-11'})]);const r=calculate(p,{overrides:{b:{moveTo:'2027-03-01'}}});assert.equal(get(r,'a').duration,4);assert.equal(get(r,'b').end,'2027-03-04');
 const unknown=calculate(p,{capacities:{design:null}});assert.ok(unknown.tasks.every(t=>t.conflicts.length&&t.totalFloat===null));
});
test('stage labels/colors and settings maps reject malformed or injectable input',()=>{
 const p=project([task('a','front')]);p.stages[0].color='red;background:url(x)';assert.ok(validate(p).some(s=>s.includes('Цвет')));
 p.stages[0].color='#aabbcc';p.stages[0].label=' ';assert.ok(validate(p).some(s=>s.includes('название этапа')));
 for(const key of ['capacities','stageDurations','overrides'])for(const bad of [null,[],7,'text']){assert.ok(validate(project([task('a','front')],{[key]:bad})).length);assert.throws(()=>calculate(project([task('a','front')]),{[key]:bad}));}
});
test('ASCII IDs matching Object property names do not supply phantom capacity or duration',()=>{
 const p=project([task('constructor','front',[],{duration:null})]);p.stages.find(s=>s.id==='front').pool='constructor';let r=calculate(p);assert.equal(get(r,'constructor').end,null);
 p.tasks[0].duration=2;r=calculate(p);assert.match(get(r,'constructor').blocked,/потоков/);
});
test('portable website example is complete and every free-float move keeps the finish',()=>{
 const fs=require('node:fs'),path=require('node:path');const p=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/website-project.json'),'utf8'));const r=calculate(p);
 assert.deepEqual(validate(p),[]);assert.equal(r.tasks.length,13);assert.equal(r.complete,true);assert.equal(r.resourceOrderValid,true);assert.equal(r.finish,'2027-03-22');
 for(const t of r.tasks.filter(t=>t.freeFloat>0&&t.duration>0)){
   let move=t.start;for(let i=0;i<t.freeFloat;i++)move=calendar(r.config.holidays).nextWorkday(move);
   const overrides={...r.config.overrides};for(const x of p.tasks.filter(x=>x.id===t.id||(t.resourceGroup&&x.resourceGroup===t.resourceGroup)))overrides[x.id]={...(overrides[x.id]||{}),moveTo:move,duration:t.duration};
   assert.equal(calculate(p,{overrides}).finish,r.finish,'Free float should preserve finish for '+t.id);
 }
});
