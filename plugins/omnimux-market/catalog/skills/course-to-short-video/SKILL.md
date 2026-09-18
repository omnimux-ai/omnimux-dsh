# Course To Short Video (AI Short-Video Cut)

Turn long course or lesson videos into high-engagement 9:16 vertical clips for social sharing. It extracts the strongest hook sections, cuts on complete thoughts, adds clean word-by-word subtitles, smooth crossfades, and a light music bed, then appends a branded end card.

## Capabilities & Workflow
1. **Highlight Extraction**: Automatically identifies core knowledge points, compelling anecdotes, and high-energy segments.
2. **Intelligent Cutting**: Cuts along sentence boundaries and pauses, ensuring zero awkward stuttering or half-sentences.
3. **9:16 Formatting**: Re-frames horizontal footage into vertical mobile video with focal tracking on the speaker.
4. **Captions & Audio**: Burns in dynamic word-by-word subtitles and mixes subtle ambient background audio.
5. **Brand End Card**: Generates a high-contrast end card featuring the course title, instructor, and call-to-action.

## Inputs
- **Source Video**: A local video file path (.mp4, .mov) or public video URL.
- **Course & Instructor**: Course title and speaker name for the end card.

## Pipeline Steps
- **Step 1 — Source Prep & Transcoding**: Scale to 1080x1920, faststart MP4.
- **Step 2 — Semantic Analysis & Segment Selection**: Pick 20-45s high-value continuous thoughts.
- **Step 3 — Video Generation & Caption Burning**: Render 9:16 vertical cut with animated captions.
- **Step 4 — End Card Assembly**: Composite branded outro card.
- **Step 5 — QA & Delivery**: Verify speech sync, caption spelling, and resolution.
