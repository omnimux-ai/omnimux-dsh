# UGC Homeowner Testimonial — Problem → Payoff Arc

## 1. When to Use This Pattern

**Best fit:**
- Home improvement products with a clear seasonal or environmental pain point (heat, cold, UV, rain, insects, noise)
- Outdoor living upgrades (shading, decking, fencing, HVAC, smart home)
- Regional/local brands where a neighbor-next-door voice builds trust faster than polished production
- Meta Feed, IG Reels, TikTok — 9:16, 30–40 seconds, conversion objective

**Not a fit:**
- Luxury goods where aspirational distance is the point
- B2B / trade audiences
- Products with no relatable environmental hook (pure lifestyle accessories, fashion)

---

## 2. Hook & Opening

**Structural move: Environmental frustration hook — spoken problem, visual confirmation**

The persona opens mid-thought, as if already complaining to a friend. The first line names the pain point in concrete, sensory terms — not abstract ("I was frustrated") but physical ("the sun turns our patio into an oven by noon").

**Invented generic example (neutral hypothetical product):**
> *"The afternoon sun used to make our back patio completely unusable — like, who wants to sit outside when it feels like a furnace out there?"*

**On-screen text hook (block style, top of frame, first 2s):**
> "Afternoon Sun Ruining Your Patio?"

**Swap rule:** Replace the geographic/environmental noun ("summer heat," "coastal humidity," "winter draft") and the location noun ("patio," "deck," "backyard") with whatever matches the new product's pain point. The rhetorical question format and the word "ruining" (or equivalent strong verb) are **locked**.

**Structural rule:** Hook text appears as a static block overlay (position_y_ratio ≈ 0.08, high contrast, large type). It is **not** the caption — it is a separate baked-in overlay that reads before the captions start. Keep it to ≤8 words.

---

## 3. Narrative Arc

Total target: **30–38 seconds** (you may approve up to ~38s; stay under 40s).

| Beat | Name | Target Duration | Word Count (1.5–3.0 w/s) | What Happens |
|------|------|----------------|--------------------------|--------------|
| 1 | **Problem Hook** | 6–8s | 14–22w | Persona names the pain point in first person, sensory/concrete language. Camera: slight handheld drift, mid-shot. Pacing: conversational, slightly frustrated. |
| 2 | **Product Reveal** | 9–12s | 22–32w | Persona introduces the product by name + category, explains the key differentiator in one sentence. Camera: cut to product in use + back to face. Tone: relieved, impressed. |
| 3 | **Lifestyle Payoff** | 4–6s | 8–14w | One punchy line about the emotional/experiential upgrade. Short. Camera: wider shot, product visible in background. Tone: warm, content. |
| 4 | **Direct CTA** | 8–10s | 16–22w | Persona speaks the CTA directly to camera. Offer details appear as on-screen pill/overlay (do NOT speak the phone number or URL — bake it visually). Tone: friendly urgency. |
| 5 | **Branded End Card** | 3–5s | (no dialogue) | Static image: logo + product/lifestyle background + baked-in offer text + contact info. Captions muted. Music fades. |

**Pacing band: 1.5–3.0 words/second.** Never exceed 3.0 w/s. Scene 3 is the one place you can drop below 1.5 for dramatic weight.

---

## 4. Visual Style Spec

**Format:** UGC handheld throughout — no gimbal, no locked-off tripod, no drone. Slight natural drift and reframe = authenticity signal.

**Aspect ratio:** 9:16 (vertical), 1080×1920.

**Color palette:** Warm naturalistic. No heavy LUT grading. Environment should feel like a real backyard/patio in good afternoon light. For warm-climate brands: golden hour warmth is on-brand; avoid cold blue tones.

**Camera grammar:**
- Scenes 1–3: Mid-shot to medium-close-up on persona. Product visible in or entering frame when relevant.
- Scene 4 (CTA): Direct-to-camera, slight push-in or zoom-in as urgency builds.
- Scene 5: Static image (output_type: image in director call) — no video movement.

**Shot length distribution:** Scenes 1–4 are continuous or minimally cut within each scene. The edit is a 5-scene assembly, not a rapid-cut montage.

**On-screen text policy:**
- **Hook overlay:** Block style text, top-of-frame (position_y_ratio 0.08), high-contrast (white text, dark background or outline), ≤8 words, appears at 0s.
- **Captions:** Clean-bold preset, DM Sans (or equivalent sans-serif), word-appear mode. Active on scenes 1–4. Muted on scene 5.
- **CTA info pill:** Phone number or URL as a bottom-center pill overlay on the CTA scene (scene 4). Brand primary color pill. Text: phone number or short URL only. **Do not speak this aloud.**
- Scene 5 end card: All offer text, phone, and logo baked into the image asset — no dynamic overlays needed.

**Music:** Warm acoustic/country-pop instrumental (BPM ~90–110). Volume low (0.10–0.14) — music bed, never competing with voice. Fade out on or just before end card.

---

## 5. Voice & Persona

**Persona archetype:** Middle-aged homeowner peer (male or female, adapt to brand/product). Age 40–55. Dressed practically for the setting (polo, chinos, casual but put-together). Setting matches the product's environment (patio, backyard, garage, kitchen).

**Tone:** Deadpan-relatable opening → genuinely impressed reveal → warm and direct CTA. NOT a salesperson. NOT over-hyped. The persona discovered a good thing and is telling a neighbor about it.

**Speech pacing:** Conversational, slight pauses at sentence breaks. Avoid run-on delivery. The pauses create natural edit points and let captions catch up.

**Sample line rhythm (fill-in-the-blank template):**
- Problem: *"[Location/situation] used to make our [space] completely unusable — like, who wants to [activity] when it feels like [vivid analogy]?"*
- Reveal: *"Then we found [the brand] — they make [product category] that [key differentiator]."*
- Payoff: *"Now we're actually out here [activity], [emotional outcome]."*
- CTA: *"If your [space] has the same problem, [the brand] has a deal right now — [soft offer tease]. [Brand name], look 'em up."*

**Name the persona** with a generic placeholder first name when calling setup_persona — this anchors consistency across director calls.

---

## 6. CTA Mechanic

**Type:** Soft spoken tease + hard visual pill + branded end card.

**Spoken CTA pattern:** Persona acknowledges shared pain, names the brand, teases an offer ("they've got a deal right now"), and closes with a brand-name call-to-action ("[the brand], look 'em up" / "[the brand], give 'em a call"). **Do not speak the phone number, discount percentage, or URL aloud.**

**Visual CTA layer (scene 4):** Bottom-center pill overlay with phone number or short URL. Brand primary color. Appears when persona begins the CTA beat.

**End card (scene 5):** Static branded image containing:
- Brand logo (prominent)
- Product/lifestyle background (one of the upload photos)
- Offer text baked in (e.g., a percentage discount plus a bonus such as free installation)
- Phone number / website
- Duration: 3–5 seconds. No captions. Music at low volume or faded.

**Do not use:** Comment-bait CTAs, link-in-bio CTAs, or swipe-up mechanics for this pattern. This is a direct-response offer CTA, not an engagement-farming CTA.

---

## 7. Hard Rules / Do-Not-Regress

Treat each as non-negotiable for this pattern:

1. **Duration cap: 38 seconds max.** A 30s target is the default; extend to ~38s only if dialogue needs it. Never exceed 40s.
2. **Pacing band: 1.5–3.0 words/second per scene.** Script each scene's word count against its target duration before writing dialogue.
3. **Phone number / offer details go on screen, not in voiceover.** Speaking the number aloud disrupts conversational tone and feels like a TV spot. Bake it into the end card image and use a pill overlay on the CTA scene.
4. **End card must be a static image (output_type: image), not video.** Logo + lifestyle background + offer text + phone. Captions muted on end card scene.
5. **UGC handheld throughout scenes 1–4.** Do not specify "cinematic," "stabilized," or "locked-off" camera for the persona scenes.
6. **Music is a bed, not a feature.** Volume ≤ 0.14. Warm acoustic/country-pop. Instrumental only.
7. **Product references must use uploaded brand images** (as `input:image-N` references in director calls) wherever the product appears in frame. Do not rely on model imagination for branded product appearance.
8. **Hook overlay is separate from captions.** It's a baked-in block text overlay (not caption_style), position top-of-frame, present from 0s, ≤8 words.
9. **Persona setup uses `candid` style, 9:16 ratio.** Always specify the patio/backyard/relevant environment in the persona prompt.
10. **Brand name and product category must be spoken clearly** in the product reveal beat (scene 2) — this is the moment of maximum attention and should not be vague.