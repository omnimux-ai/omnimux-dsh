# UGC Street-Interview Nightlife Hook

## 1. When to use this pattern

**Best fit:**
- Products touching events, ticketing, nightlife, hospitality, music, sports, or creator monetization
- B2B SaaS aimed at promoters, venue operators, or anyone who "runs the show"
- Any product where the aspirational angle is access, money flow, or being plugged in
- Platforms targeting 18–35 urban audiences on TikTok, Instagram Reels, YouTube Shorts

**Poor fit:**
- B2B enterprise (SaaS sold top-down to procurement teams)
- Health/medical products (regulatory tone clash)
- Premium luxury goods that need refined, slow-burn aesthetic
- Audiences who would find the nightlife energy alienating (e.g., rural agriculture)

---

## 2. Hook & Opening

**Structural move: Interviewer-question pill drop**

A white rounded-pill text overlay appears at the top-center of the frame (fade-in, 0.3s) posing the interviewer question *as if someone off-camera just asked it*, while the persona is already mid-reaction — conspiratorial lean-in, knowing half-smile, slight head-tilt. The viewer enters mid-conversation, creating instant intimacy and FOMO.

**Invented example (neutral hypothetical product):**
> Pill text: *"What's the one tool you can't run a weekend without?"*
> Persona (spoken): "Okay so — barely anyone uses this yet but they totally should."

**The swap rule:** Replace the interviewer question and the persona's opening line entirely. Keep the pill format, the top-center placement, the fade-in, and the mid-reaction entry. The persona should never address the camera directly in the opening — they address the imagined interviewer.

**Do not have the persona point at the camera.** Use "knowing half-smile / conspiratorial lean-in / head tilt" to create the self-aware meta-ad moment instead.

---

## 3. Narrative Arc

| Beat | Duration | Shape | Voice/Visual tone |
|------|----------|-------|--------------------|
| **Hook** — Interviewer Q pill + persona reacts with conspiratorial opener | 5s | Wide shot, crowd line visible, pill fade-in | Hushed, "insider secret" energy |
| **Pitch 1** — Feature 1 + 2 (counting on fingers, staying at venue entrance) | 5–6s | Same locked background, medium shot, no cut | Enthusiastic, picking up pace |
| **Brand cut 1** — Silent product UI screen with feature callout overlay | 4s | Push-in/zoom on UI asset, overlay upSwipes in | Visual proof, no narration |
| **Pitch 2** — Feature 3 (may include self-aware "meta" moment if product has an ad/marketing feature) | 5s | Same locked background | Slightly playful, wink energy |
| **Brand cut 2** — Second UI screen | 4s | Push-in/zoom | Same as above |
| **Pitch 3** — Feature 4 / money/payout angle (strongest business-value hook) | 5s | Same locked background | Confident, slightly incredulous "can you believe this?" |
| **Brand cut 3** — Third UI screen | 4s | Push-in/zoom | Same as above |
| **B-roll burst** — 2–3 rapid cuts of venue energy from lifestyle assets | 4s | Multi-cut, fast rhythm | Pure vibe, no narration |
| **Sign-off** — Chin-lift on brand name, walks into venue, brand pill overlay | 4s | Pull back or persona exits frame | Warm, aspirational |

**Total target: ~40–45s**

**Narrative arc name:** *Insider-proof escalation* — each beat adds one more reason to believe, ending with a visual proof + vibe burst before the confident close.

---

## 4. Visual Style Spec

**Format:** UGC / street interview aesthetic — NOT cinematic. Handheld-feel framing (even if generated). Medium shots dominate; wide shot only for scene 1.

**Background (LOCK THIS VERBATIM across every persona scene):**
Pick one nightlife location and lock the exact environmental description in every scene prompt. Build a single tight environment string — for example: *"matte black brick wall + warm neon sign upper-left + silver velvet rope post + wet concrete"* — and reuse it word-for-word. Without verbatim repetition of this string in every scene, the background drifts between shots and breaks immersion.

**Color palette:** Deep nighttime darks (near-black, charcoal), warm red/amber neon accents, occasional silver/gold highlights from jewelry or velvet rope.

**Camera grammar:**
- Scene 1: Wide, static or very slight push-in
- Pitch scenes: Medium, locked-off (persona can move/gesture; camera stays)
- Brand cuts: Tight push-in/zoom on UI asset (Kling handles sub-4s; use Seedance for 4s+)
- B-roll: Multi-cut from lifestyle uploads, fast rhythm
- Sign-off: Medium pulling to slightly wider as persona exits

**Shot length distribution:**
- Pitch/persona scenes: 5–6s
- Brand cuts: 4s (minimum Seedance), 3s (minimum Kling)
- B-roll: 1–1.5s per cut within the 4s scene
- Sign-off: 4s

**On-screen text policy:**
- Scene 1: White rounded-pill text overlay (interviewer question), top-center, fade-in, shown for full scene duration. **Mute AI captions on this scene** if the pill overlay covers the question.
- Brand cut scenes: Feature callout text overlay (Anton font, upSwipe-in animation, lower-center). Invented example callouts for a neutral product: "BOOK IN SECONDS", "AUTO-FILL SLOTS", "GET PAID INSTANTLY". All-caps, punchy, ≤5 words.
- Sign-off scene: Brand name pill overlay; **mute_captions: true** on this scene.
- All other scenes: Word-by-word promo-punch captions (Anton font).

**Crowd line spec (scene 1):**
> "20+ person casual nightlife attire — dresses, jeans, leather pants — NO suits"
Always specify "NO suits" explicitly; AI defaults to business attire otherwise.

---

## 5. Voice & Persona

**Persona archetype:** The Plugged-In Insider — 25–28-year-old, nightlife-adjacent, stylish but approachable. Not a celebrity; a peer who happens to know things you don't.

**Physical style anchor (swap product/brand, keep the energy):**
- Form-fitting satin or structured mini dress in a saturated jewel tone (burgundy, emerald, cobalt)
- Gold chain jewelry, strappy heels
- Hair: wavy/loose, honey or dark tones
- Describe as: *"sleeveless close-fitting satin dress, tailored silhouette following her well-proportioned figure, ending just above the knee"*
- **Avoid**: "full chest", "bodycon", or any body-part-specific descriptors — content moderation will reject

**Tone:** Conspiratorial → enthusiastic → slightly incredulous → warm/confident. The arc mirrors the narrative beats.

**Pacing:** 3.0 words/second maximum, 1.5 words/second minimum. Feature-specific scenes with short feature names (e.g., "Book a slot") need descriptive language padding or longer duration to stay above 1.5 w/s.

**Sample phrasing rhythms:**
- Opener: "Okay so — nobody's talking about [X] but they should be."
- Feature drop: "First — [feature]. Second — [feature]. And THIRD—"
- Meta wink: "They're literally running ads *inside* the app. Like, that's the whole thing."
- Payout/money line: "…and you get paid *before* the night even starts. Like — what?"
- Sign-off: "[Brand name]. Look it up." / "That's [Brand name]. You're welcome."

**Voice consistency rule (critical):**
Always run `setup_persona(voice_only=true)` as a separate call to get a confirmed English narrator voice. The persona image generation may assign a non-English voice. Use the voice-only persona's `kling_voice_id` across **all** speech scenes. Never use the voice ID from the image persona call without verifying it is English.

---

## 6. CTA Mechanic

**Type:** Soft implied CTA + brand name drop (no hard "click link in bio" or "swipe up").

**Structure:**
1. Persona says the brand name naturally in the sign-off line (spoken)
2. Brand name appears as a white rounded-pill text overlay, center-frame, on the sign-off scene
3. Persona physically exits frame (walks into venue) — viewer is left holding the brand name

**Why this works:** The nightlife-insider framing makes the brand feel like a secret worth seeking out. A hard CTA ("link in bio!") breaks the frame. Let the brand name be the CTA.

**Sign-off scene instruction:**
> Persona delivers brand name line, then chin-lift and walks into the venue entrance. Brand pill overlay fades in as she exits. `mute_captions: true` on this scene.

---

## 7. Hard Rules / Do-Not-Regress

Treat each as a non-negotiable constraint.

1. **Lock background verbatim.** Copy the exact background environment string into every persona scene director prompt. Do not paraphrase. Even minor rewording causes background drift.

2. **Crowd = no suits.** Always specify "casual nightlife attire — dresses, jeans, leather pants — NO suits" in scene 1. Default AI behavior produces business suits.

3. **Persona description avoids body-part language.** Use "tailored silhouette following her well-proportioned figure" — not "bodycon", "full chest", or specific measurements. Content moderation blocks the latter.

4. **voice_only persona is the voice source.** Run `setup_persona(voice_only=true)` separately. Never trust the voice ID from the image persona without verification. Use the voice-only `kling_voice_id` on every speech scene.

5. **No pointing at camera.** Achieve the self-aware meta moment with "knowing half-smile / conspiratorial lean-in / head tilt" — not pointing or breaking the fourth wall directly.

6. **Pacing gate: 1.5–3.0 w/s.** Short feature names on 5s scenes will fail pacing. Either extend the scene duration or add descriptive language to the script.

7. **Brand cuts need feature callout overlays.** Silent brand cut scenes must carry a feature callout text overlay (Anton, upSwipe-in, lower-center). Without it, the silent scenes feel like dead air.

8. **Music at 0.13 volume (punchy urban trap).** Higher volume buries the narration. Lower volume loses energy. 0.13 is the calibrated level for this style.

9. **Brand pill on sign-off with mute_captions: true.** Auto-captions on the sign-off scene compete with the brand pill overlay. Mute them.