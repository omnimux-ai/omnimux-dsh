# Dispatch Recipe — Single-Call Omni-Reference Palace Drama

This file documents the exact payload shape, prompt structure, and ordering required to dispatch the 国风 palace drama short as a single Seedance omni-reference call. The values shown are templates — swap subject content, keep structure.

## Pre-dispatch checklist (in order)

1. **Inspect uploaded assets.** For every `input:image-*` and every uploaded audio file, call `get_asset` and write a one-line role label. Do not proceed if any character or location ref is ambiguous — ask the user.

2. **Resolve speakers.** From the user's dialogue, identify the *distinct* characters who speak (not the number of lines). Typical palace drama: 2 speakers — antagonist + protagonist. Tertiary characters in flashbacks are silent.

3. **Disclose voice-clone limitation if applicable.** If the user uploaded audio expecting timbre clone, tell them now: Seedance speech routes through registered `persona:X:voice` assets and there is no ingestion path for raw user audio. Proceed with internal TTS voice match.

4. **Register voice-only personas.** Dispatch one `setup_persona` per distinct speaker, in parallel, in the turn BEFORE the video call (or earlier in the same turn). Example:

   ```
   setup_persona(character_id="m1", voice_only=true, gender="male", age="young")
   setup_persona(character_id="f1", voice_only=true, gender="female", age="young")
   ```

   Pick `character_id` values that are short and ASCII (`m1`, `f1`, `g1`, `c1`). These IDs are referenced inside the `motion` prompt as `{{speak:m1}}...{{/speak}}` and inside the `dialogue[]` array as `speaker: m1`.

5. **Dispatch the video call.** Single `generate_scene_video`. See payload shape below.

## `generate_scene_video` payload shape

```yaml
backend: seedance
duration: 15                  # or 10–20; match user spec
aspect_ratio: "16:9"          # or "21:9" for ultra-wide cinematic
resolution: "720p"            # default; bump to 1080p only if user asks
generate_audio: true          # auto-match SFX; required for diegetic-audio pattern
start_image: input:image-2    # the location / establishing reference
reference_images:             # ALL character refs + location ref again
  - input:image-2             # location (palace interior)
  - input:image-6             # male lead
  - input:image-7             # female lead
  - input:image-9             # flashback guard
  - input:image-11            # flashback concubine
motion: |
  <see prose template below>
dialogue:
  - speaker: m1
    text: "那夜的事，你究竟瞒了我什么？"
    delivery: "冷沉低压，命令式短促"
  - speaker: f1
    text: "陛下，那夜臣妾只是赏竹，并未见任何人。"
    delivery: "委屈但急切认真"
  # ... 4–6 lines total
```

### Field notes

- **`start_image`** = location ref. The opening framing should match it.
- **`reference_images`** = location + every character that appears anywhere in the 15s, including silent flashback figures. The engine needs them all available for the full duration, regardless of which beat they enter.
- **`generate_audio: true`** is what gives you ambient SFX. Without it, beats lose their diegetic punctuation.
- **`resolution`** stays at 720p unless explicitly requested higher — 1080p costs more credits and the user did not ask.

## `motion` prose template

The `motion` field is the entire creative direction. Structure it in five sections, in this order:

```
[STYLE BLOCK]
整体风格：电影级 3D 国风宫廷剧，写实细腻的服化道与材质（丝绸、鎏金、漆木、玉饰），
烛火暖光为主、阴影深沉，构图稳重，色调浓郁。严格保留每个角色的服化道与五官，
不得双胞胎/多胞胎/换脸/错位/穿模，画面内任何时刻男女主各只出现一人。

[LOCATION ANCHOR]
场景设定在宫殿主殿（参考 {{input:image-2}}），鎏金屏风、红柱金顶、案上烛台烛火摇曳。

[BEAT 1 — 0–3s]
0–3s：中景，男主（参考 {{input:image-6}}，白色长袍长发）背身负手立于殿中央，
缓缓侧首；女主（参考 {{input:image-7}}，红衣长发）跪坐三步外、抬眸直视他。
{{speak:m1}}那夜的事，你究竟瞒了我什么？{{/speak}}
殿内烛芯爆响一声，殿外夜风过檐。

[BEAT 2 — 3–6s]
3–6s：硬切到女主手腕特写，她衣袖下指节微微收紧，再硬切回她半侧脸。
{{speak:f1}}陛下，那夜臣妾只是赏竹，并未见任何人。{{/speak}}
衣袍布料轻擦声。

[BEAT 3 — 6–9s]
6–9s：硬切到竹林夜色闪回（约 0.8 秒），月光泛青，侍卫（参考 {{input:image-9}}）
与一名宫装女子（参考 {{input:image-11}}）在竹影下短暂对视，无对白；
随即硬切回宫殿主殿，女主瞳孔微缩。
竹叶沙沙、远处更鼓一响。

[BEAT 4 — 9–12s]
9–12s：男主面部特写，眼神冷沉，再切正反打。
{{speak:m1}}你以为，朕什么都不知道？{{/speak}}
殿门铜环轻响。

[BEAT 5 — 12–15s]
12–15s：缓慢推近女主面部，她吸一口气、抬眼直视。
{{speak:f1}}臣妾问心无愧。{{/speak}}
定格于她的眼神，烛火在瞳中跳动。

[AUDIO SUPPRESSION BLOCK]
整体禁止任何背景音乐、配乐、纯音乐、乐器声、歌声；
只保留人物对白、衣袍布料摩擦、脚步、殿门低响、竹叶沙沙等环境音和动作音效。

[VISUAL SUPPRESSION BLOCK]
画面始终无字幕、无标题、无水印、无 UI 元素。
```

### Authoring rules for `motion`

1. **Time blocks are explicit.** Every beat starts with `Ns–Ms：`. Do not let the model infer pacing.
2. **Hard cuts are spelled out.** `硬切到...` between beats and into/out of flashbacks. Never `淡入` / `淡出` / `叠化`.
3. **Character mentions are anchored.** First mention in each beat: `<name>（参考 {{input:image-N}}，<one-line costume/hair note>）`. Subsequent mentions in the same beat: just the name.
4. **Dialogue spans inline.** `{{speak:m1}}<line>{{/speak}}` directly inside the beat prose. The speaker IDs MUST match `dialogue[].speaker` and a registered `persona:X:voice` asset.
5. **One SFX line per beat** (or two for the hook). Diegetic only: 烛芯 / 衣袍 / 竹叶 / 铜环 / 脚步 / 殿门 / 更鼓.
6. **Suppression blocks are always last**, in this order: audio suppression, then visual suppression. Verbatim Chinese; do not paraphrase to English.

## `dialogue[]` entry format

Each entry has three required fields:

- `speaker` — the consolidated character ID matching a registered `persona:X:voice`.
- `text` — verbatim Chinese line, no quotation marks.
- `delivery` — 2–6 Chinese words describing tone. Skipping this meaningfully degrades TTS read.

Delivery vocabulary for this format:

- Antagonist: `冷沉低压，命令式短促` · `冷硬阴沉，帝王威压` · `压低声线，缓慢迫近` · `不怒自威，尾音下沉`
- Protagonist: `委屈但急切认真` · `倔强反驳，眼眶微红但不退缩` · `平稳但暗藏颤抖` · `轻声但字字清晰`

Order entries in dialogue-occurrence order across the 15s. Do not reorder.

## Final deliverable

The single `generate_scene_video` call returns one asset (typically `final:video` after the producer's registration step). Return it to the user as:

```
[查看成片](final:video)
```

No `assemble_video`. No follow-up calls. The skill is done.
