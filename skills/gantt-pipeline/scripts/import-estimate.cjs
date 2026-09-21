'use strict';
// Local-only import into an already decomposed project. No remote task mutations.
function csv(text){
 text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0],sep=first.includes(';')?';':',';
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===sep&&!quoted){row.push(cell.trim());cell='';}else if(c==='\n'&&!quoted){row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else if(c!=='\r')cell+=c;}
 if(quoted)throw Error('Незакрытые кавычки в CSV');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(rows.length<2)throw Error('Нужны заголовки и строки сметы');
 const aliases={id:'id','код':'id',page:'page','страница':'page',stage:'stage','этап':'stage',hours:'hours','часы':'hours',parallelism:'parallelism','исполнители':'parallelism'};
 const headers=rows.shift().map(h=>aliases[h.toLowerCase()]);if(headers.some(h=>!h)||new Set(headers).size!==headers.length||!headers.includes('hours'))throw Error('Заголовки CSV: id, page, stage, hours, parallelism; обязательны hours и id либо page+stage');
 return rows.map(r=>{if(r.length!==headers.length)throw Error('Количество колонок не совпадает с заголовком');return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
function importEstimate(project,text,team){
 const p=structuredClone(project),seen=new Set();
 if(text!==null)for(const row of csv(text)){
  const candidates=row.id?p.tasks.filter(t=>t.id===row.id):p.tasks.filter(t=>row.page&&row.stage&&t.workstream===row.page&&(t.stage===row.stage||p.stages.find(s=>s.id===t.stage)?.label===row.stage));
  if(candidates.length!==1)throw Error('Строка сметы не сопоставлена с одной задачей: '+(row.id||row.page||'?'));
  const t=candidates[0];if(seen.has(t.id))throw Error('Повторная строка сметы: '+t.id);seen.add(t.id);
  if(row.page&&row.page!==t.workstream)throw Error('Страница не совпадает: '+t.id);
  if(row.stage&&row.stage!==t.stage&&row.stage!==p.stages.find(s=>s.id===t.stage)?.label)throw Error('Этап не совпадает: '+t.id);
  const n=row.hours===''?null:Number(row.hours.replace(',','.'));if(n!==null&&(!Number.isFinite(n)||n<=0))throw Error('Некорректные часы: '+t.id);
  t.estimateHours=n;if(!t.milestone)t.duration=null;
  if(row.parallelism)t.parallelism=row.parallelism==='all'?'all':Number(row.parallelism);
 }
 if(team){
  if(!Array.isArray(team.roles))throw Error('team.roles должен быть массивом');
  const pools=new Set();p.settings.resources={...p.settings.resources};p.settings.capacities={...p.settings.capacities};
  for(const r of team.roles){if(!r||!r.pool||pools.has(r.pool))throw Error('Некорректный или повторный pool команды');pools.add(r.pool);
   p.settings.resources[r.pool]={label:r.role,hoursPerDay:r.hoursPerDay??null,shortDayPolicy:r.shortDayPolicy||'subtract'};p.settings.capacities[r.pool]=r.count??null;
  }
 }
 return p;
}
module.exports={csv,importEstimate};
