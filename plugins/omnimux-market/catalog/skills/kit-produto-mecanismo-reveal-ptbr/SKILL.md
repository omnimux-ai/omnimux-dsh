# Kit Produto — Mecanismo Reveal (PT-BR TikTok/Reels)

A high-energy 4-scene vertical ad pattern for Brazilian e-commerce. The structural move:
**lead with the product hero → isolate the mechanism macro → make the snap/attach moment cinematic → deliver the assembled reveal with urgency CTA**. Real product photos are mandatory start frames for every scene — never synthesize product appearance from scratch.

---

## 1. When to Use This Pattern

**Perfect fit:**
- Kit products where the accessory/attachment mechanism is novel or tactile (snap buttons, magnets, zippers, Velcro panels, clip rails, removable patches, detachable hoods/capes)
- Costume, cosplay, gaming, outdoor, novelty apparel kits
- Modular bags and backpacks with detachable panels
- Any product where "how it connects" is a key differentiator from competitors
- Brazilian marketplace listings: Shopee, Mercado Livre, Amazon Brasil, Magalu, TikTok Shop BR

**Poor fit:**
- Single-item products with no interactive element (just a shirt, just a bag)
- Luxury fashion where slow cinematic stillness > kinetic energy
- B2B / non-consumer products
- Products where no real photos are available (this skill depends on real start-frame photos)

---

## 2. Hook & Opening (Scene 1 — ~8 s)

**Structural move: Cinematic hero push-in + VO gancho interrogativo**

The opening shot is a slow push-in (camera moves toward the product's focal detail: embroidery, logo, print). No cuts in Scene 1 — the motion IS the tension. The VO asks a direct interrogative question at the audience in the first 2 seconds.

**Invented generic example:**
> *"Procurando o kit de viagem definitivo para o dia a dia?"*

**The rule — swap the subject, keep the move:**
Replace `[kit de viagem]` with your product category. Replace `[para o dia a dia]` with the audience's purpose. The interrogative structure `"Procurando o [X] definitivo de/para [Y]?"` stays locked. It creates instant self-qualification — the right viewer leans in, wrong viewers scroll off fast (that's fine).

**Visual:** Use the cleanest flat-lay hero shot of the main garment/product as `start_image`. Slow push-in motion toward the primary design element (logo, print, key visual feature). Warm-bright lighting, product centered.

---

## 3. Narrative Arc

Beat-by-beat, target ~25 s total:

| Scene | Duration | Beat | Visual move | VO beat |
|-------|----------|------|-------------|---------|
| 1 | 8 s | **Hook — product hero** | Slow push-in on garment detail | Interrogative gancho → quality callout: *"Olha a qualidade desse [material] com [detalhe premium]!"* |
| 2 | 5 s | **Isolation — mechanism macro** | Extreme close-up, locked-off or micro pull-back | Pivot phrase + mechanism reveal: *"Mas o melhor vem agora: [mecanismo] para você [benefício prático]!"* |
| 3 | 9 s | **Climax — attachment in motion** | Pull-back from macro to mid-shot showing accessory connecting to garment | Payoff confirmation: *"É o [resultado visual] com qualidade premium!"* |
| 4 | 5 s | **CTA — assembled hero** | Full kit assembled, static or gentle hero | VO: *"Garanta o seu kit nas principais lojas online!"* — captions muted, pill + kit description overlays |

**Arc shape:** Curiosity (hook question) → Mechanism surprise (the "wait, it does WHAT?" beat) → Payoff confirmation → Urgency close.

**The rhythm change:** The Scene 2→3 transition is the fastest cut in the ad. Macro snap to full-motion attachment reveal = dopamine hit. Everything before builds to this; everything after closes it.

---

## 4. Visual Style Spec

- **Format:** 9:16 vertical, 1080×1920
- **Style:** UGC-cinematic hybrid. Real product photos as start frames for every scene (mandatory — see Hard Rules). Not pure talking-head UGC. Not cold cinematic stillness. Kinetic product motion from stills.
- **Camera grammar per scene:**
  - Scene 1: Slow push-in toward primary detail (0.3–0.5× speed)
  - Scene 2: Locked-off extreme macro OR micro pull-back to reveal mechanism depth
  - Scene 3: Pull-back from macro detail to mid-shot — attachment motion must be visible
  - Scene 4: Gentle hero or static — let the assembled product breathe
- **Shot length distribution:** Long (8 s) → Short (5 s) → Long (9 s) → Short (5 s). Scene 3 carries the emotional and informational weight; give it room.
- **Color:** Match the product's accent colors in overlays. For strongly themed kits (costume, gaming), use the theme's primary colors. E-commerce default: high-saturation, warm-bright.
- **On-screen text:**
  - Captions: `zoom-punch` preset, `Anton` font family — kinetic, every word punches in on beat
  - Hook overlay: `punch` style, `position_y_ratio: 0.12` (top band, above product)
  - Scene 4 CTA: `mute_captions: true` — no kinetic captions competing with the close
  - CTA pill overlay: Product accent color (red preferred), text `"COMPRE AGORA – ESTOQUE LIMITADO"`
  - Kit description: High-contrast accent (e.g. bright yellow) at top-center of Scene 4
- **Playback rate:** 1.1× (snappy TikTok pacing — native 1.0 feels sluggish in-feed)
- **Music volume in mix:** 0.18 (audible energy under narration; punches on cuts)

---

## 5. Voice & Persona

- **Archetype:** Peer enthusiast. Young male PT-BR narrator who sounds like a friend showing off a cool find — not a TV announcer, not a brand robot.
- **Tone:** Hyped-but-credible. Genuine excitement about the mechanism. Warm, not cold. Energetic, not screaming.
- **Pacing target:** ~2.5 words/second (~155 WPM). Calculate word count per scene before production. Scene 1 at 8 s = ~20 words max. Scene 4 at 5 s with muted captions = light VO or none.
- **Phrasing rhythms to preserve:**
  - Opening question: *"Procurando o [X] definitivo de [Y]?"*
  - Quality callout: *"Olha a qualidade desse [material] com [detalhe]!"*
  - Mechanism pivot: *"Mas o melhor vem agora:"* (colon pause, then mechanism name)
  - Payoff: *"É o [visual result] com qualidade premium."*
  - CTA close: *"Garanta o seu kit nas principais lojas online!"*
- **Language:** Brazilian Portuguese only. No code-switching.

---

## 6. CTA Mechanic

**Hard close with urgency framing — no soft sign-off.**

1. **VO line (Scene 4 or end of Scene 3):** *"Garanta o seu kit nas principais lojas online!"*
2. **On-screen CTA pill:** `"COMPRE AGORA – ESTOQUE LIMITADO"` in the product accent color
3. **Kit description text:** Product name and contents in a high-contrast accent at top-center of Scene 4
4. **No kinetic captions on Scene 4** (`mute_captions: true`) — the pill and description text ARE the close; competing captions kill conversion clarity

**Why "ESTOQUE LIMITADO":** Urgency framing is expected and effective in Brazilian marketplace ad formats. It activates FOMO. Do not soften to "enquanto durar o estoque" — the shorter, puncher form performs better in-feed.

---

## 7. Hard Rules / Do-Not-Regress

Each is a hard constraint — do not regress on any of these.

1. **Real product photos MUST be start frames for every scene.** Never ask the director to synthesize the product from a text prompt alone. Every scene must use a real uploaded product photo as `start_image` or `PRODUCT REFERENCE`. This preserves actual product fidelity for marketplace compliance and avoids hallucinated product appearance.

2. **Scene 3 requires TWO product reference images.** Use both the accessory photo AND the garment photo as references. The macro button/mechanism photo (Scene 2's source) is the primary anchor for Scene 3's start frame — pull back from it to show the connection in motion.

3. **If the attachment mechanism is not clearly visible in Scene 3's first render, regenerate.** Use the macro detail photo as primary `PRODUCT REFERENCE`. Add explicit pull-back motion in the scene description: *"pull back from extreme close-up of [mechanism] to reveal [accessory] connecting to [garment]."* Do not accept a generic clothing shot where the mechanism is ambiguous.

4. **Music genre: trap-orchestral fusion.** Not purely orchestral (too slow/epic). Not purely trap (too thin). Required blend: heroic brass + strings as emotional backbone, 808 bass + trap hi-hats for TikTok energy. ~140 BPM. Generate with +5 s buffer over total ad length and trim in assembly.

5. **VO pacing is 2.5 w/s. Calculate before dispatching.** Distribute the script word count across scenes before launching director calls. Over-packed VO sounds breathless and loses Brazilian audience comprehension.

6. **All four director scene calls launch in parallel** after voice persona setup is confirmed. Do not serialize scene generation — it is a major latency waste with no benefit.

7. **Assembly playback rate = 1.1×.** Native 1.0 feels sluggish in TikTok/Reels feed. Do not reduce.

8. **Scene 4 caption mute is mandatory.** The CTA pill + kit description text ARE the visual close layer. Kinetic captions overlapping the pill creates visual noise and degrades conversion. `mute_captions: true` on Scene 4 is non-negotiable.

---

## References

- [PT-BR Script Template & Hook Library](references/ptbr-script-hooks.md)