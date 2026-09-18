# UGC Diaspora Direct-Address Hook

A warm, peer-recommending UGC ad pattern for diaspora health/beauty/wellness products. The creative core: a culturally resonant persona in a recognisable landmark setting speaks *directly to her community* as a friend who discovered something good — not as a brand spokesperson. Benefits are revealed as genuine personal discovery, promo feels like a hot tip between friends, CTA is intimate (inbox me / DM me).

---

## 1. When to use this pattern

**Suits:**
- Health, beauty, wellness, or supplement products sold to diaspora or expat communities
- Platforms: TikTok, Instagram Reels, Facebook Reels (9:16, 45–75 s)
- Audiences that share a strong cultural/religious identity and respond to peer-trust signals
- Bilingual markets where the ad language differs from the host country's dominant language
- Products with a concrete functional benefit that can be counted on fingers (3–5 bullet points)

**Does not suit:**
- Luxury or aspirational positioning (this is peer/friend energy, not aspirational)
- Broad mainstream audiences with no shared cultural anchor
- B2B or high-consideration purchase categories
- Audiences that distrust UGC aesthetics (e.g. some premium skincare demographics)

---

## 2. Hook & opening (0–8 s)

**Structural move — Community inclusion call-out**

Open with a geo/identity tag that makes the target viewer feel instantly seen, followed by a problem-or-curiosity tease. The persona speaks directly to camera, outdoors, with an identifiable local landmark softly bokeh'd in the background.

**Invented generic example (swap product/place/language, keep structure):**
> *"Hey, everyone back home living in [city]! Did you know there's a tea that helps you sleep through the night without feeling groggy in the morning?"*
> (delivered in the audience's native language, peer-to-peer tone)

**Swap rule:** Replace city/country tag, replace category problem. Keep the "Hey, [community] in [location]! Did you know yet…" cadence or its native-language equivalent. The landmark backdrop is swappable but *must be immediately recognisable* to the community.

**No product on screen during hook.** Persona only. Energy is high, direct eye contact, slight lean-in.

---

## 3. Narrative arc

| Beat | Duration | Shape |
|---|---|---|
| **Hook** — identity call-out + curiosity tease | 7–9 s | High energy, no product |
| **Product intro** — persona holds/shows product, names it | 11–13 s | Warm discovery tone |
| **Benefits** — counts on fingers, sequential badge overlays | 12–14 s | Calm-authoritative, tactile |
| **Promo** — holds promo flyer or card, announces deal with urgency | 14–18 s | Excited, conspiratorial tip |
| **CTA** — warm soft close, inbox/DM mechanic | 9–12 s | Warm, intimate |

**Total target: 55–65 s.** The arc is **discovery → social proof → deal → access**.

**Voice shape:** Starts excited (hook), settles into calm authority (benefits), spikes back up on promo reveal, lands softly on CTA.

---

## 4. Visual style spec

- **Aesthetic:** Handheld UGC — not produced. No studio lighting, no obvious ring lights, no heavy LUTs.
- **Lens simulation:** 50 mm equivalent, f/2.8 natural bokeh. Landmark soft in background. Face sharp.
- **Light:** Warm golden afternoon natural light on skin. No overexposed backgrounds.
- **Color:** Warm, skin-toned palette. No cold grades. On-screen UI uses warm colors (brown/gold for product badges, green for benefit ticks, yellow/red for promo urgency, purple for CTA intimacy).
- **Camera grammar:** Slight handheld drift acceptable. No aggressive shaking. Subtle push-in during benefit beat acceptable.
- **Shot length distribution:** Hook = single continuous shot. Product beat = 1–2 cuts. Benefits = hold 3–5 s per badge. Promo = 1–2 cuts. CTA = continuous.
- **On-screen text policy:**
  - **Hook:** Thin pill overlay near top of frame (geo/identity reinforcement), fades at ~5 s
  - **Product beat:** Two-line badge lower-center: product name pill + flavour/format subtitle
  - **Benefits beat:** Sequential animated badge overlays (upSwipe-in), one per benefit, ~4 s each — green tick + benefit text
  - **Promo beat:** Three-layer build — big promo pill (top, bounce-in), price pill (lower-center), urgency text (bottom)
  - **CTA beat:** Single colored pill (bottom-center, bounce-in), mute_captions=true so CTA pill is the only text on screen
- **Caption preset:** `outlined-text`, Poppins font, `word` appear mode on all beats except CTA.

---

## 5. Voice & persona

**Persona archetype:** Warm peer / knowledgeable friend. She's tried it, it worked, she's sharing the tip.

**Tone:** Colloquial, intimate, lightly conspiratorial ("psst, you won't believe this…"). Not clinical. Not salesy. Not hype-bro.

**Pacing:** ~2.5 words/second target. Max 3.0 w/s. Min 1.5 w/s. Calculate word count ÷ scene duration before finalising any scene script. Adjust scene durations to fit natural speech rather than forcing the voice to rush.

**Persona appearance anchors:**
- Culturally appropriate, audience-matched styling — choose attire and grooming that read as "one of us" to the target community
- Clean natural makeup, warm complexion
- Casual, relatable outfit consistent with the community's everyday dress
- Outdoors in a recognisable host-country landmark setting

**Sample-line phrasing style (deliver in the audience's native language):**
- Hook: "Hey, [community] in [place]! Did you know yet…"
- Product intro: "This is [product name] — [one-line benefit]."
- Benefit count: "First… [benefit]. Second… [benefit]. Third… [benefit]."
- Promo: "What I love even more — there's a deal right now! Buy [X], get [Y] free!"
- CTA: "If you want to ask me anything, just DM me, okay? 💜"

---

## 6. CTA mechanic

**Mechanic: Inbox/DM soft close**

The CTA is intimate, not broadcast. It invites a personal conversation, not a click-through. This is the correct mechanic for diaspora communities where trust is peer-based and purchase decisions happen via DM.

- **Spoken:** Warm sign-off, invites inbox/DM by name ("just DM me") with a term of endearment
- **On-screen:** Single colored pill, bottom-center frame, bounce-in animation, starts ~4 s into CTA scene
  - Example: `💜 DM Me Now!`
- **Color signal:** Purple = intimate/personal. Use consistently for CTA pill.
- **No link-in-bio call-out during this beat.** The pill *is* the CTA. Do not layer additional text.
- `mute_captions=true` on CTA scene so the pill stands alone.

---

## 7. Hard rules / do-not-regress

These are locked-in technical constraints for this pattern. Treat each as a non-negotiable constraint.

### Language & pronunciation
1. **Avoid words that are shared with or confusable with a closely-related language.** When the target language has a sibling language (very common for diaspora audiences), certain ambiguous words push TTS/lipsync language-detection into the wrong language mode. Build a per-language safe-word list and substitute unambiguous native equivalents before generating audio.
2. **Write numbers as words** in dialogue scripts. e.g. `598` → spelled out in words in the target language. Do not rely on TTS to interpret numerals.
3. **Acronyms and bodily/medical terms meant to be spelled out must use hyphen-letter notation in script.** e.g. `ABC` → `A-B-C` in the written dialogue so TTS pronounces each letter distinctly.

### Visual / production
4. **No studio lighting, no ring-light reflections, no heavy filters.** UGC look must be preserved even if it means lower visual polish.
5. **The landmark background must be recognisable but soft (bokeh).** Never sharp/distracting. Never a generic outdoor scene.
6. **Scene durations must be adjusted to fit word counts at 2.5 w/s**, not padded or compressed. If the user provides timings that don't fit the script, recalculate and present adjusted durations before production.

### Assembly
7. **All Seedance (or similar AI-video) outputs must be re-encoded with ffmpeg `-movflags +faststart` before assembly.** Raw outputs often have the moov atom at end-of-file, causing playback failures in Remotion/Lambda. The re-encode step is mandatory, not optional.
   - Re-encode command: `ffmpeg -y -i "<scene_url>" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k -movflags +faststart -pix_fmt yuv420p /tmp/outputs/sX_enc.mp4`
   - Register re-encoded file as a new asset, use that asset ID in assemble_video.
   - Set `audio_url=null` for all scenes in assemble_video (audio is embedded in re-encoded file).
8. **Background music volume: 0.12.** Voice is dominant; music is texture only.

### Persona
9. **Keep the persona's signature styling anchors consistent across every scene and persona prompt.** Pick one or two distinctive wardrobe/grooming details for the chosen community and repeat them in every persona prompt for this pattern so the character reads as the same person throughout.
10. **Match the persona's dress and modesty conventions to the target community's norms** and hold them as a hard visual rule, consistent across all scenes.

---

## References

- [Native-Language Safe Word Guidance](references/id-safe-words.md) — how to avoid sibling-language confusion in TTS/lipsync
- [Overlay Spec Quick Reference](references/overlay-spec.md) — per-scene text overlay parameters