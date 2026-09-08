# Issue #786 — Gates alignment engineering report

## Result and authorized scope

**Engineering handoff complete; IS_PASS: NO. Final complete gates: 127/128, one real Alpha repeat-install failure, zero skips.** The four Market-related failures are resolved without weakening gates. The remaining production repair is explicitly outside this continuation's write scope.

- Fixed base and HEAD: `59c19cdfb15b20556086c2255f3e43d019d66dd4`; target is its uncommitted worktree `.worktrees/common-non-git-guard-786`, branch `agent/common-non-git-guard-786-issue-786`.
- The complete 84-line [guard handoff](issue-786-non-git-guard.md) was read before edits. Initial guard hashes match that report.
- This continuation modifies only `scripts/live-stage-contracts.mjs`, `scripts/live-qa.test.mjs`, `scripts/sync-release-policy.test.mjs`, and this report. Authorized `scripts/verify-ci-gates.test.mjs` required no change.
- Guard source/tests, `sync-stable.sh`, product client sources, shared node_modules, skills, hooks and config are untouched. No subagents or QA cross-communication, task commit/push, actual Dev/Prod activation, or browser acceptance were performed.
- `origin/main` moved externally through `ac760e90a21de757bd1204c1ff0af767afb6df13` to final observed `06dc1d6c764bec96ded2d35feaa4ff70004d39a1` during this work. HEAD remains the user-specified fixed base; no fetch, rebase, switch or merge was performed. Independent QA's additional guard files are not this continuation's changes or acceptance evidence.

## Market: actual merged contract and minimum alignment

Merged [PRD](../specs/2026-09-08-skill-workshop/prd.md) lines 21, 59–65, 168–178 require one entry directly below projects, before publish when its original Alpha policy allows it; the old footer must be absent. `git log` identifies base `59c19cdf` as PR #785 / Issue #773.

Read-only implementation evidence:

- `plugins/omnimux-market/src/client/apply.js:85–151`: actual DOM button with `data-omnimux-market-entry`, one coordinator registration `id: omnimux-market-entry`, `rank: 4.1`, actual workbench-open listener, returned registration disposer.
- `apply.js:160–180`: registered visible single Tab with existing `omnimux-market:plaza` identity.
- `plugins/omnimux-workflow/src/client/sidebar-entry.js:81` and `plugins/omnimux-publish/src/client/sidebar-entry.js:81`: neighboring ranks 4 and 4.2.
- `plugins/omnimux/src/client/sidebar-coordinator.js:439–469,503–535`: rank-ordered placement and coordinator disposal contract.
- `plugins/omnimux-market/src/client/workbench-seat.test.js:25–32` and `skill-workshop-ui.test.js`: merged tests explicitly forbid the footer and require rank 4.1.
- `plugins/omnimux/src/plugin-lifecycle.json`: only accounts/publish/analytics are Alpha; Market remains formal-release eligible.

`live-stage-contracts.mjs` now captures the real production coordinator registration and invokes its actual DOM click handler, rather than expecting a removed React footer action. Assertions require zero footer actions, exactly one row and marker, rank 4.1, unchanged formal eligibility, the existing visible single Tab, active-state updates, no duplicate Tab or overlay, collapse/reopen, session isolation/restoration, and removal of row/Tab on disposal. Existing six-method contracts for the other seven targets and empty/loading-state assertions remain intact.

`live-qa.test.mjs` asserts the captured Market adapter/position/selector/Tab metadata. Its synthetic repository previously linked only `plugins`; Node `createRequire` used the synthetic lexical package path and could not resolve root `esbuild`. An existing-dependency read-only `node_modules` link inside each temporary fixture fixes that missing closure. Pending requests still require `pending` and `pass: false`; diagnostic errors are exposed rather than silently accepted.

These controlled Host/DOM checks are unit contract evidence, not private UI acceptance or proof of a real browser/Host. Product client source and the shared live probe were not edited.

## Alpha: independent boundary and production causality

The full 92-line #778 `docs/implementation/issue-778-t01-followup.md` and existing uncommitted fixture / sync diffs were read without changing that tree. Its workspace boundary correction applies here; archive helper copies do not, because this fixed-base `sync-stable.sh` has no archive dependency.

### Workspace discovery red → green

`seedProfile` now writes `pnpm-workspace.yaml` containing only `packages: [.]` (YAML block form). One new case uses an unrelated ancestor workspace and real `corepack pnpm root --workspace-root` to verify discovery remains in the synthetic profile. Without the profile file, the command resolves the ancestor's node_modules; with it, the profile's canonical node_modules path matches. `/var` vs `/private/var` aliases are compared with `realpathSync`, not conflated with discovery errors.

No Alpha success/failure expectation was weakened. The mixed-target assertion still requires exit 0 and now includes stdout plus stderr, exposing the exact install decision.

### Remaining failure after necessary fixture correction

A full original 8-case Alpha suite still passes 7/8 after adding the workspace boundary. The mixed-target case follows an earlier successful Dev install and then selects accounts for refresh:

1. `sync-stable.sh:525–645` stages the selected installed entry under a profile-local recovery directory.
2. The unchanged install call at line 651 invokes pnpm 11.7.0 with optimistic repeat installation enabled.
3. Actual stdout: `Already up to date`, exit 0, without restoring `node_modules/omnimux-accounts`.
4. The unchanged materialization verifier reaches line 754, throws `ENOENT` for that entry, and line 781 reports `profile 依赖刷新后的物化核验失败`; original recovery restores the staged entry and exits 1.

This is not solely missing workspace isolation and must not be hidden by reseeding between sequential policy tests or accepting an install failure.

### Minimal independent real-pnpm probe

`repeat-install-probe.json` records separate hoisted and isolated profiles, each with its own workspace and one local `omnimux-accounts@1.0.0` directory dependency. All inputs are synthetic, offline and ignore-scripts.

For **both layouts**: first install exits 0 with an entry; move the entry aside as production refresh does; frozen repeat install exits 0 / `Already up to date` with entry absent; a single direct pnpm invocation adding `--optimistic-repeat-install=false` restores actual entry bytes, skips resolution, and leaves the lock SHA-256 unchanged: `12b3d535e8348b61b055dd689b3840aca7ca8252fbabd292cf66d31c13d91ec9`.

The diagnostic option was used only for this isolated pnpm experiment, not injected into gate/fixture environment, not added to an alias, and not used to claim the unchanged production sync passes. No force, lock deletion, package copying, registry acquisition, or relaxed assertion was used.

### Coordinator-owned minimal production extraction

The already documented #778 ordinary-sync repair is the precise candidate at `scripts/sync-stable.sh:651`:

```diff
-  if ! (cd "$PROFILE" && pnpm_config_frozen_lockfile=false corepack pnpm install); then
+  if ! (cd "$PROFILE" && pnpm_config_frozen_lockfile=false pnpm_config_optimistic_repeat_install=false corepack pnpm install); then
```

This disables one install optimization only for the operation that has deliberately staged file-install entries. It leaves backup/recovery, install parameters, profile policy, fingerprint validation and gate outcomes intact. **Not applied here:** this continuation explicitly forbids writing `sync-stable.sh`. The coordinator must assign/authorize the extraction owner, retain #778 provenance without copying managed-tarball changes, and require the actual sequential Alpha suite plus full gates on the integrated target. The probe supports this repair path but is not a claimed integrated sync green run or platform-optional acceptance; #778's optional matrix is prior evidence only.

## Private environment and evidence

Evidence root: `/var/folders/s4/bq231_q12pg5k216kgk882d80000gn/T/non-git-guard-786-gates.Z5V5xt` (engineer 135's retained root). HOME/TMPDIR/XDG config-cache-state/npm cache-store-global and distinct user/global npmrc files remain inside it. Node v25.8.0 / pnpm 11.7.0; existing #778 shim and Corepack cache are read-only inputs. `COREPACK_ENABLE_NETWORK=0`, `COREPACK_DEFAULT_TO_LATEST=0`, `COREPACK_ENABLE_AUTO_PIN=0`, `npm_config_verify_deps_before_run=false`, `npm_config_manage_package_manager_versions=false`, `npm_config_ignore_pnpmfile=true`, CI=true; Git ceiling is the private root. No workspace install was executed.

The existing task root node_modules symlink remains unchanged. During testing its inherited dsh-ui-kit link became dangling: it points to main `plugins/omnimux-market/node_modules/dsh-ui-kit`, which no longer existed when checked. The responsible external mutation is unknown. No shared link was repaired. Subsequent contract/final runs set only `NODE_PATH` to this existing physical installed closure:

`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/node_modules/.pnpm/dsh-ui-kit@file+..+..+personal+dsh-ui-kit_@deepseek-ai+dsh-client-ui-primitives@0.1.0-r_01b5a2d96805ee6fa669372349bfb5d4/node_modules`

Its manifest is real dsh-ui-kit 0.1.0; the existing production concat entry bundles it normally. This is dependency resolution, not a kit stub or gate skip. Existing concat writes only ignored task generated output; no client source modification was made.

| Check | Actual result | Evidence file |
| --- | --- | --- |
| Initial `node --test scripts/live-qa.test.mjs scripts/sync-release-policy.test.mjs` | exit1; 15/19, 4 fail, 0 skip | `alignment-red.log` |
| First post-edit attempt | exit1; 15/19; Market blocked by vanished kit link, Alpha still missing entry | `alignment-fixed-fixture.log` |
| New boundary case without profile workspace | exit1; 0/1, ancestor resolution | `boundary-red.log` |
| Same boundary case with profile workspace | exit0; 1/1, 0 skip | `boundary-green.log` |
| Two-layout isolated repeat-install experiment | both original repeat missing; explicit non-optimistic invocation restores, locks unchanged | `repeat-install-probe.json` |
| Market after kit closure, before synthetic-root dependency link | exit1; 10/11; pending request reports missing esbuild | `market-green.log` and diagnostic tool output |
| Final `node --test scripts/live-qa.test.mjs` | exit0; **11/11**, 0 skip | `market-final-green.log` |
| Final `node scripts/verify-stage-contracts.mjs` | exit0; **10 components / 8 actual sidebar targets** | `stages-green.log` |
| Node syntax for three changed scripts; `git diff --check` | exit0 | tool output |
| Final full `pnpm --config.verify-deps-before-run=false run test:gates` | **exit1; 127/128, 1 fail, 0 cancelled/skip; 94436.90275 ms** | `alignment-final-gates.log` |
| Nested final Alpha policy suite | **8/9**, only mixed-target fails; includes new workspace discovery case | same final gates log, lines 150–168 |
| Nested existing guard gate | PASS; preserved 36-case file/hash | same final gates log, line 128 |

The final full suite was started only after final source hashes were frozen and run exactly once in this continuation. All relevant background jobs (bash-394 through bash-399) were collected. No background test remains. The only final failed aggregation is `verify-ci-gates.test.mjs:184`, rooted in `sync-release-policy.test.mjs:177` mixed-target refresh. All four formerly failing Market-related checks pass. Post-run hashes match the table exactly; final `git diff --check` passes. This continuation's source delta is 74 additions / 16 deletions across its three scripts.

## Frozen source identity and consistency

SHA-256, also captured immediately before final gates in `alignment-final-source.txt`:

| File | SHA-256 |
| --- | --- |
| `scripts/live-stage-contracts.mjs` | `5b8c4f41c3564137e8e2c4e65793be1dcc647abc8ba49844329b241dd6acffaa` |
| `scripts/live-qa.test.mjs` | `6d61122aa0a43d15ae4bfb2ed755fd8c670704f869261e7920af65221f12cce6` |
| `scripts/sync-release-policy.test.mjs` | `22ef1ec394df55ffbf2e56b9fd978fb90e9518c571d8d9e3390cf39c2426d18b` |
| unchanged `scripts/verify-ci-gates.test.mjs` | `f9e41ce4ec4f5eeff6ee133fa7568f22f800d577c6d8c36477388be64d23ed0d` |
| unchanged `scripts/sync-stable.sh` | `47bc7c83871fc7a6693e1059ab44e460e7595e6ef1abed4ecb5cc0b6b4d196aa` |
| preserved `scripts/guard-worktree.mjs` | `2830eb4e3eccc1cae845846d3eb73c038927c5cd633172cc3c5f41e33e40ffde` |
| preserved `scripts/guard-worktree.test.mjs` | `6355f8021706d2cb930ae73338e192cbc09fb0226a1ebb4774f055c347762002` |

Global cross-file consistency: PASS for the scoped changes. Imports, fixture closure, descriptor consumers and disposal paths were reviewed together; no public caller signature changed, no duplicate gate implementation or missing method was introduced. Overall engineering IS_PASS remains NO while an applicable gate fails.

## Acceptance limits and next owner

This is standalone gate/fixture alignment and diagnosis, not a new UI or product behavior. Real L2/ego-browser/Electron acceptance is not claimed or performed; pending synthetic requests remain pending/false. Independent guard QA remains separate and is not inferred from this report. No CI/PR/Merge Queue, main hook update, App materialization or Issue closure occurred.

Next owner: coordinator, for the explicitly separated production-sync extraction and integrated rerun/independent acceptance. Do not mark #786 ready for closure while Alpha fails; do not activate candidate guard or copy it into main. Final gates status/count and unchanged post-run source hashes are collected above. The fixed-base worktree remains uncommitted and retained; the report is not an all-green release or activation approval.
