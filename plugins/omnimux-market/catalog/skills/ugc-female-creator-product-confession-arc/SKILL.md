# UGC Female Creator — Product Confession Arc

A 57–62 second, 9:16 vertical ad built around a relatable female creator who confesses a personal struggle, discovers a product, and closes with a soft "Link in BIO" CTA. The creative DNA is **peer trust + ingredient credibility + calm conviction**. The product is always swappable; the confession-to-conviction arc is not.

---

## 1. When to Use This Pattern

**Best fit:**
- Supplements, nootropics, adaptogens, skincare, haircare, sleep aids, weight-wellness, gut health
- DTC products targeting women 25–40 on TikTok / Instagram Reels / YouTube Shorts
- Briefs that want "UGC feel", "real person", "organic", or "friend recommendation"
- Products with 3–6 concrete, nameable ingredients or benefits (needed for Scene 3)

**Poor fit:**
- B2B / SaaS products (no personal wellness angle)
- Price-anchored promotions (this arc doesn't lead with price)
- Male-primary audiences where a female presenter reads as off-target
- Products requiring legal disclaimers that interrupt the confessional tone

---

## 2. Hook & Opening — The Confession Move

**Structural move:** *Emotional pain-point confession, zero product.* The creator addresses camera as if texting a friend: she names the problem she was living with, not the product that fixed it. This creates pattern-interrupt — viewers expect a product pitch, get a relatable moment instead.

**Invented generic example** (write a fresh one per product — do not reuse this wording):
> "Okay I need to tell you guys something. My skin had been breaking out for weeks — like, nothing I tried was making a difference…"

**The rule:** Swap the problem to match the new product's core use case. Keep the confessional, friend-group address ("you guys", "I need to tell you", "okay so"). Never open with the product name or brand. No product in frame during Scene 1.

**Hook overlay:** Place a single short text hook (≤ 6 words, bold outlined style) in the lower-third of the frame — approximately `y_ratio: 0.82` — because the creator fills the upper frame in handheld UGC POV. Confirm frame composition with `get_asset` on the Scene 1 start frame before placing the overlay.

---

## 3. Narrative Arc

| Beat | Scene | Target Length | What Happens | Product in Frame? |
|------|-------|--------------|--------------|------------------|
| **Confession** | 1 | 10 s | Pain-point confession, no product, emotional camera address | No — atmospheric only or background |
| **Discovery / Reveal** | 2 | 12 s | Holds product up to lens, names it, one-line personal intro ("I found this…") | Hero / held to camera |
| **Ingredient Breakdown** | 3 | 13 s | Names 3–5 key ingredients or benefits with natural hand gestures; bottle stays in hand | Hero / held |
| **Results Testimony** | 4 | 12 s | Seated, bottle resting on desk or beside her; calm, genuine conviction about what changed | Background prop — not brandished |
| **CTA Close** | 5 | 10 s | Holds bottle label-forward, points to or mentions bio link | Hero / label-forward |

**Total target: 57–60 s.** Do not pad scenes to hit a round number.

**Arc name:** *Confession → Discovery → Evidence → Proof → Invitation*

**Emotional shape:** Low-energy / relatable opening → rising curiosity at reveal → confident, knowledgeable middle → warm, genuine close → soft, friendly CTA. Never spikes to hype. Stays conversational throughout.

---

## 4. Visual Style Spec

| Dimension | Spec |
|-----------|------|
| **Format** | UGC / selfie handheld, NOT cinematic. Slightly imperfect framing is intentional. |
| **Aspect ratio** | 9:16 vertical, 1080 × 1920 |
| **Color palette** | Warm naturals: cream, oatmeal, camel, soft greenery. Avoid hard white studio or saturated brand colors. |
| **Camera grammar** | Handheld, slight natural sway. Close-to-medium framing — creator's face and upper torso fill 60–70 % of frame. |
| **Setting** | Cozy home workspace or living-corner. Natural or warm artificial light. Neutral, uncluttered background. No formal studio. |
| **Shot length** | Long takes per scene (10–13 s each), minimal in-scene cuts — UGC realism requires sustained presence, not MTV editing. |
| **On-screen text** | Word-by-word Poppins captions, clean bold, no shadow, centred — throughout Scenes 1–4. **Mute captions on Scene 5** (CTA pill overlay replaces them). |
| **CTA pill overlay** | Scene 5 only. Short text: "Link in BIO ↓" or "Check the link in my BIO". Pill/badge style, centred. |
| **Hook overlay** | Scene 1 only. Outlined bold text, lower-third (≈ y_ratio 0.82). ≤ 6 words. |
| **Music** | Uplifting wellness instrumental, no vocals, full runtime + 2 s. Volume: **0.08** so voice-over leads unambiguously. |

---

## 5. Voice & Persona

**Tone:** Calm-authoritative with warmth. Peer-to-peer, not influencer-to-follower. Think: your smartest friend who actually researches ingredients.

**Persona archetype:** *The Credible Peer* — late 20s to early 30s, wellness-informed but not preachy, speaks with light excitement rather than hype.

**Visual persona:** Choose presentation that matches brand positioning:
- For premium/clean wellness: East Asian or South Asian features, minimal jewellery, natural makeup, cosy earth-tone wardrobe (oatmeal, camel, sage), glasses optional.
- Adapt ethnicity, wardrobe, and setting to match the target audience of the specific brand.
- Always: approachable, aspirational-but-attainable. Not a model shoot. Not a TV presenter.

**Speech pacing:** 2.3–2.5 words per second across all scenes. Slower for ingredient names (let them land). Slightly faster for hook (urgency).

**Sample phrasing rhythm:**
- Hook: "Okay I have to share something — [pain point] for [timeframe], and I finally figured out why…"
- Reveal: "I've been using [product] for about [period] and honestly, it's been kind of wild."
- Breakdown: "It has [ingredient 1] which does [one-line benefit], [ingredient 2] for [benefit]…"
- Testimony: "The difference I've noticed is [specific, personal, not superlative]."
- CTA: "If you're dealing with [pain point], honestly — check it out. The link is in my BIO."

---

## 6. CTA Mechanic

**Mechanic:** Soft sign-off — friendly recommendation, not a command. Spoken + on-screen pill overlay reinforce simultaneously.

**Spoken CTA (canonical wording):**
> "Check it out. The link is in my BIO."

Variations allowed:
> "Genuinely worth looking into — link's in my bio."
> "I'll drop the link in my bio if you want to check it."

**What to keep locked:** The phrase "link is in my BIO" (or "link in my bio") must appear **spoken** in Scene 5. This is the conversion trigger phrase; do not replace it with "visit the website" or a URL.

**On-screen:** Pill/badge overlay on Scene 5 mirrors the spoken CTA. Captions are muted on Scene 5 to avoid text collision with the pill.

**No comment-bait.** No "tag a friend." No countdown timers. The CTA stays low-pressure.

---

## 7. Hard Rules / Do-Not-Regress

These encode validated decisions for this pattern. Treat each as non-negotiable:

1. **Hook overlay goes in the lower-third (y_ratio ≈ 0.82), never top or middle.** The creator's face occupies the upper frame in UGC selfie framing. Overlaying text there covers her face and kills credibility.

2. **Inspect Scene 1's start frame with `get_asset` before placing the hook overlay.** Confirm the creator is filling the upper portion of frame before committing to y_ratio placement.

3. **Scene 1: no product visible.** The confession lands because it's person-first. Introducing the product before the problem erodes the trust arc.

4. **Scene 4: product is a background prop, not actively held.** The testimony beat reads as more authentic when the creator isn't brandishing the bottle. Let conviction come from face and voice, not the product.

5. **Scene 5: mute_captions: true + pill overlay.** Running word-by-word captions while the CTA pill is on-screen creates visual noise that distracts from the conversion action.

6. **Music volume: 0.08.** VO must lead. Any higher and music competes with speech intelligibility, especially on mobile without headphones.

7. **Speech pacing 2.3–2.5 w/s.** Verify before directing scenes. Pacing outside this range reads as either rushed (loses credibility) or padded (loses attention).

8. **Product role classification per scene must be explicit** (hero/held, background prop, atmospheric, none) before directing. Directors default to "always show product prominently" unless told otherwise — this skill deliberately varies product prominence by scene.

9. **Wardrobe and setting must feel lived-in and home-based.** Avoid anything that reads as a studio, brand shoot, or overly styled flat-lay background.

10. **Do not open with the product name, brand name, or a price.** The hook is always a human problem, not a product pitch.