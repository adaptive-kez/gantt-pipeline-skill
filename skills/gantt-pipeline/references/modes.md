# Modes and decomposition

## Website — primary workflow

Use the actual sitemap/wireframes and brief. Distinguish a reusable page template from unique implementations, shared components, and content population. Do not count a shared template again for every content instance unless the brief requires individual production. Keep the PM's sections and naming conventions when existing projects have them.

Typical deliverables, only when in scope:
- preparation: repository/environment moves, CMS setup, domains, redirects, content/data migration;
- page families: home, service/direction hubs and details, industries and unique landing pages, work archive and case templates, team, editorial, career and vacancies, contact/forms/legal;
- design and approval, layout UQA, frontend, backend/integration batches, implementation QA, acceptance and launch;
- responsive states, accessibility, forms/errors/loading/empty states, integrations and browser coverage from requirements.

A career-site redesign and a CMS/hosting/recruitment migration are distinct deliverables with dependencies. A unique industry page without a selected industry/wireframe remains blocked; a generic template does not silently satisfy it. Unknown copy and case assets have explicit readiness conditions.

After the PM supplies estimates, model the pipeline: page design+approval → page UQA → page frontend; backend batch waits for **all** referenced frontend tasks plus integration prerequisites. Batch size and membership are project decisions. Do not copy a four-page/six-day batch, three designers, or one QA from another project. Frontend readiness uses the actual GitHub/environment gate and page UQA; no implicit extra week.

Ask for designer/QA/frontend/backend stream counts and whether pools are shared. Omit assignees when not provided. Distinguish duration in working days from Aspro `time_estimate`, whose unit must be verified rather than assumed.

## Identity — supported structure, refine with the PM

Start from research/positioning, concept directions, selected concept development, approval, identity system, applications, brand guidelines and production handoff. A concept round and approval waiting period are not a frontend/backend task. Ask for number of concepts/rounds, decision-makers, required carriers, content/legal dependencies and production formats. Connect only mandatory gates; carriers can proceed in parallel when the system is approved and capacity exists.

## Mobile application — supported structure, refine with the PM

Separate discovery, user journeys/UX, prototype testing, UI/design system, platform implementation, API/backend, device/OS QA and store preparation/review/release. Clarify platforms, shared vs native code, account/API ownership, target devices, store assets and external review uncertainty. Store review is an external gate; do not invent its duration. Shared API or design-system prerequisites should be explicit tasks rather than repeated effort per screen.

## Additional modes

Extend `stageDefs` in scripts/pipeline.cjs and the selected mode guide, keeping the data schema and runtime stage-driven. Add a synthetic sample and behavioral tests for new sequencing; do not add a mode by changing only its label. Stage colors and resource pools are data, not fixed runtime branches.

Actual preparation and migration work consumes capacity. The website mode provides an unestimated setup pool; bind it to the real shared frontend/backend pool when the same people perform that work. Only external readiness milestones have zero duration and no production capacity demand.
