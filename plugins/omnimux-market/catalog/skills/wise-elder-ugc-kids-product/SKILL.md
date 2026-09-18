# UGC Kids Product Ad Pattern — Wise-Elder Peer Voice

A 30-second vertical (9:16) UGC video ad pattern built around a warm, peer-grandmotherly voice avatar. The creative DNA: **real voice over product-only visuals, stacked benefit pills, kinetic captions, and a dual-surface TikTok Shop CTA.** The subject (product, brand, age range) is always swappable. The structure, persona tone, visual grammar, and CTA mechanic are locked.

---

## 1. When to Use This Pattern

**Best fit:**
- Children's products (toys, arts & crafts, STEM kits, activity sets, games, books)
- Platform: TikTok Shop, TikTok organic, Instagram Reels
- Seller has a real voice recording (even rough) — authenticity is the hook
- Product has at least one verifiable credential: award, age range, educational or screen-free angle
- "No mess / easy setup / kids can do it solo" is a true benefit

**Poor fit:**
- Teen or adult products where a grandmotherly peer voice reads as condescending
- Products that require before/after imagery to communicate value (TikTok Shop prohibits this)
- Products with no verifiable claims — this pattern relies on substantiated social proof

---

## 2. Hook & Opening (Scene 1, 0–5 s)

**Structural move: POV Discovery Interrupt**
A text pill overlaid at the top of frame names the viewer's mental state before they feel it. The VO is addressed *to* the parent, not the child.

**Invented example (neutral hypothetical product — a kids' reusable sticker book):**
- Hook overlay pill: `"POV: you finally found a quiet-time win 📖"`
- Opening VO line (warm peer voice): implied warm discovery — "Okay, I finally found the one…"

**Swap rule:** Replace product category and emoji in the overlay. Keep the POV framing and the "finally found it" relief-arc language. The visual must be the hero product box or the product itself in close-up — no people, no staged hands, no children.

---

## 3. Narrative Arc — Beat List

| Beat | Seconds | Visual | VO Angle | Tone |
|------|---------|--------|----------|------|
| **Discovery Hook** | 0–5 s | Hero product box, slow handheld zoom-in | "POV: you finally found it" relief opener | Warm, conspiratorial whisper-to-peer |
| **Benefit 1 — Mess/Ease** | 5–10 s | Kit contents spread OR infographic | "No glue, no mess" — friction-removal angle | Light and reassuring |
| **Benefit 2 — Results/Delight** | 10–16 s | Completed artwork or finished product shot | "The finished [output] are gorgeous" — pride payoff | Genuine enthusiasm, not hype |
| **Benefit 3 — Independence** | 16–21 s | Product in use (no hands/children visible) | "Kids can do it totally solo" — parent-relief angle | Calm authority |
| **CTA Close** | 21–31 s | Art/product reveal hard-cut to product box | Award credentials + screen-free + dual CTA | Warm sign-off, definitive |

**Arc name:** Problem-Agitation-Product-Proof-CTA compressed into 30 s with a "quiet build → single-line payoff" rhythm. The emotional shape is: *relief → delight → trust → action.*

**VO pacing:** 2.2–2.8 words per second. Slower than standard ad pacing — lets warmth land. Never rush Benefit 2 (delight beat); it earns the CTA.

---

## 4. Visual Style Spec

| Parameter | Value |
|-----------|-------|
| **Aesthetic** | UGC — looks like a real parent filmed this at home |
| **Aspect ratio** | 9:16 vertical, 1080p |
| **Camera grammar** | Handheld with slight natural shake — never stabilized, never smooth dolly |
| **Lighting** | Warm natural window light, soft and lived-in. No ring lights, no professional setups, no bokeh |
| **Background** | Cozy home with craft supplies or home decor visible — authentic clutter OK |
| **Shot length** | Scenes 1–4: 5–6 s each. Scene 5: 10 s (CTA needs breathing room) |
| **Color palette** | Warm neutrals + one accent (purple, pink, or indigo depending on product palette) |
| **People / children in frame** | **NEVER.** Not even hands. Product-only in all scenes. This is a hard compliance rule. |
| **On-screen text** | Kinetic captions (word-by-word appear) + benefit pills per scene + hook overlay at top of frame |

**Caption preset:** `soft-pill`, a soft rounded font (e.g. `Comfortaa`), appear mode `word`. The rounded pill style is part of the warm UGC look — do not swap to a hard-edged sans-serif.

---

## 5. Voice & Persona

**Persona archetype:** Warm peer-grandmotherly authority. Not a hype creator, not a polished spokesperson. Sounds like the most trusted mom in your neighborhood who has tried everything and is sharing a genuine find.

**Tone:** Calm-authoritative with genuine warmth. Slightly conspiratorial ("between us…"), never salesy. Deadpan skepticism at open → genuine delight at benefit 2 → quiet confidence at CTA.

**Pacing:** Deliberate. 2.2–2.8 w/s. Natural breath pauses between lines. No rush.

**Sample phrasing rhythms (invented, swap freely):**
- Hook: `"Okay, I have to tell you about [product]…"`
- Benefit: `"No [friction]. Just [outcome]."`
- Delight: `"And the [result]? Honestly gorgeous."`
- Sign-off: `"This one's the keeper — trust me 💛"`

**Voice priority (hard rule):** Always use the user's real voice recording if one is provided. Split it per scene at natural breath pauses using word-level timestamps. Add 0.2–0.3 s lead-in and 0.3–0.5 s trailing buffer per clip. Never substitute a generated narrator voice when a real recording exists.

**Persona registry IDs (when no user recording):**
- `character_id`: `<persona_id>`
- `voice_asset_id`: `persona:<persona_id>:voice`
- `kling_voice_id`: `<kling_voice_id>`
- `elevenlabs_voice_id`: `<elevenlabs_voice_id>`

---

## 6. CTA Mechanic

**Pattern: Dual-Surface Close**
Two simultaneous on-screen cards appear at +5.5 s into the CTA scene, after a hard cut to the product box. Spoken VO and on-screen cards reinforce each other.

**Surface 1 — Purchase action (bottom-center):**
- Copy: `"🛒 Shop Now — Tap the Basket!"`
- Style: Bold, warm orange pill (`rgba(234,88,12,0.92)`), rounded soft font bold 56px, `borderRadius 40px`

**Surface 2 — Discovery/follow (lower-center, slightly above surface 1):**
- Copy: `"[Product Name]\nLink in Bio ✨"`
- Style: White background `rgba(255,255,255,0.92)`, deep purple text `#3B0764`, rounded soft font 44px

**Captions in CTA scene:** Mute captions (`mute_captions: true`) — the on-screen cards are the only text. Do not stack captions with cards.

**Hard rule:** Always include both "Tap the Basket" (TikTok Shop basket icon CTA) AND "Link in Bio." Never use "Link in Bio" alone — it is non-compliant for TikTok Shop products.

---

## 7. TikTok Caption Pattern

After the video, generate an optimized TikTok caption matching this structure:

```
POV: you open a [product category]… and [unexpected benefit/reaction]

🏆 [Award or credential]
🎨 [Key feature benefit]
✅ [Age range + use case]
🌟 [Independence/ease/screen-free angle]

This one's the keeper — trust me 💛

👇 Grab it on [platform] — link in bio!

#[BrandHashtag1] #[BrandHashtag2] #[BrandHashtag3]
#[ProductNiche1] #[ProductNiche2] #[ProductNiche3] #[ProductNiche4]
#[ProductNiche5] #[ProductNiche6] #[ProductNiche7] #[ProductNiche8]
#KidsActivities #MomLife #TikTokMadeMeBuyIt #GiftIdeasForKids
#ScreenFreeKids #KidsToys #AmazonFinds #ToysForKids #ParentingTips
```

**Rules:**
- Total hashtags: 20 (3 branded + 8 product-specific niche + 9 broad reach)
- `#TikTokMadeMeBuyIt` is mandatory
- No superlatives without verification (no "best", "greatest" unless backed by an award name)
- No before/after language

---

## 8. Hard Rules / Do-Not-Regress

These are non-negotiable constraints for this pattern:

1. **No children in frame — ever.** Not stock images of children, not brand lifestyle shots of children, not user-supplied images that include a child. Any such image must be identified during asset inspection and excluded from all director calls. Replace with product-only imagery: box shots, completed artwork, kit contents, infographics.

2. **User's real voice is always preferred.** When the user has uploaded a voice recording, use it in every scene. Do not fall back to generated persona voice unless the user explicitly agrees. Split audio at word-timestamp boundaries; do not guess line cuts.

3. **Inspect all input images before dispatching to director.** Classify each image (hero, lifestyle, infographic, UGC photo, brand card) and flag child-containing images before any director call is made. This cannot be deferred.

4. **TikTok Shop CTA requires both surfaces.** "Tap the Basket" + "Link in Bio" must always appear together in the CTA scene. Neither is optional.

5. **No unverified superlatives.** Only use award names, age ranges, and developmental claims that were explicitly present in the product listing or provided by the user.

6. **No before/after imagery.** TikTok Shop compliance prohibits before/after visual comparisons. Do not construct scenes that imply transformation through side-by-side or sequential comparison shots.

7. **Voice consistency across all scenes.** All five scenes must use the same voice source (either all from user recording splits, or all from persona voice). Mixed sources cause jarring transitions and must be corrected before final delivery.

8. **Music volume cap at 0.12.** Background music must not compete with VO. `music_volume: 0.12` is the locked value for this pattern.

9. **Caption style is locked.** `soft-pill` preset, soft rounded font, `word` appear mode. Do not substitute a hard-edged font or caption style — it breaks the warm UGC look.

10. **CTA scene captions muted.** Set `mute_captions: true` for the CTA scene. On-screen cards are the only text in that scene.