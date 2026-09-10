---
name: gantt-pipeline
description: Turn a new project brief into contextual Aspro tasks, confirm the task pool with the project manager, then generate an interactive HTML Gantt with resources, dependencies, critical path, styled spreadsheet export and optional Sites publishing. Use for website project planning and reusable Gantt delivery; identity and mobile modes provide separate starting structures.
---

# Gantt Pipeline

Run the requested stages of **context → decomposition → Aspro → PM confirmation → HTML Gantt → export / publishing**. Start with the manager's project context in chat. Website delivery is the primary mode; identity and mobile are separate modes, not renamed website task lists.

Use bundled assets and scripts to preserve the accepted Gantt design and behavior. Do not replace them with a fresh chart library, a screenshot, a plain task table, or the older simplified brief editor. Python is not required; scripts use Node.js20+ built-ins. Paths below are relative to this skill directory.

## Intake and decomposition

Read [modes.md](references/modes.md) for the selected mode and [project-schema.md](references/project-schema.md) before preparing JSON. Ask only for missing inputs that affect scope, estimates, capacity, calendar, destination or authorization; keep useful independent work moving. Collect source brief/map/wireframes, deliverables, exclusions, external inputs, existing Aspro project(s), estimates and actual available parallel streams. Preserve unknowns. A historical Gantt is a visual example, never a source of dates, tasks or staffing for a new project.

1. Initialize the selected stage vocabulary, then populate the resulting project JSON from the actual brief:
   `node scripts/pipeline.cjs init --mode website --id project-slug --name "Project name" --out project.json`
2. Decompose semantically. Give each task stable local ID, result, context, acceptance criteria and exact supporting quote. Keep migrations, preparation, content, approvals and unique pages visible when in scope. Proposed work without source support must be labelled `Предложение:`. Preserve the full source only in the internal working JSON.
3. Use explicit dependencies, never row order, to model mandatory sequences and backend batches. Share a resource pool between QA phases when the same capacity performs them. Set `resourceGroup` only for one jointly estimated package; do not double-count its page rows. Estimates and capacity remain null unless supplied or explicitly accepted as assumptions. Completed dates are not inferred from passed deadlines.
4. Run `node scripts/pipeline.cjs validate --project project.json`. Resolve graph/input errors; leave missing business inputs as visible blockers. Do not invent a complete launch date.

## Aspro task pool, then PM confirmation

Read [aspro.md](references/aspro.md). Discover live schema, target projects and sections with the user's connector. Use the configured bindings rather than global IDs. Read existing tasks with full pagination and verify returned project/section fields because unsupported Aspro filters can be silently ignored.

Generate a local operation plan with `plan-aspro`. Preview the actual create/update records using the current connector; show the concrete batch and use the authorization already present in chat. Follow the connector's confirmation requirement. The helper itself does not mutate Aspro. Never infer that running this skill authorizes deletion, moving unrelated tasks, assigning people or changing Aspro dates.

After writes, read every affected record back from its project/section and run `reconcile`. Store returned remote IDs; stable `ref=gantt-pipeline` and `ref_id=project-slug:local-id` prevent retries from creating duplicates. On an uncertain mutation response, read back by reference before retrying. Same-name tasks without an explicit binding require resolution, not another creation. Stop that batch on ambiguous identity or scope mismatch.

Show the PM the **actual verified pool** with links, missing inputs and proposed dependencies, and obtain confirmation of its composition. This confirmation is distinct from permission to create records. Record only a confirmation actually given in chat:

`node scripts/pipeline.cjs approve --project project-linked.json --approved-by "PM name or role from chat" --out approval.json`

The build validates the scope and binding hashes. Changing task composition invalidates approval. Do not forge approval to complete a demo. A clearly labelled local `build --preview` is available for review/testing; it is not a final client plan and must not be published as approved.

## HTML and client delivery

Read [delivery.md](references/delivery.md). Build the same bundled interface:

`node scripts/pipeline.cjs build --project project-linked.json --approval approval.json --out gantt.html`

The result is a standalone HTML with schedule controls, resource capacities, source-date preservation, stage/workstream grouping, zoom, links, critical path and total/free float, task details, Aspro links, drag/Escape/undo, settings save/load/share and spreadsheet export. Local edits are scenarios; they do not write to Aspro. Source text, internal task descriptions and credentials do not belong in client HTML.

Validate dependency/resource behavior on representative tasks and view the rendered result. Identify partial critical scope, fixed-source conflicts and unestimated work. Export the current scenario using **Экспорт Excel**; verify the timeline blocks, dates, grouping, colors and critical markings after opening/converting in Google Sheets. The XLSX/Google version is a styled static snapshot, not a formula-based scheduling engine. Retain the internal project JSON for future changes.

Publish through Sites when requested, using the available Sites tooling and hosting instructions. Reuse an existing `.openai/hosting.json`; push the exact source, save a version, deploy to the authorized audience and verify the live page. A successful local build or Git push alone is not publication. Provide HTML, spreadsheet and verified live URL as applicable; do not send messages to the customer without authorization.

## Refresh from Aspro

The ready Gantt has **Обновить из Aspro** and links to remote tasks. For live refresh read [sync.md](references/sync.md). Use the bundled read-only server bridge with a server-side Aspro key and the same-origin snapshot route. The button must handle changed dates/statuses, newly added tasks, missing/archived tasks and local scenario conflicts. Failed or partial reads must preserve the last good view, not clear the schedule. New tasks without estimates remain visible and unplanned until the PM resolves them.

A static standalone file has no authenticated Aspro connection. Do not put an API key in HTML, query strings exposed to the client, localStorage, project JSON or a public repository. Hosted live sync requires a protected backend/private HTTP binding; without one, deliver the static snapshot and clearly mark sync unconnected. Never claim live sync was checked when only fixture tests ran.

## Distribution and testing

Read [testing.md](references/testing.md) for offline tests, a forward evaluation and live boundaries. Use only synthetic projects in the distributed skill/tests/examples. Do not publish customer contexts, real account bindings, generated client files or tokens with this skill. Local generated outputs and live configs are separate from the skill source.
