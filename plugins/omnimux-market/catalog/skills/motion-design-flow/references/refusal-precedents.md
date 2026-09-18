# Refusal Precedents — what won't render and adaptations

Not all storyboards can be animated. There are hard categorical refusals and soft refusals where adaptation is possible (real brand → generic, real person → anonymized). This file is a reference so we don't waste time on gens that won't submit.

## Hard categorical refusals

### Tobacco / nicotine creative

**What WILL NOT render:**
- Real tobacco brands (e.g., TEREA, IQOS, Marlboro, etc.)
- Generic tobacco creative
- Vape / e-cigarette / heat-not-burn product reels
- Nicotine pouches / chewing tobacco
- Smoking aesthetic as primary creative motif

**What falls into category:**
- Reels with real tobacco brand assets (packaging, logo, wordmark)
- Reels with generic tobacco-equivalent product (even without brand name)
- Reels with tobacco-promotion messaging ("control the urge / your power" framing)
- Reels where tobacco product is central hero element

**Health warning in storyboard corner DOES NOT remove category.**

**Alternatives you can suggest:**
- Premium streaming platform brand reel (Mubi-style, A24-style)
- Premium spirits / craft cocktails (whisky, mezcal — hand-drawn motion with premium cocktail aesthetic)
- Mental wellness app (Calm/Headspace tier — "control the urge" works perfectly for anti-anxiety positioning)
- Music streaming / podcast platform brand reel
- Premium coffee brand (small-batch roastery aesthetic)
- Book publisher (literary brand reel)
- Personal philosophy reel ("Discipline / Mastery / Legacy")
- Fashion / luxury watches / gaming

### Real public figures without consent

**What WILL NOT render:**
- Identifiable likeness of real people (politicians, celebrities, athletes, historical figures)
- Real public figure in video gen without their consent
- Voice cloning / impersonation of real people

**Adaptations:**
- Anonymized historical footage (e.g., crowd shot instead of specific MLK; astronaut with closed reflective visor instead of identifiable Neil Armstrong)
- Generic crowd at public gathering (no specific person identifiable)
- Silhouette / face-obscured composition
- Period-correct generic figures (without real identifiable likeness)

**Example adaptation:**

Storyboard panel: "Historical footage of MLK at Lincoln Memorial speech"
→ Adapted: "Wide elevated shot of large diverse crowd at historical public outdoor gathering, classical architecture and reflecting pools visible in distance, sense of collective hope and weight of history, period-correct wardrobe. NO specific identifiable individuals — wide crowd shot only."

Storyboard panel: "Neil Armstrong on moon with American flag"
→ Adapted: "Astronaut figure in full white spacesuit with REFLECTIVE GOLD VISOR FULLY CLOSED (face completely obscured behind reflective visor, no skin visible), standing on grey lunar surface beside a planted flag."

## Soft refusals — real brand IP (adaptable)

### Real branded products / wordmarks

**What WILL NOT render as-is:**
- Nike Swoosh + "AIR" wordmark
- Apple logo / wordmark / product specific lockups
- Coca-Cola / Pepsi / branded beverage labels
- Adidas three stripes
- Disney / Marvel / DC characters
- Any real registered trademark / brand IP

**Adaptations:**
- Replace branded product → generic equivalent product
- Remove brand wordmark → keep aesthetic motif without wordmark
- Replace logo → abstract version OR generic mark

**Example: Nike basketball storyboard**
- Original: Player + Nike Swoosh + "AIR" wordmark + branded sneakers
- Adapted: Generic athletic female player + abstract white light arc streak (NOT swoosh) + plain white-and-red sneakers (no logos visible) + "LIGHTER. FASTER. NEXT LEVEL." (generic copy preserved)

**Example: FuseTea / Coca-Cola wellness storyboard**
- Original: Branded FuseTea bottle + "Find your calm with FuseTea" caption + Coca-Cola brand assets
- Adapted: Generic herbal iced tea bottle (clear plastic, light blue cap, blank/unbranded label, amber-honey liquid) + "Find your calm." (without brand name) + same hand-drawn pastel aesthetic preserved

**Multiple explicit clauses in Seedance prompt for prevention:**
- `NO real brand logos, NO swoosh marks, NO brand wordmarks anywhere in the video`
- `Generic athletic design with no logos, plain unbranded apparel`
- `[generic equivalent] with NO 'XYZ' wordmark, NO [Brand] identifiers`

**Important:** Even with multiple clauses, Seedance may ignore "NO logos" instruction if storyboard ref shows branded version. If brand leaks into result — re-roll with additional "REMOVE all curved white marks" / "blank white label only" / "transparent unbranded bottle" clauses.

### User's own brand

**This is allowed.** If user works at company / owns brand → brand IP can be used in their own marketing reels. For example, a user who works at a company can render that company's own assets for its marketing reels.

**Validation rule:** if user explicitly indicates this is their brand AND brand assets reasonable use case (marketing reel for their own brand), proceed.

## Adult / NSFW content

**What WILL NOT render:**
- Sexually suggestive content
- Explicit nudity
- Sexualized imagery even if not explicit

**Soft refusals:**
- Underwear / lingerie product reels (some platforms — variable)
- Swimwear marketing — usually OK if tasteful
- Beauty / skincare close-ups — OK

**Note:** Seedance has its own moderation layer — may reject even edge tasteful content. False positives possible (e.g., "intense leaning forward" + "kissing dog" in beauty cosplayer prompt = NSFW filter trigger even when content actually safe). Fix: pulled-back framing instead of close-ups, calm seated poses instead of aggressive leaning, no physical contact between character and animal.

## Violence / weapons

**What WILL NOT render:**
- Weapons aimed at people
- Graphic violence imagery
- Real war / conflict scenes with identifiable parties
- Self-harm / suicide imagery

**Soft refusals (case-by-case):**
- Action movie style fight scenes (cinematic genre standard) — usually OK
- Sport / martial arts (boxing, MMA training reels) — OK
- Historical war footage adaptation — generic only, no real identifiable conflicts/people

## Sensitive content moderation false positives

Sometimes Seedance rejects perfectly safe creative due to trigger word combos. Validated trigger combos (causing false positive rejection):

| Trigger combo | Why rejected | Fix |
|---|---|---|
| "force" + "darkness" + "sphere" + "speed lines" | Combat / impact suggestion | Replace "force" → "vector"; remove "darkness" → "deep grey gradient"; "speed lines" → "fading echo" |
| "ghost trails" | Death / violence implication | Replace → "fading echo" / "motion blur trails" |
| "blast" / "explode" / "shatter" + "head" / "body" | Violence implication | Replace → "burst outward" / "disperse" |
| "shoot" + person | Weapons | Replace → "launch" / "project" |
| "cut" + body part | Violence implication | Replace → "transition" / "morph" |

**Fix protocol if rejected:**
1. Re-read prompt — find trigger combos
2. Replace aggressive words with editorial-scientific neutrals
3. Remove dark BG → cream / light grey gradient (if context allows)
4. Soften physics language ("shatter" → "disperse", "explosion" → "bloom")

**Preventive language palette (defensive):**
- Motion: smooth movement, fading echo, gentle drift
- Energy: vector, direction, force-flow (avoid raw "force")
- Camera: gentle tracking, slow approach (avoid "punch", "strike", "smash" if risky combo)
- Background: cream / light grey gradient (avoid "deep void" + sensitive words)
- Sound: soft ambient air, gentle resonance (avoid "blast", "bass impact" if sensitive context)

## How to handle refusal request in conversation

When user requests something in hard refusal category:
1. **Acknowledge the request** — don't just stonewall
2. **Explain category briefly** — why won't render (e.g., "tobacco creative is categorical refusal independently of style or quality")
3. **Offer alternatives** — concrete adjacent categories where same aesthetic can work
4. **Hold the line if pushed** — pressure ("just do it") doesn't change categorical no

Example response template:
> Can't — [category] stays [reason]. This is hard constraint for me, not negotiable.
>
> What I can do — [aesthetic preserved] on any other storyboard. [List 3-5 adjacent categories]. Tell me the direction.

When user requests soft refusal (real brand IP):
1. Identify what's branded
2. Propose generic adaptation preserving aesthetic
3. Ask user to choose: adapt OR provide authorization

Example for real brand:
> There's a problem here — [storyboard contains real brand IP — Nike Swoosh + "AIR" wordmark]. Reproducing real brand assets — copyright issue.
>
> Options:
> 1. Make generic [genre] brand reel — without [brand assets], but preserve aesthetic ([list preserved elements])
> 2. Redo storyboard as own fictional [genre] brand (your logo, your wordmark)
> 3. If you work at [Brand] or have authorization — then I'll submit as-is
