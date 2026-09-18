# Composite prompt guide

Master wide of host + guest seated in their podcast studio. **Inputs:** `image_urls = [persona:<host>, persona:<guest>]` in left-to-right seating order. Output: `podcast:composite` — re-attached to every chunk's `reference_images[0]`.

**Realism is the goal.** This must read as a still from an actual recorded long-form interview podcast — NOT a produced commercial. If the output looks cinematic / polished / ad-like, the format breaks. Photorealistic, flat documentary lighting, natural skin texture, no dramatic key light, no shallow-DOF "look at the cinematography" framing.

---

## `generate_image` call shape

```python
generate_image(
  prompt="<composite prompt — see scaffold below>",
  image_urls=["persona:<host>", "persona:<guest>"],
  aspect_ratio="16:9",
  resolution="1K",
  model="gpt-image-2",
  output_asset_id="podcast:composite",
)
```

**Asset-id ordering inside the prompt:** `gpt-image-2` reads the `image_urls` array in order. Refer to them in the prompt body as `the host reference (first image)` / `the guest reference (second image)` — do NOT use `@Image1` / `@Image2` syntax. Our prompt body uses natural language identifiers.

---

## Eye-line on the composite (HARD)

The persona refs were generated frontal eyes-to-lens (identity plates). In the **composite wide**, that rule **does NOT apply** — both hosts staring at the lens reads as "news anchors", not "two people mid-conversation".

- **Default**: each host's **gaze and head turn toward their co-host / across the table** (natural conversation geometry; slight off-axis is fine).
- **Forbidden**: both hosts staring into the lens; both faces perfectly frontal to camera while "in conversation".

**Spell out mutual / inward gaze inside the prompt body** — see the scaffold below.

---

## Microphone placement (HARD)

Place a working microphone close to each host's mouth — boom-arm broadcast mic, desktop cardioid, or lavalier. Mic basket within ~20–30 cm of mouth, angled at it.

- **No phantom / decorative mics on the table** while the hosts speak into thin air.
- **No mics pushed back against the wall.**
- **No mic shared between two hosts.**
- **NEVER name a specific mic model** — `gpt-image-2` renders the brand text onto the mic body. Use a generic shape only: "a plain unbranded large black studio condenser mic on a black boom arm".

---

## Location-as-positive-description (HARD)

`gpt-image-2` is steered by **what is in the frame**, not what is forbidden. Do **NOT** write any of the following into the prompt:

- Negation clusters (`no`, `not`, `without`, `zero`, `NEGATIVES:`)
- Imperative instructions to the model (`make sure`, `avoid`, `keep the backdrop white`, `do not include`)
- Meta-language about excluded objects (write "warm wooden walls" not "NO concrete walls")
- Meta-language about branding (just don't mention brands; do not write "no logos")

Steer through **what is in the frame**, not what is forbidden.

### Default lighting policy

**Default = non-warm.** Cool / neutral by default: overcast daylight, white or blue LED, fluorescent, moonlight, daylight-balanced overhead.

**Only use warm lighting when the brief explicitly calls for a warm / cozy / golden look.** If the brief contains no such signal, treat the scene as cool / neutral.

When no warmth signal is present:
- *Positively* steer toward cool / neutral imagery (daylight-balanced overhead light, pale concrete, matte steel, brushed aluminium, pale ash, grey linen, desaturated clinical palette, overcast windows, white LED practicals).
- **Silently keep out** of the generated prompt text any warm-toned cues — golden / sunset / amber / tungsten lighting, dim / low-key / moody / intimate ambience, candle or incandescent practicals, warm-graded daylight, and warm-toned materials (cognac leather, mahogany, dark walnut, brass).
- Stay photoreal — don't over-correct into noir or unmotivated cold light.

Reach for the warm variant scaffold (last sample below) ONLY on an explicit warmth signal.

---

## Composite scaffold (replace `[BRACKETS]`)

```
Photorealistic documentary still from an actual recorded podcast interview — ONE single continuous wide shot, 16:9, looks like an authentic still grabbed from a real long-form interview episode. TWO HOSTS seated in [SETTING — specific named environment matched to topic + tone].

SETTING: [LIGHTING DESCRIPTION — flat, motivated, realistic — like real studio lighting, NOT cinematic key light], [WALL / SURFACE TEXTURE — specific material palette, real-world textures], two [SEATING — matching chairs / stools / couches appropriate to the setting] facing each other separated by [SURFACE BETWEEN — coffee table / bistro table / low bench], with two plain unbranded large black studio condenser microphones on black boom arms (one per host, basket close to each mouth). [AMBIENT DETAIL — daylight through window / overhead fluorescent / overcast / LED panels — natural realistic light sources]. [CEILING DETAIL]. [FLOOR DETAIL]. [BACKGROUND DEPTH — what the viewer sees in the distance, real-world objects, NOT abstract decor].

LEFT HOST: reproduce the exact face and appearance from the first image (host reference) — same person, no face changes; keep the same hair, same grooming, same wardrobe shape, same matte-black over-ear headphones. Place them in the LEFT seat, torso and head angled toward the right host / across the table (NOT squared to the lens), casual relaxed posture with hands resting on the chair arms or one hand gesturing slightly toward the right host, eyes and attention on the co-host, mouth closed in an attentive neutral expression.

RIGHT HOST: reproduce the exact face and appearance from the second image (guest reference) — same person, no face changes; keep the same hair, same grooming, same wardrobe shape, same matte-black over-ear headphones. Place them in the RIGHT seat opposite the host, torso and head angled toward the left host / across the table (NOT squared to the lens), casual relaxed posture, hands resting on the chair arms, eyes and attention on the co-host, mouth closed in an attentive listening expression.

Wide-shot framing showing both hosts FULL UPPER BODY from the waist up, mid-distance camera angle roughly two to three metres away, eye-level (NOT a low angle, NOT cinematic gravitas). Both hosts visible in a single frame, mutual conversation eyeline — looking at each other, not at the camera (brief glance toward a mic or down at the table is OK; no broadcast "both staring down the barrel"). Documentary realism. Both hosts in mid-conversation pose, mouths closed, neutral attentive expressions. Realistic depth of field (modest, not extreme bokeh), both hosts in focus, background slightly softer but environment readable. Plain solid-colored wardrobe with a clean blank surface. Photoreal grain, natural skin texture, NOT smoothed or stylized. [TONE PHRASE — e.g. "naturalistic documentary still" / "minimalist daylight interview studio" / "real long-form podcast moment"].
```

---

## Sample composites

These illustrate the scaffold filled in. Do not copy a sample and swap nouns — write the SETTING block fresh for your topic. The `LEFT HOST` / `RIGHT HOST` blocks are reusable verbatim.

### Sample — cool / neutral daylight studio (default, non-warm)

```
Photorealistic 16:9 documentary still of a podcast in progress, naturalistic — looks like an authentic still grabbed from a real long-form interview episode, — NOT a multi-panel layout, ONE single continuous wide shot. TWO HOSTS seated in a minimalist modern podcast studio interior with cool overhead key light from recessed ceiling spots with frosted diffusers, pale grey concrete walls with subtle plaster texture.

SETTING: cool daylight-balanced color throughout, two matte-black tubular-steel chairs facing each other separated by a low brushed-aluminum table, two plain unbranded large black studio condenser microphones on black boom arms (one per host, basket close to each mouth). Frosted-glass partition in the background admitting diffuse cool daylight. Polished concrete floor with light scuff texture. Desaturated clinical palette.

LEFT HOST: reproduce the exact face and appearance from the first image (host reference) — same person, same hair, same wardrobe shape, same matte-black over-ear headphones. Place them in the LEFT seat, torso and head angled toward the right host / across the table (NOT squared to the lens), one hand resting on the chair arm, eyes and attention on the co-host, mouth closed in an attentive neutral expression.

RIGHT HOST: reproduce the exact face and appearance from the second image (guest reference) — same person, same hair, same wardrobe shape, same matte-black over-ear headphones. Place them in the RIGHT seat, torso and head angled toward the left host / across the table (NOT squared to the lens), hands resting on the chair arms, eyes and attention on the co-host, mouth closed in an attentive listening expression.

Wide-shot framing showing both hosts FULL UPPER BODY from the waist up, mid-distance camera angle roughly two to three metres away, eye-level (NOT a low angle, NOT cinematic gravitas). Both hosts visible in a single frame, mutual conversation eyeline — looking at each other, not at the camera. Daylight-balanced cool white tone, naturalistic. Both hosts in mid-conversation pose, mouths closed, neutral attentive expressions. Modest realistic depth of field, both hosts in focus, environment readable. Plain solid-colored wardrobe. Photoreal grain, natural skin texture, NOT smoothed or stylized.
```

### Sample — high-contrast / noir studio (cool dramatic)

```
Photorealistic 16:9 documentary still of a podcast in progress, naturalistic — looks like an authentic still grabbed from a real long-form interview episode, — ONE single wide shot. TWO HOSTS seated in an empty warehouse podcast studio with a single dramatic key light from above creating sharp shadows in an otherwise dim concrete-walled room with subtle texture.

SETTING: two black metal stools centered facing each other under a spotlight pool, two plain unbranded large black studio condenser microphones on heavy black boom stands (basket close to each mouth). Dark ceiling with exposed industrial beams. Edge of frame fades to deep shadow. Moody noir aesthetic, contemporary high-contrast cinematography with desaturated palette.

LEFT HOST: reproduce the exact face and appearance from the first image — same person, same hair, same wardrobe shape, same matte-black over-ear headphones. Place them on the LEFT stool, torso and head angled toward the right host / across the conversation (NOT squared to the lens), eyes and attention on the co-host, mouth closed in attentive neutral expression.

RIGHT HOST: reproduce the exact face and appearance from the second image — same person, same wardrobe shape, same matte-black headphones. Place them on the RIGHT stool, torso angled toward the left host (NOT to the lens), hands on knees or resting, eyes on co-host.

Wide-shot framing, both hosts FULL UPPER BODY, mid-distance roughly two to three metres, eye-level. Mutual conversation eyeline — never both staring at the lens. Cool dramatic but naturalistic look. Mouths closed, attentive expressions. Modest realistic depth of field. Photoreal grain, natural skin texture.
```

### Sample — premium podcast studio (warm variant — ONLY on warmth signal in brief)

```
Photorealistic 16:9 documentary still of a podcast in progress, naturalistic — looks like an authentic still grabbed from a real long-form interview episode, — ONE single wide shot. TWO HOSTS seated in a premium podcast studio interior, evening interior with balanced lamp-lit ambience, mahogany-finish wood-paneled walls with subtle linear texture.

SETTING: two cognac-brown leather lounge chairs facing each other separated by a low dark-wood coffee table, two plain unbranded large black studio condenser microphones on black boom arms (basket close to each mouth). Subtle backlighting accent (amber LED glow from behind the chairs creating soft halos). Recessed ceiling spots with frosted diffusers. Dark concrete floor with slight texture. Large window in the distance suggesting a nighttime cityscape outside (subtle softened city lights). Naturalistic high-end interview studio look — real, not commercial-styled.

LEFT HOST: reproduce the exact face from the first image — same person, same hair, same wardrobe shape, same matte-black over-ear headphones. Place them in the LEFT leather chair, torso and head angled toward the right host (NOT squared to the lens), eyes and attention on the co-host, mouth closed in attentive expression.

RIGHT HOST: reproduce the exact face from the second image — same person, same wardrobe shape, same matte-black headphones. Place them in the RIGHT leather chair, torso angled toward the left host (NOT to the lens), eyes on co-host.

Wide-shot framing, both hosts FULL UPPER BODY, mid-distance roughly two to three metres, eye-level. Mutual conversation eyeline — not eyes to lens. Warm intimate but naturalistic, like a real long-form interview. Modest realistic depth of field. Photoreal grain, natural skin texture.
```

---

## 3-host panel composite

If `N_hosts >= 3` (rare for ads — usually only host + guest), prepend each additional host to `image_urls`:
`image_urls=[persona:host1, persona:host2, persona:host3, ...]` left-to-right seating order.

```
Photorealistic 16:9 documentary still of a 3-host panel podcast — ONE single wide shot, naturalistic. THREE HOSTS arranged in a slight curved arc around the table — the opening of the arc faces the conversational center / mic island, NOT a posed "talent lineup" staring into the lens.

[reproduce setting language from one of the samples above]

LEFT HOST: reproduce the exact face from the first image. Sitting in the LEFT chair, angled inward toward neighbors, eyes toward co-hosts (natural panel listening / about-to-speak pose).
CENTER HOST: reproduce the exact face from the second image. Sitting in the CENTER chair, torso slightly turned toward left or right host as in a triangle conversation, NOT a flat-on news-desk frontal to camera; gaze between co-hosts or toward whoever they're addressing.
RIGHT HOST: reproduce the exact face from the third image. Sitting in the RIGHT chair, angled inward toward neighbors, eyes toward co-hosts.

Each host wears matte-black over-ear broadcast headphones. Each has a plain unbranded black studio condenser mic on a black boom arm close to their mouth. Wide-shot framing showing all three FULL UPPER BODY, mid-distance camera angle. All three visible in a single frame. Group engaged with each other — no host locked to staring at the viewer. Mouths closed, neutral attentive expressions.
```

---

## Invent-from-scratch vibes (topic seeds — write your own full scaffold)

Pick a seed matched to your podcast's topic, then write a full `Photorealistic 16:9 documentary still …` paragraph using the **Composite scaffold** above (every field: setting, lighting, walls, seating, table, mics, ambient, ceiling, floor, depth, tone). Stay positive-descriptive only. Keep it naturalistic — no cinematic gravitas, no dramatic key light, no extreme bokeh.

Match the setting to the topic and tone of the brief — for example, a clean daylit space with natural textures for science / health, a bright open athletic-club feel for fitness, a minimalist accent-wall studio for tech, an apartment-style living-room set for lifestyle, a dark LED-accented room for gaming, or a pale-wood low-seating space for wellness. Invent whatever environment best fits the brief; default the lighting to cool / neutral unless the brief explicitly calls for warmth.

Each seed expects a bespoke composite paragraph — do NOT paste a sample above and tweak nouns; the language of `[LEFT HOST: reproduce …]` and `[RIGHT HOST: reproduce …]` is reusable, but the SETTING block must be written fresh.

---

**Reminder**: Composite is the **180° anchor** for the entire episode. Every chunk's `reference_images[0]` will be `podcast:composite`. If the composite has the LEFT host showing their **right cheek** to camera (because they're seated left, angled toward right partner), all subsequent close-ups of that host show the **same right cheek** — never the opposite side. See [podcast-storyboard-prompt-guide.md](podcast-storyboard-prompt-guide.md) § *180° camera-side rule* for downstream enforcement.
