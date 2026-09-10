---
title: "PRD：omnimux-video 视频能力插件（自包含本地执行 + 理解层）"
id: "contract-omnimux-video-plugin"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-22"
authors: ["x", "agent-architect"]
subsystem: "omnimux-video"
---

# PRD：omnimux-video 视频能力插件（自包含本地执行 + 理解层）

状态：**Revised v2.1（2026-08-22：增补视频理解两工具；处理层仍为本机 ffmpeg）**  
关联：[ADR 2026-08-21-gxgen-capability-plugin](../decisions/2026-08-21-gxgen-capability-plugin.md)（原引擎客户端方案已被本版取代）  
研究附件：`omnimux-desktop-fork/.workbuddy/artifacts/2026-08-22-video-analyze-reverse-to-omnimux-video.md` · `video-modality-spike/results.json`

## 0. 方向变更记录

| 项 | v1（已废除） | v2（处理层） | v2.1（本版增补） |
|---|---|---|---|
| 执行引擎 | Gxgen video-engine 微服务 | **本机 ffmpeg / ffprobe** | 处理层不变 |
| 插件角色 | 引擎 HTTP 客户端 | 自包含处理插件 | **处理 + 理解**：理解走 hub `textComplete`，**插件不持密钥** |
| 网络依赖 | 引擎 HTTP | **处理层零网络必需** | **理解层需要 OmniMux 登录 + hub** |
| 工具 | — | `video_process`（11 slug） | + `video_analyze` + `video_reverse_prompt`（**不进** 11 slug） |
| 插件名 | dsh-gxgen | **omnimux-video** | 不变 |

变更理由（v2）：本地化自包含，不要求 Docker/云端引擎。  
变更理由（v2.1）：复刻 OPC `social:video-analyze` / `social:video-reverse`；二者是理解不是剪辑，故独立工具。

## 1. 背景（Why）

OmniMux 已有"生成"（videoGenerate / imageGenerate）与本插件的"处理"（剪辑/合并/烧录）。社媒与短剧链路还缺 **"看懂参考片"**：五维拆解给人读、I2V 逆向 prompt 给模型。OPC 已有成熟 CLI；若不搬进 OmniMux，聊天 / drama / workflow 无法统一调用。

## 2. 已确认决策

| # | 决策 | 内容 |
|---|---|---|
| 1 | 处理范围 | 全量 11 项 ffmpeg 能力；`video_export` 高级项放 v1.1 |
| 2 | 处理执行 | **本机 ffmpeg/ffprobe**；**零服务依赖、零网络必需** |
| 3 | 插件位置 | `product/omnimux-dsh/plugins/omnimux-video` |
| 4 | 验收重心 | 聊天直接可用；seam 供 vertical |
| 5 | 理解落点（2026-08-22 拍板） | **本插件增补独立工具**；**不**塞进 `video_process` enum |
| 6 | 理解输入（2026-08-22 拍板） | **直接喂本地视频**给 Gemini；默认 `gemini-3.8-flash` |
| 7 | 视频打包协议（冒烟确认） | 将 `data:video/<mime>;base64,…` **塞进 `image_url`**（对齐 OPC）；**禁止**依赖 OpenAI 风格 `video_url`（3.7 幻觉 / 3.6 `NO_VIDEO`） |

## 3. 用户与场景

| 调用方 | 形态 | 典型场景 |
|---|---|---|
| 老板/运营 | `video_process` | 截取 / 合并 / 轮播 / 烧字幕 |
| 老板/运营 | `video_analyze` | 「拆解这条爆款：目标/钩子/可复刻公式」→ markdown |
| 老板/运营 | `video_reverse_prompt` | 「反推成 I2V prompt」→ 可喂生成的正文 + appendix |
| 业务插件 | `videoProcess` / `videoUnderstand` | 素材处理；参考片理解后进生成 |
| omnimux-workflow | 同上 | 画布处理节点 + 理解节点 |

## 4. 需求范围：11 项能力（ffmpeg 实现映射）

| 能力 | 输入要点（值=本地路径或 URL） | ffmpeg 实现要点 | v1 |
|---|---|---|---|
| `media_metadata` | mediaUrl | `ffprobe -show_format -show_streams` | ✅ |
| `video_trim` | videoUrl + start/duration/end | `-ss/-to`（优先 `-c copy` 流复制，关键帧对齐失败再重编码） | ✅ |
| `video_merge` | videoUrls(≥2) | concat demuxer `-f concat`（同编码流复制；编码不一致 fail-fast 提示先统一转码） | ✅ |
| `video_split` | videoUrl + segments[] | 循环 `-ss -t` 每段一输出 | ✅ |
| `audio_extract` | videoUrl + 区间/格式 | `-vn -c:a`（无音轨 → 成功语义 `no_audio_stream:true`） | ✅ |
| `audio_prepare` | audioUrl + 格式/码率/采样率/截断 | 音频重编码 | ✅ |
| `video_thumbnail_extract` | videoUrl + 尺寸/时间点 | `-ss X -frames:v 1 -vf scale` | ✅ |
| `video_inline_analysis_prepare` | videoUrl + 体积上限 | 压缩重编码（`-crf` + `scale` 二分逼近体积上限） | ✅ |
| `video_scene_detect` | videoUrl + 阈值/关键帧 | `select='gt(scene,θ)'` metadata 输出场景时间戳 + 关键帧提取 | ✅ |
| `slideshow_export` | imageUrls[] + 时长/转场/背景音 | 图序列 + `xfade` 转场链 + 背景音轨 | ✅ |
| `video_export` | clips[] 混排 + 转场 + subtitles 字幕烧录 + 分辨率/画幅 | filter_complex 时间线合成 + **插件内生成 ASS 字幕** + `subtitles` 滤镜烧录 + `xfade` | ✅ 核心子集（绿幕/文字层/去重 → v1.1） |

### 4.1 理解层（v2.1，独立于 11 slug）

真源复刻自 OPC：

| OPC | OmniMux 工具 | 价值 |
|---|---|---|
| `social:video-analyze` | `video_analyze` | 五维拆解报告（给人 / 给事实表） |
| `social:video-reverse` | `video_reverse_prompt` | I2V 结构化生成 prompt（给模型） |

**易混排除：** `social:video-reverse-pad`（倒放补时）属处理，用现有 ffmpeg 能力表达，**不是** `video_reverse_prompt`。

| 工具 | 输入要点 | 输出 | 依赖 |
|---|---|---|---|
| `video_analyze` | `video` 本地路径；可选 `dest`、`promptPath`、`model`、`maxTokens` | markdown（五维骨架）写 `dest` | hub `textComplete` + 包内 `prompts/video-content-breakdown.md` |
| `video_reverse_prompt` | `video`；可选 `identityMode` A/B/C、`duration`、`aspect`、`notes`、`dest`、`appendixDest` | `<<<PROMPT>>>` 正文；可选 appendix | hub `textComplete` + 包内 `prompts/reverse-video-structured-prompt.md` |

**流水线（两工具共用）：**

```text
本地视频
  →（可选）体积过大则 video_inline_analysis_prepare / 切段
  → 读文件为 data:video/*;base64
  → ctx.get('textComplete').execute({ system, prompt:userText, video|image打包, model })
  → 整形（analyze：校验标题；reverse：解析标记块）
  → 写 dest（插件不写业务账本）
```

**hub 前置（阻塞实现）：** `textComplete` 今日只吃单张 `image`。须扩展 `video`（本地路径 / data URI），并在发往 OmniMux chat 时按冒烟协议打包为 `image_url` + `data:video/…`。插件 **禁止** 自读 Keychain / 自开 `/v1/chat/completions`。

**体积策略：** 单段默认上限对齐 OPC 警告阈值（约 20MB 编码前）；超限先走 `video_inline_analysis_prepare` 或自动切段再拼报告（analyze P1）；失败明确报错，不静默空文件。

## 5. 功能需求

### 5.1 Seam：`videoProcess`

```text
请求 { capability, input, dest, signal? }
成功 { mode: 'live', files?: [{ path, kind, meta? }], result? }
失败 throws（见 §5.4）
```

- **同步执行**：spawn ffmpeg 跑完即返回产物落盘结果（无服务端队列，`wait`/`taskId`/续询语义废除）
- `signal` abort → kill 子进程 + 抛 `video-canceled`
- `dest` 文件路径（单产物）或目录（多产物：`segment-001.mp4` / `frame-001.jpg` 规则不变），`files[]` 返回全部本地路径
- `media_metadata` 纯 JSON 无产物；`audio_extract` 无音轨 `no_audio_stream:true` 成功

### 5.2 工具：`video_process`（聊天主入口）

- 参数：`capability`（enum 11 slug）、`input`（object，值=本地绝对路径或 http(s) URL，ffmpeg 原生都吃）、`dest`
- 描述引导：多素材 → merge/export/slideshow；字幕 → video_export 的 subtitles；探测 → media_metadata

### 5.3 执行层（自包含，无桥接）

```text
调用方（本地路径）──► 插件参数预校验 ──► spawn ffmpeg/ffprobe（本机 PATH 或 Config.ffmpegPath）
                                              │
调用方拿回本地文件 dest ◄── 产物直接落盘 + stderr 解析错误码
```

- **ffmpeg 探测**：`apply()` 时探测一次（`ffmpeg -version`），路径来自 `Config.video.ffmpegPath` || PATH；不可用不阻止插件加载，调用时报 `ffmpeg-missing`（指引 `brew install ffmpeg`）
- **进程管理**：每次能力执行 spawn 独立进程；`exec.signal` abort → SIGTERM → 超时 SIGKILL；并发上限 `Config.video.maxConcurrent`（默认 2，防打满本机 CPU）；超出排队
- **超时**：按能力默认值（同 Gxgen 引擎表：metadata 120s … export 1200s）
- **无网络假设**：本地路径为主；http(s) URL 输入由 ffmpeg 原生拉取（失败即 `ffmpeg-failed`）
- **能力 slug 与 input 契约与 Gxgen video-engine 对齐**（字段名沿用其 schema：videoUrl/videoUrls/clips/imageUrls/audioUrl/mediaUrl，值为路径或 URL）——未来若要接回引擎执行端，契约零改动

### 5.3.1 插件装载与生命周期（Cordis 契约）

| 项 | 声明 |
|---|---|
| 入口形态 | 函数插件：`export const name = 'omnimux-video'`，`export const inject = ['tools']`（理解工具就绪后可再 inject 所需 hub 面），`export function apply(ctx)`，`export { Config }` |
| 工具 schema | raw `ctx.tools.register`，parameters 完整 `type:'object'` JSON Schema（objectParams 编译模式，同 omnimux-drama） |
| 进程清理 | 运行中子进程登记表，`ctx.effect` 卸载时统一 kill；**插件不留持久状态** |
| bundle 装载件 | `package.json` 嵌套 `dsh: { bundle: { patch: './cordis.patch.yml' } }` 且 `files` 列入（patch 写 `- insert: - id: omnimux-video, name: omnimux-video`）；**prompt md 进 files** |
| 身份边界 | 处理：本地执行器；理解：消费 hub `textComplete`。不实现 chrome、登录、模型路由、任务 UI；**不持 OmniMux API key** |

### 5.4 错误语义（fail-closed）

| 场景 | 错误 | 说明 |
|---|---|---|
| ffmpeg/ffprobe 不可用 | `ffmpeg-missing` | 指引 `brew install ffmpeg`（或设 Config.video.ffmpegPath） |
| slug 不存在 | `unknown-capability` | 本地预校验，错误信息附 11 slug 清单 |
| 主输入字段缺失 | `video-invalid-input` | 本地预校验（videoUrl/clips/imageUrls…） |
| ffmpeg 退出非零 | `video-ffmpeg-failed` | 附能力名 + stderr 尾部摘要（截断，防爆 token） |
| 能力级失败 | `video-<capability-failed>` 细分 | 如 merge 编码不一致 → `video-incompatible-streams`（指引先统一转码） |
| 调用方 abort | `video-canceled` | kill 进程 + 半成品产物清理 |
| 超时 | `video-timeout` | 同上清理 |
| hub / 登录缺失（理解） | `needs-provider` / `needs-omnimux` | 不自带 key，不静默降级抽帧冒充 |
| 视频模态未接线（理解） | `video-understand-unsupported` | hub 尚未扩 `video` 时显式失败 |
| reverse 标记块缺失 | 降级：整段当 prompt，`parsed:false` 写入 meta | 不抛死；聊天可见提示 |

### 5.5 Config

```text
Config.video:
  ffmpegPath: ''        # 空 = 用 PATH 里的 ffmpeg/ffprobe
  maxConcurrent: 2      # 并发进程上限，超出排队
  env 覆盖：DSH_VIDEO_FFMPEG_PATH

Config.understand:      # v2.1
  defaultModel: 'gemini-3.8-flash'
  maxTokens: 8000
  maxVideoBytes: 20971520   # 约 20MB；超出先压缩/切段或失败
  analyzePromptPath: ''     # 空 = 包内 prompts/video-content-breakdown.md
  reversePromptPath: ''     # 空 = 包内 prompts/reverse-video-structured-prompt.md
```

插件结构：`src/engine/{ffmpeg.js, job.js, video.js}` + `src/engine/capabilities/{…}` + **`src/understand/{analyze.js, reverse.js, pack-video.js, parse-tags.js}`** + `prompts/*.md` + `src/errors.js` + `src/index.js` + `config.js` + `cordis.patch.yml`；测试平铺 `src/*.test.js`。

**单测策略**：① 处理层参数构造全 mock + 真实 ffmpeg 冒烟（`DSH_VIDEO_SKIP_FFMPEG=1` 可跳过）；② 理解层：data URI 打包、标记块解析、prompt 加载；hub 调用 mock `textComplete`。

**seam 登记**（补 [hub.md](./hub.md)）：

| 名 | 提供方 |
|---|---|
| `videoProcess` / 工具 `video_process` | omnimux-video |
| `videoUnderstand`（可选同版）/ 工具 `video_analyze` · `video_reverse_prompt` | omnimux-video（消费 hub `textComplete`） |

### 5.6 理解工具细节（v2.1）

#### `video_analyze`

- 复刻 OPC 五维结构：一句话描述 → 核心目标 → 影响力 → 叙事 → 画面（含表格）→ 复刻策略
- 默认模型 `Config.understand.defaultModel`
- 用户故事：运营拆爆款 / 给 video→carousel 内部事实源

#### `video_reverse_prompt`

- 复刻 OPC `video_to_structured_prompt_v3`：I2V、外观交给参考图、**静默硬约束**（禁口播/对白）
- `identityMode`：`A` 锁参考图 · `B` 匿名 · `C` 只复刻结构
- 解析 `<<<PROMPT>>>` / `<<<APPENDIX>>>`；缺标记则 `parsed:false`
- **不**自动调用 `videoGenerate`（解耦；由 agent / workflow 组合）

## 6. Non-goals

### 处理层（延续）

- 任何 Gxgen/Docker 引擎依赖——永久非目标
- video_export 高级项：chromaKey / textOverlays / dedupe（v1.1）
- browser-engine 类渲染（另议）
- 任务账本 / 任务 UI
- 插件内超出信号量的调度系统

### 理解层（v2.1）

- 不把理解塞进 `video_process` 的 capability enum
- 插件内不复制 OPC Keychain HTTP 客户端
- 不做 ASR / 字幕 OCR / 口播洗稿
- 不自动下游出片
- 不把 `video-reverse-pad` 伪装成 reverse prompt
- 不以 `video_url` 作为默认打包（冒烟已否决可靠性）

## 7. 验收标准

### 处理层

1. 聊天合并 + 烧字幕 → 本地出片，ffprobe 校验
2. split 成 3 段 → `files[]` 正确
3. 图文 slideshow 出片
4. `media_metadata` 聊天可读
5. 无 ffmpeg → `ffmpeg-missing`
6. L1 单测绿
7. 处理路径无 Docker / 无服务启动步骤

### 理解层（依赖 hub video 扩展后）

8. 聊天：`video_analyze` 指向本地短片 → `dest` markdown 含五维标题骨架
9. 聊天：`video_reverse_prompt` → `dest` 含可复制 I2V 正文；静默约束出现在正文
10. 未登录 / hub 无 video → 显式 `needs-omnimux` 或 `video-understand-unsupported`，无空成功
11. 打包单元测试锁定：发出去的 part 必须是 `image_url` + `data:video/` 前缀

## 8. 风险与依赖

| 风险 | 应对 |
|---|---|
| 用户机器没装 ffmpeg | fail-closed + brew 指引 |
| ffmpeg 版本差异 | 探测版本；滤镜能力检查 |
| 长任务阻塞聊天 | signal 可取消；超时分能力 |
| trim 关键帧误差 | `precise: true` 重编码 |
| merge 编码不一致 | `video-incompatible-streams` |
| hub 尚无 video 入参 | **M4 已完成（2026-08-22）**：`textComplete.video` 旁路 chat + `image_url(data:video)`；理解工具可开工 |
| 大视频 data URI 撑爆网关 | `maxVideoBytes` + inline prepare / 切段；对齐 OPC >20MB 警告 |
| 误用 `video_url` | 代码路径禁止；单测锁 `image_url` |

## 9. 里程碑

| 阶段 | 内容 | 出口 |
|---|---|---|
| M0–M3 | 处理层 11 能力（既有） | 生产可用 |
| **M4** ✅ | **hub `textComplete` 扩 `video`**（旁路 `llm.stream`，按 `image_url(data:video)` 打包）+ 模态回归 | 2026-08-22 短片回归：`BG=red; SQUARE=YES_WHITE_SQUARE; MOTION=appeared_after_start` |
| **M5** ✅ | omnimux-video：迁入两份 prompt + `video_reverse_prompt` + `video_analyze` + mock 单测 | 2026-08-22：全量 **119/119**；两工具独立于 11 slug；消费 hub `textComplete.video` |
| **M6** | `videoUnderstand` seam + drama/workflow 至少一处接入 + `yarn omnimux:sync omnimux-video` + 重启验收 | 链路打通 |

## 10. 旧交付物处置（v1 引擎客户端代码）

| 文件 | 处置 |
|---|---|
| `src/engine/client.js`、`src/engine/bridge.js` 及其测试 | **作废删除**（无服务端可调） |
| `src/index.js` 骨架 / objectParams / `src/errors.js` / `src/config.js` 模式 | 改名复用（dsh-gxgen → omnimux-video） |
| `src/engine/job.js` 的预校验 / 多产物命名 / 错误清理逻辑 | 摘出复用；轮询/taskId 分支删除 |
| hub.md dsh-gxgen 两行 | 替换为 omnimux-video 两行 |
