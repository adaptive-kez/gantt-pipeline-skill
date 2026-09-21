const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../assets/scheduler.js'),UI=require('../assets/app.js'),P=require('../scripts/pipeline.cjs'),I=require('../scripts/import-estimate.cjs');
const base=require('../examples/hourly-project.json');
const fixture=()=>structuredClone(base),get=(r,id='D1')=>r.tasks.find(t=>t.id===id);
test('RF2026 has 247 workdays, 1972 hours and four shortened days; transfers and custom working weekend',()=>{
 const c=E.calendar({calendar:'ru-2026'});let days=0,hours=0,short=0;
 for(let d=new Date('2026-01-01T12:00Z');d.getUTCFullYear()===2026;d.setUTCDate(d.getUTCDate()+1)){const h=c.hours(d.toISOString().slice(0,10));days+=h>0;hours+=h;short+=h===7;}
 assert.deepEqual([days,hours,short],[247,1972,4]);for(const d of ['2026-01-09','2026-03-09','2026-05-11','2026-12-31'])assert.equal(c.hours(d),0);
 assert.equal(c.hours('2026-11-03'),7);assert.equal(E.calendar({calendar:'ru-2026',dayHours:{'2026-11-07':8}}).hours('2026-11-07'),8);
});
test('34 hours at 4h/day include short day and holiday; extra staff only accelerate explicitly divisible work',()=>{
 const p=fixture(),r=E.calculate(p);assert.equal(get(r).end,'2026-11-13');assert.equal(get(r).duration,9);assert.equal(r.complete,true);
 const two=E.calculate(p,{capacities:{design:2}});assert.equal(get(two).duration,5);assert.equal(get(two).end,'2026-11-09');assert.equal(get(two,'D2').start,'2026-11-10');
 p.tasks[0].parallelism=1;const separate=E.calculate(p,{capacities:{design:2}});assert.equal(get(separate).duration,9);assert.equal(get(separate,'D2').start,'2026-11-02');
});
test('hours/day and explicit short-day allocation policy both affect the result',()=>{
 const p=fixture();assert.equal(get(E.calculate(p,{resources:{design:{hoursPerDay:8}}})).duration,5);
 p.tasks[0].estimateHours=8;assert.equal(get(E.calculate(p)).end,'2026-11-05');
 assert.equal(get(E.calculate(p,{resources:{design:{hoursPerDay:4,shortDayPolicy:'cap'}}})).end,'2026-11-03');
});
test('missing hours/capacity and unsupported year stay unplanned; malformed estimates fail',()=>{
 const p=fixture();p.settings.resources.design.hoursPerDay=null;assert.match(get(E.calculate(p)).blocked,/часы/);
 p.settings.resources.design.hoursPerDay=4;p.settings.capacities.design=null;assert.match(get(E.calculate(p)).blocked,/потоков/);
 p.settings.capacities.design=1;p.settings.start='2027-01-04';assert.match(get(E.calculate(p)).blocked,/не подтверждён/);
 p.tasks[0].estimateHours=-1;assert(E.validate(p).some(x=>x.includes('часах')));
});
test('manual start and duration cascade, preserve input and moving hourly work does not freeze days',()=>{
 const p=fixture(),snapshot=JSON.stringify(p),r=E.calculate(p),o=UI.moves(p,p.settings,get(r),'2026-11-16');assert.equal(o.D1.duration,undefined);
 const shifted=E.calculate(p,{overrides:o});assert.equal(get(shifted).start,'2026-11-16');assert(get(shifted,'A1').start>get(shifted,'D2').end);assert(shifted.finish>r.finish);assert.equal(JSON.stringify(p),snapshot);
 const edited=E.calculate(p,{overrides:{D1:{moveTo:'2026-11-02',duration:2}}});assert.equal(get(edited).end,'2026-11-03');assert.equal(get(edited).scheduleBasis,'days');assert(edited.finish<r.finish);
 assert.equal(get(E.calculate(p)).scheduleBasis,'hours');
});
test('hourly group allocates once, and weighted resource capacity cannot overlap',()=>{
 const p=fixture();p.tasks[0].resourceGroup='one';const row={...structuredClone(p.tasks[0]),id:'D0',title:'Same package row'};p.tasks.push(row);
 const r=E.calculate(p);assert.equal(get(r,'D0').end,get(r).end);assert.equal(get(r,'D2').start,'2026-11-16');
 const two=E.calculate(p,{capacities:{design:2}});assert.equal(get(two,'D2').start,'2026-11-10');assert.equal(get(two,'D0').workers,2);
});
test('CSV import matches IDs or unique page-stage pairs and never invents missing estimates',()=>{
 const p=fixture();const q=I.importEstimate(p,'страница;этап;часы\nГлавная;Дизайн;12,5',null);assert.equal(q.tasks[0].estimateHours,12.5);assert.equal(p.tasks[0].estimateHours,34);
 assert.throws(()=>I.importEstimate(p,'id,hours\nD1,3\nD1,4',null),/Повторная/);
 assert.throws(()=>I.importEstimate(p,'id,hours\nBAD,3',null),/не сопоставлена/);
 assert.throws(()=>I.importEstimate(p,'id,hours\nD1,-1',null),/часы/);
 const unknown=I.importEstimate(p,'id,hours\nD1,',null);assert.equal(unknown.tasks[0].estimateHours,null);assert.equal(get(E.calculate(unknown)).start,null);
 const team=I.importEstimate(p,null,{roles:[{pool:'design',role:'Дизайнер',count:2,hoursPerDay:6}]});assert.equal(team.settings.resources.design.hoursPerDay,6);assert.equal(team.settings.capacities.design,2);P.assertProject(team);
});
test('client projection retains planning data without internal brief; demo builds as a genuine preview',()=>{
 const p=fixture(),client=P.publicProject(p);assert.equal(client.settings.calendar,'ru-2026');assert.equal(client.settings.resources.design.hoursPerDay,4);assert.equal(client.tasks[0].estimateHours,34);assert.equal(client.tasks[0].parallelism,'all');assert.deepEqual(client.sources,[]);
 const html=P.build(p,null,{preview:true});assert(html.includes('ЧЕРНОВИК'));assert(html.includes('taskEnd'));assert(!html.includes('Вымышленное учебное ТЗ'));
});
test('clearing initial manual duration and calendar exceptions actually restores hourly calculation',()=>{
 const p=fixture();p.settings.overrides={D1:{duration:2}};p.settings.dayHours={'2026-11-03':0};
 assert.equal(get(E.calculate(p)).duration,2);const r=E.calculate(p,{overrides:{},dayHours:{}});assert.equal(get(r).duration,9);assert.equal(get(r).scheduleBasis,'hours');assert.equal(r.config.dayHours['2026-11-03'],undefined);
});
test('blank imported estimate clears a legacy day estimate; offline blockers do not refer to nonexistent Aspro',()=>{
 const p=fixture();p.tasks[0].duration=4;const q=I.importEstimate(p,'id,hours\nD1,',null);assert.equal(q.tasks[0].duration,null);assert.equal(get(E.calculate(q)).start,null);
 p.tasks[0].blocker='Private input';assert.match(P.publicProject(p).tasks[0].blocker,/проджект-менеджера/);assert(!P.publicProject(p).tasks[0].blocker.includes('Private'));
});
test('resource queue reaching next year reports missing calendar, not a false five-year overflow',()=>{
 const p=fixture();p.tasks=p.tasks.slice(0,2);p.settings.start='2026-12-29';p.tasks[0].estimateHours=8;p.tasks[1].estimateHours=8;const r=E.calculate(p);assert.equal(get(r).end,'2026-12-30');assert.match(get(r,'D2').blocked,/не подтверждён.*2027/);
});
