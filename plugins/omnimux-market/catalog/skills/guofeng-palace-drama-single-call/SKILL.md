# 国风 Palace Drama — Single-Call Omni-Reference Short

This skill encodes the creative recipe for a cinematic 3D Chinese-period-drama short delivered as **one continuous Seedance omni-reference video**, not a multi-scene stitched assembly. The mold stays the same; the subject (which palace, which characters, which confrontation) swaps freely.

## When to use this pattern

**Use it when:**
- The user uploads a small cast of reference images (characters + a location) and wants ONE short cinematic video using exactly those refs.
- Duration is short (typically 10–15s, occasionally up to ~20s) and aspect is cinematic (16:9, sometimes 21:9).
- The brief is a multi-beat storyboard (e.g. five 3-second blocks) but the user expects a single continuous output.
- The genre signal is 国风 / 古装 / 宫廷 / wuxia / period palace drama — interrogation, confrontation, banquet, betrothal-gone-wrong, flashback-driven revelation.
- The user says "omni-reference" / "全能参考" / "用我上传的图" / "不要生成新图".

**Do NOT use it when:**
- The brief needs persona consistency across multiple separately-rendered scenes — that's the standard producer + director + `assemble_video` path.
- No user-uploaded character references exist (then refs get generated upstream; this skill assumes a pinned cast).
- Duration > ~20s — a single Seedance call cannot carry that much narrative without losing coherence.

## Hook & opening — the structural move

The hook is **in-medias-res confrontation in an opulent locked interior**. Open inside the room mid-power-move, no exterior establishing, no title card. The first shot is a wide-or-medium of the antagonistic dyad already positioned in the space; the first line of dialogue lands inside the first 2 seconds.

Generic example (a palace-hall interrogation):

> `0–3s:` 中景，宫殿主殿（参考 {{input:image-2}}），鎏金屏风后烛火摇曳。男主（参考 {{input:image-6}}，白色长袍长发）背身负手立于殿中央，缓缓侧首；女主（参考 {{input:image-7}}，红衣长发）跪坐三步外、抬眸直视他。{{speak:m1}}那夜的事，你究竟瞒了我什么？{{/speak}} 烛芯爆响一声，殿外夜风过檐。

**Swap rule:** Replace the location, the two characters, and the opening line. **Keep:** mid-action opener, no establishing exterior, dialogue inside 2s, one ambient sound punctuation (烛芯 / 茶盏 / 铜环 / 檐角风铃) at the end of the beat.

## Narrative arc — 5 beats × ~3 seconds each

The arc is **interrogation → resistance → flashback revelation → power-shift → unresolved close**. For a 15s video, allocate one beat per ~3s. For 12s, drop beat 4 and tighten beat 3. For 10s, drop beat 2 and merge 4+5.

| Beat | Window | Move | Framing | Voice |
|------|--------|------|---------|-------|
| 1 | 0–3s | Power-holder opens with the question | 中景 dyad, locked-off or slow push-in | Cold, low, command — short clause |
| 2 | 3–6s | Subject resists; one detail betrays them | 手腕 / 物件特写 or shoulder-over | Defensive but firm, slight tremor allowed |
| 3 | 6–9s | Hard-cut flashback insert (~0.6–1.0s) reveals the truth | 竹林 / 外景 in remembered light; harsh cut back | No dialogue in the flashback — only SFX |
| 4 | 9–12s | Power-holder closes the trap | 面部特写 of antagonist, then 正反打 | Quieter, more dangerous — slower cadence |
| 5 | 12–15s | Beat of silence, one final line, hold on a face | Push-in on protagonist eyes, freeze on a breath | Defiant single line OR no line at all |

Every transition between beats is a **hard cut** (硬切). No dissolves, no whip-pans, no fade-to-black.

## Visual style spec

- **Render style:** Cinematic 3D, photoreal-stylized (think high-end CG period drama). Not anime, not flat 2D.
- **Color palette:** Warm amber candlelight interiors (rich vermilion / 鎏金 gold / lacquer black / deep crimson silks). Flashback inserts shift to cool cyan-green (竹林青翠) or moonlit blue — the palette flip *is* the flashback signal.
- **Camera grammar:** Locked-off or very slow push-in for interior dialogue. Handheld is wrong for this genre. Flashbacks may use a faster handheld or whip-cut energy for contrast, but ≤1s.
- **Shot length distribution:** Wide/medium for beats 1 and 5; detail/CU for beats 2 and 4; flashback insert in beat 3 is the shortest cut (~0.6–1.0s). Average shot length ≈ 2.5s.
- **Lighting:** Candle / oil-lamp practicals as primary. Hard rim from a brazier. Faces half-lit; let one eye go into shadow when delivering the cold line.
- **On-screen text:** **NONE.** No subtitles, no captions, no titles, no watermarks, no UI. Restate this in the prompt verbatim: `画面始终无字幕、无标题、无水印、无 UI 元素。`

## Voice & persona

- **Antagonist (power-holder, often male lead):** Deadpan-imperial. Low register, short clauses, terminal certainty. Delivery cue style: `冷沉低压，命令式短促` / `冷硬阴沉，帝王威压`.
- **Protagonist (subject under pressure, often female lead):** Defiant-fragile. Slightly higher register, eyes wet but voice does not break. Delivery cue: `委屈但急切认真` / `倔强反驳，眼眶微红但不退缩`.
- **Tertiary characters in flashback:** No dialogue. They exist as visual evidence only.
- **TTS routing:** Seedance speech routes through registered `persona:X:voice` assets. Register one voice-only persona per *distinct speaker* (NOT per dialogue line) before dispatching the video call. See `references/dispatch-recipe.md`.

## CTA mechanic

This format has **no embedded CTA**. The close is the silence-and-defiance beat — the unresolved tension *is* the hook for the next post in the series, comment engagement, or follow-for-part-2. If the user explicitly demands a CTA, it goes outside the video (caption / first comment), not inside it. Do not add on-screen "follow for part 2" cards — that breaks the no-typography rule.

## Pacing fingerprint

- Total: 15s (or 10–20s window).
- Average shot ≈ 2.5s; fastest cut ≈ 0.6–1.0s (the flashback insert).
- Dialogue density: 4–6 short lines total across 15s. Beats 3 and 5 may be silent or near-silent.
- Ambient SFX punctuation at the end of beats 1 and 4 (one diegetic sound — candle pop, sleeve rustle, door creak, leaf shake).

## Hard rules / do-not-regress

These are non-negotiable. Restate the relevant ones inside the `motion` prompt itself, not just in your reasoning.

1. **One Seedance call only.** Do not decompose into N `generate_scene_video` calls and stitch with `assemble_video`. The whole 15s is a single omni-reference dispatch.
2. **Use exactly the user's uploaded references.** Do not call any image-generation tool. Do not invent new character refs. If a ref is missing or ambiguous, ask the user — do not generate a substitute.
3. **Inspect every uploaded asset with `get_asset` first.** Map each `input:image-N` to a semantic role (location, male lead, female lead, guard, concubine, …) BEFORE writing the prompt. Upload IDs carry no semantics; only the chat description tells you which is which.
4. **Register voice-only personas BEFORE the video call**, in the prior turn or earlier in dispatch order. Every `{{speak:X}}` ID in `motion` and every `dialogue[].speaker` must canonicalize to a registered `persona:X:voice` asset. Bare narrator labels will fail preflight.
5. **Consolidate speaker IDs to one per character.** Multiple lines per speaker are fine — `m1` covers all male-lead lines, `f1` covers all female-lead lines. Do not use `m1`, `m2`, `m3` for the same character.
6. **Disclose voice-cloning limitations up front.** If the user uploaded an audio file (MP4 / WAV) expecting timbre cloning, tell them BEFORE dispatch that Seedance speech routes through internal TTS via registered persona voices, and there is no path to ingest a raw user audio file as a custom timbre source. Then proceed with the closest internal voice match.
7. **No BGM. Belt-and-suspenders.** Even though the formatter suppresses BGM, end the `motion` prompt with a verbatim suppression line: `整体禁止任何背景音乐、配乐、纯音乐、乐器声、歌声；只保留人物对白、衣袍布料摩擦、脚步、殿门低响、竹叶沙沙等环境音和动作音效。`
8. **No subtitles / captions / typography / UI.** Verbatim: `画面始终无字幕、无标题、无水印、无 UI 元素。`
9. **No duplication / no twins / no face swap / no clipping / no model displacement.** Verbatim near the top of `motion`: `严格保留每个角色的服化道与五官，不得双胞胎/多胞胎/换脸/错位/穿模，画面内任何时刻男女主各只出现一人。`
10. **Anchor every character mention to its asset ID inline.** Format: `男主（参考 {{input:image-6}}，白色长袍长发）`. Do this on first mention in every beat where the character appears.
11. **Hard cuts only.** Phrase transitions as `硬切到...`. No `淡入`, no `淡出`, no `叠化`.
12. **Final deliverable is ONE asset.** `final:video` from the single `generate_scene_video` call. Return it to the user as `[查看成片](final:video)`. Do not run `assemble_video`.

## Dispatch recipe

See [`references/dispatch-recipe.md`](references/dispatch-recipe.md) for the exact `generate_scene_video` payload shape, the `motion` prose template with time-blocked beats, and the `dialogue[]` entry format with delivery cues.

## Hook & flashback fragment library

See [`references/hook-and-flashback-fragments.md`](references/hook-and-flashback-fragments.md) for opening-line patterns and flashback insert constructions you can adapt to a new subject without losing the creative move.