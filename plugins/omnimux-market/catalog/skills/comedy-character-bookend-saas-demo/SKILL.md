# Comedy Character Bookend — SaaS Demo Commercial

## 1. When to use this pattern

**Good fits**
- B2B SaaS with a "boring but important" category (expense tracking, scheduling, compliance logging, inventory analytics, etc.) that wants to punch through ad fatigue.
- Founder-led brands willing to be self-deprecating or irreverent.
- TikTok/YouTube pre-roll, broadcast TV, trade-show loops — anywhere ≥ 60 seconds is viable.
- Products whose core value is measurable savings or efficiency (quantifiable stat = narrator credibility).

**Poor fits**
- Luxury, premium fintech, healthcare, government, or enterprise security. Crude humour destroys category trust.
- Sub-30-second slots — the bookend payoff needs room to land.
- Products with no visual UI to showcase (the demo-reel middle requires screen assets).

---

## 2. Hook & Opening

**Archetype:** Physical-comedy ECU reveal / pattern interrupt.

**Structural move:** Open on an extreme close-up of something mildly gross or absurd (a nose pick, a too-big bite, a coffee spill in slow-mo). Hold for 2–3 seconds so the viewer can't look away, then dolly/cut back to reveal the full character and context. The gross/absurd detail is the *lure*; the reveal is the *punchline*. Narrator enters over the reveal with a deadpan line that pivots to the product problem.

**Generic example (invented for a neutral product):**
> *ECU on a heavyset adult man costumed as a slovenly toddler, slurping juice from a sippy cup in a brightly-lit daycare playroom. Camera dollies back to reveal him wedged into a tiny plastic activity chair, oversized footed pajamas straining at the seams, juice dribbled down the front. Narrator (calm, authoritative): "Most teams still track their inventory like they're sorting building blocks."*

**Swap rule:** Replace the character, the setting, and the gross detail with any comedically mismatched adult-in-wrong-context scenario. Keep the ECU→reveal camera grammar and the narrator line that rhymes the visual absurdity with the product problem. The *product* and *brand* are always swappable; the pattern-interrupt + pivot structure is locked.

---

## 3. Narrative Arc

**Arc name:** Absurdist cold-open → credibility ramp → one-line payoff.

| Beat | Target duration | Visual | Voice/Tone |
|------|----------------|--------|------------|
| 1. ECU gross reveal | 0–13s | Extreme close-up → dolly/cut back. Character fully revealed. | Narrator enters deadpan at ~8s: one line linking absurdity to product problem. |
| 2. Brand intro card | 13–28s | Logo/mascot asset, brand colours. | Narrator states product name, category, and core promise. Warm, confident. |
| 3–6. Dashboard demo reel | 28–70s | Static screenshot per feature (overview, forecasting, benchmarking, comparison, etc.). One screenshot per ~10–13s beat. | Narrator walks each feature: name it, one-line benefit, key stat if available. Never more than 2 sentences per screen. |
| 7. Character payoff close | 70–80s | Return to character: the setup gag from Beat 1 pays off (e.g., the gross prop ends up on the data display — character interacts with it). | Narrator delivers CTA during payoff action for tonal contrast. |
| 8. Brand end card | 80–87s | Clean logo on brand background, URL, tagline. | Narrator restates tagline + URL. Soft sign-off. |

Total: ~87–93s. Add 5–10s per extra feature screen if needed. Do not pad the character scenes beyond 13s each — the comedy works on economy.

---

## 4. Visual Style Spec

**Register:** Broad comedy TV-commercial. NOT cinematic, not UGC, not deadpan minimalist.

| Element | Spec |
|---------|------|
| Overall look | Bright, warm, slightly overlit. Evokes 1990s Saturday-morning commercial aesthetic. |
| Character scenes | Animated video (Seedance or equivalent). Rich primary colours. Exaggerated textures (food stains, shiny plastic furniture). |
| Demo scenes | Static screenshot + narrator VO. No animation on the screenshot itself. Clean white/brand-neutral backgrounds to contrast with character warmth. |
| Camera grammar | Character scenes: ECU → dolly back (Beat 1); locked-off medium (Beat 7). Demo scenes: static frame, no pan/zoom. |
| On-screen text | Kinetic lower-thirds for product feature names and key stats (e.g., "Cuts processing time 30–40%"). No full-screen text cards. |
| Shot length | Character scenes: 10–13s each. Demo scenes: 10–13s each. Brand card: 7s. No cuts within a demo screenshot scene. |
| Colour palette | Character world: warm yellows, greens, playful primaries. Brand world: use brand's own palette. Keep them visually distinct so transitions read clearly. |

---

## 5. Voice & Persona

**Narrator**
- Archetype: Calm authority / sports-announcer clarity. Neither hyped nor whispered.
- Accent: Midwest US male (middle-aged). Avoid British/received-pronunciation reads — re-cast if needed. Specify `male, middle_aged` when calling voice setup; may require 2 attempts to get correct accent.
- Pacing: Deliberate. Pause between feature beats (~0.5s). No breathless delivery.
- Sample rhythm: *"The app tracks your key efficiency metric across every item in your workflow. [pause] Pilot teams cut their processing time by thirty to forty percent. [pause] One flat price. Per seat. Per month."*
- Never use superlatives ("best-in-class", "revolutionary"). Use numbers and specifics instead.

**Character**
- Archetype: The Oblivious Fool — a grown adult who has regressed to childlike behavior, unaware of how ridiculous they look. No lines spoken by character; all comedy is visual.
- Costume logic: Adult body + children's clothing/setting = instant comedy. Keep clothing brand-neutral.
- Physical performance notes: Reactions are slow and unself-conscious. Character is not embarrassed. That's the joke.

---

## 6. CTA Mechanic

**Type:** Spoken URL + on-screen card, delivered while character performs the payoff gag.

**Why this works:** The tonal contrast (gross visual + authoritative URL) makes the CTA memorable and slightly absurd itself, which extends brand personality into the close.

**Template wording:**
> *"Stop doing it the hard way. Visit [BrandURL] and start using [Product Name] today."*

**On-screen card:** Logo + URL + tagline, held for full 7s brand end card. No QR codes (TV format). No comment-bait. No "link in bio."

**Hard rule:** The CTA must be spoken by the narrator during or immediately after the character payoff action — not before. Payoff first, CTA second.

---

## 7. Hard Rules / Do-Not-Regress

These are corrections that must be preserved in all future uses of this pattern:

1. **Narrator accent is Midwest US male, not British.** If the first voice render sounds British/English, discard it and re-run `setup_persona(voice_only=True)` with `male, middle_aged`. Do not use the British voice even if the client doesn't explicitly notice — it undermines the authoritative blue-collar tone.

2. **Booger (or equivalent gross prop) must look realistic, not cartoon-bright.** Specify: *"smaller dark olive-brown gloppy [prop] — NOT bright lime green, moist and textured, realistically gross."* Bright lime green reads as a cartoon prop and deflates the comedy.

3. **Music at 10% volume.** Background music is present but never audible enough to compete with narrator. Mix: `-af volume=0.10` before amix. Do not raise above 15%.

4. **All animated video scenes require ffmpeg re-encode before assembly.** Seedance-generated video files have the `moov` atom at the end (not faststart). The Remotion assembler will throw "Error loading IMAGE" on every such scene. Mandatory fix for every animated scene:
   ```
   ffmpeg -i scene.mp4 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k scene_fixed.mp4
   ```
   Do NOT re-upload fixed files via register_asset and pass them back to the Remotion compositor — files re-uploaded to the CDN are served from a domain the compositor blocks ("Operation not permitted"). Assemble the entire final video via `ffmpeg concat` instead.

5. **Static demo scenes use `-loop 1 -i image.png` with `-shortest` flag.** Do not generate a video for dashboard screenshots — it wastes generation quota and produces motion blur on UI text. Static image + VO audio via ffmpeg is correct.

6. **Character costume detail matters for comedy fidelity.** Specify all of: garment type, graphic/print, fit description ("stretched tight"), condition ("food-stained"), and the background setting. Vague prompts produce generic results. Lock these when adapting to a new product.

7. **Do not let the product narration enter until after the character reveal is complete (~8s).** Narrator must not speak during the ECU — let the visual breathe first.