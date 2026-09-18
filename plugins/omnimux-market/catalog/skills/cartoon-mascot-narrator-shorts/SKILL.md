# Cartoon Mascot Narrator Shorts

A 30-second (±5s) YouTube Shorts ad built around a single studio-quality 3D-animated animal mascot who narrates directly to camera with warmth and authority. The hook hits in the first 2 seconds via an on-screen text overlay; the body delivers one clear value proposition; the CTA lands as a URL pill in the final scene.

---

## 1. When to Use This Pattern

**Strong fits:**
- Government / nonprofit programs with a limited free-offer or deadline
- Nature, outdoors, parks, wildlife brands
- Family-friendly or youth-adjacent products
- Any brief where a human spokesperson feels too corporate or too UGC-rough
- Brands that want a *mascot identity* — the character becomes the brand mascot, reusable across future ads

**Poor fits:**
- Brands that require real human testimonial or social-proof-driven UGC feel
- Products where lipsync/realism is mandatory
- Ads longer than ~45 seconds (mascot + no-music gets thin)
- B2B SaaS or high-abstraction services with no physical/emotional anchor

---

## 2. Hook & Opening

**Structural move: Deadline urgency + benefit flash**

The opening 2 seconds show the mascot on screen while a bold text overlay names the offer and the deadline. The mascot says nothing in the first beat — the text lands first, then the narration confirms it.

**Invented generic example:**
```
Hook overlay text: "FREE 30-Day Trial\n(Ends Friday!)"
Opening spoken line: "Hey there — did you know you can try the whole thing free for 30 days right now?"
```

**Swap rule:** Replace the offer name and deadline date. Keep the two-part structure: (1) bold claim in overlay text, (2) mascot voice confirms/expands in first sentence. Never bury the offer — it must appear on screen *and* be spoken within the first 5 seconds.

---

## 3. Narrative Arc

**Arc name: Offer → Eligibility → How → Urgency → CTA**

| Beat | Target timing | Visual | Voice/tone |
|------|--------------|--------|------------|
| Hook overlay + mascot intro | 0–3s | Hook text overlay on mascot face | Warm, immediate — "Hey there" energy |
| Offer statement | 3–8s | Mascot gesturing/expressive | Friendly surprise — "did you know…?" |
| Who qualifies / what they get | 8–16s | Mascot continues, scene 1 | Informative, slightly conspiratorial: "here's the thing…" |
| How to claim | 16–22s | Transition to scene 2 | Step-by-step, calm and clear |
| Urgency close | 22–27s | Scene 2 with URL pill appearing | Warmer urgency — not fear, just FOMO |
| CTA | 27–30s | URL pill prominent | Soft spoken sign-off + URL on screen |

Total runtime: ~30 seconds. Split the script into two ~15s halves at the natural midpoint (usually after "who qualifies" beat) to stay within per-scene duration limits.

---

## 4. Visual Style Spec

- **Aesthetic:** Studio-quality 3D-animated cartoon — polished, warm, high-saturation. Not realistic. Not hand-drawn sketch. Not 2D flat.
- **Background:** Thematically matched to the brand/product. For nature/parks brands: forest, mountain, park setting with dappled golden light. For other products: choose a background that anchors the product's world — a cozy kitchen for food, a bright gym for fitness, etc.
- **Lighting:** Warm golden-hour or soft studio light. Avoid cold/clinical color temperatures.
- **Camera grammar:** Head-and-shoulders locked-off framing on mascot. No handheld shake. No whip pans. Expressive *mascot motion* (nodding, eyebrow raises, gesturing) replaces camera movement.
- **Shot length:** Two scenes of ~15s each. No hard cuts within a scene — motion carries continuity.
- **On-screen text:**
  - Hook overlay: `block` style, positioned top of frame, appears at 0s on scene 1
  - Captions: clean-bold preset, Montserrat font, word-by-word appear mode — always on
  - URL pill: appears on scene 2, bottom third, contains the destination URL
- **Music:** OFF. Narration-only. Keeps the mascot voice as the sole audio anchor and keeps credit costs low.

---

## 5. Voice & Persona

**Persona archetype:** Friendly expert neighbor — someone who *knows* the system and is rooting for you to benefit from it. Not a hype voice. Not a corporate announcer. Feels like advice from a knowledgeable friend.

**Tone:** Warm, conversational, mildly enthusiastic. Pacing: natural speech rhythm with slight emphasis on key facts (offer name, deadline, URL).

**Voice spec (hard):**
- Gender: male
- Age: middle-aged
- Accent: American English — warm, neutral, no regional affectation
- **Do NOT accept:** Eastern European accent, British accent, dramatically theatrical tone, overly formal delivery

**Voice-mismatch prevention clause:**
> Always verify the generated voice sounds American and friendly before committing to it. If the first voice sounds wrong in accent or tone, regenerate with `voice_only=true` and test with a short TTS sample before proceeding. This is a hard gate — do not proceed with a mismatched voice.

**Sample phrasing rhythms (invented, generic):**
- "Hey there — did you know…?"
- "Here's the deal: [benefit]."
- "All you need to do is [simple action]."
- "Don't wait — [deadline]."
- "Head to [URL] and [verb]."

---

## 6. CTA Mechanic

**Mechanic: URL pill + spoken sign-off**

The CTA is purely transactional — no comment-bait, no "share this," no social follow ask. The viewer gets exactly one action: go to the URL.

- URL pill appears on-screen in the final scene (scene 2), bottom third
- The final spoken line names the URL and adds a soft urgency note
- No on-screen card title needed — the URL pill is self-explanatory

**Invented generic example:**
> "Head to example.com/offer before Friday and start your sign-up — it takes less than five minutes."

**Swap rule:** Replace the URL and deadline. Keep the structure: URL + time-to-complete or ease-of-action reassurance. The ease note ("takes less than five minutes," "it's free to sign up") reduces friction at the critical decision point.

---

## 7. Mascot Construction

The mascot is a **fixed visual identity asset** — it should look identical across every ad in this series. When constructing the persona for a new run, use the following prompts as templates, swapping only the bracketed elements for your own use case.

**Persona image prompt (generic example — adapt the animal, outfit, and setting):**
```
A friendly anthropomorphic cartoon [animal] with expressive warm eyes, a broad rounded muzzle, [fur/coat description], and a wide cheerful smile showing a hint of teeth. He has a stocky approachable build with large rounded ears and a warm welcoming expression — think studio-quality stylized 3D cartoon, not realistic. He wears [brand-appropriate clothing/accessory, e.g. a uniform shirt with a small chest badge]. His face is front-facing, head-and-shoulders framing, with a soft [thematically matched background] visible behind him, warm dappled golden light filtering through. High model facial features, symmetrical features, well-proportioned figure, natural [fur/coat] texture.
```

**Style direction prompt:**
```
Studio-quality stylized 3D cartoon stylization, warm golden-hour lighting, shallow depth of field on the background, friendly and inviting mood, vibrant saturated colors, clean polished animation-studio aesthetic.
```

**For a different mascot:** Preserve the structural elements — front-facing head-and-shoulders, studio-quality 3D cartoon stylization, warm expressive eyes, brand-appropriate clothing/accessory, thematically matched background. Swap the animal, outfit, and setting.

---

## 8. Hard Rules / Do-Not-Regress

These are confirmed constraints for this pattern. Treat each as a non-negotiable rule:

1. **No lipsync.** Cartoon faces are not compatible with lipsync engines. Use expressive motion only. If lipsync is requested, decline and explain why — don't attempt it and produce broken output.
2. **Voice must be American male, middle-aged, warm.** Regenerate until confirmed. This is the voice-mismatch prevention clause. Label it as such internally so future runs recognize the pattern.
3. **Output dimensions are 1080×1920 (9:16) — YouTube Shorts spec.** Do not output landscape or square.
4. **Music off.** Do not add background music unless the user explicitly overrides. Narration-only is a deliberate choice that keeps the credit cost low and the voice front-and-center.
5. **Split script at ~15s per scene.** Do not attempt a single long scene. Two scenes of roughly equal length is the correct structure.
6. **Reuse the same persona/mascot image for both scenes.** Do not regenerate a new persona image for scene 2 — pass the same reference image to both `generate_scene_video` calls to maintain visual consistency.
7. **Hook text appears on scene 1 only.** Do not repeat the hook overlay on scene 2.
8. **URL pill on scene 2 only.** Do not put the URL pill on scene 1 — it distracts from the hook beat.
9. **Caption style is always clean-bold / Montserrat / word-by-word.** Do not use a different preset without explicit user override.
10. **Subject is always swappable; style, voice, mascot design, and CTA mechanic are locked.** New runs change the product/offer/URL/script. They do not change the visual aesthetic, voice spec, or caption style.