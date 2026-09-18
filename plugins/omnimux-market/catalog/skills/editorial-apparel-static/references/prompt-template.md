# Worked Prompt Example

A fully filled prompt skeleton for this pattern, using a generic placeholder brand. Use it as a template; swap brand / garment / copy as needed. Keep the section headers — they help the model parse the brief.

---

```
SUBJECT (preserve from reference image):
  Preserve the subject from the reference image exactly — face, skin tone,
  hair, body proportions, pose, gaze, and framing. The subject's identity
  must not change. Only the garment changes.

GARMENT (replace, full spec):
  [Brand] trunk in deep navy. Microfibre elastane stretch fabric with
  a soft matte sheen and a clean four-way stretch drape. Mid-rise cut, snug
  fit, short leg opening with flat-locked stitching. Wide elastic waistband
  in matte black, with the wordmark "[BRAND]" repeated in white sans-serif
  caps across the front of the waistband, and a single horizontal red
  accent stripe running along the lower edge of the waistband. Replace any
  pre-existing branding from the reference image — the reference's
  waistband wordmark must not appear in the output.

SET & LIGHT:
  Studio seamless backdrop, off-white at the top transitioning to a warm
  warm-grey at the bottom, gentle vertical gradient. Soft large key light
  from camera-left at roughly 45 degrees, gentle rim light from
  camera-right separating the subject from the backdrop. No hard shadows.
  Skin reads luminous, not glossy. No props. No furniture. No environment.
  Editorial catalogue register.

FRAMING:
  Square 1:1 canvas, 2K. The subject occupies the right two-thirds of the
  canvas. The left third is empty studio backdrop reserved for typography.
  Three-quarter length crop. Slight headroom.

TYPOGRAPHY (bake every glyph into the image):
  Top-left corner: brand wordmark "[BRAND]" in a clean modern sans, medium
  weight, black ink. Immediately below it, smaller, wide-tracked all-caps
  sub-mark: "THE CORE EDIT".

  Vertical centre of the left third, stacked on three separate lines, each
  ending with a period, set in a high-contrast modern serif (Didone
  register):
    Line 1: "Refined."
    Line 2: "Modern."
    Line 3: "Timeless."

  Directly beneath the third headline line, small sentence-case sub-line in
  the same sans as the wordmark: "Style #001 · Microfibre stretch fabric."

  Bottom-left corner: a pill-shaped CTA with a solid black fill and white
  sans-serif caps text reading: "SHOP THE COLLECTION →".

SPELLING GUARDS (do not misspell any of these):
  "Refined" — R-E-F-I-N-E-D.
  "Modern" — M-O-D-E-R-N.
  "Timeless" — T-I-M-E-L-E-S-S. Note the double S. Do not misspell.
  "Collection" — C-O-L-L-E-C-T-I-O-N. Note the double L. Do not misspell.
  "Microfibre" — M-I-C-R-O-F-I-B-R-E.

NEGATIVE:
  No extra people. No props. No environment. No watermark. No additional
  text beyond what is specified above. No competitor branding. No
  pre-existing waistband wordmarks from the reference.
```

---

## Notes on this template

- The section headers (`SUBJECT`, `GARMENT`, `SET & LIGHT`, `FRAMING`, `TYPOGRAPHY`, `SPELLING GUARDS`, `NEGATIVE`) are load-bearing. Keep them.
- Every long word that appears as on-screen text gets its own line in `SPELLING GUARDS`. Image models will routinely render a word like `Timeless` as `Timelesss` — adding the per-letter guard fixes it on the next pass.
- `SUBJECT` always comes first; it is the strongest anchor for I2I likeness preservation.
- `NEGATIVE` is short on purpose. Long negative lists confuse the model.
- The phrase "Replace any pre-existing branding from the reference image" inside `GARMENT` is the single most important sentence when the reference shows a competitor's garment.
