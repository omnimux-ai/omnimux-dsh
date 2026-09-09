---
title: "openreel-vendor-contract — OpenReel 完整微应用引入与反自研契约"
id: "contract-openreel-vendor-standard"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-27"
updated: "2026-08-27"
authors: ["x", "agent-architect", "agent-director"]
subsystem: "omnimux-clip"
tags: ["openreel", "nle", "vendor", "anti-reinvention", "clip", "micro-app", "governance"]
supersedes: []
superseded_by: null
related:
  - "docs/specs/2026-08-25-omnimux-clip-studio-prd.md"
  - "docs/specs/2026-08-25-omnimux-clip-studio-spec.md"
  - "docs/contracts/plugin-qa.md"
  - "docs/contracts/hub.md"
  - "docs/contracts/ui-design-guidelines.md"
  - "docs/contracts/gxgen-workflow-migration.md"
---

# openreel-vendor-contract — OpenReel 完整微应用引入与反自研契约

> **版本**：v2.0.0 | **生效日期**：2026-08-27 | **权威级别**：L1
> **适用范围**：`omnimux-clip` 一切时间轴、原生 GUI、渲染、预览、导出、多媒体处理、Tab 挂载与 Agent 剪辑接口。
> **本版变更**：废弃「Headless 引擎 + 手写 GUI」。OpenReel 官方全套源码（含专业多轨时间轴、资源库、属性面板、视口）必须以完整微应用形态 Vendorize。

---

## 1. 宗旨与最高红线

在 `omnimux-clip` 中，**严禁重新发明已经成熟的开源 NLE（含其官方 GUI）**。

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              【最高行为铁律】                               │
│                                                                             │
│  1. 完整微应用：MUST 套用 Augani/openreel-video (MIT) 官方全套源码，         │
│     包括原生 GUI 与 WebCodecs / WebGPU / Web Audio 管线。                   │
│  2. 禁止 Headless 拆分：MUST NOT 抽掉官方界面，只留无头引擎再手写            │
│     TopHeader / 资源库 / 属性面板 / 时间轴壳。                               │
│  3. 禁止自研替代：凡官方已有的状态机、解码、波形、磁吸、花字、导出，          │
│     一律 Vendorize，严禁手写伪实现。                                         │
│  4. 主题：宿主胶水走 DSH 官方 --dsw-* token。MUST NOT 再写 xAI GUI。         │
│     OpenReel 界面只做 CSS 变量映射，不重绘。                                 │
│                                                                             │
│  违者（含自研四宫格、Canvas 2D 占位贴图、假 MP4、假时间轴 store）            │
│  代码审查一律打回，五维质检判定 Blocker。                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

对标 MiniMax Design `bundled-plugins/clip-studio`：把 OpenReel 当完整微应用嵌进宿主工作台，而不是拆引擎。

---

## 2. 能力归属矩阵

### 2.1 严禁自研（必须来自官方 OpenReel）

| 领域 | 严禁（违规） | 必须采用 | 目标路径 |
|---|---|---|---|
| **完整 GUI** | 手写四宫格（TopHeader / LeftSidebar / CenterStage / RightInspector / BottomTimeline）替换官方界面 | 官方资源库、视口、属性面板、多轨时间轴、原生工具栏 | `src/client/openreel/components/`（以 upstream 目录名为准） |
| **多轨时间轴** | 自研 Zustand/JS store、自研 Track/Clip 增删与 Undo | 官方 Timeline Store、状态机、Undo/Redo | `src/client/openreel/timeline/` |
| **视频预览** | `loadImage` / 静态贴图伪造播放 | 官方 WebCodecs `VideoDecoder` / 逐帧管线 | `src/client/openreel/render/` |
| **画面视口** | 手写 `drawFrame` 占位 | 官方多层合成、播放头时钟 | `src/client/openreel/render/` 或 `stage/` |
| **音频与波形** | 只做音量滑杆、不提取波形 | 官方 Web Audio、FFT 波形、变速音调保持 | `src/client/openreel/audio/` |
| **剪辑交互** | 手写拖拽、忽略磁吸与波纹 | 官方 Magnet Snapping、Ripple、切片手柄 | `src/client/openreel/timeline/` |
| **成片导出** | 假 MP4 Muxer、强制外部 FFmpeg | 官方 Worker：`VideoEncoder` + `AudioEncoder` + Muxer | `src/client/openreel/export/` |
| **花字与转场** | 几个硬编码 Chip、简单透明度 | 官方排版引擎与转场 Shaders | `src/client/openreel/effects/` |

旧路径 `src/client/engine/openreel/` 若仍在，视为过渡；P1 必须把 **GUI 与管线** 收拢到 `src/client/openreel/`，不得只保留无头 `engine/`。

### 2.2 允许且仅限自研（宿主胶水）

| 胶水 | 边界 | 落点 |
|---|---|---|
| **Cordis** | 声明插件、生命周期、`dsh.manifest.json` | `src/index.js` |
| **侧边栏 Tab** | `ctx.betterSidebar.registerTab({ id: 'omnimux-clip:studio' })`；打开/关闭 Tab；unmount 释放 | `src/client/index.js`, `ClipStudioTab.jsx` |
| **工程落盘** | `/omnimux-clip/api/projects*`；`$DSH_HOME/omnimux/clip/` | `src/http/routes.js`, `src/store/projectStore.js` |
| **官方 schema 原样存** | 包一层 `ClipProjectRecord`，不改写官方字段 | `project.json` 的 `openreel` 字段 |
| **主题映射** | OpenReel CSS 变量 → `--dsw-alias-*` / `--dsw-specific-*`；空态用 ui-kit | `src/client/theme/dsw-map.css` |
| **Agent RPC** | Phase 2：`clip_*` 映射官方原子，禁止另写 ops 打自研 store | `src/tools.js` |
| **画布桥** | Phase 3：`omnimux-clip-open/save/progress/close` | `src/client/host/` |
| **合规** | `LICENSE.openreel.txt`、`THIRD_PARTY_NOTICES.md` | 包根 |

### 2.3 明确禁止的「过渡实现」

下列曾出现在 v1 文档或代码里，**现在直接算违规**，不得以「先跑通再换官方」为借口：

- Headless OpenReel + 自研 xAI / OmniMux NLE 壳
- 自研 `timelineStore` 当写盘真源，官方引擎只当渲染后端
- P1 主入口挂 `shell.overlay` / `conversation.view`
- 为品牌感重写官方资源库或时间轴
- 把多轨合成交给 `omnimux-video` / FFmpeg

---

## 3. Vendorize 目录与管理

1. **Vendor 根**：`plugins/omnimux-clip/src/client/openreel/`，含官方 GUI + 管线。
2. **剪裁**：
   - MUST 剔除：登录 / 权限、云上传（S3/OSS）、CapCut 导入、与 DSH Tab 冲突的独立 Router / 窗口壳。
   - MUST 保留：资源库、视口、属性面板、多轨、渲染、音频、导出 Worker、花字与着色器。
3. **单向适配**：官方源码禁止 `import` `@deepseek-ai/*`、`ClipStudioTab`、Host API。胶水包官方根组件，不得改官方内部去回调 DSH。
4. **依赖**：宿主 `react` / `react-dom` / `@deepseek-ai/dsh-client-ui-primitives` 构建 **external**。禁止第二份 React。
5. **工程格式**：P1 官方 JSON 原样落盘。禁止先发明第二套 `TimelineSchema` 再双向翻译官方 store。Agent / 画布需要的稳定视图用只读投影。

---

## 4. 挂载与主题

| 项 | 规则 |
|---|---|
| P1 主座 | `dsh-better-sidebar` 内容面板 Tab，`registerTab` |
| 禁止 | `conversation.view`；P1 用 `shell.overlay` 当主入口；打开 Tab 时设 `data-dsh-product-stage`（会藏 `[data-dsh-panel-host]`） |
| 未装 better-sidebar | Host API 可在，Tab 缺席；不得改挂其它座顶上 |
| 主题权威 | DSH 官方 `--dsw-*`（见 `ui-design-guidelines.md`）。Hub 全壳桥已染色。clip 消费，不实现第二套 xAI GUI，不建 `--omx-*` |
| 官方 GUI | 映射 CSS 变量，不重排、不换组件 |
| 宿主空态 | ui-kit；禁止裸 `<select>` / emoji 图标 |

---

## 5. 五维反自研 QA 门禁

在常规 `plugin-qa` 之上，`omnimux-clip` 专项：源码/自动化可验证项合入前检查，真实 GUI、播放、导出与生命周期证据在合入后 Dev 验收；以下 FAIL 阻止对应阶段通过，不要求合入前独立运行环境。

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           【反自研专项审查清单】                             │
│                                                                             │
│ 0. [完整 GUI] Tab 内必须是官方 OpenReel 界面（资源库 + 视口 + 属性面板 +     │
│    多轨）。若主路径仍是自研四宫格或 Headless+自绘壳 → 直接 FAIL。            │
│ 1. [真视频解码] 预览播放 MP4 时画面帧在流动，不是图片占位或黑屏；             │
│    Inspector 中存在真实 VideoDecoder / 官方渲染上下文。                     │
│ 2. [真波形] 载入音频/含音视频后，时间轴出现真实波形振幅图。                   │
│ 3. [真磁吸] 拖片段靠近切点有吸附与吸附线。                                   │
│ 4. [真硬件导出] Worker WebCodecs 输出可被本地播放器流畅播放的 MP4，          │
│    画面 / 转场 / 字幕对齐，零损坏。                                         │
│ 5. [生命周期] 关 Tab unmount 后 WebGPU / AudioContext / decoder             │
│    全部 destroy/close，无泄漏。                                             │
│                                                                             │
│ 任一项未达标 → FAIL，禁止放行。                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 阶段门禁（与 PRD / Spec 对齐）

| Phase | 本契约要求 |
|---|---|
| **P1** | Tab 可开；官方 GUI 完整运行；新建 / 本地保存；五维 0–5；禁止自研主界面残留 |
| **P2** | `clip_*` 只映射官方原子；一次 edit = 一次官方 Undo |
| **P3** | 画布只发 JSON + `openTab`；画布不持解码器、不 import vendor 源码 |

P1 未过五维，不得以 P2/P3 交付物抵数。

---

## 7. 违规退回

1. **提交检查**：PR 含 Headless 拆分、自研 NLE 伪实现或自研主 GUI，评审直接打回。
2. **定界**：对照本契约 §2 与 Spec §0 决策表，列必须改回官方模块的清单。
3. **修复**：从 `src/client/openreel/` 接官方能力，删自研主路径。
4. **复检**：合入前在隔离 worktree 完成相关自动化/静态检查与独立评审，通过 required CI/MQ；合入后物化 Dev，按 §5 在 45120 用 ego-browser 与共享 `verify:live` 逐项验收。无合入前独立运行环境；运行证据通过前不得声明交付完成。
