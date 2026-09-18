# Split-Screen Dialog Ad

This skill is a **mold for the creative move**, not a tool-orchestration recipe. The producer/director/mode skills already handle dispatching. Your job here is to enforce the *look*, the *cadence*, and the *constraints* that make this format work.

The pattern: two people on a "selfie call". She's on top, he's on bottom, a thin white line between them. They talk. No phone UI. No room clutter. No on-screen text inside the frame (captions ride on top in post). The active speaker performs; the listener reacts. That's the entire visual identity, and it has to be defended at every step.

---

## 1. When to use this pattern

**Strong fit**
- Dialog scripts with two named speakers (one female, one male) and 3–10 back-and-forth beats.
- Dating, social-skills, self-improvement, relationship-coach, language-learning, therapy/journaling, study-buddy, fitness-accountability — any vertical where the value prop is "someone teaches / challenges / supports another person in conversation".
- Audience is mobile-first (TikTok, Reels, Shorts).
- Tone bands: warm-playful, warm-critical, hyped, conspiratorial, deadpan-funny. Avoid pure cinematic drama — the split-screen selfie format reads as too casual for that register.

**Bad fit (do not force this skill)**
- Monologue scripts (use the standard UGC talking-head pattern instead).
- Three or more speakers.
- Product-demo-heavy ads where the product needs to be the visual subject (use a product-hero pattern).
- Cinematic / narrative storytelling where you need locations, B-roll, transitions.

---

## 2. Inputs to collect from the user

Ask once, in a single grouped question if anything is missing:

1. **Dialog script** *(required)* — tagged lines (`woman:` / `man:`, or `coach:` / `user:`, etc.) or a free-form block you parse into alternating turns. Two speakers only.
2. **Brand / product info** *(optional)* — title, one-line description, audience, tone. If a brand is named, `web_search` + `web_fetch` it before anything else. If absent, treat as a generic dialog video and skip brand gating.
3. **Character reference images** *(optional)* — uploaded `input:image-*` assets for either character's likeness. Run `get_asset` on each. **If the source image shows posters, framed art, wall text, signs, bookshelves, or any busy background**, flag it to the user and either (a) ask them to swap it or (b) re-setup the persona on a plain wall using the ref only for face/hair/wardrobe.
4. **CTA end card** *(optional)* — logo wordmark, tagline, button copy, store badges, product/app screenshots to mock up.
5. **Duration target** *(optional)* — default to natural pacing (5–8s per dialog beat).
6. **Style override** *(optional)* — default is UGC selfie. Override only if the user explicitly says "cinematic" or "studio". See `references/style-overrides.md`.

---

## 3. Hook & opening — the structural move

The hook is **the woman issuing a one-line challenge / setup / provocation in the top half**, with the man visible-but-silent in the bottom half. The split-screen is already on screen at frame 1 — there is no pre-roll, no establishing shot, no logo intro. The viewer lands directly inside the conversation, mid-thought.

**Illustrative example (generic; woman, opening line):**

> "Rooftop bar. She's by the railing. Ten seconds. Go."

Structural move:
- Four sentence fragments. Punchy. Imperative.
- Names a scenario (Rooftop bar), establishes positioning (by the railing), sets a time limit (Ten seconds), and dares (Go).
- The man in the bottom half is already on screen, eyebrows up, mouth slightly open — the dare has landed before he's said a word.

**Swap the subject, keep the move.** For a language-learning ad: *"Tokyo. Train station. You need directions. Go."* For a fitness ad: *"4am. Gym's open. Alarm just went off. Move."* For a dating-confidence ad in a different niche: *"Coffee shop. She's in line behind you. Thirty seconds. Open."*

The hook line is **always**:
1. Spoken by the woman (top half).
2. ≤ 10 words, ideally 4–8.
3. At least one imperative verb.
4. Names a specific scenario, not an abstraction.
5. Ends on a single-word command or beat.

---

## 4. Narrative arc

Six beats is the proven shape. Each beat is one director scene. Compress to 4 or expand to 8 only if the script demands it — never split a single thought across two scenes.

| # | Beat | Speaker | Target sec | Tone | Visual emphasis |
|---|------|---------|------------|------|-----------------|
| 1 | **Challenge / setup** | Woman | 4–6 | Playful, daring | Woman animated, leans into camera; man reacts (raised brows, half-smile) |
| 2 | **Attempt / fumble** | Man | 4–6 | Hesitant, sheepish | Man rubs neck or glances off-camera; woman watches, slight head-tilt |
| 3 | **Diagnosis** | Woman | 5–7 | Warm critique, not harsh | Woman gesturing, explaining; man listens, small nod |
| 4 | **Teach / reframe** | Woman | 6–8 | Warm playful, gives the tool | Woman demonstrates the move on camera; man processes |
| 5 | **Admission / vulnerability** | Man | 4–6 | Sheepish honesty | Man cracks a small self-aware smile; woman softens |
| 6 | **Closer / payoff** | Woman | 5–7 | Warm mentor, lands the value prop | Woman direct-to-camera; man nods, convinced |
| 7 | *(optional)* CTA card | — | 5 | — | Static phone mockup + text overlays (see §8) |

If the script doesn't map cleanly to challenge→fumble→diagnosis→teach→admit→close, find the closest analog. The arc is **provoke → struggle → understand → resolve**, with the woman driving and the man receiving / processing. Inverting that (man teaches woman) is allowed but requires explicit user buy-in — the default polarity is woman-as-driver because it carries the format's voice.

---

## 5. Visual style spec

**Layout (non-negotiable, copy verbatim into every scene's `style_direction`):**

> Clean split-screen 9:16 selfie-call composition. Top half = woman in her bright daytime apartment. Bottom half = man in his dim warmly-lit bedroom against a plain wall. Thin clean white horizontal divider at exact center. ABSOLUTELY NO video-call UI, NO icons, NO status pill, NO buttons, NO bars, NO microphone/camera/end-call symbols, NO text or posters or signs anywhere in the frame. Pure split-screen of just the two people and the divider line. Soft phone-camera look, slight handheld breathing motion. UGC selfie energy.

**Per-half environments (defaults, override only if brand tone demands)**
- **Top (woman):** warm white walls, bright daylight from a window off-frame, plant or soft texture optional but no readable text on anything. Wardrobe: casual layered, cream/oat/soft-pink palette.
- **Bottom (man):** dim warm tungsten / lamplight, plain painted wall behind him — **explicitly no posters, no framed art, no signs, no wall text, no shelves with books, no whiteboards**. Wardrobe: hoodie or plain tee, charcoal/navy/olive palette.

**Camera grammar**
- Locked-off framing, no zooms, no dolly. Slight handheld breath (1–2px drift) only.
- Selfie focal length feel — slight wide distortion at edges, not telephoto compression.
- No transitions between scenes. Hard cut. The divider line stays in the exact same position frame-over-frame.

**On-screen-text policy**
- Zero text *inside* the frame (no posters, no UI labels, no whiteboards). The whole format depends on this discipline.
- Captions live in the post layer via `assemble_video`, not baked into scenes.

**Shot length distribution**
- Median scene: 5–6s.
- Min: 4s (Seedance backend floor — pad with a listener reaction beat if dialog is shorter).
- Max: 8s (anything longer, split the line).

---

## 6. Voice & persona

**Woman (top half) — persona archetype: warm-confident mentor.**
- Tone: warm, playful, occasionally teasing, never sharp or cruel.
- Pacing: 2.5 w/s target. Slight smile in the voice on hook + closer. Drops to lower register on the diagnosis beat.
- Sample phrasing (generic illustrative): *"Dead end. You answered the question and then just stopped. You gave them nothing to grab onto."* / *"Exactly. That's why you practice here first. Zero risk. Build the reps until it just clicks."*
- Persona setup: bright daytime apartment, warm white walls, UGC selfie energy. If user uploaded a ref, pass it in `reference_asset_ids` and explicitly add the plain-background constraint to the persona prompt.

**Man (bottom half) — persona archetype: relatable everyman / earnest student.**
- Tone: hesitant on the attempt beat, sheepish on the admission, attentive while listening.
- Pacing: 2.0–2.3 w/s (slightly slower — he's the receiver).
- Sample phrasing (generic illustrative): *"Uh... hey, how's your night going?"* / *"Honestly? I'd freeze in real life."*
- **Persona setup is the single highest-leverage gotcha in this skill** — see §9.

Always compose persona prompts via `ads-persona-prompt-skill` before calling `setup_persona`. Dispatch both `setup_persona` calls in parallel. Capture `voice_asset_id` + `kling_voice_id` from each.

**Voice pairing**
- Pick voices with audible age + warmth match to the persona. Woman: late-20s, warm, slight rasp. Man: late-20s, soft-spoken, conversational.
- Delivery cues per scene must mirror the beat tone (see arc table in §4).

---

## 7. Pacing fingerprint

- **Target words-per-second:** 2.5.
- **Hard floor:** 1.5 w/s (slower = sounds drugged).
- **Hard ceiling:** 3.0 w/s (faster = unintelligible at TikTok playback).
- **Backend min duration:** 4s per scene (Seedance constraint). If a line clocks shorter, pad with a reaction beat from the listener — *do not* slow the speaker below 1.5 w/s.
- **Listener reaction beat:** 0.5–1s of silent business from the non-speaking character (head tilt, half-smile, nod, eyebrow raise). Always specify this in the motion prompt.
- **Cuts:** hard, no fades, no whips. The divider line is the only constant — it should appear immovable across cuts so the cuts read as the same call, not separate scenes.

---

## 8. CTA mechanic

If the user provided CTA spec, add one final scene. If not, end on the woman's closer beat — that's a complete unit.

**CTA scene structure (when present)**
1. **Static image, not video.** Generate via `generate_image` (nano-banana-2 or current equivalent), 1K, 9:16, with any product/app screenshots passed in `image_urls` so they get mocked up as phone screens on a brand-colored background. Leave generous top + bottom whitespace.
2. **Duration:** 5s.
3. **`mute_captions: true`** (the dialogue captions stop here).
4. **Text overlays stacked vertically** in `assemble_video`:
   - Top: logo wordmark (large, brand font).
   - Mid-upper: tagline (one line, sentence case).
   - Center: phone mockup image already baked into the generated image.
   - Mid-lower: CTA button (pill shape, brand accent color, ALL CAPS verb phrase like `START FREE TODAY`).
   - Bottom: store-badge line (`Available on App Store & Google Play`).

**Reference CTA copy structure (generic illustrative):** logo `[Brand Wordmark]` / tagline `[Short Value-Prop Tagline]` / button `START FREE TODAY` / badges `Available on App Store & Google Play`.

The CTA is a **soft visual close**, not a spoken one. The woman's closer beat is the emotional CTA; the card is the URL.

---

## 9. Hard rules / do-not-regress

Each of these reflects a real correction or QA failure mode. Treat them as gates, not suggestions.

1. **Plain wall behind the man — pre-emptive, always.** The I2I model anchors hard to the source persona's background. A poster or framed art in the persona ref **bakes into every scene's start frame** and causes "no text in frame" scenes to fail QA after multiple attempts. When calling `setup_persona` for the male character, include this verbatim in the prompt: *"completely plain solid painted wall behind him — absolutely no posters, no framed art, no signs, no shelves, no wall text of any kind, no books, no whiteboards."* Repeat the constraint for the woman's environment too (no readable text on anything visible).

2. **Both personas must be listed in every scene**, not just the speaker's. The start frame is a split-screen showing both characters; if you only reference the speaker's persona, the other half gets re-rolled and identity drifts. Always list `persona:woman` AND `persona:man` (or whatever they're labeled) in every director call.

3. **No video-call UI, ever.** No icons, no status pill, no buttons, no microphone/camera/end-call glyphs, no name labels, no time stamps, no signal bars. The negative constraint must appear in `style_direction` AND in each scene's visual description. Models drift toward adding chrome — restating it twice per scene is the cost of keeping it out.

4. **No text inside the frame.** No posters, no signs, no whiteboards, no t-shirt graphics with readable letters. Captions ride on top in post; nothing readable lives inside the shot.

5. **Same `style_direction` block, verbatim, on every scene.** Do not paraphrase it per scene — variance there causes the divider position or layout to drift. Copy-paste.

6. **`reference_images` may need to be empty on the underlying video-gen call** when the start frame already locks both identities. Passing both personas as elements can hit Kling's element-validator cap or cause Seedance duplication artifacts. The director handles this internally — the producer's job is just to list the personas in the payload and trust the director's resolution.

7. **Pacing band 1.5–3.0 w/s, target 2.5.** Pad short lines with reaction beats. Split long lines into two scenes. Never slow a speaker below the floor.

8. **All dialogue scenes dispatched in one parallel turn.** Do not serialize. The system enforces parallelism; producer-side serial dispatch wastes wall-clock and works against the expected workflow.

9. **Persona ref backgrounds get inspected before dispatch.** If a user uploads a character ref with a busy background, either re-shoot the persona with the plain-wall constraint (using the ref only for face/hair/wardrobe) or surface the risk to the user before spending compute on doomed scenes.

10. **CTA card is `output_type: image`, not video.** `assemble_video` adds the text overlays as a static scene. Do not generate a video CTA.

11. **Captions: `clean-bold` preset, `DM Sans`, `appear_mode: word`.** This is the locked default — it reads as premium-tech and matches the format's voice. Override only if brand tone is explicitly "playful chaos" or "luxury minimal" (see `references/caption-overrides.md`).

12. **Music: instrumental loop, volume 0.12.** Genre matches brand tone — lo-fi trap for masculine self-improvement, soft pop for romantic, ambient pad for therapy/wellness, light bounce for language-learning. Generate via `music_generate` with BPM and mood specified. Never use vocal tracks — they fight the dialogue.

13. **Output size: 1080×1920.** Always.

---

## 10. Quick reference

- Hook library / opener formulas: `references/hook-library.md`
- Style overrides (cinematic, studio): `references/style-overrides.md`
- Caption presets by brand register: `references/caption-overrides.md`

---

## 11. Reference arc

A typical finished piece runs roughly 35–40s as 6 dialog scenes plus an optional CTA card, mapping 1:1 to §4's six-beat arc. When in doubt about a creative call, ask: *"Does this follow the six-beat arc and defend the format's constraints?"* If yes, do it. If you're inventing a new move, surface the deviation to the user before dispatch.