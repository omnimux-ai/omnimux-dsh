# Project workspace activation — verification evidence

Date: 2026-11-10
Task: project-workspace-activation-redesign

## Scope verified

- `ProjectNavigationService` resolves a project by `path` to its DSH workspace, reuses/creates a live session, and opens the project `activePageId` canvas without reading `project.sessionId`.
- `WorkspaceContextStore` derives session → workspace → project → activePage from official DSH session/workspace snapshots.
- `CanvasPresenceController` projects workspace-level canvas visibility into the active session.
- `CanvasTab` no longer reads `sessionBinding`, `pickedBySession`, or the global `omnimux:active-canvas-changed` event for target routing.

## Automated checks

| Command | Result |
|---|---|
| `pnpm --filter omnimux-workflow test` | PASS — 3153 tests, 0 failures |
| `pnpm --filter omnimux-workflow typecheck` | PASS |
| `pnpm test:worktree-web workflow` | PASS — worktree web QA 1/1 |
| `pnpm verify:product-baseline` | PASS |
| `git diff --check` | PASS |

## Browser evidence

Worktree web QA generated `workflow.png` under `.workbuddy/evidence/worktree-qa/` for the workflow Stage entry. The run passed with a real Chromium page and saved screenshot/report.

## Notes

`pnpm verify:stages` in this fresh worktree reports an environment fixture mismatch (`default` vs `qa-session-b`); the same command passes in the primary checkout. This is recorded as an environment-level skip reason, not a pass claim.
