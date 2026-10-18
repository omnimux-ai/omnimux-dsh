---
title: "合集「加入会话」复用 ensureConversationVisible 激活会话栏工作树验证"
id: "evidence-inspiration-session-ensure-visible-3422"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-18"
updated: "2026-10-18"
authors: ["agent"]
subsystem: "inspiration"
related:
  - "plugins/omnimux-inspiration/README.md"
  - "specs/inspiration-session-ensure-visible-3422.spec.md"
---

# 合集「加入会话」会话栏激活工作树验证（#3422）

本记录只证明隔离任务工作树内的真实页面、真实本地插件处理链与真实 Chrome 交互；不证明完整 Host 安装、Dev 实机最终观感或共享开发版人工验收（Dev 45120 归人工）。会话栏/composer 与 `__omnimuxWorkbench` / `__omnimuxSessionPrefill` 为页面注入的合成宿主桩：workbench 桩实现官方 `ensureConversationVisible({ sessionId })` 入口并保留 `setConversationCollapsed`/`setFocus` 回退记录；prefill 桩按 hub `mode:'append'` 契约实现。真实 hub 的 ensure/退出右侧栏全屏逻辑由 hub 单测覆盖（见边界）。

## 现象与根因

用户实测：点「立即复刻」能激活会话栏，点合集卡「加入会话」在会话栏未打开时无反应。会话栏不可见有两层独立状态：插件折叠键与宿主右侧栏全屏（`surface.layout.mode === 'fullscreen'`）。原实现只调用 `setConversationCollapsed(false)` + `setFocus('split')`，只能清折叠键，不能退出宿主全屏；且展开发生在异步读取合集成员之后，成员读取慢时表现为「点了没反应」。

## 修复

- 合集模块的 `revealConversation(window, sessionId, onError)` 优先调用 hub 官方唯一入口 `window.__omnimuxWorkbench.ensureConversationVisible()`，**不传 sessionId**：hub 的无参语义是退出宿主右侧栏全屏 + 清折叠键 + 保持 split（而不是切到会话全屏），因此灵感库 Stage 与其失败 toast 仍然可见，避免 chat 全屏把 toast 藏起来（复审 P2-2）。无 ensure 时回退 `setConversationCollapsed(false)` + `setFocus('split')`（与立即复刻同款调用）。
- `addCollectionToSession` 先解析当前会话，**立即 reveal（在读取合集成员之前）**，再读成员并 append prefill；ensure/fallback 在 0ms / 50ms 重放，覆盖 React/宿主布局收敛窗口（与 `replicate-to-chat` 一致）；无会话仍提示且不展开。

## 身份与实际观察

目标工作树 HEAD 为 `00e28aecd8fad4c2a4b41eb00fe359ffde884587`；真实源码指纹 `sourceSha256=b579548ba817d44b7bb2ffab5b298dcea5ae4a0e487c2031f64f6b54a468315f`，构建指纹 `bundleSha256=c6008b31ed887e05cfec1411cbe19ffb34245bf0f3186c8673c598d4bba98946`。完整断言、调用序列、草稿前后值与清理回执见[浏览器记录](2026-10-18-inspiration-session-ensure-visible-3422/browser.json)。

真实链路：产品 `InspirationSection` 由工作树源码经 esbuild 打包渲染，合集经真实 HTTP `POST /omnimux/inspiration/local/collections` 创建，成员读取走真实本地列表接口，页面由独立 headless Chrome 经 CDP 驱动，composer 为真实合成 DOM。

**主场景（会话栏收起 + 已有草稿 + 附件 → 点击加入会话）。** 前置 `data-conversation="collapsed"`、composer 草稿「我的问题：先看舞蹈参考」、合成 `attachments=1`。点击后：

- **ensure 生效（无参）**：`ensureConversationVisible(...args)` 被调用时 `args=[]`（未传 sessionId/options）；立即调用 1 次，随后按实现 0ms/50ms 重放，共 **3 次**且每次参数数组长度 0；`setConversationCollapsed`/`setFocus` **均未被调用**（有 ensure 不回退）。
- **展开早于成员读取**：测试用 fixture 的 `planListRead` 暂扣真实成员请求；在成员读取尚未完成时，`data-conversation` 已为 `open` 且 ensure 已记录（`[['ensure', []]]`），同时 prefill 仍为 0 条 —— 证明 reveal 先于成员读取。
- **会话栏状态**：`collapsed → open`；
- **追加行为沿用 #3420**：prefill 恰好 1 条、`mode='append'`、`targetSessionId='qa-session-1'`、`hasAttach=true`；composer = 原草稿 + `\n\n` + 合集 prompt（原草稿完整保留）；
- **无阻断副作用**：toast 0 条、发送点击 0、页面无非 GET/发送类请求。

[会话栏激活截图](2026-10-18-inspiration-session-ensure-visible-3422/ensure-reveal.png)可见会话栏已展开、输入框顶部为用户原问题、其后为合集上下文。

**回退路径（无 ensure，便于对照 replicate 同款调用）。** 删除 `ensureConversationVisible` 后重复点击：ensure 调用 0 次，`setConversationCollapsed(false)` 与 `setFocus('split')` 各记录 3 次（立即 + 0/50ms 重放），会话栏同样由 `collapsed → open`，append 行为不变。该路径仅记录调用，不额外截图。

## 检查结果

- 真实浏览器证据运行：6/6 条断言通过（ensure 先于成员读取、ensure 收到当前 sessionId 且不回退、会话栏展开 + 草稿追加、无 toast/无发送、无 ensure 回退路径、无外网请求与无 console 异常）。
- 固化回归：`node --test tests/e2e/inspiration-collection-actions.e2e.test.mjs` 运行 1 个测试，本轮最终落盘内容连续 3 轮全部通过（pass 1 / fail 0 / skipped 0，约 9.53s、9.34s、9.31s）。E2E 的 workbench 桩已加入 `ensureConversationVisible(...args)` 并记录完整参数数组；断言点击前 `collapsed`、点击后 `open`、ensure 被调用且参数数组为空（严格 3 次：立即 + 0/50ms 重放）、无 `setConversationCollapsed`/`setFocus` 回退、append 草稿正确、无 toast、无发送，并保留 hover/查看/focus/phase-protected/无会话/共享 CTA 几何与媒体色/host 规则漂移守卫等既有断言（10 checks / 8 张截图）。无会话场景按新顺序断言「不触发成员读取」（session 解析先于成员读取）。既有其它 e2e 文件未修改。
- 清理回执：Chrome 已退出且临时 profile 删除，fixture 服务关闭、独占 store 删除、环境变量还原；浏览器无 origin 之外的请求。
- 实现侧 hub/ inspiration 单测由实现负责人执行并报告全绿，本记录不代替、也不重复声称。

## 诚实边界

- 合成 workbench 桩实现官方 `ensureConversationVisible()` 的**无参**调用契约（记录完整参数数组并展开会话栏）；**真实 ensure 的退出宿主右侧栏全屏/折叠键清理逻辑在 hub 单测覆盖，本浏览器夹具未加载真实 host layout**，因此不证明 Dev 实机全屏态下的最终视觉，只证明合集模块确实优先调用该入口、不传 sessionId、不回落折叠键、且在成员读取前展开。
- 合成 prefill 桩实现 hub `mode:'append'` 契约；真实 hub append 逻辑由 hub 单测覆盖（前序 #3420 证据）。
- 非完整 Host 安装；未使用 Dev 45120 作为验收（最终观感归用户）；未访问外网、未使用用户 profile、未调用账号/模型/付费能力；测试资料为独占合成库（8 条本地灵感与 1 个合集），结束后清理。
- 截图来自独立 headless Chrome（1600x1100，解码校验通过且已查看），不是 Ego 现场观察。
