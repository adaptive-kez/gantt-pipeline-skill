(function(root,factory){
  const engine=factory();
  if(typeof module==='object'&&module.exports)module.exports=engine;
  if(root)root.GanttEngine=engine;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const DAY=86400000,MAX_DAYS=366*5;
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
  const dateOK=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
  const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
  const max=(...dates)=>dates.filter(Boolean).sort().pop()||null;
  const integer=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;
  const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const slug=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(v);
  function settingsShapeErrors(settings,label){
    if(settings===undefined)return [];
    if(!record(settings))return [label+' должен быть объектом'];
    return ['capacities','stageDurations','overrides'].filter(k=>own(settings,k)&&!record(settings[k])).map(k=>label+'.'+k+' должен быть объектом');
  }
  function calendar(holidays=[]){
    const off=new Set(holidays);
    function isWorkday(d){const n=new Date(d+'T12:00:00Z').getUTCDay();return n!==0&&n!==6&&!off.has(d);}
    function on(d){for(let i=0;i<=MAX_DAYS;i++,d=shift(d,1))if(isWorkday(d))return d;throw Error('Нет рабочих дней в пределах пяти лет');}
    function nextWorkday(d){return on(shift(d,1));}
    function end(d,n){for(let i=1;i<n;i++)d=nextWorkday(d);return d;}
    function span(a,b){if(!a||!b)return null;let n=0;for(let d=a;d<=b;d=shift(d,1))if(isWorkday(d))n++;return n;}
    return {isWorkday,nextWorkday,end,span,on};
  }
  function mergedSettings(project,overrides={}){
    const base=project.settings||{};
    return {...base,...overrides,
      capacities:Object.assign(Object.create(null),base.capacities||{},overrides.capacities||{}),
      stageDurations:Object.assign(Object.create(null),base.stageDurations||{},overrides.stageDurations||{}),
      overrides:Object.assign(Object.create(null),base.overrides||{},overrides.overrides||{}),
      holidays:overrides.holidays??base.holidays??[],
      preserveSourceDates:overrides.preserveSourceDates??base.preserveSourceDates??true};
  }
  function taskDuration(t,cfg,cal){
    if(t.milestone)return 0;
    const override=cfg.overrides?.[t.id]||{};
    if(own(override,'duration'))return override.duration;
    if((override.moveTo||cfg.preserveSourceDates)&&t.sourceStart&&t.sourceEnd)return cal.span(t.sourceStart,t.sourceEnd);
    return t.duration??cfg.stageDurations?.[t.stage]??(t.sourceStart&&t.sourceEnd?cal.span(t.sourceStart,t.sourceEnd):null);
  }
  function validate(project){
    const errors=[],dates=[];const err=s=>errors.push(s);
    if(!record(project))return ['Проект должен быть объектом'];
    if(project.version!==1)err('Поддерживается project.version = 1');
    if(!slug(project.id))err('Некорректный project.id');
    if(typeof project.name!=='string'||!project.name.trim())err('Нужно название проекта');
    if(!['website','identity','mobile'].includes(project.mode))err('Неизвестный режим проекта');
    if(!Array.isArray(project.stages)||!project.stages.length)err('Нужны этапы проекта');
    if(!Array.isArray(project.tasks)||!project.tasks.length||project.tasks.length>500)err('Нужно от 1 до 500 задач');
    errors.push(...settingsShapeErrors(project.settings,'settings'));
    if(errors.length)return errors;
    const cfg=mergedSettings(project),stages=new Map(),by=new Map();
    function checkDate(d,label){if(d===null||d===undefined)return;if(!dateOK(d))err(label+': нужна дата YYYY-MM-DD');else dates.push(d);}
    checkDate(cfg.start,'settings.start');
    if(!Array.isArray(cfg.holidays))err('holidays должен быть массивом');else cfg.holidays.forEach((d,i)=>checkDate(d,'holidays['+i+']'));
    if(typeof cfg.preserveSourceDates!=='boolean')err('preserveSourceDates должен быть boolean');
    for(const s of project.stages){
      if(!record(s)||!slug(s.id)){err('Некорректный этап');continue;}
      if(stages.has(s.id))err('Повторный этап '+s.id);stages.set(s.id,s);
      if(typeof s.label!=='string'||!s.label.trim())err('Нужно название этапа '+s.id);
      if(typeof s.color!=='string'||!/^#[0-9a-f]{6}$/i.test(s.color))err('Цвет этапа '+s.id+': нужен формат #RRGGBB');
      if(s.pool!==null&&s.pool!==undefined&&!slug(s.pool))err('Некорректный pool этапа '+s.id);
    }
    for(const [key,n] of Object.entries(cfg.capacities))if(n!==null&&!integer(n,1,20))err('Ёмкость '+key+': целое 1–20 или null');
    for(const [key,n] of Object.entries(cfg.stageDurations))if(n!==null&&!integer(n,1,260))err('Длительность этапа '+key+': целое 1–260 или null');
    for(const t of project.tasks){
      if(!record(t)||!slug(t.id)){err('Некорректный ID задачи');continue;}
      if(by.has(t.id))err('Повторный ID задачи '+t.id);by.set(t.id,t);
      if(!stages.has(t.stage))err('Неизвестный этап задачи '+t.id);
      if(typeof t.title!=='string'||!t.title.trim())err('Нужно название задачи '+t.id);
      if(t.milestone!==undefined&&typeof t.milestone!=='boolean')err('milestone должен быть boolean: '+t.id);
      if(t.blocker!==null&&t.blocker!==undefined&&typeof t.blocker!=='string')err('blocker должен быть строкой или null: '+t.id);
      if(!Array.isArray(t.dependsOn)||t.dependsOn.some(d=>!slug(d)))err('dependsOn должен быть массивом ID: '+t.id);
      else if(new Set(t.dependsOn).size!==t.dependsOn.length)err('Повторная зависимость '+t.id);
      if(!['planned','completed','included'].includes(t.status||'planned'))err('Неизвестный статус '+t.id);
      if(t.milestone&&t.duration!==0)err('Веха '+t.id+' должна иметь duration:0');
      else if(!t.milestone&&t.duration!==null&&t.duration!==undefined&&!integer(t.duration,1,260))err('Длительность '+t.id+': целое 1–260 или null');
      if(t.resourceGroup!==null&&t.resourceGroup!==undefined&&!slug(t.resourceGroup))err('Некорректный resourceGroup '+t.id);
      for(const k of ['sourceStart','sourceEnd','notBefore'])checkDate(t[k],t.id+'.'+k);
      if(t.sourceStart&&!t.sourceEnd)err('У sourceStart должен быть sourceEnd: '+t.id);
      if(dateOK(t.sourceStart)&&dateOK(t.sourceEnd)&&t.sourceEnd<t.sourceStart)err('Окончание раньше начала: '+t.id);
      if(t.milestone&&t.sourceStart&&t.sourceEnd&&t.sourceStart!==t.sourceEnd)err('Интервал вехи должен быть одним днём: '+t.id);
    }
    for(const [id,o] of Object.entries(cfg.overrides)){
      if(!by.has(id))err('Изменение неизвестной задачи '+id);
      if(!record(o)){err('Некорректное изменение '+id);continue;}
      for(const k of Object.keys(o))if(!['moveTo','duration','ready'].includes(k))err('Неизвестное поле изменения '+id+'.'+k);
      for(const k of ['moveTo','ready'])checkDate(o[k],id+'.'+k);
      if(own(o,'duration')&&!integer(o.duration,by.get(id)?.milestone?0:1,by.get(id)?.milestone?0:260))err('Некорректная override.duration '+id);
    }
    if(errors.length)return errors;
    for(const t of by.values())for(const id of t.dependsOn){
      if(!by.has(id))err('Не найдена зависимость '+id+' задачи '+t.id);
      if(id===t.id)err('Задача зависит от себя: '+id);
      if(by.get(id)?.status==='included')err('Включённая задача не может быть предшественником: '+id);
    }
    if(errors.length)return errors;
    const cal=calendar(cfg.holidays),groups=new Map();
    for(const t of by.values())if(t.resourceGroup){const list=groups.get(t.resourceGroup)||[];list.push(t);groups.set(t.resourceGroup,list);}
    for(const [id,members] of groups){
      const signature=t=>JSON.stringify([t.stage,stages.get(t.stage).pool||null,[...t.dependsOn].sort(),taskDuration(t,cfg,cal),!!t.milestone,t.status||'planned',cfg.preserveSourceDates?[t.sourceStart||null,t.sourceEnd||null]:null]);
      if(new Set(members.map(signature)).size!==1)err('Несовместимые этапы, зависимости, длительности или исходные интервалы resourceGroup '+id);
      const moves=new Set(members.map(t=>cfg.overrides[t.id]?.moveTo).filter(Boolean));if(moves.size>1)err('Разные moveTo внутри resourceGroup '+id);
    }
    const indegree=new Map([...by.values()].map(t=>[t.id,t.dependsOn.length])),queue=[...by.keys()].filter(id=>!indegree.get(id));let visited=0;
    while(queue.length){const id=queue.shift();visited++;for(const t of by.values())if(t.dependsOn.includes(id)){indegree.set(t.id,indegree.get(t.id)-1);if(!indegree.get(t.id))queue.push(t.id);}}
    if(visited!==by.size)err('Обнаружен цикл зависимостей');
    if(dates.length&&(Date.parse(dates.sort().at(-1))-Date.parse(dates[0]))/DAY>MAX_DAYS)err('Диапазон дат превышает пять лет');
    return errors;
  }
  function calculate(project,configOverrides={}){
    if(!record(configOverrides))throw Error('Настройки должны быть объектом');
    if(!record(project))throw Error('Проект должен быть объектом');
    const shapeErrors=[...settingsShapeErrors(project.settings,'settings'),...settingsShapeErrors(configOverrides,'configOverrides')];
    if(shapeErrors.length)throw Error(shapeErrors.join('\n'));
    const config=mergedSettings(project,configOverrides),errors=validate({...project,settings:config});
    if(errors.length)throw Error(errors.join('\n'));
    const cal=calendar(config.holidays),warnings=[],stages=new Map(project.stages.map(s=>[s.id,s])),original=new Map(project.tasks.map(t=>[t.id,t]));
    const tasks=project.tasks.map(t=>({...t,dependsOn:[...t.dependsOn],start:null,end:null,duration:null,blocked:null,critical:false,totalFloat:null,freeFloat:null,conflicts:[]}));
    const by=new Map(tasks.map(t=>[t.id,t])),units=[],unitBy=new Map(),groupBy=new Map();
    for(const t of tasks){
      const key=t.resourceGroup?'group:'+t.resourceGroup:'task:'+t.id;let u=groupBy.get(key);
      if(!u){u={id:t.id,members:[],pool:stages.get(t.stage).pool||null};groupBy.set(key,u);units.push(u);}
      u.members.push(t);unitBy.set(t.id,u);
    }
    const options=u=>u.members.map(t=>config.overrides[t.id]||{});
    function sourceInterval(u){
      const t=original.get(u.id),o=options(u);
      if(!config.preserveSourceDates||o.some(v=>v.moveTo||own(v,'duration')||v.ready))return null;
      if(t.sourceStart&&t.sourceEnd)return {start:t.sourceStart,end:t.sourceEnd};
      if(t.milestone&&t.sourceEnd)return {start:t.sourceEnd,end:t.sourceEnd};
      return null;
    }
    function ownBlock(u){return u.members.map(t=>t.blocker&&!config.overrides[t.id]?.ready?t.blocker:null).filter(Boolean).join('; ')||null;}
    function doneStatus(u){return ['completed','included'].includes(original.get(u.id).status);}
    const allDates=[config.start,...tasks.flatMap(t=>[t.sourceStart,t.sourceEnd,t.notBefore]),...Object.values(config.overrides).flatMap(o=>[o.moveTo,o.ready])].filter(Boolean).sort();
    const first=allDates[0]||null,horizon=first?shift(first,MAX_DAYS):null;
    const allocations=[],fixed=[];
    for(const u of units){const interval=sourceInterval(u);if(interval&&!doneStatus(u)&&!ownBlock(u)&&!original.get(u.id).milestone&&u.pool)fixed.push({id:u.id,pool:u.pool,...interval});}
    function resourceStart(u,a,n){
      if(!u.pool||n===0)return a;
      const cap=config.capacities[u.pool];if(!cap)return null;
      const occupied=[...fixed,...allocations].filter(r=>r.pool===u.pool&&r.id!==u.id);
      for(;a<=horizon;a=cal.nextWorkday(a)){
        const b=cal.end(a,n);if(b>horizon)return null;
        let fits=true;for(let d=a;d<=b;d=cal.nextWorkday(d))if(occupied.filter(r=>r.start<=d&&r.end>=d).length>=cap){fits=false;break;}
        if(fits)return a;
      }return null;
    }
    const pending=new Set(units),finished=new Set();
    function readiness(u){
      let date=max(config.start,...u.members.map(t=>t.notBefore),...options(u).flatMap(o=>[o.ready,o.moveTo])),block=ownBlock(u);
      for(const t of u.members)for(const id of t.dependsOn){
        const v=unitBy.get(id);if(!finished.has(v))return {waiting:true};
        const d=by.get(id);if(d.blocked||!d.end)block=block||'Ожидает '+id+': '+(d.blocked||'готовность не подтверждена');
        else date=max(date,d.milestone?d.end:cal.nextWorkday(d.end));
      }return {date:date?cal.on(date):null,block};
    }
    function assign(u,data){u.members.forEach(t=>Object.assign(t,data));}
    function execute(u,ready){
      const s=original.get(u.id),interval=sourceInterval(u),over=options(u),move=max(...over.map(o=>o.moveTo));
      if(doneStatus(u)){
        if(s.status==='completed')assign(u,{start:s.sourceStart||null,end:s.sourceEnd||null,duration:s.milestone?0:s.duration??null});
        if(move)warnings.push('Строка '+u.id+' завершена или включена в другую работу; перенос проигнорирован');return;
      }
      if(ownBlock(u)){assign(u,{blocked:ownBlock(u)});return;}
      if(interval){
        const conflicts=[];
        if(ready.block)conflicts.push(ready.block);
        for(const t of u.members)for(const id of t.dependsOn){const d=by.get(id);if(d.end&&interval.start<(d.milestone?d.end:cal.nextWorkday(d.end)))conflicts.push('Исходный интервал начинается раньше готовности '+id);}
        if(u.members.some(t=>t.notBefore&&interval.start<t.notBefore))conflicts.push('Исходное начало раньше notBefore');
        if(!cal.isWorkday(interval.start)||!cal.isWorkday(interval.end))conflicts.push('Граница исходного интервала попадает на нерабочий день');
        assign(u,{...interval,duration:s.milestone?0:cal.span(interval.start,interval.end),conflicts:[...new Set(conflicts)],blocked:ready.block||null});
        return;
      }
      if(ready.block){assign(u,{blocked:ready.block});return;}
      const n=taskDuration(s,config,cal);
      if(n===null){assign(u,{blocked:'Длительность не оценена'});return;}
      if(!ready.date){assign(u,{blocked:'Дата начала или готовности не задана'});return;}
      if(u.pool&&n>0&&!config.capacities[u.pool]){assign(u,{blocked:'Не определено число потоков ресурса '+u.pool});return;}
      const a=resourceStart(u,ready.date,n),b=a?cal.end(a,n):null;
      if(!a||b>horizon){assign(u,{blocked:'Расчёт выходит за горизонт пяти лет'});return;}
      assign(u,{start:a,end:b,duration:n,scheduleGroup:u.id});if(u.pool&&n>0)allocations.push({id:u.id,pool:u.pool,start:a,end:b});
    }
    while(pending.size){
      const ready=[...pending].map(u=>({u,r:readiness(u)})).filter(x=>!x.r.waiting);
      if(!ready.length)throw Error('Не удалось упорядочить группы зависимостей');
      const priority=x=>max(...options(x.u).map(o=>o.moveTo))||sourceInterval(x.u)?.start||x.r.date||'9999-12-31';
      ready.sort((a,b)=>priority(a).localeCompare(priority(b))||a.u.id.localeCompare(b.u.id));
      const {u,r}=ready[0];execute(u,r);pending.delete(u);finished.add(u);
    }
    // Complete source intervals survive conflicts, but are not certified feasible.
    const occupied=units.filter(u=>!doneStatus(u)&&u.pool&&!original.get(u.id).milestone&&by.get(u.id).start&&!by.get(u.id).blocked);
    const overloaded=new Set();
    for(const u of occupied){const t=by.get(u.id),cap=config.capacities[u.pool];
      if(!cap){t.conflicts.push('Ёмкость ресурса '+u.pool+' не подтверждена');u.members.forEach(m=>{m.conflicts=[...new Set(t.conflicts)];});overloaded.add(u.pool);continue;}
      for(let d=t.start;d<=t.end;d=cal.nextWorkday(d)){
        if(occupied.filter(v=>v.pool===u.pool&&by.get(v.id).start<=d&&by.get(v.id).end>=d).length>cap){t.conflicts.push('Превышено число потоков ресурса '+u.pool);overloaded.add(u.pool);break;}
      }
      u.members.forEach(m=>{m.conflicts=[...new Set(t.conflicts)];});
    }
    for(const t of tasks){const o=config.overrides[t.id]||{},groupMove=max(...options(unitBy.get(t.id)).map(v=>v.moveTo));
      if(groupMove){t.requestedStart=groupMove;if(t.start!==groupMove)t.moveConstraint=t.blocked||(['completed','included'].includes(t.status)?'Завершённая или включённая работа не переносится':'Учтены календарь, зависимости, готовность и доступные потоки');}
      if(t.conflicts.length)warnings.push(t.id+': '+t.conflicts.join('; '));
      if(o.moveTo&&t.moveConstraint)warnings.push(t.id+': '+t.moveConstraint);
    }
    const complete=tasks.every(t=>['completed','included'].includes(t.status)||(!t.blocked&&!t.conflicts.length&&t.start&&t.end));
    if(!complete)warnings.push('План частичный: неизвестные сроки, блокировки или конфликты требуют вводных PM');
    const analysis=criticalAnalysis(tasks,units,config,cal,complete,overloaded);
    return {tasks,config,finish:max(...tasks.filter(t=>!t.blocked&&t.status!=='included').map(t=>t.end)),complete,warnings,...analysis};
  }
  function criticalAnalysis(tasks,units,cfg,cal,complete,overloaded){
    const result={criticalEdges:[],criticalNote:complete?'Критический путь рассчитанного проекта.':'Критический путь только рассчитанного объёма, не подтверждённого полного запуска.',resourceOrderValid:overloaded.size===0};
    const timed=units.filter(u=>{const t=u.members[0];return t.start&&t.end&&!t.blocked&&!['completed','included'].includes(t.status);});
    if(!timed.length)return result;
    if(timed.some(u=>u.members.some(t=>t.conflicts.some(s=>!s.includes('ресурса'))))){result.criticalNote='Резерв не рассчитан: конфликт исходных дат, календаря или зависимостей.';return result;}
    const first=timed.map(u=>u.members[0].start).sort()[0],index=d=>cal.span(first,d)-1,by=new Map(),nodes=[];
    for(const u of timed){const t=u.members[0],n={id:u.id,pool:u.pool,members:u.members,start:index(t.start),end:index(t.end),milestone:!!t.milestone,out:[],incoming:0};nodes.push(n);u.members.forEach(t=>by.set(t.id,n));}
    const edges=new Map();
    function edge(a,b,lag,resource,from=a?.id,to=b?.id){if(!a||!b||a===b)return;const key=a.id+'|'+b.id,old=edges.get(key);if(old){old.lag=Math.max(old.lag,lag);if(!resource){old.resource=false;old.from=from;old.to=to;}return;}const e={a,b,lag,resource,from,to};edges.set(key,e);a.out.push(e);b.incoming++;}
    for(const t of tasks)if(by.has(t.id))for(const id of t.dependsOn){const a=by.get(id);edge(a,by.get(t.id),a?.milestone?0:1,false,id,t.id);}
    const pools=new Map();for(const n of nodes)if(n.pool&&!n.milestone){const p=pools.get(n.pool)||[];p.push(n);pools.set(n.pool,p);}
    for(const [id,pool] of pools){
      if(overloaded.has(id)||!cfg.capacities[id]){result.resourceOrderValid=false;continue;}
      const lanes=Array(cfg.capacities[id]).fill(null),pairs=[];let valid=true;
      for(const n of pool.sort((a,b)=>a.start-b.start||a.end-b.end||a.id.localeCompare(b.id))){
        const free=lanes.map((last,i)=>({last,i})).filter(x=>!x.last||x.last.end<n.start).sort((a,b)=>(b.last?.end??-Infinity)-(a.last?.end??-Infinity));
        if(!free.length){valid=false;break;}const {last,i}=free[0];if(last)pairs.push([last,n]);lanes[i]=n;
      }
      if(!valid){result.resourceOrderValid=false;overloaded.add(id);continue;}for(const [a,b] of pairs)edge(a,b,1,true);
    }
    const queue=nodes.filter(n=>!n.incoming),ordered=[];while(queue.length){const n=queue.shift();ordered.push(n);for(const e of n.out)if(!--e.b.incoming)queue.push(e.b);}
    if(ordered.length!==nodes.length){result.criticalNote='Резерв не рассчитан: конфликт зависимостей и порядка потоков.';return result;}
    const horizon=Math.max(...nodes.map(n=>n.end));
    for(const n of ordered.reverse()){
      const length=n.end-n.start;n.latest=horizon-length;for(const e of n.out)n.latest=Math.min(n.latest,e.b.latest-length-e.lag);
      n.float=Math.max(0,n.latest-n.start);const free=Math.max(0,Math.min(horizon-n.end,...n.out.map(e=>e.b.start-n.end-e.lag)));
      if(!overloaded.has(n.pool))n.members.forEach(t=>{t.totalFloat=n.float;t.freeFloat=free;t.critical=n.float===0;});
    }
    for(const e of edges.values())if(!overloaded.has(e.a.pool)&&!overloaded.has(e.b.pool)&&e.a.float===0&&e.b.float===0&&e.b.start===e.a.end+e.lag)result.criticalEdges.push({from:e.from,to:e.to,resource:e.resource});
    result.criticalNote+=' Резерв в рабочих днях при текущем порядке потоков; проверяйте переносы по одной задаче.';
    if(!result.resourceOrderValid)result.criticalNote+=' Для перегруженных или неоценённых ресурсов резерв неизвестен; ресурсные связи исключены.';
    return result;
  }
  return {validate,calculate,calendar};
});
