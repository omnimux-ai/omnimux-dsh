# Creatify Creative Agent — brief + refinement patterns

The whole cut is produced by the Creatify **Creative Agent** (`creative_create_session`
to open, `creative_send_turn` to refine). It transcribes the source, picks story beats on
clean line boundaries, and assembles the clip with real-text subtitles, a music bed, and
transitions. It renders crisp REAL text overlays (not diffused text), which is why it can
place a letter-perfect end card and clean captions.

Front-load the whole recipe into the OPENING brief so you get a near-final clip in one pass
instead of many refinement turns. Below is the proven opening brief. Fill the `{...}` slots.

---

## Opening brief (paste as the `message`, with the two URLs as the first lines)

```
Source video:
{SOURCE_VIDEO_URL}

End-card image (STS logo) to use at the very end:
{LOGO_URL}

Take this video and cut it into a short vertical clip for sharing organically on {PLATFORM}.

CONTENT & STRUCTURE:
- Use ONLY the original footage and its native audio. Do NOT generate any AI b-roll, AI voice, or extra scenes.
- OPEN on the shot of {SPEAKER} speaking to camera. Start directly on them, not on an aerial/establishing shot.
- Build ONE clean narrative that makes sense start to finish, using their strongest COMPLETE thoughts{THEME_HINT}.
- Keep complete thoughts only: never cut them off mid-sentence and don't make it choppy. Fewer scenes with
  full, finished sentences beats many quick cuts. END the spoken portion on a COMPLETE sentence with no
  trailing filler (do not end on "you" or "you know").
- Shorter is fine: aim for a tight ~20 to 25 seconds of talk plus the end card. Do not stretch to hit a length.

SUBTITLES:
- Add clean, readable word-by-word subtitles.
- The subtitles must read SMOOTHLY even where the speaker stutters or restarts: show the clean intended words,
  NOT the stutter. Omit false starts, cut-off word fragments (like "d-"), and accidental repeated words.
  Keep the natural delivery in the AUDIO; only the subtitle TEXT is cleaned.
- {FAITH_CAPS}

FORMAT:
- 9:16 vertical (1080x1920).
- Smooth crossfade transitions (about 1 second) between any cuts.
- A light, soft acoustic music bed under the voice.

END CARD (final scene):
- Solid black background.
- The STS logo image linked above, centered in the upper portion.
- Below the logo, this exact text, centered, in a clean white serif on a few lines:
  "Learn More About {COURSE} in {INSTRUCTOR}'s STS Class. Details On Our Website."
- Use the provided logo image and this exact wording. Do not generate a different logo or reword the text.
- Hold the end card about 3 seconds, with a ~1 second crossfade into it.

Give me the finished clip.
```

**Slot notes**
- `{PLATFORM}` — usually "Facebook"; adjust for Reels/TikTok/Shorts.
- `{SPEAKER}` — the on-camera person (often the course instructor). Describe the shot if useful
  ("the folding camp chair", "at their desk") so it opens on the right take.
- `{THEME_HINT}` — optional one-clause through-line, e.g. " (the through-line is how the nature God
  designed reveals His incredible mindset)". Keep it light; let the agent pick the actual beats.
- `{FAITH_CAPS}` — for STS's faith-forward instructors, add: `Capitalize "He", "His", "Him", and
  "The Creator" wherever they refer to God.` Omit for non-faith content.
- `{COURSE}` / `{INSTRUCTOR}` — resolved from the STS LMS (see SKILL.md). Instructor is the FIRST name.

---

## End-card line (the template)

> Learn More About **{COURSE}** in **{INSTRUCTOR}**'s STS Class. Details On Our Website.

Examples: `Dehydrating` + `Darcy` · `Raising Backyard Chickens` + `Harvey` · `Back to Eden Gardening` + `Paul`.
The two inputs come from the STS LMS (course title + instructor first name), never invented.

---

## Refinement turns (`creative_send_turn`) — how to steer

Send small, explicit, one-topic-per-line follow-ups. When you only want a tweak, say
"keep everything else exactly as it is" so the agent doesn't regress the good parts. Levers
that worked:

- **Aspect / crop**: "Crop it to 9:16" (center-crop of the 16:9 source; no AI outpaint).
- **Drop / swap a beat**: "Take out the [X] segment." / "Use a different middle beat."
- **Scene count / choppiness**: "Fewer scenes, complete thoughts, don't bounce around." This was the
  single biggest quality lever — 2 full-sentence beats beat 5 quick cuts.
- **Complete the close**: "End on a complete sentence; don't cut off on '...{trailing words}'."
- **Transitions**: "Smoother transitions" → "1-second crossfade" → "2-second crossfade" →
  "fade to white" → "hard cut". Name the type AND the duration.
- **Subtitle cleanup**: "Capitalize The Creator." / "Make the subtitle read '{clean}' not '{stutter}'."
- **End card timing**: "Make the end card about 3 seconds." / "Fill to 30 seconds." (Crossfade overlaps
  the hold, so total ≈ talk + hold; back-solve if you need an exact total.)

## Length math for the end card
If you want a hard total (e.g. "≤30s"), remember the crossfade INTO the card overlaps the card's hold.
A ~3s crossfade + ~2.35s hold lands ~30.0s from a ~27.7s talk. If the user is fine with a shorter clip
(often the cleaner choice), just say "~3s end card, shorter total is fine" and don't pad.
