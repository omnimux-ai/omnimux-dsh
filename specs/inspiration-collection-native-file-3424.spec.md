# 合集「加入会话」改为原生 Markdown 文件附件（Issue #3424）

## 授权与范围

用户明确要求：「加入会话」不再把所有信息填入输入框，而是收敛为一个文件，像现有原生附件一样挂到输入框。本规格取代 #3420 的文本追加与 #3422 的展开后追加文本；展开会话栏（`ensureConversationVisible`）的机制保留。范围仅 `plugins/omnimux`（客户端原生附件桥）与 `plugins/omnimux-inspiration`（合集流程/文案/README），不改官方 DSH、不新增宿主路由、不改 `rival-add-to-chat`。

基线 `origin/main`。风险等级：**R1**（新增 hub 客户端跨插件公共 seam 并改 composer 附件接线，按仓库政策公开契约至少 R1）。

## 现状与事实

- 官方 composer 槽位 `conversation.input.attachments` 向 `AttachmentTray` 传 `attachments`（官方草稿附件）、`onAddFiles`（槽位契约是 `(files: readonly File[]) => void`）与 `canAcceptDrop`。官方 `intakeFiles` 自己展示拒绝 toast，并在 subagent / 无 `addFiles` / 空批等路径**静默返回**；raw `addFiles` 在 shell 拒绝时也可能返回 null。**调用返回不代表成功**。
- 官方文件上传完成后由 `NativeAttachmentCard` 渲染在输入框内附件轨，与图片卡并排；发送时官方把 `{ type: 'file', receiptId }` 放进消息。
- 因此本项目不需要新增 host 路由或自建落盘：在浏览器生成 `File` 交给官方 `onAddFiles`，再**以附件轨是否出现该文件名确认成功**。
- 现有 `AttachmentTray` 没有对外暴露 add 能力；`AttachmentSubmitBridge` 只暴露 `setDraft`/`revealAttachments`，没有 addFiles。需要在托盘挂载处提供按会话的原生附件桥。

## 用户旅程与期望反馈

1. 用户悬停合集卡 → 出现「查看 / 加入会话」。
2. 点击「加入会话」：会话栏立即展开（收起时）；稍后输入框附件轨出现 `测试合集 · 灵感库合集.md` 文件卡（上传中→就绪），输入框正文不变。
3. 重复点击同一合集：不新增第二个附件，顶部提示「该合集附件已在输入框中」。
4. 点文件卡可随官方原生附件交互（预览/移除）；移除后可再次添加。
5. 发送消息（可空正文）：官方把文件作为附件提交，AI 通过 `@文件` 读取合集内容。

## 确定行为

- 文件名：`{合集名} · 灵感库合集.md`；非法字符 `/ \ : * ? " < > |` 与控制字符替换为 `-`，压缩空白，最长 60 字符，空名回退 `灵感库合集-{id 前 8 位}.md`（标题部分最长 60 字符，后缀不计入）。
- 文件内容（Markdown）：标题、来源、合集 ID、成员条数、成员清单（序号、标题、成员 id、平台、类型）、超额说明、读取方式（`inspiration_get`）；不含「问题：」，提问留给输入框。
- 读取成员：`page_size=100`，最多 5 页（500 条）；超过时文件内只注明「其余成员未在本次附件中列出」，不下达工具做不到的指令。
- 展开：点击后立即 `ensureConversationVisible()`（无参）+ 回退 `setConversationCollapsed(false)`/`setFocus('split')` + 0/50ms 重放（沿用 #3422）。
- 去重：`bridge.list()` 精确匹配文件名则不调用 add，返回 `{ ok: true, duplicate: true }`；桥在等待确认期间把文件名放进 session 本地 pending 集合，连点也能去重。
- 成功判定：调用官方 intake 后轮询 `attachments`（≤1500ms），出现该文件名才 `{ ok: true }`；超时返回 `{ ok: false }`，绝不把 void 返回当成功。
- 成功后 best-effort 调 `window.__omnimuxComposerActions?.revealAttachments?.()`；失败不影响成功结果。
- 不调用 `queueSessionPrefill`/`setDraft`，不发送。

## 公共接口

`window.__omnimuxComposerFiles: Record<sessionId, { add(files): Promise<{ ok: boolean, message?: string }>, list(): string[] }>`

- 由 `AttachmentTray` 挂载时按 `currentSessionId` 注册（同时传入 `canAcceptDrop`、最新 `attachments` 与官方 intake），卸载时只删除自己的条目。
- `add`：不可接受/缺 intake → `{ ok: false }`；否则调用 void intake，并**以 `list()` 出现文件名确认成功**；官方拒绝 toast 由官方负责，我们确认不到附件时提示 `collection.attachmentFailed`。
- `list` 返回当前会话原生附件展示名（`file.name` → `title` 回退）+ 等待确认中的 pending 名。

## 失败与边界

| 场景 | 行为 |
| --- | --- |
| 桥不存在或 1200ms 内未就绪（旧 hub bundle / 槽位未挂载） | toast `collection.attachmentUnavailable`，不回落文本 |
| 官方 intake 拒绝或静默丢弃（提交中/不可用等） | 官方自行 toast；桥确认不到新附件 → toast `collection.attachmentFailed` |
| 上传失败 | 原生卡自身失败态 + 重试；本次只提示添加失败，不自动重试 |
| 同名附件已存在 | 不新增，`duplicate` 提示 `collection.attachmentExists` |
| 成员读取失败/空合集/无会话 | 既有 key；会话栏因先展开保持打开属预期 |
| 文件名中文/`·`/空格 | 按规则生成；Dev 实测若官方拒绝则同一函数调整替换规则 |
| 非 plain 草稿（@引用/内联图片） | 原生附件不改草稿，天然不受影响 |

## 验收

- 自动化：hub 桥单测（void intake 确认、不可接受、静默丢弃、抛错、pending 去重）+ hook 真实挂载测试（注册、确认、canAcceptDrop、卸载）+ `tray-slot` 源码断言；inspiration 流程单测（文件名、内容、去重、桥缺失/超时、add 错误、多页、reveal 早于读取、无会话/空/失败、busy、不写草稿）；真实浏览器证据（合成桥桩记录 File 内容、草稿不变、去重，边界注明不证明官方上传/Dev 视觉）；E2E 多轮绿；静态门禁。
- Dev 人工：收起会话栏 + 有草稿点击 → 展开 + 原生文件卡 + 草稿不变；重复点击去重；发送带附件消息后 AI 能读取合集成员。
