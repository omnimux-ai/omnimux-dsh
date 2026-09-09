# UI audit fixes — authorized delivery

## Authorization and scope

On 2026-09-09 the user explicitly approved: “批准跳过 L2 测试，直接合并物化”. This is a one-task L2 waiver, not a PASS, and does not waive GitHub required checks or Merge Queue. Target materialization is Dev `~/.omnimux-dev` only. No production, official DSH, viewer repository, unrelated profile replacement, or uncoordinated Host restart is authorized.

## Fixed evidence

- Product reviewed HEAD: `1ce51cf7f4f4701e2fe3aab1a6a026a090b0a644`.
- Independent kit HEAD: `0cff2942d1248bffb39176d05b1defa45ff1057a`; no remote configured.
- Second independent QA: 82/82 offline tests passed; see [QA-FINAL-REPORT.md](QA-FINAL-REPORT.md). This delivery does not relabel browser acceptance.
- Five historical assets tgz baseline failures remain disclosed. They are not new passing evidence.
- Source/artifact hashes: [binding.json](binding.json), [repair/delivery.json](repair/delivery.json). These historical manifests remain unchanged.
- Original QA and artifacts remain in place. Fixed kit tarball and Git bundle are retained as reproducible task artifacts; inclusion does not claim an installed managed snapshot.

## Materialization constraint verified before writes

Current official `scripts/sync-to-app.sh` supports `OMNIMUX_DSH_UI_KIT_DIR`, but named plugin scope only compares the authoritative kit hash against the existing managed kit (lines 436–478). It does not replace shared kit. Full scope updates kit and all plugins plus presets. The current request prohibits that unrelated full-profile write scope. `sync-stable.sh` consumes the existing managed kit and refreshes it only for full-plugin sync. Managed tarball mode is not a replacement path for a conflicting existing kit.

Therefore no Dev/profile/store mutation is performed merely to force a new kit into named-plugin sync. A narrower supported kit+selected-plugins transaction is required, or explicit approval for the documented wider write scope. No pnpm-store edits, unrelated stash, baseline activation, or unofficial profile copies are used.

The kit primary checkout contains existing tracked and untracked edits overlapping the task's added components and generated files. It must remain unchanged unless exact ownership and preservation can be established. The clean fixed task worktree and Git bundle preserve the task implementation without fabricating a remote or resetting the primary tree.

## State

L2: SKIPPED by single-task user authorization, not PASS.
Dev runtime acceptance: NOT RUN; materialization is constrained as above.
PR/merge: pending live GitHub checks and formal merge receipt; this document is not a merge receipt.
