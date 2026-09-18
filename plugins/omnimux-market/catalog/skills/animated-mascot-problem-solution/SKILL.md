# Anthropomorphic Character — Problem/Solution Arc

## 1. When to use this pattern

**Best fit:**
- Products that *protect*, *store*, or *care for* something the audience values deeply (supplements, biologics, collectibles, precision instruments, perishables)
- The problem is invisible or under-appreciated — the audience doesn't fully register the damage happening right now
- A two-environment contrast (bad → good) communicates the value prop in under 5 seconds of visual storytelling
- Platform: TikTok, Instagram Reels, YouTube Shorts — anywhere 15s autoplay is the norm
- Audiences who skew technical, health-conscious, or enthusiast (they project feelings onto their products already)

**Poor fit:**
- Products without a clear "before" environment to escape from
- Luxury or fashion brands where emotional anthropomorphism would feel cheap
- Audiences who need long rational persuasion (enterprise B2B, high-consideration purchases)

---

## 2. Hook & Opening (Scene 1 — ~7 seconds)

**Structural move: First-person victim address with escalating stat evidence**

The character IS the product. It speaks directly to camera in the problem environment. It names the damage being done to it *right now*, with a specific number to anchor credibility, then escalates to a personal accusation directed at the viewer.

**Generic example (invented for a neutral hypothetical product — a reusable water bottle):**
> "You leave me in a hot car every afternoon — every time, my seals warp. Mold. Bad taste. Cracked plastic. *You're ruining me!*"

**Structure of the move:**
1. Specific stat or recurring trigger ("every afternoon") — not vague, not "many times"
2. Staccato consequence list (3 items, fast, no connectives) — "Mold. Bad taste. Cracked plastic."
3. Personal accusation — "You're ruining me!" — transfers guilt to the viewer

**Swap the subject, keep the move:**
- Replace the specific stat with the real number for your product's damage mechanism
- Replace the consequence list with the three most visceral failure modes for your product
- Keep "You're doing X to me" phrasing — the guilt-transfer is the hook

**Hook text overlay (on screen, top of frame):**
- One declarative sentence that names the hidden problem
- Example: "A hot car is destroying your water bottle."
- Style: pill_dark, top position

**Visual environment (Scene 1):**
- Cluttered, warm, slightly chaotic — the "wrong" environment
- Dramatic contrast: warm golden light floods in when the threat appears (door opens, lid lifts, etc.)
- A cartoon indicator (thermometer, gauge, meter) spiking is a reliable visual shorthand for instability
- Character expression: wide-eyed panic, shivering, sweating, arms raised

---

## 3. Narrative Arc

| Beat | Timing | Visual | Voice/Tone |
|------|--------|--------|------------|
| Cold open — character in wrong environment | 0–2s | Establish cluttered/warm setting, character visible | Silent or ambient |
| Threat event | 2–3s | Dramatic light change, danger indicator spikes | Music turns anxious |
| First-person accusation monologue | 3–7s | Character looks directly into camera, emotes with arms | Fast, slightly panicked, rhythmic staccato on consequence list |
| Hard cut to right environment | 7s | Instant — no dissolve, no wipe | Music pivots to warm/triumphant |
| Product pitch with shimmy | 7–13s | Character relaxed, ambient glow, stable readout visible | Confident, charming, slightly playful |
| Discount + CTA beat | 13–14s | Text badge bounces in, URL fades in | Single punchy line, voice rises slightly |
| Wink/thumbs-up close | 14–15s | Character winks at camera | Short sign-off line |

**Arc name:** Victim-to-Advocate in two cuts. The character's emotional journey IS the ad's argument.

---

## 4. Visual Style Spec

**Overall:** Stylized 3D animation. Bright, saturated, polished. Not flat design, not UGC, not live-action.

**Scene 1 — Problem Environment:**
- Warm color temp (ambers, yellows), cluttered composition
- High-contrast threat moment: warm golden light beam floods in from off-screen
- Camera: locked-off medium shot on character, slight push-in during accusation
- Character renders with visible distress animation (shivering, sweat bead, wide eyes)

**Scene 2 — Hero Environment:**
- Cool color temp (blues, whites), minimal clean composition
- Ambient LED glow — the product's interior illuminates the character
- Stable digital readout visible in frame (e.g., a steady status display)
- Camera: locked-off, character centered, hero lighting
- Character: relaxed posture, warm smile, shimmy on deal beat, thumbs-up wink to close

**Character design rules (keep these locked):**
- Clear/translucent body showing the product's material
- Bright accent-color cap/top matching the brand colors
- Big round expressive eyes with lashes (expressive range is the whole performance)
- Tiny stubby arms with white-gloved hands
- Small feet
- NO detailed anatomy — keep it toddler-limb proportion

**On-screen text policy:**
- Caption preset: clean-bold / Poppins / word-by-word (syncs to speech)
- Hook overlay: pill_dark, top of frame, Scene 1 only
- Deal badge (e.g., "50% OFF" with an emoji) — bounce-in animation, timed to spoken deal mention (~5s into Scene 2)
- URL pill (e.g., "theproduct.com") — fade-in 0.5s after badge
- No subtitle-style lower-thirds — captions handle readability

**Music:**
- Instrumental only, no vocals competing with character VO
- Scene 1 register: pizzicato strings, anxious xylophone, comedic timing
- Scene 2 register: brass stabs, warm horns, triumphant resolve
- Volume: 0.10 (music is texture, not foreground)
- 15 seconds total, single music asset that shifts mood at the cut

---

## 5. Voice & Persona

**Persona archetype:** The Articulate Product — charming, slightly indignant, ultimately your ally

**Tone by scene:**
- Scene 1: Frustrated, urgent, slightly comedic in its escalation — like a friend who has been wronged and is finally telling you
- Scene 2: Confident, warm, a little smug ("I told you so, but also, here's the good news")

**Pacing:**
- Target: 2.6–2.8 words/second across both scenes
- Scene 1: slightly faster on the staccato consequence list (hit each word like a beat)
- Scene 2: slow down on the product name, speed up on the deal line

**Sample phrasing patterns:**
- Problem list: "[Noun]. [Noun]. [Noun]. You're [verb]-ing me." — no "and", no "because"
- Product intro: "[Product name] — [brief descriptor] built for [specific use case]."
- Feature list: "[Feature], [feature], [feature]." — commas, not "and"
- Deal line: "[X]% off now." — short, punchy, no qualifier
- Close: "Your [thing] deserve better. Get a [Product]."

**Voice setup:** Use gender="male" or gender="female" — do not use gender="other" (returns null voice_asset_id). For non-human animated characters, voice_only persona is sufficient; no visual persona generation needed.

---

## 6. CTA Mechanic

**Type:** Spoken close + on-screen URL pill (dual reinforcement)

**Spoken:**
- Empathy line: "Your [product subject] deserve better."
- Direct command: "Get a [Product Name]."
- No question. No "check the link." No hedging.

**On-screen:**
- Deal badge (e.g., "50% OFF" with an emoji) — bounce-in animation, timed to spoken deal mention
- URL pill (e.g., "theproduct.com") — fade-in 0.5s after badge
- Both appear in the final 3 seconds of Scene 2

---

## 7. Hard Rules / Do-Not-Regress

Treat each as a hard constraint:

1. **Voice gender must be "male" or "female"** — `setup_persona(gender="other")` returns a null `voice_asset_id` and the VO will fail. Never use "other" for cartoon character voices.

2. **Always verify asset registration before referencing** — call `list_assets` to confirm any asset (especially music and user-uploaded images) is registered before using its ID downstream. Do not assume an upload succeeded.

3. **Music asset ID namespace conflicts** — if a `music:bg` asset ID is already registered in the workspace from a prior run, use `music:bg2` or another unique handle. Check `list_assets` first.

4. **Animated/non-human characters don't need visual persona generation** — `setup_persona(voice_only=True)` is correct and sufficient. Do not generate a human-face persona for a cartoon vial, bottle, or object character.

5. **15-second two-scene split: 7s + 8s** — this ratio works well. Scene 1 (problem) should be slightly shorter to not dwell on pain; Scene 2 (solution + CTA) needs the extra second for the product pitch to breathe.

6. **Hard cut between scenes** — no dissolve, no wipe. The abruptness of the cut IS part of the comedic/relief payoff.

7. **Character consistency across scenes** — same design, same voice, same proportions. Only emotion and environment change.

8. **Music must be instrumental** — no vocal music tracks. The character VO and music vocals will conflict.

9. **Caption preset fires word-by-word** — this is the correct sync mode for staccato delivery. Do not use line-by-line captions for this pattern.