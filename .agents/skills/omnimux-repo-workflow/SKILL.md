---
name: omnimux-repo-workflow
description: "Implement and deliver changes in omnimux-dsh through Issue, isolated worktree, scoped verification, PR, and cleanup. Use when changing this repository or when asked to commit, merge, or finish a repository task. Not for read-only questions, product content workflows, upstream Harness work, or unrequested deployment."
---

# OmniMux repository workflow

Input: the user's goal, affected files, acceptance evidence, and authorization already granted in the current task. Output: a reviewed change with exact verification, PR/merge state, and scoped cleanup.

## Prepare

1. Read [AGENTS.md](../../../AGENTS.md), [Git/PR policy](../../../docs/contracts/plugin-git-pr.md), and the relevant contract. Use the current session's decisions; ask only for missing information that changes the result.
2. Record `git status --short --branch -uall` and `git rev-parse HEAD`. Inspect existing work without stashing or overwriting it. Reuse the task's Issue/PR; if implementation needs an Issue, prepare its scope, risk, and measurable acceptance criteria yourself.
3. Fetch the named base (normally `origin/main`). Verify and reuse the current task's isolated worktree. Only create one if none exists or its isolation is unsuitable, using `bash scripts/worktree.sh new <plugin-or-common>-<topic> origin/main --type agent --issue <issue-id>` from the product root. Keep the worktree inside `<repo>/.worktrees/`; do not use the legacy sibling-directory `git-wt.sh` entry. Do not switch the primary checkout for review.
4. For a substantial task, state the plan and put agreed decisions in the owning contract/specification. A clear request to implement authorizes routine preparation; it does not authorize unrelated publication, production changes, or payment.

## Implement and verify

- Select only relevant skills and references. Shared external symlinks are not repository-owned files. Read a skill's exact pause clause before treating it as a blocker; current user instructions take precedence over skill guidelines within system/platform bounds.
- Delegate independent work with bounded inputs, paths, and completion criteria; use separate worktrees for concurrent edits. The coordinator integrates and accepts the result. Do not launch a fixed team for a simple edit.
- Run the change-specific checks in AGENTS and required CI. Reuse successful evidence for unchanged code while it remains valid for the target revision/environment. Do not repeat broad tests after a documentation-only follow-up unless a dependency or evidence contract requires it.
- For UI/Stage changes, follow [plugin QA](../../../docs/contracts/plugin-qa.md): bind the current commit to isolated L2, load ego-browser, run the shared probe in the current isolated ego task/Tab, and preserve same-run identity, runtime proof, and real PNG evidence. Missing ego capabilities are BLOCKED; do not fall back to IAB or the retired weak collector. Do not materialize an unmerged worktree into shared Dev.
- When the pipeline returns `ready-for-agent` (or legacy `ready-for-boss`), retain ownership: read its PR, revision, risk and reports; recheck live authorization/revocation, required checks and independent acceptance, then complete authorized merge and Dev delivery. Do not rerun implementation or treat the handoff as human approval. `--manual` does not grant permission and `--no-merge` / `--no-materialize` must remain respected.
- If an operation fails, inspect its result before retrying. Retry with a changed hypothesis or new state. Preserve the goal, authorizations, Issue/PR, SHAs, evidence, and next action across interruptions.

## Wait and resume

Use a temporary continuation loop when CI, builds, or Merge Queue must finish before authorized work can proceed. An in-progress check is a waiting state, not task completion.

1. Read live state first. If the result is already available, act now. Otherwise, before ending the turn, discover the native scheduling tool and reuse an existing loop for this task. In Codex desktop, use `automation_update` with `kind: heartbeat`, targeting the current task; start with a five-minute cadence. Do not create a standalone task, duplicate timer, or shell polling daemon. If the native tool is unavailable, use a bounded in-turn wait when feasible; otherwise report the unscheduled continuation as blocked.
2. Save a durable prompt with the goal, repository/worktree, Issue/PR, last observed base/head SHA, authorization scope, evidence location, waiting condition, and next action. On every wake-up, read the latest user steering and remote head; results for an old head cannot pass the current revision. Reuse valid unchanged-code evidence and never infer new permissions from a green check.
3. While the operation is pending, keep the loop active and stay quiet unless there is a meaningful change. On failure, inspect logs, fix within authorized scope, run relevant checks, and push only if authorized. On success, complete the next authorized action immediately rather than merely notifying that CI is green. Check required-check coverage and applicable acceptance before any authorized merge.
4. Verify the tool's creation/update receipt and retain its automation ID. Report the scheduled cadence and outstanding condition once; do not claim future execution from a proposed schedule. Keep the same loop through relevant retries and head updates. Scheduling failures do not count as an active loop.
5. On completion, cancellation, or a necessary human-input boundary with no independent work left, pause/delete this loop through the scheduling tool and verify the receipt. Deliver the result or precise remaining decision once. Do not repeatedly poll for user approval, leave an idle loop after completion, or archive the user's task without authorization.

## Deliver and clean

1. Recheck HEAD and dirty paths before staging, committing, and pushing; include only task-owned changes. Review the full diff against the fetched base and run the applicable checks.
2. Prepare the PR with `Closes #<issue-id>`, a concise behavior summary, actual validation, and risk/authorization. Existing task authorization remains effective; record its scope without fabricating a maintainer's approval or auto-approval comment.
3. Follow the Git/PR policy for remote writes and merge. A request to merge includes normal branch/PR preparation; missing paperwork is not a reason to hand the workflow back. Confirmed implementation covers ordinary remote writes, merge and Dev delivery; do not ask again at those stages. Respect explicit local-only or unmerged-PR limits. Passing checks establishes readiness, not new authority.
4. Keep required checks and Merge Queue. After an authorized merge request, read back `state=MERGED`, `mergedAt`, and `mergeCommit`; enqueue alone is not completion.
5. Sync a clean primary checkout with `git pull --ff-only origin main`; preserve existing user changes if it is dirty. Pure instruction/docs changes need no App materialization. For runtime changes, complete Dev materialization and task-specific acceptance under the task authorization before cleanup; independently verify restart target and usage conflicts as required by the Git/PR policy.
6. Preserve evidence, enumerate the exact task-owned worktree/branch/files, and verify they contain no unrelated work. Then run `bash scripts/worktree.sh remove <task> --pr <pr-number>` from the primary checkout; do not use a force flag or broad cleanup.
7. If blocked, state the exact unresolved action, evidence, and next step; do not call a pending PR or skipped check complete.
