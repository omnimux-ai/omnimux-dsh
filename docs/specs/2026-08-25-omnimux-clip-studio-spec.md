---
title: "OmniMux Clip Studio（omnimux-clip）完整微应用技术 Spec"
id: "spec-omnimux-clip-studio-spec"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-08-25"
updated: "2026-08-27"
authors: ["x", "agent-architect"]
subsystem: "omnimux-clip"
tags: ["omnimux-clip", "openreel", "micro-app", "sidebar-tab", "spec"]
supersedes: []
superseded_by: null
related:
  - "docs/specs/2026-08-25-omnimux-clip-studio-prd.md"
  - "docs/contracts/openreel-vendor-contract.md"
  - "docs/contracts/gxgen-workflow-migration.md"
  - "docs/contracts/sidebar-extra-entries.md"
  - "docs/contracts/ui-design-guidelines.md"
  - "docs/contracts/hub.md"
---

# OmniMux Clip Studio（omnimux-clip）完整微应用技术 Spec

> **流程部分 SUPERSEDED — 2026-09-09 / #864：** 下文 L2 独立环境与合入前浏览器验收要求退役，OpenReel 产品和架构约束不变。当前流程以 [dev-pipeline](../contracts/dev-pipeline.md) 和 [plugin-qa](../contracts/plugin-qa.md) 为准：worktree 自动化/静态与独立评审 → required CI/MQ → main → 按需 Dev 45120/ego 验收。历史结果不重标。

> **版本**：v3.0.0（2026-08-27：废弃 Headless + 手写 GUI；完整套用 OpenReel 官方源码，以 `dsh-better-sidebar` Tab 为 P1 主座）
> **状态**：架构已定型，编码以本文件为准
> **关联 PRD**：[2026-08-25-omnimux-clip-studio-prd.md](./2026-08-25-omnimux-clip-studio-prd.md)
> **Vendor 红线**：[openreel-vendor-contract.md](../contracts/openreel-vendor-contract.md)
> **对标**：MiniMax Design `bundled-plugins/clip-studio`（把 OpenReel 当完整微应用，而不是无头引擎）
> **冲突**：PRD 与本文件冲突时以本文件为准；Vendorize 能力归属以 L1 契约为准。

---

## 0. 已冻结决策

| # | 决策 | 内容 |
|---|---|---|
| 1 | 独立插件 | 剪辑器 **MUST** 作为独立插件 `omnimux-clip`。**MUST NOT** 把 OpenReel / WebCodecs / WebGPU / 时间轴放进 `omnimux-workflow` canvas island。 |
| 2 | 完整微应用，禁止 Headless 拆分 | **MUST** 完整 Vendorize `Augani/openreel-video` 官方全套源码（原生 GUI + 渲染管线）。**MUST NOT** 把 OpenReel 拆成无 UI 引擎再手写 TopHeader / 资源库 / 属性面板 / 时间轴壳。 |
| 3 | P1 主座 = 侧边栏 Tab | Phase 1 **MUST** 注册 `ctx.betterSidebar.registerTab({ id: 'omnimux-clip:studio' })`，进入 `[data-dsh-panel-host]` 内容面板列表。**MUST NOT** 以 `shell.overlay` 一级全屏页作为 P1 主入口。**MUST NOT** 用 `conversation.view`。 |
| 4 | 画布后置 | 画布 `video_composition` Launcher + DOM 事件桥是 **Phase 3**。P1 不依赖画布即可新建 / 保存。 |
| 5 | Agent 后置 | `clip_*` tools 是 **Phase 2**。P1 不注册工具也可以验收 Tab + 落盘。 |
| 6 | 旧代码作废 | `omnimux-workflow/src/canvas/video-editor/**` 整树删除（可在 P3 前完成）。clip 插件内已有的自研 `TopHeader` / `LeftSidebar` / `RightInspector` / `BottomTimeline` / 自研 `timelineStore` **MUST** 在 P1 被官方 OpenReel GUI 替换，不得继续当主界面。 |
| 7 | 主题 | 宿主胶水与新增空态走 DSH 官方 `--dsw-alias-*` / `--dsw-specific-*`。**MUST NOT** 再写「xAI GUI 规范」。OpenReel 原生界面只做 CSS 变量映射。 |
| 8 | 自包含成片 | 导出 **MUST** 走官方 OpenReel WebCodecs + Muxer。**MUST NOT** 把多轨合成拆给 `omnimux-video` / FFmpeg。 |
| 9 | 跨插件通信（P3） | 两棵树 **只** 交换 plain JSON。通道 = Host HTTP + DOM CustomEvent。禁止跨树传 React 元素 / ref / context。 |
| 10 | 命名 | 源码 `plugins/omnimux-clip/`。id / 目录 / manifest `id` = `omnimux-clip`。显示名：「剪辑工坊」/ OmniMux Clip。 |
| 11 | 密钥 | 插件不持 Key。ASR 若需要模型，走 hub `textComplete`。 |
| 12 | 许可证 | 保留 `LICENSE.openreel.txt` + `THIRD_PARTY_NOTICES.md`。禁止引入 AGPL / GPL（ArcReel、墨音、ComfyUI）。 |

废弃声明（避免实现回潮）：

- ~~Headless OpenReel + 自研 xAI NLE 壳~~
- ~~P1 挂 `shell.overlay` Stage `clip-editor` 当主入口~~
- ~~P1 以画布 Launcher 为唯一打开路径~~
- ~~剪裁掉官方 GUI、只留 `engine/` 再自绘四宫格~~

---

## 1. 工程定位与物理边界

### 1.1 插件身份

| 项 | 值 |
|---|---|
| 插件 id | `omnimux-clip` |
| 显示名 | 中：剪辑工坊 / 英：OmniMux Clip |
| Tier | `T1: omnimux-clip`（平台应用，与 `omnimux-workflow` / `omnimux-assets` 同级） |
| 源码目录 | `plugins/omnimux-clip/` |
| P1 入口 | Client `src/client/index.js` → `ctx.betterSidebar.registerTab` |
| Host 入口 | `src/index.ts`（或现网 `src/index.js`）→ `dist/index.js` |
| 存储域 | `$DSH_HOME/omnimux/clip/{projects,exports,snapshots,tmp}/` |
| 依赖 | 必需 `omnimux`；P1 运行时依赖预置 `dsh-better-sidebar`；画布集成可选 `omnimux-workflow`（P3） |
| 系统二进制 | 无（纯客户端编解码） |

### 1.2 职责切分

```
omnimux-clip                         omnimux-workflow              omnimux-video
────────────                         ────────────────              ────────────
完整 OpenReel 微应用                  DAG / 节点 / 连线             ffmpeg 原子操作
better-sidebar Tab                    P3: Launcher Card            Headless 批处理
本地工程 CRUD                         P3: 收 JSON 回写              视频理解
P2: clip_* RPC                        不 import OpenReel           不持时间轴
不实现 hub chrome / auth              不持 WebGPU / 解码器
```

`omnimux-clip` **MUST NOT**：实现 hub chrome、auth、provider 路由、写 `series/`、直连 OmniMux HTTP。
`omnimux-workflow` **MUST NOT**：实现时间轴、解码器、字幕渲染器、静音检测。

### 1.3 MiniMax 实践 → OmniMux 映射

| MiniMax Design | OmniMux（本版） |
|---|---|
| `bundled-plugins/clip-studio/` 独立微应用 | `plugins/omnimux-clip/` 独立 Cordis 插件 |
| 完整嵌入 OpenReel 官方 GUI | 完整 Vendorize 官方 GUI + 管线到 `src/client/openreel/` |
| 微应用挂在宿主工作台面板 | `dsh-better-sidebar.registerTab`（内容面板 Tab） |
| `window.hub` JSON | P3：`omnimux-clip-*` DOM 事件 + Host HTTP |
| `agent.methods` `project.*` | P2：`clip_get` / `clip_edit` / `clip_view` / `clip_snapshot` / `clip_diagnostics` / `clip_export` |
| 无 host 时本地文件 | P1：无画布 payload 时独立工程 |

不采用 iframe：DSH client 已是同 document 多树；iframe 会切断 `--dsw-*` 与 cookie。Tab 内容直接挂在 `[data-dsh-panel-host]`。

不采用 `shell.overlay` 当 P1 主座：一级页会藏 `[data-dsh-panel-host]`（见 sidebar-extra-entries），与「侧边栏 Tab 插件」互斥。P3 若需从画布拉起，也是 `openTab('omnimux-clip:studio')`，不是再开一层全屏 overlay。

---

## 2. 物理目录

```
plugins/omnimux-clip/
├── dsh.manifest.json
├── package.json
├── cordis.patch.yml
├── LICENSE
├── LICENSE.openreel.txt             # OpenReel MIT 原文
├── THIRD_PARTY_NOTICES.md
├── README.md
├── scripts/
│   ├── build-host.mjs
│   └── build-client.mjs             # react / react-dom / dsh-client-ui-primitives external
├── skills/
│   └── clip-craft/
│       └── SKILL.md                 # P2
├── src/
│   ├── index.js                     # Cordis：HTTP / seam / P2 tools
│   ├── config.js
│   ├── errors.js                    # ClipDomainError
│   ├── paths.js
│   ├── store/
│   │   └── projectStore.js          # 工程落盘
│   ├── http/
│   │   └── routes.js                # /omnimux-clip/api/*
│   ├── seam/
│   │   ├── clipEditor.js
│   │   └── types.js
│   └── client/
│       ├── index.js                 # registerTab + 空态胶水
│       ├── ClipStudioTab.jsx        # Tab 根：挂载官方 App，不自绘四宫格
│       ├── theme/
│       │   └── dsw-map.css          # OpenReel CSS 变量 → --dsw-*
│       ├── host/
│       │   ├── projectApi.js        # fetch /omnimux-clip/api/*
│       │   └── persistence.js       # 保存 / 打开工程
│       └── openreel/                # 官方全套源码（GUI + 管线），不是「纯 engine」
│           ├── App.jsx              # 官方根组件（名称以 upstream 为准）
│           ├── components/          # 资源库 / 视口 / 属性面板 / 时间轴
│           ├── timeline/
│           ├── render/
│           ├── audio/
│           ├── export/
│           └── effects/
```

目录硬规则：

1. Vendor 根是 `src/client/openreel/`（完整应用）。旧路径 `src/client/engine/openreel/` 若仍在，P1 必须迁到此根或把 GUI 一并放进去，**禁止**只留无头 `engine/`。
2. **禁止**再建一套 `components/{TopHeader,LeftSidebar,CenterStage,RightInspector,BottomTimeline}.jsx` 当主界面。现有自研组件在 P1 删除或降为 Tab 外壳（工程名、保存失败 toast），不得替代官方面板。
3. 画布侧（P3）允许改动的仅：`videoComposition` Launcher、事件常量、执行器读产物、删除 `video-editor/**`。跨插件类型两边各放一份，以本 spec §4 为真源。

---

## 3. 扩展点选型

### 3.1 omnimux-clip 提供

| 扩展点 | Phase | 选型 | 说明 |
|---|---|---|---|
| Tab | P1 | `ctx.betterSidebar.registerTab` | id `omnimux-clip:studio`，`single: true`，`order` 避开画布 tab（画布现为 5，clip 取 20） |
| HTTP | P1 | `/omnimux-clip/api/projects*` `/save-export` | 工程与导出落盘 |
| Storage | P1 | `$DSH_HOME/omnimux/clip/` | 工程 JSON + mp4 + 截帧 |
| Seam | P2/P3 | `clipEditor` | `open / save / export / getActive` |
| Tools | P2 | `clip_*` 六个 | Agent 面 |
| DOM 事件 | P3 | `omnimux-clip-*` | 画布桥 |
| Slot `shell.overlay` | 不用 | — | P1 主入口禁止 |
| `sidebar.extra` | 不做 P1 | — | 不阻塞 Tab |

### 3.2 Tab 注册（对齐 workflow canvas tab）

```js
ctx.inject(['betterSidebar'], (inner) => {
  ctx.effect(() => inner.betterSidebar.registerTab({
    id: 'omnimux-clip:studio',
    title: () => t('tab.title'), // 「剪辑工坊」
    icon: renderClipIcon,        // 矢量 SVG，禁止 emoji
    order: 20,
    hidden: false,
    single: true,
    component: (props) => createElement(ClipStudioTab, { ...props, t }),
  }), 'omnimux-clip: studio tab')
})
```

规则：

- `betterSidebar` 用 `ctx.inject` 延迟注册，加载顺序不保证。未装 better-sidebar 时插件 Host 仍在，Tab 缺席，**不得**改挂 `conversation.view` 或 `shell.overlay` 顶上。
- 打开：`openTab('omnimux-clip:studio')`（P3 画布按钮、P2 Agent 需要预览时）。
- 关闭 / 切走：`ClipStudioTab` unmount 必须释放官方解码器、AudioContext、WebGPU device、revokeObjectURL。
- 不设 `data-dsh-product-stage`。一级页 chrome 会藏 `[data-dsh-panel-host]`，会把本 Tab 宿主藏掉。

### 3.3 omnimux-clip 消费

| 能力 | 来源 | 用途 |
|---|---|---|
| `betterSidebar` | `dsh-better-sidebar` | P1 主座 |
| `mediaSeam`（可选） | `omnimux` | 读资产 `real_path` |
| `textComplete`（P2 ASR） | hub | 不自持 key |

成片由官方 OpenReel 前端完成，零 ffmpeg。`omnimux-video` 不进入剪辑主干。

---

## 4. 数据契约

时间单位：工程内 **毫秒整数**。Agent 入参允许秒，Host 边界换算。禁止帧号、禁止 `00:00:00:00` 当存储真源。

### 4.1 P1：官方工程原样落盘

P1 **MUST** 把 OpenReel 官方工程对象（upstream 的 project / timeline JSON）原样写入：

```
$DSH_HOME/omnimux/clip/projects/<projectId>/project.json
$DSH_HOME/omnimux/clip/projects/<projectId>/media/...
```

允许包一层宿主元数据，但不得改写官方字段含义：

```ts
export interface ClipProjectRecord {
  version: '3.0';
  projectId: string;
  title: string;
  updatedAt: string;          // ISO
  openreel: unknown;          // 官方 schema 原样
}
```

`openreel` 的 TypeScript 形状以 vendor 源码为准，本 spec 不另造一套 Track/Clip 模型来「翻译」官方状态机。

P2 / P3 若 Agent 或画布需要稳定视图，再提供 **只读投影** `TimelineView`（从官方 schema 派生）。投影失败不得倒逼重写官方 store。

### 4.2 旧 TimelineSchema（降级）

v2 spec 的 `TimelineSchema` / `ClipModel` / `TrackModel` 不再是 P1 写盘真源。P3 画布节点若仍要内联快照，只存 `projectId`，或存上述只读投影。禁止为了迁就旧类型去改 OpenReel store。

### 4.3 Open / Save（P3 画布；P1 可先实现 Host 等价 HTTP）

```ts
export interface OpenClipEditorPayload {
  source: 'tab' | 'canvas' | 'agent';
  nodeId?: string;
  workspaceId?: string;
  nodeTitle?: string;
  projectId?: string;
  draftOpenreel?: unknown;
  upstreamInputs?: {
    videos: Array<{ path: string; name: string; durationMs?: number }>;
    audios: Array<{ path: string; name: string; durationMs?: number }>;
    images: Array<{ path: string; name: string; displayDurationMs?: number }>;
    captions?: Array<{ text: string; startTimeMs: number; durationMs: number }>;
  };
}

export interface SaveClipEditorPayload {
  nodeId?: string;
  projectId: string;
  output?: {
    videoPath: string;
    thumbnailPath: string;
    durationMs: number;
    width: number;
    height: number;
  };
}
```

打开规则：

1. 有 `projectId` 且磁盘有记录 → 载入官方工程。
2. 有 `draftOpenreel` → 载入该对象。
3. 有 `upstreamInputs`（P3）→ 交给官方导入，而不是自研铺轨器。
4. 否则空工程（P1 新建）。

落盘 **MUST** 把运行时 blob URL strip 成 `media/` 相对路径。

### 4.4 画布节点 data（P3）

```ts
export interface VideoCompositionNodeData {
  title: string;
  projectId?: string;
  status: 'idle' | 'editing' | 'rendering' | 'completed' | 'error';
  renderProgress?: number;
  outputVideoUrl?: string;
  outputThumbnailUrl?: string;
  outputDurationMs?: number;
  errorMessage?: string;
}
```

端口：in `image|video|audio|text`，out `video`。节点不内嵌完整官方工程。

### 4.5 DOM 事件（P3）

| Event | Direction | detail |
|---|---|---|
| `omnimux-clip-open` | canvas → clip | `OpenClipEditorPayload` |
| `omnimux-clip-save` | clip → canvas | `SaveClipEditorPayload` |
| `omnimux-clip-progress` | clip → canvas | `{ nodeId, status, renderProgress }` |
| `omnimux-clip-close` | clip → canvas | `{ nodeId }` |

`bubbles: true` 打在 `window`。JSON-serializable。detail ≤ 1MB；更大只传 `projectId`。clip 侧收到 open 后 `openTab('omnimux-clip:studio')`。

### 4.6 Seam `clipEditor`（P2/P3）

```ts
interface ClipEditorSeam {
  open(payload: OpenClipEditorPayload): Promise<{ projectId: string }>;
  get(projectId: string): Promise<ClipProjectRecord>;
  save(payload: SaveClipEditorPayload): Promise<void>;
  export(projectId: string, dest: string): Promise<{
    mode: 'live';
    files: Array<{ path: string; kind: 'video' | 'image' }>;
  }>;
}
```

`open`：写工程 + `openTab`。`export`：调官方 ExportEngine，再落盘。成功导出才允许称 `mode: 'live'`。

---

## 5. Agent 工具（Phase 2）

| MiniMax | DSH tool | timeout | 写? |
|---|---|---|---|
| `project.get` | `clip_get` | 15s | 否 |
| `project.edit` | `clip_edit` | 180s | 是 |
| `project.view` | `clip_view` | 5s | 否 |
| `project.snapshot` | `clip_snapshot` | 60s | 否（png → `snapshots/`） |
| `project.diagnostics` | `clip_diagnostics` | 10s | 否 |
| （导出） | `clip_export` | 300s | 是 |

`clip_edit.operations[]` 冻结的 `type`：

`split_clip` · `trim_clip` · `remove_clip` · `remove_range` · `move_clip` · `add_clip` · `import_media` · `set_speed` · `set_volume` · `add_text` · `set_subtitle_style` · `cut_silences` · `add_transition`

一条 `clip_edit` = 一个官方 Undo 步。`validateOnly: true` 只校验。
`clip_view` / `clip_snapshot` 在 Tab 未挂载时 `{ code: 'PREVIEW_NOT_READY' }` 作为 **抛错**（`ClipDomainError`），禁止 `{ ok: false }` 当成功返回值。
实现必须调官方状态机原子，禁止另写一套 ops 去改自研 store。

Skill：`plugins/omnimux-clip/skills/clip-craft/SKILL.md` 只写剪辑判断，不重复 tool catalog。

---

## 6. UI 规格

P1 主界面 = **官方 OpenReel GUI 原样**，挂在 better-sidebar Tab 内容区。豁免 4 层一级页。

仍强制：

- Tab 标签、空态、保存失败、权限错误：`dsh-ui-kit` + `--dsw-alias-*`。禁止裸 `<button>` / `<select>`，禁止 emoji 图标。
- 官方 GUI：允许 `dsw-map.css` 把 OpenReel 变量指到 `--dsw-*`。禁止新 hex 岛，禁止为品牌感重排四宫格。
- `react` / `react-dom` / primitives **external**。OpenReel 打进 clip bundle，禁止第二份 React。
- 控件高度 32 / 28 / 24 适用于 **宿主胶水**；官方时间轴内部控件跟 upstream，不强制改成 32px。

布局（官方，不是自研）：

```
┌─────────────────────────────────────────────────────────────┐
│ OpenReel 原生顶栏 / 工具（Vendor，禁止自研替换）              │
├──────────┬──────────────────────────────┬───────────────────┤
│ 左侧资源库│ 视口（WebCodecs / WebGPU）    │ 属性面板          │
├──────────┴──────────────────────────────┴───────────────────┤
│ 官方多轨时间轴 + 播放头 + 磁吸 + 波形                         │
└─────────────────────────────────────────────────────────────┘
```

宿主可在 Tab 外缘加一行工程名 / 保存状态，不得挡住官方面板。

P1 不做：专业调色轮、绿幕、多机位、协同光标、画布「保存并返回」。

---

## 7. 运行时与隔离

### 7.1 树

```
Host chrome React 18          better-sidebar 面板           workflow canvas (P3)
(sidebar / session)           omnimux-clip Tab              xyflow island
                              (OpenReel 官方 App)
        │                              │                            │
        └──────── DOM + JSON ──────────┴──── P3 CustomEvent / HTTP ─┘
```

**禁止** 把 OpenReel mount 进 canvas island。
**禁止** 打开 clip Tab 时设置 `data-dsh-product-stage`（会藏面板宿主）。

### 7.2 生命周期

- Tab mount：创建官方 App → 其内部创建 VideoDecoder / AudioContext / WebGPU。
- Tab unmount：走官方 teardown；若 upstream 未暴露，胶水层必须补 `close()` / `device.destroy()` / revokeObjectURL。
- 会话切换：跟随 better-sidebar 按会话的布局存储；不把解码器留在已切走的会话。

### 7.3 导出

```
官方 Timeline / Store
  → OpenReel ExportEngine (Web Worker)
      WebGPU / OffscreenCanvas 逐帧
      WebCodecs VideoEncoder + AudioEncoder
      Muxer → .mp4
  → POST /omnimux-clip/api/projects/:id/save-export
  → $DSH_HOME/omnimux/clip/exports/<projectId>.mp4
  → P3 才派发 omnimux-clip-save
```

---

## 8. OpenReel 引入

细节以 L1 [openreel-vendor-contract](../contracts/openreel-vendor-contract.md) 为准。本 spec 只钉实现落点：

1. Vendor 根：`src/client/openreel/`，**含官方 GUI**。
2. 剪裁：登录、云上传、CapCut 导入、upstream 独立 Router / 外层壳（与 DSH Tab 冲突的那一层）。**MUST 保留** 资源库、视口、属性面板、多轨、渲染、音频、导出、花字。
3. 官方源码禁止 `import` `@deepseek-ai/*` 或 clip Host 模块。胶水单向包官方 App。
4. 主题：只映射 CSS 变量，不重写组件。

---

## 9. 画布改造（Phase 3）

删除：`src/canvas/video-editor/**` 及对其的 import。

改写：

- `videoComposition.tsx`：Launcher（「开源 AI 视频剪辑工具…」「打开视频剪辑」）
- 按钮：`dispatchEvent('omnimux-clip-open')`；clip 侧 `openTab`
- 监听 `omnimux-clip-save` 写 `projectId` / `outputVideoUrl` / `status`
- 执行器：有 `outputVideoUrl` 才向下传 video，否则 `needs-clip-export`

未安装 clip：toast，不白屏。

---

## 10. Host HTTP（P1）

前缀：`/omnimux-clip/api`

| Method | Path | 作用 |
|---|---|---|
| GET | `/projects` | 工程列表（P1 空态） |
| PUT | `/projects/:id` | 写入 `ClipProjectRecord`（乐观锁 version） |
| GET | `/projects/:id` | 读取工程 |
| POST | `/projects/:id/save-export` | 接收前端 MP4 落盘 |
| POST | `/projects/:id/snapshot` | Tab 存活才截帧，否则 409 `PREVIEW_NOT_READY` |
| GET | `/health` | `{ clip: true }` |

写操作校验工作区路径，禁止写到 `clip/` 以外。

---

## 11. 错误码

`ClipDomainError`，`code` 稳定：

| code | 何时 |
|---|---|
| `needs-clip-plugin` | 画布打开但 clip 未加载（P3） |
| `needs-better-sidebar` | Tab 座缺失 |
| `export-encode-failed` | WebCodecs 编码器失败 |
| `PREVIEW_NOT_READY` | snapshot/view 时 Tab 未挂 |
| `timeline_gap` / `clip_overlap` / `media_missing` | diagnostics |
| `schema-too-large` | 事件 detail 超 1MB |
| `canceled` | 导出中断 |

工具失败必须抛错，禁止 `{ ok: false }` 当成功值。

---

## 12. 分阶段落地

### Phase 1（本 spec 当前验收范围）

1. 脚手架：manifest、Host 工程 API、Tab 注册。
2. 完整 Vendorize OpenReel **含官方 GUI**，在 Tab 内跑通。
3. 删除 / 停用自研四宫格与自研 timeline store 作为主路径。
4. 新建 / 打开 / 本地保存；可选官方导出 MP4。
5. DSW token 映射；关 Tab 释放资源。

### Phase 2

- 注册 `clip_*`，映射官方原子
- Skill `clip-craft`
- `clip_snapshot` 真合成帧
- `cut_silences` / ASR（经 hub，不持 key）可放本阶段后半

### Phase 3

- 画布 Launcher + 事件桥
- 上游素材交给官方导入
- 导出回写 `outputVideoUrl`

### 明确不做（v1）

- Headless 拆分 + 手写 GUI
- 剪辑器进 canvas island
- 新 ffmpeg 封装
- ComfyUI
- 电影级调色 / 绿幕 / 多用户协同
- P1 的 `shell.overlay` 主入口

---

## 13. 验收门槛

| # | 标准 | 证据 | Phase |
|---|---|---|---|
| A | `dsh --dump-config` 列出 `omnimux-clip`；OpenReel 不进 workflow canvas bundle | bundle / 源码 | P1 |
| B | 侧边栏内容面板出现「剪辑工坊」Tab，点开是官方 GUI（资源库+视口+属性+多轨），不是自研四宫格 | L2 Web 截图 | P1 |
| C | 新建工程 → 导入本地素材 → 保存 → 再打开，时间轴一致 | 录屏 + `projects/` 文件 | P1 |
| D | 真视频预览、真波形、真磁吸 | Vendor 五维门禁 | P1 |
| E | 导出真实可播 MP4，零 ffmpeg | 播放文件 | P1 |
| F | 关 Tab 后 decoder / AudioContext / WebGPU 释放 | unmount 钩子 | P1 |
| G | MIT 声明随包 | `LICENSE.openreel.txt` | P1 |
| H | 客户端 external react；宿主空态走 ui-kit | `build-client.mjs` | P1 |
| I | L2：`node scripts/omnimux.mjs dev start <task> omnimux-clip`，禁止杀桌面 App | 操作规范 | P1 |
| J | `clip_edit` 一次 = 一次 Undo；失败抛 `ClipDomainError` | 单测 | P2 |
| K | 画布双击 Launcher → 同一 Tab 打开；保存后节点有封面与 `outputVideoUrl` | 录屏 | P3 |
| L | 未装 clip 时画布不崩溃 | toast | P3 |

---

## 14. 实施顺序

1. Tab 空壳：`registerTab` + 占位，能在内容面板列表里点开。
2. Vendorize 官方全套 GUI 进 Tab，能新建空时间轴。
3. Host 工程 PUT/GET + 本地保存 / 再打开。
4. 导入本地媒体 + 五维预览（真视频 / 波形 / 磁吸）。
5. 官方导出 MP4。
6. 删自研主界面。
7. **P2** Agent tools。
8. **P3** 画布桥；删 workflow `video-editor`。

不要在 Tab 能独立保存之前做画布或 Agent。不要在官方 GUI 进 Tab 之前写自研时间轴「过渡实现」。

---

## 15. 对照 AGENTS.md

### 15.1 命名

插件 id、目录、`dsh.manifest.json` `id`、L2 `dev start` 参数、`dump-config` 包名四面同一字符串 `omnimux-clip`。禁止 `dsh-clip` / `OmniMux-clip` / `omnimux_clip`。工具名仍是 `clip_*`。

### 15.2 硬边界

| 规则 | 落点 |
|---|---|
| 只放 `plugins/omnimux-clip/` | §1.1 |
| 不 fork 官方 packages | 全文 |
| 不做 hub chrome / auth | §1.2 |
| 称 `omnimux` 为 execution hub | 注释禁止写「网关插件」 |
| 只写 `$DSH_HOME/omnimux/clip/` | §1.1 |
| MIT OpenReel，不合入 AGPL | 决策 #12 |
| Settings 无一级 `settings.section` | 无独立设置页；开关走 `settings.plugin.item` |
| 剪辑工作台不是 4 层一级页 | 决策 #3，Tab 豁免 |
| 测试走 L2 Web | 验收 I |
| 工具失败抛错 | §11 |
| `mode: live` 才称真导出 | §4.6 |

### 15.3 与「新插件必须是垂直场景」

本插件是 T1 平台应用（与 workflow / assets 同级），不是 `omnimux-drama` 那种垂直，也不是中枢。不实现 logo / 登录 / 模型路由。

L0 路由矩阵应写：

| 用户意图 | Tier & Plugin ID | 目录 | 关键能力 |
|---|---|---|---|
| 本地多轨剪辑 | `T1: omnimux-clip` | `plugins/omnimux-clip` | P1 Tab `omnimux-clip:studio`；P2 `clip_*`；P3 画布事件 |

`omnimux-video` 仍是 T2 ffmpeg 处理引擎，本插件不替代它。
