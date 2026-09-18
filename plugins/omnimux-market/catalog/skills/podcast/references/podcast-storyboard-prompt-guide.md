# Storyboard prompt guide

Hand-drawn-style **4-panel 16:9** B&W sketches generated with `gpt-image-2`. Lock the chunk shot grammar BEFORE Seedance gets the prompt. **Inputs:** `image_urls = [podcast:composite, persona:<host>, persona:<guest>]`. Output: `podcast:storyboard:A` (or `:B`, `:C`).

This guide gives 3 verbatim storyboard templates plus the color rule, the 180° rule, and the storyboard design rules. Copy a template verbatim and replace the placeholders.

---

## `generate_image` call shape

```python
generate_image(
  prompt="<storyboard prompt — see verbatim templates below>",
  image_urls=["podcast:composite", "persona:<host>", "persona:<guest>"],
  aspect_ratio="16:9",
  resolution="1K",
  model="gpt-image-2",
  output_asset_id="podcast:storyboard:A",  # or :B, :C
)
```

**Asset-id ordering inside the prompt:** the composite is referenced as `the composite reference (first image)` and personas as `the LEFT host reference (second image)` / `the RIGHT host reference (third image)`. Refer to inputs by these positional descriptions, not by any image-index token syntax. Order of `image_urls` must match left-to-right composite seating.

**MUST include in prompt body** (the three mandatory clauses):
1. Strict B&W on `#FFFFFF` paper (see § *Color rule*)
2. Eye-line rule (see § *Eye-line in storyboards*)
3. 180° rule — same camera-side as composite (see § *Camera angle rule*)

---

## Color rule — strict black and white only

Every storyboard prompt MUST contain this verbatim clause near the top of the `prompt` field. `gpt-image-2` does NOT infer "no color" from the word *storyboard* — without explicit B&W language it renders colored marker sketches on cream paper.

```
STRICTLY BLACK AND WHITE — bold black ink linework on PURE WHITE paper background (#FFFFFF), optional gray pencil shading for shadow / fabric / hair mass only. NO color anywhere — no cream tint, no off-white paper, no sepia, no watercolor wash, no colored markers, no accent colors, no color on faces, wardrobe, headphones, mics, set, headers, or footers. If hero references in the image_urls inputs are colored, convert them to grayscale in the sketch — keep facial structure, age, hair shape, glasses, build; drop skin tone, hair color, and wardrobe color. Hand-drawn pen-and-pencil planning sketch, NOT photorealism.
```

The verbatim Storyboard A / B / C templates below already include this clause — copy verbatim and replace placeholders.

---

## Eye-line in storyboards (2+ hosts visible)

- **Wide / two-shot panels**: both visible hosts **look at each other** or **inward toward the conversational center** — NOT locked eyes-to-camera.
- **Speaker close-up**: head / eyes **biased toward the off-frame partner** (where the co-host sits in the composite room) — NOT a flat hero-ref / mugshot symmetry toward the viewer.
- **Listener close-up**: already off-axis toward speaker — keep that; NO "presenting to camera" while "listening".

Repeat these cues **inside every image prompt** so `gpt-image-2` doesn't replay persona plates as "dual news anchors".

---

## Camera angle rule — never the opposite side from the composite (180° rule)

Every panel uses the **same camera-side / camera-side-of-face / camera-side-of-body** as the composite. If the composite shows the LEFT host with **the right side of their face / right cheek facing camera** (because they're seated on the left, three-quarter turned toward the right partner), then close-ups of that host MUST also show the **right side** of their face.

Concretely:

- **LEFT host** in the composite → close-ups show that host's **right** profile / right-three-quarter toward off-frame RIGHT partner. Never a left profile or a flipped angle.
- **RIGHT host** in the composite → close-ups show that host's **left** profile / left-three-quarter toward off-frame LEFT partner. Never a right profile or a flipped angle.
- **Wide variants** (Panel 3 in Patterns A / C — "shifted angle") shift slightly along the same camera side: small horizontal shift, slight elevation, slight dolly — NEVER a reverse angle that puts the camera on the opposite side of the table.
- **No reverse-angle / over-the-shoulder shots from the partner's side.** No impossible cross-the-line setups. No "camera flips around to look at the other host's other cheek".

If the composite makes a desired close-up impossible (e.g. the host you want to show has their **back / far side** to camera in the composite), pick **another** shot from the storyboard grids — do NOT invent the missing angle. The composite is the 180° anchor; the storyboard plays inside that anchor's line.

Repeat the rule inside every storyboard prompt:

```
180° rule: close-up uses the SAME side of the face as the composite reference shows; the camera does not cross the 180° line; if the composite shows this host's right cheek to camera, this panel also shows the right cheek — never the opposite cheek.
```

---

## Storyboard set design rule

- Inside one 4-panel sheet the **opening framing class** must **≠** the **closing framing class** — unless every panel is deliberately ambience-only with no conversational coverage.
- Prefer **ending each sheet on a listening-host close-up**: when sheets are used in sequence, a "lands-on-listener" closer pairs cleanly against any wider or tighter opening framing on the follow-on chunk.

---

## Storyboard A — Dialog turn (wide → speaker CU → wide shifted → listener CU)

Default for chunks with a speaker handoff. Most chunks use this.

```
4-panel storyboard sheet, 16:9 widescreen, hand-drawn pen-and-pencil sketch style on PURE WHITE paper background (#FFFFFF). Layout: 2x2 grid with a thin black border separating panels, generous gap between them.

STRICTLY BLACK AND WHITE — bold black ink linework, optional gray pencil shading for shadow / fabric / hair mass, NO color anywhere — no cream tint, no sepia, no watercolor wash, no colored markers, no accent colors, no color on faces, wardrobe, mics, headers, or footers. Sketchy illustrative style, NO photorealism — this is a planning storyboard sketch.

Two-shot layout, room, chairs, microphones, and on-body wardrobe match the composite reference (first image) in shape and arrangement only — strip all color, render in black ink + gray shading. For close-ups: LEFT host face structure, age, hair shape match the LEFT host reference (second image); RIGHT host face structure, age, hair shape match the RIGHT host reference (third image) — convert each hero plate to grayscale; do not carry any skin tone, hair color, or wardrobe color into the panel. Headphones and clothing follow the composite in shape, drawn black-and-white. Only the framing / camera angle changes between panels.

Eyeline: wherever two hosts appear in the same panel, they face each other / mutual conversation — NOT both staring at the viewer. In single-host close-ups, the visible host's gaze follows the off-frame partner (speaker → listener's side, listener → speaker's side), NOT the camera lens.

180° rule: close-up uses the SAME side of the face as the composite reference shows; the camera does not cross the 180° line; if the composite shows the LEFT host's right cheek to camera, every LEFT-host close-up also shows the right cheek — never the opposite cheek.

PANEL 1 (top-left, sketch label "1 / WIDE TWO-SHOT"): wide establishing shot showing both hosts from the composite sitting in the podcast studio, both visible from the waist up, low coffee table between them with two podcast microphones on boom arms, dim studio walls suggested with simple ink hatching, microphone shapes visible — both hosts oriented toward each other, mutual conversation eyeline, NOT presenting straight to camera.

PANEL 2 (top-right, sketch label "2 / CLOSE-UP OF SPEAKER — LEFT HOST"): tight close-up of the LEFT host — face identity from the LEFT host reference, wardrobe and headphones as in the composite — framing from chest up, head and shoulders dominant in the frame, mouth in mid-speech open position, eyes and head turned toward the right host's position (off-frame) — NOT a flat-on "talking to the viewer" stare. Sketched in the same ink linework.

PANEL 3 (bottom-left, sketch label "3 / WIDE TWO-SHOT, SHIFTED ANGLE"): return to a wide two-shot of both hosts from the composite but from a slightly elevated angle compared to Panel 1, or a small horizontal camera shift. The brief breathing beat before the closing reaction — again: hosts engaged with each other, not eyes locked to lens.

PANEL 4 (bottom-right, sketch label "4 / CLOSE-UP OF LISTENER — RIGHT HOST"): close-up of the RIGHT host — face identity from the RIGHT host reference, wardrobe and headphones as in the composite — framing from chest up, contemplative listening expression with mouth closed, eyes engaged looking toward the left host (who is off-frame in this panel), slight head tilt suggesting active listening — listener looking at speaker, NOT at camera. This is the closing landing shot of the sheet.

Header text above the grid, in plain black ink: "DIALOG TURN — STARTS WIDE, LANDS ON LISTENER"
Footer text below the grid, in smaller plain black writing: "4-shot pattern for 8-15s chunk. First shot and last shot are different framings by design."

Hand-drawn pen-and-pencil style throughout on pure white paper, NOT digital clean illustration — it should look like a director's actual sketched storyboard. Strictly black and white: black ink linework + optional gray pencil shading, no color anywhere.
```

---

## Storyboard B — Monologue continuation (speaker CU → wide → speaker CU different angle → listener CU)

Use when one host carries an extended thought across the whole chunk (no real speaker handoff).

```
4-panel storyboard sheet, 16:9 widescreen, hand-drawn pen-and-pencil sketch style on PURE WHITE paper background (#FFFFFF). Layout: 2x2 grid. STRICTLY BLACK AND WHITE — bold black ink linework, optional gray pencil shading for shadow / fabric / hair mass, NO color of any kind (no cream tint, no sepia, no markers, no accent hues). Sketchy illustrative style, NO photorealism.

Two-shot layout and wardrobe on bodies from the composite reference (first image) in shape only — strip all color, render in black ink + gray shading. Close-ups: LEFT host face structure from the LEFT host reference (second image), RIGHT host face structure from the RIGHT host reference (third image) — grayscale only; do not import skin tone, hair color, or wardrobe color. Headphones / clothing shape consistent with the composite, drawn black-and-white. Only framing changes.

Eyeline: wide shots = mutual / inward (not lens stare); speaker close-ups = toward off-frame listener, not symmetry to camera.

180° rule: close-up uses the SAME side of the face as the composite reference shows; the camera does not cross the 180° line.

PANEL 1 (sketch label "1 / CLOSE-UP OF SPEAKER — LEFT HOST"): tight close-up of the LEFT host — face from the LEFT host reference, wardrobe as composite — continuing monologue, framing from chest up, mouth in mid-speech, engaged expression, headphones visible, three-quarter angle with eyes and head addressing the off-frame RIGHT host — NOT a flat "presenter to camera" frontal.

PANEL 2 (sketch label "2 / WIDE TWO-SHOT, CONTEXT PULL-BACK"): wide establishing shot showing both hosts from the composite, microphones visible, studio setting suggested — a breathing beat mid-monologue to re-anchor the viewer — both hosts in conversation geometry, looking at each other / the partner, NOT at the viewer.

PANEL 3 (sketch label "3 / CLOSE-UP OF SPEAKER — LEFT HOST, DIFFERENT ANGLE"): back on the LEFT host — face from the LEFT host reference, now at a noticeably different angle from Panel 1 (e.g. slight three-quarter toward the listener's seat or a slight low angle). The wide two-shot of Panel 2 buffers this cut — no jump-cut risk even though both panels show the same person in close-up. Gaze still tracks the listener's direction, NOT the lens.

PANEL 4 (sketch label "4 / CLOSE-UP OF LISTENER — RIGHT HOST"): close-up of the RIGHT host — face from the RIGHT host reference, wardrobe as composite — contemplative listener expression with mouth closed, slight head tilt, eyes toward off-frame LEFT speaker, NOT toward camera.

Header: "MONOLOGUE CONTINUATION — STARTS TIGHT, LANDS ON LISTENER"
Footer: "4-shot pattern for 8-15s extended single-host speech. First shot and last shot are different framings by design."

Hand-drawn pen-and-pencil style on pure white paper. Strictly black and white — black ink + gray pencil shading only, no color.
```

---

## Storyboard C — Reaction emphasis (wide → speaker CU → wide both react → listener CU)

Use for comedic / surprise / shock beats where both hosts visibly react.

```
4-panel storyboard sheet, 16:9 widescreen, hand-drawn pen-and-pencil sketch on PURE WHITE paper (#FFFFFF). STRICTLY BLACK AND WHITE — black ink linework + optional gray pencil shading, NO color anywhere (no cream tint, no sepia, no markers, no accent hues).

Layout and two-shot beats from the composite reference (first image) in shape only — strip all color, render in black ink + gray shading. Close-ups: LEFT face structure from the LEFT host reference (second image), RIGHT face structure from the RIGHT host reference (third image) where applicable — grayscale only.

Eyeline: wides with both hosts — they react toward each other / shared beat, NOT a wall of faces to camera; close-ups track partner direction.

180° rule: same camera-side as the composite reference.

PANEL 1 (sketch label "1 / WIDE TWO-SHOT"): wide establishing shot, both hosts from the composite in the studio, neutral attentive posture — mutual / inward gaze, conversational, NOT staring into lens.

PANEL 2 (sketch label "2 / CLOSE-UP OF SPEAKER — LEFT HOST"): close-up of the LEFT host — face from the LEFT host reference — delivering the punchline or shock statement, mouth open mid-speech, expression intensifying — eyes toward off-frame partner (RIGHT), NOT camera.

PANEL 3 (sketch label "3 / WIDE TWO-SHOT, BOTH HOSTS REACT"): wide shot where the laugh or shock lands — both hosts from the composite visibly reacting together toward each other / the shared joke (open-mouth laugh, eyebrows raised, body language shift). Avoid synchronized "freeze and stare at viewer".

PANEL 4 (sketch label "4 / CLOSE-UP OF LISTENER — RIGHT HOST"): emphasized post-reaction close on the RIGHT host — face from the RIGHT host reference — prominent expression (laughter, surprise, shock); eyes toward LEFT / off-frame partner, NOT lens. Closing landing shot of the sheet.

Header: "REACTION EMPHASIS — STARTS WIDE, LANDS ON LISTENER"
Footer: "4-shot pattern for comedic/surprise beats. First shot and last shot are different framings by design."

Hand-drawn pen-and-pencil style on pure white paper. Strictly black and white — black ink + gray pencil shading only, no color.
```

---

## Pattern selection cheat sheet (per chunk)

| Chunk type | Pattern | Reason |
|---|---|---|
| Speaker handoff (one host opens, the other responds) | **A** | Default — establish scene wide, land on listener for clean splice |
| Extended monologue / data drop / personal beat by ONE host | **B** | Starts tight on speaker, wide pull-back as breathing beat |
| Comedy beat / shocked reaction / "wait what?" moment | **C** | Built-in dual-reaction wide in Panel 3 |
| CTA chunk | A or B | Either works — CTA is delivered tight on the host, lands on listener-nod for conversational close |

**Reuse storyboards across chunks of the same pattern.** Generate `podcast:storyboard:A` once if multiple chunks use Pattern A.

---

**Sequencing**: when consecutive chunks reuse a pattern, generate that storyboard once and reuse it (e.g. a chunk sequence of A, A, B, A needs only 2 storyboards — `:A` and `:B` — reusing `:A` on the three A-chunks). **Avoid back-to-back identical opens** at the chunk-to-chunk splice — if a Pattern-B chunk ends on a listener CU and the next Pattern-A chunk opens on a wide, that's a clean reverse-shot — good. If two chunks both end on a listener CU and the next opens on a listener CU, vary one of them.
