# Editorial Magazine Lifestyle Ad

A premium static-ad pattern that treats product photography as editorial imagery. The brand earns desire through restraint: one beautiful full-bleed photo, one headline that reads like a book title, feature copy set as quiet spec lines, and a brand mark positioned as a spine — not a logo stamp.

---

## 1. When to Use This Pattern

**Ideal for:**
- Home goods, bedding, linen, skincare, fragrance, apparel — products where texture, warmth, and lifestyle aspiration drive purchase
- DTC brands positioning against an editorial, premium-lifestyle-magazine reference rather than a hard-sell promotional one
- Multi-format rollouts (9:16, 4:1 leaderboard, square) where visual consistency matters
- Sessions where the user uploads strong lifestyle photography and wants premium output

**Not suitable for:**
- Products requiring heavy feature education (too many spec lines destroy the negative space)
- High-urgency sale / limited-time-offer ads — this pattern works by calm authority, not urgency
- UGC or talking-head formats — this is a narrator-only, image-first pattern

---

## 2. Asset Inspection First (Hard Rule)

Before directing any ad, inspect **every uploaded asset**. List all images, identify their type, and assess hero candidacy:

| Asset Type | Role | Hero Candidacy Notes |
|------------|------|----------------------|
| Lifestyle / scene shot | Hero candidate | Prefer natural side-light, warm tones, scene context |
| Texture / detail close-up | Inset or background accent | Strong for small inset detail element |
| Label / tag / certification | Proof / spec line support | Use data from these, not the image itself |
| Packaging shot | Secondary / e-commerce | Rarely editorial-hero quality |

**Hero selection criteria (in priority order):**
1. Natural light quality — warm, directional, not flat
2. Scene warmth and color harmony with brand palette
3. Negative space available for text placement (sky, wall, bedding surface, floor)
4. Absence of distracting props or competing focal points

Select the hero deliberately before directing anything. The hero carries the entire campaign.

**Prop removal:** If the hero contains distracting props (figurines, objects unrelated to the product), use image-to-image generation with explicit instruction to reconstruct the surface beneath the removed object. Name the surface material and lighting conditions so inpainting blends correctly. Example prompt fragment: *"Remove the ceramic figurine from the nightstand surface. Reconstruct the wooden nightstand surface beneath it, matching the warm ambient light and grain texture of the surrounding area."*

**Text removal:** If a reference image has baked-in text, use image-to-image generation with a strong no-text prompt and instruction to reconstruct the background material behind where text appeared. Example: *"Remove all text overlays and typography. Reconstruct the underlying linen/wall/surface texture seamlessly, preserving lighting and color grade."*

---

## 3. Hook & Opening — The Book-Title Headline

**Structural move: Book-title headline in ultra-light serif**

The headline reads like a book title or magazine cover line — short, slightly poetic, wordplay welcome. It is set in ultra-light or thin serif weight. It does not shout. It is confident because it does not need to be loud.

**Generic example (invented for a neutral hypothetical product — a ceramic pour-over coffee set):**
> **"SLOW POUR, FULL STOP."**
> *Mornings worth getting up for.*

**Swap the subject, keep the move:**
- Replace the headline phrase with a pun or poetic expression native to the new product
- Maintain structure: one punchy headline (all-caps or title case) + one subline (sentence case, ~40–50% of headline size)
- Both lines occupy negative space in the image — never float over the product itself
- Left-align or center; never right-align

**Typeface rules:**
- Weight: Ultra-Light / Thin / ExtraLight — never Regular or Medium for the headline
- Family: Serif preferred (Didot, Canela, Freight Display, Cormorant Garamond, or equivalent)
- Tracking: Generous (wide) on the headline
- Subline: Same typeface, lighter size, slightly tighter tracking

---

## 4. Narrative Arc — Visual Reading Order

Single-frame static ads have an arc: the sequence in which the eye travels. Engineer it deliberately.

| Beat | Eye-time | Element | Direction |
|------|----------|---------|-----------|
| 1 | 0.0–0.8s | Hero image | Let the lifestyle scene land. Warm grade pulls the eye in. |
| 2 | 0.8–1.5s | Headline | Set in negative space. Ultra-light serif. Brief. |
| 3 | 1.5–2.5s | Subline | One sentence below the headline. Same typeface, smaller. |
| 4 | 2.5–3.5s | Spec lines | Dot-separated features. Small caps or tiny regular weight. Factual. |
| 5 | 3.5–4.0s | CTA | One quiet line with directional arrow. Not bold. |
| ambient | — | Brand spine | Vertical brand name along one edge. Small caps. Light weight. |

---

## 5. Visual Style Spec

| Element | Specification |
|---------|---------------|
| Image treatment | Full-bleed, edge-to-edge. No border frames, card shadows, or background panels (exception: split-panel leaderboard format) |
| Color grade | Warm, slightly desaturated. Sage, linen, cream, oat, warm white palettes. Rich shadows. Soft vignette. NOT cool, NOT high-contrast, NOT flat |
| On-screen text style | Ultra-light serif for headlines and sublines. Small caps or light-weight sans for spec lines and CTA. **No pill badges. No icon-badge feature callouts. No drop shadows on text.** |
| Text placement | Use image negative space — sky, plain walls, flat bedding surface. Never overlay text directly on the product's key texture |
| Inset detail | Optional: small texture or product-detail inset in one corner. Max 15–20% of frame width. Thin 1px frame or no frame |
| Brand spine | Brand name set vertically along left or right edge. Small caps. Light weight. Functions as magazine spine — ambient, not dominant |

**Format-specific notes:**

- **9:16 Portrait:** Hero fills frame. Text in lower third. Brand spine runs full height on one edge.
- **4:1 Leaderboard:** Option A — full-bleed hero with text overlay (preferred for editorial). Option B — split panel (brand color left, photo right) for bolder DTC moments. Editorial style prefers Option A.
- **1:1 Square:** Full-bleed hero. Headline centered or lower-left. Spec lines at bottom.

---

## 6. Voice & Persona

**Tone:** Calm-authoritative. Slightly warm. Wordplay welcome, urgency never.

**Persona archetype:** Narrator-only. No person on camera. The lifestyle image IS the persona — the scene communicates the lifestyle promise.

**Sample phrasing (invented generic examples):**

| Element | Example |
|---------|---------|
| Headline | `"SLOW POUR, FULL STOP."` / `"Where mornings start slower."` / `"The one you'll fight over."` |
| Subline | `"Mornings worth getting up for."` — one evocative sentence |
| Spec lines | `Hand-Glazed Stoneware · 350ml Capacity · Dishwasher-Safe · Lead-Free Finish` |
| CTA | `Shop the Collection →` / `Explore the range →` / `Find your size →` |

**Prohibited voice patterns:**
- Exclamation points in headlines
- Urgency language: "Limited time!", "Don't miss out", "Shop now before it's gone"
- Feature-dump sublines (more than one sentence)
- Benefit-adjective spec lines: `"Luxuriously smooth stoneware"` → correct form is `"Hand-Glazed Stoneware"`

---

## 7. CTA Mechanic — Soft Directional Close

The CTA is a single quiet line. It uses a directional arrow (→) or em-dash. It does not shout.

- **Placement:** Bottom-center or bottom-left, below spec lines
- **Weight:** Same light weight as spec lines — never bold
- **Wording pattern:** `[Verb] the [noun] →` — e.g., `Shop the Collection →`, `Explore the range →`, `Find your size →`
- **Never:** `BUY NOW`, `CLICK HERE`, `ADD TO CART`, all-caps CTA

---

## 8. Multi-Format Execution Order

When producing a full-format set in one session:

1. **Inspect all assets** — full inventory before touching the director
2. **Select hero image** — one deliberate choice, with rationale
3. **Clean the hero if needed** — prop removal or text removal via I2I before directing
4. **Produce 9:16 portrait first** — primary format; establish grade, type hierarchy, and layout here
5. **Adapt to 4:1 leaderboard** — crop/extend the hero or switch to split-panel if the image doesn't read in widescreen
6. **Produce remaining formats** (square, etc.) using the same established grade and text system

Never direct the ad from an uncleaned source image. Clean first, direct second.

---

## 9. Hard Rules — Do Not Regress

These rules are inviolable. Treat each as a hard constraint on every layout this skill produces.

1. **No pill badges.** Feature callouts are dot-separated spec lines only. The pill/badge visual is rejected in favor of spec lines. Any layout that introduces badge/pill UI elements violates this skill.

2. **Ultra-light serif weight for headlines.** If the typeface doesn't have an ultra-light or thin cut, choose a different typeface. Regular weight breaks the editorial feel.

3. **Full-bleed hero, no framing.** No border frames, card shadows, or background color panels behind the hero image. Edge-to-edge, always. (Split-panel leaderboard is the only sanctioned exception, and even then the photo side is still full-bleed within its half.)

4. **Warm cinematic grade.** No cool color grading. The palette should feel like natural light through linen curtains — warm, slightly low-contrast, rich in shadows, soft vignette. Sage and linen tones.

5. **Prop removal before directing.** If the hero has distracting non-product props, clean them via I2I first. Do not direct around a prop and hope the layout hides it.

6. **Brand spine is a vertical typographic element, not a logo placement.** Set the brand name vertically along one edge in small caps, light weight. Do not place a horizontal logo block in a corner.

7. **Subline is exactly one sentence.** One evocative, product-benefit sentence. No second sentence. No feature tease added to the subline.

8. **Spec lines are specifications, not benefits.** `350ml Capacity` not `Generous coffee capacity`. `Lead-Free Finish` not `Safe for your family`. Readers who engage with editorial copy can decode spec language — that's part of the premium signal.