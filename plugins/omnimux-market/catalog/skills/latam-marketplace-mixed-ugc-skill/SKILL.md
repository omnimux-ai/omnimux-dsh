# LatAm Marketplace Mixed-UGC Ad

A creative pattern for ~30-second vertical ads selling a **multi-category LatAm marketplace** by mixing three layers: a relatable local presenter, a phone-UI walkthrough of the catalog, and the brand's own illustration animated to life. Anchored on a single convenience attribute, not a feature dump.

---

## 1. When to use this pattern

**Use it when all of these are true:**
- Brand is a LatAm e-commerce marketplace or multi-category retailer (Chile, Mexico, Colombia, Argentina, Peru).
- Brief is in Spanish (or asks for Spanish output) and uses phrases like "atributos esenciales", "video promocional", "para TikTok / Reels".
- The brand site shows ≥3 distinct product categories (e.g. ropa, hogar, tecnología, mascotas).
- Target platform is TikTok, Reels, or Shorts (9:16 vertical, ≤40s).

**Don't use it for:**
- Single-product DTC (no category breadth → scene 2 fails).
- Luxury / premium brands (the casual register reads as off-brand).
- B2B, SaaS, fintech-only.
- English-language US/UK ads — the regional voice is the whole point.

**The one-attribute rule.** Marketplaces are tempted to brag about everything. Resist. Pick ONE convenience attribute as the hook — "despacho rápido a todo el país", "ofertas nuevas cada semana", "pago seguro", "envíos gratis sobre $X". Catalog breadth surfaces naturally in scene 2 (the UI scroll); it doesn't need to be the headline.

---

## 2. Hook & opening (scene 1, ~6s)

**Structural move:** Selfie-POV pattern interrupt where the presenter speaks *directly to a specific geographic in-group* and promises a convenience payoff. "If you live in [country], I'll show you how to buy everything without leaving the house."

**Generic example (invent fresh copy per run — do not reuse a brand's actual line):**
> "Si vives en [country], te muestro cómo conseguir de todo sin moverte de tu casa."

**Swap-the-subject rule.** Keep the structure `Si vives en [country/region], te muestro cómo [convenience verb] sin [friction]`. Swap only:
- The country/region ("Si vives en México…", "Si estás en CDMX…", "Si estás en Bogotá…")
- The convenience verb ("comprar de todo", "pedir lo que sea", "armar tu mercado")
- The friction being removed ("sin salir de la casa", "sin pagar envío", "sin pelear con el mall")

**Hook overlay (on-screen text, 3s).** Two-line caption at the **top** of the frame (`position_y_ratio: 0.08`), style `outlined`, short enough to read in 1s. Format: `[Verb action]\n[without friction] [country flag emoji]`. Example: `Compra de todo\nsin salir de casa 🇨🇱`. Always include the country flag emoji — it's the single highest-impact cultural anchor.

**Conditional placement.** Inspect scene 1's first frame via `get_asset` and confirm the persona's head doesn't intrude into the top 18% of the frame. If it does, move the overlay to `position_y_ratio: 0.92` (bottom). Never let it overlap the face.

---

## 3. Narrative arc — 5 beats × 6s

Five scenes, 6 seconds each, ~30 seconds total. The arc is **HOOK → CATALOG → BRAND STORY → SOCIAL PROOF / PAYOFF → CTA**.

| # | Beat | Mode | Persona on-screen? | Voice | Job |
|---|------|------|--------------------|-------|-----|
| 1 | Hook | on-camera speaking | Yes (selfie POV) | Direct address | Identify the in-group, promise the convenience payoff. |
| 2 | Catalog reveal | voice-over | Hands only holding phone (or no persona) | Persona VO continues | Show the site UI with category tiles. Name 4–5 categories in one breath. |
| 3 | Brand-story animation | voice-over | No persona | Persona VO continues | Animate the brand's own illustration. Land the chosen convenience attribute. |
| 4 | Trust beat / unboxing | on-camera speaking | Yes (mid-shot, environment) | Direct address | Stack 2–3 reassurance points (ofertas semanales, pago seguro, envío rápido). |
| 5 | CTA close | on-camera speaking | Yes (selfie POV, points down) | Direct address | Tell them where to go and what to do *now*. Persona points downward toward where the CTA pill will sit. |

**Pacing fingerprint.** Target **13–15 spoken words per 6s scene** → 2.0–2.5 words/sec. Regional Spanish diminutives ("rapidito", "cositas pa'", "ahorita") add warmth without breaking the pace; lean into them.

---

## 4. Visual style spec

**Register:** Warm, modest, urban-casual. Apartment-real, not studio-pristine. Daylight (no ring-light glare).

**Color palette:** Cream, terracotta, light wood, dark indigo, with a single magenta brand accent reserved for the CTA pill. Avoid neon, avoid heavy color grading.

**Camera grammar:**
- Scenes 1 & 5 (hook + CTA): handheld vertical selfie POV, arm's-length, slight natural sway.
- Scene 2 (UI): static or slow push-in on the phone in hands. **Single thumb hover, no scroll** — scrolling causes UI text to morph/glitch in generated footage. Use a static thumb hover over the category tiles instead.
- Scene 3 (illustration): locked-off frame with 2D parallax / gentle pan on the brand illustration. Don't animate characters within the illustration; just camera-move it.
- Scene 4 (trust): locked-off mid-shot, persona on couch with a brown delivery box. Slight handheld breath only.

**On-screen text policy:**
- Captions: preset `soft-pill`, font **Comfortaa**, `appear_mode: word`. Rounded warm look that matches a marketplace tone. Do NOT use `promo-punch` (too DTC-hype) or `clean-bold` (too premium).
- Hook overlay: scene 1 only, top of frame (with conditional fallback to bottom), `outlined` style, ~3s duration.
- CTA pill: scene 5 only, bottom-center, magenta `#E91E63`, Comfortaa 84px bold white, bounce-in animation. **Set `mute_captions: true` on scene 5** so captions don't fight the pill for the same vertical real estate.

**Shot length distribution.** All 6s. Don't subdivide. The rhythm comes from the cuts between scenes, not within them.

---

## 5. Voice & persona

**Persona archetype:** Mid-20s local woman, peer-friend energy. Not influencer-hyped, not expert-authoritative — warm, conspiratorial-helpful ("te muestro", "te cuento").

**Composition rules for the persona prompt** (critical — see `references/persona-composition.md` for full prompt fragments by country):
- Explicitly describe Latina facial features: sun-kissed tan skin, dark almond eyes, dark espresso wavy/curly hair, natural freckles or warm undertones. Without this the LLM defaults to fair-European looks.
- Modest urban-casual wardrobe: cream/oatmeal crew tee + open chunky knit cardigan (camel, oatmeal, or rust) + dark indigo high-waisted jeans. No logos, no statement pieces.
- Setting: bright modest apartment living room — cream couch, terracotta or rust textile accent, light wood floor, plants in terracotta pots, sheer curtains, natural daylight.
- **Capture and reuse the persona's voice IDs** (`voice_asset_id` and any platform-specific voice id such as `kling_voice_id`) across ALL VO scenes. Mismatched voice between scenes is the #1 immersion-breaker.

**Tone & phrasing:**
- Warm, slightly conspiratorial ("te muestro cómo…", "¿Y lo mejor?…").
- Lean into regional diminutives — see `references/hook-library.md` for country-specific phrase swaps.
- Always speak the URL phonetically — "[Brand] punto cele", not "[Brand] dot CL". The TTS will mispronounce a literal `.cl` or `.mx` more than half the time.

**Sample line shapes** (swap subject, keep rhythm):
- Hook: `Si vives en [region], te muestro cómo [verb] sin [friction].`
- Catalog: `Se llama [Brand] punto [tld]. Tienen [cat1], [cat2], [cat3], y hasta [unexpected cat] pa' [audience].`
- Payoff: `¿Y lo mejor? [Convenience attribute restated as benefit].`
- Trust: `Tienen [offer cadence], [payment trust], y [delivery speed].`
- CTA: `Así que ya saben — entren a [Brand] punto [tld] y [imperative action] ahora.`

---

## 6. CTA mechanic

**Format:** Spoken CTA + visual CTA pill, simultaneous, on scene 5.

**Spoken close:** `"Así que ya saben — entren a [Brand] punto [tld] y [imperative action] ahora."` The imperative action should be low-friction and present-tense: "armen su carrito", "miren las ofertas", "pidan el suyo". Avoid "compren" alone (too hard-sell); pair with a softer verb.

**Visual pill:** Magenta `#E91E63` rounded pill, bottom-center, Comfortaa 84px bold white, bounce-in animation. The pill text is the URL only (`[brand].[tld]`, e.g. `[brand].cl`, `[brand].com.mx`) — no extra copy.

**The pointing trick.** Direct the persona to point downward with her index finger in scene 5's prompt. The CTA pill then sits where her finger directs, feeling intentional rather than tacked on. Non-negotiable — without the point, the pill reads as a post-production sticker.

---

## 7. Hard rules / do-not-regress

Each rule below comes from a real correction or discovery. Treat as binding:

1. **Single-attribute hook only.** Pick one of {fast nationwide shipping, weekly offers, secure pay, free shipping over $X}. Do not stack them in the hook. Catalog breadth is shown in scene 2, not said in scene 1.
2. **Always inspect web-fetched images via `get_asset` before storyboarding.** Classify each `web:image_N` as product hero / banner / brand illustration / captcha shell. A brand illustration (mascot, branded vehicle, map graphic) is gold for scene 3 — always use it if present, and skip generating brand visuals from scratch.
3. **No UI scrolling in scene 2.** Generated footage morphs UI text under scroll. Use a static thumb hover over category tiles instead.
4. **Reuse one persona voice across all scenes.** Capture the voice IDs from the persona generation and pass them to every VO scene's director call.
5. **Latina features must be explicit in the persona prompt.** Sun-kissed tan skin, dark almond eyes, dark espresso wavy hair, natural freckles — or the LLM defaults to fair-European.
6. **Speak URLs phonetically in dialogue.** "punto cele", "punto com punto eme equis" — never literal ".cl" or ".com.mx".
7. **Word count 13–15 per 6s scene.** Anything outside the 2.0–2.5 w/s band sounds rushed (>2.5) or padded (<2.0).
8. **`mute_captions: true` on the CTA scene only.** Otherwise the magenta pill and the caption track collide at the bottom of the frame.
9. **Caption preset = `soft-pill` + Comfortaa.** Not `promo-punch`, not `clean-bold`. The marketplace tone is warm-friendly, not hype-DTC or premium-minimal.
10. **Hook overlay placement is conditional.** Default top of frame (`y_ratio: 0.08`) — but inspect scene 1's frame first. If the persona's head intrudes into the top 18%, move the overlay to bottom (`y_ratio: 0.92`). Never overlap the face.
11. **CTA persona points down.** No exceptions. The pointing finger anchors the post-production CTA pill.
12. **Background music: instrumental Latin pop / cumbia-lite / friendly e-commerce.** ~105 BPM. Volume 0.10–0.13 under VO — anything ≥0.15 fights the persona's voice.
13. **Match diminutives and slang to the country.** "Pa'" / "rapidito" reads Chilean/Argentine; "ahorita" / "chido" reads Mexican; "chévere" reads Colombian/Venezuelan. Mixing them across markets breaks authenticity.

---

## See also
- `references/persona-composition.md` — full prompt fragments for composing the LatAm presenter persona by country.
- `references/hook-library.md` — alternative hook openings by convenience attribute and country.