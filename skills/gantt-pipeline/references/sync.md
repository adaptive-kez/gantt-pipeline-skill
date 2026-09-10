# Read-only Aspro synchronisation

The HTML button requests GET /api/aspro/snapshot on its own origin. A static HTML file alone cannot contact Aspro securely: do not embed an API key in HTML, client JavaScript, project JSON, public Git, links, logs or a published site.

## Local bridge, Node 20+

Run scripts/aspro-sync.cjs with three positional paths: verified non-secret configuration JSON, private project JSON, built standalone HTML. Provide ASPRO_API_KEY only through the server environment, using your password manager or shell secret input. Do not put its value in the command line or an env file committed to Git.

Example command, from the skill folder:

    node scripts/aspro-sync.cjs /private/path/aspro-config.json /private/path/project.json /private/path/gantt.html

The bridge binds only 127.0.0.1 (default port8765). Open the exact URL printed at startup. There is no external bind option, no CORS, no static directory listing and no write endpoint. Both the HTML and its refresh button must be served by this same bridge. Opening the static file separately does not enable synchronisation.

Before building the HTML, explicitly set the private project's sync object to {"url":"/api/aspro/snapshot"} after verifying the protected bridge configuration. This enables the refresh button in the generated page. Only this exact path survives sanitisation and refresh; no arbitrary URL or credential is copied. createBridge rejects a missing/different path with SYNC_NOT_CONFIGURED. Build and serve that matching HTML and project together.

Configuration fields:

    {
      "baseUrl": "https://your-verified-tenant.aspro.cloud",
      "projectIds": [1],
      "stageField": "project_stage_id",
      "stageMap": {"1:10": "design"},
      "maxPages": 5,
      "maxTasks": 500,
      "port": 8765
    }

The IDs and tenant above are placeholders, not a configured account. Verify tenant, numeric project IDs and project/workflow stage IDs with the user and the current service before enabling. Map keys are projectId:stageId; values must match the portable project's existing stage IDs. stageField supports project_stage_id (default), group_id when verified as the tenant's section field, or workflow_stage_id only when explicitly using its workflow stages. The adapter requests only the chosen field and does not infer or substitute one for another.

taskUrlTemplate is optional and must be a verified relative tenant path containing exactly one {id}. No task URL pattern is supplied by default. Existing safe HTTPS task URLs are retained; newly discovered tasks have no URL until a verified template is configured. Query-bearing URLs are excluded to prevent accidental signed-token propagation.

Unknown config fields, credentials in the base URL, external hosts, non-HTTPS upstream URLs, ports and redirect targets are rejected. The server uses a field allowlist and never requests project/task descriptions, reports, financial fields, assignees or custom fields.

## API and coverage

Official reference: https://aspro.cloud/api/ and task group https://aspro.cloud/api/md/task.md.txt .

The adapter issues only GET /api/v1/module/task/tasks/list with server-side api_key, page, limit=100, fields and project scope filters. It requests archive_status 0,10 and orders by ID. The official envelope is response:{items,total,total_result,page,count}; total_result determines pagination, not total (which counts before filters).

Every returned row is checked again: module=st, model=project, model_id in the configured set and equal to the project being fetched. A silently ignored filter therefore rejects the entire snapshot instead of exposing unrelated tasks. Duplicate IDs, inconsistent pagination, changed totals, over-limit payloads and dependency cycles also reject the snapshot. No partial result replaces the current view.

Requests are serialised with at least one second between starts, 20-second timeouts, no redirects, at most10 configured projects, bounded pages and 500 tasks total. Responses are limited to2MiB. Simultaneous browser refreshes share one in-flight snapshot. Error responses contain fixed codes, never an upstream URL, response body, stack trace or API key.

## Merge behaviour

- Match by stable Aspro task ID. Update source dates (portal date part, no UTC shift), name, stage and source status. A deadline alone remains a deadline; no duration or start date is inferred.
- Local durations, resource groups and multiple business dependencies remain. Aspro's single prev_task_id can add a validated link but does not replace the local graph; absent/zero prev_task_id does not erase local links.
- New tasks get duration:null and a review blocker. Unknown stages go to an explicitly unestimated review stage. No new production dates are invented.
- Missing/archived tasks are preserved and flagged, not deleted. Missing/archived predecessors add a review blocker. A blocker requires explicit review to clear; refresh does not silently discard it.
- Completed remote status5 becomes completed; local included rows retain included semantics. Other source statuses remain planned, with the numeric sourceStatus retained for inspection.
- Snapshot project data is a strict client projection: sources, internal descriptions, acceptance and sourceRefs are omitted/empty. A private blocker is replaced by the generic label «Ожидаются вводные; уточните в задаче Aspro». syncWarnings contain only conditions constructed by this adapter, not free text from the private file. No raw API response is returned.
- The browser receives {project,revision,updatedAt}. revision is a hash of the sanitized model, not a database transaction/version token. syncWarnings and task.aspro.syncState expose review conditions.
- The bridge keeps the merged projection in memory; it does not write to Aspro or overwrite the private project JSON. Stop/restart reloads the supplied file.

The API does not provide a transactional snapshot here. A row updated between pages with unchanged counts may still produce a mixed-time read; revision identifies the delivered model, not source atomicity.

## Hosted use

A public static site has no secure place for the API key. Use an authenticated protected backend on the same origin and keep credentials server-side. This loopback bridge is not a production internet server. A tunnel is not set up by this script; a private authenticated proxy/tunnel must enforce access before reaching the loopback service and must preserve validated origin/host boundaries. Do not relax CORS or bind externally just to make a public page's refresh button work.

The sanitized snapshot still contains task names and dates. Do not publish or expose it without authorisation. It contains less internal context, not a guarantee that the business data is public.

## Synthetic tests

    node --test tests/aspro-sync.test.cjs

Tests inject fake fetch responses, a synthetic key and clock. They verify scope rejection, pagination, rate limiting, preserved dependencies, missing/archived/new-task behaviour, sanitized output and localhost HTTP boundaries. They make no requests to a real tenant and perform no Aspro writes.
