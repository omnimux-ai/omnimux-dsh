# 合集「加入会话」：打开会话栏并追加草稿（Issue #3420）

## 授权与范围

用户在实际 OmniMux Dev 中明确要求：点击合集卡「加入会话」时必须打开会话栏（若未打开）；无论输入框是否已有内容、会话是否已有附件，都直接**追加**合集上下文，不再阻断。本任务修改：

- Hub 官方会话预填 seam（`plugins/omnimux/src/client/forms/session-prefill.js` + mount 消费者）新增 `mode: 'append'`；
- 灵感库合集「加入会话」模块改用 append 并调整失败文案；
- 对应单测、真实浏览器证据与 E2E。

不改变「立即复刻」等既有 replace 语义、不改附件链路、不改合集数据与 AI 工具、不改其它卡片交互。

## 与 #3411 / #3418 契约的关系

本规格取代 #3411 中「目标输入框已有草稿时提示清空/新建会话并拒绝」的合集草稿阻断条款，也取代 #3420 之前 #3418 证据中的 draft-protected 成功路径；#3411 的「不发送、不覆盖用户内容、失败显式提示」原则保留——不覆盖改为「保留原草稿并追加」，失败只发生在 composer 不可追加的状态（非 plain phase）。#3418 的共享 CTA 几何/等宽与媒体安全配色不受影响。历史规格与证据保留原文，不追溯改写。

已知边界（记录，不静默）：append 以官方 `inputActions.setDraft` 重写整段草稿文本；若宿主草稿含 `@` 语义引用/内联图片 chip，`setDraft` 的纯文本重建可能丢失这些 chip（文本保留）。当前代码与证据只覆盖纯文本草稿；含引用/图片的真实 Host 观感需在 Dev 人工确认，若确认丢失需在 hub seam 增加引用态保护。

## 新用户基线与复用

已安装登录的新用户只需本地灵感库与官方会话输入框。追加写入走官方 `inputActions.setDraft`，不直接操作 DOM/composer，不发送消息。

## 确定行为

- `queueSessionPrefill(request)` 新增可选 `mode`：缺省 `replace`（现有调用方语义不变）；`append` 时消费者读取目标会话当前草稿，计算 `existing + (existing 非空 ? "\n\n" : "") + prompt`，经官方 `inputActions.setDraft` 写回，必要时等待回读；结果 `{ok:true, via:'input-actions', appended:true}`。
- append 模式**不因已有草稿或会话/输入框附件而阻断**；仍拒绝 composer 处于非纯文本 phase（命令面板/技能模式等）的状态并返回 `draft-protected`，不静默、不覆盖。
- append 的附件挂载（`attach`）仍须成功；失败语义与 replace 一致（attach-full / attach-failed）。
- 会话栏打开：合集「加入会话」在读取到合集成员且有有效会话后，先 `setConversationCollapsed(false)` + `setFocus('split')`（会话栏未打开则打开；已打开保持），再追加草稿；不发送、不新建会话、不改合集数据。
- 合集模块以 `mode:'append'` 调用 seam；错误映射：`draft-protected` → `collection.sessionDraftProtected`，`composer-busy` → `collection.sessionBusy`，其余 → `collection.sessionFailed`。失败文案改为「输入框当前状态不支持追加，请完成当前输入后重试」（zh/en 同步）。
- 空草稿时 append 结果与 replace 等价（写入 prompt 本身），不产生多余空行。

## 验收与先后顺序

先落本规格，再实现 hub seam append + 合集模块改造 + 单测；随后工作树真实浏览器证据覆盖「会话栏关闭 + 输入框已有草稿 + 会话已有附件」场景：点击后会话栏打开、草稿 = 原草稿 + 空行 + 合集 prompt、无阻断 toast、无发送；证据落盘后更新 E2E 并多轮跑绿；最小静态门禁、独立评审、PR/Merge Queue、主干同步、开发版物化与工作区清理。Dev 45120 最终观感归用户确认，Agent 不把 Dev 诊断冒充验收证据。
