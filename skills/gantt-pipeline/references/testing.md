# Tests and forward evaluation

Run from the skill folder with Node.js 20 or later:

```sh
node --test tests/*.test.cjs
```

No packages or real credentials are required. Scheduler tests cover capacity, shared QA pools, milestones, holidays, fixed-source conflicts, grouped batches, unknown estimates, dependency validation, total/free float and safe moves. Pipeline tests cover quote grounding, Aspro identity/idempotency, read-back, PM composition confirmation, source dates and client sanitisation. UI tests exercise the production handlers with a DOM fixture. Export tests inspect generated OOXML. Sync tests inject synthetic responses and start a temporary loopback HTTP server; a sandbox may require local-network permission.

## Forward evaluation

Give an independent agent the skill and a realistic new brief without the expected answer. Use an isolated output directory and no external writes. A useful case is a school website with a home page, catalog, unique course page without a wireframe, applications and migration of old materials; one designer is known, estimates and other capacities are unknown, frontend depends on environment readiness.

Check semantic coverage, accurate supporting quotations, clearly proposed work, unresolved inputs, absence of inherited dates/capacity, valid dependencies, no invented Aspro IDs and enforcement of PM confirmation after real read-back. A local preview is acceptable; fabricating remote writes or an approval is a failure. Inspect what the agent actually produced and fix the procedure rather than coaching the expected output into that run.

## Browser and integration checks

Build the bundled synthetic example with `build --preview` to a new file. Inspect the rendered layout, controls, dependencies, task details, drag/undo, critical/reserve display and spreadsheet export. For refresh, serve it with an injected synthetic bridge: change one task's dates, add a task, refresh twice and verify stable identity, recalculation, draft-label preservation and unestimated new work. Also test a rejected/partial snapshot retaining the old view.

For a requested Google delivery test, import the synthetic XLSX as a native Sheet, inspect timeline colors, dates and critical markings, and read back task counts and frozen panes. A successful local XLSX reader alone is not a Google conversion test. Do not include the resulting private Drive file ID in the distributed skill.

Actual Aspro reads/writes and hosted refresh require the intended tenant, live access, verified scope and applicable authorization. Fixture tests do not verify these. Sites publication requires terminal deployment success and reopening the actual hosted URL. Keep test claims separate from live connection and deployment claims.

## Release checks

Validate SKILL.md frontmatter with the environment's skill validator when available. Check that all relative references exist and no generated client HTML, private project JSON, real bindings, local absolute paths or secrets enter Git. Test from a clean standalone copy before publishing. Output commands use exclusive creation: choose a new versioned filename for each build.
