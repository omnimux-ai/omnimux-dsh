# DEPRECATED — Production Keyframes Pipeline (removed v1.8.2)

**This file is deprecated.** The MDC2.2 "production keyframes pipeline" (separate keyframe per shot chained via `start_image` + `end_image` per chapter) has been **removed from the motion-design-flow workflow** as of v1.8.2.

## Why removed

- Pipeline was declared **not viable for production** — separate per-shot keyframes generated through 6 imagegen calls + chained Seedance produces creative drift between shots that no anti-drift guard can close
- Routing collisions with MDC2 default + MDC2 Style Ref made trigger phrase boundary fragile
- Plan B "fallback for grid leak" justification superseded by the clip-prompt 4-layer sandwich + anti-bleed clause at L1 (v1.7.13) which solved grid leak at video layer, not at pipeline-restructure layer

## What replaced it

- **Grid leak prevention** → clip-prompt 4-layer sandwich + Rule 10 PHOTOGRAPHIC FRAME PURITY inside-frame guard
- **Per-shot control** for premium product reels → **MDC8 Track B Product Commercial** character sheet → 9-shot 3×3 storyboard pipeline (`track-b-product-commercial.md`)
- **Text-heavy reels** → MDC2 default with HR-2.2 detailed text spec mandate (every UI/typography element specified verbatim)
- **UI tutorials** → MDC2 default with Pattern Hybrid (diegetic + supporting text layers)

## Routing impact

Any brief that previously matched MDC2.2 trigger phrases — `"production keyframes pipeline"` / `"separate keyframe per shot"` / `"start_image + end_image per chapter"` / `"pixel-perfect per-shot control"` — now routes to **MDC2 default** (single storyboard sheet → Seedance with full sheet ref). If pixel-perfect per-shot control is genuinely required, escalate to **Track B MDC8** via reference-tier vocabulary or explicit Track B trigger.

## History

- v1.7.x — MDC2.2 introduced as "Plan B fallback" when sandwich anti-grid failed
- v1.7.13 — anti-bleed clause in L1 + Rule 10 closed grid leak at video layer; MDC2.2 utility diminished
- v1.8.2 — MDC2.2 removed from routing; this file kept as deprecation stub to preserve historical context

**Do not write new prompts referencing this pipeline.** Route through MDC2 default or Track B MDC8 as appropriate.
