---
title: "合集「加入会话」改为官方原生 Markdown 文件附件工作树验证"
id: "evidence-inspiration-native-file-3424"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-18"
updated: "2026-10-18"
authors: ["agent"]
subsystem: "inspiration"
related:
  - "plugins/omnimux-inspiration/README.md"
  - "specs/inspiration-collection-native-file-3424.spec.md"
---

# 合集「加入会话」原生 Markdown 文件附件工作树验证（#3424）

本记录只证明隔离任务工作树内的真实页面、真实本地插件处理链与真实 Chrome 交互；不证明完整 Host 安装、官方真实上传链路、Dev 实机最终观感或共享开发版人工验收（Dev 45120 归人工）。桥桩按最终 async 契约实现（`add` 返回 Promise，成功后同步更新 `list()`）；真实 tray 的 void intake 附件列表确认、未确认集合（3s TTL）与 pending 去重由 hub 桥/挂载测试覆盖。会话栏/composer、原生文件卡与 `__omnimuxWorkbench` / `__omnimuxComposerFiles` 为页面注入的合成宿主桩；桥桩实现 hub 约定的 `add(files)` / `list()` 契约，真实 `AttachmentTray` 注册与透传官方 `onAddFiles` 的上传生命周期由 hub 桥/挂载测试覆盖（见边界）。

## 现象与根因

原「加入会话」通过会话预填 seam 把整段合集上下文写进用户输入框，造成草稿污染：已有问题会被追加一长段文本，且不是用户可管理的附件。用户确认改为：合集收敛成一个文件，像官方原生附件一样挂到输入框。

## 新契约与实现

- Hub 在 `AttachmentTray` 挂载时按 `currentSessionId` 注册 `window.__omnimuxComposerFiles[sessionId] = { add(files) -> Promise<{ok,message?}>, list() -> string[] }`。官方槽位 `onAddFiles(files): void` 是 **void** 契约，调用返回不代表成功；因此桥调用后轮询官方 `attachments` 列表确认文件名真的出现（≤1500ms），确认成功才返回 `{ok:true}`，否则 `{ok:false}`。失败时若官方 intake 自行 toast，由官方负责；插件侧 fallback toast 为通用 `collection.attachmentFailed`。`detail` 仅在桥/桩提供了 `message` 时才由视图展示；真实 hub 桥的静默确认失败路径 `message` 为空，因此落到通用文案。等待确认期间文件名进入 session pending，确认超时后仍保留在「未确认」集合 3s（`unconfirmedTtl`），`list()` 继续返回它 → 超时后立即重试不会重复上传，到期自动清理；`canAcceptDrop=false`/缺 intake 直接失败。模块会 `await` 该 Promise。
- inspiration 流程：解析当前会话 → 立即 `ensureConversationVisible()`（无参，沿用 #3422）→ ≤1200ms 轮询等桥 → `list()` 同名去重 → 分页读成员（≤5 页/500 条）→ 生成 Markdown `{合集名} · 灵感库合集.md` → 交给 `bridge.add([File])` → best-effort `__omnimuxComposerActions.revealAttachments()`。
- 不调用 prefill、不写草稿、不发送；桥缺失/超时、add 拒绝、同名重复均有既有 toast 反馈；成员读取失败/空合集/无会话沿用既有 key，会话栏因先展开保持打开属预期。

## 身份与实际观察

目标工作树 HEAD 为 `fa1bed40ab6affe76c21835d73e2d027f6cb84f3`；真实源码指纹 `sourceSha256=2a10809f72c0b703b5e8fec31af1b9462f10527627dee21f7f04545a7ff320b5`，构建指纹 `bundleSha256=3e06a603189102a27809705953eb004d794cda639e924a919c4f870e12504a12`（本次按最终源码重跑得到，与上一版相同：fixture 的 source 指纹覆盖 inspiration 侧源码与夹具，不含未跟踪的 hub 桥文件；桥的确认/TTL 逻辑由 hub 16 条用例覆盖。最终桥文件补充指纹见 browser.json `supplementalIdentity`：`native-files-bridge.js` `cbbf85c4…`、`useNativeFilesBridge.js` `6fa438ca…`）。完整断言、File 元数据/内容摘要、调用序列、去重/失败/桥缺失记录与清理回执见[浏览器记录](2026-10-18-inspiration-native-file-3424/browser.json)。

真实链路：产品 `InspirationSection` 由工作树源码经 esbuild 打包渲染，合集经真实 HTTP `POST /omnimux/inspiration/local/collections` 创建，成员读取走真实本地列表接口，页面由独立 headless Chrome 经 CDP 驱动，File 与附件卡为真实页面对象。

**主场景（会话栏收起 + 已有草稿）。** 前置 `data-conversation="collapsed"`、composer 草稿「我的问题：先看舞蹈参考」。点击「加入会话」后：

- 展开：`ensureConversationVisible` 立即调用并按 0ms/50ms 重放，共 3 次且每次参数数组为空；`setConversationCollapsed`/`setFocus` 均未调用；会话栏 `collapsed → open`。
- 原生文件：`async add` 被 `await`，恰好 1 次、1 个 File；文件名 `测试合集 · 灵感库合集.md`、类型 `text/markdown`、大小 542B；内容 299 字符，标题 `# 灵感库合集：测试合集`，含 `来源：OmniMux 灵感库 · 本地合集`、合集 ID、`成员条数：3`、全部 3 个成员 id（`qa-dance1`/`qa-dance2`/`qa-fashion1`）与 `inspiration_get` 读取说明，**不含**「问题：」行。
- 草稿/副作用：composer 仍为原草稿「我的问题：先看舞蹈参考」；`revealAttachments` 被调用；无 toast（附件卡即回执）；发送 0；未安装/未使用 prefill seam；无非 GET/发送类请求。
- 附件卡：`#qa-native-file` 显示 `MD 测试合集 · 灵感库合集.md`。

[原生附件截图](2026-10-18-inspiration-native-file-3424/native-file-attached.png)可见会话栏展开、输入框上方原生 MD 文件卡，输入框正文保持用户原问题。

**去重场景。** 同一会话再次点击：`list()` 已含文件名，`add` 仍为 1 次；顶部 toast「该合集附件已在输入框中」；草稿/会话栏不变。

**add 拒绝场景（合成注入 message）。** 移除附件后让 async `add` 返回 `{ok:false,message:'正在提交，暂时不能添加附件'}`：新增 1 次 add 尝试（累计 2 次）后失败，不新增文件卡；页面 toast 为 **「正在提交，暂时不能添加附件」**——用于验证视图层「有 `detail` 时优先展示」的分支；真实 hub 桥静默失败无 message，会落到通用文案；草稿不变。

**桥缺失场景。** 删除 `window.__omnimuxComposerFiles` 后点击：模块等待约 1.2s，页面 toast「当前无法挂载文件附件，请稍后重试」；`add` 次数不变；草稿不变；会话栏已展开。

## 检查结果

- 真实浏览器证据运行：8/8 条断言通过（展开/3 次无参 ensure、单文件 add 与内容、草稿不变/无 prefill/无发送、去重、add 失败、桥缺失、无外网请求与无 console 异常）。
- 固化回归：`node --test tests/e2e/inspiration-collection-actions.e2e.test.mjs` 运行 1 个测试，本轮最终落盘内容连续 3 轮全部通过（pass 1 / fail 0 / skipped 0，约 18.6s、18.5s、19.1s）。E2E 的 qaHost 已改为原生文件桥桩并渲染原生附件卡；覆盖「收起→点击→展开 + 单文件 + 草稿不变」、重复点击去重、add 失败、桥缺失、无会话，并保留 hover/查看/focus/共享 CTA 几何/媒体色/market 全局规则漂移守卫等既有断言（11 checks / 9 张截图）。既有其它 e2e 文件未修改。
- 最终内容曾出现一次仅「Chrome 退出清理超时」的非断言失败（测试体 11 checks 已全部通过，report.pass=false 仅由 cleanup 断言触发）；随后连续 3 轮全绿，清理回执为 Chrome 已退出/profile 删除/fixture 关闭。
- 清理回执：Chrome 已退出且临时 profile 删除，fixture 服务关闭、独占 store 删除、环境变量还原；浏览器无 origin 之外的请求。
- 实现侧 hub 桥/挂载单测与 inspiration 单测由实现负责人执行并报告全绿，本记录不代替、也不重复声称。

## 失败文案

官方 `onAddFiles(files): void` 的拒绝 toast 由官方负责；插件只在桥/桩返回 message 时优先展示该 `detail`，否则回退通用 `collection.attachmentFailed`。本场景是**合成桩注入 message**，用于验证视图的 detail 分支（实际 toast 为注入的「正在提交，暂时不能添加附件」）；真实 hub 桥静默失败路径 message 为空，实际 fallback 为「合集附件添加失败，请重试」。

## 诚实边界

- 合成原生桥桩实现 hub 的 **async** `add(files)`/`list()` 契约（`add` 返回 Promise、成功同步更新 list；记录 name/type/size、异步 `file.text()` 内容、渲染附件卡、按 list 去重、可注入失败/删除）；**真实 `AttachmentTray` 注册、官方 void `onAddFiles` 的附件列表确认（≤1500ms）、未确认集合 3s TTL、pending 去重、上传中→就绪/失败重试由 hub 桥与挂载测试覆盖（16 条），本浏览器夹具未加载真实官方上传组件**，因此不证明 Dev 实机下的上传进度、预览/移除交互或最终视觉。
- 确认超时存在「文件其实已挂上但桥未在 1500ms 内看到」的假失败窗口；已用 3s 未确认去重集合降低重复上传，但真实上传时序、AI 读取与 Dev 视觉仍归人工验证。
- 未使用 Dev 45120 作为验收（官方上传与最终观感归用户）；未访问外网、未使用用户 profile、未调用账号/模型/付费能力；测试资料为独占合成库，结束后清理。
- 截图来自独立 headless Chrome（1600x1100，解码校验通过且已查看），不是 Ego 现场观察。
