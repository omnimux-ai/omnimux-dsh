# Curated-Lifestyle — Brand Video Style

A complete creative system for producing short-form video content for a curated lifestyle brand aimed at women who choose intentionally. Every video in this system shares a visual language, voice, and emotional register — warm, unhurried, elevated without being aspirational, real without being casual.

---

## 1. When to use this pattern

**Use for:**
- Social-first short-form videos (30–60 s) for Instagram Reels, TikTok, Pinterest
- Brand intro / manifesto clips
- Product vignettes (skincare, pantry, kitchen, home objects, books)
- Editorial essay-style clips ("The Art of…", "Things I'd Skip", "What's on My Nightstand")
- Any content for the brand in this curated-lifestyle register

**Do not use for:**
- High-energy, fast-cut trend content
- Talking-head or face-forward formats
- Content targeting audiences under 30 or seeking hype/novelty framing
- Brands that skew toward maximalist, bold-color, or streetwear aesthetics

---

## 2. Hook & opening

**Structural move: Calm declarative or wry observation.**

The hook is never a question, never a list tease, never "you need to know this." It is a quiet, confident statement — something a discerning woman would say to a friend over coffee. It arrives before any visual flash, and it earns its place by being either true, wry, or gently provocative.

**Hook archetypes:**

| Hook type | Example | Rule |
|---|---|---|
| Quiet invitation | *"There's a kind of person who never reaches for the loudest option."* | Opens with identity, not product |
| Wry observation | *"I own four umbrellas. I lose one every spring."* | Names a universal accumulation absurdity |
| Earned principle | *"Fads fade. A good habit stays."* | Statement of taste that earns a screenshot |
| Tender address | *"For everyone quietly keeping it all together…"* | Direct address with emotional warmth |
| Nightstand/shelf reveal | *"What's actually on my shelf this season."* | Demystifies curation through specificity |

**Swap rule:** The product or subject always changes. The hook structure — its quietness, its confidence, its lack of urgency — stays locked. Never open with a price, a problem, or a countdown.

---

## 3. Narrative arc

### Arc A — Editorial essay (45–60 s)
Used for concept-driven content ("The Art of Editing Your Life"):

1. **Hook statement** (0–5 s) — Single calm line. Voice only or voice + title card.
2. **Tension / recognition** (5–18 s) — Name the thing everyone does but nobody says out loud. Hands shown in context.
3. **Turn / principle** (18–35 s) — The reframe. One sentence that could live as a quote card. *"Fads fade. A good habit stays."* Give this beat its own text overlay and a half-beat of silence before it.
4. **Product/brand moment** (35–50 s) — Hands interacting with real, attainable objects. No gourmet staging.
5. **Soft close / CTA** (50–60 s) — End card + spoken or on-screen CTA.

### Arc B — Vignette / nightstand / real-life reveal (30–40 s)
Used for object-specific or "what I actually use" content:

1. **Hook** (0–5 s) — Declarative title or spoken line naming the specific thing.
2. **Visual tour** (5–25 s) — Hands moving through real objects. Warm light. Lived-in setting.
3. **One editorial line** (25–32 s) — A single wry or warm observation about the objects shown.
4. **CTA** (32–38 s) — Spoken soft sign-off + terracotta pill on screen.

### Arc C — Manifesto / address (30–35 s)
Used for brand intro or emotional address ("For Everyone Quietly Keeping It Together"):

1. **Address line** (0–4 s) — Direct, warm, specific audience call.
2. **Recognition beats** (4–22 s) — List of truths the audience lives, read as if by a peer who sees them.
3. **Permission / gift** (22–30 s) — The brand's promise: not to fix, just to curate, to choose well.
4. **End card** (30–35 s) — Logo only. No CTA text needed; the emotional close is the CTA.

---

## 4. Visual style spec

### Camera grammar
- **Hands-only** for all intimate lifestyle scenes. No faces. This creates universality and intimacy simultaneously.
- Camera is **locked-off or slow push-in** — never handheld shake, never fast zoom.
- **Ken Burns / gentle drift** for static images: slow pan across a surface, slight zoom-in over 6–10 seconds.

### Lighting
- **Warm natural daylight** for kitchen, pantry, desk, shelf scenes (morning to midday feel).
- **Amber evening light** for nightstand, candle, bedside, bath scenes.
- Never studio white. Never overexposed. Always warm-toned.

### Aesthetic: "Real not styled"
- Objects should look **used, chosen, kept** — not arranged for a shoot.
- Coffee rings on a counter: fine. A worn cutting board: good. Four umbrellas crammed by the door: perfect.
- Avoid: pristine marble, perfectly fanned books, glossy aspirational-lifestyle catalog aesthetic.
- Avoid: bland, generic ordinariness. Aim for "discerning person who shops at a good grocery store."
- Ingredients and spaces should be **attainable and real**, not gourmet-staged.

### Shot length distribution
- Average shot: 3–5 seconds
- No cuts under 2 seconds (this is not a fast-cut brand)
- One "hero beat" shot per video: 6–8 seconds, no cut, the camera just watches

### Color palette (hard)
| Role | Color | Hex |
|---|---|---|
| Dark background / text | Espresso | `#2C1A0E` |
| Light background / text | Cream | `#F5EFE6` |
| Accent | Amber | `#8A6A3E` |
| Secondary accent | Gold Sand | `#C9A87A` |
| Neutral background | Linen | `#E8DDD0` |
| Sparingly | Sage | `#5C7A6E` |
| CTAs only | Terracotta | `#BB6B4B` |

Text combos: **Espresso on Cream** OR **Cream on Espresso**. Never mix.

### On-screen text
- **Headlines / hook cards:** Alice (Playfair Display equivalent in renderer), Espresso on Cream background card or Cream on Espresso.
- **Body captions / mid-roll text:** Alice, same rules.
- **Captions:** Montserrat, `caption_style preset="editorial-clean"` or `"quiet-serif"`.
- **CTA pill:** Terracotta background, Cream text, Montserrat.
- No kinetic captions. No bold san-serif impact text. No emoji in captions.

### End card (hard rule)
- Background: **Chestnut Linen** (a warm mid-tone) — NOT deep espresso (too dark for logo visibility).
- Logo: Centered, 720×720 px, positioned at x=540, y=820 in a 1080×1920 frame.
- Brand text: Cream, Montserrat, lower-center.
- Duration: 3–4 seconds.

---

## 5. Voice & persona

### Voice asset
- **TTS voice:** A warm female narrator voice. Use a single consistent voice ID across all content in the brand.
- Must be: clearly female, warm, cultured, elevated — not robotic, not male, not breathless.

### Delivery tags (use these in TTS prompts)
- `[warm, unhurried]` — default for most content
- `[wry, knowing]` — for ironic observations (the accumulation-absurdity hook)
- `[tender, direct]` — for address arcs (the direct-address manifesto)
- `[calm, authoritative]` — for principle statements (the screenshot-worthy reframe line)

### Persona archetype
**Peer-narrator.** Not an expert lecturing. Not an influencer performing. A woman who has already figured some things out and shares them without fuss. She does not hustle, justify, or over-explain. She names a thing, says why it matters to her, moves on.

### Vocabulary rules
- ✅ Use: *pleasure, intention, real, kept, chosen, enough, unhurried, well-made, attainable*
- ❌ Never use: *luxury*, *invest in yourself*, *level up*, *game-changer*, *you deserve it*, *honestly*

### Pacing
- Speak slowly enough that a line can land before the next begins.
- Build in **half-beat pauses** before principle statements — let silence do work.
- Average words per second: ~2.2 (unhurried, not slow).

---

## 6. CTA mechanic

### Primary (most videos)
- **Soft spoken sign-off** + **terracotta pill on screen**.
- Spoken example: *"Find it at the brand — link in bio."*
- On-screen: Terracotta pill, Cream Montserrat text, lower third.
- Never pressured. Never countdown. Never "hurry."

### For manifesto / address arcs
- No spoken CTA. End card alone is sufficient.
- The emotional close IS the brand impression.

### Comment-bait (optional, for editorial essays)
- Final line invites reflection, not action: *"What's the one thing you'd actually keep?"*
- Works as the last spoken line before the end card. No on-screen text for this line — voice only.

---

## 7. Hard rules / do-not-regress

Treat each as an inviolable constraint:

1. **Never use the word "luxury."** Replace with "pleasure," "well-made," or "kept." The brand explicitly distances from aspirational-luxury framing.

2. **Ingredients and spaces must be real and attainable.** If a scene looks gourmet-staged, regenerate it. Real grocery store, not specialty food hall.

3. **The principle / reframe line is screenshot-worthy** — it must receive its own beat with a text overlay and a half-beat of silence before and after. Never bury it in a voiceover run-on.

4. **End card background is Chestnut Linen (a warm mid-tone), not deep espresso.** Deep espresso makes the logo invisible. Lock it.

5. **Logo size in end card: 720×720 px, centered at x=540, y=820** in a 1080×1920 frame. Do not scale down or reposition without explicit direction.

6. **Music default is upbeat acoustic pop.** Use contemplative piano only when the content explicitly demands it (e.g., a slow meditation arc). Avoid pure ambient/drone.

7. **Voice must be clearly female.** If a generation returns a male or robotic voice, regenerate. Keep a single canonical warm female voice ID across the brand.

8. **Drawer / surface images: regenerate if they look dirty or grimy.** "Lived-in" means warm patina, not neglect. The visual register is warmth, not grime.

9. **No faces. Hands only** for all intimate lifestyle scenes. This is a creative choice, not a workaround — protect it.

10. **Several identical objects crammed in one drawer** is the canonical visual for "accumulation absurdity" — reference this image construction for any "things I'd skip" or editing-themed content.