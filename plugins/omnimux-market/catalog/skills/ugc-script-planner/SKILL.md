# UGC Script Planner

A creative pattern for **talking-head UGC ads** that open with a pattern-interrupt hook, walk through a compact problem→reframe→discovery→proof arc, and close with a first-person lifestyle sign-off. Optimised for TikTok, Reels, and YouTube Shorts (15–60 s). The product and brand are always swappable; the structure, voice, pacing, and captions spec are locked.

---

## 1 · When to use this pattern

**Use it for:**
- DTC wellness, supplements, beauty, personal care, food/bev, apparel
- Any product where the mechanism ("works from within", "stays on longer", "no more X") is the hero
- Audiences 18–40 who trust peer recommendations over polished advertising
- Platforms that reward native-looking, fast-paced creative (TikTok, Reels, YT Shorts)

**Don't use it for:**
- B2B / enterprise SaaS where peer-UGC is off-brand
- Luxury goods that require aspirational cinematic treatment
- Products with legally restricted claims that can't be voiced first-person

---

## 2 · Hook & opening — the pattern-interrupt move

**Structural move:** creator addresses camera mid-thought, stating something the audience believes is unsaid or taboo. No intro, no name, no "hey guys". The first word is the hook.

**Invented generic example:**
> *"Okay, I have to be honest about something I never see anyone mention."*

**Rule:** Swap the subject (product category / problem domain), keep the confessional urgency. The hook must:
- Be 5–8 words maximum before the comma/pause
- Feel like the creator is breaking a social norm by speaking up
- Land in the first 1.5 s of the video

**Hook library (adapt to new product):**

| Hook archetype | Template |
|---|---|
| Nobody-talks-about-this | "Nobody talks about this, but it changed everything for me." |
| POV-relatable-problem | "If you've ever [problem], this is for you." |
| Stat-shock | "[X%] of people still do [bad thing] — here's what changed everything for me." |
| Before/after reframe | "I thought [common belief]. Turns out I was completely wrong." |
| Conspiracy-of-silence | "They don't advertise this because it actually works." |

---

## 3 · Narrative arc — 8-beat UGC framework

**Arc name:** Problem → Reframe → Discovery → Authority → Mechanism → Proof → Sign-off

Beat-by-beat shape (full 60 s version; see collapse rules below for shorter cuts):

| Beat # | Name | Intent | Tone |
|---|---|---|---|
| 1 | Hook | Pattern interrupt — stop the scroll | Direct, conspiratorial |
| 2 | Problem | Relatable pain — "I feel seen" | Empathetic, matter-of-fact |
| 3 | Reframe | Reframe the cause — curiosity spike | Calm, slightly revelatory |
| 4 | Discovery | Found the solution — "What did you find?" | Excited but grounded |
| 5 | Authority | Why this brand/product — trust building | Confident, not salesy |
| 6 | Mechanism | How it works — rational buy-in | Clear, simple |
| 7 | Lifestyle proof | Living proof — aspiration | Warm, peer-to-peer |
| 8 | Sign-off | CTA + repurchase signal — close | Casual, memorable |

**Beat-window calculation by duration:**

| Duration | Beats included | Collapse rule |
|---|---|---|
| 15 s | 3 | Hook (5 s) · Problem+Reframe (5 s) · Discovery+Sign-off (5 s) |
| 20 s | 4 | Hook · Problem · Discovery · Sign-off |
| 30 s | 6 | Drop beats 5 (Authority) and 7 (Lifestyle proof) |
| 45 s | 7 | Drop beat 7 or compress beats 6+7 |
| 60 s | 8 | All beats |

**Adapt beat content to product:** replace any placeholder pain point, mechanism, and lifestyle context with the new product's. Keep the structural shape identical.

---

## 4 · Visual style spec

| Dimension | Spec |
|---|---|
| Format | Creator talking to camera (A-roll) intercut with lifestyle/product B-roll |
| Aesthetic | UGC / creator-native — NOT polished commercial. Slight warmth, natural light |
| Color palette | Warm neutrals, skin tones, soft backgrounds. Avoid pure white or clinical blue |
| Camera grammar | Handheld or phone-stabilised. Slight drift OK. No crane or dolly. |
| Shot length | Avg 2.23 s/shot · Fastest cut 1.0 s · Slowest anchor ~4 s |
| On-screen text | Word-by-word captions only. No lower-thirds. No title cards except optional hook overlay first 2 s |
| Caption style | Heavy condensed sans-serif · White fill + thick black outline · center-screen · preset = "zoom-punch" · appear_mode = "word" |
| B-roll triggers | Insert 1–2 B-roll cutaways per beat with product interaction or lifestyle moment |

---

## 5 · Voice & persona

**Persona archetype:** relatable wellness/lifestyle peer — late 20s/early 30s, speaks from personal experience, not expertise. Not an influencer, not a doctor. Just "someone who found this."

**Tone:** conversational, first-person, slightly conspiratorial. Calm authority — not hype, not ASMR-quiet.

**Pacing:** ~2.5 words/second natural speech. No fast-talk. Pauses after the hook and after the mechanism beat.

**Recurring rhythm pattern:**
- Short declarative hook sentence
- Long empathetic problem sentence with a list of three or four everyday items the audience already uses
- Pivot word: *"Not [bad thing], just [real cause]"*
- Discovery: *"Started looking into [domain]… found [product type]"*
- Sign-off: two beats — *"[product] keeps [habit]"* + *"[quality bar] is [fun adjective], [deeper quality] is elite"*

**Adapt:** replace placeholder vocabulary with the new product domain. Keep the two-beat sign-off rhythm.

**Creator look default:** late 20s–early 30s, gender-appropriate for target audience, warm/approachable, wellness-adjacent wardrobe (not gym-bro, not clinical). Override with `creator_look` input if provided.

---

## 6 · CTA mechanic

| Context | CTA type | Example wording |
|---|---|---|
| Lifestyle/wellness, soft sell | Soft sign-off | *"[Product] keeps me [benefit]. [Quality bar] is [fun adj], feeling [benefit] is elite."* |
| High-ticket / considered purchase | Comment-to-DM | *"Drop '[KEYWORD]' in the comments and I'll send you the link."* |
| DTC / direct conversion | Link-sticker | *"Link in bio — first order ships free."* |
| Sale / promo | Promo-anchored | *"Use [CODE] at checkout — it's in my bio."* |

**Default** (no `cta_mechanic` input): use Soft sign-off for wellness/lifestyle; comment-to-DM for products over $40; link-sticker for all DTC with a direct URL.

---

## 7 · Hard rules / do-not-regress

These are confirmed, locked choices for this pattern. Treat as non-negotiable:

1. **VO rate = 2.5 w/s.** Word count targets for each scene must be calculated as `scene_duration × 2.5`. Floor = `total_duration × 1.5` words. Never pad to hit word count — cut duration instead.
2. **Shot rate = 2.23 s/shot average.** Total shots = `ceil(total_duration / 2.23)`. Fastest cut = 1.0 s. Never use shots shorter than 1.0 s.
3. **Caption preset = "zoom-punch", appear_mode = "word".** Do not switch to line-by-line captions or static subtitles.
4. **No polished commercial aesthetic.** If a scene description sounds like a TV spot, rewrite it as creator-native.
5. **Hook is the first line — no greeting, no intro.** "Hey guys", "what's up", or any channel-style opener is forbidden.
6. **Product name is always a placeholder until confirmed.** Use `[PRODUCT NAME]` in templates; never invent a brand name.
7. **Beat collapse order is fixed:** drop beat 5 (Authority) first, then beat 7 (Lifestyle proof), then compress beats 3+4 — in that exact order. Never drop the hook or sign-off.
8. **Duration must be 15–60 s.** Error and stop if input is outside this range.
9. **Output ends with:** *"Plan ready — reply CONFIRM to proceed to production, or adjust any section."*

---

## 8 · Output format — all 9 sections

When this skill runs, produce ALL of the following sections in order. Do not skip any section.

### Section 1 · Source ref breakdown

| Spec | Value |
|---|---|
| Duration | {duration}s |
| Total shots | ceil(duration / 2.23) |
| Avg shot length | 2.23s |
| Fastest cut | 1.0s |
| Audio | Conversational creator VO + upbeat light pop/hip-hop bed |
| Captions | Word-by-word, single-word, center-screen, large bold |
| Format | Creator → camera (A-roll) + lifestyle/product B-roll |
| CTA | {derived from duration + tone + cta_mechanic input} |

### Section 2 · Narrative beat map

Table with columns: Beat # · Beat Name · Time window · Speech summary · Visual note.
Adapt beat content to the product. Apply collapse rules from Section 3 above.

### Section 3 · Casting & locations

- Single creator persona description (adapt default archetype or use `creator_look` input)
- 3–5 location anchors appropriate to product category (default: kitchen, bathroom, gym, car, desk — adapt to product)

### Section 4 · Product section

- If no brand asset provided: *"No product image provided — generate `product:placeholder` via generate_image before director dispatch."*
- Brief visual description of what the product should look like on screen

### Section 5 · Scene plan table

| Scene | Dur | Cuts | Speech summary | VO words (target) |
|---|---|---|---|---|

- One row per beat (or merged beats for short durations)
- Multi-cut scenes indicate B-roll cutaway count
- VO words = scene_dur × 2.5 (floor = scene_dur × 1.5)
- Duration column must sum to ±10% of user-specified duration

### Section 6 · VO script

Full verbatim script. First-person creator voice. ~2.5 w/s. Use `[PRODUCT NAME]` as placeholder. Adapt all claims from `key_claim` input.

### Section 7 · Captions, music, CTA

```
Captions:  preset=zoom-punch · appear_mode=word · font=heavy-condensed-sans · color=white · outline=thick-black · position=center
Music:     upbeat light pop/hip-hop bed · no vocals · female-friendly · duration={duration}s
CTA:       {derived CTA with exact wording}
```

### Section 8 · Production pipeline

Steps (describe what happens, no tool syntax):
1. Persona setup → creator character brief
2. Product placeholder image generation
3. Music generation (parallel with step 2)
4. Per-scene director calls with Visual Description Lock
5. Final assembly with caption_style, hook_overlay, music track

### Section 9 · Open questions

Always include:
- Real brand asset vs. generated placeholder?
- Creator look preferences (override default)?
- Duration compression options if brief is tight?
- CTA mechanic preference?
- Any hard "do not say" phrases or claim restrictions?

---

## Inputs

| Input | Required | Notes |
|---|---|---|
| `product_name` | ✅ | Used as `[PRODUCT NAME]` placeholder anchor |
| `product_description` | ✅ | ≤200 words |
| `key_claim` | ✅ | Core benefit/mechanism, e.g. "supports steady energy" |
| `target_audience` | ✅ | Drives persona, tone, location choices |
| `duration` | ✅ | Integer seconds, 15–60. Error if outside range. |
| `brand_tone` | optional | e.g. "confident wellness", "playful DTC", "clinical authority" |
| `cta_mechanic` | optional | soft-sign-off / comment-to-DM / link-sticker / promo-anchored |
| `creator_look` | optional | Overrides default late-20s wellness UGC archetype |

**Validation:** If `duration` < 15 or > 60, respond: *"Duration must be between 15 and 60 seconds. Please provide a valid duration."* and stop.