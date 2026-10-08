---
title: "Model display-label (alias) convention"
id: "contract-model-display-label"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-31"
updated: "2026-10-08"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# Model display-label (alias) convention

Ordinary character creation does not expose model IDs or require model/group selection; see [product positioning](product-positioning.md). This naming contract applies to retained technical selectors and administrative settings, not a requirement to add model choices to that product journey. Routing IDs remain unchanged.

This contract governs **human-facing model names** shown in Settings / canvas
dropdowns (`label`). It does **not** govern routing model ids.

| Layer | Example | Owner |
|---|---|---|
| Routing / API id | `claude-opus-4-6`, `gpt-5.5` | `cordis.patch.yml` + `CHAT_MODELS` / media SPECS `id` — may contain `-` |
| Display label / alias | `Claude Opus 4.6`, `GPT 5.5` | `plugins/omnimux/src/catalog/labels.js` (text) and media SPECS `label` |

Related: [model-list-ownership.md](./model-list-ownership.md) (who owns the id list),
[hub.md](./hub.md) (`modelCatalog` returns both `id` and `label`).

## Hard rules (display label only)

1. **No ASCII hyphen-minus `-`**. A catalog model row `label` MUST NOT contain
   `-`. Fail CI / unit tests if any text or media model label includes it.
2. **Spaces separate tokens**; version numbers use `.` when needed (`4.6`,
   `5.5`, `3.7`) — never `GPT-5.5`.
3. **Casing**
   - Brand / family tokens keep their product casing: `Claude`, `DeepSeek`,
     `GPT`, `Gemini`, `Grok`, `Kimi`, `GLM`, `Seedance`, `Seedream`, `Kling`,
     `Midjourney`, `NanoBanana`, `Whisper`, `Suno`, `Veo`, `Wan`, …
   - Tier / mode words are Title Case when English: `Opus`, `Flash`, `Pro`,
     `Preview`, `Mini`, `Sol`, `Quality`, `Avatar`, …
   - Do not ALL-CAPS whole labels; do not lowercase brand names.
4. **Must not equal the raw id** when a curated label exists. Unknown IDs may remain in internal diagnostics, but MUST NOT be used as
   a raw-ID fallback on the ordinary character-creation surface. Existing
   selector behavior requires implementation evidence; this rule is not a
   claim that the current UI has been migrated.
5. **Scope**: model row `label` only. Parameter option labels (aspect ratios
   `16:9`, resolution chips like `auto-4K`, duration `5s`) are out of scope.

## Required renames (Issue #321)

| id | Old label | New label |
|---|---|---|
| `claude-opus-4-6` | Claude 4.6 | Claude Opus 4.6 |
| `deepseek-v4-flash-vision-exp` | DeepSeek 4 Flash | DeepSeek V4 Flash |
| `gpt-5.5` | GPT-5.5 | GPT 5.5 |

Also sanitize other curated labels that still contain `-` (e.g. `GPT-5.6 Sol`
→ `GPT 5.6 Sol`, `GPT-4o Mini TTS` → `GPT 4o Mini TTS`).

## Verification

- Unit: every `modelCatalog.list()` / media SPECS / `TEXT_MODEL_LABELS` value
  has no `-`.
- L3 (optional): Settings / canvas dropdown copy matches the table above.
