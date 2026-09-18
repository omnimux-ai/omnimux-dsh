# Paper-Cutout Explainer (Documentary Motion-Graphics Style)

A creative pattern for short conceptual explainer videos in a documentary motion-graphics style: a layered paper diorama photographed top-down, hand-scissored shapes in dusty navy on cream paper, one coral-red accent per beat, silent motion with in-scene paper typography, scored under a documentary instrumental.

The subject (the topic being explained) is **always swappable**. Style, structure, palette, framing, typography policy, and pacing **stay locked**.

## 1. When to use this pattern

**Use it when:**
- The brief is "explain / illustrate / visualize X" — a concept, trend, statistic, or domain (a technology, climate, an industry shift, a how-something-works).
- The deliverable is short-form social (Reels, TikTok, Shorts), 9:16, ~20–30s.
- The audience reads as curious / informational — people who watch documentary-style explainer channels.
- The user invokes explainer-video / paper-cutout / paper-collage / newspaper-clipping / documentary-explainer aesthetics by name.

**Do NOT use it when:**
- The brief is a product ad needing a persona, UGC testimony, talking head, or product hero shot.
- The user wants 3D, cinematic live-action, photorealism, or slick vector flat-design.
- The user wants spoken VO over the visuals (this pattern is intentionally silent; the on-screen paper typography carries the message).

## 2. Hook & opening — the structural move

**The move:** Open on a static top-down paper-diorama frame, then within the first second one paper element pops in with a 12fps stutter and a hand-cut serif label tags it. The viewer is dropped straight into the diorama — no logo card, no title slate, no persona greeting.

**Example opening beat (hypothetical "history of timekeeping" explainer):**
> "Top-down view of a kraft-paper desk. A horizontal paper timeline runs across the middle of the frame. A small dusty-navy paper cut-out of a sundial pops in on the left in 12fps stutter, with a tiny serif paper tag reading '1500 BCE' beneath it."

**Swap rule:** Replace the *subject* of the cut-out (sundial, X-ray, smartphone, leaf, coin, whatever the topic demands). Keep:
- Top-down framing on kraft paper.
- 12fps stutter pop-in.
- Tiny serif paper tag labeling the element.
- Empty surrounding cream space — let the first element breathe.

Never open with a title card, never open with motion-first abstract shapes, never open with a person.

## 3. Narrative arc — 4 beats × ~6s each

The default total is **24s, 4 scenes**. Each scene is one clean conceptual beat. The arc is a *journey through the topic*, not problem→product→CTA. Pick four beats from the topic that progress logically:

| Beat | Function | Typical visual archetype |
|------|----------|--------------------------|
| 1 | **Anchor / origin** — where this concept starts | Horizontal paper timeline, single labelled element entering |
| 2 | **Scale / shift** — the magnitude or change | Paper bar chart erupting, hand-drawn coral trend line stamping in |
| 3 | **Spread / application** — where it lives now | Paper world map with coral nodes + dashed arc connectors, OR paper smartphone with pop-out cards, OR paper X-ray with coral scan beam |
| 4 | **Implication / future** — where it goes | Paper neural mesh, silhouettes, row of paper figures with icons above each |

Per-beat timing inside each 6s scene:
- **0–1s**: static establishing frame of that scene's diorama.
- **1–4s**: paper elements pop in one-by-one in 12fps stutter, each with its own hand-cut serif tag.
- **4–5s**: the climax moment — the **single coral-red accent** for this scene lands (a banner stamp, a trend line, a detection circle, an underline).
- **5–6s**: subtle paper-flutter / hold to let the eye read the labels.

Do not cut between scenes inside one scene's 6s — each scene is one continuous locked-off (or barely-trucking) shot.

## 4. Visual style spec

- **Aesthetic**: layered paper collage. Every element is a separate hand-scissored paper cut-out with visible jagged edges, slight tears, and a soft drop shadow under it so layers visibly float above each other. The frame must feel like real paper photographed on a desk, not a digital illustration.
- **Textures**: kraft/newsprint paper grain on the background; halftone dot patterns on flat shapes; subtle ink-printed grain everywhere. No clean vector flatness.
- **Framing**: top-down "paper diorama on a wooden / kraft-paper desk", locked-off. Occasional very slow 4–5% truck or zoom across a paper timeline or map only when motivated.
- **Camera grammar**: no whip-pans, no parallax, no rack focus, no perspective shots — flat top-down is the most reliable composition for the renderer.
- **Shot length distribution**: one 6s continuous shot per scene. No internal cuts.
- **Motion language**: 12fps stutter pop-ins for reveals (graphics rendered at 12fps inside 24fps timelines — this stutter is the signature of the style). Subtle paper-flutter on floating elements between reveals.
- **Color palette** (locked):
  - Background: cream / off-white kraft paper.
  - Primary shapes: dusty navy.
  - Ink / type / annotations: soft black.
  - Accent (one moment per scene): a single signature coral-red `#E64A3E` — banners, scan beams, underlines, key data points, hand-drawn asterisks at the climax.
- **On-screen text policy** (this is the key choice): typography lives **inside** the scene as cut-newsprint serif paper labels and hand-drawn ink annotations. Do NOT add a hook overlay, do NOT add post-production text overlays, do NOT add captions. The paper labels ARE the typography.
- **Forbidden**: 3D rendering, smooth gradients, glowing neon, photorealism, slick vector flat-design, AI-render polish, lens flares, glass morphism.

See `references/visual-archetypes.md` for a library of proven scene compositions.

## 5. Voice & persona

**No persona. No VO. No talking head.** The piece is silent.

The "voice" of the piece is carried by:
- The cut-newsprint serif typography (calm, editorial, print-journalism energy).
- The hand-drawn black-ink annotations (arrows, asterisks, underlines, circled callouts) which read as a curious editor marking up a page.
- The music bed.

**Music spec** (one track, full length + 2s tail):
- Genre: documentary explainer / measured cold-open instrumental.
- Instrumentation: warm pulsing synth bass, plucky muted piano, soft analog arpeggio, breathy pad, finger-snap percussion.
- Tempo: 100–104 BPM.
- Mood: curious, measured, slightly hopeful, never urgent.
- `instrumental: true`, duration = total ad length + 2s.
- In assembly: `music_volume: 0.5`, every scene's `audio_url: null`, every scene's `mute_captions: true`.

## 6. CTA mechanic

**There is no spoken CTA, no link-in-bio overlay, no end card.** The pattern intentionally ends on the implication beat (scene 4) and lets the viewer sit with the idea. The aesthetic earns engagement through curiosity, not a hard close.

If a CTA is absolutely required by the brief, the only acceptable form is a final small cut-newsprint paper tag in the bottom margin of scene 4 — short editorial phrasing like a magazine kicker. Do **not** add a separate end-card scene. Do **not** use a hook_overlay or text_overlays in assembly.

## 7. Hard rules — do not regress

Each rule below is a binding constraint for any future render in this style.

1. **Lock all in-frame text/labels as static paper elements** throughout each shot. The motion prompt must explicitly say "all text labels remain locked as fixed paper elements throughout, no morphing, no duplication, no text animation." Without this, the renderer morphs/duplicates small labels mid-shot.
2. **Quote every banner/tag verbatim** in the motion prompt — e.g. `"EXPONENTIAL"`, `"1500 BCE"`, `"8 hrs → 8 mins"`. Unquoted labels drift into typos.
3. **One coral-red accent per scene, at the climax.** Coral on more than one element per scene reads cheap and breaks the visual restraint. Everything else is dusty navy + soft black on cream.
4. **Top-down "paper on desk" framing only.** Perspective shots fail in the renderer. Locked-off camera or very slow 4–5% truck/zoom.
5. **No personas, no products, no brand hero shots, no UGC.** This pattern is conceptual motion graphics. If the brief seems to demand a product render, this is the wrong skill.
6. **Silent scenes only.** `speech_status: silence`, no VO generation, no captions. The paper labels carry the message.
7. **No assembly overlays.** No `hook_overlay`, no `text_overlays`, `mute_captions: true` everywhere. The in-scene paper typography is the typography — adding overlays double-types the frame and kills the aesthetic.
8. **Backend = seedance** for every scene. It handles flat layered paper compositions and small label stability far better than alternatives for this look.
9. **Aspect 9:16, duration 6s per scene, 4 scenes default** unless the user explicitly asks otherwise. Scale by adding or removing whole beats — never by stretching scene length, which dilutes the stutter pacing.
10. **Research is optional, not required.** If style-technique grounding isn't already in context, a single `web_search` + `web_fetch` of a paper-cutout / documentary-explainer breakdown article is enough. Do not over-research.

## Companion references

- `references/visual-archetypes.md` — proven scene compositions by beat function (origin, scale, spread, implication) with descriptive layout prose.
- `references/director-payload-template.md` — the per-scene director payload skeleton with the locked style_direction paragraph and motion_prompt structure.