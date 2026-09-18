# Motion Design Flow — Routing Matrix

Default routing decision table. SKILL.md references this file when a request needs to be mapped to a workflow / MDC case. Routing logic in Hard Rules #11 / #12 / #13 and Step 0a take precedence over this matrix — the table here is the "what to do once Step 0 has classified the brief" reference.

---

## Decision matrix

| Request | Workflow / case |
|---|---|
| `"Logo reveal 5s"` | **MDC1** — 1 keyframe → Seedance GRAPHIC OVERLAY MODE |
| `"Brand reel 15s"` (default brand reel ask) | **MDC2** — storyboard → Seedance with full ref + SP1 full-frame composition clause |
| Brief contains: `"production keyframes pipeline"` / `"separate keyframe per shot"` / `"start_image + end_image per chapter"` / `"pixel-perfect per-shot control"` / `"no creative drift between shots"` | **MDC2 default** (MDC2.2 production-keyframes route REMOVED v1.8.2 — not viable). Apply HR-2.2 detailed text spec mandate inside the storyboard prompt for pixel-perfect typography control. If genuinely premium per-shot control needed → escalate to Track B MDC8. |
| Brief contains: `"infographic with product reveal"` / `"data viz transitions to product hero"` / `"dual-state visualization"` / `"animated stats + product endcard"` | **MDC4** — infographic dual-ref (NOT MDC2 sandwich). 2 keyframe pairs. See `motion-design-cases.md § MDC4` for trigger phrase list. |
| `"UI demo"` / `"app tutorial"` | **MDC2 default with Pattern Hybrid** — single 6-panel storyboard with diegetic UI text on 02/04/06 + supporting punch-line copy on 01/03/05, both layers fire across all 6 panels. HR-2.2 detailed text spec mandate enforces verbatim UI element specification. (Previously routed to Plan B production keyframes pipeline; route removed v1.8.2.) |
| Brief contains: `"AE-style smash typography"` / `"letters morphing"` / `"letter assembly"` / `"typewriter effect"` / `"smash-in transitions"` / `"AE post"` | **MDC6** — AE post (NOT MDC2 sandwich). N keyframes + AE/CapCut transitions. See `motion-design-cases.md § MDC6` for trigger phrase list. |
| `"10s handheld charcoal"` | **SP1** pattern |
| `"Premium B&W + male VO"` | **SP5** pattern |
| `"Editorial poster / Saul Bass"` | **SP6** pattern |
| `"Wellness / meditation flat illustrated"` | **SP8** pattern |
| Image attached + multi-panel storyboard shape OR MDC9 phrase trigger (`trigger-phrases.md § MDC9`) | **MDC9** — User-provided storyboard direct-to-video (Track A, v1.7.14). Step 0a routes via `AskUserQuestion` — Branch A → MDC9 (skip new board gen); Branch B → continue to Foundation/Style routing. |
| Image attached + Foundation phrase matches (`trigger-phrases.md § Foundation Mode triggers`) | **MDC7 Foundation Mode** (Track A) — preserve subject identity, build narrative arc around foundation. Hard Rule #11 enforces routing. |
| Image attached + no Foundation phrase + not a user-provided storyboard (default fallback) | **MDC2 Style Ref Mode** (Track A) — extract atmosphere/palette/material via TAKE-5/6, abstract subject. Step 0d.B handles upload pipeline. |
| Product photo attached + Track B trigger (phrase / reference-tier vocab / reference video URL — see `trigger-phrases.md § Track B`) | **MDC8 Product Commercial (Track B)** — character sheet → 9-shot 3×3 → scene video (1 take default) → external editor. Hard Rule #13 routes here. See `track-b-product-commercial.md` for full Track B pipeline. |

---

## Reference tier matrix (v1.8.0)

When route is text-to-video without natural anchor (MDC2 default / MDC4 / MDC6 default) AND no SP-match fires, pick a default-good reference tier from `reference-tier-matrix.md`:

| Tier | Trigger phrases | When to default |
|---|---|---|
| **Premium 3D motion design** | `kinetic concept reel` / `material identity` / brand domains: energy / tech / SaaS / fashion / music label | Default-good for kinetic / brand reels without SP-match |
| **Editorial concept poster** | `concept reel` / `editorial poster` / NGO / journalism / advocacy briefs | Concept-driven reels with text-image semantic escalation |
| **Illustrated motion** | `illustrated` / `2D motion` / wellness / education / playful CPG | Hand-feel / character / playful brand domains |
| **Photographic cinematic** | `documentary brand film` / `automotive commercial` (must be EXPLICIT) | NARROW use only — never default for motion design |

**Critical (v1.8.0):** Motion design is a design discipline. Photographic cinematic = narrow exception. When in doubt → Tier 1 Premium 3D motion design. See `references/reference-tier-matrix.md` for full doctrine.

---

## Track B character sheet vs storyboard sheet chrome (v1.8.0)

Two distinct artifacts in Track B pipeline:

| Artifact | Chrome doctrine |
|---|---|
| **Character sheet** (Track B Step 1) | Production bible — full chrome allowed (top bar / per-view labels / palette swatches / material callouts / model code). Document register, NOT deliverable. |
| **9-shot 3×3 storyboard sheet** (Track B Step 2) | Storyboard sheet — Hard Rule #15 applies (brief panel labels only, no headers / TONE strips / STYLE strips / version tags) |

Track A 6-panel storyboard sheets follow Hard Rule #15 (sheet chrome restraint) — only brief panel labels in margins.

---

## How this table relates to other routing layers

The routing pipeline runs **top-down through three layers**, all consulting their own source of truth:

1. **Hard Rules (in SKILL.md)** — Foundation precedence (#11), attachment resolution (#12), Track A vs B (#13). These set up the gates.
2. **Step 0a image routing (in SKILL.md)** — the procedural gate when an image is attached. Returns a route or asks the user.
3. **This matrix** — disambiguation when the brief signals a specific MDC / SP pattern even without an image attached (e.g. "AE-style smash typography" → MDC6 regardless of image state).

When this matrix and Step 0a disagree, **Step 0a wins** — image-driven routing has higher precedence because misrouting silently corrupts subject continuity (see `validated-failures.md § VF-4, § VF-5`).
