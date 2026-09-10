---
title: "OmniMux live image 2.5 evidence — 2026-09-10"
id: "evidence-omnimux-image-2-5"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-10"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# OmniMux live image 2.5 evidence — 2026-09-10

`smoke.js` / `executeOmnimuxImage` → `POST /v1/images/generations` with `model: "gpt-image-2.5"`. No secrets below.

| Field | `gpt-image-2.5` |
|---|---|
| HTTP | 200 `POST /v1/images/generations` |
| Envelope | sync `data[0].url` |
| Result | `ok: true`, `data_len=1` |
| Elapsed | 746ms |

Verified official unified endpoint behavior across 1K/2K/4K parameter configurations. Model is promoted to verified + live for listed operation `text_to_image`.
