# Issue #773 — Session Workspace Resolution and Workbench Sidebar Persistence Engineering Report

## Status
IS_PASS: YES (engineering global consistency).
- Unit Tests: 644/644 passed (0 failures, 0 regressions).
- Static Quality Gate (`auto-qa-gate.mjs`): PASS across all scanned files (SYNTAX, LIFECYCLE, SECURITY, TOKENS, GUARDS all green).
- Ready for coordinator / QA review; no git commit or push executed.

## Scope
Fix defects in OmniMux Skill Workshop ("+ 通过 OmniMux 创建" and "试用" buttons):
1. Clicking "创建 Skill" must trigger the official new session flow or inherit a valid workspace ID, avoiding orphaned sessions without a workspace where the composer textarea is disabled with "选择一个工作区开始".
2. Maintain the right workbench sidebar (`omnimux-market:plaza`) open in the newly created session, establishing a split layout ("左侧导航 + 中间会话栏 + 右侧 Skill 工坊").
3. Safely prefill `/skill-creator\n帮我使用它来创建一个新的技能。首先询问我这个技能应该做什么。` into the enabled composer textarea, preserving CAS protection and strictly prohibiting automatic sending (No Auto-Send).
4. `trySkillInSession` reuses the same enhanced session creation and prefilling pipeline.

## Defect & Root Cause Analysis
1. **Disabled Composer / Orphaned Session**: Previously, `session-create.js` called `sessions.create(workspaceId ? { workspaceId } : {})`. When users opened the Skill Workshop without having an active session selected, `currentItem?.workspaceId` was undefined, resulting in an empty options object `{}` passed to `sessions.create`. DeepSeek Harness allocated an unattached session without a workspace. In this state, the composer is disabled and prompts "选择工作区 / 选择一个工作区开始".
2. **Right Sidebar Closing**: In OmniMux's `betterSidebar`, tab state is scoped per session. When navigating to a brand new session, the new session had no tabs registered as open in `betterSidebar`, causing the right workbench panel to collapse.
3. **Official New Session Parity**: The official left rail "+ 新对话" button (`button[class*=newSession]`) invokes `startSession()`, which resolves `workspaceId ?? currentWorkspaceId ?? recentWorkspace`. Programmatically clicking this button or mirroring its resolution ensures the session is bound to a valid workspace.

## Implementation Details

### 1. `plugins/omnimux-market/src/client/session-create.js`
- **DOM Detection & Official Click**:
  - Implemented `matchesOfficialNewSession(button)`: Matches buttons with class containing `newSession` or `aria-label`/text matching `新对话|新建对话|新会话|新建会话|New session`. Excludes topbar twin and internal menu items to prevent loops.
  - Implemented `findSingleWorkspaceNewSessionButton(doc)` and `findNewSessionMenuItem(doc)`: Handles single-workspace labels (`在...中新建会话`) and collapsed rail popup menu `#omnimux-sidebar-new-menu [role="menuitem"]`.
  - Implemented `clickOfficialNewSession(opts)`: Dispatches clicks to the official control and waits for `sessions.list.subscribe` / polling to confirm session creation or blank reuse.
- **Robust Multi-level Workspace Fallback**:
  - Implemented `resolveFallbackWorkspaceId(sessions, workspaces)`:
    1. Inherits current session's `workspaceId`.
    2. Checks `workspaces.list.getSnapshot().items` to match current session.
    3. Checks `workspaces.list.getSnapshot().recentWorkspaceId`.
    4. Computes recent active workspace across `workspaces.items` using session `updatedAt` / `workspace.createdAt` (identical to official DSH `recentWorkspace` algorithm).
    5. Fallback to most recently updated session with a `workspaceId` in `sessions.list.getSnapshot().byId`.
    6. Fallback matching `currentSession.cwd` against `workspace.path`.
- **Workbench Persistence & Split View**:
  - Immediately following session B activation, calls `window.__omnimuxWorkbench?.open?.({ tabId: "omnimux-market:plaza", sessionId: sessionBId, title: lookup("plaza.title") || "Skill工坊" })`.
  - Calls `wb?.setFocus?.("split")` and `wb?.setConversationCollapsed?.(false, { sessionId: sessionBId })` to reveal the middle conversation pane while preserving the right sidebar.
- **Composer Wait & Non-Destructive CAS Prefilling**:
  - Enhanced `findComposer()`: Inspects textarea candidate selectors and filters out any element with `disabled` or `aria-disabled="true"`.
  - Bounded polling (up to 10s) waits for the composer to become active with a workspace.
  - Checks if user has switched to another session (aborts if `current !== sessionBId`).
  - Strict CAS protection: If composer already contains user text, skips overwriting.
  - Dispatches `InputEvent` (`input`) and focuses the textarea.
  - **Strictly No Auto-Send**: No Enter keydown dispatch, no form submit dispatch, no submit button click.
- **trySkillInSession Parity**:
  - Reuses `createSkillSession({ slug, catalogId, text: `/${slug} ` })`.

### 2. `plugins/omnimux-market/src/client/apply.js`
- Subscribes to `ctx.inject(["workspaces"], ...)` to dynamically inject the `workspaces` service into module-scoped `plazaWorkspaces` without breaking existing `const inject = ["slots", "sessions"]` declarations.

### 3. `plugins/omnimux-market/src/client/skill-workshop-ui.test.js`
- Added 4 test suites verifying:
  1. Official button and collapsed rail menu DOM search and click behavior.
  2. Multi-level workspace ID inheritance fallback.
  3. `window.__omnimuxWorkbench?.open`, split focus, and conversation un-collapse.
  4. `findComposer` skipping disabled textareas.

## Verification Evidence

1. **Client Concat Build**:
   ```bash
   node plugins/omnimux-market/scripts/concat-client.mjs
   # wrote plugins/omnimux-market/lib/client.js (260698 bytes, 21 fragments)
   ```

2. **Unit Tests**:
   ```bash
   npm --prefix plugins/omnimux-market run test
   # tests 644
   # suites 8
   # pass 644
   # fail 0
   # cancelled 0
   # skipped 0
   # duration_ms ~12.8s
   ```

3. **Static Quality Gate**:
   ```bash
   node scripts/auto-qa-gate.mjs . --diff --base 0fe89ef047c687d156204fa48a177d92d590c6a4
   # 🛡️ 严过关 L0 Diff-aware 自动化质检报告
   # 总体评定: PASS: L0 diff-aware 静态门禁通过（扫描 70 个文件）
   # [✓] SYNTAX
   # [✓] LIFECYCLE
   # [✓] SECURITY
   # [✓] TOKENS
   # [✓] GUARDS
   ```

## Global Consistency Review
- **Cross-File Import Consistency**: Passed. No unresolvable references, no cyclic dependencies, `concat-client.mjs` fragments order preserved.
- **Interface Contract Compliance**: Passed. Compatible with official `@deepseek-ai/dsh-client-ui-workspace`, `@deepseek-ai/dsh-client-ui-sidebar`, and `window.__omnimuxWorkbench`.
- **Data Flow Correctness**: Passed. Session ID, workspace ID, tab options, and prefill text propagate cleanly.
- **Safety Boundaries**: Passed. No secrets committed, no out-of-bounds writes, no git commit/push performed.

Verdict: **IS_PASS: YES**
