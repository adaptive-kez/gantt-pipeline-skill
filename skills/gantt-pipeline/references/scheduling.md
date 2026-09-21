# Hour-based planning and manual scenarios

## Inputs and import

Decompose the project before importing its estimate. Preserve each page/stage row, exact supporting context, unknown estimates and dependencies. Do not infer tasks or estimates from a screenshot of an old Gantt. If the source is a spreadsheet, read the actual cells with the connected tool; normalize only the relevant estimate into UTF-8 CSV. The importer accepts comma or semicolon delimiters and quoted cells. Headers: `id` (or `page`+`stage`), `hours`, optional `parallelism`. Russian aliases: `код`, `страница`, `этап`, `часы`, `исполнители`. Decimal comma works in semicolon CSV. Ambiguous, duplicate and unmatched rows fail instead of creating tasks. Blank hours remain unknown; zero is not a completed task. A partial CSV changes only its matched tasks.

Team input (values below are synthetic examples, not defaults):

```json
{"roles":[
  {"pool":"design","role":"Дизайнер","count":2,"hoursPerDay":4,"shortDayPolicy":"subtract"},
  {"pool":"pm","role":"Проджект-менеджер","count":1,"hoursPerDay":2,"shortDayPolicy":"subtract"}
]}
```

`--estimate` and `--team` are independently optional. The CLI writes a new project file and never changes Aspro. Counts and hours can also be edited in HTML; importing a new source estimate is a pipeline operation, not a browser upload button. Keep estimates in hours, not silently rounded days.

## Calculation contract

- One pool represents interchangeable people with the same daily allocation; split distinct schedules into distinct pools/stages. Each person's stream can execute one task at a time. Whole-day reservations are intentional: spare hours on a task's last day are not automatically assigned to another task.
- `estimateHours` is total person-hours. Default `parallelism:1`; `2` reserves two people; `"all"` reserves all available people in that pool. The latter explicitly models divisible work with ideal linear speedup, not a guarantee of productivity. Increasing team size does not accelerate an indivisible task. Unknown count or hours stays a blocker.
- For normal days, effort consumed = hours/day/person × assigned people. Sum available hours over calendar working days until the estimate is covered; display the ceiling in working days. There is no fractional-day bar scheduling.
- Daily allocation must be >0 and ≤8 hours. On a shortened day the default `subtract` policy subtracts the calendar reduction from allocation, clamped at zero. Alternative `cap` keeps allocation within the day's full hours. Example: 4h allocation on a 7h calendar day gives 3h (`subtract`) or 4h (`cap`). Confirm this project-planning policy; it is not a legal ruling about part-time staff.
- `resourceGroup` is one shared package estimate repeated in multiple rows; both estimate and assigned people must agree. Reserve once, retain all rows.
- Dependencies are finish-to-start on the next working day, except readiness milestones. Resource queues never remove business dependencies. Critical path/float for hourly tasks is a reference for the current rounded intervals; moving across a shortened day may change duration, so recalculate rather than treating float as a promise.
- With equal readiness, the scheduler uses a deterministic task-ID order, not row order or inferred business priority. Model mandatory precedence with dependencies; set a requested start for a local scenario. Do not imply that arbitrary ID order is PM-approved priority.

## Calendar

`calendar:"weekdays"` is a generic Monday–Friday calendar, not an RF production calendar. `calendar:"ru-2026"` is the national five-day calendar for 2026, not regional exceptions or shift schedules: 247 working days, 1972 full-time hours, shortened 30 April, 8 May, 11 June, 3 November. Transfers include 9 January and 31 December. Sources: [Government decree 1466 of 24 September 2025](https://government.ru/docs/all/161028/) and [2026 production calendar](https://www.consultant.ru/law/ref/calendar/proizvodstvennye/).

`holidays` adds nonworking dates. `dayHours:{"2026-11-07":8,"2026-11-06":0}` has highest priority and supports working Saturdays, shortened days and regional/company closures; hours 0–8. The preset intentionally blocks new scheduling outside 2026, even if isolated exceptions exist. Before planning another year, verify and extend the calendar and tests, or explicitly agree on a supplied generic calendar. Never claim the next year's calendar has been checked based on weekdays alone. Preserved out-of-coverage source dates remain visible with conflicts.

## Editing and QA

Start and finish fields accept working dates; invalid input must not mutate the scenario. Changing start retains hourly effort (duration may change near a shortened day). Changing finish derives inclusive working-day duration from start; changing duration derives finish. Both are explicit day overrides, leaving the source estimate intact. **Считать по часам сметы** removes the duration override. Local source-date scenarios can push dependent/resource-conflicting intervals; raw source fields never change. Preserve-source mode otherwise retains source dates and reports conflicts rather than silently optimizing them.

Drag from any position inside a task bar: use displacement from pointer-down, one grid day per calendar day, directional weekend snapping, a temporary candidate before release, and stable viewport coordinates after redraw. Dependencies/capacity can limit the requested position; show requested versus available dates. Group summary bars only expand/collapse the group and are not draggable; move the actual task (including all rows of a `resourceGroup`). Undo must restore dates, effort mode and settings. Project-start edits recompute automatically scheduled tasks; explicit task overrides remain intentional constraints until cleared.

Test `examples/hourly-project.json` via `build --preview`: it has synthetic hours, six roles and the November holiday boundary. For D1, 34h at 4h/day starting 2 November takes 9 working days (ends 13 November); two collaborating designers take 5 (ends 9 November). With `parallelism:1`, a second designer enables a different task but leaves D1 at 9 days. Check end/duration edits, downstream dates, left/right drag, Escape/undo, compact summary, mobile layout and XLSX. A preview is never PM-approved and cannot establish live Aspro readiness.
