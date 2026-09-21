# Editorial Apparel Static, From Reference

A creative mold for premium, magazine-register apparel still ads built from an uploaded model reference. The reference supplies the human (pose, likeness, body, framing). The brief supplies the garment, the brand, and the typography. The output is one finished, type-baked image — the kind of frame that could run in a glossy, on a paid social feed, or on a storefront window.

The subject is **always swappable** (different brand, different garment, different model reference). The structural moves below stay locked.

---

## 1. When to use this pattern

Suits:
- Underwear, swimwear, intimates, loungewear, hosiery, base layers.
- Premium denim, knitwear, outerwear, footwear hero shots.
- Fragrance, eyewear, watches when shot on a person.
- Square (1:1) feed, 4:5 paid social, 9:16 story / OOH, 3:4 lookbook crops.

Does not suit:
- Multi-scene video — use the video director skills.
- Non-worn product (bottles, packshots on infinite white) — use a standard product-photography prompt.
- Cluttered "lifestyle in environment" scenes — this pattern is studio-register, not narrative.

---

## 2. Hook & opening — the visual hook

This is a still, so the "hook" is the **first-glance composition**. The locked move:

> **Subject occupies the right two-thirds of the canvas. The left third is deliberate negative space holding a vertical typography stack: brand wordmark at the top, three-line stacked headline in the visual centre, pill-shaped CTA at the bottom-left.**

Example layout (generic placeholder copy — invent fresh copy per brief):

- Top-left: the brand wordmark, immediately below it the sub-mark naming the line or collection.
- Centre-left: a three-line stacked headline — `Word one.` / `Word two.` / `Word three.` — each word on its own line, period after each.
- Bottom-left: a pill-shaped CTA reading `SHOP THE COLLECTION →`.
- Right two-thirds: the model from the reference, full or three-quarter length, garment swapped to the briefed product.

Swap rule: **change the words, the brand, the garment. Keep the L-shape of type-on-left, subject-on-right, and the three-line stacked headline.** Do not recompose into centred type, type-over-subject, or full-bleed subject with floating text — those are different creative patterns.

---

## 3. Narrative arc — single-frame beat structure

A still has no time axis, so the "arc" is the **eye-path**. Engineer the image so the viewer's eye lands in this order:

1. **0.0s — Garment first.** Strongest contrast (waistband, hem, brand mark on the product) is positioned at roughly the canvas centre or at the rule-of-thirds intersection. This is the product hero moment.
2. **0.3s — Model's face / posture.** Slightly above and to the right of the garment hero point. Confident, relaxed, "doesn't need to sell it" energy.
3. **0.6s — Brand wordmark.** Top-left, smaller than the headline but unmistakably the first thing in the type column.
4. **0.9s — Headline.** Three short stacked lines, set in a high-end serif or a clean modern sans (see §5).
5. **1.2s — CTA pill.** Bottom-left, lowest in the type column, the "what to do" payoff.

If the eye-path doesn't read in roughly this order, the composition is wrong — regenerate.

---

## 4. Visual style spec

| Element | Locked spec |
|---|---|
| Register | Editorial / catalogue — high-end fashion register. Not UGC, not lifestyle, not e-comm flat. |
| Backdrop | Studio seamless. Off-white to warm-grey gentle vertical gradient. No props, no furniture, no environment. |
| Lighting | Soft, large key from camera-left at ~45°, gentle rim from camera-right to separate the subject from the backdrop. No hard shadows. Skin reads luminous, not glossy. |
| Colour palette | Neutral set (off-white, warm-grey, bone, charcoal) + one saturated accent that comes from the garment itself (e.g. navy + red stripe). The accent should appear only on the garment, never in the backdrop or type. |
| Lens / framing | 85mm equivalent feel. Three-quarter length or full length depending on the reference. Subject centred vertically. Slight headroom. |
| Shot length / focus | Sharp on the garment. Falloff is gentle, not extreme — this is editorial, not portraiture. |
| Aspect ratio | Match the brief. 1:1 default for "social square / print," 4:5 for paid social, 9:16 for story / OOH, 3:4 for lookbook. |
| On-screen text | All typography baked into the image. No external compositing implied. |

---

## 5. Voice & persona — the typography voice

The image does not speak, so "voice" is **type and copy register**.

- **Tone:** confident, understated, slightly aspirational. Short. Period-terminated. Never exclaimed.
- **Headline structure:** three single-word or two-word lines, each ending with a period. The cadence is `Adjective. / Adjective. / Adjective.` or `Verb. / Noun. / Payoff.` Example: `Refined. / Modern. / Timeless.`
- **Sub-mark under the brand wordmark:** all caps, wide letter-spacing, names the line or collection (e.g. `THE EVERYDAY SERIES`, `SS25`, `THE CORE EDIT`).
- **Style / SKU sub-line:** small, sentence case, sits below the headline. Optional but adds catalogue credibility. Example: `Style #001 · Microfibre stretch fabric.`
- **CTA copy:** imperative, six words or fewer, ends with a `→`. Example: `SHOP THE COLLECTION →`.
- **Type families to call for in the prompt:** a high-contrast modern serif (Didone register — think Vogue / Harper's) for the headline, OR a clean geometric sans (Helvetica Now / Neue Haas Grotesk register) for a more contemporary feel. Pick one register per ad; do not mix.

Persona archetype encoded by the model in the reference: **the confident insider** — they own the room, do not perform for the camera, look at lens or just past it. The skill does not change the persona; it inherits it from the reference image.

---

## 6. CTA mechanic

A single pill-shaped CTA in the **bottom-left corner**, in the type column, set in the same sans the rest of the chrome uses. White text on a black or accent-coloured pill, or black text on a white-with-1px-border pill — pick the higher-contrast option against the local backdrop. Always ends in `→`. Never two CTAs. Never a CTA in the bottom-right (that is where social UI lives).

---

## 7. Hard rules / do-not-regress

These are non-negotiable. Each one is from a real correction or failure mode.

1. **Use `generate_image` directly. Do NOT route through a video director.** This is a single still. One call.
2. **Model = `nano-banana-2` for anything involving a human reference.** It preserves likeness, pose, skin tone and body proportions far better than alternatives, and its content moderation is more permissive for legitimate fashion / intimates briefs. `gpt-image-2.5-sunburst` is acceptable ONLY for typography-only graphic ads with no person in frame.
3. **Intimate-apparel moderation safe-rewrite.** When the garment is underwear, swimwear, intimates, or any base-layer category, do not use explicit body-part nouns in the prompt. Banned in the prompt body: `torso`, `chest`, `abs`, `thigh`, `thighs`, `crotch`, `shirtless`, `nude`, `naked`, `underwear` (use the brand's term: "trunk," "brief," "boxer," "bralette," "swim short"). Describe the **garment** (silhouette, fabric, cut, waistband, leg opening, drape, colour, stitching) and the **setting** (lighting, backdrop, framing). Refer to the person as "the model from the reference image" or "the subject from the reference." Pose language about arms, hands, head, gaze is fine ("arms raised, hands clasped behind the head, head tilted, eye-line just past camera").
4. **Spelling guard for every baked-in word longer than 7 letters or containing double letters.** Image models routinely hallucinate `Timeless` to `Timelesss`, `Collection` to `Collecttion`, `Microfibre` to `Microfribe`. For each such word, append a per-letter spell-out in the prompt:
   `T-I-M-E-L-E-S-S — "Timeless." Do not misspell it.`
   Do this for the headline words, the sub-mark, the SKU line, and the CTA. Yes, it bloats the prompt. Do it anyway.
5. **Keep every overlay line at 8 words or fewer.** Long lines tile poorly and amplify the spelling-hallucination risk.
6. **Always QA the output by retrieving the asset and re-reading every glyph.** A single-letter typo in a print-ad headline is unshippable. If any word is wrong, regenerate with a tighter per-letter spell-out for the offending word. Do not "ship and fix later."
7. **Brand-swap rule when the reference shows a different brand on the garment.** The reference image will often carry a competitor's wordmark on the waistband, label, or hangtag. Explicitly instruct: "Replace the garment branding from the reference with the target brand's waistband / label / accent treatment exactly as specified. The reference's existing wordmark must not appear in the output." Otherwise I2I will faithfully reproduce the wrong brand.
8. **Preserve the model exactly.** The prompt must include language like "Preserve the subject from the reference image exactly — face, skin tone, hair, body, pose, framing. Only the garment changes." Do not paraphrase the model into a different person.
9. **One accent colour, sourced from the garment.** Backdrop and type chrome stay neutral. Resist the urge to colour-match the CTA pill to the garment accent unless the brief explicitly asks for it.
10. **No environment, no props, no second subject.** Studio seamless only. Adding a "lifestyle" element collapses the editorial register.

---

## 8. Prompt skeleton

Fill this skeleton when calling `generate_image`. See `references/prompt-template.md` for a fully worked example.

```
SUBJECT (preserve from reference):
  Preserve the subject from the reference image exactly — face, skin tone,
  hair, body, pose, framing, gaze. Only the garment changes.

GARMENT (replace):
  [Brand] [garment type] in [colour]. [Fabric]. [Cut / silhouette / leg
  opening / waistband detail]. Waistband reads "[BRAND]" in [colour] on
  [colour] with [accent treatment, e.g. a single red stripe]. Replace any
  pre-existing branding from the reference image — the reference's wordmark
  must not appear.

SET & LIGHT:
  Studio seamless backdrop, off-white to warm-grey gentle vertical gradient.
  Soft large key from camera-left at 45 degrees, gentle rim from camera-right.
  No props. No environment. Editorial register.

FRAMING:
  [Aspect ratio]. Subject occupies the right two-thirds of the canvas.
  Left third reserved for typography. [Three-quarter / full] length.

TYPOGRAPHY (bake into the image):
  Top-left: "[BRAND]" wordmark in [type style], and beneath it "[SUB-MARK]"
  in wide-tracked all caps.
  Centre-left, stacked on three lines: "[Word1]." / "[Word2]." / "[Word3]."
  in [serif / sans]. [Per-letter spell-out for each long word.]
  Below the headline, small: "[SKU / fabric sub-line]."
  Bottom-left: pill-shaped CTA reading "[CTA COPY] →" in [contrast spec].

SPELLING GUARDS:
  [Word1]: [W-O-R-D-1]. Do not misspell.
  [Word2]: [W-O-R-D-2]. Do not misspell.
  ... (repeat for every word > 7 letters or with double letters)

NEGATIVE:
  No extra people. No props. No environment. No additional text beyond
  what is specified above. No watermarks. No competitor branding.
```

---

## 9. Reference material

- `references/prompt-template.md` — a fully filled prompt skeleton, with a generic worked example annotated.
- `references/spelling-guard-library.md` — pre-built per-letter spell-outs for the words this pattern uses most.