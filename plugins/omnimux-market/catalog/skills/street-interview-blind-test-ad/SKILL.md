# ads-street-interview-skill

## 1. When to use this pattern

**Ideal for:**
- Products that solve an everyday habit people already have (a skincare step, snacking, hydration, supplements, a daily routine)
- Beauty, wellness, food/beverage, personal care
- TikTok and Instagram Reels, 9:16, 25–30 s
- Brands that want to feel discovered rather than advertised
- Audiences 18–40, urban, trend-aware but skeptical of polished ads

**Do NOT use for:**
- B2B / SaaS / high-consideration purchases (the blind-test premise won't land)
- Products that require long explanation before a stranger can react
- Luxury brands where street-level UGC aesthetic undercuts brand equity
- Anything requiring legal disclaimers that break the casual flow

---

## 2. Hook & opening — the "Blind-Test Question" move

**Archetype:** Blind-test social proof. The host asks a neutral-sounding question about an existing behavior — not about the product — so strangers answer honestly before the brand exists in their minds.

**Generic example (for a neutral hypothetical reusable water bottle):**
> "How much water do you actually drink in a day?"

**Structural move:** The question sounds like a survey, not an ad. It anchors the stranger's answer to their current (imperfect) habit. When the product is revealed two beats later, it slots into the gap they just described.

**Swap rule:** Replace the habit category and daily-use context; keep the open-ended neutral phrasing. The question must be answerable by any stranger in under 5 words. It must NOT name the product, category brand, or any benefit.

**Opening frame (0–0.5 s):** Location-wide shot, handheld, no dialogue — establishes "real street" before the host enters frame.

---

## 3. Narrative arc

| Beat | Duration | Name | What happens |
|------|----------|------|--------------|
| 1 | 0.5 s | Cold open | Location wide shot, ambient city sound, no dialogue |
| 2 | 3–7 s | Host intro | Host on-camera, holds product (not foregrounded), teases the hook question; warm-curious tone |
| 3 | 2.5–5 s each | Body stranger(s) | Host off-camera VO asks the Hook Question; stranger answers — pure habit confession, no product |
| 4 | 2.5–4 s | Final stranger Q | Same hook question to final stranger; they answer |
| 5 | 5–10 s | Reveal | Host VO delivers follow-up naming the product for the first time; final stranger reacts (frustration → delight arc) |
| 6 | 3–5 s | Host CTA | Host back on-camera, holds product, delivers brand benefit line + CTA |
| 7 | 1.5 s | Sign-off | Location pullback or freeze; hook overlay lingers |

**Arc name:** *Blind-Test → Earned Reveal → Validated CTA*

The emotional shape is: curiosity (what will they say?) → recognition (I do that too) → surprise (wait, that exists?) → trust (even a stranger is convinced).

---

## 4. Visual style spec

| Dimension | Spec |
|-----------|------|
| Format | UGC aesthetic — iPhone rear camera look |
| Lighting | Natural overcast / diffuse daylight. No artificial fill. |
| Focus | Deep focus. **No bokeh.** Full depth so background street reads as real. |
| Stabilisation | Handheld micro-shake. Not shaky — just alive. |
| Color grade | Neutral to slightly warm. No heavy LUT. |
| Shot framing | One person per frame at all times. Host and stranger NEVER share a shot. |
| Host in interview scenes | Off-screen voice only + mic hand entering from frame edge. Never full-frame with stranger. |
| Mic | **Plain matte silver handheld stick. Absolutely NO logo, NO wordmark, NO foam flag, NO brand color on mic.** Mic enters from frame-left for stranger 1, frame-right for stranger 2. |
| On-screen text | `clean-bold` preset, DM Sans font, word-appear mode, accent-color chyron lower-left for location/name IDs, accent-color pill overlays for brand reveal and CTA |
| Shot length | Beat 1: 0.5 s locked-off; interview beats: 2.5–10 s; CTA: 3–5 s |
| Output size | 1080 × 1920 (9:16) |

---

## 5. Voice & persona

**Host:**
- Archetype: warm curious peer (not influencer, not expert)
- Tone: upbeat, slightly conspiratorial ("let me try something")
- Wardrobe: urban casual — no brand merch, no uniforms
- On-camera for intro + CTA only; voice-only for interview beats
- Phrasing rhythm: short declarative sentence + pause + hook. "I've been asking people one question. Here's what they said."

**Body strangers (1–2):**
- Mid-errand look (iced coffee, tote bag, headphones around neck)
- Genuine brief answer — one sentence habit description
- No performance, no enthusiasm

**Final stranger:**
- Must have expressive face — the frustration-to-delight arc reads on face not words
- Slightly longer beat; they carry the emotional payoff of the whole ad
- Line rhythm: short reaction shot → "wait, really?" energy → genuine curiosity about product

**Character diversity hard rule:** No two personas may share more than 1 of: age band, ethnicity, hair color.

**Music:** Upbeat light indie-documentary, instrumental, breezy/curious, no lyrics, 25–30 s. Music volume 0.12 (bed, not prominent).

---

## 6. CTA mechanic

**Type:** Soft host sign-off with on-screen link cue.
- Host holds product (close-up angle), delivers single benefit line.
- "Link in Bio ↓" accent-color pill, bottom-center, upSwipe-in animation.
- Spoken CTA: soft close — no hard sell. Example pattern: "[Product name] — [one-line benefit]. Link in bio."
- Captions muted in Scene 4 so the CTA text overlay is the only text on screen.

---

## 7. Assembly overlay spec

| Overlay | Style | Position | Timing |
|---------|-------|----------|--------|
| Hook overlay | `outlined`, accent color | top, position_y_ratio 0.12 | Full video |
| Hook overlay text pattern | "We Asked Strangers [Hook Question summary] 👀" | — | — |
| Location chyron (Scene 1) | Accent-color lower-left | lower-left | start 0.2 s, duration 2.5 s |
| Stranger name/age chyron | Accent-color lower-left | lower-left | start 0.3 s, duration full scene |
| Brand reveal pill (Scene 3) | Bounce-in accent-color pill | center/lower | start ~5.5 s into scene |
| CTA pill | "Link in Bio ↓", accent color, upSwipe-in | bottom-center | Scene 4 |

Accent color: set the overlay accent (chyrons, pills, hook outline) to the brand's own accent color. Use a single consistent RGBA value at ~0.88–0.92 alpha across all overlays.

---

## 8. Pacing gate (hard rules)

- **Target:** 2.5 words/second across both speakers per scene.
- **Floor:** 1.5 w/s. **Ceiling:** 3.0 w/s.
- For mixed-speech scenes: `total_words_both_speakers / scene_duration_seconds ≤ 3.0`
- **Calculate before dispatch. Do not guess.**
- If pacing fails: extend scene duration first (safest). Trim dialogue second.

---

## 9. Voice credentials (hard rule for mixed-speech scenes)

Every dialogue line must carry:
```
[persona:CHARACTER_ID, role, voice_asset_id: persona:CHARACTER_ID:voice, kling_voice_id: XXXXXX]: "line"
```
- **Both** the on-camera stranger AND the off-camera host VO need `voice_asset_id` + `kling_voice_id`.
- Missing voice credential on either speaker = director will reject the scene.

---

## 10. Hard rules / do-not-regress

Treat each of these as inviolable.

1. **One person per frame.** Host and stranger never share a shot. Interview scenes = stranger fills frame; host = voice + mic hand from edge only.
2. **Mic has no logo.** Plain matte silver handheld stick. Add "absolutely no logo, no wordmark, no foam flag" to every interview scene brief, every time.
3. **No bokeh in interview scenes.** Deep focus only. The street background must read as a real public space.
4. **Product NOT named until Beat 5.** The Hook Question and all body-stranger exchanges are brand-free.
5. **Both speakers registered before director dispatch.** Never send a mixed-speech scene with only one voice credential.
6. **Pacing gate is a gate.** Do not dispatch a scene that fails the 3.0 w/s ceiling. Fix first.
7. **Character diversity enforced.** No two personas share more than 1 of: age band, ethnicity, hair color.
8. **Captions muted in CTA scene.** Scene 4 uses `mute_captions: true` so the "Link in Bio ↓" pill is the sole text element.
9. **Persona images must read as UGC.** If persona image looks AI-polished or studio-lit, omit `style_direction` to use the UGC default.
10. **Music is a bed, not a feature.** Volume 0.12. Upbeat indie-documentary only — no drops, no lyrics, no genre clash.

---

## 11. Scene planning reference

| Scene | Duration | Type | Characters on mic |
|-------|----------|------|-------------------|
| 1 — Host intro | 6–7 s | on_camera_speaking | Host (on-camera) |
| 2 — Body stranger | 7–8 s | mixed_speech | Host (off-camera VO) + Stranger 1 (on-camera) |
| 3 — Final stranger reveal | 9–11 s | mixed_speech | Host (off-camera VO) + Stranger 2 (on-camera) |
| 4 — Host CTA | 4–5 s | on_camera_speaking | Host (on-camera), holds product |

Scenes 1 and 4: host holds product (use `PRODUCT REFERENCE` placeholder in brief).
Scenes 2 and 3: product NOT visible — it stays off-screen until the reveal dialogue in Scene 3.

---

## 12. Common failure modes + fixes

| Failure | Cause | Fix |
|---------|-------|-----|
| "UNREGISTERED PERSONA" for off-camera speaker | VO speaker missing voice credentials | Add `voice_asset_id` + `kling_voice_id` to host's off-camera dialogue line |
| Pacing gate fail | Too many words for scene duration | Extend duration (safest) OR trim dialogue; recalculate before retrying |
| Mixed-speech scene rejected | Only 1 of 2 voices registered | Register BOTH speakers before dispatch |
| Mic has logo/foam in render | Brief didn't include mic spec | Add "plain matte silver mic, absolutely no logo, no wordmark, no foam flag" to scene brief |
| Persona looks AI/studio-lit | style_direction set too high-production | Omit style_direction entirely to use UGC default |
| Product named too early | Hook question slipped brand name | Audit script beats — brand name must not appear before Beat 5 |