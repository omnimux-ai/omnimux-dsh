# UGC Advisor Numbered-Points Reel

A single trusted advisor persona makes a structured case for a product using a contrast hook, three enumerated proof points, a stat moment, and a warm close — with animated point-counter overlays and a branded end card.

---

## 1. When to use this pattern

**Good fit:**
- High-consideration products where the buyer needs to understand *why this one* (professional certifications, SaaS tools, training programs, fintech services, B2B platforms)
- Audiences who respond to rational structure: professionals, career-changers, ambitious students
- Vertical short-form video where 45–65 seconds of credible monologue still performs
- Briefs that supply 2–4 concrete proof points or differentiators

**Poor fit:**
- Pure lifestyle / fashion / consumer impulse products (use emotion-first hook instead)
- Products with no defensible differentiator to enumerate
- Formats requiring multiple personas or dialogue
- Sub-30-second briefs (no room for the three-point arc)

---

## 2. Hook & Opening

**Structural move: Contrast Declaration**

Open with a single declarative sentence that names the category and immediately splits it into "most" vs. "this one." No setup, no greeting. Camera is already rolling on the advisor mid-thought.

**Generic example:**
> "Not all running shoes are built the same."

**Template:** `"Not all [category noun] are the same."`

**Swap rule:** Replace `[category noun]` with the product's category (e.g., "project management tools," "coding bootcamps," "investment platforms"). Keep the negation-first syntax and the flat, confident delivery — no vocal fry, no uptalk.

**Follow immediately** with the value pivot (what *this* product does differently), delivered in the next 4 seconds:
> "This one is engineered for runners who want speed without sacrificing comfort."

The hook scene runs 4–5 seconds total. No on-screen text overlay during the hook line itself — let the spoken contrast land clean before the hook_overlay pill fades in.

**Hook overlay spec:**
- Format: pill_dark (dark semi-transparent background)
- Content: product tagline or value proposition (not the contrast line)
- Duration: 2.5 s, fading in ~0.5 s after the spoken hook
- Position: top 6–10% of frame (above advisor's head)

---

## 3. Narrative Arc

Beat-by-beat structure. Adjust second counts ±1s to fit natural speech; never drop a beat.

| Beat | Name | Target Duration | Voice/Visual Tone |
|------|------|-----------------|-------------------|
| 1 | Contrast Hook | 4–5 s | Flat, confident, direct eye contact. No overlay text yet. |
| 2 | Value Pivot | 4 s | One sentence. Deliver the key differentiator fast. |
| 3 | "Three things" Setup | 8–10 s | Slightly warmer. Lean forward. Enumerate what you're about to cover. |
| 4 | Point 01 | 4–5 s | Declarative. Point counter 01 animates in at first word. |
| 5 | Point 02 | 4–5 s | Same energy. Counter 02 pops in. |
| 6 | Point 03 | 4–5 s | Slight elevation — this is often the most compelling point. Counter 03 pops in. |
| 7 | Stat Moment | 6–8 s | Voice slightly slower, let the number land. Split-zone stat overlay active. |
| 8 | Rallying Call / Urgency | 4 s | Slight uptick in energy. No overlay clutter. |
| 9 | Warm CTA Close | 7–9 s | Genuine, not salesy. Smile on the close line. Spoken CTA + gesture to link. |
| 10 | End Card (static image) | 3–4 s | Brand lockup. No advisor. Overlays fade in staggered. |

**Arc name:** Problem-Contrast → Structured Proof → Stat Validation → Warm Close

---

## 4. Visual Style Spec

**Mode:** Semi-professional UGC (not full cinematic, not raw selfie)
- Handheld or lightly stabilized camera, slight natural movement acceptable
- NOT locked-off corporate talking head; NOT shaky selfie

**Setting:** Aspirational co-working or home-office environment
- Natural or warm artificial light from the side/front
- Blurred background with visible lifestyle context (desk, plants, bookshelves)
- No green screen, no stark white studio

**Color palette:** Navy, warm white, gold accents (driven by brand)
- Overlay backgrounds: navy (#1a2b4a range) with white text
- Pill overlays: dark semi-transparent
- Accent highlights: gold/amber for stat numbers

**Camera grammar:**
- Framing: medium close-up (chest to top of head, 10–15% headroom)
- Head starts at approximately 7–10% from top of frame (verify with get_asset on scene 1 start frame before placing hook overlay)
- Slight push-in or static; avoid zoom-out
- Eye contact with lens throughout

**Shot length distribution:**
- Hook + pivot: 4–5 s each (short, punchy)
- Point scenes: 4–5 s each
- Stat + setup scenes: 6–10 s (let content breathe)
- CTA: 7–9 s (warmth needs time)
- End card: 3–4 s static image

**On-screen text policy:**
- Captions: `clean-bold` preset, bold sans-serif, word-by-word reveal. Always on.
- Hook overlay: pill_dark tagline, top of frame, 2.5 s
- Point counters: see Section 6
- Stat overlay: see Section 6
- End card overlays: see Section 6
- **Never bake overlay text into the director scene prompt.** All overlays are applied in assemble_video.

---

## 5. Voice & Persona

**Persona archetype:** Peer Expert — someone who has been where the viewer is and figured it out. Not a professor. Not a corporate spokesperson. A slightly-ahead-of-you peer.

**Demographics:** Gender-neutral (adapt to brand brief). If female: early-30s, professional-casual (blazer + simple top), minimal jewelry, clean hair. If male: similar register — business casual, not a suit.

**Tone:** Calm-authoritative with genuine warmth. Deadpan on the contrast hook; slightly brighter on the proof points; genuinely warm on the close.

**Pacing:** ~130–145 words per minute. Pause briefly before each numbered point. Slight emphasis on the stat number (say it slowly, let it sit).

**Phrase rhythms that work:**
- Short declarative openers: "Not all X are the same." / "Here's what most people miss."
- Enumeration signpost: "Three things set this apart:" / "There are three reasons this works:"
- Stat frame: "Over [X]% of [audience] [outcome] — and that number keeps climbing."
- Warm close: "If you're serious about [goal], this is worth five minutes of your time."

**Voice consistency:** A single persona voice must be reused across ALL spoken scenes. Do not switch voices between scenes.

---

## 6. Overlay System

### Point Counter Overlays (01 / 02 / 03)
- **Position:** Top-left zone of frame
- **Style:** Navy background pill, bold sans-serif, white text, ~36–42px font
- **Animation:** pop-in (scale from 0.85 → 1.0, ~0.15 s ease-out)
- **Timing:** Animate in at the exact second the advisor first speaks that point's number or keyword
- **Lifespan:** Display from pop-in through end of that scene only (do not carry across cuts)
- **Format:** `01`, `02`, `03` — zero-padded, no labels

### Stat Split-Zone Overlay (Stat Moment scene)
- **Zone split:** Advisor occupies upper ~60% of frame; stat graphic occupies lower ~35–40%
- **Elements:**
  - Large stat number: ~100–120px, extra-bold sans-serif, gold or white
  - Supporting descriptor: ~28px, white, 1–2 lines max
  - Source label: ~18px, light gray, bottom of zone
- **Animation:** fade-in, 0.3 s
- **Vertical positions (1080×1920):** Stat ~y:1300–1350, descriptor ~y:1450–1500, source ~y:1560–1600
- **Do not** use a full-screen card for the stat — the advisor stays visible in frame

### End Card Overlays
- **Background:** Director output_type: image — solid brand-color gradient (no advisor)
- **Overlays applied in assemble_video:**
  - Headline: center-top zone, bold sans-serif ~52px
  - URL / CTA text: center, ~38px
  - Social handles: lower third, ~28px, staggered fade-in (+0.3 s apart)
- **Music:** continues through end card (do not mute)

---

## 7. CTA Mechanic

**Type:** Warm spoken CTA + implied link gesture

**Mechanics:**
- Spoken: advisor says "link in bio" or "check the link below" while glancing slightly downward (natural gesture)
- No aggressive urgency language ("act now," "limited time") — this persona is a trusted peer, not a salesperson
- Optional soft on-screen card in the final 2 s of the CTA scene with the URL or handle (not mandatory)
- End card carries the URL + handle as the persistent visual CTA

**Wording pattern:**
> "If you're ready to [desired outcome], [brand name] makes it easy — link's in the bio."

Swap `[desired outcome]` and `[brand name]`; keep the casual possessive contraction on "link's."

---

## 8. Hard Rules / Do-Not-Regress

Treat each as a non-negotiable constraint when reusing this skill.

1. **No text baked into director prompts.** All overlay text (counters, stats, hook pill, end card) must be applied exclusively in `assemble_video`, never written into director scene descriptions or prompts. Baking text into AI-generated video causes irreversible rendering; overlays preserve flexibility.

2. **Stat displayed as split-zone, not full-screen card.** The advisor must remain visible during the stat beat. A full-screen graphic card breaks the UGC intimacy. Keep advisor in upper 55–65% of frame, stat in lower 35–45%.

3. **Single voice across all scenes.** The same persona voice (registered as `persona:advisor:voice`) is used for every spoken scene. Switching voices between scenes is not permitted.

4. **Music at 0.17 volume.** Lo-fi instrumental underscore. No vocals. Volume must not exceed 0.20 — it should be felt, not heard.

5. **4-second minimum per scene.** No scene shorter than 4 seconds regardless of how short the line. Short declarative lines get 4–5 s to breathe and allow the caption to complete before the cut.

6. **Head position verification before overlay placement.** Run `get_asset` on Scene 1 start frame before setting `position_y_ratio` for the hook overlay pill. Do not assume default centering.

7. **End card as director image output, overlays added in assembly.** The end card scene must be generated as `output_type: image` in the director call (solid color/gradient background), with all text added as overlays in `assemble_video`. Do not ask the director to render text onto the end card.

8. **Point counter overlays are per-scene, not persistent.** Each counter (01, 02, 03) appears only during its own scene. Do not leave a previous counter on screen into the next scene.