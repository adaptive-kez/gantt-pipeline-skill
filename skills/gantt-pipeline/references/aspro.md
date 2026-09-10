# Aspro connector workflow

Reference: https://aspro.cloud/api/ (REST overview and task schema). Connector schemas take precedence over remembered API field names.

## Read and bind

1. Discover `describe_modules(task/st)` then `describe_entity(task/tasks, st/projects, st/stages)`. Required task binding is `module=st`, `model=project`, `model_id=<project ID>`. Resolve stage field from the current writable schema: deployments may expose `project_stage_id` while relation metadata names `group_id`. Do not guess or send both. Verify the selected field with a preview and subsequent project/section read-back.
2. Select the user's project(s). Read sections and tasks with `list_related` and all pages. `st/projects` alias `tasks` and `st/stages` alias `tasks` are commonly available; use only aliases returned by schema. Keep read fields bounded and avoid unnecessary descriptions, reports, personal or financial fields.
3. Create an internal config with `stageField`, `bindings:{stageId:{projectId,stageId}}` and an optional verified HTTPS `taskUrlTemplate` containing `{id}`. Never use real bindings in the distributed example. A template-owned stage with project_id absent must be explicitly resolved/materialized to its actual project section; the helper intentionally rejects an unverified cross-project section.
4. Normalize the complete read into `{complete:true,projects:[{id}],stages:[{id,project_id}],tasks:[...]}`. `complete:true` is only set after successful pagination. Each task needs id,name,module,model,model_id,the selected stage field,parent_id,ref,ref_id plan_start_date, deadline, status, and description when comparing the managed description. Reconcile copies supplied portal dates and status into the internal model; a missing start remains null even when a deadline exists. A missing field means it was not read, not that the remote value was cleared. Always request these schedule fields for the initial Gantt. Do not claim complete coverage from one page.

## Concrete operation plan

`node scripts/pipeline.cjs plan-aspro --project project.json --config aspro-config.json --snapshot before.json --out operations.json`

This is a **local preview**. The agent submits each operation to create_record/update_record without confirm first, presents the concrete batch and obtains/reuses the applicable user's authorization in accordance with the tool contract. Use confirm:true only after that confirmation. Writes do not run from a shell helper, avoiding stored API keys for task creation.

A new task gets full context, result/acceptance, sources, dependencies and blockers. No estimates are converted from days to hours. Dates, assignments and status are omitted from automatic creation/update payloads. Root tasks use parent_id:0 to avoid inheriting a parent's section.

Identity: `(ref="gantt-pipeline",ref_id="project-slug:T1")`. Re-run reads before creating. A matching explicit remote ID or unique reference is reused. Same-name tasks without a mapping, multiple references or a different project/section halt the affected plan. Do not delete/recreate tasks to fix grouping. Preserve unmanaged manual fields.

`prev_task_id` is a single predecessor, while a Gantt task may need several. Keep the full dependency array in the model and description. If the PM requests native Aspro dependencies, use supported relations after all remote IDs exist; one field cannot represent a backend batch's multiple predecessors. Never replace a multi-dependency set with its first element.

After every batch, capture a fresh complete snapshot and verify every planned task's title, project, section and root parent. Then:

`node scripts/pipeline.cjs reconcile --project project.json --config aspro-config.json --snapshot after.json --out project-linked.json`

If the response to a create/update is uncertain, do not retry the mutation until the reference/record is read back. A missing reference after a failed read is not evidence that creation failed. Stop and explain ambiguity when it cannot be resolved.

## PM gate

Present the verified pool with clickable task links and all unresolved estimates/inputs. Ask the PM to confirm composition. This occurs **after** task creation/read-back, as required by the workflow. Record their actual response using approve; a scope change invalidates the prior approval. Never turn a test fixture's approval into a live project approval.
