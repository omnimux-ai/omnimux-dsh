---
issue: 1817
status: approved-for-implementation
date: 2026-09-14
---

# 挂载素材改为真图片附件 + 点亮素材条去格式标签

## 1. 问题

| # | 现状 | 证据 |
| --- | --- | --- |
| 1 | 点亮页面媒体后发送消息，插件只把一行文本拼进正文 | `App.tsx:2254`：`` `\n\n已点亮挂载的页面媒体素材：\n` + items.map(it => `[媒体 ${i}] (${it.type.toUpperCase()}): ${it.src}`) `` |
| 2 | 模型收到的是网址文本，能否"看到"图取决于它自己能否访问该站 | 同上：从未把图片字节取下来 |
| 3 | 点亮素材条每个缩略图叠加格式文本 | `MediaSnifferBar.tsx:148,163`：`typeTag = item.type === 'video' ? 'MP4' : (src.includes('.png') ? 'PNG' : 'JPG')` |

## 2. 范围

**范围内**
- 挂载**图片**素材：扩展下载该图 → 走既有图片附件校验 → 作为真正的图片随消息发出；消息气泡内显示图片预览
- 挂载**视频**素材：附件通道（`IMAGE_MEDIA_TYPES`）只接受图片，仍以网址发送；素材条与消息内显示缩略图 + 播放图标
- 点亮素材条移除格式文本

**范围外**
- 不改宿主附件协议（不新增视频附件）
- 不改页面媒体嗅探的识别逻辑
- 不改手工粘贴 / 拖拽图片的既有流程

## 3. 设计

### 3.1 网络许可（用户已确认的取舍）

扩展页面的 CSP `connect-src` 当前仅允许 `ws://127.0.0.1:*`、`http://127.0.0.1:*`、`https://raw.githubusercontent.com`，因此面板无法下载远程图片。需在两个 manifest（`manifest.json` 与 `manifest.firefox.json`，若后者含同字段）的 `content_security_policy.extension_pages` 的 `connect-src` 中追加 `https:`。

依据：该扩展已声明 `host_permissions: http://*/* https://*/*` 且注入所有页面，此项与其既有权限等级一致。风险与缓解写在 Issue #1817。

### 3.2 挂载图片的流程

1. 用户点亮素材 → 面板下载该 URL（带超时；失败即报错，**不重试、不静默**）
2. 校验：媒体类型必须在 `IMAGE_MEDIA_TYPES` 内；字节 / 像素 / 边长按宿主下发的 `imageLimits` 校验（与粘贴图片同一套规则，同一套错误文案）
3. 通过后作为待发图片进入输入框（用户可见缩略图，可移除）
4. 发送后：消息里显示图片预览（复用已有的媒体画廊组件），**正文不再出现该图片的网址文本**

### 3.3 视频素材

不在附件通道内。点亮后仍以网址形式进入正文，但素材条与消息内以缩略图 + 居中播放图标呈现，不出现 `MP4` 之类格式文本。

### 3.4 素材条

- 移除 `media-type-badge`（格式文本）及其计算逻辑
- 视频缩略图叠加居中内联 SVG 播放图标（不得用 emoji 或文本字符）
- 图片与视频的区分只靠：缩略图内容 + 播放图标

### 3.5 消息内图片的两种展示模式（2026-09-14 用户追加定稿）

用户原话：**「发送给 LLM 的用小卡片，生成结果或要展示给用户的图像，用大卡+小卡上下组合切换浏览方式展示。」**

| 消息来源 | 展示形态 | 理由 |
| --- | --- | --- |
| **用户消息**（`row.kind === 'user'`，即发给模型的素材） | **小缩略图**：`48×48`、圆角 `9px`、横向排列、间隔 `6px`、超出换行；**不要**大图舞台、**不要**下方小图条、**不要** `第几张/共几张` 计数。点击缩略图仍可全屏查看 | 用户不需要在消息记录里浏览自己发出去的素材，只需一眼看出"发了几张" |
| **助手消息**（生成结果 / 需展示给用户的图像） | **画廊**：大图占满宽度在上 + 下方 52px 小图条切换 + 右下角计数 —— 即 #1806 已批准并合入的形态，**不得回归** | 生成结果需要被浏览 |

实现提示：`MessageImages` 已具备 `align: 'start' | 'end'`（用户消息为 `end`、助手消息为 `start`），按此分派两种渲染模式即可；两者共用同一份取数逻辑（`session.attachment`）与全屏查看能力，不得复制两套取数实现。

### 3.6 失败与边界

- 下载失败 / 超时 / 类型不支持 / 超限：给出与粘贴图片一致的明确提示；该素材**不进入待发列表**，也不在正文里留下残缺文本
- 多张素材：逐张独立处理，单张失败不影响其余；全部处理完成后给一次汇总提示
- 与手工粘贴的图片共存：追加而非覆盖

## 4. 验收标准

| ID | 断言 |
| --- | --- |
| AC-1 | 点亮图片素材后，待发区出现该图缩略图 |
| AC-2 | 发送后消息内渲染图片预览（画廊），正文不含该图的网址 |
| AC-3 | 发往宿主的请求含 image content part（真图字节），而非仅网址 |
| AC-4 | 下载失败 / 类型不支持 / 超限时给出明确提示；待发区与正文都不留残缺项 |
| AC-5 | 多张素材逐个处理；一张失败不影响其他张；与手工粘贴图片共存 |
| AC-6 | 视频素材仍以网址进入正文，素材条与消息内显示播放图标 |
| AC-7 | 点亮素材条不再渲染任何格式文本（`JPG`/`PNG`/`MP4`/`VIDEO`） |
| AC-8 | 既有测试全部保持通过（含粘贴 / 拖拽图片、画廊、markdown 安全面） |
| AC-9 | CSP 变更后，面板仍能连本机宿主（回归）；且仅在实际挂载时才发起到外站的请求 |
| AC-10 | 用户消息里的图片渲染为**小缩略图**：单个边长 ≤ 52px、无画廊舞台元素、无 `第几张/共几张` 计数 |
| AC-11 | 助手消息里的图片仍渲染为**画廊**（大图 + 小图条 + 计数），即 #1806 的行为不回归 |
| AC-12 | 点击用户消息里的小缩略图可全屏查看大图 |

## 5. 实施约束

- 改动文件白名单：`extension/src/panel/App.tsx`、`extension/src/panel/components/MediaSnifferBar.tsx`、`extension/src/panel/MessageImages.tsx`、`extension/src/panel/attachments.ts`、`extension/src/panel/strings.ts`、`extension/src/panel/styles.css`、`extension/manifest.json`、`extension/manifest.firefox.json`、`extension/tests/**`
  - 说明：核心改动落在 `App.tsx`（挂载流程）、`MediaSnifferBar.tsx`（素材条）与 `MessageImages.tsx`（两种展示模式，见 §3.5）。
  - 修订记录（2026-09-14，用户追加定稿后）：新增 `MessageImages.tsx` 与 `styles.css` —— 用户消息需从 #1806 的画廊改为小缩略图，属于本任务范围。
- 复用既有图片附件校验（`prepareImageFiles` 及其错误码），**不得新写一套校验**
- 错误文案走 `strings.ts`，中英同步
- 不得用 emoji 或文本字符充当图标
- 状态留在组件内，不得把选中/挂载态提升到消息列表层

## 6. 验证方法

1. **单元/组件测试**：`pnpm --filter dsh-browser-extension test`（vitest + jsdom），覆盖第 4 节 AC
2. **类型检查**：`pnpm --filter dsh-browser-extension typecheck`（基线即红，按「本 diff 新增 0 条错误」口径判定：基线错误清单与本工作树错误清单逐字节 diff 为空）
3. **构建**：`pnpm --filter omnimux-browser run build:extension`（该脚本归属宿主包）与 `pnpm --filter dsh-browser-extension run build:harness`
4. **真实浏览器验收**：在本任务工作树内起 harness 或真实加载扩展，用 ego-browser 断言并留存 PNG 到 `.agent-reports/browser-attach-media/`

> 教训（来自上一任务）：`pnpm --filter` 写错包名会**静默 exit 0 且零输出**，给复核者假绿。以上命令必须实跑一次并把真实输出写进报告。
