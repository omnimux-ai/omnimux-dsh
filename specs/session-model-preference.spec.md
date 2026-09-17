# 会话模型偏好接通 Agent（模型选择能力补齐·第一步）

- 任务工作树：`.worktrees/omnimux-session-model-issue-2145`（分支 `agent/omnimux-session-model-issue-2145`）
- 基线：`origin/main` @ `3cb3b725c`
- Issue：#2145
- 日期：2026-09-17

## 1. 背景与问题

只读审计（`.agent-reports/model-selection-audit/REPORT.md`）确认：会话输入框的模型面板选择是**孤岛**。

- 面板写入：`plugins/omnimux-market/src/client/model-picker.js` 的 `handleSelectModel` → `sessionStorage["omnimux:model:<sid>"]` + `api("setModelSelection")`
- 宿主接收：`plugins/omnimux-market/src/local-api.ts` 的 `sessionModelStore`（内存 `Map`）
- **无消费方**：全仓检索 `selectedModel` / `modelSelection`，除面板自身与 local-api 读写外，没有任何 Agent 上下文注入或生成路径读取它

后果：用户在面板选了模型 A，Agent 仍按自身判断调用模型 B。`plugins/omnimux/src/media/route.js:145-167` 已证明「调用方显式指定的 model 优先」，但会话路径从不把面板选择变成调用方的指定。

## 2. 目标

让「用户在面板选中的模型」成为会话内 Agent 的**已知约束**：

1. 中枢成为会话模型偏好的唯一属主，market 面板写入指向中枢。
2. 每轮首个 step 向 Agent 注入「本会话用户已指定模型 X」的上下文。
3. 媒体生成工具在调用方未显式传 `model` 时，回落到该会话偏好。
4. 面板切回「自动」时，提示与回落同时停止。

## 3. 设计

```
market 面板 handleSelectModel
        │  POST /omnimux/session-model
        ▼
   sessionModelPreference (hub, Map<sessionId, choice>)
        │                                    │
        │ agent/pre-step (step===1)          │ exec.agent.session.id
        ▼                                    ▼
  注入「用户已指定模型 X」          媒体工具 model 缺省时回落
```

偏好形状：`{ auto: boolean, modelId: string, label: string }`。

- `auto === true` 或不存在记录 ⇒ 无偏好，零副作用。
- `modelId` 为空 ⇒ 视同无偏好。

## 4. 验收标准（可测试）

- **AC-1**：`POST /omnimux/session-model` 写入后，`GET /omnimux/session-model?sessionId=X` 返回同一选择。
- **AC-2**：存在「已指定模型」的会话，`agent/pre-step` 在 step 1 注入上下文消息，文本含该模型的可识别标识；step ≠ 1 不注入。
- **AC-3**：会话为「自动」或无偏好时，不注入任何消息（零副作用）。
- **AC-4**：媒体工具 `model` 缺省且会话有偏好时，实际路由使用该模型；显式传 `model` 时始终以显式值为准。
- **AC-5**：market 面板选择写入中枢路由；中枢不可用时面板不崩溃（降级保留本地回显）。
- **AC-6**：`plugins/omnimux` 与 `plugins/omnimux-market` 定向单测全绿；`pnpm verify:model-contracts` 严格模式仍绿。

## 5. 产品基线（新用户基线）

本特性不依赖任何开发机私有状态：

- 偏好为进程内 `Map`，随宿主进程生命周期；新用户首次启动时为空 Map，天然为「自动」。
- 中枢不可达时，面板保留既有本地回显，不把任何本机路径或本机配置带入默认路径。
- 无新增环境变量、无新增配置文件、无机器绝对路径。

缺失依赖（中枢路由未注册）时的表现：`POST` 落到 404，面板 `catch` 后仅保留本地回显，不抛错、不阻塞用户。

## 6. 非目标

- 不做价格展示（第二步）
- 不做「对 Agent 可见/不可见」开关
- 不做跨模型低价择优
- 不改画布节点自身的模型选择逻辑
- 不改动 `/omnimux/model-catalog` 既有契约

## 7. 文档影响

`plugins/omnimux/README.md` 的 seams 描述补一句 `sessionModelPreference`；本步骤不新增契约文档。

## 8. 风险

R2。改动落在中枢宿主接线与 market 客户端写入；最坏情况是偏好不生效，回退到改动前行为（Agent 自行判断），不产生新的失败面。
