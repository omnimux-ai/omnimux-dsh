# Dark Athletic Carousel Spread

A premium-athletic carousel ad set in which every slide shares the same dark editorial regrade and the same pixel-identical bottom banner (logo left, colored sharp-rounded pill CTA right), with a single bold uppercase two-line headline in the lower third. The subject (brand, product, athletes) is swappable — the visual grammar is not.

## When to use this pattern

Use when **all** of these hold:

- The brand sits in **premium athletic / sports performance / gym / training** territory (footwear, supplements, home-gym equipment, recovery, pro training gear). The dark editorial regrade is the wrong move for soft / wellness / beauty / pastel lifestyle brands.
- The output is a **multi-slide carousel** (typically 3–10 slides), not a single hero ad and not a video.
- The user provides a **reference layout image** (defines banner geometry and headline placement), a **brand logo**, a **pack of lifestyle/product photos**, and a **numbered list of short headline phrases** (3–10 words each, one per slide).
- The user has specified **9:16** (most common) or **1:1**.

Do **not** use when:

- The deliverable is a video (use the video producer skills instead — the director-returned image is the final deliverable here).
- The brand aesthetic is bright/airy/pastel/clean-white — this pattern crushes everything to charcoal, which will destroy a light brand.
- There is no headline list — without one phrase per slide, the carousel logic collapses.
- The user wants character-driven storytelling — this is product/lifestyle-photo driven, not persona-driven.

## Hook & opening (per slide)

Every slide is its own hook — there is no "first slide is special" treatment. The structural hook is:

> **One arresting image, crushed to dark editorial, with a two-line uppercase declarative phrase locked into the lower third.**

The phrase is always an **imperative or a flat declarative** — never a question, never punctuated. Generic examples that teach the shape:

- `TRAIN PAST\nYOUR LIMIT`
- `BUILT TO\nLAST`
- `STRONGER FRAME\nFEWER PARTS`
- `MOVE LIKE\nA PRO`
- `EVERY REP\nCOUNTS`
- `PEAK FORM\nDAILY`
- `MADE FOR PROS,\nUSED BY ALL`
- `ENGINEERED TO\nOUTLAST`

**Swap the subject, keep the move:** for a new brand, generate 3–10 imperative/declarative phrases of 3–6 words each, then break each onto two lines at a **natural phrase boundary** (after a preposition group, before a noun phrase — never split a compound noun). The phrase rhythm should feel like a coach's command or a confident product claim.

## Narrative arc (across the carousel, not within a slide)

A carousel of 6–8 slides should rotate through these beat types — order can vary, but the **mix** matters. Aim for roughly:

| Beat type | Purpose | Source-asset cue |
|---|---|---|
| **Emotional / lifestyle** | hook on aspiration, family, fun | multi-person scene, golden-hour or warm rim light |
| **Aspirational performance** | "be the pro" promise | athlete mid-action, crowd or arena context |
| **Product spec** | hard claim (build, material, durability) | clean studio product hero on dark backdrop |
| **Community / use-case** | "this is for you" proof | residential / suburban setting, regular users |
| **Closing emotional** | sentimental payoff | single subject, joyful, golden-hour |

For an 8-slide set: open with 1–2 emotional, intersperse 2 product-spec slides, weave in 2–3 community/use-case, end with 1 emotional payoff. **Do not stack two product-spec slides adjacent** — the regrade is identical, so they will look like duplicates.

## Phrase → asset mapping logic

For each headline phrase, pick the source asset whose **literal subject** matches the phrase's **emotional weight**. The mapping rule, with generic examples:

- An emotional/family phrase → a multi-person play or training scene
- A "bring it home" / use-case phrase → a residential / everyday setting (backyard, garage, home gym)
- A hard product-spec claim (material, build) → a clean product hero on a dark studio backdrop
- An aspirational performance phrase → a pro athlete mid-action, crowd or arena visible
- A sentimental-payoff phrase → a single joyful subject, golden hour
- An "everyone can use it" phrase → a regular user in a casual setting

**Reuse rule:** a single source asset may back **at most two** slides in the set, and only when two phrases are genuinely the closest fit for that one image (e.g. two spec-claim phrases both want the studio hero). If you find yourself reusing past 2x, you are missing a phrase-asset mapping — re-read the photo pack.

## Visual style spec (locked across the set)

This is the regrade every slide receives. Phrase this verbatim into the style direction for lifestyle slides:

> Premium athletic editorial. Dark/dramatic treatment with cinematic high contrast — crush shadows, hold motivated rim highlights on subjects, desaturate mid-tones toward charcoal/teal, heavy edge vignette so the headline reads cleanly in the lower third. Sharp gritty texture; no soft beauty diffusion. No HDR sheen.

**Variant for pure product-spec slides** (no human subject, hero on backdrop):

> Studio spotlight on the product. Single hard directional key, deep falloff into near-black. Crushed background. Specular highlights held on metal/material edges. Same vignette feel as the lifestyle slides so the spread reads cohesively.

**Camera grammar:**
- Lifestyle slides: locked-off or subtle push-in framing, eye-level or slight low angle. No Dutch tilts. No fisheye.
- Product slides: clean three-quarter or straight-on product framing.

**Shot composition:** subject sits in the **upper two-thirds** of the frame. The lower third must be tonally dark enough for the white headline to read without an outline — if the source photo is too bright in the lower third, the regrade has to crush it.

**On-screen text policy (baked into the image):**
- **Headline:** large bold uppercase white condensed sans-serif (Anton-style or equivalent), centered, two lines with explicit `\n` break, subtle soft drop shadow only — **no outline, no stroke**. Sits in the lower third *above* the banner.
- **Banner:** described in its own section below — geometry is non-negotiable.

## Banner geometry (pixel-identical across every slide)

This is the single most important constraint. The bottom banner is what makes the carousel read as a set. Every slide must use the **same** values:

- **Panel:** solid near-black (`#000` to `#0A0A0A`), full frame width, height ≈ **12% of frame height**, sits flush at the very bottom of the image.
- **Logo (LEFT):** brand logo preserved **verbatim** from the LOGO REFERENCE asset (do not redraw, do not restyle, do not recolor). Vertically centered in the banner. Left padding ≈ **4% of frame width**. Logo height ≈ **70% of banner height**.
- **CTA (RIGHT):** solid colored **sharp-rounded pill** (corner radius ≈ 50% of pill height — rounded, but **not bubbly / not perfect-circle ends**). Vertically centered. Right padding ≈ **4% of frame width**. CTA copy in bold white sans-serif, vertically centered inside the pill.

> **Hard rule:** the pill is **sharp-rounded, not bubbly**. If the output looks like a chewing-gum capsule, it is wrong. The shape should feel like a button on a premium athletic site, not a kid's app.

> **Hard rule:** the logo is passed as a **separate LOGO REFERENCE** to the image model — never described in prose, never re-rendered from memory. This is what preserves the wordmark exactly across every slide.

## Voice & persona (in the copy)

- **Tone:** flat, confident, declarative. Coach-voice. No exclamation marks. No emoji.
- **Length:** 3–6 words per headline.
- **Form:** imperative ("Move Like A Pro," "Train Past Your Limit") or flat claim ("Stronger Frame Fewer Parts," "Engineered To Outlast").
- **Punctuation:** none, except a comma at a clause break ("Made For Pros, Used By All"). No periods. No question marks.
- **Casing:** displayed all-uppercase in the rendered slide.

## CTA mechanic

- A single short verb-phrase CTA, **2–3 words max** (e.g. "Level Up," "Shop Now," "Train Today").
- Rendered as **bold white sans-serif** on a **solid colored sharp-rounded pill** in the right side of the bottom banner.
- The pill color is the brand's accent color (use the brand's loudest accent, e.g. a saturated red `#D32F2F`). Pick the brand's loudest accent — the CTA is the only saturated color in the entire frame.
- The CTA is **identical** across all slides — same copy, same color, same geometry. It is a fixed anchor.

## Hard rules / do-not-regress

Each is a non-negotiable rule for any future run.

1. **Banner geometry is pixel-identical across all slides.** Same panel height, same logo scale + padding, same pill geometry + padding. Drift here breaks the set.
2. **Pill is sharp-rounded, not bubbly.** Corner radius ≈ half pill height. No perfect-capsule ends if the pill is short.
3. **Logo is passed as a separate LOGO REFERENCE asset** (treated as a wordmark to preserve, not a subject to alter). Never described in prose only.
4. **Headlines break onto two lines at a natural phrase boundary** — break after a preposition group or before a noun phrase. Never split a compound noun (keep a compound noun together; the break goes before the noun).
5. **No outline / stroke on headline text.** Subtle soft drop shadow only. Crush the underlying image instead if contrast is poor.
6. **A single source asset may back at most two slides.** If you need a third reuse, you are missing a mapping.
7. **Product-spec slides get the studio-spotlight variant** of the regrade, not the lifestyle variant. But same banner. Same headline geometry.
8. **The CTA pill is the only saturated color in the frame.** Everything else is crushed to charcoal/teal/black.
9. **No questions, no exclamations, no emoji in the headline copy.** Declarative imperatives only.
10. **The deliverable is the image asset itself** — there is no video assembly step for this pattern.

## See also

- `references/headline-library.md` — bank of phrase shapes that fit the voice.
- `references/regrade-prompt-fragments.md` — copy-paste style-direction blocks for lifestyle vs product-spec slides.