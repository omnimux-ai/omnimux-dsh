---
name: clip-craft
description: "OmniMux Clip 专业剪辑判断层。用于剪视频、修时间轴、加字幕花字、去黑场、自动切片和导出成片。时间轴写入与导出按用户已授权范围执行；不发明未发现的工具。"
---

# Clip Craft — 剪辑判断层

本 Skill 只写**剪辑判断**。工具目录以 `clip_*` 为准，不要在回复里复述参数表。

时间约定：工具入参用**秒**；工程真源是毫秒。先 `clip_get` 再动手，不要凭记忆报时长。

## 工作循环

0. 先拿项目编号：`clip_list` 看已有工程；没有合适的就 `clip_create` 新建。绝不凭记忆编 projectId。
1. `clip_get`（`view=summary`，必要时 `tracks` / `clips` / `full`）摸清轨道与时长。
2. 把一次意图收成**一条** `clip_edit`（一个 Undo 步）。`description` 写人话，如「切掉片头 1.2s 静音」。
3. 大改前 `validateOnly: true` 预演；预演通过后，用户已明确授权的精确操作直接落盘，不重复确认。预演暴露新范围或高风险影响时才追问。
4. 改完立刻 `clip_diagnostics`。有 `timeline_gap` / `clip_overlap` / `media_missing` 就修，不要先导出。
5. 编辑器已打开时 `clip_snapshot` 抽 2–3 帧做视觉自检（字幕是否出安全区、花字是否挡脸、切点是否跳）。
6. 用户要成片再 `clip_export`。不要把预览当交付。

`clip_view` / `clip_snapshot` 在 overlay 未挂载时会抛 `PREVIEW_NOT_READY`。先试一次 `clip_open` 拉起编辑界面；它抛 `ui-unavailable` 时才请用户打开「视频剪辑」侧边栏面板。不要重试空转，也不要把 `{ ok: false }` 当成功。

## 时间轴感知

- 视频轨允许 **0 间距硬切**；≥80ms 的空洞视为黑场（`timeline_gap`），默认补上或 ripple 掉。
- 同轨重叠是错误（`clip_overlap`）。移动前先看落点，不要靠预览碰运气。
- 音频可与画面错开 2–6 帧做 J/L-cut；不要为「对齐」把人声掐在词中。
- 片头钩子 ≤3s；信息段单镜 1.5–4s；口播句间呼吸可留 120–240ms，再长就 `cut_silences`。

## 花字与字幕

| 画幅 | 花字字号 | 字幕字号 | 安全区 |
|---|---|---|---|
| 1080p 横/竖 | **56px 合理**（标题可到 72） | 42px | 距画幅边 ≥8% |
| 720p | 约 40px | 32px | 同上 |
| 4k | 约 96–112px | 72px | 同上 |

- 花字预设走 caption：描边要够，浅底深描边 / 深底浅描边。不要纯白无描边扣在天空上。
- 竖屏 9:16 字幕放中下，避开平台原生胶囊与进度条（大约底边 12–18%）。
- 一句一条；单条时长跟口播，不要把整段旁白糊在一条 10s 字幕上。
- `set_text` / `add_text` / `set_subtitle_style` 改的是 text 轨。改完 snapshot 一眼。

## 自动切片策略

- 用户说「太拖 / 去停顿 / 剪掉废话」：`cut_silences`。有明确静音区间就传 `silences: [{ fromSec, toSec }]`；否则用 `minSilenceSec`（默认 0.3）收视频/音频轨缝。
- 用户给时间点：「从 3.2 秒切开」→ `split_clip` + `atSec`。切点离片段两端至少 80ms。
- 「只要 12–18 秒那句」→ `trim_clip` 或 `remove_range`，不要先整段删再加回来。
- 导入素材：`import_media`（默认可上轨）。空工程先铺 video / audio，再挂 text。
- 转场克制：硬切优先。交叉溶解 ≤400ms，黑场 ≤600ms，且只用在段落换场。连续两条都 fade 就是业余。

## 禁止

- 一次 `clip_edit` 里塞互斥操作（先删再 trim 同一 clip、先 move 到重叠位再指望 diagnostics 救）。
- 用 `clip_view` 当查询；查询走 `clip_get`。
- 在 diagnostics 仍有 `media_missing` 时宣称「可以导出」。
- 把 FFmpeg / `omnimux-video` 当多轨合成引擎。成片由本插件 WebCodecs 导出。
- 发明工具名或秒/毫秒混用却不换算。
