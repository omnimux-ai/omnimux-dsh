---
title: "Settings UI placement"
id: "contract-settings-ui"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-09-09"
authors: ["x", "agent-architect"]
subsystem: "omnimux-accounts"
---

# Settings UI placement

Normative seat for OmniMux plugin UI in the official Web Settings panel. Live slot names come from the harness Slot Catalog (`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`). This file is the product rule; official docs win on slot existence.

## Decision table

| Need | Official slot | Where the user sees it | Use when |
|---|---|---|---|
| Product page that is not plugin config (login, profile, chrome) | `settings.section` | Settings sidebar, first-level nav | The page is OmniMux identity or product chrome, not a plugin's knobs |
| Whole plugin management / inventory page | `settings.plugins.tab` | Settings → 插件, one tab | Install, uninstall, list, or a multi-control page owned by one plugin |
| One plugin's compact controls | `settings.plugin.item` | Settings → 插件 → 可配置 tab, one card | A few fields that belong to one Host plugin (bash, agent-loop, web-search) |
| One preference with no page of its own | `settings.general.item` | Settings → 通用, one row | A single toggle or picker |
| A first-level app, library, catalog, or plaza page | Workbench Tab (`ctx.betterSidebar.registerTab`) | Workbench beside the conversation, opened with `window.__omnimuxWorkbench.open({ tabId })` | The page is the plugin itself, not plugin config; follow [workbench-split.md](workbench-split.md), never `claimProductStage` or fall back to overlay |
| Existing overlay-only surface | `shell.overlay` | Hub login gate or Clip canvas-node portal | Only the boundaries in [workbench-split.md](workbench-split.md) apply; the unmounted Apps shelf is dormant and is not the default for new pages; Clip portal MUST NOT claim a product stage |
| Secret (API key, token) | credentials domain (`ctx.credentials` / `api.credentials`) | Value never appears in Settings responses | Always. The UI only shows configured / source / writable |

MUST NOT register plugin config, plugin install, or social-account management as a new `settings.section`. That slot is the first-level sidebar. Adding a row there is how "DeepSeek 搜索密钥" and "DSH 插件" leaked into the nav.

## Current occupants

| Slot | id | Owner | Role |
|---|---|---|---|
| `settings.section` | `omnimux-profile` | `omnimux` | Device login and public profile |
| `settings.plugins.tab` | `omnimux-dsh-plugins` | `omnimux` | Install / uninstall into the `omnimux` profile |
| `settings.plugin.item` | `web-search` | official `ui-settings-plugins` | DeepSeek search key via credentials |
| `settings.plugin.item` | `omnimux` | `omnimux` | Canvas default models (`defaultTextModel` / `defaultImageModel` / `defaultVideoModel` / `defaultAudioModel`) plus `allowAgentSwitchTab`（允许 Agent 切换工作台页面，默认开；见 [agent-workbench-sync.md](./agent-workbench-sync.md)） |
| Workbench Tab | `omnimux-accounts:library` | `omnimux-accounts` | Accounts page registered with `ctx.betterSidebar.registerTab`, not a Settings seat or Apps shelf |
| Workbench Tab | `omnimux-inspiration:library` | `omnimux-inspiration` | 灵感社区 page registered with `ctx.betterSidebar.registerTab`; Host `/omnimux/inspiration` |

Official Settings plugin tabs already occupy `configurable` (order 0) and `all` (order 10). Product `settings.plugins.tab` entries use order ≥ 20 so they sit after the official ones; this ordering does not apply to Workbench Tabs.

## Adding a Settings surface

These steps apply only to the `settings.*` seats above. App and library pages use the registration and opening flow in [workbench-split.md](workbench-split.md).

1. Classify the Settings need with the table. If it is plugin config or plugin management, it is not a `settings.section`.
2. Register with `ctx.slots.inject('<slot>', () => ctx.slots.register({ name: '<same slot>', id, order, label, locale, inject }, Component))`. `name` MUST match the slot.
3. Pick a fresh `id`. Reusing an official id replaces that official cell.
4. Secrets go through the credentials domain. Settings Config may name the reference (`apiKeyEnv`); it MUST NOT store the value.
5. If the official Web Search / Bash / Agent Loop card already covers the field, do not add a product card.

## Review check

A PR that adds `settings.section` MUST justify why the page is product chrome, not plugin config. A PR that adds `settings.plugin.item` MUST justify why a tab is too much. A PR that adds a secret field to Settings Config is rejected.
