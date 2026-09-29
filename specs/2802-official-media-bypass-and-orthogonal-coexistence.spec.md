# 规格：官方媒体模型正交放行与未指定渠道拦截收敛 (Issue #2802)

## 一、背景与问题定义
当前系统在 `runtimeMode: 'agent'`（例如用户将文本模型接入本地 Codex 或自定义 Agent）且用户具备合法官方凭据（`OMNIMUX_API_KEY`）的正常运行场景下：
用户在创作画布中添加图片节点（`Image 2.5` / `gpt-image-2.5`）或视频节点（`Hailuo H3` / `minimax-h3`）并触发生成时，系统报错：
`[omnimux:omnimux-request-failed] 尚未配置图片、视频和音频，当前运行方式不能使用这一项`。

### 根因复盘
1. **画布请求特征**：图像摘要触发条（`ImageTriggerBar`）是极简设计，不带有渠道选择（`allowedGroups` 为空）；视频节点默认提交基准模型（`minimax-h3`）时，`allowedGroups` 同样为空。两者发出的请求中 `targetChannel` 均为空字符串。
2. **挂载层逻辑断层**：在 Issue #2694 中，文本挂载层（`text/mount.js`）成功引入了 `isOfficialModel` 白名单放行逻辑，解除了全局 `runtimeMode` 对官方文本模型的垄断拦截；但媒体挂载层（`media/mount.js`）遗漏了该逻辑，在 `!targetChannel` 分支依然强绑定 `runtime.mode === 'official'`。
3. **连坐阻断**：因 `isOfficialRequest` 被误判为 `false`，导致请求无法进入官方 Token Bypass 逻辑，被迫跌入 `assertRuntimeReady(current, kind)`。系统检测到用户全局处于 Agent 模式且未配置自备 BYOK 媒体提供商，直接抛出硬编码错误。

## 二、架构设计原则：正交共存与对齐放行 (Architecture)
1. **多模态对称对齐**：媒体挂载层（`media/mount.js`）与文本挂载层（`text/mount.js`）保持严格一致的官方模型识别契约。
2. **基于官方渠道目录识别官方模型**：
   - 当请求的 `requestModelId` 在 `MODEL_CHANNEL_GROUPS` 中登记有官方渠道分组（`effectiveModelGroups.length > 0`），或缺省模型属于官方默认模型（`DEFAULT_MEDIA.providers.omnimux.models[kind]`）时，判定为官方内置媒体模型（`isOfficialModel === true`）；
   - 在未显式指定 `targetChannel` 的请求中，若模型为官方模型（`isOfficialModel === true`），直接识别为官方专线请求（`isOfficialRequest === true`）。
3. **凭据安全门禁闭环**：
   - 官方专线请求必须且只能通过权威官方 Token（`hasOfficialToken === true`）放行（`isOfficialBypass === true`）；
   - 严禁信任客户端传入的 `req.env.OMNIMUX_API_KEY`；放行后严格由服务端安全注入权威 Token；
   - 若用户无官方 Token，即使请求的是官方模型，依然交由 `assertRuntimeReady` 拦截并提示配置，杜绝未登录/无凭据用户越权；
   - 若用户显式请求了自备渠道（`channelIntent.isByokChannel === true`），严格走 BYOK 验证链路，绝不被官方凭据意外冒领。

## 三、用户旅程与界面交互验收 (User Journey & Verification)
1. **画布图片生成（Image 2.5）**：
   - 用户在 Agent 模式下打开画布，向 `Image 2.5` 图像节点输入 Prompt 并点击生成；
   - 界面不再弹出 `尚未配置图片、视频和音频` 错误红框，节点正常进入生成流并成功返回产物。
2. **画布视频生成（Hailuo H3）**：
   - 用户在 Agent 模式下连接文本/图片到 `Hailuo H3` 视频节点，点击生成；
   - 系统正常调用 MiniMax 官方专线，节点显示正常排队与生成进度。
3. **自备渠道与未知模型防护**：
   - 请求未在系统登记的非法模型名或未配置好的 BYOK 渠道时，系统依然准确阻断并给出明确提示，不发生安全穿透。

## 四、测试与质量验收标准 (Acceptance Criteria)
- **AC-01（官方媒体模型正交放行）**：在 `runtimeMode: 'agent'` 或 `key` 模式下，存在官方 Token 时，请求 `gpt-image-2.5`、`minimax-h3`、`seedance-2-5`（未带渠道后缀）均安全放行，不抛出异常。
- **AC-02（缺省模型安全放行）**：未显式传入 `model` 的请求，自动回退到 `DEFAULT_MEDIA` 对应模态的默认官方模型并放行。
- **AC-03（无凭据防御）**：当系统不存在官方 Token 时，即使请求官方模型，依然被 `assertRuntimeReady` 拦截。
- **AC-04（未知模型与 BYOK 防穿透）**：未注册模型及未配置好的 BYOK 渠道，依然严格抛出异常。
