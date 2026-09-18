# Split-Screen Reaction Ad

## 1. When to use this pattern

**Best fit:**
- Apps or products launching paid social on TikTok, Instagram Reels, YouTube Shorts where an escalating on-screen result can be shown
- Campaigns needing rapid A/B testing across gender and ethnicity (2–3 variations in one production run)
- Brands with a third-party review rating they want to surface as social proof

**Poor fit:**
- Formats with no escalating on-screen event for the creator to react to — the bottom half has nothing to anchor it
- Long-form video (30s+) — the pattern is built for 15–20s max impact
- Desktop-first placements — the 9:16 split only reads on mobile

---

## 2. Hook & opening

**Archetype:** Voyeur trigger — viewer is dropped into a live moment already in progress.

**Structural move:** No intro, no title card. Frame 0 is the split already live: creator leaning forward, eyes locked on screen; the on-screen event mid-progress. The viewer feels they've *just tuned in* at a critical moment. Tension is inherited, not built.

**Invented generic example (replace with your own copy):**
> Hook overlay text at 0.2s: `"ONE TAP COULD\nCHANGE YOUR DAY"`

**Swap rule:** Replace the hook copy with a product-specific promise (e.g. `"YOUR BEST RESULT\nSTARTS HERE"`). Never change the *placement* (top of frame above the creator's head, `position_y_ratio: 0.06`) or *style* (punch font, high contrast, 3s duration). The copy is interchangeable; the voyeur-entry mechanic is locked.

---

## 3. Narrative arc

Total runtime: **~17s** (12s main scene + 5s end card)

**Arc name:** tension-witness-explosion-proof

| Beat | Timing | What happens | Tone |
|------|--------|-------------|------|
| Drop-in | 0–2s | Split is live; creator leans forward; on-screen event in opening state; hook overlay appears | Tense, quiet |
| Build | 2–5s | Build cues appear on the app screen; creator's eyebrows raise; VO "this could be it…"; captions pop word-by-word | Rising anticipation |
| Escalation | 5–7s | Increments stack (5×→15×→50×) on screen; creator's mouth opens; VO pace quickens | Controlled excitement |
| Explosion | 7–8s | Peak-reward burst on the app screen; creator stands/gestures; fast zoom punch on face at 7s + frame shake 7–8s; VO peaks | Full euphoria |
| Proof drop | 8–10s | Result counter text overlay appears (clean pill, e.g. a large rounded figure); creator in celebration | Social proof |
| Recovery | 10–12s | Creator laughs, shakes head; VO closes with a warm, relatable exclamation; final caption | Warmth, relatability |
| End card | 12–17s | Dark luxury frame: product logo (hero), third-party review badge, CTA pill, responsible-use disclaimer | Authority, credibility |

---

## 4. Visual style spec

### Split-screen geometry
- Aspect ratio: **9:16 vertical only**
- Gold divider line at exact midpoint (y = 50%)
- **Top half:** creator in a chair — cinematic webcam style, motivated blue-purple LED key light, dark charcoal walls, curved monitor visible behind. Never golden hour, never outdoor, never warm tones.
- **Bottom half:** the app/product screen where the escalating event happens — clean UI, dark background, with whatever symbols/meters/tiles the product uses to show progress. **No real-world third-party branding in the UI.**

### Color palette
- Primary: deep charcoal (`#1a1a2e` range) + electric blue-purple LED accents
- Accent: gold (`#FFD700` range) for divider, overlays, and UI highlights
- End card: dark luxury background + slow gold particle drift

### Camera grammar
- Top half: locked webcam framing with **one motion event** — a fast zoom punch at ~7s into the creator's face, followed by a 1s frame shake. Everything else is static. The single camera move makes the payoff hit harder.
- Bottom half: locked off. The app screen is the entire visual; no camera moves.

### Shot length distribution
- 0–7s: single continuous shot — unbroken witness, no cuts
- 7–8s: zoom punch + shake (in-shot effect, not an edit)
- 8–12s: sustain same shot or cut to reaction close-up
- 12–17s: end card (single static frame with particle overlay)

### On-screen text policy
- **Hook overlay:** punch display font, 72px+, gold or white, position_y_ratio ~0.06 (above creator's head)
- **Mid-scene timed overlays:** gold/orange/white progression, punch font, centered at the gold divider seam (zone: center), upSwipe-in and bounce-in entrances — see `references/overlay-spec.md`
- **Result counter:** punch-font pill with dark background, absolutely positioned near the on-screen result — **always a text overlay, never baked into the app UI**
- **Captions:** promo-punch style, word-by-word, punch font — muted on end card
- **End card overlays:** CTA pill (black text on gold), disclaimer in small clean sans-serif

---

## 5. Voice & persona

### Creator persona archetype
Three-slot roster for parallel A/B production. Rotate freely for new brands; the *type* stays, the specifics are swappable:

| Slot | Ethnicity / Gender | Age | Outfit | Distinctive detail | Chair |
|------|--------------------|-----|--------|--------------------|-------|
| A | South Asian female | late 20s | dark navy jersey | gold nose stud | white chair |
| B | Black male | mid-20s | heather grey hoodie | gold chain | black chair, hexagonal LED panels |
| C | Latina female | late 20s | cream white jersey | voluminous curly hair, gold hoop earrings | charcoal chair |

**Fixed setting for all variations:** blue-purple LED strips, dark charcoal walls, curved monitor behind. Never deviate — the dark gaming-den aesthetic is load-bearing for creator authenticity.

### VO tone & pacing
- **Tone:** peer-witness. Not hype-man. The creator sounds like a friend who genuinely cannot believe what they're seeing — breathless, half-talking to themselves.
- **Pace:** **2.5 words/second** (target ~30 words / 12s). Do not cram more words. Breathlessness comes from pitch and pauses, not speed.
- **Rhythmic signature:** short exclamations (`"Come on…"`) alternating with cascading lists (`"Fifteen times! Fifty! FIVE HUNDRED TIMES!"`) that mirror the increment stack on screen.

**Invented generic VO script (replace copy, keep rhythm):**
> "Okay, this could be it! Come on… it's building… the numbers are STACKING! Fifteen times! Fifty! FIVE HUNDRED TIMES! Oh my GOSH — there it is! That is INCREDIBLE! Let's GO!"

*This same rhythm works unchanged across all character variations.*

---

## 6. CTA mechanic

**Type:** On-screen card (end card) — no VO on end card

1. **CTA pill:** bold button, black text on gold — e.g. `"GET STARTED →"` or brand imperative + arrow. Bounce-in entrance, centered lower-third.
2. **Third-party review badge:** reproduced as a **product reference image** (not text overlay). Must faithfully show the badge. This is social proof, not decoration.
3. **Responsible-use disclaimer:** small grey clean sans-serif at very bottom — e.g. `"Demo-style concept • Individual results vary"` — always present where the product or vertical requires one.
4. **End card audio:** `null` — music from the main scene carries through. No VO on end card.

**CTA copy swap rule:** Replace `"GET STARTED"` with any brand-specific imperative (`"TRY IT FREE"`, `"JOIN NOW"`, `"DOWNLOAD"`). Keep the arrow `→` — it adds urgency. Never remove the disclaimer when one is required.

---

## 7. Hard rules / do-not-regress

Each item below is an inviolable production rule. Treat each as load-bearing guidance.

1. **Never bake the result counter into the app UI.** AI generation garbles numbers. Numeric figures are always a text overlay with a dark background pill, absolutely positioned. The app UI shows only symbols and increment labels — no rendered figures ever.

2. **App UI director brief must explicitly include:** `"NO numeric amounts, NO numeric text anywhere in the UI"`. Omitting this produces hallucinated numbers in the graphic.

3. **Third-party review badge must be passed as a PRODUCT REFERENCE image** to the end card director. Text overlays cannot accurately reproduce a review badge. If the client has not supplied a badge image, ask before proceeding.

4. **End card `audio_url` must be `null`.** Adding VO to the end card creates tonal whiplash. Music from the main scene is sufficient.

5. **Hook overlay `position_y_ratio` must be ~0.06.** Lower placement overlaps the creator's face in the top split. Do not move it down.

6. **Increment sequence must be a readable staircase:** 5× → 15× → 50× → 500× (or equivalent escalating series with ~3–4 visible steps). Do not skip steps — the staircase rhythm is what creates anticipation.

7. **Creator setting is locked: blue-purple LED, dark charcoal, curved monitor.** Never substitute warm tones, natural light, or outdoor settings.

8. **Parallel production is mandatory for multi-variation runs.** Wave 1: all persona setups + end card. Wave 2: all main scenes. Wave 3: all assembles. Sequential production defeats the purpose of variation testing.

---

## References

- See [`references/overlay-spec.md`](references/overlay-spec.md) for exact overlay timing, positioning, and style tables
- See [`references/persona-roster.md`](references/persona-roster.md) for extended persona variation library