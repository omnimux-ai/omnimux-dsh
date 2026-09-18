# Audio Generation Skill

Everything audio in the orchestrator: turning text into a spoken voiceover, cloning a
voice, pulling audio out of a video and transcribing it, dubbing a video into another
language, and laying a music bed. Read this before any audio task so you pick the right
tool and chain them correctly.

There is no single "dub" or "voice-swap" tool — those are **chains** of the tools below.

## Tools at a glance

| Task | Tool |
|---|---|
| Text → spoken voiceover | `generate_tts` |
| Clone a voice from a sample → `voice_id` | `create_voice` |
| Pull the audio track out of a video (.mp3) | `split_audio` |
| Transcribe speech → text + language + word timings | `transcribe_audio` |
| Generate a background-music bed | `music_generate` |

Always register each output under a clear `output_asset_id` (e.g. `scene3:voiceover`,
`scene3:audio`, `scene3:words`) and forward the `scene_number` so the assembler can bind
the right audio and captions to the right scene.

## Text-to-speech — `generate_tts`

ElevenLabs. Needs `text`, a `voice_id` (from the persona data, or from `create_voice`),
and an `output_asset_id`.

- **Model**: defaults to `eleven_v3`, which interprets inline delivery tags. Pass
  `eleven_multilingual_v2` for the faster, tag-less model.
- **Inline delivery tags** (`eleven_v3` only) steer emotion, pacing, and accent — e.g.
  `[whispers]`, `[laughs]`, `[excited]`, `[sighs]`, `[sarcastic]`, or accent cues like
  `[French accent]`. They are interpreted, not spoken, and are stripped from captions, so
  use them freely to shape the read.
- Keep each line within its scene's duration — write to the time you have, not past it.

## Voice cloning — `create_voice`

Clone a voice from a 5–30 s clip of clean, single-speaker audio or video
(`.mp3/.wav/.mp4/.mov`, minimal background noise). Returns a `voice_id` you then pass to
`generate_tts` (or to the video tools' voice parameters).

Use it to keep one consistent narrator across scenes, or to preserve the original
speaker's voice when dubbing into another language.

## Audio extraction + transcription — `split_audio`, `transcribe_audio`

- **`split_audio`** — video → standalone `.mp3`. Use an asset ID or URL for the source.
- **`transcribe_audio`** — audio → transcribed text, detected language, and a
  `words_file` of word-level timestamps. Language is auto-detected; pass `language` to
  force it; pass `script_text` (the original script) to auto-correct STT against it —
  fixes brand-name misspellings and drops hallucinated words. The `words_file` is what
  drives word-by-word captions in assembly.

## Dubbing / translating a video into another language

No single tool does this — run the chain:

1. **`split_audio`** the source video → audio.
2. **`transcribe_audio`** → source text + detected source language (+ word timing).
3. **Translate** the text into the target language yourself.
4. *(Optional, to keep the original speaker's voice)* **`create_voice`** from the source
   audio → `voice_id`.
5. **`generate_tts`** with the translated text and a voice that fits the target language
   (`eleven_v3` and `eleven_multilingual_v2` both speak many languages).
6. Hand the new audio to assembly as that scene's voiceover track.

This **replaces the spoken track**. Re-matching the on-screen mouth to the new language
(lip-sync) is **not** an agent-callable step — so treat dubbing here as voice-track
replacement, best for voiceover-over-footage / B-roll or anywhere exact lip-sync to a
visible talking head isn't required. If the task needs the mouth to match the new voice,
say so and route it to the lip-sync (link2vid) pipeline rather than this skill.

## Swapping the voice in an existing video

- You **can** generate a replacement voice track — `generate_tts`, optionally over a
  `create_voice` clone of the target voice — and use it as the audio track at assembly.
- You **cannot** (from this skill) re-lip-sync an existing talking-head clip to the new
  voice: the lip-sync path is internal to the link2vid pipeline, not an agent tool. If
  the on-screen mouth must match, flag that it needs that pipeline.

## Background music — `music_generate`

Generates a music bed. Keep it **under** the voiceover — duck it down while anyone is
speaking and bring it up between lines, so the dialogue always stays clear.

## Handoff

Return a short summary naming each audio asset you produced (voiceover / cloned voice id
/ words file / music) and the scene each belongs to, so the producer and assembler can
wire them into the final render.