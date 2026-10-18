---
title: "合集「加入会话」打开会话栏并追加草稿工作树验证"
id: "evidence-inspiration-append-to-session-3420"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-18"
updated: "2026-10-18"
authors: ["agent"]
subsystem: "inspiration"
related:
  - "plugins/omnimux-inspiration/README.md"
  - "specs/inspiration-append-to-session-3420.spec.md"
---

# 合集「加入会话」追加草稿工作树验证（#3420）

本记录只证明隔离任务工作树内的真实页面、真实本地插件处理链与真实 Chrome 交互；不证明完整 Host 安装、Dev 实机最终观感或共享开发版人工验收（Dev 45120 归人工）。测试使用独占合成资料库、本地封面与动态 loopback 端口；会话栏/composer 与 `__omnimuxWorkbench` / `__omnimuxSessionPrefill` 为页面注入的合成宿主桩，其中 prefill 桩按 hub `mode:'append'` 契约实现（真实 hub append 逻辑由 hub 单测与 mounted consumer 集成测试覆盖，见边界）。

## 用户要求与实现摘要

用户要求：点合集卡「加入会话」必须打开会话栏（若未打开）；无论输入框已有草稿、会话已有附件，都直接**追加**合集上下文，不再弹「输入框已有内容…」。

- Hub 官方会话预填 seam 新增 `mode: 'append'`：消费者读取目标会话当前 draft，写入 `existing.replace(/\s+$/,'') + "\n\n" + prompt`（空草稿时直接写 prompt）；append 忽略 draft 非空与附件/内联图片，仅当 composer `phase && phase !== 'plain'` 时返回 `draft-protected`。
- 合集模块以 `{ targetSessionId, prompt, mode: 'append', attach }` 调用 seam；`draft-protected` 文案改为「输入框当前状态不支持追加，请完成当前输入后重试」；`composer-busy` 映射为 `collection.sessionBusy`。
- 打开会话栏仍沿用 `setConversationCollapsed(false)` + `setFocus('split')`，且仅在读到成员与有效会话后执行；不发送、不新建会话、不改合集数据。

## 身份与实际观察

目标工作树 HEAD 为 `e3dd772f53578ffb7f7eb17d306ddc91afb493c6`；真实源码指纹 `sourceSha256=75cb577ea1ca7cf0b01083610efa42306c724f2ef66ce8d2c98d1145047d94e5`，构建指纹 `bundleSha256=f1a23f241d05910c65116e8d32e7032708271d5c7a3615c4b7f0644672e3b41d`。完整断言、prefill 请求原文、草稿前后值与清理回执见[浏览器记录](2026-10-18-inspiration-append-to-session-3420/browser.json)。

真实链路：产品 `InspirationSection` 由工作树源码经 esbuild 打包渲染，合集经真实 HTTP `POST /omnimux/inspiration/local/collections` 创建，成员读取走真实本地列表接口，页面由独立 headless Chrome 经 CDP 驱动，composer 为真实合成 DOM。

**场景 A（已有草稿 + 已有附件 + 会话栏收起）。** 前置：`body[data-conversation]="collapsed"`、composer 预置哨兵「我的问题：先看舞蹈参考」、合成宿主记录 `attachments=1`。点击「加入会话」后：

- 会话栏打开：`data-conversation="open"`，reveal 调用序列 `[["collapsed",false],["focus","split"]]`；
- prefill 恰好 1 条：`mode='append'`、`targetSessionId='qa-session-1'`、`hasAttach=true`、prompt 为真实合集上下文（来源标注/合集名/collection_id/3 位成员/inspiration_get/末行「问题：」）；
- composer 前后：`我的问题：先看舞蹈参考` → `我的问题：先看舞蹈参考\n\n` + prompt（原草稿完整保留，空行分隔）；
- 无任何 toast（`toastCount=0`）、发送点击 0、页面无非 GET/发送类请求。

[追加草稿截图](2026-10-18-inspiration-append-to-session-3420/append-existing-draft.png)可见会话栏展开、输入框顶部为用户原问题、其后为合集上下文。

**场景 B（composer 非 plain，不可追加）。** 将 prefill 桩替换为返回 `{ok:false,error:'draft-protected'}`（对应 hub `phase !== 'plain'`），composer 预置同一哨兵草稿后点击「加入会话」：

- 页面出现可见 toast「输入框当前状态不支持追加，请完成当前输入后重试」（恰好 1 条）；
- 草稿未被修改（仍为哨兵文本），无新的 prefill 记录（0 条），未发生追加；
- 会话栏仍先被展开（`data-conversation="open"`，reveal 序列同上），仍在灵感库根层（合集卡与 `灵感库` 选中态仍在，未进入合集视图），发送 0。

[受保护截图](2026-10-18-inspiration-append-to-session-3420/append-protected.png)可见 toast 与未变化的草稿。

## 检查结果

- 真实浏览器证据运行：7/7 条断言通过（场景 A 的会话栏打开、append 请求与草稿拼接、无 toast/无发送；场景 B 的 toast 文案、草稿保护、无二次 prefill；无外网请求与无 console 异常）。
- 固化回归：`node --test tests/e2e/inspiration-collection-actions.e2e.test.mjs` 运行 1 个测试，本轮最终落盘内容连续 3 轮全部通过（pass 1 / fail 0 / skipped 0，约 9.36s、9.40s、9.40s）。E2E 内 stub 实现同一 append 契约；把原「draft-protected + 哨兵草稿」场景改为 append 成功场景，另加 phase-protected 失败场景，并保留 hover/查看/focus/无会话/共享 CTA 几何与媒体色/host 规则注入与漂移守卫等断言（10 checks / 8 张截图）。既有其它 e2e 文件未修改。
- 清理回执：Chrome 已退出且临时 profile 删除，fixture 服务关闭、独占 store 删除、环境变量还原；浏览器无 origin 之外的请求。
- 实现侧 hub 单测 18 pass（另有 mounted consumer 集成测试 2 pass）、hub 包 3463+82 pass、inspiration 包 261 pass 由实现负责人执行，本记录不代替、也不重复声称。

## 诚实边界

- 合成宿主桩实现 hub append 语义（读当前 draft、非空追加空行、忽略草稿/附件、仅非 plain phase 拒绝）；**真实 hub append 逻辑由 hub 的 18 条单测 + 2 条真实 `SessionPrefillConsumer` 集成测试覆盖**，本浏览器证据证明的是合集模块确实以 `mode:'append'` 调用 seam、会话栏打开、草稿被保留并追加、失败文案正确，而不是替代 hub 单测。
- 合成会话附件以 `attachments=1` 事实记录并用于证明 append 不被附件阻断；它不是渲染出来的附件托盘，也不验证附件缩略图/详情。
- 非完整 Host 安装；未使用 Dev 45120 作为验收（最终观感归用户）；未访问外网、未使用用户 profile、未调用账号/模型/付费能力；测试资料为独占合成库（8 条本地灵感与 1 个合集），结束后清理。
- 截图来自独立 headless Chrome（1600x1100，解码校验通过且已逐张查看），不是 Ego 现场观察。
