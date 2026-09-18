# Operational gotchas (read before running)

These are the things that will waste a ~10-minute billed render if you get them wrong.

## 1. Attach media by URL-in-the-MESSAGE, not the `assets` param
Passing the source video (or logo) via `create_session`/`send_turn`'s `assets=[{url,type}]`
param silently drops it — the turn records `assets: []` and the pipeline dies with
`Pipeline error: KeyError: 'id'` (0 credits, but a wasted round trip). Instead, put each URL
on its own line at the TOP of the `message` text and refer to it ("Source video:", "End-card
image (STS logo) to use..."). The agent registers them (`input:video-1`, `input:image-...`).

## 2. Uploading a local file to Creatify (presigned → PUT → cdn_url)
The agent needs a URL, so local files must be uploaded first:
1. `upload_file(filename=..., content_type="video/mp4")` with NO `base64_content` → returns
   `{upload_url, cdn_url, ...}`. (Omit base64 for anything but tiny blobs; video/logo are too big.)
2. Stream the bytes straight to S3 with curl — nothing routes through the model:
   ```bash
   curl -sS -T "<local_file>" -H "Content-Type: <content_type>" "<upload_url>" \
     -w "http=%{http_code}\n"
   ```
   `http=200` = success (empty body). The `cdn_url` is dead until this PUT completes.
3. Use `cdn_url` in the brief. It's a permanent CDN link; a quick `curl -I "<cdn_url>"` should
   return `200` + the right content-type before you launch a render.
The presigned `upload_url` carries short-lived AWS credentials and expires (~1h) — never store it.

## 3. Transcode oversized / 4K sources before uploading
A 4K, multi-minute source can be ~1-2 GB — a slow, flaky upload for no quality gain (the final
is 1080x1920). Scale to 1920 tall so the 9:16 center-crop stays native 1080x1920, and re-encode:
```bash
ffmpeg -y -i "<in>" -vf "scale=-2:1920" -c:v h264_videotoolbox -b:v 12M \
  -c:a aac -b:a 192k -movflags +faststart "<out>"
```
(`h264_videotoolbox` is the fast Apple-silicon encoder; use `-c:v libx264 -crf 21` elsewhere.)
Rule of thumb: transcode if the file is >~500 MB or 4K. This drops ~1.7 GB → ~290 MB.

## 4. Turns can HANG — how to recover
A turn usually finishes in ~8-12 min. Occasionally one sits in `current_turn.status: "running"`
for 20-30+ min with no new render asset and **frozen `credits_used`** — that's a hang, not
slowness. Heavier edits (after-the-fact subtitle-text cleanup) seem more prone to it.
- Verify progress with ONE `creative_get_session` a few minutes in (do NOT poll in a tight loop;
  each call spawns another live preview card and the card self-updates anyway). Healthy = a new
  `remix-*` asset appears and/or credits tick up.
- If hung: `creative_stop_turn(session_id)`. It returns `stopping: true`, but the server may keep
  reporting `"running"` for many minutes; `send_turn` will error `in_flight_turn_conflict` until
  it releases. Wait it out, then re-send.
- If it stays stuck: **start a FRESH session** with the full opening brief (this is what worked —
  it also sidesteps the flaky after-the-fact edit by generating clean subtitles from the start).
  A clean single-brief run is often faster and cheaper than a chain of refinement turns anyway.

## 5. Reading a session / fetching the result
`creative_get_session(session_id)` returns `turns`, `assets`, and `credits_used`. The finished
video is the `final:video` asset and/or the `headline.url` (the newest render wins — after a
refinement the `headline` points to the new render even if an older `final:video` lingers).
Note: `get_session` only sees sessions in the MCP connection's CURRENT brand space; a session
created in the browser or another space raises "not found in your workspace".

## 6. Transitions: confirm the duration actually applied
Early builds have been observed to zero-out the crossfade duration ("the mix length kept getting
zeroed"). After asking for a specific crossfade, VERIFY it in the output (a real dissolve across
frames), and re-send if it came back as a hard cut.

## 7. What is and isn't "generated" (for honest originality answers)
- **Footage: 100% the source.** Every clip is cut from the uploaded video and reframed to 9:16 by
  center-crop — no AI b-roll, no invented scenes, no outpainting/fill.
- **Music: AI-generated** by Creatify ("Generating music" step) — NOT from the source. If the user
  needs zero generated elements, ask Creatify to drop the music (his voice only) or leave room for a
  licensed track.
- **End card: a composited graphic** (the real STS logo + the exact text) — not filmed footage, but
  not AI-invented imagery either.
- **Subtitles: text overlays** transcribed from the speech.

## 8. QA the output with frames, not vibes
Download `final:video`, then:
```bash
ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1 <mp4>
```
Confirm 1080x1920 and the target duration. Extract frames across the clip (`ffmpeg -ss <t> -i <mp4>
-frames:v 1 <png>`) and read them to verify: opens on the speaker; subtitles are clean (no stutter
fragments, correct capitalization); the close is a complete sentence; the end-card text is
LETTER-PERFECT (course + instructor). The two names on the card are the highest-risk items —
always eyeball them.
