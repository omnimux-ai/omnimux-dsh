# Style Overrides — Split-Screen Dialog Ad

The default is **UGC selfie**. Only override when the user explicitly asks. All overrides keep the layout (woman top, man bottom, thin white divider, no UI chrome, no in-frame text) — they only change lighting / wardrobe / camera feel.

---

## Default: UGC selfie (do not touch unless asked)

- Lighting: natural window light (woman), warm tungsten / lamplight (man).
- Camera: phone selfie focal length, slight wide distortion, 1–2px handheld breath.
- Wardrobe: casual layered, lived-in.
- Color: warm whites top, warm dim ambers bottom.

---

## Override: Cinematic

Use when brand is premium fashion, automotive, fragrance, or "luxury wellness".

- Lighting: motivated key light + soft fill, deep shadows on the man's half.
- Camera: 35mm-feel, locked-off, **no** handheld breath. Slight anamorphic squeeze if the backend supports it.
- Wardrobe: monochrome, structured (cashmere, wool, tailored cotton).
- Color: cool desaturated top, deep teal/charcoal bottom.
- Divider: keep it. Do not remove. It's the format's signature.

Append to `style_direction`:
> Cinematic 35mm look, locked-off, deep shadow modeling, monochrome wardrobe, cool desaturated palette. Divider line stays. No video-call UI, no in-frame text.

---

## Override: Studio / commercial

Use when brand wants a polished tech-product feel (SaaS, fintech, productivity apps).

- Lighting: flat soft-box, no shadow drama.
- Camera: locked-off, no handheld at all.
- Wardrobe: solid colors, brand-palette aligned.
- Color: clean white top, soft brand-accent bottom.

Append to `style_direction`:
> Clean studio softbox lighting, flat shadow profile, locked-off camera, brand-palette wardrobe. Divider line stays. No video-call UI, no in-frame text.

---

## Override: ASMR / whisper register

Use when the script is conspiratorial, intimate, "between us" — typically therapy, manifestation, journaling, sleep apps.

- Lighting: very low key, candle-warmth on the woman's half, near-darkness on the man's half with a single rim light.
- Camera: extreme close, locked.
- Voice direction: whisper or near-whisper, breath audible.
- Music: ambient pad, volume 0.08 (lower than default 0.12).

Append to `style_direction`:
> Low-key intimate lighting, candle warmth top half, single rim light bottom half, very tight framing. Divider line stays. No video-call UI, no in-frame text.

---

## What does NOT change across any override

- Split-screen layout, woman top, man bottom, thin white divider at center.
- No video-call UI chrome.
- No text or posters inside the frame.
- Both personas in every scene.
- Plain wall behind the man.
- 1.5–3.0 w/s pacing band.
- 1080×1920 output.
