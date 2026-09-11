---
name: timeline-discipline
agents: [orchestrator, video-producer, planner, executor]
---

# OmniMux Timeline & Storyboard Discipline

The storyboard table and OpenReel timeline are the physical single source of truth for media production.

## Auto-Asset Invariant
- Any media asset produced by Hub generation (images, video clips, TTS audio) is automatically registered as a project asset with a permanent asset ID.
- Never ask the user to manually re-import generated assets.

## Hunk-Level Incremental Edits
- For partial script or storyboard adjustments (e.g. updating shot 3's dialogue or camera angle), apply targeted field patches (`shot_index`, `field`, `value`).
- Reserve full document or timeline replacements strictly for brand-new project initializations. Never destroy existing timestamps, track IDs, and user manual overrides for minor edits.

## Stage Isolation
- Planner plans only the active stage; Executor executes only within its assigned stage boundaries.
- Never traverse or mutate future stages before prerequisite gates are satisfied.
