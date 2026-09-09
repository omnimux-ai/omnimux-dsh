---
name: omnimux-repo-workflow
description: "Implement and deliver changes in omnimux-dsh through Issue, isolated worktree, scoped verification, PR, and cleanup. Use when changing this repository or when asked to commit, merge, or finish a repository task. Not for read-only questions, product content workflows, upstream Harness work, or unrequested deployment."
---

# OmniMux repository workflow

Input: the user's goal, affected files, acceptance evidence, and authorization already granted in the current task. Output: a reviewed change with exact verification, PR/merge state, and scoped cleanup.

## Prepare

1. Read [AGENTS.md](../../../AGENTS.md), [Git/PR policy](../../../docs/contracts/plugin-git-pr.md), and the relevant contract. Use the current session's decisions; ask only for missing information that changes the result. Before editing any skill, resolve whether this path is an in-repo file or a symlink to an external shared source; only in-repository skill files may be changed in this repo. This skill's true home is `.agents/skills/omnimux-repo-workflow/SKILL.md` in omnimux-dsh.
2. Record `git status --short --branch -uall` and `git rev-parse HEAD`. Inspect existing work without stashing or overwriting it. Reuse the task's Issue/PR; if implementation needs an Issue, prepare its scope, risk, and measurable acceptance criteria yourself.
3. Fetch the named base (normally `origin/main`). Verify and reuse the current task's isolated worktree. Only create one if none exists or its isolation is unsuitable, using `pnpm wt:start <plugin-or-common> <topic> <issue-id>` from the product root. If package-manager bootstrap would rebuild unrelated packages, use `bash scripts/git-wt.sh start ...`. Do not switch the primary checkout for review.
4. For a substantial task, state the plan and put agreed decisions in the owning contract/specification. A clear request to implement authorizes routine preparation; it does not authorize unrelated publication, production changes, or payment.

## Implement and verify

- Select only relevant skills and references. Shared external symlinks are not repository-owned files. Read a skill's exact pause clause before treating it as a blocker; current user instructions take precedence over skill guidelines within system/platform bounds.
- Delegate independent work with bounded inputs, paths, and completion criteria; use separate worktrees for concurrent edits. The coordinator integrates and accepts the result. Do not launch a fixed team for a simple edit.
- Run the change-specific checks in AGENTS and required CI. Reuse successful evidence for unchanged code while it remains valid for the target revision/environment. Do not repeat broad tests after a documentation-only follow-up unless a dependency or evidence contract requires it.
- For UI/Stage changes, follow [plugin QA](../../../docs/contracts/plugin-qa.md): bind the current commit to isolated L2, load ego-browser, run the shared probe in the current isolated ego task/Tab, and preserve same-run identity, runtime proof, and real PNG evidence. Missing ego capabilities are BLOCKED; do not fall back to IAB or the retired weak collector. Do not materialize an unmerged worktree into shared Dev.
- If an operation fails, inspect its result before retrying. Retry with a changed hypothesis or new state. Preserve the goal, authorizations, Issue/PR, SHAs, evidence, and next action across interruptions.

## Deliver and clean

1. Recheck HEAD and dirty paths before staging, committing, and pushing; include only task-owned changes. Review the full diff against the fetched base and run the applicable checks.
2. Prepare the PR with `Closes #<issue-id>`, a concise behavior summary, actual validation, and risk/authorization. Existing task authorization remains effective; record its scope without fabricating a maintainer's approval or auto-approval comment.
3. Follow the Git/PR policy for the final merge action. A request to merge includes normal branch/PR preparation; missing paperwork is not a reason to hand the workflow back. Without the required authorization, finish the reviewable PR and ask only for that remaining action.
4. Keep required checks and Merge Queue. After an authorized merge request, read back `state=MERGED`, `mergedAt`, and `mergeCommit`; enqueue alone is not completion.
5. Sync a clean primary checkout with `git pull --ff-only origin main`. Pure instruction/docs changes need no App materialization. For runtime changes, complete authorized Dev materialization and task-specific acceptance before cleanup.
6. Preserve evidence, enumerate the exact task-owned worktree/branch/files, and verify they contain no unrelated work. Then run `pnpm wt:clean <topic> <issue-id> --pr <pr-number>`; do not use a force flag or broad cleanup.
7. If blocked, state the exact unresolved action, evidence, and next step; do not call a pending PR or skipped check complete.
