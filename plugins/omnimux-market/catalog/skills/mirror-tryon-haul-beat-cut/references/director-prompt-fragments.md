# Director Prompt Fragments

Reusable prose for handing scenes to the director in this creative mold. The shapes below are *patterns*, not literal copy-paste. Adapt the outfit descriptions to whatever the user actually uploaded.

## Style direction (keep identical across all scenes in a session)

> Casual mirror-selfie aesthetic. Vertical iPhone framing held at chest-to-eye height. Soft window daylight from one side, no ring light, no studio bounce. Slight handheld micro-sway. Flat smartphone depth of field — no bokeh, no shallow focus. Warm but unfiltered color grade. Authentic UGC feel, not a campaign.

## Persona base outfit (when nothing more specific is needed)

> Warm-brown high-waist trousers and a fitted black tank top. Hair pulled back loosely. Minimal makeup. Standing comfortably in front of a full-length mirror in a sunlit bedroom or hallway.

Swap this neutrally if it visually clashes with the upload palette — e.g. use an oversized white tee + bike shorts for darker outfit uploads. The base outfit must never resemble any of the held-up looks.

## Two-cut outfit unit (the atomic beat)

For each outfit X (with a precise description of what input:image-X shows — color, fabric, silhouette, key detail):

> [Hard cut] [Medium] Model wearing her base look, holding [Outfit X — short precise description] on a wooden hanger up to the mirror at chest height. Small smile, eyes on camera. Hanger hook visible at top of frame.
>
> [Hard cut] [Medium] Same model now wearing [Outfit X — short precise description], small quarter-turn toward the mirror, one hand to hip. Confident neutral expression, lip-bite or hair-tuck. Mirror frame visible at the edge.

## Scene composition (4-outfit / 15s sweet spot)

**Scene 1 — 8 seconds, outfits 1 + 2** (4 sub-cuts):
1. Hold-up Outfit 1
2. Wearing Outfit 1
3. Hold-up Outfit 2
4. Wearing Outfit 2

**Scene 2 — 7 seconds, outfits 3 + 4** (4 sub-cuts):
1. Hold-up Outfit 3
2. Wearing Outfit 3
3. Hold-up Outfit 4
4. Wearing Outfit 4

Each scene is a **single director call** with `[Hard cut]` decomposition inside the visual description, NOT four separate calls.

## Required director-call parameters

- `label`: `scene-1`, `scene-2`, etc.
- `output_type`: `"video"`
- `aspect_ratio`: `"9:16"`
- `speech_status`: `"silence"` (always — this is a music-only ad)
- `PERSONA REFERENCE`: the single `persona:model` returned by setup_persona (reused across scenes)
- `PRODUCT REFERENCE`: list every `input:image-N` used in this scene with a precise prose description so image-to-image preserves outfit fidelity

## What to leave OUT of the director call

- Any text/captions/logos — those go through `assemble_video`'s `hook_overlay`.
- Voice lines, dialogue, ADR cues.
- Audio direction (handled by `music_generate` + assemble).
- Outro / end-card framing.
