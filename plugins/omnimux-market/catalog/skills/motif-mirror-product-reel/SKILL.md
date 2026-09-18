# Motif-Mirror Product Reel

A silent, music-led, multi-scene vertical reel for a line of custom-print giftable
products. The single creative move that makes it work: **every scene mirrors the
product's printed motif with the real thing it depicts** — a mug printed with
watercolor peonies sits beside real peonies; the printed butterfly is echoed by the
soft bokeh of a real garden behind it. The product is always the hero; the real
elements are the supporting cast that "prove" the motif. No people, no hands, no
voice — the romance comes from macro light, shallow depth, and a tender score.

The **subject is always swappable** (any printed-design product, any motif). What
stays locked is the motif-mirror move, the elegant-premium macro look, the silent
music-led delivery, and the end-card close.

## 1. When to use this pattern

Best for:
- A **line of variants** of the same custom-print product (5 mug designs, 6 candle
  scents, a set of art prints). The reel becomes a gallery that gives each variant
  its own short vignette.
- Giftable / personalizable products where the printed motif is the selling point
  (retirement, wedding, birthday, anniversary, "design your own").
- Aspirational, calm, premium tone — e-commerce hero reels, gift-guide placements,
  Pinterest/IG/TikTok organic.

Not for:
- Products with no printed motif to mirror (there's nothing to pair with the real
  element — use a different pattern).
- Testimonial / problem-solution / founder-story ads — those need a voice and a
  person; this pattern is deliberately wordless.
- Fast, punchy, meme-y hooks. This reel is slow and breathing by design.

## 2. Hook & opening — the motif mirror

Open on a **macro of the product with its real-world motif already in frame**, so the
mirror reads in the first second without any caption. The structural move is an
**object-echo**: printed element ↔ real element, same color story, one in crisp
focus and one in creamy bokeh.

Style anchor (an elegant-premium tabletop macro), as a freshly invented example:
> "Hero push-in on a white glossy ceramic mug, a short keepsake line of verse and a
> watercolor floral band facing camera, real fresh peonies and a soft butterfly-toned
> garden blurred behind it, soft moody window light on neutral marble."

**Swap the subject, keep the move.** Replace the mug + peonies with any product +
its real motif (coffee tumbler + real beans, lavender candle + real lavender). Keep:
the macro framing, the real-element echo, the product facing camera, the push-in.

## 3. Narrative arc — quiet gallery, then card-close

Shape: **quiet-gallery → end-card payoff.** No climax of conflict; the build is
purely sensory variety across variants. Budget the runtime so every variant gets at
least one vignette and the rhythm changes shot-to-shot.

Reference budget (30s, 5 variants, music-only):
- **0-3s** — Opening hero (variant 1): push-in, motif-mirror established.
- **3-6s** — Macro detail (variant 1): extreme close on the printed motif + real
  element touching the frame edge.
- **6-9s** — Hero (variant 2): different surface, lateral dolly.
- **9-12s** — Macro / steam + petals (variant 2 or 3): a living element (steam,
  a petal drifting) to keep the frame breathing.
- **12-15s** — Overhead flat-lay (variant 3): top-down, product + scattered real
  elements arranged.
- **15-18s** — Hero (variant 4): crane-down or slow push.
- **18-21s** — Macro detail (variant 4).
- **21-24s** — Hero (variant 5): lateral dolly.
- **24-27s** — Macro / texture (variant 5).
- **27-30s** — **Closing hero** (return to the strongest variant): fully locked-off
  camera, only the real flowers breathing, clean reserved negative space for the
  end-card.

Rotate **all** variants and **vary the shot type** every scene (hero push-in, macro
detail, overhead flat-lay, lateral dolly, crane-down, steam/petal beat, closing
locked-off). Tone is constant: warm, tender, unhurried.

## 4. Visual style spec

- **Look:** elegant premium tabletop. Photoreal, editorial product photography — not
  UGC, not cartoon.
- **Lens / framing:** macro / 85mm feel, shallow depth of field, creamy bokeh. The
  product is sharp; the real motif elements drift between sharp and blurred.
- **Light:** soft, moody window light. Gentle falloff, no hard speculars blowing out
  the glossy product.
- **Surfaces:** neutral and natural — marble, linen, oak. Never busy or colored
  backgrounds that fight the printed motif.
- **Real elements:** fresh, in-season, color-matched to the print. They are the
  mirror, so their palette must echo the printed motif's palette.
- **Camera grammar:** mostly slow and minimal — push-in, lateral dolly, crane-down.
  Background/atmosphere motion (steam, drifting petals, a breathing garden bokeh) does
  the "life" so the product can sit still. See Hard Rules on self-rotating products.
- **Shot length:** uniform short beats (≈3s each) for a steady gallery cadence; use a
  generation backend whose minimum clip length lets you hit the exact per-scene
  seconds without overshooting.
- **On-screen text policy:** **none baked into the body scenes.** The only text is the
  end-card overlay on the closing scene, added at assembly over reserved negative
  space (see CTA).
- **Aspect ratio:** default 9:16 vertical (confirm with the user).
- **People:** none. No hands, no body parts, ever.

## 5. Voice & persona

There is **no voice and no persona** — this is a wordless product film. The "voice"
is the music: a **tender instrumental score, piano + strings**, fully instrumental,
matched to the total runtime. Keep it gentle and aspirational; let it swell slightly
toward the end-card. Speech is silent on every scene.

## 6. CTA mechanic — silent end-card on the closing hero

The close is a **visual end-card**, not spoken and not baked into the video frames:
- The closing scene is composed with **clean reserved negative space** (upper third)
  so an overlay can be added at assembly without clashing.
- At assembly, add an **elegant serif end-card** (e.g. Alice font) stacked in that
  space — a headline plus a one-line subline.

End-card example (freshly invented — swap the product noun, keep the cadence):
> Headline: "The Perfect Keepsake Gift"
> Subline: "Five designs · Personalized for them"

Keep it two lines, value + personalization promise, soft and benefit-led. No hard
"BUY NOW", no link callout in the frame — the tone stays gift-premium.

## 7. Hard rules / do-not-regress

These are locked lessons; treat each as non-negotiable.

1. **Build a Visual Description Lock per variant before generating anything.** Inspect
   every uploaded product photo and record exactly what it shows — color story,
   printed text wording, verse, floral/motif details, accent colors, handle/shape,
   material finish, background. Embed that lock **verbatim** in every scene handoff so
   the product renders faithfully across all scenes. See
   `references/visual-lock-template.md`.
2. **Never instruct "no text" / "no typography" / "remove text".** On a printed
   product, image-to-image reads that as a global glyph-erase and destroys the
   product's own printing. Instead always instruct: *"Preserve every printed letter,
   verse, motif and accent EXACTLY as in the reference."*
3. **Lock the camera on any scene containing small printed text.** Camera motion over
   fine printed copy garbles the letters. For the closing hero (which shows verse-sized
   text) use a **fully locked-off camera** with only real elements breathing. Push-ins
   are fine only on scenes where no small text needs to stay legible.
4. **Prefer a stationary product + camera motion over a self-rotating product.** A mug
   spinning by itself reads as unnatural/AI to clients. Default to a still product with
   a push-in or dolly and let the background/atmosphere move.
5. **The product is the hero subject and references its own input photo every scene.**
   Use the matching product image as the reference so the variant stays itself.
6. **One shared style string across all scenes.** Use an identical visual-style
   direction (elegant premium tabletop, macro/85mm, shallow DOF, soft moody window
   light, neutral marble/linen/oak, real motif-matched elements, photoreal, no people)
   in every scene so the gallery is visually consistent.
7. **Silent throughout; music-only.** Every scene's speech is silence; no persona.
8. **End-card overlay rules:** reserve the negative space in the closing scene's
   composition (don't bake text into the video), and when placing the overlay, do
   **not mix zone-based and pixel-based positioning** — pick one coordinate system
   (pixel coordinates for a stacked headline + subline).
9. **Confirm the unspecified fields in ONE batched question** before producing —
   aspect ratio, mood (warm / bright / elegant-premium), and audio (music-only vs
   voice-over). Duration and scene/variant count usually come from the brief and the
   number of uploaded variants.