# Refinement Pass Protocol

A two-pass quality protocol that runs after every first generation. This is what produces output that visibly outclasses single-shot generation — we generate, audit, and refine.

## When to run

After **every** first generation in any mode. No exceptions, no skipping.

## Step 1 — Audit

Read the generated image. Walk through the mode's quality gates checklist (in `references/<mode>.md`). For each gate, mark it as PASS or FAIL.

## Step 2 — Identify the weakest area

Pick the single biggest issue. Common categories:

- **Lighting flat** — no clear direction, shadows too soft, no rim or separation
- **Plastic surface** — texture looks rendered not photographed
- **Warped text** — label letters mangled or AI-fictional
- **Anatomy off** — fingers, eyes, ears, hairline issues on people
- **Composition imbalance** — subject off-anchor, weak focal hierarchy
- **Palette drift** — colors don't match brand memory
- **Stock feel** — composition feels generic / over-staged
- **AI sheen** — that telltale rendered-looking smoothness
- **Aesthetic half-applied** (restyle only) — source style still bleeding through
- **Flat color band** — model rendered an empty solid-color or dull gradient strip (often happens when user requested text-overlay space and the model interpreted it too literally)

Pick ONE — the highest-impact issue.

## Step 3 — Run refinement generation

Submit a new generation referencing the first result, with a focused fix prompt. Structure:

```
Refine the previous image. Keep composition, subject, framing, and overall scene IDENTICAL.
Only change: {{specific photographic instruction targeting the weakest area}}.
{{Mode-specific preservation directive}}.
```

### Fix-prompt language by issue type

**Lighting flat:**
> Add directional key light from camera-left at 45°, 4500K, with stronger rim separation on the opposite side. Deepen contact shadow at the base. Increase tonal range between highlight and shadow.

**Plastic surface:**
> Refine surface to show realistic micro-texture. Add tactile detail — visible weave / brushstroke / pore / grain depending on material. Remove rendered-looking sheen.

**Warped text:**
> Sharpen the product label text to fully legible commercial-print quality. Letters must be crisp and intact, not warped or merged.

**Anatomy off:**
> Correct the {{specific body part — fingers / hands / face / eye placement}}. Anatomically correct human proportions, natural realistic detail. Preserve facial likeness.

**Composition imbalance:**
> Reposition subject toward {{specific anchor — left third / right third}}. Strengthen focal hierarchy, focal anchor moved off dead-center.

**Palette drift:**
> Shift palette toward {{specific brand colors from memory}}. Reduce {{drifting color}} dominance. Bring {{brand accent}} forward.

**Stock feel:**
> Move away from generic staging. Add lived-in detail, intentional asymmetry, and one specific narrative cue {{name a cue}}. Photographic, not staged-stock aesthetic.

**AI sheen:**
> Remove rendered-looking sheen. Add film-grain photographic feel. Realistic skin texture with natural micro-imperfection. Hyper-realistic, not hyper-smooth.

**Aesthetic half-applied (restyle):**
> Source unchanged. Push aesthetic harder toward {{preset specifics — palette, surface, light, mood}}. Stronger {{specific element}} commitment. Source's previous aesthetic completely gone.

**Flat color band:**
> Replace the flat solid-color {{top / bottom / left / right}} area with natural scene continuation — extend the actual environment (sky, blurred background, surface texture, atmospheric gradient) into that area. The frame must read as one cohesive scene, no artificial empty rectangles.

## Step 4 — Submit refinement

Reference the first-pass result by its `output_asset_id` in `image_urls`, writing the refined output to a new `output_asset_id`:

```
generate_image(
  prompt="<refinement fix prompt>",
  output_asset_id="<name>:refined",
  aspect_ratio="<same as first pass>",
  resolution="2K",
  model="nano-banana-2",
  image_urls=["<first_pass_output_asset_id>"]
)
```

(Use the same `model` as the first pass — `gpt-image-2` if the first pass was a typography/graphic deliverable, otherwise `nano-banana-2`.)

## Step 5 — Re-audit

Run the quality gates checklist again on the refined output. If still failing on a different issue, decide:

- **Major issue remains:** run a second refinement (max 2 refinements total)
- **All gates pass:** deliver
- **Different mode entirely needed:** scrap and regenerate fresh

## Refinement budget

- 1 first-pass generation
- Up to 2 refinements
- Total: max 3 generations per final output

If 3 generations don't produce gate-passing output, the issue is likely with the underlying prompt structure — go back and rebuild the prompt from the mode template, don't keep refining.

## When NOT to run a refinement

- First pass passes ALL quality gates → deliver
- The output's "weakness" is subjective taste, not a quality gate failure → deliver and ask user
- The refinement would change subject or composition (not just polish them) → that's a fresh generation, not a refinement

## Carousel and ad-pack refinement

For multi-image deliverables, audit the SET first, then individual slides:

1. Audit set-level coherence (palette consistency, lighting consistency, surface consistency across slides)
2. If a single slide breaks the set, refine ONLY that slide — don't regenerate the whole pack
3. Use the visual system from the original outline as the preservation directive

## Quality gate failure log

When delivering, briefly note in your response which gate failed in the first pass and what the refinement fixed. This helps the user trust the output and gives them control to override your judgment if needed.

Example: "First pass had flat lighting on the left side; refined with stronger rim separation."
