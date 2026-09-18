# Cinematic Stat-Shock / Knowledge-Gap Hook — Local-Pride Pattern

## 1. When to use this pattern

**Best fit:**
- Hyper-local pride or identity merch (city, state, neighborhood, team geography)
- Products born from a widely-held misconception ("everyone thinks X, but actually Y")
- Sports event merchandise where venue, host city, or identity is contested or confused
- "Correction culture" products — bumper stickers, tees, decals that make a factual point
- Small-batch / premium-casual apparel aesthetic — not streetwear hype

**Poor fit:**
- Products that require verbal explanation or feature lists
- Abstract services (SaaS, apps, subscriptions)
- Brands with no clear factual/geographic/identity hook
- Audience unfamiliar with the underlying misconception (the hook falls flat if they don't feel the tension)

**Platform:** Vertical 9:16 (TikTok, Instagram Reels, YouTube Shorts). 15–17 seconds total.

---

## 2. Hook & Opening

**Structural move: Two-line Knowledge-Gap Statement**

Show a visually authoritative establishing shot (drone aerial, stadium crowd, landmark) while a two-line block of large text delivers the hook:

```
Line 1: Acknowledge what everyone knows / believes.
Line 2: Reveal the gap / the thing they don't know.
```

**Invented example (neutral hypothetical product):**
```
EVERYONE KNOWS THE STORY.
FEW KNOW THE SOURCE.
```

**Swap rule:** Replace the specific belief and revelation with your product's misconception. The structure — "universal belief" → "surprising gap" — is locked. The subject is always swappable.

Other hook variations in this pattern (see `references/hook-library.md`):
- `EVERYONE CLAIMS THE STORY. / FEW KNOW THE ORIGIN.`
- `EVERYONE WEARS THE CITY. / FEW HAVE BEEN THERE.`
- `MILLIONS WATCHED THE GAME. / ZERO KNEW WHERE IT WAS PLAYED.`

**Typography rule:** Anton font, gold (#FFD700), centered, ALL CAPS, each sentence on its own line. No animation — hard cut in, hold 3–4 seconds, then cut away. No background blur behind text — let the footage carry the weight.

---

## 3. Narrative Arc

**Shape:** Authority → Human → Product Close-Up → Identity Reveal → Lifestyle Payoff → CTA Card

Target total: **15–17 seconds** at 1.4× playback rate (shoot/render at 1× first).

| Beat | Label | Duration | Visual | Text Overlay |
|------|-------|----------|--------|--------------|
| 1 | **Hook** | 4s | Aerial/establishing wide shot — stadium, landmark, crowd. Cinematic, no faces needed. | Two-line knowledge-gap hook (Anton gold, centered) |
| 2 | **Human Warmth** | 3s | 2–3 people walking toward camera / push-in to product worn naturally. Warm daylight, shallow DoF. | Product slogan — first half (e.g. `KNOW THE SOURCE.`) |
| 3 | **Product Proof** | 3s | Extreme close-up of hero product detail — lettering, graphic, texture. Slight breeze or micro-movement preferred. No face. | No overlay — let the product speak |
| 4 | **Identity Reveal** | 4s | Back-of-product / secondary graphic reveal. Camera BEHIND subject, never showing face. Lock shot or slow push. | Product slogan — second half (e.g. `IT STARTED HERE.`) |
| 5 | **Lifestyle Payoff** | 3–4s | Real-world footage (actual location, road sign, landmark) OR multi-cut lifestyle montage (friends, action, product flat-lay, aerial). If real footage is available, use it — authenticity spike. | None |
| 6 | **CTA Card** | 2s | Black or fade-to-dark. Full slogan + year/season. | `[SLOGAN LINE 1]` / `[SLOGAN LINE 2]` / `[SEASON/YEAR]` (Anton gold) |

---

## 4. Visual Style Spec

- **Format:** Cinematic, not UGC. Anamorphic feel. Not handheld shaky-cam.
- **Camera grammar:** Push-in or locked-off for product close-ups. Slow aerial pull for establishing. Walk-toward-camera for human beats. Camera always BEHIND subject when showing product back — never reveal face in back-of-product shots.
- **DoF:** Shallow. Background bokeh on human shots. Sharp foreground on product close-ups.
- **Color:** Warm summer daylight. Let product color dominate frame in close-up shots. No color grading that shifts product hue — product color accuracy is non-negotiable.
- **Shot length distribution:** Beats 1–4 are held (3–4s each). Beat 5 can multi-cut (1–1.5s per cut if montage). Rhythm accelerates at the payoff beat, then hard stops at CTA card.
- **On-screen text:** Anton font, gold #FFD700, centered, ALL CAPS, each sentence on its own line. No drop shadow. No background box. Sparse — only 3–4 overlay moments total.
- **No dialogue, no voiceover.** Music only.
- **No brand/sponsor/league logos** on any AI-generated shots. Generic unnamed venues throughout.

---

## 5. Voice & Persona

**No spoken voice.** This pattern is music + text only.

**Music tone:** Anthemic, instrumental. Builds through the arc — quiet on hook, swell on identity reveal, full bloom on lifestyle payoff. Stadium energy without being sports-cliché. Royalty-free / library tracks work well (upbeat, orchestral-hip-hop hybrid style).

**Persona archetype (if a person appears):** Peer-with-insider-knowledge. Late 20s–early 30s. Dressed in the product naturally, not posed. Walking, laughing, being — not modeling. The product is incidental to their life, not the center of attention until the close-up beat.

**Emotional arc:** Intrigue (hook) → Warmth (human beat) → Conviction (product close-up) → Pride (identity reveal) → Joy (lifestyle) → Clarity (CTA).

---

## 6. CTA Mechanic

**On-screen card, no spoken CTA.**

Final screen is a hard cut to black (or fast fade) with the full product slogan + season/year displayed in Anton gold. No "link in bio", no "comment below", no "shop now" — the slogan itself IS the CTA because it's the product's reason for existing.

**Invented example (neutral hypothetical product):**
```
KNOW THE SOURCE.
IT STARTED HERE.
SEASON 2030
```

**Swap rule:** Use the product's own slogan (which should already encode the knowledge-gap correction). Add season/year if the product is event-tied. Omit season/year for evergreen products.

Optional color caveat (for garment-dyed or dye-lot products): a small subtitle in white italic: *"Color shown: [Color Name] — may appear slightly different on screen."* Place at bottom of CTA card, small type.

---

## 7. Hard Rules / Do-Not-Regress

Treat each of these as a hard rule for any future execution of this pattern:

1. **Product color accuracy is a first-class concern.** If the hero product is a specific named colorway, include the full color description in every image/video generation prompt: `"[Color Name] — LIGHT TEAL SEAFOAM MINT GREEN"` (adapt the descriptors to the actual color). Explicitly negate the wrong colors: `NOT dark green, NOT forest green, NOT olive, NOT hunter green`. Color drift between scenes is a failure.

2. **Use `gpt-image-2` (not default model) for product close-up shots when color accuracy is critical.** The default image model drifts on specific Pantone-adjacent colorways. If color looks wrong after first generation, switch models immediately — do not iterate on prompts with the wrong model.

3. **Back-of-product shots: camera is always BEHIND the subject.** Prompt must explicitly state: `"camera behind person, back of shirt facing camera, NEVER show face, person's face is away from camera."` This is a hard constraint, not a preference.

4. **Zero opposing-location or rival-city iconography.** For pride/correction merch, do NOT include the "wrong" location's landmarks even as background. The whole point is to center the correct location. Keep establishing shots generic (stadium, crowd, aerial landscape) unless you have real-location footage.

5. **No league, team, or sponsor logos.** All AI-generated stadium and crowd shots must be free of identifiable marks. Prompt must include: `"no team logos, no league branding, no sponsor signage, generic unnamed stadium."` Avoid IP liability entirely.

6. **If real-world location footage is available, use it as the lifestyle payoff shot.** Real footage of the actual location (road signs, landmarks, geographic markers) dramatically elevates authenticity over AI-generated equivalents. User-provided clips or sourced footage should be preferred for the final Beat 5 shot. Trim to 3–4s with ffmpeg; register before assembly.

7. **Playback rate 1.4× applied at assembly, not generation.** Generate all clips at normal speed. Apply 1.4× speed-up during `assemble_video` to hit the 15–17s target from ~22–24s of raw material. This preserves motion quality.

8. **Color palette callback in lifestyle shots.** If the product has a distinctive color, look for real-world elements that echo it in the lifestyle/payoff beat (e.g., a green-and-yellow highway sign echoes a teal-green shirt with gold text). This subliminal color echo deepens the identity connection.