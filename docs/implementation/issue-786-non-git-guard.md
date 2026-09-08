# Issue #786 — Non-Git guard classification engineering report

## Result and authorization

**Engineering IS_PASS: NO — guard implementation and global consistency review pass, but required `test:gates` remains 123/128. Not ready for QA release, commit/push, activation, or Issue closure.**

- Issue: https://github.com/omnimux-ai/omnimux-dsh/issues/786 ; independent blocker for #778.
- Authorization: current implementation request explicitly authorizes this minimal BugFix, Issue creation, and isolated worktree; it references the user's 2026-09-08 19:41 confirmation. No fabricated maintainer approval, `/auto-approve`, or `qa:pass` was created.
- Repository: `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`; remote `origin=https://github.com/omnimux-ai/omnimux-dsh.git`.
- Worktree: `.worktrees/common-non-git-guard-786`; branch `agent/common-non-git-guard-786-issue-786`.
- Fetched base, local HEAD and observed `origin/main`: `59c19cdfb15b20556086c2255f3e43d019d66dd4`. Target is this SHA plus the uncommitted two-script diff and this report, not a new commit.
- Created via existing package.json `wt:start` implementation: `WORKTREE_REMOTE=origin WORKTREE_DEFAULT_BRANCH=main bash scripts/worktree.sh new common-non-git-guard-786 origin/main --type agent --issue 786`.
- The workflow skill's old `git-wt.sh start` fallback creates sibling trees and its positional arguments differ from current `wt:start`; the verified current entry was used. No skill or entrypoint was changed.
- #778 remains untouched at `580234923268673562cacb5cd01aebdb780339e1`, with its existing dirty changes. No source writes in main, other worktrees, global skills, official DSH, or hook configuration.

## Verified root cause and minimal change

The entire latest guard and test files (407 lines each at base) were read before implementation. Main `.dsh/hooks.json` matches `edit|write|bash` and invokes `node scripts/guard-worktree.mjs`. The base boolean `isGitTracked` maps unavailable Git, exit 128, and non-Git discovery to `true`; `decideWrite` consequently reports `tracked-file`. Its generic diagnostic falsely attributes this repository hook to DSH core and asserts a tracked primary checkout even for real read failures.

Changes are limited to:

1. [guard-worktree.mjs](../../scripts/guard-worktree.mjs): controlled `LC_ALL=C` / `LANGUAGE=C` for write-related Git queries; internal explicit states `non-git-target`, `git-read-error`, `tracked-file`, `untracked-draft`; accurate repository-hook write diagnostics.
2. [guard-worktree.test.mjs](../../scripts/guard-worktree.test.mjs): nine additional isolated regression cases, retaining all 27 existing cases.
3. This engineering report.

Positive non-Git classification requires **all** of: successful process launch, discovery exit 128, empty stdout, exact C-locale `fatal: not a git repository (or any of the parent directories): .git`, and no `.git` marker or non-ENOENT metadata lookup failure in any canonical ancestor. Other 128s, mixed diagnostics, broken gitdir, permission failure, absent Git, signal/abnormal status, and failed `ls-files` remain conservative denials. Alternate discovery diagnostics (for example filesystem boundary messages) remain denied rather than guessed safe.

The boolean `isGitTracked` export retains fail-closed error behavior for external callers; only the positively identified non-Git state maps to false. `decideWrite` distinguishes actual read errors instead of labelling them tracked. Canonical target resolution, registered linked-worktree identity checks, symlink/dangling-link handling, ephemeral/ignored exemptions, protected new source files inside Git, and destructive-reset logic are unchanged.

This hook is an isolation classifier, **not an authorization system**. `allow/non-git-target` does not grant cross-workspace permission or consume/invent user consent. No authorized-path list, payload override, skip flag, hook disabling, or platform permission change was added. Other workspace authorization rules still apply independently.

## Verification evidence

Environment: macOS, UID 501 (non-root), Node `v25.8.0`, Apple Git `2.50.1 (Apple Git-155)`, pnpm `11.7.0`.

| Check | Actual result |
| --- | --- |
| Red: new tests against unchanged implementation, `node --test scripts/guard-worktree.test.mjs` | exit 1; 35 tests, 29 pass, 6 expected failures, 0 skip; 5321 ms |
| Initial green, same 35 cases | exit 0; 35/35, 0 skip; 5656 ms |
| Final complete guard, after invalid-cwd / unreadable-metadata / failed-ls-files coverage | exit 0; **36/36**, 6 suites, 0 fail/cancelled/skip; 6872 ms |
| `node --check scripts/guard-worktree.mjs` | exit 0 |
| `node --check scripts/guard-worktree.test.mjs` | exit 0 |
| `git diff --check` | exit 0 |
| First actual `pnpm --config.verify-deps-before-run=false run test:gates` | exit 1; 107/128, 21 failures, 0 skip; 90904 ms; background job bash-392 collected |
| Second actual same `test:gates`, with existing dependencies linked read-only | exit 1; **123/128**, 5 failures, 0 skip; 90872 ms; background job bash-393 collected |

The final independent 36-case guard run binds the final script/test hashes below. The gates run began before the ninth added test; its successful nested guard result must not be misreported as a gates run over that last test addition. The addition does not change the five unrelated failed surfaces; no all-green gates run is claimed.

Coverage includes real non-Git protected-looking external target, non-Git cwd with absolute/relative paths, missing parent paths, linked-worktree escapes to main, external and nested primary repos, malformed/copy/unregistered Git metadata, corrupt index, actual chmod(0) directory and metadata errors with finally restoration, invalid cwd, missing Git, exit 42/128, dubious ownership, explicit broken gitdir, mixed error diagnostics, locale-sensitive command fixture, ls-files failure after successful discovery, and unchanged reset/authorization denial. No actual user skill was written. Fixtures perform their own temporary Git commits only; no task-repository commit or remote push was made.

### Private gates environment

Private root: `/var/folders/s4/bq231_q12pg5k216kgk882d80000gn/T/non-git-guard-786-gates.Z5V5xt` (also visible through `/private/var/...`). TMPDIR is its `scratch` directory, outside any repository or pnpm workspace; HOME, XDG config/cache/state, npm cache/store/global and separate user/global npmrc files are task-private. `GIT_CEILING_DIRECTORIES` points to this private root. This avoids #778 fixture/workspace collisions.

Only the existing #778 pnpm 11.7 shim/Corepack cache and already-installed node_modules are read-only inputs. The new tree has an ignored root `node_modules` symlink to `.worktrees/managed-tarball-778/node_modules`. No workspace install or shared-dependency mutation was run. `COREPACK_ENABLE_NETWORK=0`, `COREPACK_DEFAULT_TO_LATEST=0`, `COREPACK_ENABLE_AUTO_PIN=0`, `npm_config_verify_deps_before_run=false`, `npm_config_manage_package_manager_versions=false`, `npm_config_ignore_pnpmfile=true` were set. Existing sync test fixtures may execute normal pnpm installs only in their private synthetic profile roots; these are not actual Dev/Prod profiles.

## Remaining gates failures (not waived)

The first run had 20 missing-dependency failures (`pngjs` / `jsdom` and derived contract failures) plus the Alpha failure. Linking the existing installed dependency closure removed those environment errors, exposing these **five final failures**:

1. `live-qa.test.mjs:78`: `Market must register one footer action`, actual 0 vs expected 1.
2. `live-qa.test.mjs:147`: same footer-action assertion.
3. `live-qa.test.mjs:194`: request state `failed` vs expected `pending`.
4. `verify-ci-gates.test.mjs:71`: Stage contract aggregation fails on the same Market footer assertion.
5. `verify-ci-gates.test.mjs:184`: nested Alpha suite 7/8; `sync-release-policy.test.mjs:159` mixed-target case fails with missing `omnimux-accounts` file-install entry and `profile 依赖刷新后的物化核验失败`.

These source and test surfaces are byte-identical to this fetched HEAD (`git diff --quiet HEAD -- scripts/live-stage-contracts.mjs scripts/live-qa.test.mjs scripts/verify-ci-gates.test.mjs scripts/sync-release-policy.test.mjs scripts/sync-stable.sh plugins/omnimux-market` exit 0). The current `live-stage-contracts.mjs:124–125` still requires `sidebar.footer.action`; Market's current tests explicitly require its removal. Alpha failure resembles #778's already recorded repeated-install issue, but this report does not claim a new controlled base/current causal experiment for it. No assertion, fixture or sync implementation outside the two allowed files was changed; no environment flag was added to mask the behavior.

Required next action belongs to the coordinator: resolve/assign these out-of-scope baseline failures under their owning task authorization, then rerun the exact gates against the intended integration baseline. Do not claim IS_PASS YES or send this as an accepted QA candidate while required gates fail.

## Applicability, consistency, and activation

Under [plugin-qa §适用矩阵](../contracts/plugin-qa.md), this changes pure standalone admission-script logic/tests, not Host/plugin/UI/Electron behavior. Its runtime dependencies are Node, Git and filesystem metadata, all exercised through the actual stdin/stdout hook subprocess in isolated tests. **L2 / ego-browser / Electron: N/A for this engineering change**, not PASS. Gates' fake browser/Host fixtures are unit evidence, not live L2 evidence. Independent QA must confirm this applicability and the actual diff; no QA label or fake runtime receipt exists. CI/PR/Merge Queue and activation are unexecuted, not N/A successes.

Global cross-file consistency review: **PASS for implementation consistency**. Imports and the boolean public API remain compatible; internal states are handled by `decideWrite` and corresponding deny diagnostics; existing realpath/worktree checks are unchanged; no duplicate exported implementation, new dependency, config mutation, or scope expansion. Source diff: 57 additions / 10 deletions; tests: 134 additions / 1 deletion (191 additions / 11 deletions total). Overall engineering IS_PASS remains **NO** because applicable gates have not passed.

Final source SHA-256:

- `scripts/guard-worktree.mjs`: `2830eb4e3eccc1cae845846d3eb73c038927c5cd633172cc3c5f41e33e40ffde`
- `scripts/guard-worktree.test.mjs`: `6355f8021706d2cb930ae73338e192cbc09fb0226a1ebb4774f055c347762002`

Primary checkout remains clean `main`; final observed base/remote SHA unchanged. There is no task commit/push/PR, no main hook replacement, and no parent-session activation attempt. All started background jobs were collected; no test job is left running. Task worktree and private test environment are retained for evidence/retest, not cleaned as if merged.

After gates and independent QA pass, the coordinator follows normal authorized commit/push → PR `Closes #786` → required CI checks → Merge Queue. Only after GitHub confirms MERGED does the clean main checkout update through `git pull --ff-only origin main`. The unchanged project hook configuration then invokes the legally merged main script on subsequent hook executions. Verify the actual owning session's hook invocation and scoped behavior after that update; do not copy candidate files over main, edit configuration, or attempt parent-session hot activation. Closing this blocker does not by itself complete #778's backup repair, transaction tests, or runtime acceptance.
