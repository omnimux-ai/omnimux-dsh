---
title: "Model display-label (alias) convention"
id: "contract-model-display-label"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-31"
updated: "2026-11-09"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# Model display-label (alias) convention

Ordinary character creation does not expose model IDs or require model/group selection; see [product positioning](product-positioning.md). This naming contract applies to retained technical selectors and administrative settings, not a requirement to add model choices to that product journey. Routing IDs remain unchanged.

This contract governs **human-facing model names** in model pickers and selected
model triggers. It does **not** govern routing model ids or internal catalog
metadata.

| Layer | Example | Owner |
|---|---|---|
| Routing / API id | `claude-opus-4-6`, `gpt-5.5` | `cordis.patch.yml` + `CHAT_MODELS` / media SPECS `id` |
| Picker / trigger display name | `claude-opus-4-6`, `gpt-5.5`, `gemini-3.1-flash-lite-image` | Workflow `ModelCascadeMenu` / `ConfigPanel`; composer `ModelPicker` |
| Internal catalog `label` | descriptive metadata | Hub projection; not a user-facing picker name |

Related: [model-list-ownership.md](./model-list-ownership.md) (who owns the id list),
[hub.md](./hub.md) (`modelCatalog` returns both `id` and `label`).

## Hard rules (display label only)

1. **Display the canonical model id.** Every picker row, selected trigger and
   compatible model dropdown MUST render the model id (for example
   `gemini-3.1-flash-lite-image`), with the brand icon where the control has
   icons.
2. **No marketing short names, aliases or channel-group suffixes** in the model
   name. `Claude Opus 4.6`, `Seedance 2.0` and `标准版（主流高品质专线）` are not
   model display names.
3. **Groups stay in the picker.** Channel group names and prices remain in the
   picker's channel column, where the user can inspect them after opening the
   model list; the selected trigger does not show a group badge.
4. **Scope**: model picker/trigger display names only. Parameter option labels
   (aspect ratios `16:9`, resolution chips like `1K`, duration `5s`) are out of
   scope; internal catalog metadata is not governed here.

## Migration note

The previous Issue #321 aesthetic rules (no `-`, Title Case marketing labels,
must not equal raw id) are superseded for model names by this convention. They
remain relevant only to parameter option copy.

## Verification

- Unit: workflow picker/trigger source tests assert `item.id` / `row.id` and no
  group badge or subtitle in the selected model name.
- L3: real canvas selector shows brand icon + canonical id; channel groups stay
  visible in the model list.
