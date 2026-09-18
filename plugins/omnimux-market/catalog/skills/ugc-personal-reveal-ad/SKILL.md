# UGC Ad Skill — V3: Creative Governance Edition

This skill generates short-form social ad creative in a warm UGC-creator voice — someone sharing a discovery, not reading a script. V3 adds a full governance layer on top of V1/V2's format library: brand constants are frozen, optimization variables self-improve from performance data, and every creative is versioned, tracked, and rollback-capable.

The frozen values below are placeholders for a single brand's brand-lock. Replace them with the target brand's real values the first time you set up the lock for that brand; thereafter treat them as immutable per the rules in §3.

---

## 1. When to Use This Pattern

**Ideal for:**
- Short-form social (TikTok, Instagram Reels, Facebook Reels)
- Single-brand creative governed by a fixed brand-lock
- Discovery-driven, aspirational consumer offers
- Local or DTC businesses with a discoverable offer

**Not suited for:**
- Luxury/high-fashion editorial (too casual)
- B2B or clinical/medical contexts
- Hard-sell, urgency-driven promotions (conflicts with the UGC tone)
- Brands without a defined brand-lock (the frozen values must be set first)

---

## 2. SESSION START PROTOCOL (Run Every Session)

Before generating anything, execute this silent drift check against Brand Lock v1.0. If all 8 pass, proceed without comment. If any fail, surface the drift warning before touching creative work.

```
DRIFT CHECK v1.0
─────────────────────────────────────────────
1. TYPOGRAPHY    Proposed font = locked caption font? . [ ] PASS [ ] DRIFT
2. CTA COLOR     Proposed pill = locked CTA color? .... [ ] PASS [ ] DRIFT
3. CAPTION       Preset = clean-bold, word-by-word? .. [ ] PASS [ ] DRIFT
4. MUSIC VOL     Volume ≤ locked cap? ................ [ ] PASS [ ] DRIFT
5. TERMINOLOGY   All frozen terms used where applic. . [ ] PASS [ ] DRIFT
6. TONE          WPS 2.0–2.5, UGC conversational? ... [ ] PASS [ ] DRIFT
7. OVERLAY POS   Hook y=0.10, CTA bottom-center? .... [ ] PASS [ ] DRIFT
8. PALETTE       Only approved colors in overlays? ... [ ] PASS [ ] DRIFT
─────────────────────────────────────────────
ANY DRIFT → warn user. Require explicit approval before proceeding.
ALL PASS → proceed silently.
```

**Drift Warning Template:**
> ⚠️ **Drift Warning:** [element] differs from Brand Lock v1.0. Locked value: **[X]**. Proposed value: **[Y]**. Approve the change or revert to the locked value?

Also check memory for performance snapshots and lineage log. If the user has shared new performance data at session start, update version records and registries before generating anything new.

---

## 3. FROZEN LAYER — Brand Lock v1.0

These values are **immutable**. The optimization system cannot touch them. They change ONLY if the user explicitly says: *"Update the brand lock for [specific element]."* The values below are example defaults — set them to the target brand's real values on first setup.

### 3a. Typography System

| Use case | Font | Override allowed? |
|---|---|---|
| All captions | Poppins | NO |
| CTA pills (all formats) | Poppins | NO |
| High-energy TikTok hook overlay | Anton | Only for "punch" preset |
| Luxury/editorial hook overlay | Alice | Only for luxury editorial preset |
| Any other font | — | NEVER without explicit user approval |

**Forbidden fonts** (off-brand — never substitute): Montserrat, DM Sans, Quantico, Pacifico, Luckiest Guy.

### 3b. CTA Pill Styling

```
backgroundColor: rgba(R, G, B, A)   ← locked brand CTA color
color: #FFFFFF
borderRadius: 40px
padding: 12px 32px
fontSize: 58
fontFamily: Poppins
fontWeight: bold
animation: fade-in, duration 0.4s
position: zone bottom-center
```

Seasonal accent tints are ALLOWED only on `hook_overlay` — **never** on the CTA pill.

### 3c. Caption System

```
preset: clean-bold
font_family: Poppins
appear_mode: word
music_volume: 0.12
mute_captions: true   ← final CTA scene only
```

### 3d. Color Palette

Set the palette to the target brand's locked colors. Example structure:

| Name | Value | Use |
|---|---|---|
| Base light | #F5F0E8 | Background, wardrobe |
| Accent | rgba(R,G,B,A) | CTA pill background |
| Text | #FFFFFF | Text on overlays |
| Secondary | #E8DDD0 | Wardrobe, environment |
| Deep accent | #8B6B4A | Accent |

Seasonal overlays may use approved tints (e.g. rose for Valentine's, warm amber for summer) on `hook_overlay` ONLY. Core palette never changes.

### 3e. Music Style Range

- Genre: soft instrumental / light aesthetic / calm ambient — match the brand mood
- No vocals. No EDM, trap, or hard beats.
- BPM range: 70–110
- Volume: **0.12 hard cap — never exceed**
- Reference feel: tasteful, modern lifestyle/social creator audio in the brand's category

### 3f. Brand Terminology (Verbatim)

Use the brand's exact phrases. Do not substitute synonyms without user approval. Populate this table with the target brand's locked terms; the rows below show the structure (correct term vs forbidden substitutions) using neutral examples.

| Correct | Forbidden |
|---|---|
| [locked term for the core service] | [common off-brand synonyms] |
| [locked term for a key feature] | [vague substitutes] |
| [locked positive descriptor] | [off-brand descriptors] |
| [locked enthusiasm word] | [weaker synonyms] |
| [locked outcome phrase] | [near-synonyms] |
| [locked gift/bonus term] | [generic substitutes] |
| [locked offer name] | [generic offer phrasings] |

### 3g. Tone + Pacing

- Voice: warm, conversational, slightly excited — never broadcast or formal
- WPS: **2.0–2.5 words per second** (hard band — both ends enforced)
- Energy: UGC creator sharing a discovery, not a spokesperson reading an ad
- Selfie framing: handheld slight sway, casual angle, not centered/composed
- Never: stiff delivery, salesy urgency language, corporate tone

### 3h. Overlay Structure

- Hook pill: `hook_overlay` style "pill" (or "punch" for TikTok), y=0.10, duration 3.0s
- CTA pill: bottom-center, fade-in 0.4s, appears at 60–70% of scene duration
- Maximum 2 active overlays on screen simultaneously
- Never place overlay text that duplicates the VO (captions handle that)

---

## 4. OPTIMIZATION LAYER — What Can Evolve

The optimization layer biases toward winners from the performance registry. On each generation, check memory for the current winning values per variable and use them as defaults (unless the user specifies otherwise).

| Variable | Optimization allowed | Boundary |
|---|---|---|
| Hook text | Yes — bias toward highest save/CTR rate | Must match tone + pacing rules |
| Hook overlay style | Yes — test pill vs punch vs outlined | Anton only for punch; Poppins for captions always |
| Avatar persona | Yes — bias toward highest engagement avatar | Must use approved avatar presets (see §7) |
| Offer price point | Yes — test multiple price points / VIP tiers | Must use frozen terminology |
| CTA mechanic | Yes — test link-sticker vs comment-to-DM | Direct URL only for retargeting/paid |
| Scene count/structure | Yes — test 3-scene vs 4-scene | Must hit frozen pacing rules |
| B-roll content | Yes — test multiple B-roll concepts | Stays in the brand's visual territory |
| Music track | Yes — generate new tracks | Must stay within frozen music style range |

---

## 5. Hook & Opening

**The Pattern:** Personal revelation hook — first-person past-tense discovery that creates parasocial intimacy. The viewer feels like they're getting a real recommendation, not an ad.

**Invented generic example (baseline pattern):**
> *"I honestly didn't think one cup of this tea would actually help me wind down at night."*

**Structure of the move:**
1. "I [past tense action/expectation]…"
2. "…[surprise outcome or contrast]"
3. Optional: "…with [the product]" (sometimes implicit)

**Swap rule:** Replace the specific service/product outcome with the brand's key result. Keep the past-tense personal revelation structure. Keep the 8–12 word length. Keep the slightly-surprised, slightly-conspiratorial energy.

**Hook Library (living — update from performance registry):** Seed this with hooks for the target brand following the structure above. The rows below are invented, brand-agnostic examples that illustrate the format and signal column.

| ID | Hook text | Style | Signal |
|---|---|---|---|
| H-001 | "I honestly didn't think one cup of this would actually help me wind down." | pill | BASELINE |
| H-002 | "This is your sign to stop ignoring your bedtime routine." | punch | HYPOTHESIS |
| H-003 | "POV: you finally try the thing everyone in your group chat keeps recommending." | pill | HYPOTHESIS |
| H-004 | "I tried it once and now I genuinely can't go back." | pill | HYPOTHESIS |
| H-005 | "The small swap that made my whole evening feel different." | pill | HYPOTHESIS |

---

## 6. Narrative Arc

**Primary arc (30s UGC):** Personal discovery → proof moment → offer reveal → soft CTA

| Beat | Target duration | Voice tone | Visual |
|---|---|---|---|
| Hook (scene 1) | 3–5s | Slightly surprised, conspiratorial | Selfie, handheld sway, hook pill overlay |
| Proof/experience (scene 2) | 8–12s | Warm, descriptive, conversational | B-roll: product in use, close-up, or result reveal |
| Offer reveal (scene 3) | 6–8s | Excited but grounded | Return to selfie or product flat-lay |
| CTA (scene 4) | 3–5s | Soft, inviting | CTA pill fade-in at 60–70% of scene |

**6s Hook Teaser arc:** Hook line → single result visual → CTA pill only. No narration in CTA scene (mute captions on).

**45s Story arc:** Add a "before" beat (scene 1, ~5s) before the hook, and a "social proof" beat (scene 4, ~8s) before the CTA. Total: 5 beats.

---

## 7. Visual Style Spec

**Format:** UGC-style (not cinematic). Authentic handheld feel, not polished production.

**Camera grammar:**
- Selfie scenes: handheld, slight sway, casual 3/4 angle (not dead-center)
- B-roll: closer framings, product/result close-ups, texture reveals, overhead flat-lays
- No locked-off tripod shots (too produced for the brand voice)
- No camera motion faster than a gentle push-in

**Color:** The brand's base light and secondary tones dominate. Accent color on overlays only.

**Shot length distribution:**
- 6s: 1–2 scenes
- 15s: 2–3 scenes (avg 5–7s each)
- 30s: 3–4 scenes (avg 6–9s each)
- 45s: 4–5 scenes (avg 7–10s each)

**On-screen text:**
- Captions: Poppins, clean-bold, word-by-word (always, except muted in final CTA scene)
- Hook overlay: pill style, y=0.10, 3.0s duration
- CTA pill: bottom-center, fade-in 0.4s, appears at 60–70% of scene
- Never more than 2 overlays simultaneously

**Wardrobe signal:** On-brand palette clothing on avatars. Casual everyday outfits aligned to the brand mood (not glam/formal unless the brand calls for it).

---

## 8. Avatar Preset Registry

Approved avatar presets. Bias toward higher-engagement avatars per performance registry. Use diverse persona archetypes that fit the brand's audience; the rows below describe roles/archetypes, not specific real people.

| ID | Avatar archetype | Setting | Wardrobe | Notes |
|---|---|---|---|---|
| AV-001 | Relatable peer, mid-20s | Car interior | On-brand top | BASELINE — strong everyday-relatable resonance |
| AV-002 | Relatable peer, late-20s | Bathroom mirror | Casual tank | Test for broader demographic reach |
| AV-003 | Parent-audience peer, early 30s | Natural light living room | Casual sweater | Family/parent-audience resonance |
| AV-004 | Aspirational lifestyle peer, mid-20s | Outdoor café | Neutral tones | Aspirational lifestyle feel |
| AV-005 | Narrator-only | N/A — B-roll driven | N/A | No face; POV shots + text-driven |
| AV-006 | On-location staff/host | Brand storefront or desk | Brand uniform | For staff/reminder formats |

---

## 9. Voice & Persona

**Persona archetype:** "The peer who just discovered something great" — not an expert, not a spokesperson. They tried something, loved it, and are telling a friend.

**Tone markers:**
- Contractions always (it's, I've, you're — never "it is" or "I have" in VO)
- Filler authenticity words: "honestly," "actually," "genuinely," "lowkey"
- Slightly upward inflection on the hook reveal
- Pause after the hook line (let it land before moving on)
- No hard sell language ("limited time," "act now," "don't miss out" — banned)

**Invented generic phrasing rhythm (illustrative):**
> *"Honestly? I wasn't expecting much. But after a couple of days I genuinely felt the difference, and now it's just part of my routine."*

**WPS enforcement:** At 2.0–2.5 WPS for a 30s ad, target 60–75 words of VO. Count words before finalizing script. Adjust pacing or word count if outside band.

---

## 10. CTA Mechanic

The wordings below are invented, brand-agnostic templates that show the mechanic structure. Swap in the brand's offer name and link, keeping the structure.

**Soft CTA (organic TikTok/Reels default):**
> *"Link below for the first-time offer — there's a little bonus in it too."*
- Spoken softly, not urgent
- Link-sticker or "link in bio" reinforces
- CTA pill on screen: "[Offer name] — [price/benefit]"

**Comment-bait CTA (engagement optimization variant):**
> *"Comment '[keyword]' and I'll send you the link."*
- Use when testing comment-driven DM flows
- No direct URL on screen

**Retargeting/Paid CTA (warm audience only):**
> *"Use code [CODE] at [brand site] for your first order."*
- Direct URL only for retargeting — don't use on cold traffic

**Appointment/Order Reminder CTA:**
> *"Your [appointment/order] is coming up — we can't wait."*
- No offer needed — retention/show-rate focus
- CTA pill: "See You Soon ✨"

---

## 11. Format Presets

| Code | Format | Duration | Primary use |
|---|---|---|---|
| 6H | 6s Hook Teaser | 6s | Top-of-funnel awareness, paid cold traffic |
| 15U | 15s UGC | 15s | TikTok/Reels — mid-funnel |
| 30T | 30s Testimonial | 30s | Primary organic format |
| 45S | 45s Story | 45s | Deep engagement, warm audiences |
| BA | Before/After | 20–30s | Results proof, retargeting |
| RE | Retargeting | 15–20s | Warm audiences only |
| SE | Seasonal | Any | Valentine's, Summer, Holidays |
| UP | Upsell | 15–20s | Post-purchase: add-on or bundle |
| AR | Appointment/Order Reminder | 10–15s | Pre-appointment or pre-delivery |
| RC | AI Receptionist | 30–60s | FAQ / booking objection handling |

---

## 12. Batch Engine

When the user requests a batch, generate in parallel:
1. Lock shared elements (avatar, structure, CTA mechanic)
2. Vary only the optimization-layer variable being tested (hook text, offer price, etc.)
3. Assign a version ID to each variant
4. Present all as CHALLENGER status vs the current ACTIVE BASELINE
5. Ask user to deploy and report back performance for registry update

---

## 13. Creative Versioning System

### Version ID Format
```
[FORMAT_CODE]-[SEQUENCE]-[VARIANT]

Examples:
  6H-001       = 6s Hook, first, no variant
  30T-002-B    = 30s Testimonial, second, variant B
  15U-003-ES   = 15s UGC, third, Spanish
```

Assign a version ID to every creative at generation time. Log to memory.

### Version Record (log to memory after every generation)

```
VERSION RECORD
──────────────────────────────────────────
ID:           [assigned ID]
Date:         [session date]
Format:       [format name]
Parent:       [parent ID or BASELINE]
Branch type:  [ORIGINATOR | REMIX | EXPANSION | VARIANT | SEASONAL | TRANSLATION]
──────────────────────────────────────────
CREATIVE SPEC
Hook:         [hook text verbatim]
Hook style:   [pill | punch | outlined] | y=0.10
Avatar:       [avatar preset ID + description]
Offer:        [offer text verbatim]
CTA:          [mechanic + wording]
Language:     [English | Spanish | etc.]
──────────────────────────────────────────
DELTA FROM PARENT
Changed:      [what changed from parent]
Unchanged:    [what stayed the same]
──────────────────────────────────────────
PERFORMANCE SNAPSHOT
Views:        [pending or value]
Saves:        [pending or value]
Comments:     [pending or value]
Bookings:     [pending or value]
CTR:          [pending or value]
Watch-through:[pending or value]
Recorded:     [date or pending]
──────────────────────────────────────────
STATUS:       [ACTIVE BASELINE | CHALLENGER | WINNER | ARCHIVED | ROLLED BACK | HYPOTHESIS]
```

### Version Statuses
- **ACTIVE BASELINE** — current best performer, default for new generations
- **CHALLENGER** — new version being tested against baseline
- **WINNER** — beat the baseline; becomes new ACTIVE BASELINE (old baseline → ARCHIVED)
- **ARCHIVED** — superseded but preserved for rollback
- **ROLLED BACK** — was promoted but reverted due to underperformance
- **HYPOTHESIS** — generated but not yet deployed/tested

### Branch Types
- **ORIGINATOR** — no parent (first ever)
- **REMIX** — changed ≤2 scenes from parent
- **EXPANSION** — same hook, longer format
- **VARIANT** — different hook/avatar/offer, same structure
- **SEASONAL** — seasonal overlay/hook swap
- **TRANSLATION** — language change only

---

## 14. Performance Snapshots & Bias Pipeline

### When to Take a Snapshot
- User returns with performance data → immediately log to the relevant version record
- Minimum useful snapshot: at least one of (saves, bookings, CTR, watch-through)

### Snapshot Aging
- < 48h post-publish: early signal (0.5x weight)
- 48h–7 days: primary signal (1.0x weight)
- > 7 days: mature signal (1.2x weight)

### Snapshot → Bias Pipeline
```
New snapshot received
→ Update version record in memory
→ Compare to ACTIVE BASELINE snapshot (same format)
→ CHALLENGER beats baseline on primary metric (saves or bookings)?
    YES → Promote CHALLENGER to ACTIVE BASELINE
          Archive previous baseline
          Update hook/avatar/CTA registries
    NO  → Mark ROLLED BACK
          Restore previous ACTIVE BASELINE
          Log losing delta to registry
```

---

## 15. Rollback System

### Rollback Triggers
Recommend rollback automatically when:
1. New CHALLENGER has lower save rate than ACTIVE BASELINE (same format, same audience)
2. Bookings/CTR drop >20% vs baseline in same time window
3. User says "this isn't working" or "go back to the old version"
4. Retroactive drift flag detected on a deployed version

### Rollback Procedure
```
ROLLBACK PROTOCOL
─────────────────────────────────────────────
1. IDENTIFY: which version is underperforming?
   → [VERSION ID] | saves -X% | bookings -Y% vs baseline

2. IDENTIFY rollback target
   → Most recent ACTIVE BASELINE or ARCHIVED version
   → Confirm: "Roll back to [VERSION ID] from [date]? Used: [spec summary]"

3. CONFIRM: user approves

4. EXECUTE: re-assemble from original scene asset IDs
   → If scene assets still registered: assemble_video directly
   → If assets expired: re-render from version record CREATIVE SPEC

5. LOG: mark failed version ROLLED BACK | record failure delta | note what changed

6. UPDATE: rolled-back version returns to ACTIVE BASELINE status
─────────────────────────────────────────────
```

The CREATIVE SPEC in the version record is always sufficient to recreate a creative exactly if assets expire.

---

## 16. Campaign Lineage Tracking

### Lineage Tree (maintain in memory)
```
6H-001 [ACTIVE BASELINE]
├── 6H-002-B  [hook swap variant B] [CHALLENGER/HYPOTHESIS]
├── 6H-003-ES [Spanish version] [HYPOTHESIS]
└── 30T-001   [30s expansion of baseline hook] [HYPOTHESIS]
    ├── 30T-001-B  [hook swap variant B] [HYPOTHESIS]
    └── 30T-001-SE [Valentine's seasonal] [HYPOTHESIS]
```

### Lineage Rules
1. Every creative has exactly one parent (or BASELINE for originators)
2. Performance inherits upward — a WINNER child upgrades the parent branch's signal
3. A ROLLED BACK child does not degrade the parent — isolated failure
4. Log format: `[VERSION ID] | [date] | [branch type] | [parent ID] | [delta] | [status] | [snapshot]`

---

## 17. Full Session Flow — V3

```
SESSION START
│
├─ 1. READ MEMORY: brand lock + performance registries + lineage log
├─ 2. RUN DRIFT CHECK (8 points vs Brand Lock v1.0)
│   └─ Any drift → warn user + get approval before proceeding
├─ 3. CHECK FOR PERFORMANCE DATA from user
│   └─ If provided → update version records + snapshots + registries
├─ 4. ASSIGN VERSION ID to new creative
├─ 5. DECLARE PARENT VERSION + BRANCH TYPE
├─ 6. SELECT defaults from optimization layer (bias toward winners)
├─ 7. PRESENT brief to user for confirmation
├─ 8. GENERATE (parallel where possible)
├─ 9. POST-GENERATION: log version record to memory
└─ 10. ASK: "When this goes live, report back save rate + bookings and I'll update the registry."

SESSION END
└─ SAVE: version record | lineage entry | updated registry rows
```

---

## 18. Hard Rules / Do-Not-Regress

Every item in this section is a hard rule derived from prior corrections. Each must survive across all future sessions.

1. **Font is always Poppins for captions and CTA pills.** No exceptions. Anton only for "punch" hook overlay. Alice only for luxury editorial.
2. **CTA pill color is the locked brand CTA color always.** Seasonal tints go on hook_overlay only — never on CTA pill.
3. **Music volume cap is 0.12.** Never exceed. Ever.
4. **WPS band is 2.0–2.5.** Count words before finalizing script. Adjust if outside band.
5. **Captions are muted on the final CTA scene only.** All other scenes have captions on.
6. **Brand terminology is verbatim.** Use the brand's locked terms, never off-brand synonyms. See full table in §3f.
7. **No salesy urgency language.** "Limited time," "act now," "don't miss out" are banned.
8. **Hook overlay is always y=0.10.** CTA pill is always bottom-center.
9. **Optimization layer cannot touch frozen layer.** Surface a drift warning and get explicit user approval before changing any frozen value.
10. **Version IDs are assigned at generation time, not retroactively.**
11. **Never fabricate performance data.** If a snapshot field is unknown, log as "pending."
12. **Direct URL in CTA is for retargeting/paid audiences only.** Organic content uses link-sticker or comment-to-DM.