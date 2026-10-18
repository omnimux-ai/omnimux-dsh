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

本记录只证明隔离任务工作树内的真实页面、真实本地插件处理链与真实 Chrome 交互；不证明完整宿主首装、正式会话附件链路、真实模型调用或共享开发版人工验收。测试使用独占合成资料库、本地封面、动态 loopback 端口，并为宿主能力注入 `__omnimuxWorkbench` / `__omnimuxSessionPrefill` 合成桩；未访问外网、未使用开发版 45120、未触碰用户 profile。

## 身份与实际观察

目标工作树 HEAD 为 `881487d97695ace8441aad19aff4632ab5605a74`（实现改动尚未提交，因此 HEAD 与规格基线相同）；真实源码指纹 `sourceSha256=efa23c778c6481b7080382abfefe7d1a75c7ddb4c80b6c5813c6bfbb80b660d0`，构建指纹 `bundleSha256=b66cdf5f2c48daf5cd7d3af25b09252c0898796350443ba63f2d6ab2759eec96`。完整断言、截图尺寸、prefill 原文、reveal 序列与清理回执见[浏览器记录](2026-10-18-inspiration-collection-actions-3411/browser.json)。

真实链路：产品 `InspirationSection` 由工作树源码经 esbuild 打包渲染，合集写读走真实 production local handlers/store（`POST /omnimux/inspiration/local/collections` 返回 201，成员读取命中真实本地列表接口），页面由独立 headless Chrome 经 CDP 驱动。合成部分：`window.__omnimuxWorkbench`（`getSnapshot() -> { sessionId: 'qa-session-1' }`、`setConversationCollapsed`、`setFocus`）、`window.__omnimuxSessionPrefill.queueSessionPrefill` 记录请求并把 prompt 写入合成 composer；右侧会话栏为合成 DOM，发送按钮从未点击。

**悬停显隐。** 未悬停时合集卡操作层存在（`role=group`、`aria-label=合集操作`、未进入 `aria-hidden`），但计算样式 `opacity: 0`、`pointer-events: none`、`translateY(4px)`，两个按钮文本/`aria-label` 为 `查看` 与 `加入会话`。真实指针 `mouseMoved` 到卡片中心后，操作层 `opacity≈1`、`pointer-events: auto`、`translateY(0)`；操作层完全落在封面区域内，且与标题行、`更多操作` 菜单矩形均无交叠。同页普通灵感卡不存在该操作层，也没有这两个按钮。[悬停截图](2026-10-18-inspiration-collection-actions-3411/hover-actions.png)。

**查看。** 点击 `查看` 进入真实合集内容视图：`返回灵感库`、`重命名` 按钮与合集标题「测试合集」，3 张成员卡（`qa-dance1` / `qa-dance2` / `qa-fashion1`）从真实本地接口读出；期间 prefill 记录为 0、会话栏 reveal 调用为 0、会话栏保持收起。[合集视图截图](2026-10-18-inspiration-collection-actions-3411/view-collection.png)。

**加入会话。** 悬停后点击 `加入会话`：真实读取合集成员（`collection_id` + `page_size=100` + `projection=lean`，HTTP 200），随后按 `setConversationCollapsed(false)` → `setFocus('split')` 顺序展开会话栏，并只产生一条 prefill：`targetSessionId='qa-session-1'`，合成 composer 文本与 prompt 完全相等。prompt 原文（当次合集 id 随运行生成）：

```
来源：OmniMux 灵感库 · 本地合集
合集：测试合集
合集 ID：collection_d505c854-c674-4287-8271-407531f635e7
成员条数：3
成员清单：
1. 舞蹈参考一（成员 id：qa-dance1；平台：tiktok；类型：image）
2. 舞蹈参考二（成员 id：qa-dance2；平台：tiktok；类型：image）
3. 穿搭参考一（成员 id：qa-fashion1；平台：tiktok；类型：image）
使用 inspiration_get 按上述 id 逐条读取（标题、正文/脚本、拆解、本地媒体路径）再回答问题。
问题：
```

发送按钮点击记录为 0，页面请求全部为 GET，无 send/message/draft/turn/completion 类请求，未提交任何消息。[加入会话截图](2026-10-18-inspiration-collection-actions-3411/add-to-session.png)。

**草稿保护失败路径。** 将 prefill seam 替换为返回 `{ ok: false, error: 'draft-protected' }`，在合成 composer 预置哨兵草稿后再次点击 `加入会话`：页面顶部出现可见 toast「输入框已有内容，请先清空或新建会话后重试」；既有草稿保持为哨兵文本、未发生第二次 prefill 记录、会话栏保持展开、仍停留在灵感库根层（合集卡与 `灵感库` 选中态仍在，未进入合集视图），发送按钮仍未被点击。[草稿保护截图](2026-10-18-inspiration-collection-actions-3411/draft-protected.png)。

## 检查结果

- 真实浏览器证据运行：15/15 条断言通过（覆盖悬停显隐、操作层几何、普通卡无按钮、查看视图、成员读取、prefill 内容、reveal 序列、无发送、草稿保护、无外网请求与无 console 异常）。
- 固化回归：`node --test tests/e2e/inspiration-collection-actions.e2e.test.mjs` 运行 1 个测试，通过 1、失败 0、跳过 0（耗时约 5.8s），输出证据目录于本工作树 `.workbuddy/evidence/inspiration-collection-actions-regression/`。该测试复用既有 fixture 与 CDP 驱动、同样的宿主桩与强断言（`assert.equal` / `assert.deepEqual` / `assert.match`），未修改既有 E2E 文件。
- 清理回执：Chrome 已退出且临时 profile 删除，fixture 服务关闭、独占 store 删除、环境变量还原；浏览器无 origin 之外的请求。
- 实现侧插件单元/渲染测试由实现负责人执行并报告全绿，本记录不代替、也不重复声称这些检查。

## 诚实边界

- 宿主 seam（`__omnimuxWorkbench`、`__omnimuxSessionPrefill`）与会话栏/composer 是页面注入的合成桩，不是完整 Host 安装；本记录不证明官方会话输入框在真实 Host 中的渲染与附件链路。
- 交互与截图来自真实 headless Chrome（1600x1100，解码校验通过且已人工逐张查看），但不是 Ego 现场观察，也不替代共享开发版 45120 的人工验收。
- 未使用 45120 开发版、未访问外网、未使用用户 profile、未调用账号/模型/付费能力；测试资料为独占合成库（8 条本地灵感与 1 个合集），结束后清理。
