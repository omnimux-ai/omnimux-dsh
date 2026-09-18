# Listing Cinematic Silent Spec Reveal

A three-scene, muted-friendly, 15-second cinematic ad built entirely from listing photos. The hook is editorial restraint — slow deliberate camera motion, typographic hierarchy, and one accent-color CTA pill — not hype or narration.

---

## 1. When to Use This Pattern

**Ideal for:**
- Luxury or high-consideration purchases listed on a marketplace (aircraft, exotic/classic cars, superyachts, commercial real estate, high-end residential)
- Any listing where existing photography is professional-grade (clean backgrounds, good lighting, multiple angles)
- Instagram Reels, LinkedIn video, Facebook Stories/Reels — contexts where muted autoplay is common
- Brokers and dealers who need a polished ad fast from a single URL with no brand assets on hand

**Do NOT use when:**
- Photos are low-res, heavily watermarked, or fewer than 3 distinct quality images are available
- The product story requires motion footage to land (e.g., a boat under sail, a car in motion)
- The audience expects personality/humor — this pattern reads as serious and premium
- Platform requires a talking-head or UGC-style format

---

## 2. Hook & Opening

**Structural move: "Acquisition frame" title card over the hero photo**

The very first frame carries a restrained, authority-signaling line in small caps or mixed case over the primary exterior/profile shot. It names the opportunity, not the product.

**Generic example (invented for a neutral listing):**
> "Now Available to Own"

**The move:** Reframe the listing as an exclusive opportunity. Do NOT open with the product name or price — those come in the body. The hook works because it triggers status-orientation before any spec is shown.

**Swap rule:** Replace the transaction verb with the one appropriate to the category:
- Real estate → "Now Available for Purchase"
- Automotive → "Now Available — Private Sale"
- Marine → "Offered for Immediate Delivery"
- Keep the word "Now" — it creates mild urgency without hype.

Hook overlay style: white text, small or medium weight (not bold), top-center, fade-in on the first 0.5s of Scene 1.

---

## 3. Narrative Arc

**Pattern: Hook → Capability → Luxury → Price/CTA**

| Scene | Duration | Content Layer | Visual Motion | Text Job |
|-------|----------|---------------|---------------|----------|
| 1 — Exterior / Profile | 5s | Acquisition hook + top-line identity (make/model, year, hours/mileage) | Slow rightward pan, nose/front to tail/rear (Ken Burns) | Establish what it is and that it's available |
| 2 — Technology / Capability | 5s | Core capability differentiator (avionics suite, engine spec, drive system, feature tier) | Slow push-in zoom into the focal detail | Justify the premium; signal capability |
| 3 — Luxury Interior / Detail | 5s | Comfort/finish proof + price CTA | Slow upward pan from detail to context (seat cushion → headrest → window, or dash → roof) | Close the aspiration loop; drive action |

**Beat tone:** Cool, editorial, unhurried. No exclamation marks. No superlatives. Let the numbers and the visuals carry weight.

---

## 4. Visual Style Spec

**Aesthetic:** Cinematic luxury. Think high-end automotive magazine, not dealership flyer.

- **Color palette:** Near-black backgrounds for overlays (`rgba(0,0,0,0.55–0.60)`), white primary text (`#FFFFFF`), single brand accent for the CTA pill. Derive the accent from the product's livery or listing brand color (e.g., match aircraft tail stripe, car paint, brand logo). If no clear accent exists, use a deep red (`#C41230`) or deep navy (`#0A1628`) — both read premium.
- **Camera grammar:** Ken Burns only — slow, single-direction, deliberate. Never two axes at once. Never fast. Rule: motion completes no more than 20–30% of the frame width/height over 5 seconds. The motion should feel like a breath, not a scroll.
- **Shot length distribution:** Hard 5s per scene. No cuts within a scene. The edit rhythm is the three-scene join — clean cuts, no dissolves (dissolves soften impact; hard cuts feel editorial).
- **On-screen text policy:** Kinetic text overlays only. Zero voiceover. Zero lower-third tickers. Two overlay zones per scene maximum: one top-center identity line (headline font), one bottom-center spec pill (detail font). The CTA scene gets a colored pill background — all other scenes use semi-transparent dark pills.
- **Format:** 9:16 vertical, 1080×1920. Music at low volume (≤0.25) — present but never distracting.

---

## 5. Voice & Persona

There is no spoken voice. The "persona" is expressed typographically.

**Tone archetype: Calm-authoritative broker**
- Speaks in specs and facts, never adjectives of opinion ("exceptional", "stunning", "incredible" — banned)
- Uses industry-standard terminology (TTAF, SMOH, ADAS, LOA, etc.) — do not dumb down
- Lets numbers do the work: a terse spec strip like `[Total Time] / [Time Since Overhaul] / [Avionics Suite]` is more powerful than "low hours with modern avionics"

**Headline font:** Condensed, bold, sans-serif — Oswald or equivalent. Reads as authority and precision.  
**Spec/detail font:** Clean geometric sans — DM Sans, Inter, or equivalent. Reads as technical and trustworthy.  
**CTA font:** Match the headline font, bold, inside the accent-color pill.

**Sample line patterns (swap subjects freely):**
- Identity line: `[Year] [Make] [Model]` — centered, Oswald, headline size
- Spec strip: `[Key Spec 1] / [Key Spec 2] / [Key Spec 3]` — DM Sans, dark pill, bottom-center
- Capability line: `[Suite/System Name]` — Oswald, top-center
- Capability strip: `[Spec A] · [Spec B] · [Spec C]` — DM Sans pill
- Interior callout: `[Finish/Material] Interior · [Seat count/layout]` — DM Sans, top-center
- CTA pill: `$[Price] · [Contact / Link CTA]` — Oswald bold, accent-color background

---

## 6. CTA Mechanic

**Pattern: Price + Contact in a single accent-color pill, bottom-center, Scene 3 only**

- The CTA pill appears only on the final scene — never earlier (premature price reveal undercuts aspiration-building)
- Pill contains the listed price and the primary contact action (phone number, "DM to inquire", "Link in bio")
- Use the actual listed price verbatim — do not round or abbreviate unless the number is very long
- The accent color of the pill should match or derive from the product's visual identity (livery stripe, brand color, etc.)
- `mute_captions: true` on Scene 3 — the CTA pill IS the caption; auto-generated captions would conflict

**Soft CTA tone:** No imperatives ("Buy now!", "Call today!"). The pill is informational — the product sells itself.

---

## 7. Photo Selection Protocol

Since no stock footage is used, photo selection is the creative foundation. From the listing URL:

1. **Inspect all available photos** before selecting — register each as an asset and classify by angle/subject
2. **Scene 1 (Exterior):** Cleanest side-profile or 3/4-front shot on a clean background (ramp, lot, dock, street). Avoid photos with people, heavy shadows, or cluttered backgrounds.
3. **Scene 2 (Capability):** The most technically detailed photo — avionics panel, engine bay, tech interior, system display. Must read as "sophisticated" at a glance.
4. **Scene 3 (Luxury/Detail):** Highest-quality comfort/finish photo — premium seating, materials, craftsmanship detail. Should feel aspirational.

**Rule:** Never reuse a photo across scenes. If fewer than 3 distinct quality photos exist, do not attempt this pattern — the three-scene structure requires three genuinely different visual stories.

---

## 8. Music Direction

**Target:** Luxury ambient instrumental — orchestral or piano-led, no vocals, no electronic drops.
- Tempo: 55–70 BPM
- Duration: generate at 18s (provides head/tail room for a 15s video)
- Feel: "Private terminal lounge" — calm, aspirational, unhurried
- Mix volume in final assembly: 0.20–0.25 (audible on desktop/tablet; never overpowering)

---

## 9. Hard Rules / Do-Not-Regress

1. **No stock footage, no AI-generated exterior scenes.** Use only photos from the listing URL. This preserves authenticity and avoids misrepresentation of the actual product being sold.
2. **No voiceover.** All communication is via text overlays. The ad must communicate fully on muted autoplay.
3. **No adjectives of opinion in text overlays.** Only specs, model names, and factual callouts — a concrete avionics-suite or trim-level name, not "state-of-the-art avionics".
4. **Hard 15-second cap.** Three scenes × 5 seconds = 15s. Do not add a fourth scene. Do not extend scenes to accommodate more specs — edit the spec copy instead.
5. **CTA price pill only on Scene 3.** Never surface price in Scene 1 or Scene 2.
6. **`mute_captions: true` on Scene 3.** The CTA pill is the final visual anchor; auto-captions must not appear over it.
7. **Single Ken Burns axis per scene.** One direction of motion only. No zoom + pan combined. No fast motion.
8. **Derive accent color from the product, not from assumption.** Inspect the listing page for brand/livery colors before defaulting to a generic accent.
9. **Headline font is condensed bold; spec font is clean geometric sans.** Do not mix in serif or script fonts — they break the technical-precision persona.