# Clip expression consent

## Objective and authorization

Fix the high-severity imported motion-expression execution finding. Importing,
opening, recovering, previewing, or exporting a project must not execute its custom
JavaScript until the local user explicitly allows that exact expression. Preserve
the native editor, serialized expressions, built-in procedural presets, and normal
custom expressions after consent. The user authorized implementation on 2026-09-15;
no additional requirements approval is needed. Public disclosure/remote delivery
is pending the private-first SECURITY.md decision. UI merge requires demonstration.

## Capability map and scope

| Module | Responsibility | Dependency |
| --- | --- | --- |
| video-safe-process-args | Treat video paths as process arguments | none; separate worker spec |
| clip-expression-consent | Gate custom motion code at execution | none |

Both repairs are independent and integrate into one local security patch. Other
scan findings, the separate legacy effects expression engine, production rollout,
provider calls, and upstream vendor updates are out of scope.

## Implementation plan

1. Independently confirm reachability, inspect the fresh boundary report, and
   commit this spec before edits.
2. Gate the common custom-code evaluator with an in-memory approval map bound to
   the expression ID and exact script text. JSON cannot carry approval. Clear the
   map before a project is opened, imported, recovered, created, or replaced by a
   template; preserve it across ordinary clone/edit/undo/export operations. New
   text or a different expression ID needs approval, including recursive callers.
3. Reuse the native graph editor's text/button controls for a visible explanation
   and an explicit allow action. Built-in presets need no code approval. Keep
   imported code and enabled state intact, using the keyed value until approved.
4. Walk through the native editor in an isolated web environment, save screenshots
   and structured evidence, then write regression checks grounded in observed UI.
5. Run focused/package/build checks and a fresh independent security review.

## Source, style, commands

- Native evaluator: `plugins/omnimux-clip/src/client/openreel/core/motion/motion-expressions.ts`.
- Native authoring UI: `plugins/omnimux-clip/src/client/openreel/web/motion/components/GraphEditorPanel.tsx`.
- Regression tests: `plugins/omnimux-clip/src/client/*.test.js` using Node test runner
  and bundled native TypeScript where required.
- Evidence: `docs/evidence/clip-expression-consent/` and task `.agent-reports/`.
- Use existing TypeScript annotations, double quotes, semicolons, and native
  controls/design tokens. No new dependency or parallel editor.
- Package tests: `pnpm --filter omnimux-clip test`.
- Client build: `pnpm --filter omnimux-clip build`.
- Formatting: `git diff --check`.

## Acceptance and verification

- Load synthetic JSON containing an enabled expression that sets a harmless
  browser marker. Preview, timeline evaluation, and export evaluation leave the
  marker absent and return the keyframed/base value before approval.
- A statement-body payload and a recursively referenced expression are also
  blocked. Forged `trusted`, `approved`, IDs, or previously compiled text grant
  nothing. No network or credential access occurs in these fixtures.
- Opening imported JSON or recovering a project clears prior approvals, even if
  IDs and source text match the previous project. Ordinary internal JSON/structured
  cloning retains the runtime grant; edited code needs new consent even with the
  same expression ID. Approval itself is never part of project JSON.
- The native expression panel has positive geometry, shows the code and clear
  warning, and offers an explicit allow action. Typing, import, and the ordinary
  enabled switch do not grant code execution.
- After the local allow action, a benign expression changes the rendered value;
  repeated previews, immutable updates, cross-composition edits, undo, and export
  snapshots preserve that approval during the open project.
- Built-in sine/wiggle and keyframe behavior remain operational without consent.
- Reopening a project asks again for custom-code approval. This session-only
  permission is intentional; project data and formulas are not erased.

## Boundaries and delivery

- Always: synthetic inputs, isolated task worktree, exact-file evidence, source
  preservation, native editor reuse, retained reports, independent review.
- Ask: public disclosure/PR versus private patch, and UI demonstration approval
  before merge. Do not repeat authorization for local fixes or tests.
- Never: mutate shared Dev/production or another workspace, bypass gates, persist
  trust in JSON, execute real malicious operations, or silently drop user code.

Documentation impact: this spec and focused evidence explain the permission
behavior; existing vendor and architecture contracts stay authoritative.
