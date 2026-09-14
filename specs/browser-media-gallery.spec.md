---
issue: 1806
status: approved-for-implementation
date: 2026-09-14
---

# 浏览器侧边栏 · 对话媒体预览改造规格

## 1. 问题与目标

Chrome 侧边栏插件的对话记录里，媒体预览当前不可用：

| 现状 | 证据 |
| --- | --- |
| 多图附件被压成 64×64 方块 | `styles.css` `.message-image.tile { width:64px; height:64px }` |
| 点开后只能看一张，无法切换 | `MessageImages.tsx` 的 `.image-lightbox` 只接收单个 `src` |
| 回复里的图片完全不渲染 | `markdown.ts` 的 `ALLOWED_TAGS` 白名单没有 `img` |
| 侧边栏内没有任何 `<video>` | panel 全目录 grep 无 video 元素 |

目标：把对话记录里的媒体预览做成可用的画廊，适配侧边栏这种竖屏窄栏（有效宽度 320–520px）。

## 2. 范围

**范围内**
- 消息附件媒体（`Row.images`，即 `ImageAttachmentRef[]`）渲染为画廊
- 回复正文（markdown）里的图片/视频标签安全渲染
- 全屏查看、键盘操作、窄栏自适应、加载与失败态

**范围外（不做）**
- 不新增视频附件上传能力：宿主附件协议 `IMAGE_MEDIA_TYPES` 只有图片，`Row` 类型无视频字段
- 不实现「左右排布」：用户在演示中已确认竖屏窄栏固定用上下排布，不留开关
- 不改宿主协议、不改会话/工具卡片行为

## 3. 设计定稿（已由用户批准的演示确认）

用户在演示页 `tmp/media-gallery-preview-demo.html` 上确认了以下交互，实施必须与之保持一致。

### 3.1 排布：上下

竖屏窄栏里宽度是稀缺资源、高度是可滚动的富余资源，因此：

```
┌──────────────────────────────┐
│  JPG              [2 / 4]    │  ← 舞台：占满整栏宽度，按素材比例定高
│        大图（含视频）          │     max-height 236px / min-height 104px
├──────────────────────────────┤
│ ▢  ▢  ▢  ▢                   │  ← 小图条：横排，52px 高，溢出时横滑
└──────────────────────────────┘
```

- 舞台宽度 = 容器宽度（**不**为小图条让出横向空间）
- 单素材（1 张）不渲染小图条

### 3.2 结构与类名

```
.gallery[.single]
  button.stage-box            aria-label=查看大图
    img | video
    span.stage-kind           左上角类型角标（JPG / PNG / MP4）
    span.stage-count          右下角 `第几张 / 共几张`，仅多素材时渲染
  div.rail                    role=tablist
    button.thumb              role=tab, aria-selected
      img | video(muted,无 controls)
      span.thumb-kind         左下角类型角标
      span.thumb-play         视频时叠加播放图标
```

### 3.3 尺寸与令牌（必须复用既有值，不得自创新颜色）

| 项 | 值 |
| --- | --- |
| 舞台圆角 / 描边 | `12px` / `1px solid var(--line)` |
| 舞台背景（含留白） | `var(--stage-bg)` |
| 舞台比例 | `aspect-ratio` = 素材宽高比；`max-height:236px`；`min-height:104px` |
| 小图尺寸 / 圆角 | `52×52` / `9px` |
| 舞台与小图条间距 | `7px`；小图之间 `6px` |
| 未选中 / 选中不透明度 | `0.62` / `1` |
| 选中描边 | `1px solid var(--ink-strong)` + `box-shadow: 0 0 0 1px var(--ink-strong)` |
| 角标字色 / 底色 | `#fff` / `rgba(0,0,0,.62)`，圆角 `6px`（小图 `4px`） |
| 新增令牌 | `--stage-bg`：深色 `#0c0c0e`，浅色 `#eceef1` |

现有令牌（`styles.css:2-58`）不得改动释义。

### 3.4 交互

| 动作 | 结果 |
| --- | --- |
| 点小图 | 舞台换为该素材；该小图 `aria-selected=true`；计数更新为 `N / 总数`；被选中项滚入小图条可视范围 |
| 点舞台 | 打开全屏查看 |
| 全屏内 `←` / `→` | 上一张 / 下一张，循环 |
| 全屏内 `Esc`、点背景、点关闭按钮 | 关闭全屏 |
| 全屏底部缩略图条 | 点击跳转到该素材 |

键盘可达性：舞台与小图均为原生 `button`，可 Tab 聚焦、Enter/Space 触发。

### 3.5 状态

- **加载中**：`img` 未就绪时舞台显示骨架占位（不许出现破图图标）
- **失败**：显示可点击重试的按钮，点击后重新发起 `session.attachment` 请求
- **视频**：`<video controls preload="metadata" playsinline>`，**不自动播放**；缩略图内用 `muted` 且不带 controls

### 3.6 回复内媒体（markdown）

- `ALLOWED_TAGS` 增加 `img`、`video`、`source`
- `ALLOWED_ATTR` 增加 `src`、`alt`、`width`、`height`、`controls`、`poster`
- `ALLOWED_URI_REGEXP` 收紧为仅 `https?://`（`javascript:`、`data:` 等一律不通过）
- 渲染后统一为 `img` 补 `referrerpolicy="no-referrer"` 与 `loading="lazy"`；为 `video` 补 `referrerpolicy="no-referrer"`、`preload="none"`、`playsinline`
- 回复内媒体**不**纳入画廊（它们位于文本流中间），只做安全渲染

隐私说明：远程媒体加载会向第三方暴露请求来源，故强制 `no-referrer` 与懒加载。

## 4. 验收标准

每条给出可测断言。测试文件建议 `extension/tests/message-media-gallery.spec.ts`。

| ID | 场景 | 断言 |
| --- | --- | --- |
| AC-1 | 单素材 | 只有舞台，无 `.rail`；舞台宽度等于容器宽度 |
| AC-2 | 多素材（4 张） | 渲染 4 个 `.thumb`；`.rail` 的 `flex-direction` 为 `row` |
| AC-3 | 切换 | 点第 3 张小图后：舞台 `img.src` 变为第 3 张、`.stage-count` 文本为 `3 / 4`、仅第 3 张 `aria-selected=true` |
| AC-4 | 全屏打开 | 点舞台后存在 `[role=dialog]`；其内缩略图数 = 素材数 |
| AC-5 | 全屏翻页 | 全屏内按 `ArrowRight` 后计数递增；按 `ArrowLeft` 后回退；首尾可循环 |
| AC-6 | 全屏关闭 | 按 `Escape` 后 `[role=dialog]` 不再存在 |
| AC-7 | 加载态 | 请求未 resolve 时舞台不渲染 `img`，渲染占位 |
| AC-8 | 失败态 | 请求 reject 后出现重试按钮；点击后再次调用 `session.attachment` |
| AC-9 | 窄容器无溢出 | 容器宽度设 300px 时，画廊 `scrollWidth <= clientWidth + 1` |
| AC-10 | 多素材不撑高 | 8 张素材时，`.rail` 高度 ≤ 52px 且画廊总高度 ≤ 舞台高度 + 59px |
| AC-11 | 视频素材 | mediaType 为 `video/mp4` 时舞台渲染 `<video>`，缩略图渲染 `<video muted>` 且播放图标存在 |
| AC-12 | 回复内图片 | `renderMarkdown('![](https://a/b.png)')` 输出含 `<img>` 且带 `referrerpolicy="no-referrer"` |
| AC-13 | 回复内视频 | `renderMarkdown('<video src="https://a/b.mp4"></video>')` 输出保留 `video` 且带 `controls` |
| AC-14 | URI 安全 | `javascript:` 与 `data:` 形式的 `src` 不进入输出 |
| AC-15 | 无回归 | 纯文本消息渲染不变；既有 `chat-bubble-ui-polish` / `panel-media-attach-lit` 等测试保持通过 |

## 5. 实施约束

- 改动文件白名单：`extension/src/panel/MessageImages.tsx`、`extension/src/panel/styles.css`、`extension/src/panel/markdown.ts`、`extension/src/panel/strings.ts`、`extension/src/panel/attachments.ts`（仅在需要新增视频类型时）、`extension/tests/**`、`extension/vite.harness.config.ts`、`extension/package.json`（仅限新增 harness 相关脚本）
  - 修订记录（2026-09-14，独立评审后）：初版遗漏了 §6.4 真实浏览器 harness 所必需的两个基础设施文件（`vite.harness.config.ts` 与 `package.json` 的 `build:harness` 脚本）。二者不夹带产品行为，现补入白名单。
- 消息行 `MessageBody` 已 memo 化：画廊状态必须落在画廊组件内部，禁止把选中态提升到消息行或列表层，避免打字时整列重渲染
- 深色 / 浅色两套令牌都要覆盖，`prefers-color-scheme` 与 `data-theme` 两种切换路径都要正确
- 不得使用 emoji 或文本字符充当图标（UI 规范硬规则），播放/关闭/箭头一律内联 SVG
- 文案走 `strings.ts` 的 `PanelCopy`，中英双语同步补齐

## 6. 验证方法

1. **单元/组件测试**：`pnpm --filter dsh-browser-extension test`（vitest + jsdom），覆盖第 4 节全部 AC
2. **类型检查**：`pnpm --filter dsh-browser-extension typecheck`（基线即红，按「本 diff 新增 0 条错误」口径判定）
3. **构建**：`pnpm --filter omnimux-browser run build:extension`（该脚本归属宿主包 `plugins/omnimux-browser`，不在 `extension` 包里）与 `pnpm --filter dsh-browser-extension run build:harness`
4. **真实浏览器验收**：在本任务工作树内起 harness（组件真实渲染 + 固定数据），用 ego-browser 打开并断言几何与交互，保存 PNG 截图到 `.agent-reports/browser-media-gallery/`

真实浏览器证据必须来自本工作树自身，不得引用共享 Dev 实例。

> 修订记录（2026-09-14，独立评审后）：初版把过滤名误写为 `omnimux-browser`（那是宿主包），命中的是无 `test` 脚本的包，命令 exit 0 且零输出 —— 属**空跑**，会让照本规格复核的人拿到假绿。正确包名是 `dsh-browser-extension`（`extension/package.json` 的 `name`）。
