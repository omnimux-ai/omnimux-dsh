# UGC Skeptic-Pivot Selfie

A one-take, phone-held, peer-reviewer ad. The creator opens skeptical, then visibly converts after holding the product to camera. The whole arc lives inside a single 8–12 second continuous shot — no cuts, no B-roll, no music. TikTok-style word-by-word captions carry the spoken hook.

The subject (product, brand, persona demographics) is **swappable**. The skeptic-pivot move, the single-take constraint, the caption style, and the doubt→reveal→soft-CTA arc are **locked**.

## When to use this pattern

**Use it for:**
- DTC oral care (mouthwash, whitening, toothpaste, floss)
- Skincare / haircare with a "I was burned by [category] before" angle
- Supplements, wellness drinks, sleep / focus aids
- Any product where the buyer's mental state at scroll-time is "another one of these…"
- Platforms: TikTok, Instagram Reels, YouTube Shorts, 9:16

**Do NOT use it for:**
- Luxury / fashion / automotive (the skeptic frame undercuts aspiration)
- B2B, SaaS, finance (peer-honest tone reads unprofessional)
- Cinematic brand films, sizzle reels, or anything >15s
- Products whose differentiator is purely visual spectacle (use a cinematic pattern instead)

## Hook & opening (the locked move)

The first spoken line MUST express doubt about the **category**, not the product. The product enters frame only AFTER doubt is established. This is what makes the pivot land.

The structural move is: **[category noun] + [dismissive modifier] + trailing ellipsis (audible trail-off, not a full stop)**. The trail-off is essential — it creates the micro-pause where the camera tilts down and the product enters frame.

**Swap the subject, keep the move.** Generic examples for different categories:
- Collagen powder → "I thought collagen powder was a total gimmick…"
- Whitening strips → "I thought whitening strips were a scam…"
- Retinol serum → "I thought retinol just burned your face…"
- Sleep gummies → "I thought sleep gummies were placebo…"
- Scalp serum → "I figured nothing was gonna grow this back…"

**Rules for the hook line:**
1. First person. "I thought…" / "I figured…" / "I was sure…"
2. Skepticism aimed at the **category**, never the brand. (You can't pivot off brand-doubt without sounding like an attack ad.)
3. Trails off — never lands with a period or exclamation.
4. Spoken, not overlaid. (See "Hard rules" below.)
5. Maximum 8 words. Longer kills the scroll-stop.

See `references/hook_library.md` for more category-specific hooks.

## Narrative arc

Total runtime target: **10–12 seconds**. One continuous shot. No cuts.

| Beat | Seconds | What happens | Voice tone |
|------|---------|--------------|------------|
| 1. Doubt | 0.0 – 2.0 | Hook line, eye-contact with camera, slight head shake or shrug | Flat, almost dismissive |
| 2. Pivot | 2.0 – 4.0 | Creator lifts product into frame at chest height. One short line acknowledging the turn ("…until I actually tried it." / "…then this changed things.") | Voice opens up, half-smile |
| 3. Reason | 4.0 – 8.5 | One concrete claim or sensory detail — what makes it different. Not a feature list, ONE thing. | Conversational, slightly leaned-in |
| 4. Soft close | 8.5 – 11.0 | Close-lipped smirk, a 3–5 word sign-off, or a shrug-and-look-away. NO "link in bio" energy. | Quiet confidence |

Total word budget: **25–35 words**. Hard ceiling: 3.0 words/second. Target: **2.5 w/s**. Count the words before dispatching to generation. If you're over, cut adjectives first, then cut the reason beat in half. See `references/word_budget_table.md`.

## Visual style spec

- **Format:** 1080×1920, 9:16, single continuous take, no cuts.
- **Camera:** Selfie-held, slight handheld float. Locked-off tripod kills it. Phone at roughly eye-level, slight downward angle to feel arm's-length, not influencer-staged.
- **Location:** Domestic, lived-in. Bathroom, bedroom, kitchen counter. Natural daylight from one side (window). Avoid ring-light flatness.
- **Set dressing:** One or two ambient props (plant, mirror, towel) — never a styled flatlay. The space looks like someone lives there.
- **Color:** Untouched, daylight white balance. No filters. Slight skin warmth is fine.
- **Wardrobe:** Plain crew tee, hoodie, or tank. Single small accessory max (stud earring, simple chain). No logos that compete with the brand.
- **Product framing:** Product enters frame at beat 2, held at chest level, label facing camera, held still for ~1.5s minimum so the freeze-frame screenshots cleanly.
- **On-screen text:** Captions ONLY — see caption spec below. **No hook overlay**, no lower-thirds, no kinetic typography stack.

## Captions (locked)

- Preset: `clean-bold`
- `appear_mode: word` (one word at a time, TikTok-style)
- `font_family: DM Sans` — premium-clean. Do NOT default to Hormozi-yellow Impact; that register is wrong for this category.
- Positioned center, lower-third.
- Captions transcribe the spoken VO verbatim. They carry the hook. This is why there is no separate hook overlay — overlaying would double-print.

## Voice & persona

**Archetype:** The peer reviewer. Not an expert. Not an influencer. A friend who just tried something and is telling you about it across a kitchen counter.

**Demographics are swappable** — match to the product's buyer:
- Oral care / whitening: 22–32, any gender, casual
- Skincare: 24–34, slight beauty-literate vocabulary
- Supplements / wellness: 28–40, "I read the label" energy
- Hair / scalp: 30–45, lived-in concern about the problem

**Voice direction (locked regardless of demo):**
- Natural conversational VO, NOT TTS-flat. Slight breath, slight um-and-pause cadence.
- Pacing 2.5 words/second target.
- Tone shift across beats: dismissive → opening up → leaned-in → quiet confidence.
- No hype words: "insane", "literally changed my life", "obsessed", "10/10". They kill the skeptic frame.
- Yes to: "honestly", "actually", "kinda", "fine", "noticed", "didn't expect".

**Sample-line phrasing** (generic example — rewrite for your product, keep the cadence):
- "I thought this stuff was BS…"
- "…tried it for a week."
- "No fuss. It actually does what it says."
- "Yeah. I get it now."

## Brand pronunciation override (do not skip)

If the brand name has any non-obvious pronunciation (silent letters, vowel substitutions, made-up coinages), the spoken model will mis-read it and the take is dead. Fix at dispatch time, not in post:

1. In the dialogue passed to the speech model, write the brand name **phonetically** (e.g. a brand spelled "Brytely" → spoken "Brightly").
2. In the caption transcription step, pass the **branded spelling** as `script_text` so the on-screen captions auto-correct back to the canonical brand spelling.
3. Net effect: audio pronounces correctly, captions display correctly.

This is non-negotiable for any brand with creative spelling. Build it into the dispatch by default.

## CTA mechanic (the soft close)

There is no spoken CTA. No "link in bio". No "comment X". No "use code Y".

The close is one of:
- A 3–5 word verbal sign-off in the same conversational register ("Yeah, I get it now." / "I'd buy it again." / "Surprised, honestly.")
- A close-lipped smirk + slight nod, no words
- A shrug and a look away from camera

The product label has been on screen for ~6+ seconds by this point. That IS the CTA. Pushing harder breaks the peer-reviewer frame.

If the brief demands a hard CTA, this is the wrong pattern — use a different ad skill.

## Hard rules / do-not-regress

Treat each as a constraint, not a suggestion.

1. **Spoken hook, not overlay.** When the hook is spoken in the dialogue, do NOT also add it as a hook_overlay — the auto-generated word-by-word captions will already display it, and an overlay double-prints it.
2. **Word budget before dispatch.** Count words. If the script is >3.0 w/s for the planned duration, trim BEFORE generating. A 60-word script on a 12-second take will be unusable.
3. **Phonetic dialogue + branded `script_text`.** Always, for any brand with non-obvious pronunciation. See the override section above.
4. **One continuous shot.** No cuts, no B-roll, no transitions. The single-take constraint IS the authenticity signal — break it and you've just made a regular ad.
5. **No background music.** UGC ambient only. Music converts this from "honest review" to "ad pretending to be honest review" and the pattern collapses.
6. **No hype words in VO.** See voice section. "Insane", "obsessed", "literally", "10/10" — banned. They invalidate the skeptic frame.
7. **Skepticism aimed at category, not brand.** "I thought [category] was BS", not "I thought [Brand] was BS". You can't pivot off brand-doubt.
8. **Product enters at beat 2, not beat 1.** Doubt has to be established before the reveal lands. Cold-opening with the product in frame kills the pivot.
9. **Captions in DM Sans, not Impact.** Premium-clean register. The yellow-Impact Hormozi style is wrong tonally for this category and will read cheap.
10. **Re-label outputs on iteration.** When iterating, use new output labels (`scene-1b`, `scene-1c`); never overwrite a `final:video` asset id from a previous pass.

## References

- `references/hook_library.md` — drop-in skeptic hooks for common DTC categories
- `references/word_budget_table.md` — script length targets by runtime