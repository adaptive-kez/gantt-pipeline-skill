# Project contract v1

Portable JSON. No account, tenant, task or site IDs are supplied by the skill. Input values below are schema examples, not default estimates.

```json
{
  "version": 1,
  "id": "new-project",
  "name": "Название проекта",
  "mode": "website",
  "sources": [{"id":"brief","title":"ТЗ","text":"Точный исходный текст"}],
  "stages": [{"id":"design","label":"Дизайн и согласование","color":"#8b82af","pool":"design"}],
  "settings": {
    "start": null,
    "holidays": [],
    "calendar": "weekdays",
    "dayHours": {},
    "capacities": {"design":null},
    "resources": {"design":{"label":"Дизайнер","hoursPerDay":null,"shortDayPolicy":"subtract"}},
    "stageDurations": {"design":null},
    "preserveSourceDates": true,
    "overrides": {}
  },
  "tasks": [{
    "id":"T1", "title":"Макет главной", "stage":"design", "workstream":"Главная",
    "description":"Контекст и границы работы", "acceptance":["Критерий готовности"],
    "sourceRefs":[{"sourceId":"brief","quote":"Точная цитата"}],
    "dependsOn":[], "duration":null, "sourceStart":null, "sourceEnd":null,
    "notBefore":null, "blocker":null, "status":"planned", "milestone":false,
    "resourceGroup":null, "estimateHours":null, "parallelism":1,
    "aspro":null
  }]
}
```

Modes: website, identity, mobile. Stage IDs and pool IDs are portable ASCII slugs; stages can be added without code changes. A stage with pool:null has no shared resource constraint (e.g. an external readiness milestone), never means unlimited staff for production work. Capacities positive integer 1–20 or null; null means not estimated and pooled work remains unscheduled unless preserving a complete source interval. Zero is not unlimited capacity.

Task IDs are stable ASCII identifiers, not remote IDs. dependsOn is an array of task IDs; all links are Finish-to-Start, next working day. A milestone has duration:0 and permits its successors on its date; milestone dependencies are readiness gates. Production tasks have duration:null or integer1–260. status planned/completed/included. Completed/included tasks stay in the registry and do not consume future capacity; dated completed tasks can satisfy dependencies. An included task must not be used as a predecessor for an independent delivery.

resourceGroup optionally joins tasks representing one jointly estimated work package. Group members must share stage/pool, dependencies, effective duration and complete preserved interval if any. Schedule/count them once; retain every row/remote task. Invalid group configurations are validation errors, never silently merged. Backend batches are explicit tasks with dependsOn referencing their frontend pages; membership is data, not fixed task indices. QA stages may share the same pool.

sourceStart/sourceEnd are ISO YYYY-MM-DD confirmed source intervals. Preserve them when enabled; flag resource/dependency conflicts without silently rewriting Aspro dates. A sourceEnd without sourceStart is a deadline, not proof of completion. Do not derive a start automatically from an overdue deadline. Local task overrides may explicitly replace source dates for scenario exploration.

settings.overrides[taskId] = {moveTo?:"YYYY-MM-DD",duration?:1,ready?:"YYYY-MM-DD",parallelism?:1|"all"}. moveTo sets requested start subject to predecessors/calendar/resources; it preserves estimated effort for hourly tasks, or effective working-day duration for day-based tasks. Explicit duration overrides hourly calculation until removed. ready clears only that task's blocker, never peers' or predecessors' blockers. A milestone can move via moveTo. Source input must remain immutable.

aspro when verified: {id:123,projectId:456,stageId:789,url:"https://customer.example/task/123"}. Omit all real links from public examples. Context stays in the project JSON and internal Aspro payload; client HTML/export omits source text and internal descriptions by default.

Hourly tasks: positive `estimateHours` ≤100000, a stage pool and known `settings.resources[pool].hoursPerDay` (>0 and ≤8). `parallelism` is 1–20 or `"all"`, default 1, and may not exceed available capacity. Multiple people accelerate only explicitly divisible tasks. Source dates still take precedence in preserve mode. See [scheduling.md](scheduling.md) for daily accumulation, shortened-day policy, resource reservation, grouping, import and limitations.

Calendar: generic `weekdays` or verified `ru-2026` (only 2026). `holidays` adds nonworking dates; `dayHours` is a date→0–8 hours map overriding the preset, including working weekends. Out-of-coverage RF scheduling is blocked. Unknown capacities/hours/durations/dates remain unknown. Config fields may be overridden interactively. Date horizon max5years, tasks max500. No implicit holidays from a past project.

## Runtime API

UMD/CommonJS: GanttEngine.validate(project) → string[]; GanttEngine.calculate(project,configOverrides={}) → result or throws validation Error.
Result: {tasks,config,finish,complete,warnings,criticalEdges,criticalNote,resourceOrderValid}. tasks keep source fields and add {start:null|string,end:null|string,duration:null|number,blocked:null|string,critical:boolean,totalFloat:null|number,freeFloat:null|number,requestedStart?:string,moveConstraint?:string}. finish is last calculated end, complete only if every required task is scheduled/completed/included. Unknown reserve is null, never zero. Critical edges {from,to,resource:boolean}. Resource critical edges describe current lane order, do not become business dependencies in JSON/Aspro. Respect source conflicts; mark partial critical scope and qualifications.

GanttExport.workbook(project,result) → Uint8Array for static styled XLSX. Build script embeds only sanitized project and this exact runtime in a single HTML. Settings JSON is portable between the same project ID; full project JSON is retained as the agent's internal working file.

Calculated hourly/day-based tasks also expose `workers` and `scheduleBasis:"hours"|"days"`. `GanttEngine.calendar(settings)` exposes `hours(date)`, `covered(date)` and workday helpers; the legacy holidays-array argument remains supported. Source-preserved tasks need not have a calculation basis. XLSX includes original hours, applied workers, daily allocation and calendar hours, but remains a static snapshot.
