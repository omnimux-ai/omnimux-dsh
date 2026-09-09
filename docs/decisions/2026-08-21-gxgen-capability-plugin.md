---
title: "Gxgen 微服务 → OmniMux 能力插件"
id: "decision-gxgen-capability-plugin"
type: "decision"
status: "superseded"
authority: "L2"
date: "2026-08-21"
updated: "2026-09-09"
superseded_by: "docs/contracts/dsh-video-plugin.md"
authors: ["x", "agent-architect"]
subsystem: "omnimux-video"
---

# Gxgen 微服务 → OmniMux 能力插件

## Status

**Superseded（2026-08-21 下午方向变更）**：引擎客户端方案废除——用户明确要求本地化自包含，不可能依赖本地 Docker 引擎或云端。Gxgen video-engine 降级为能力清单与契约参照物（11 项 slug 与 input schema 保持对齐，未来任一端可互换执行方）。继任方案（本机 ffmpeg 子进程自包含执行，插件更名 omnimux-video）见 [dsh-video-plugin.md](../contracts/dsh-video-plugin.md)。上午的引擎实测事实（canceled 单 l、.job.job_id、scene_detect base64、token env 双名）对 v2 仅存参考价值。

原记录（引擎客户端方案，已被取代）：Accepted（2026-08-21 上午拍板：全量能力、引擎本地跑+本地文件进出、omnimux-dsh 兄弟目录、聊天验收优先）

## Context

Gxgen 在 `/Users/x/Desktop/Project/Gxgen/services` 下有 5 个微服务。老板想把它抽成 OmniMux 的能力插件，让其他 OmniMux 插件（omnimux-drama、后续电商/品牌 vertical）可以调用。

一个关键事实先摆出来：**Gxgen 的"生成"能力已经挂在 OmniMux 上了**。hub 契约（`docs/contracts/hub.md`）明确提到 OmniMux cloud 的 media channel 里有 Gxgen（channel 61），`videoGenerate` / `imageGenerate` seam 已经覆盖生成场景。所以这次要抽的是 Gxgen 独有、OmniMux 缺的部分：**处理与渲染类能力**。

### 服务盘点

| 服务 | 技术栈 | 能力 | API 形态 | 抽取价值 |
|---|---|---|---|---|
| video-engine | Python FastAPI, :8100, Railway | `video_scene_detect` / `video_trim` / `video_merge` / `video_split` / `video_export`（字幕烧录）/ `slideshow_export` | 统一 job API：`/v1/capabilities`、`/v1/jobs`（异步）、`/v1/capabilities/execute`（同步包装）、`/v1/jobs/{id}/cancel`、`/v1/artifacts/{id}` | **高**。视频后处理是 drama/电商 vertical 的刚需，OmniMux 完全没有 |
| browser-engine | Python FastAPI, Railway | `social_card_render` / `social_card_validate` / `slideshow_page_render` / `design_text_layer_render` / `web_page_screenshot` | **与 video-engine 完全同构**的 job API + 同款 `X-Gxgen-Engine-Token` 认证 | **高**。社媒卡片渲染正是社媒运营场景（OPC）的核心能力 |
| agent-runtime | TS / Mastra, :4111 | agent host：workspace、skills、HITL、`run_gxgen` CLI 桥 | Mastra HTTP + Core bridge `/api/agent-runtime/*` | **不抽**。OmniMux/dsh host 本身就是 agent host；hub 契约明令禁止平行 chat 工具。职责重叠 |
| r2-transfer-worker | Cloudflare Worker | R2 字节传输、缩略图/网格变换、回执核销 | Queue + DO，控制面在 Gxgen 主 API | **不抽**。纯数据面基础设施，OmniMux 插件不该接触 seal/R2/回执细节；产物获取走 engine 的 `/v1/artifacts` 即可 |
| landing-page | Astro | 营销静态站 | 无 API | **不抽** |

两个 engine 服务共享同一套任务契约（capability registry + 优先级队列 + 重试 + SQLite 持久化 + 产物下载 + `X-Gxgen-Engine-Token` 共享密钥），这决定了**一个插件统一封装两个服务**，而不是两个插件。

## Decision（提案）

**方案 A：在 `product/omnimux-dsh/plugins/` 下新建兄弟能力插件 `dsh-gxgen`**，提供中立 seam + 工具，其他插件经 `ctx.get` 或模型经 `gxgen_*` 工具调用。

### 备选方案与取舍

| 方案 | 做法 | 得 | 失 |
|---|---|---|---|
| **A. 兄弟能力插件（推荐）** | `plugins/dsh-gxgen`，`ctx.provide('videoProcess')` / `ctx.provide('pageRender')` | hub 保持纯净（只管 OmniMux cloud 职责）；Gxgen 独立演进、独立启停（不配 URL 就 fail-closed）；可单独发布/回滚 | 多一个插件要进 preset；seam 注册依赖插件共存于同一 profile |
| B. 塞进 hub | `plugins/omnimux/src/gxgen/`（hub.md 说"new capability = new directory under that package"） | 不加插件数量 | 违背 hub 的职责边界：hub 持有的是 OmniMux cloud 凭据与路由，Gxgen 是自托管第三方系统，凭据体系不同（`OMNIMUX_API_KEY` vs `GXGEN_ENGINE_TOKEN`）；hub 膨胀后每改 Gxgen 都要动核心包 |
| C. 作为 media vendor | `src/media/vendors/gxgen.js` + providers 行 | 零新概念 | 语义不匹配：media 层是"生成"（prompt → 新媒体），engine 是"处理"（已有媒体 → 加工）。塞进去要把 capability slug 塞进 prompt 字段，丑且脆 |

选 A 的核心理由：hub 契约的 I/O 模型就是为这种场景设计的——"vertical tool → `ctx.get('<seam>')`，provider 持有 keys + HTTP + poll + download"。omnimux-drama 消费 `videoGenerate` 的现成模式（`omnimux-drama/src/index.js` L181-208）可以原样复制给 `videoProcess`，包括 `{ mode, taskId, url }` job handle、`wait: false` 提交、`taskId` 续询。

### Seam 契约（对齐 hub media job handle）

| Seam | 请求 | 成功 | 失败 |
|---|---|---|---|
| `videoProcess` | `{ capability: 'video_trim'\|'video_merge'\|'video_split'\|'video_scene_detect'\|'video_export'\|'slideshow_export', input, dest, wait?, taskId?, signal? }` | `{ mode: 'live'\|'submitted', taskId, url?, result? }` | `gxgen-unconfigured`、`gxgen-unreachable`、`gxgen-upstream`、`unknown-capability` |
| `pageRender` | `{ capability: 'social_card_render'\|'social_card_validate'\|'slideshow_page_render'\|'design_text_layer_render'\|'web_page_screenshot', input, dest, wait?, taskId?, signal? }` | 同上 | 同上 |

语义完全复刻 hub media 层：`wait` 默认 true（提交 + 轮询 + 下载到 `dest` → `mode: live`）；`wait: false` 只提交（→ `submitted` + `taskId`，vertical 立刻把 `taskId` 写进自己的盘）；带 `taskId` 则跳过提交直接续询。产物经 `/v1/artifacts/{id}`（带 token）下载写盘，插件不留任务账本——会话级后台任务走 dsh `ctx.jobs`。

### 工具（模型可调）

两个粗粒度工具，capability slug 作为参数（11 个 capability 各建一个工具太吵，且 registry 本身就是服务端真源）：

- `gxgen_video_process` — 描述里枚举 6 个 video slug 及各自 input 关键字段
- `gxgen_page_render` — 描述里枚举 5 个 browser slug

### Config 与凭据

```text
Config.gxgen:
  videoEngine:   { baseUrl: '', tokenEnv: GXGEN_ENGINE_TOKEN }   # env: GXGEN_VIDEO_ENGINE_URL 覆盖
  browserEngine: { baseUrl: '', tokenEnv: GXGEN_ENGINE_TOKEN }   # env: GXGEN_BROWSER_ENGINE_URL 覆盖
  timeoutMs / listTimeoutMs 与 hub 同款分层
```

- `baseUrl` 空 → 全部调用抛 `gxgen-unconfigured`（fail-closed，学 `agent_runtime_unconfigured`，不静默回落 localhost）
- token 经 header `X-Gxgen-Engine-Token`，不进日志、不进 span
- 包内结构（学 hub media 层分层）：`src/engine/{client.js, job.js, video.js, page.js}` + `config.js`

### 插件形态

`package.json` 仿 `omnimux-drama`（`type: module`、`main: src/index.js`、`dsh.bundle.patch`）；`apply(ctx)` 里 `ctx.provide` 两个 seam + `ctx.tools.register` 两个工具；L1 测试 `node --test src/*.test.js` 用 mock fetch，不依赖真实服务。

## Consequences

- **变容易**：drama 之外的 vertical（电商设计图卡片、品牌营销素材）拿到现成的视频剪辑/字幕烧录/社媒卡片渲染能力；Gxgen 侧加 capability 只需更新工具描述，插件结构不动。
- **变难**：preset 从现在的插件集合再多物化一个；`yarn omnimux:stage` / `yarn omnimux:sync` 流程要覆盖 `dsh-gxgen`；环境矩阵多两个 URL + 一个 token 要在各层（dev profile / 生产 profile）配置。
- **明确的非目标**：不抽 agent-runtime（与 dsh LLM surface 冲突）；不抽 r2-transfer-worker；不在插件里做任务账本/任务 UI；不复制 Gxgen channel 类型整数进插件。

## 实施步骤（拍板后）

1. **前置**：跑 `dev-doctor.sh` 校验环境；按 AGENTS.md 要求先做社区插件搜索（`dsh-plugin-find`），确认没有现成的 Gxgen/引擎类插件再动手。
2. **L1**：`plugins/dsh-gxgen` 骨架 + `client.js`（统一 job API 封装）+ 单测（mock fetch 覆盖 submit/poll/cancel/artifact/超时/401/fail-closed）。
3. **L2**：`yarn omnimux:dev start gxgen-v1 dsh-gxgen`，对运行中的 engine（本地 OrbStack `:8100` 或 Railway dev）做真冒烟：逐 capability execute + 产物落盘。
4. **L3**：`yarn omnimux:sync dsh-gxgen` 物化进生产 profile，再 `yarn omnimux:restart`。

## 开放问题（已全部拍板，2026-08-21）

| # | 问题 | 决议 |
|---|---|---|
| 1 | 插件位置 | **`omnimux-dsh/plugins/` 兄弟目录**，随 preset 出包 |
| 2 | engine 地址与 token | **引擎本地 OrbStack（`127.0.0.1:8100` + local-dev-token）**；对调用方全程本地文件进出，URL 细节插件内部封装（本地文件桥） |
| 3 | agent-runtime 是否彻底排除 | 排除；未来若要 one-shot 专家调用，按 `textComplete` 模式另立提案 |
| 4 | 能力粒度 | **粗粒度工具**（slug 作参数），错误信息自带 slug 清单 |

补充决议：v1 实施**先做 video-engine**（全量 11 个能力，比 README 多出 audio_extract / media_metadata / video_thumbnail_extract / video_inline_analysis_prepare / audio_prepare 五项）；browser-engine v2 并入同一插件。验收以**聊天直接可用**为主。
