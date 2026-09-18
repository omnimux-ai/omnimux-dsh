# Podcast patterns — chunk-arc + pattern selection method

This file teaches the **method** for planning a podcast episode: how to shape
the chunk arc (cold-open → mid-thought middles → payoff + silent tail) and how
to pick a shot Pattern (A/B/C/E) per chunk from the episode's genre and tone.

There are no fixed example episodes here. An episode is a **structure** —
chunk count, per-chunk Pattern selection, beat shape — not a topic. Cast fresh
personas and write fresh dialog for every episode; only the structure is reused.

---

## Dialog labeling convention

Each dialog line is tagged inline with the speaker's camera state. These tags go
LITERALLY into the Seedance `motion` field — there is no translation step. See
[podcast-clip-prompt-guide.md](podcast-clip-prompt-guide.md) § *Dialog labeling*.

- `[on-camera]` — speaker visible, mouth lip-syncs
- `[voice-over, off-camera]` — speaker NOT visible; audio plays as VO; the listener must NOT lip-sync
- `[continuing]` — same speaker carries over without a fresh onset
- `[continuing, voice-over over the close-up of the listener]` — common compound for Pattern A's "land on listener" tail
- `[silent — mouth stays closed, not speaking this line, only micro-reaction]` — listener tag (pairs with `[voice-over]` on the speaker)
- For a speaker change inside a chunk, mark the incoming line as a fresh onset (e.g. `[on-camera, fresh onset, new speaker]`) so the clip prompt knows lip-sync transfers to the other persona.

Use `persona:<host>` / `persona:<guest>` (or "the host" / "the guest") to refer
to speakers in plans and dialog — never a fixed name.

---

## Shaping the chunk arc

An episode is N chunks, each a single Seedance clip of **8–15 s**. Plan the arc
before writing any dialog, and lock it in the plan file (Hard Rule #11).

**Chunk 1 — cold open.** Open on the strongest hook (a claim, a number, a date,
a confession). End chunk 1 mid-beat — on a reaction, an unanswered question, or a
half-finished thought — so the listener has to continue. Do not resolve anything
in chunk 1.

**Middle chunks — mid-thought continuity.** Each middle chunk opens *mid-thought*,
extending what the previous chunk left unfinished. Bridge chunks via **dialog
content**, not via on-screen transitions: chunk K+1's first line should read as the
natural continuation of chunk K's last line. Middles do the work — exploration,
tension/stakes, the turn, an optional emotional bridge.

**Final chunk — payoff + silent tail.** The last chunk delivers the payoff or
callback (often answering or inverting the chunk-1 hook), then ends with a
**silent ~1.5 s tail** held on a single close-up — the listener's reaction or the
speaker's contemplative beat. The silent tail is on the **final chunk only**
(Hard Rule #12); never add it to a middle chunk.

**Episode length scales by chunk count.** Roughly: a single payoff arc in 2 chunks
(~30 s), a tight 3-chunk arc (~45 s), a standard 4–5 chunk arc (~60–75 s), and a
long 6-chunk arc (~90 s) with room for both a turn and an emotional bridge. Pick the
count from the brief's pacing, not from a template.

A useful beat vocabulary for naming chunks in the plan: HOOK / SETUP, EXPLORATION
or CONTEXT, TENSION or STAKES, TURN, EMOTIONAL BRIDGE, PAYOFF or CALLBACK. Not
every episode uses every beat — short episodes collapse several into one chunk.

---

## Selecting a shot Pattern per chunk

Pattern definitions (the panel grammar for A/B/C/E) live in
[podcast-clip-prompt-guide.md](podcast-clip-prompt-guide.md) § *Shot grammar*.
This section is about *which* Pattern to put on *which* chunk.

**Pattern A — dialog exchange, land on listener.** The default for two-host
back-and-forth: wide → CU speaker → wide (shifted) → CU listener, with the
speaker's tail line played `[voice-over]` over the listener's reaction. Use for
most conversational chunks where two voices trade lines.

**Pattern B — extended single-speaker turn.** One speaker holds the floor across
the chunk (CU speaker → different angle of the same speaker → land on the
listener's reaction). Use for monologues, the stakes beat, and closing payoffs
delivered tight on one speaker. Pattern B *starts tight on a close-up*, which makes
it the safe neighbour after any chunk that **ends on a wide** (see adjacency below).

**Pattern C — reaction emphasis.** Built around a dual-reaction wide so both
faces register the beat. Use for comedic banter and "wait, what?" moments where the
listener's reaction *is* the payload.

**Pattern E — sustained wide two-shot.** Both hosts on-camera for the whole chunk,
no voice-over window — a held wide. Use sparingly for an emotional-bridge or
contemplative beat. Pattern E **ends on a wide shot.**

### Select by genre / tone

- **Conversational / exploratory** → mostly Pattern A; reuse one A storyboard across the talky middles.
- **Investigative / data-driven** → Pattern A for the exchanges, Pattern B for the one chunk that's an extended evidence monologue.
- **Comedic banter** → Pattern C on the setup/escalation chunks (reaction-forward), Pattern B for a payoff with comedic-timing close-ups.
- **Documentary / gravitas** → Pattern A for context, Pattern B for a reflective monologue, Pattern E for one emotional-bridge chunk, Pattern B to land the final reflective close-up.
- **Awe / contemplative bridge** → reserve Pattern E for the single peak beat; keep the surrounding chunks on A or B.
- **Solo / single-host** (rare; breaks the 2-persona rule — see below) → a Pattern B *variant*: single-host close-ups with the listener CU substituted by a wide of the empty studio.

### Adjacency rule

Pattern E **ends on a wide**, so the chunk *after* an E chunk must **not start on a
wide**. Follow E with Pattern B (which starts tight on a close-up) for a clean cut.
More generally, avoid back-to-back wides across a chunk boundary.

### Storyboard reuse

You only need one storyboard per distinct Pattern used in the episode, then reuse it
across every chunk that shares that Pattern. Name them by Pattern letter:
`podcast:storyboard:A`, `podcast:storyboard:B`, `podcast:storyboard:C`,
`podcast:storyboard:E` (and a `:B-solo` variant for single-host episodes). An episode
that is "A on the middles, B on the close" needs only `:A` + `:B` generated, with `:A`
reused across the middle chunks.

---

## Single-host (solo) episodes

A solo monologue uses one persona and substitutes the listener close-up with a wide
of the empty studio (a visibly empty second chair signals "intentional solo," not a
missing guest). This breaks the "exactly 2 personas" rule (Hard Rule #1). Either:

- Explicitly waive H.R. #1 in the producer dispatch (allowed when the user asks for solo), or
- Use a 2-persona setup with a near-silent guest.

---

## How to use this method

1. **Read the brief's tone + pacing** and pick a chunk count and a per-chunk Pattern map from the principles above.
2. **Cast fresh personas** — do not reuse the same persona pair across episodes (a recurring failure mode is "every podcast looks identical"). Write personas and setting from the brief.
3. **Lock the episode spine** (chunk count, beats, Pattern per chunk) in the plan file before writing any chunk dialog (Hard Rule #11).
4. **Write dialog per chunk** using the labeling convention above, and source topic/premise framing from [podcast-clip-prompt-guide.md](podcast-clip-prompt-guide.md) § *Conversation Premise* + § *Topic frameworks*.
5. **Bridge chunks via dialog content** — chunk K+1 opens mid-thought, extending what chunk K left unfinished.
6. **Silent ~1.5 s tail on the final chunk only** (Hard Rule #12).
7. **Respect adjacency** — never start a chunk on a wide directly after a Pattern E chunk.

---

**Reminder**: This is a method, not a set of topics. The same chunk-arc shape and
Pattern map works across any subject — only the personas, setting, and dialog change.
Match the chunk count and Pattern selection to the brief's tone and pacing, then write
everything else from scratch.
