# HTML, spreadsheets and Sites

## Same Gantt model

The bundled shell/style/app/scheduler/export assets are the maintained template. Build embeds them and sanitized project data into one HTML. Do not recreate the UI by hand for each project. Preserve source-date mode, configurable stage durations/capacities/calendar, stage/workstream views, collapse, zoom, dependencies, resource critical links, both floats, drag/undo, scenario JSON/share and Aspro task links.

The fixed-source scenario reflects dates in Aspro. It can exceed capacity or violate a dependency; show these conflicts rather than rewriting source facts. A recalculated scenario honors the configured resources. Missing capacities and estimates are not infinite capacity or zero duration. Critical float is valid for the present graph/resource order and calculated scope; reassess after every movement. Milestone readiness permits same-day handoff; ordinary work uses next-working-day finish-to-start.

Client export strips raw source text, internal descriptions and source quotations. Client-safe task titles, schedule, blocker indicator and Aspro links remain. Check task titles for inappropriate internal information before publishing. The skill itself contains no client project data.

## Google Sheets

Export XLSX from the HTML **current scenario**, or build the approved base snapshot:
`node scripts/pipeline.cjs export --project project-linked.json --approval approval.json --out gantt.xlsx`

Prefer XLSX for visual fidelity; CSV is only a flat registry. XLSX must include timeline task blocks and genuine dates, grouped stage rows, frozen labels/calendar headers, stage colors, subtle critical markings, predecessor IDs and float columns. Required sheets: Гант, Задачи, Сценарий, Календарь.

When the user requests a Google version, upload the generated XLSX to the selected Drive destination, open/convert it to native Google Sheets using the available connector or authenticated browser, and read it back. Verify task count, representative early/late/blocked dates, timeline fills, frozen panes and month headings visually. Set the spreadsheet timezone to the project's timezone when supported. Do not change sharing unless authorized. Do not call an XLSX URL a native Google Sheet.

This is a **static snapshot**, without formula-based dependency recalculation or automatic Aspro refresh. New edits should be recalculated in the HTML and re-exported. If the user asks for a formula-based Sheet, that is an additional implementation requirement; do not imply the snapshot already provides it.

## Sites publishing

Use the available Sites connector/hosting workflow when publishing is requested. Inspect/reuse `.openai/hosting.json`. Package only the intended generated HTML/assets, not project.json, approval.json, task operation plans, tokens or full Aspro snapshots. Preserve the selected audience; an open source-code repository does not authorize a public client Gantt.

Push source, record exact pushed HEAD, package that state, save the site version, deploy and wait for terminal success. Reopen the actual URL and verify controls, task links and current data. Report version/URL and current access. Previous working versions remain available for rollback.

## Live refresh deployment

A static HTML opened from disk or a static-only Site cannot contact the Aspro connector. `scripts/aspro-sync.cjs` supplies the same-origin read-only snapshot route when running locally; see sync.md. For a hosted Site, use an authenticated backend and server-side API key, or an available Sites private HTTP tunnel bound to the local bridge, with an authenticated same-origin server route proxying only `/api/aspro/snapshot`. Proxy configuration is specific to the host and must be tested there.

Do not expose the loopback service directly to the internet, allow arbitrary URLs/project IDs from the browser, or publish its credential. Do not claim the refresh is connected until a live Aspro date/title/new-task read has been observed. A mocked end-to-end check verifies implementation only. If hosting cannot supply a protected route, show refresh as unconnected and deliver the verified snapshot path; report that limitation explicitly.

## Rebuilds

The CLI creates output files exclusively and never overwrites an existing artifact. Use a new versioned output path (for example gantt-v2.html) for a recalculation. EEXIST means the selected output already exists, not a scheduling failure.
