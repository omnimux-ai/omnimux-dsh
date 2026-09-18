# Fashion Silent Multi-Shot Showcase

A visually-led fashion ad that lets the product speak for itself — no text, no voiceover, just editorial angles, confident movement, and music. Every run of this skill produces **3 complete ad variants** (≈20s each), each starring a different persona, so the brand simultaneously demonstrates fit across body types and unlocks creative range.

---

## 1. When to use this pattern

**Use it for:**
- Apparel, footwear, accessories, or jewellery where the physical product (cut, drape, texture, color) is the hero
- Brands targeting women 40–65 where elegance and confidence — not hype — drive purchase
- Any brief asking for "clean showcase," "editorial," "silent," "multi-angle," or "show how it looks on a real person"
- Campaigns that need size-inclusivity messaging without making it the headline

**Do not use for:**
- Products that require demo or explanation (tech, food, SaaS)
- Briefs that demand on-screen pricing, call-to-action text, or direct-response copy
- UGC/selfie-cam style content — this pattern is locked-off, editorial, never handheld

---

## 2. Hook & Opening

**Structural move:** Silent cold open — the model is already in position in frame 1. No countdown, no text card, no fade-in logo. The hook is the product *on a person*, filling the frame immediately.

**Generic example (invented — for a neutral apparel product):**
> Scene 1: Woman in a bright, airy room, facing camera, wearing the [product], hands at sides, natural posture — static locked-off wide shot, 4 seconds, no speech, no text.

**Swap the subject, keep the move:** Replace the product and persona. Keep the immediate full-frame presence, the static camera, the absence of any intro card. The product must be fully visible in frame 1 — no mystery, no reveal from behind a blur.

---

## 3. Narrative Arc — 360° Reveal

The arc gives the viewer a complete mental model of the garment in five beats. Do not reorder, skip, or replace beats.

| Beat | Scene | Camera | Duration | What to show |
|------|-------|--------|----------|--------------|
| 1 | **Front pose** | Locked-off, medium-full | 3–4s | Full front of garment; model facing camera, natural relaxed stance |
| 2 | **Back turn** | Locked-off, medium-full | 3–4s | Model turns 180°; show back cut, drape, hem |
| 3 | **Detail close-up** | Locked-off, tight | 3–4s | Signature product feature: fabric texture, button detail, waistband, collar, zipper — whatever is the brand's craftsmanship claim |
| 4 | **Walk toward camera** | Locked-off, medium | 3–4s | Model walks naturally toward lens; shows movement, drape in motion, silhouette |
| 5 | **Smile / face close-up** | Locked-off, medium-close | 3–4s | Face and upper body; warm, natural smile — confidence payoff |

**Total runtime per variant: ~20 seconds (5 × 4s).**

Voice/visual tone per beat: quiet, warm, editorial. No energy spikes, no speed ramps, no jump cuts. Rhythm is even.

---

## 4. Visual Style Spec

| Dimension | Spec |
|-----------|------|
| Style | Editorial / aspirational — NOT UGC, NOT lifestyle-candid |
| Background | Clean, bright, airy — white or light-neutral living room, studio, or soft outdoor (Variant 3 may use an outdoor setting) |
| Lighting | Soft natural or soft-box light; no harsh shadows; no dramatic low-key |
| Camera | **Locked-off every scene** — no handheld, no dolly, no zoom during shot |
| Shot length distribution | Even: all 5 scenes the same duration (3–4s each) |
| On-screen text | **None** — `mute_captions: true` on every scene |
| Color grading | Clean, natural; gentle warm-neutral grade; no desaturation, no heavy LUT |
| Transitions | Simple cut; no dissolves, no wipes |

---

## 5. Voice & Persona

**Voiceover:** None. `speech_status: silence` on every scene.

**Music:** Upbeat instrumental only — no lyrics, no vocals. ~110 BPM. Warm, slightly elegant (think light piano + strings, or acoustic guitar + light percussion). Volume: 0.35. One shared track across all 3 variants is acceptable; 3 separate tracks for variety is also fine.

**Persona archetype:** Confident, real, age-appropriate. She is not a size-0 runway model; she is the target customer looking her best. Warm editorial — stylish without being intimidating.

---

## 6. The Three Mandatory Variants

Every session MUST deliver exactly 3 labeled ads. No exceptions.

### Variant 1 — "Standard Fit"
- **Persona:** Elegant mature woman, 45–55, average-proportional build
- **Persona prompt build axis:** `"average proportional build, elegant posture"`
- **Setting:** Clean bright living room or studio (establishes visual anchor for the campaign)
- **Arc:** Standard 360° Reveal as spec'd above
- **Label in output:** `final:v1 — Standard Fit`

### Variant 2 — "Plus Size"
- **Persona:** Middle-aged woman, 45–55, fuller/curvy build
- **Persona prompt build axis:** `"fuller soft figure with curvy proportions, well-proportioned, natural and confident"` — use these exact phrases in the `setup_persona` prompt
- **Tone of depiction:** Confident, beautiful, stylish — identical editorial energy to Variant 1. NOT apologetic, NOT "brave," NOT "body positive campaign." She simply wears the same product with the same ease.
- **Product references:** Use the same product images as Variant 1. If the brand page includes a plus-size model shot, use it; otherwise describe the figure in the persona prompt.
- **Setting:** Same as Variant 1 (same room/lighting is fine — the persona is the differentiator)
- **Arc:** Same 360° Reveal
- **Label in output:** `final:v2 — Plus Size`

### Variant 3 — "Creative Director's Choice"
Pick ONE creative angle that best fits the product and hasn't been covered by Variants 1 & 2. Choose the first option from this priority list that is a genuine fit:

| Option | When to pick it | What changes |
|--------|----------------|--------------|
| **Outdoor lifestyle** | Product reads as casual/active OR brand has outdoor imagery | Setting moves outside — sunlit park, city street, café terrace; same static camera |
| **Younger end of target** | Brand appeals 40–50 range OR product has a younger styling | Woman closer to 45, slightly more dynamic energy, casual styling |
| **Alternate colorway** | Product comes in 2+ colors | Feature a contrasting color on a new persona with a complementary wardrobe palette |
| **Monochromatic styling** | Product has a strong single color (navy, camel, white, black) | Head-to-toe tonal dressing — jeans navy + navy/dark top for sleek editorial |
| **Active/casual** | Product is comfortable-wear, stretch, or everyday | Motion-heavy scenes: stair-climbing, outdoor walking, active movement |

- **Persona:** Must differ from Variants 1 & 2 on at least 2 of: age band, ethnicity, hair color
- **Setting:** May differ from Variants 1 & 2 if the creative angle calls for it
- **Arc:** Same 360° Reveal (may swap scene 4 to stairs/outdoor walking if "Active/casual" angle is chosen)
- **Label in output:** `final:v3 — Creative Director's Choice`

---

## 7. Persona Diversity Rules (Across All 3 Variants)

- No two personas may share more than ONE of: age band, ethnicity, hair color
- All three must be in the **45+ age band** (this is a hard rule for this target audience)
- Variant 3 may share ethnicity with Variant 1 OR Variant 2 — but not both

---

## 8. Production Order

1. **Inspect product assets** — call `get_asset` on all product reference images before composing persona prompts. Understand the product's color(s), silhouette, and key features.
2. **Compose 3 persona prompts in parallel** — one per variant, using the persona rules above.
3. **Generate music** — `music_generate` × 1 (shared) or × 3 (for variety). Upbeat instrumental, ~110 BPM, no vocals.
4. **Spin up 3 personas in parallel** — `setup_persona` × 3 simultaneously.
5. **Dispatch 15 director scenes in parallel** — 5 scenes × 3 variants. All scenes for all variants can go in one parallel batch once personas are ready.
6. **Assemble 3 videos in parallel** — `assemble_video` × 3.
7. **Deliver** — present all 3 labeled videos to the user.

---

## 9. CTA Mechanic

This pattern has **no in-video CTA**. The ad ends on the smile close-up (Beat 5). The CTA is handled at the platform level (link in bio, swipe-up, caption). Do not add an on-screen card, a spoken sign-off, or a logo end-frame unless the brief explicitly requires it.

---

## 10. Hard Rules / Do-Not-Regress

These are the locked rules for this skill. None may be relaxed.

1. **Always produce 3 variants.** A session that delivers fewer than 3 complete ads has not fulfilled this skill.
2. **`mute_captions: true` on every scene, every variant.** No text overlays, ever.
3. **`speech_status: silence` on every scene, every variant.** No voiceover, ever.
4. **Static locked-off camera on every scene.** No handheld, no dolly, no zoom during shot.
5. **Music: instrumental only, no vocals, ~110 BPM, volume 0.35.**
6. **All 5 scenes per variant share the same persona instance** — no persona switching mid-variant.
7. **Variant 2 persona prompt MUST include the phrase:** `"fuller soft figure with curvy proportions, well-proportioned, natural and confident"` — do not soften or paraphrase.
8. **Variant 2 must be depicted with identical editorial dignity to Variant 1** — same lighting, same tone, same scene energy. No difference in treatment.
9. **No two personas may share more than one identity axis** (age band, ethnicity, hair color).
10. **Product reference images must be inspected via `get_asset` before director dispatch.** Never describe a product from memory or from a URL alone.
11. **Do not add intro cards, countdown slates, or logo end-frames** unless the brief explicitly requires them.
12. **All 3 personas must be in the 45+ age band.** Do not cast younger models to make the ad feel more "aspirational."
13. **Background must be clean, bright, and airy.** No dark, dramatic, or moody environments unless Variant 3's creative angle explicitly calls for an outdoor setting (which is still bright and airy).