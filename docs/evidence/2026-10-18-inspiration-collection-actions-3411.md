---
title: "灵感库合集卡操作：悬停查看与加入会话工作树验证"
id: "evidence-inspiration-collection-card-actions-3411"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-18"
updated: "2026-10-18"
authors: ["agent"]
subsystem: "inspiration"
related:
  - "plugins/omnimux-inspiration/README.md"
  - "specs/inspiration-collection-card-actions-3411.spec.md"
---

# 灵感库合集卡操作工作树验证（#3411）

本记录只证明隔离任务工作树内的真实页面、真实本地插件处理链与真实 Chrome 交互；不证明完整宿主首装、正式会话附件链路、真实模型调用或共享开发版人工验收。测试使用独占合成资料库、本地封面、动态 loopback 端口，并为宿主能力注入 `__omnimuxWorkbench` / `__omnimuxSessionPrefill` 合成桩；未访问外网、未使用开发版 45120、未触碰用户 profile。本轮在评审修复（P1 未绑定会话归一、P2 查看走独立 `onView`、P2 操作层媒体暗房配色）之后重跑并补强。

## 身份与实际观察

目标工作树 HEAD 为 `836733c02bbbac1e92e8f8e5240490cffb91b09b`（已提交的实现基线）；评审修复仍是工作树内未提交改动，因此以真实源码指纹 `sourceSha256=899875120db9725ab5cf90ff7ab7f854bb79027c2a750d82366ad9804601e16e` 与构建指纹 `bundleSha256=762083d92887c8eb775ce848ef78872128e46661e34d6736c2fe0108e8c1389b` 标识被验证的精确代码。完整断言、截图尺寸与 sha256、像素采样、prefill 原文、reveal 序列与清理回执见[浏览器记录](2026-10-18-inspiration-collection-actions-3411/browser.json)。

真实链路：产品 `InspirationSection` 由工作树源码经 esbuild 打包渲染，合集写读走真实 production local handlers/store（`POST /omnimux/inspiration/local/collections` 返回 201，成员读取命中真实本地列表接口），页面由独立 headless Chrome 经 CDP 驱动。合成部分：`window.__omnimuxWorkbench`（`getSnapshot() -> { sessionId: 'qa-session-1' }`、`setConversationCollapsed`、`setFocus`）、`window.__omnimuxSessionPrefill.queueSessionPrefill` 记录请求并把 prompt 写入合成 composer；右侧会话栏为合成 DOM，发送按钮从未点击。页面额外注入 `rival-tokens.js` 的真实 media token CSS（隔离夹具只挂载 Section，不经过注入 token 的插件入口）。

**悬停显隐与配色。** 未悬停时操作层存在（`role=group`、`aria-label=合集操作`、未进入 `aria-hidden`），但计算样式 `opacity: 0`、`pointer-events: none`、`translateY(4px)`；两个按钮文本/`aria-label` 为 `查看` 与 `加入会话`，类名分别为 `.omnimux-inspiration-collection-action-view` / `-add`。真实指针移到封面顶部后，操作层 `opacity≈1`、`pointer-events: auto`、`translateY(0)`；操作层完全落在封面内，且与标题行、`更多操作` 菜单矩形均无交叠。按钮走媒体暗房 token：`查看` 计算样式 `color: rgb(255,255,255)` / `background: rgba(0,0,0,0.6)`，`加入会话` 计算样式 `background: rgb(255,255,255)` / `color: rgb(17,17,19)`。同页普通灵感卡没有该操作层与这两个按钮。[悬停截图](2026-10-18-inspiration-collection-actions-3411/hover-actions.png)。

**键盘 focus-within。** 鼠标停在页面右侧空白后，对 `查看` 按钮调用 `focus()`：操作层由 `opacity 0` 变为 `opacity≈1`、`pointer-events: auto`、`translateY(0)`，卡片 `:focus-within` 命中，`document.activeElement` 为该按钮。注：程序化 `focus()` 不触发 Chromium 的 `:focus-visible` 启发式，本记录只断言 focus-within 显隐，不断言焦点环视觉。[焦点截图](2026-10-18-inspiration-collection-actions-3411/focus-actions.png)。

**像素级对比度（WCAG AA）。** 在同一 focus-within 状态下，对每个按钮的裁剪区域连续截两次真实渲染像素：一次正常、一次仅把按钮 `color` 置为 transparent（底色/边框不动），两张图逐像素配对。字形像素定义为两图任一 RGB 通道差 ≥24 的像素（内缩 3px）；文字核心取字形像素中最亮/最暗者；背景取每个字形像素下方的真实合成像素；比值为全部字形像素上的最小值（保守口径）。实测：`查看` 白字对最差合成底色 `rgb(56,56,56)` 为 **11.73:1**；`加入会话` `#111113` 字对 `#ffffff` 底为 **18.86:1**，两者均 ≥4.5:1。算法、采样坐标与像素值见浏览器记录 `contrast` 字段。

**查看。** 点击 `查看` 走新增的独立 `onView`（Section 传 `libraryCollections.open`，不再复用整卡 `onOpen` 的选择合并链路），进入真实合集内容视图：`返回灵感库`、`重命名` 与合集标题「测试合集」，3 张成员卡（`qa-dance1` / `qa-dance2` / `qa-fashion1`）从真实本地接口读出；期间 prefill 记录为 0、会话栏 reveal 调用为 0、会话栏保持收起。[合集视图截图](2026-10-18-inspiration-collection-actions-3411/view-collection.png)。

**加入会话。** 悬停后点击 `加入会话`：真实读取合集成员（`collection_id` + `page_size=100` + `projection=lean`，HTTP 200），随后按 `setConversationCollapsed(false)` → `setFocus('split')` 顺序展开会话栏，并只产生一条 prefill：`targetSessionId='qa-session-1'`，合成 composer 文本与 prompt 完全相等。prompt 原文（当次合集 id 随运行生成）：

```
来源：OmniMux 灵感库 · 本地合集
合集：测试合集
合集 ID：collection_ccb9c5c8-e164-496b-b28a-305ff2bce82b
成员条数：3
成员清单：
1. 舞蹈参考一（成员 id：qa-dance1；平台：tiktok；类型：image）
2. 舞蹈参考二（成员 id：qa-dance2；平台：tiktok；类型：image）
3. 穿搭参考一（成员 id：qa-fashion1；平台：tiktok；类型：image）
使用 inspiration_get 按上述 id 逐条读取（标题、正文/脚本、拆解、本地媒体路径）再回答问题。
问题：
```

发送按钮点击记录为 0，页面请求全部为 GET，无 send/message/draft/turn/completion 类请求，未提交任何消息。[加入会话截图](2026-10-18-inspiration-collection-actions-3411/add-to-session.png)。

**草稿保护失败路径。** 将 prefill seam 替换为返回 `{ ok: false, error: 'draft-protected' }`，在合成 composer 预置哨兵草稿后再次点击 `加入会话`：页面顶部出现可见 toast「输入框已有内容，请先清空或新建会话后重试」；既有草稿保持为哨兵文本、未发生新的 prefill 记录、会话栏保持展开、仍停留在灵感库根层（合集卡与 `灵感库` 选中态仍在，未进入合集视图），发送按钮仍未被点击。[草稿保护截图](2026-10-18-inspiration-collection-actions-3411/draft-protected.png)。

**无活动会话失败路径。** 令 `__omnimuxWorkbench.getSnapshot()` 返回 `{ sessionId: '' }` 且页面无 `__omnimuxAttachments` 后点击 `加入会话`：模块先真实读取成员，再把未绑定哨兵归一为空并返回 `collection.sessionNoSession`，**不调用 reveal、不写 prefill**；页面出现可见 toast「没有可加入的会话，请先打开一个会话」，会话栏保持收起、composer 保持为空，按钮忙碌态结束后恢复可用，仍停留在根层。[无会话截图](2026-10-18-inspiration-collection-actions-3411/no-session.png)。

## 检查结果

- 真实浏览器证据运行：19/19 条断言通过（悬停显隐、几何、媒体配色、普通卡无按钮、查看视图、成员读取、prefill 内容、reveal 序列、无发送、focus-within、两按钮像素对比度、草稿保护、无会话路径、无外网请求与无 console 异常）。
- 固化回归：`node --test tests/e2e/inspiration-collection-actions.e2e.test.mjs` 运行 1 个测试，通过 1、失败 0、跳过 0（两次复跑约 11.4s 与 6.9s）；测试覆盖同一 6 个场景并保留 6 张 1600x1100 截图于本工作树 `.workbuddy/evidence/inspiration-collection-actions-regression/`。该测试复用既有 fixture 与 CDP 驱动、同样的宿主桩与强断言（`assert.equal` / `assert.deepEqual` / `assert.match`），未修改既有 E2E 文件。
- 清理回执：Chrome 已退出且临时 profile 删除，fixture 服务关闭、独占 store 删除、环境变量还原；浏览器无 origin 之外的请求。
- 实现侧插件单元/渲染测试由实现负责人执行并报告 28 pass / 0 fail，本记录不代替、也不重复声称这些检查。

## 诚实边界

- 宿主 seam（`__omnimuxWorkbench`、`__omnimuxSessionPrefill`）与会话栏/composer 是页面注入的合成桩，不是完整 Host 安装；本记录不证明官方会话输入框在真实 Host 中的渲染与附件链路。
- 交互与截图来自真实 headless Chrome（1600x1100，解码校验通过且已人工逐张查看），但不是 Ego 现场观察，也不替代共享开发版 45120 的人工验收；焦点环视觉（`:focus-visible`）未断言。
- 对比度采样只临时隐藏按钮文字颜色以取得合成底色，随后立即还原，不修改产品样式；被测 media token 值来自仓库 `rival-tokens.js` 的真实定义，隔离夹具未经过注入这些 token 的插件入口。
- 未使用 45120 开发版、未访问外网、未使用用户 profile、未调用账号/模型/付费能力；测试资料为独占合成库（8 条本地灵感与 1 个合集），结束后清理。
