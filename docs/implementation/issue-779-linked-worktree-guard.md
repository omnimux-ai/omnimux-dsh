# Issue #779 — Linked worktree guard engineering report

## Status
IS_PASS: YES (engineering global consistency). Targeted guard/lifecycle regressions pass 27/27; exact test:gates script under native Node passes 128/128. The pnpm/DSH wrapper invocation has a documented environment failure, not a passing result. Ready for independent QA; no delivery/activation has occurred.

## Scope
Recognize real registered linked Git worktrees by canonical target path and Git metadata, including external repositories and new files. Preserve primary-checkout protections, existing temporary exemptions and bash safety checks. Do not modify `.dsh/hooks.json`, official DSH, Dev or production; no push or merge.

## Identity
- Issue: https://github.com/omnimux-ai/omnimux-dsh/issues/779
- Repository: /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh
- Worktree: /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/linked-worktree-guard-779
- Branch: agent/common-linked-worktree-guard-issue-779
- Fetched origin/main and initial HEAD: 580234923268673562cacb5cd01aebdb780339e1
- Git directory: /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.git/worktrees/linked-worktree-guard-779
- Common Git directory: /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.git

## Preparation evidence
- `pwd`, `git status --short`, `git rev-parse HEAD`, `git fetch origin`: successful; primary checkout has ten pre-existing modified files, preserved.
- `git worktree list --porcelain`: sidebar `.worktrees/issue-1-html-preview` is registered on `fix/issue-1-html-preview`.
- Current guard uses a name substring exemption and session-root tracking checks; external Git exit 128 is treated as tracked.
- `git-wt.sh start` still creates sibling directories, contrary to standard worktree containment. Used `git worktree add -b agent/common-linked-worktree-guard-issue-779 .worktrees/linked-worktree-guard-779 origin/main` without changing that script or using its naming exemption.

## Implementation and global consistency
- `scripts/guard-worktree.mjs`: resolve canonical target (nearest existing ancestor for new files), identify target repository rather than session repository, verify distinct linked/common Git directories, reciprocal gitfile/backlink and exact NUL-delimited worktree registry entry. Reject malformed nested Git markers. Ignore ambient Git redirection for write classification only; bash retains its existing environment and decision behavior.
- `scripts/guard-worktree.test.mjs`: replace machine-local/name-only assumptions with disposable real repositories/worktrees and expand safety regression.
- `scripts/simulate-multi-agent-lifecycle.test.mjs`: replace the stale Phase 1 name heuristic with real registered worktree fixture. The prior test incorrectly classified the running linked worktree as the primary tree and expected a nonexistent named directory to pass.
- Existing ephemeral sets, ignore/draft exemptions, protected scope lists and destructive-command patterns remain unchanged. Symlink classification precedes exemptions.
- Full cross-file review confirms exports/imports and callers remain compatible; no new dependency, hooks.json edit or duplicate implementation.

## Verification evidence
- Git 2.50.1 (Apple Git-155), native Node v25.8.0.
- `node --test scripts/guard-worktree.test.mjs scripts/simulate-multi-agent-lifecycle.test.mjs`: 27/27 pass, exit 0.
- Coverage: same/external registered trees; tracked and missing/deep paths; main and non-main primary checkout; detached worktree; legacy names; canonical alias; directory/file/dangling symlink escape; fake directory/gitfile/copied pointer; Git absent/exit42/exit128; Git environment redirection; ignored/ephemeral/draft exemptions; bash unpushed denial and protocol JSON.
- New fake-.git regression initially failed because Git skipped malformed nested metadata and discovered an outer repository; explicit intermediate-marker rejection fixes it.
- Candidate `decideWrite` for `/Users/x/Desktop/Project/dsh-plugin/personal/dsh-better-sidebar/.worktrees/issue-1-html-preview/src/html-preview-resource.ts` with session cwd at OmniMux main returns `allow`, reason `worktree-isolated`. This is read-only classification, not a sidebar write or active-hook deployment.
- `pnpm test:gates`: automatic dependency bootstrap failed (exit254): missing relative `personal/dsh-ui-kit`. No manifests or lockfile changed.
- Shared existing root/plugin node_modules through task-owned symlinks; `pnpm --config.verify-deps-before-run=false test:gates` runs the unchanged test script without unrelated automatic install. Initial missing pngjs/jsdom/react were resolved by sharing all existing plugin dependency directories.
- Complete pnpm retry: 126/128 pass, exit1 (309 seconds). Lifecycle Phase 1 stale test fixed as above. Other failure: 3 sync-target tests assumed corepack beside DSH Electron process.execPath; that managed private node-bin/corepack does not exist. No sync implementation/test was altered to hide this environment error.
- Exact package test:gates command subsequently launched directly with native Node/corepack to avoid the Electron wrapper mismatch; final result below.
- `git diff --check`: exit0. Primary checkout still lists exactly the original ten dirty paths; no task source was copied there.

## Remaining risk and deployment limits
- A PreToolUse check is not an atomic filesystem sandbox: a concurrent symlink/metadata replacement after check is outside this script's enforcement boundary.
- Existing broad temporary/gitignore exemptions and bash behavior (including missing-upstream handling) are intentionally preserved, not newly secured.
- Git supports the modern `--path-format=absolute` and NUL porcelain flags in the tested environment; unsupported Git cannot obtain the linked-worktree exemption. Hook-runner timeout/fail-open behavior is not changed here.
- Tests are offline, including fake-home sync fixtures; no actual App, Dev or official source changes. No browser/UI acceptance is applicable to this script-only repair. Active hook invocation/receipt and activation remain coordinator QA/delivery responsibilities.

## Delivery boundary
IS_PASS: YES for engineering review; independent QA and subsequent compliant delivery belong to the coordinator. Sidebar Issue #1 remains dependent on this correction until approved activation.

Final full-gates result: native Node executed the exact unchanged package script below, 128 tests passed, zero failures/skips, exit 0, 223 seconds:

```sh
node --test scripts/impact-matrix.test.mjs scripts/authorization.test.mjs scripts/qa-label.test.mjs scripts/ci-verdict.test.mjs scripts/verify-ci-gates.test.mjs scripts/live-qa.test.mjs scripts/ego-browser-page.test.mjs scripts/live-page-preparation.test.mjs scripts/ego-live-qa.test.mjs scripts/live-runtime-proof.test.mjs
```

All changes are uncommitted, HEAD remains 580234923268673562cacb5cd01aebdb780339e1. No PR created, no push, merge, main-copy, hook disablement or profile materialization. Task worktree is preserved for QA. The only extra local artifacts are ignored dependency symlinks to the existing root and plugin node_modules; disposable guard/lifecycle fixtures are removed by tests. No tool-policy write rejection occurred.

Coordinator next action: review these three changed scripts plus this report at the exact worktree, independently confirm the cross-repository decision and primary/symlink denial, then use authorized Git/PR delivery without replacing dirty primary files. Verify active hook receipts separately; candidate CLI success does not prove runtime activation.
