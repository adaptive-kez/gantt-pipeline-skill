(function(root){
'use strict';
const enc=new TextEncoder();
const xml=s=>String(s??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const letters=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
function zip(files){let offset=0,central=[],out=[];for(const [name,txt]of Object.entries(files)){const n=enc.encode(name),data=enc.encode(txt),h=new Uint8Array(30+n.length),v=new DataView(h.buffer),check=crc(data);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,check,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);h.set(n,30);out.push(h,data);const c=new Uint8Array(46+n.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,check,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,n.length,true);w.setUint32(42,offset,true);c.set(n,46);central.push(c);offset+=h.length+data.length;}const size=central.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);const parts=[...out,...central,end],bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let cursor=0;for(const p of parts){bytes.set(p,cursor);cursor+=p.length;}return bytes;}
// All exported cells are values: this is a static snapshot, not a formula engine.
const engine=typeof module!=='undefined'?require('./scheduler.js'):root.GanttEngine;
let stages=[],stageStyles=new Map(),exportHolidays=new Set(),exportCalendar;
const colors=['92845D','47765C','AE8D47','52788E','756B96','386858'];
const dateSerial=d=>{if(!d||String(d).startsWith('0000'))return null;const day=String(d).slice(0,10);return Math.round((Date.parse(day+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);};
const dateCell=(d,s=9)=>dateSerial(d)===null?{v:'',s}:{v:dateSerial(d),s};
const work=d=>exportCalendar.isWorkday(d);
const styles=[
 {fill:'FFFFFF'}, {fill:'343B3C',font:1}, ...colors.map(fill=>({fill})), {fill:'EEEFEA'},
 {fill:'FFFFFF',num:164}, {fill:'343B3C',font:1,num:165,center:true}, {fill:'E7EBE6',font:2},
 {fill:'FFFFFF',font:3}, {fill:'FFFFFF',font:4}, {fill:'9D735D',font:1},
 {fill:'E7EBE6',font:2,num:164}, {fill:'FFF5DD',font:4}, {fill:'E7EBE6',font:2,num:166,center:true},
 {fill:'FFFFFF',center:true}, {fill:'E5B457',center:true}
];
function sheet(rows,widths,{freeze=0,freezeRows=1,merges=[],filter=false,outlineRows=new Set(),heights={}}={}){
 const body=rows.map((r,ri)=>'<row r="'+(ri+1)+'" ht="'+(heights[ri+1]|| (ri===0?30:32))+'" customHeight="1"'+(outlineRows.has(ri+1)?' outlineLevel="1"':'')+'>'+r.map((raw,ci)=>{
  const x=raw&&typeof raw==='object'?raw:{v:raw},style=x.s??0,ref=letters(ci+1)+(ri+1);
  return typeof x.v==='number'&&Number.isFinite(x.v)?'<c r="'+ref+'" s="'+style+'"><v>'+x.v+'</v></c>':'<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+xml(x.v)+'</t></is></c>';
 }).join('')+'</row>').join('');
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><outlinePr summaryBelow="0"/></sheetPr><dimension ref="A1:'+letters(widths.length)+rows.length+'"/><sheetViews><sheetView showGridLines="0" workbookViewId="0">'+(freeze?'<pane xSplit="'+freeze+'" ySplit="'+freezeRows+'" topLeftCell="'+letters(freeze+1)+(freezeRows+1)+'" activePane="bottomRight" state="frozen"/>':'')+'</sheetView></sheetViews><cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+body+'</sheetData>'+(filter?'<autoFilter ref="A1:'+letters(widths.length)+rows.length+'"/>':'')+(merges.length?'<mergeCells count="'+merges.length+'">'+merges.map(ref=>'<mergeCell ref="'+ref+'"/>').join('')+'</mergeCells>':'')+'<pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
}
function workbook(project,result){
 if(!project||!Array.isArray(project.tasks)||!result||!Array.isArray(result.tasks))throw Error('Нужны проект и результат GanttEngine.calculate(project).');
 if(result.errors?.length)throw Error('Исправьте ошибки перед экспортом: '+result.errors.join('; '));
 if(project.tasks.length>500)throw Error('Максимум 500 задач.');
 const cfg=result.config||project.settings;exportCalendar=engine.calendar(cfg);stages=project.stages.map(s=>s.label);styles.length=20;stageStyles=new Map();for(const stage of project.stages){stageStyles.set(stage.label,styles.length);styles.push({fill:stage.color.replace('#','').toUpperCase()});}exportHolidays=new Set(cfg.holidays||[]);
 const byId=new Map(result.tasks.map(r=>[r.id,r]));
 if(byId.size!==project.tasks.length||project.tasks.some(t=>!byId.has(t.id)))throw Error('Результат расчёта не соответствует задачам проекта.');
 const text=v=>{const s=String(v??'');return s.length>32700?s.slice(0,32650)+' … [полный текст в JSON проекта]':s;};
 const tasks=project.tasks.map(t=>({...t,...byId.get(t.id),name:t.title,stage:project.stages.find(s=>s.id===t.stage)?.label||t.stage,reason:byId.get(t.id).blocked,blocker:byId.get(t.id).blocked,predecessors:t.dependsOn,reviewed:true,assumption:false,critical:Number.isFinite(byId.get(t.id).totalFloat)?byId.get(t.id).critical:null}));
 const dated=tasks.filter(t=>t.start&&t.end),start=dated.map(t=>t.start).sort()[0]||cfg.start||'',end=result.finish||start,days=[];
 for(let d=start;d&&d<=end;){days.push(d);const x=new Date(d+'T12:00:00Z');if(!Number.isFinite(+x))throw Error('Некорректная дата в результате расчёта.');x.setUTCDate(x.getUTCDate()+1);d=x.toISOString().slice(0,10);if(days.length>1830)throw Error('Горизонт экспорта больше 5 лет.');}
 const complete=result.complete,header=a=>a.map(v=>({v,s:1}));
 const registry=[header(['ID','Этап','Задача','Раб. дни','Начало','Окончание','Предшественники','Условие / ожидание','Исходное начало','Исходный дедлайн','Критическая','Полный резерв, р.д.','Свободный резерв, р.д.']),...tasks.map(t=>[t.id,t.stage,text(t.title),t.duration??'',dateCell(t.start),dateCell(t.end),(t.predecessors||[]).join(', '),text(t.blocker||t.reason||''),dateCell(t.sourceStart),dateCell(t.sourceEnd),t.critical===null?'Не рассчитано':t.critical?'Да':'Нет',t.totalFloat??'',t.freeFloat??''])];
 const chart=[
 [{v:text(project.name||'Новый проект')+' · Гант',s:12}],
 [{v:'Статический снимок. Изменение ячеек не пересчитывает даты и полосы. Для продолжения работы сохраните JSON и откройте его в шаблоне.',s:13}],
 [{v:(complete?'Расчётное завершение: '+end+'. Критический путь задан по зависимостям.':'Полное завершение не определено: есть задачи без дат или план пуст.')+' Подробности и ограничения — на листе «Сценарий».',s:13}],
 [{v:'Цвет — этап · терракотовый — критическая задача · серый — выходной. Резерв в рабочих днях. Оценки и полноту ТЗ проверяет человек.',s:13}],
 [...Array(7).fill({v:'',s:11}),...days.map(d=>dateCell(d,17))],
 [...header(['Этап / работа','Р.д.','Начало','Конец','Зависит от','Крит.','Запас']),...days.map(d=>dateCell(d,10))]
 ];
 const merges=['A1:G1','A2:G2','A3:G3','A4:G4'],outlineRows=new Set(),heights={1:30,2:40,3:40,4:34,5:24,6:36};
 let monthStart=0;for(let i=1;i<=days.length;i++)if(i===days.length||days[i].slice(0,7)!==days[monthStart].slice(0,7)){if(i-monthStart>1)merges.push(letters(8+monthStart)+'5:'+letters(7+i)+'5');monthStart=i;}
 for(const stage of [...stages,...new Set(tasks.map(t=>t.stage).filter(s=>!stages.includes(s)))]){
 const list=tasks.filter(t=>t.stage===stage);if(!list.length)continue;const timed=list.filter(t=>t.start&&t.end),s=timed.map(t=>t.start).sort()[0],e=timed.map(t=>t.end).sort().at(-1);
 chart.push([{v:stage+' · '+list.length+' задач',s:11},{v:'',s:11},dateCell(s,15),dateCell(e,15),{v:'',s:11},{v:'',s:11},{v:'',s:11},...days.map(()=>({v:'',s:11}))]);heights[chart.length]=28;
 for(const t of list){const color=stageStyles.get(stage)||0;const name=t.id+' · '+t.title+(!t.start&&t.reason?' — '+t.reason:'');chart.push([text(name),t.duration??'',dateCell(t.start),dateCell(t.end),(t.predecessors||[]).join(', '),{v:t.critical===null?'—':t.critical?'Да':'Нет',s:t.critical?14:18},t.totalFloat??'',...days.map(d=>({v:'',s:t.start&&t.end&&d>=t.start&&d<=t.end?(t.critical?14:color):!work(d)?8:0}))]);outlineRows.add(chart.length);heights[chart.length]=Math.max(32,Math.min(80,Math.ceil(name.length/40)*14+8));}
 }
 const settings=[header(['Параметр','Значение']),['Проект',text(project.name)],['Тип экспорта','Статический снимок. Изменение ячеек не пересчитывает график.'],['Начало',dateCell(cfg.start)],['Рассчитанный объём',dateCell(result.finish)],['Полное завершение',complete?dateCell(result.finish):'Не определено'],['Датировано / всего',dated.length+' / '+tasks.length],['Сохранять исходные интервалы',cfg.preserveSourceDates?'Да':'Нет'],['Календарь','Понедельник–пятница, исключены: '+(cfg.holidays||[]).join(', ')],['Число потоков',JSON.stringify(cfg.capacities||{})],['Длительности этапов',JSON.stringify(cfg.stageDurations||{})],['Критический путь',text(result.criticalNote||'Не рассчитан')],['Предупреждения',text((result.warnings||[]).join('; '))],['Индивидуальные изменения',text(JSON.stringify(cfg.overrides||{}))],header(['Легенда','Значение']),...stages.map(s=>[{v:s,s:stageStyles.get(s)},'Работы соответствующего этапа']),[{v:'Критическая задача',s:14},'Нулевой полный резерв в рассчитанном объёме'],[{v:'Нерабочий день',s:8},'Выходной или исключение календаря']];
 registry[0].push(...header(['Смета, ч.','Исполнителей','Часов/день/чел.','Основа срока']));
 tasks.forEach((t,i)=>{const pool=project.stages.find(s=>s.id===t.stage)?.pool;registry[i+1].push(t.estimateHours??'',t.workers??'',cfg.resources?.[pool]?.hoursPerDay??'',t.scheduleBasis==='hours'?'По часам':t.scheduleBasis==='days'?'Рабочие дни':'Исходные даты / не рассчитано');});
 settings[8]=['Календарь',(cfg.calendar==='ru-2026'?'РФ 2026, пятидневка':'Понедельник–пятница')+'; исключены: '+(cfg.holidays||[]).join(', ')];
 settings.push(['Команда: роли, часы, сокращённые дни',JSON.stringify(cfg.resources||{})],['Исключения часов календаря',JSON.stringify(cfg.dayHours||{})]);
 const calendar=[header(['Дата','День','Рабочий','Примечание','Часы полного дня']),...days.map(d=>[dateCell(d),['вс','пн','вт','ср','чт','пт','сб'][new Date(d+'T12:00:00Z').getUTCDay()],work(d)?1:0,!exportCalendar.covered(d)?'Календарь не подтверждён':!work(d)?'Выходной / праздник / исключение':exportCalendar.hours(d)<8?'Сокращённый день':'',exportCalendar.covered(d)?exportCalendar.hours(d):''])];
 const names=['Гант','Задачи','Сценарий','Календарь'];
 const files={'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+['workbook','styles'].map(n=>'<Override PartName="/xl/'+n+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.'+(n==='workbook'?'sheet.main':'styles')+'+xml"/>').join('')+names.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map((n,i)=>'<sheet name="'+n+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+names.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(names.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/><numFmt numFmtId="165" formatCode="dd"/><numFmt numFmtId="166" formatCode="mmmm yyyy"/></numFmts><fonts count="5"><font><sz val="10"/><color rgb="FF343B3C"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FF343B3C"/><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FF343B3C"/><sz val="18"/><name val="Arial"/></font><font><color rgb="FF68736C"/><sz val="10"/><name val="Arial"/></font></fonts><fills count="'+(styles.length+2)+'"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+styles.map(s=>'<fill><patternFill patternType="solid"><fgColor rgb="FF'+s.fill+'"/><bgColor indexed="64"/></patternFill></fill>').join('')+'</fills><borders count="1"><border><bottom style="hair"><color rgb="FFE5E8E2"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="'+styles.length+'">'+styles.map((s,i)=>'<xf numFmtId="'+(s.num||0)+'" fontId="'+(s.font||0)+'" fillId="'+(i+2)+'" borderId="0" xfId="0" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" wrapText="1"'+(s.center?' horizontal="center"':'')+'/></xf>').join('')+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
 'xl/worksheets/sheet1.xml':sheet(chart,[42,6,12,12,17,7,7,...days.map(()=>3.1)],{freeze:7,freezeRows:6,merges,outlineRows,heights}),
 'xl/worksheets/sheet2.xml':sheet(registry,[10,20,48,9,15,15,22,42,15,15,13,14,14,14,14,18,26],{freeze:4,filter:true,heights:Object.fromEntries(tasks.map((t,i)=>[i+2,Math.max(32,Math.min(105,Math.ceil(Math.max(t.title.length,(t.reason||'').length,0)/45)*14+8))]))}),
 'xl/worksheets/sheet3.xml':sheet(settings,[46,108],{freeze:1,heights:{3:38,9:40,10:40,11:40,12:40,13:40,14:55}}),
 'xl/worksheets/sheet4.xml':sheet(calendar,[15,12,13,38,22],{freeze:1,filter:true})};
 return zip(files);
}
root.GanttExport={workbook};
})(typeof module!=='undefined'?module.exports:window);
