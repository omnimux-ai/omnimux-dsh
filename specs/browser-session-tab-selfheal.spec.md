# 会话标签页绑定自愈规格（Issue #2103）

## 1. 业务问题
用户完成浏览器插件配对后，在**配对之前就已存在**的会话里发送消息，被扩展硬性拒绝，面板显示英文错误 `This session is not bound to a live browser tab`，无任何可执行的下一步。

### 1.1 根因（代码定位）
`extension/src/background/index.ts` 的 dsh-panel 端口 `rpc` 分支：

```ts
const prepare = rpcMsg.method === 'session.prompt'
  ? Promise.resolve().then(async () => {
      await refresh
      return rpcSessionId === undefined || tabAffinity.getSessionTab(rpcSessionId) !== undefined
    })
  : Promise.resolve(true)
void prepare.then((ready) => {
  if (!ready) throw new Error('This session is not bound to a live browser tab')
```

会话只在面板宣告 `{ type: 'session.active', isNew: true }` 时绑定当前活动标签页；已存在会话只 focus，不补绑。因此断连期间/配对前创建的会话永远无绑定 → 配对成功后仍发不出。

## 2. 核心改动规范

### AC-1 自愈绑定
- `session.prompt` 前置检查中，若目标会话**没有**标签页绑定：
  - 等待 `affinityReady` 与 `pageSessionContexts.ready`；
  - `syncActiveTab()` 取当前活动标签页并 `summarizeTab`；
  - 绑定：`tabAffinity.bindNewSession(sid, summary)` + `pageSessionContexts.bind(sid, { id: tabId, ...summary })` + `resetTabSnapshot` + `persistTabAffinity()` + `broadcastTabAffinity()` + `refreshSessionSnapshot(sid)`（与 `isNew` 路径一致）；
  - 绑定成功后放行本次发送。
- 已有绑定的会话行为不变（不重绑、不切换）。

### AC-2 无可用标签页时给中文可执行提示
- `syncActiveTab()` 取不到标签页时不再抛英文错误，改为中文（英文界面用英文）提示：先切到要操作的网页再发送。
- 该提示与既有 `TabAffinityRebindError('no-active-tab')` 的措辞保持一致风格。

### AC-3 边界不变
- 不改 `PRIVILEGED_METHODS`、桥端令牌校验、`isNew` 绑定路径的既有语义。
- 自愈失败（无标签页）时不得产生半绑定状态。

## 3. 验收证据
- 单测：自愈分支绑定成功即放行；无活动标签页时报错可读且中文；已有绑定不重复绑定。
- 真实浏览器端到端（沿用 `tmp/` 配对验证宿主）：配对 → 在**已存在**的会话发起 `session.prompt`：修复前被拒（`not bound`），修复后放行；证据落盘 `docs/evidence/`。
