# STS short-video cut (Creatify)

Turn one long STS video into a short vertical share clip. The heavy lifting is done by the
**Creatify Creative Agent** over its MCP; you drive it, QA it, and hand back a finished 9:16 MP4
with a branded end card.

**Connection note (important for reuse):** this skill uses whatever **Creatify MCP connection is
already set up** in the person's Claude (the `mcp__creatify__*` tools) — it authenticates as
*their* Creatify account via *their* OAuth login and carries no credentials of its own. It also
uses the **STS LMS MCP** (`sts-prod`) to look up courses. If either isn't connected, its tools
won't be available — tell the user to connect it. Per STS policy, only run the Creatify MCP for STS.

**Inputs:** a full-length STS video (a URL or a local file path). Everything else is resolved for you.

---

## Step 0 — Resolve the course + instructor (never guess)

The end card needs two facts: the **course name** and the **instructor's FIRST name**. Get them
from an authoritative source, in this order, and if you can't pin them confidently, **STOP and ask
the human** — do not guess a name or read a face.

1. **Source came from the STS LMS** (a lesson/course id or LMS link): the course + instructor are
   already known via `sts-prod` `get-lessons-tool` / `get-video-info-tool`.
2. **Loose file/link:** derive the topic from the filename and a couple of frames (extract with
   ffmpeg; also confirms it's STS footage via the on-screen watermark), then look it up:
   `sts-prod` `get-courses-tool` (search="<topic>") or `search-content-tool`. A single unambiguous
   match gives the authoritative course title + instructor. Example: searching "Back to Eden" returns
   one course, "Back to Eden Gardening" by "Paul Gautschi" → COURSE="Back to Eden Gardening",
   INSTRUCTOR="Paul".
3. **Ambiguous or no confident match** → ask the human for the course name + instructor first name.

This is the zero-fabrication rule: a wrong name on a public end card is far worse than a quick question.

---

## Step 1 — Prep the source

If the source is a **local file** and/or **4K / larger than ~500 MB**, transcode it first so the
upload is fast and reliable (no quality loss on the 1080x1920 output). See
`references/gotchas.md` §3 for the exact ffmpeg command (scale to 1920 tall, H.264, faststart).
A remote URL that's already a reasonable size can be used as-is.

## Step 2 — Get the media into Creatify

The agent needs URLs. Upload the (transcoded) source video and the **bundled STS logo**
(`assets/sts-logo-vertical-clean.png`) via `upload_file` (presigned) + a `curl` PUT, then use the
returned `cdn_url`s. Full flow + the KeyError trap in `references/gotchas.md` §1-2. The one rule
you must not forget: **attach media by putting the URLs in the message TEXT, not the `assets`
param** (the param silently drops them and the render fails).

## Step 3 — Open the session with the full brief

Call `creative_create_session` (mode defaults to `lite`, which is correct — the reference session
used lite). Use the proven opening brief in `references/creatify-brief.md`, with the two URLs as the
first lines and the `{...}` slots filled (SPEAKER, COURSE, INSTRUCTOR, faith-capitalization if the
instructor is faith-forward, etc.). Front-loading the whole recipe — complete thoughts, clean
subtitles generated clean from the start, 9:16, ~1s crossfades, light music, and the end card —
gets you a near-final clip in ONE render instead of a long chain of edits.

## Step 4 — Let it render (~10 min)

The result renders one live, self-updating preview card. Tell the user it's generating (~10 min)
and don't poll in a loop. Do at most a single `creative_get_session` a few minutes in to confirm
it's progressing (a new `remix-*` asset appears / credits tick up). If it hangs (stuck "running",
frozen credits, 20+ min), follow the recovery in `references/gotchas.md` §4 — stop, wait for
release, re-send; if truly stuck, start a fresh session with the same full brief.

## Step 5 — QA the output

Download `final:video` (or `headline.url`, newest wins) and check it against the brief with ffprobe
+ extracted frames — see `references/gotchas.md` §8. Verify: 1080x1920; opens on the speaker; clean
subtitles (no stutter fragments, correct He/His/The Creator capitalization for faith content); the
close is a COMPLETE sentence; and the **end-card text is letter-perfect** (course + instructor are
the highest-risk items — always read them).

## Step 6 — Refine

Send small, explicit `creative_send_turn` follow-ups for anything QA or the user flags, using the
lever list in `references/creatify-brief.md`. When you only want one change, say "keep everything
else exactly as it is" so the agent doesn't regress the good parts.

Deliver the finished MP4 to the user (download it locally and link it); note the total `credits_used`.

---

## The end card

By default **let Creatify build it** — it's in the opening brief (black background + the uploaded
logo + the exact templated line). Creatify renders real text, so the card comes out crisp and
on-brand; you just QA that the two names are spelled right. The line is always:

> Learn More About **{COURSE}** in **{INSTRUCTOR}**'s STS Class. Details On Our Website.

**Fallback — `scripts/render_end_card.py`:** if Creatify ever garbles the text or you want a
guaranteed pixel-perfect card, render it locally (uses the bundled logo + IM Fell Great Primer
serif), then upload that PNG as the end-card image instead:

```bash
python3 scripts/render_end_card.py --course "Back to Eden Gardening" --instructor "Paul"
```

It auto-centers logo + text on black at 9:16 and wraps any course-name length cleanly.

---

## Reference files

- `references/creatify-brief.md` — the opening-brief template (fill the slots) + the refinement
  lever list + end-card line + length math. Read before Step 3.
- `references/gotchas.md` — upload flow, the URL-in-message attach trap, transcode command, hang
  recovery, session/result reading, transition verification, the originality breakdown, and the QA
  method. Read before Steps 1-2 and 4-5.

## Assets

- `assets/sts-logo-vertical-clean.png` — the STS vertical lockup (gold wreath + white stacked
  wordmark, transparent, artifact-free). Upload this as the end-card logo.
- `assets/fonts/IMFellGreatPrimer-Regular.ttf` — STS's heading serif, for the render fallback.