# Issue #554 Engineering Summary

## Implemented

- Replaced the pointer-only `menu-direct` interception with the formal `clientAction` command UI contribution declared by the pinned runtime overlay. The native + command list, command names, descriptions, and fuzzy search remain unchanged.
- `add-file` consumes the session provided by the command runtime and invokes the existing `kind: 'any'` native picker path. Cancellation and abort skip materialization, attachment writes, and error toasts.
- `add-from-library` owns its AssetPicker instance through the action session and abort signal. Close, cancel, and scope disposal settle only that action; superseding a session settles the prior owner without restoring its focus. A delayed owner cannot write the tray, close a reopened picker, set its error, or clear its busy state.
- Removed `menu-direct.js` and its MutationObserver/capture/Escape implementation. There is no DOM menu selector, synthetic Escape, Host command execution, or `command/run` / `command/done` invocation in this path.
- Added `patches/dsh-0.1.2-alpha.3/ui-commands-client-action.patch`, updated overlay apply/reset coverage, and retained the pinned `dd6322d604e00eec1ba5e0c8541159906a21094a` / `0.1.2-alpha.3` values.
- The plugin registers the two direct actions only when `commandUi.capabilities.clientAction === true`. Older runtimes expose neither entry and receive one origin-deduplicated local update notice; the Host currently exposes no reliable build/version identity. A reloaded upgraded runtime restores both entries.
- AssetPicker confirmation is owner-guarded: an old delayed request after close/Escape and reopen cannot write the attachment tray or settle the newer action.
- Each runtime action releases its Cordis effect wrapper on resolve, reject, or abort. `ui-conversation` binds the guarded restore hook to InputBar's existing Lexical focus path, and a later same-session popup invalidates an older action's focus restore.
- A registration unload aborts only its own pending actions. File requests receive that lifecycle signal; the AssetPicker remounts by action revision so a cross-session replacement cannot inherit selected, busy, or error state.

## Verification

- Targeted product tests passed: 56 tests across command registration, runtime notice, library ownership, install contract, picker model, kind inference, and assets picker request routing. The shared live-QA runner's 11 tests also passed.
- An isolated exact-pin clone completed product `apply-harness-overlay.sh` → repeated apply (already applied) → `reset-harness-overlay.sh`; `git diff --check` and final `git diff --exit-code` passed.
- The isolated upstream `ui-commands` Vitest run is blocked in this workspace because its shared dependency tree cannot resolve `zustand/vanilla`; it is not reported as a passing runtime suite and remains for the assigned test runner.

## Delivery boundary

The desktop-fork managed runtime-overlay PR is a required dependency. This product PR has not been merged, no runtime has been materialized into a public profile, and neither `/Applications/OmniMux Dev.app` nor port 45120 was restarted or accepted. L2 evidence under `docs/evidence/issue-554/` is preserved but is not a 45120 QA sign-off.

The native `kind:'any'` picker is also blocked: its UTI-union script is present, but no authenticated macOS picker evidence proves mixed file-and-folder selection. Do not treat mocked paths or the script text as native acceptance.

## Consistency verdict

**IS_PASS: PARTIAL** for source, overlay reversibility, and targeted product regression coverage. Upstream package tests and final Electron Dev-App QA remain outstanding.
