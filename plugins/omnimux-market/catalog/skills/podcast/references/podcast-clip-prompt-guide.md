# Clip prompt guide (per-chunk Seedance)

Composing the verbatim `motion` field for each chunk's `generate_scene_video` call. **This is the highest-ROI reference** — the per-line camera-state tags + dialog labeling conventions in this file are the single biggest reason these podcast clips read as "real podcast" instead of "two heads on camera".

Covers: dialog labeling + voice-over rules + silence budget + episode continuity + topic frameworks + subtitle style.

---

## `generate_scene_video` call shape (per chunk)

```python
generate_scene_video(
  backend="seedance",
  start_image="podcast:storyboard:A",  # or :B, :C — the chosen pattern
  reference_images=[
    "podcast:composite",          # slot 0 — REQUIRED, 180° anchor
    "persona:<speaker>",          # slot 1 — speaker for THIS chunk
    "persona:<listener>",         # slot 2 — listener for THIS chunk
  ],
  motion="<verbatim chunk prompt — see anatomy below>",
  dialogue=[
    {"speaker": "persona:<host>", "text": "<line 1 verbatim>",
     "voice_id": "<host_kling_voice_id>", "delivery": "<delivery note>"},
    {"speaker": "persona:<guest>", "text": "<line 2 verbatim>",
     "voice_id": "<guest_kling_voice_id>", "delivery": "<delivery note>"},
    # ...one entry per spoken line in order
  ],
  duration=12,                           # integer 8-15
  aspect_ratio="9:16",                   # or "16:9" for CTV
  output_asset_id="podcast:chunk:1:video",
  scene_number=0,                        # K - 1, 0-based
)
```

**`dialogue[]` populates voice-routing.** Every line that appears in `motion` as a `{{speak:persona:X}}…{{/speak}}` span MUST have a matching entry in `dialogue[]`. The order in `dialogue[]` is the spoken order across the chunk.

---

## Dialog labeling conventions (HARD — go LITERALLY into the motion field)

These tags are not metadata — they appear inline in the `motion` string and tell Seedance which mouth to lip-sync.

| Tag | Meaning | When to use |
|---|---|---|
| `[on-camera]` | Speaker is visible in this shot; mouth lip-syncs to audio of this line | Most dialog lines |
| `[voice-over, off-camera]` | Speaker is NOT visible in this shot; audio plays as VO; the visible listener must NOT be lipsynced to these words | Tail of a sentence that lands over a listener close-up |
| `[continuing]` | Same speaker carries over from previous line without a fresh onset; combines with `on-camera` or `voice-over` | Multi-shot single thought |
| `[continuing, voice-over over the close-up of the listener]` | Common compound: same speaker continues into a VO that plays over the listener's reaction CU | Pattern A's "land on listener" tail |
| `[silent — mouth stays closed, not speaking this line, only micro-reaction]` | Listener tag — they're visible while the speaker is VO; their mouth must NOT animate | Pair with `[voice-over]` on the speaker |

**Required pairing**: if a line lands on a listener close-up, the speaker is tagged `[voice-over, off-camera]` AND the visible listener is tagged `[silent — mouth stays closed, not speaking this line]`. Both tags MUST appear in the motion field for that shot.

### Motion field template (Pattern A skeleton, one chunk)

Fill the placeholders; keep the structure. Line counts and shot durations are illustrative — adapt to the chunk's content.

```
SHOT 1 (Panel 1 — WIDE TWO-SHOT, ~3s): {{persona:<host>}} and {{persona:<guest>}} mid-conversation in the studio. {{persona:<speaker>}} mid-sentence, leaning slightly forward.

{{speak:persona:<speaker>}}
{{persona:<speaker>}} [on-camera]: "<first voiced line>"
{{/speak}}

SHOT 2 (Panel 2 — CLOSE-UP OF SPEAKER, ~4s): tight close-up of {{persona:<speaker>}}, three-quarter angle toward {{persona:<listener>}} off-frame, mouth in mid-speech.

{{speak:persona:<speaker>}}
{{persona:<speaker>}} [continuing, on-camera]: "<continuation of the thought>"
{{/speak}}

SHOT 3 (Panel 3 — WIDE TWO-SHOT, SHIFTED ANGLE, ~3s): wide of both hosts, slight elevation shift from Shot 1. {{persona:<listener>}} reacting subtly, {{persona:<speaker>}} mid-thought continuing.

{{speak:persona:<speaker>}}
{{persona:<speaker>}} [continuing, on-camera]: "<next beat of the thought>"
{{/speak}}

SHOT 4 (Panel 4 — CLOSE-UP OF LISTENER, ~2s): tight close-up of {{persona:<listener>}}, eyes toward off-frame speaker, mouth closed, contemplative listening expression with a slight, natural head tilt.

{{persona:<listener>}} [silent — mouth stays closed, not speaking this line, only micro-reaction]

{{speak:persona:<speaker>}}
{{persona:<speaker>}} [continuing, voice-over over the close-up of the listener]: "<line that lands over the listener CU>"
{{/speak}}

Locked tripod cameras throughout — no camera motion, no zoom, no pan, no push, no pull, no rack focus, no handheld shake. Cuts are clean reverse-shots / framing-change cuts between locked cameras.
```

Matching `dialogue[]`:

```python
dialogue=[
  {"speaker": "persona:<speaker>", "text": "<first voiced line>",
   "voice_id": "<speaker_voice_id>", "delivery": "<delivery note>"},
  {"speaker": "persona:<speaker>", "text": "<continuation of the thought>",
   "voice_id": "<speaker_voice_id>", "delivery": "<delivery note>"},
  {"speaker": "persona:<speaker>", "text": "<next beat of the thought>",
   "voice_id": "<speaker_voice_id>", "delivery": "<delivery note>"},
  {"speaker": "persona:<speaker>", "text": "<line that lands over the listener CU>",
   "voice_id": "<speaker_voice_id>", "delivery": "<delivery note>"},
]
```

(Note: the listener's `[silent]` line does NOT need a `dialogue[]` entry — there's no audio to route.)

---

## Performance: natural and understated (HARD)

Direct the performance toward two people *genuinely talking* — not acting for a camera. This is a HARD rule; it applies to every shot in every chunk.

- **Gestures stay small and incidental** — a slight lean, a small hand movement at rest, a brief nod. NO oversized hand-waving, no big sweeping arm gestures, no theatrical pointing.
- **Facial expressions stay subtle** — micro-reactions, soft eye movement, a small smile or brow shift. NO mugging for the camera, NO exaggerated eyebrow acting, NO cartoonish surprise or wide-eyed reactions.
- **Delivery is calm and conversational** — the relaxed cadence of a real conversation, not a performance or a pitch. No overacting, no forced energy spikes.
- **Listener reactions are restrained** — the off-camera/silent listener gives quiet, believable micro-reactions (slight nod, contemplative tilt), never broad or showy.

Carry this into the `delivery` notes in `dialogue[]` (e.g. "warm, conversational", "curious, leaning in") and into the shot descriptions in `motion` — describe subtle, lifelike body language, never theatrical staging.

---

## Episode narrative continuity

`N` Seedance chunks = ONE episode timeline, not N freestanding clips. The chunk arc is locked in the **plan file** (outside the prompt) before authoring any chunk; chunks bridge across splices via **dialog content**, not via cold-opens.

### Per-chunk position rules

| Position | Opening line behavior | Ending behavior |
|---|---|---|
| **K=1 (cold open)** | Mid-conversation, NO "welcome to the show" / "I'm joined today by…". May include 1–2 bracketed non-verbal sounds at the start (`[half-laugh]`, `[mm]`). | Ends mid-beat — no silent hold, no clean tail. Speaker mid-thought, lands on listener CU per Pattern A. |
| **1 < K < N (middle)** | Opens **mid-thought**. The first voiced line **answers or extends** whatever was left "open" before chunk K-1 ended. NO greetings, NO product re-introductions, NO fresh hooks. | Ends mid-beat. No silent hold. |
| **K = N (final)** | Opens mid-thought. The CTA appears in the last 15–20% of this chunk. | Lands the CTA + ONE more conversational beat (chuckle / "anyway" / sip / nod) + **silent ~1.5 s tail**. |

### Forbidden across all chunks

- Planning markers in the prompt body — no `chunk #K of N`, no `EPISODE_SPINE`, no `CONTINUATION_RULE`, no `BEAT_NOTE`.
- Third-person narrator describing actions ("the hosts discuss X", "the conversation continues") — every line must be **literal quoted dialog** from a named host.
- `Style & Mood` / `Narrative Summary` / `Dynamic Description` / `Static Description` skeleton blocks — that block format is for non-podcast Seedance clips.
- Anonymous off-screen voice or third unnamed speaker.

---

## Silence / dead-air budget

- **Intermediate chunks (1 ≤ K < N)**: NO silent tail, NO "hold the final close-up silently", NO "ambient room tone only" as a final-shot directive. Chunks end mid-beat.
- **Final chunk (K = N)**: silent ~1.5 s tail BELONGS HERE. After the final conversational close beat, the visible listener holds their expression silently for ~1.5 s before the cut.
- **Mid-chunk silence**: default ceiling ~2 consecutive seconds of NO spoken audio. Longer silence requires an explicit `AUDIO CONTINUITY` clause (ambient room tone, breath, micro-laugh).

---

## The Conversation Premise

The cold open (chunk K=1) is what separates "podcast clip" from "two people in a studio reading copy". Pick the Conversation Premise BEFORE writing any chunk dialog.

- The episode opens **mid-conversation**, not mid-introduction.
- The Conversation Premise must be a topic the audience would care about for its own sake.
- The first frame must be readable on mute — the visual + the first quoted line carry the premise.

### High-converting cold-open shapes

1. **The confession** — a host admitting a real problem or vulnerability.
2. **The rant** — an opinionated take that invites disagreement.
3. **The question** — one host asks the other, opening a topic.
4. **The data drop** — a single specific number that's also a hook.

Whichever shape you pick, write it as a genuine spoken line in the speaker's voice — concrete and specific to the chosen topic, never a generic tagline.

---

## Topic frameworks

These shape pacing + hook style + beat density. Pick one based on topic + target audience.

| Framework | Pace | Hook style | Best for topic types |
|---|---|---|---|
| **Tech / SaaS** | Conversational, mid-tempo | Data drop + analyst observation | Software, AI, productivity, dev culture |
| **Space / aspirational** | Slower, longer holds | Pioneer-narrative | Aerospace, climate, frontier science |
| **Conspiracy / contrarian** | Punchy, opinionated | Rant | Counter-cultural takes, debunking, contrarian framing |
| **Philosophy / life advice** | Reflective, slower | Confession | Mental health, mindfulness, life lessons |
| **History / heritage** | Documentary gravitas | Specific number / date drop | History, craft, lineage stories |
| **Science / research** | Curious, question-driven | Question | Research, biology, psychology |

---

## Per-chunk authoring checklist

Before submitting any chunk's `generate_scene_video`, verify:

- [ ] The motion field is a literal script of quoted lines from `{{persona:<host>}}` / `{{persona:<guest>}}` — no third-person prose like "the hosts discuss X".
- [ ] Every line has a `[on-camera]` / `[voice-over, off-camera]` / `[continuing]` / `[silent — mouth stays closed]` tag.
- [ ] Every `{{speak:X}}…{{/speak}}` span has a matching `dialogue[]` entry with `voice_id`.
- [ ] Speaker close-ups have the speaker tagged `[on-camera]`; listener CUs (Panel 4) pair `[voice-over]` on speaker + `[silent — mouth stays closed]` on visible listener.
- [ ] Performance is natural and understated — subtle gestures and micro-reactions only; NO theatrical reactions, mugging, oversized hand-waving, or eyebrow acting. `delivery` notes and shot descriptions reflect calm, conversational delivery.
- [ ] No planning markers (`chunk #K`, `EPISODE_SPINE`, `BEAT_NOTE`, total duration, outline).
- [ ] `K=1`: opens mid-conversation, no "welcome to the show".
- [ ] `1 < K < N`: opens mid-thought, extending the previous chunk's open thread via dialog content.
- [ ] `K=N`: lands narrative payoff + 1 conversational close beat + silent ~1.5 s tail.
- [ ] `1 ≤ K < N`: NO silent tail / NO "ambient room tone only" / NO "hold the close-up silently" directives.
- [ ] Motion ends with "no camera motion, locked tripod, no zoom, no pan, no push, no pull" — Seedance adds motion by default unless explicitly told not to.
- [ ] 180° rule respected — every close-up shows the SAME side of the host as the composite.

If any item fails: rewrite the chunk and re-verify before submitting.
