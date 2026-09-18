# Mirror Try-On Haul — Beat-Cut Pattern

A creative mold for short-form clothing-haul ads in the TikTok mirror try-on format (think: fast-fashion haul refs in the 1M+ play range). Subject swaps every run (different outfits, different model archetype, different brand) — the **format, pacing, and grammar do not**.

---

## When to use this pattern

**Use it when:**
- The user uploads 2–6 outfit images (full looks ideally; tops/bottoms can be paired in prose).
- They anchor on a mirror try-on haul reference (or describe one in words).
- The product is wearable apparel — clothing, lingerie, swimwear, athleisure, accessories you can model on a body.
- The platform is TikTok, Reels, or Shorts (9:16 vertical, sub-20s).
- The audience is young (Gen Z / younger Millennial), the brand voice is casual / fashion-forward.

**Don't use it when:**
- The product is non-wearable (skincare, food, electronics) — different format entirely.
- The user wants a voice-over-led ad, a testimonial ad, or a cinematic narrative ad — those have their own creative molds.
- The user uploads only one outfit — haul format needs variety; suggest a single-look try-on instead.
- More than 6 outfits with a hard 15s cap — ask the user to trim or accept a longer paid-tier render.

---

## Hook & opening (the structural move)

**The move:** open already mid-action. No cold establishing shot, no title card buildup. First frame is the model in the mirror, hanger already in hand, head tilted slightly down at the camera. The hook is *visual immediacy* + a tiny static text overlay sitting in the upper third — never spoken, never animated.

**Hook overlay example (freshly written, interchangeable):** `outfit picks 🤍`

Other interchangeable hook texts that fit the mold:
- `outfits for [season/occasion] 🤍`
- `which one? 👀`
- `new in 🛍️`
- `[brand] haul ✨`

**Rule:** the overlay is **one short phrase + one emoji**, lowercase, sans-serif, ~2.5s on-screen, positioned upper third, fades out before the second hard cut. The model never reads it aloud — it exists only for the scroller's thumb.

**Swap rule:** change the brand / season / emoji / outfit count freely. Do NOT change: position (upper third), duration (~2.5s), style (`minimal`), case (lowercase), or the rule that nothing is spoken.

See `references/hook-library.md` for more interchangeable phrasings.

---

## Narrative arc

A haul has **no story**. It has a **rhythm**. The arc is a repeating two-beat unit, one per outfit:

| Beat | Length | What's on screen |
|------|--------|------------------|
| A — Hold-up | ~1.85s | Model in neutral base layer, holds outfit X on a hanger up to the mirror, small smile or quick lip-bite, eyes on camera |
| B — Wearing | ~1.85s | Hard cut to model wearing outfit X, small body turn, confident pose, one hand to hip or hair |

Repeat A→B for each outfit. The whole video is `(A→B) × N outfits`.

**Total cut count = outfits × 2.** For free-trial 15s cap:
- 2 outfits → 4 cuts → 1 scene at ~8s (cuts run slightly slower, ~2s each).
- 3 outfits → 6 cuts → 1 scene at ~12s.
- **4 outfits → 8 cuts → 15s total, split across 2 scenes** (scene-1 = 8s covering outfits 1+2, scene-2 = 7s covering outfits 3+4). This is the sweet spot.
- 5+ outfits → exceeds the 15s cap on free tier; either trim to 4 or accept faster sub-1.5s cuts.

**No outro, no product card, no logo lockup.** The video ends on beat B of the last outfit. The CTA is the haul itself — implicit "go shop."

---

## Visual style spec

**Format:** 9:16 vertical, 1080×1920, color-graded warm but unfiltered (no heavy LUT).

**Framing:** medium shot, mirror-selfie POV. Camera is the model's phone held vertically at chest-to-eye height. Slight handheld micro-sway. The mirror frame is visible at the edges occasionally — sells the authenticity.

**Lighting:** soft window daylight from one side. No ring light, no studio bounce. Tiny shadow under the chin / collarbone.

**Lens / depth:** flat, smartphone-like depth of field. **No bokeh**, no cinematic shallow focus. The whole frame is reasonably sharp.

**Shot length distribution:** every cut ≈1.7–2.0s. Mean ~1.85s. Zero long lingers.

**Cut style:** hard cuts only. No dissolves, no zooms, no whip pans. Beat-synced to the music's kick or snare.

**On-screen text policy:**
- **One** hook overlay, upper third, first ~2.5s only.
- **No auto-captions.** Set `mute_captions: true` on every scene.
- No price tags, no outfit numbers, no product names baked into the video.

**What kills the format (do not do):**
- Cinematic shallow-DOF push-ins. Reads as luxury campaign, not haul.
- Voice-over of any kind, even whispered. Music-only is non-negotiable.
- Lower-third captions, kinetic typography, animated stickers.
- Smiling-to-camera-and-explaining. The model performs, doesn't address.

---

## Voice & persona

**There is no voice.** This is a music-only ad. Skip voice generation entirely. If the persona-setup tool returns voice IDs, ignore them.

**Persona archetype:** the "approachable best-friend" — young woman (early 20s typical, but swap freely for the brand's target), hair pulled back simply, minimal makeup, slim-to-average build, comfortable in front of her own mirror. Not a model in a campaign. A friend showing you what she bought.

**Base outfit (worn between try-ons):** must be **neutral** — e.g. warm-brown trousers + black tank, or oversized white tee + bike shorts. Critically, the base outfit must **not** match any of the upload outfits, and must not compete visually with them. It exists so the held-hanger shots read cleanly (the eye goes to the hanger, not to what she's already wearing).

**Performance direction:** small movements only. Tiny smile, lip-bite, hair-tuck, hip-shift. No talking, no laughing-at-camera, no peace signs. The model is engaged but not performative.

**Persona consistency:** generate the persona **once** per session and pass the same `persona:model` reference plus the same verbatim `style_direction` text into every scene's director call. Regenerating mid-render breaks face continuity across cuts.

---

## CTA mechanic

**The CTA is the absence of a CTA.** No spoken close, no "link in bio," no end card, no logo stinger. The video ends on the wearing-beat of the final outfit and lets the algorithm + caption-field do the work.

If the user insists on a CTA, the only acceptable form is **extending the hook overlay** — e.g. the opening text reads `outfit picks — link in bio 🛍️` and stays slightly longer (~3.5s). Never add an outro card. Never add a closing voice line.

---

## Audio

- **Music-only.** Genre: upbeat hip-hop / trap / amapiano / chill house — whatever matches the brand and ref. ~95–115 BPM is the typical hit range so the ~1.85s cuts land on beats.
- **Volume: 0.85.** Loud. There is no voice to duck under and the music *is* the energy. The default volume (~0.15) is wrong for this format.
- Generate ~target-duration music in parallel with the directors, not after.
- Cuts should land on downbeats. If the music feels off-grid against the cuts, regenerate the music — don't reshoot.

---

## Hard rules / do-not-regress

These are locked preferences. Treat each as a hard constraint:

1. **Music-only audio. No voice-over.** Even if the persona returns a voice ID, do not use it. Set `speech_status="silence"` on every scene.
2. **Beat-synced hard cuts at ~1.85–1.90s average.** No softer pacing. No dissolves.
3. **`mute_captions: true` on every scene.** Silent scenes draw weird empty captions otherwise.
4. **`music_volume: 0.85`** (not the 0.15 default).
5. **One persona for the whole video.** Generate once, reuse the same `persona:model` reference across all scenes.
6. **Persona base outfit is neutral and distinct from the upload outfits.** Warm-brown trousers + black tank is a known-good default; pick something equivalent if the brand palette demands it.
7. **One hook overlay, upper third, ~2.5s, lowercase + one emoji, `style: "minimal"`.** No other text in the video.
8. **Decompose multi-cut scenes with the `[Hard cut]` keyword in the director prompt** so the video model generates clean snappy transitions instead of smooth motion.
9. **Two cuts per outfit:** hold-up-on-hanger, then wearing-it. Always in that order. Never skip the hold-up — it's what makes it a *haul*.
10. **Aspect ratio is always 9:16. Output is always 1080×1920.**
11. **No baked-in text, logos, prices, or outfit numbers in the video frames.** All text routes through the assemble step's `hook_overlay`.
12. **If a partial outfit is uploaded** (top-only or bottom-only), pair it in prose with another upload so each on-screen cut shows a complete look. Do not generate a half-naked frame.
13. **If image-QA returns placeholder / no-verdict output**, record ERROR per protocol, accept the frame, do not fabricate a verdict.

---

## Companion references

- `references/hook-library.md` — interchangeable hook overlay phrasings.
- `references/director-prompt-fragments.md` — reusable `[Hard cut]` shot decomposition patterns and the base-outfit description.

The producer / director / mode skills already handle tool orchestration; this skill teaches the *creative move*. Stay focused on rhythm, framing, persona consistency, and the rules above.