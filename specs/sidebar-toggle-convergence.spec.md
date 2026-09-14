# Sidebar toggle convergence — Issue #1761

## Objective
Repair the right sidebar expand/collapse journey without changing visual design or adding parallel state ownership. Baseline: c8f4b6300b20c3cba36b75846f0d13d6b49531eb. Retain unmerged work for demonstration.

## Success criteria
- Conversation-only: click the visible top-right expand button once; the original sidebar content reappears in its saved native mode (split after split, fullscreen after fullscreen), never flashing back to closed. This preserves native mode ownership without an invented mode API.
- Narrow viewports retain native automatic-fullscreen behavior: Exit fullscreen may collapse when split cannot fit.
- Split: click collapse once; sidebar closes and conversation remains visible at full available width.
- GUI fullscreen: click collapse once; conversation-only appears, never an empty workspace.
- Native GUI fullscreen: click Exit fullscreen once; split appears when space permits. Legacy registered workbench: click Show conversation once; split appears. The legacy journey requires its real service and toggle cluster; an unavailable legacy runtime must be reported as unverified, not inferred from native Files.
- Repeat open/close at least three cycles; each physical click has one effective action, controls do not duplicate, tabs and content remain intact.
- Left navigation collapsed/expanded state and its physical rail width are unchanged by every right-side action. Native shell folded rail (observed56px) remains native-owned; legacy hidden rail remains0px. Fullscreen must not cover a native folded rail. Closing the right sidebar leaves its track0 and conversation fills only the area after the native rail.
- With right sidebar closed and conversation visible, the left rail must not continuously shrink through measurement feedback; use the shell-owned track under CSS width overrides.
- Reload restores a usable conversation and permits native sidebar reopening. The packaged shell's non-persisted left rail resets to its default expanded state on reload; subsequent right actions must preserve that default. This repair does not introduce a second persistence owner for shell layout.
- Native React event delegation and moved-node events are tested with real DOM event propagation; no regex-only or hand-written dispatch model substitutes for this coverage.

## Commands
- `node --test plugins/omnimux/src/client/sidebar-toggle-topbar.test.js plugins/omnimux/src/client/split-compact-layout.test.js plugins/omnimux/src/client/rightbar-collapse-unhide.test.js plugins/omnimux/src/client/sidebar-native-events.test.js`
- `pnpm --filter omnimux test`
- `pnpm verify:stages`
- `pnpm test:ui`
- `git diff --check`
- Real application Web verification: discover the repository-supported isolated launch path; dynamic port, fresh task-owned profile, no shared Dev access. Record executed invocation, PID, URL, code identity, observed selectors, PNGs and cleanup in evidence. The existing hand-written worktree-web fixture alone is insufficient.

## Project structure
- `plugins/omnimux/src/client/sidebar-toggle-topbar.js`: chrome placement and right-control bridge.
- `plugins/omnimux/src/client/workbench.js`, `workbench/{host-adapter,split-layout,focus-state}.js`: existing workbench state owner.
- `plugins/omnimux/src/client/split-compact-layout.js`: geometry observation; inspect for conflicting writes.
- Adjacent unit tests and task-owned evidence/report under `.agent-reports/sidebar-toggle-convergence/`.

## Code style and design
Reuse `design.md` and `docs/contracts/ui-design-guidelines.md`: no new palette, controls, spacing or icons. Existing ESM functions and JSDoc contracts apply. Preserve the native SidebarRight owner and its existing handlers: no extra event interception, private React callback invocation or DOM relocation. Legacy workbench focus does not own native expansion or mode. Observation only releases stale conversation hiding after a native close or same-session fullscreen exit; steady push mode preserves deliberate legacy chat hiding. Reload the page to remove pre-existing anonymous listeners and moved nodes.

## Testing strategy
Spec → implementation → live Web walkthrough → formal E2E based on observed DOM → regression/static checks. Investigate actual sidebar owner API before selecting the bridge. Reuse existing tests; add React + real DOM propagation regression for capture/bubble, moved and native controls, and single fallback dispatch. If actual Web cannot run, report the exact blocker and do not fabricate evidence or mark E2E passed. Continue independent unit/static work.

## Boundaries
Always: isolated task tree, scoped commits, screenshots/structured evidence retained, explicit test outcomes and unknowns. Investigation is parallel in parent-owned audit reports; this agent is sole implementer.
Ask first: dependencies or scope expansion beyond this repair.
Delivery authorization: the user approved the demonstrated result and selected “认可效果，进入合入流程” on 2026-09-14. Scoped commits, PR preparation and merge are authorized after required checks and Merge Queue pass. Never: use shared Dev for agent acceptance, directly edit main checkout business code, official source/distributions, shared profiles, other workspaces, or gate policy. The sole main-root output exception is `.agent-reports/sidebar-toggle-convergence/implementation.md` and retained demonstration screenshots/evidence.

## Plan and documentation impact
Audit event/state owners and parent reports; commit this spec; remove competing paths and route one action to its explicit target; perform isolated real Web verification; write observed-DOM E2E then run regression and static checks; retain unmerged commits and a persistent implementation report. This spec documents the corrected interaction contract; no independent public capability or design-system change is introduced.
