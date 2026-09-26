# 规格：多渠道模型选择器与契约自适应（Issue #2652）

- **作者**：寇豆码（Kou · Software Engineer）& 高见远（Gao · Software Architect）& 许清楚（Xu · Product Manager）
- **日期**：2026-09-25
- **关联 Issue**：#2652
- **关联架构设计书**：`.workbuddy/design/multi-channel-architecture-design.md`
- **目标工作树**：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-multi-channel-selector-2652`

---

## 一、目标（Objective）

### 1.1 业务背景与问题定义
当前系统存在四大阻断与技术债：
1. **全局运行时连坐阻断**：`runtimeMode === 'agent'`（本机 CLI 助手对话）时，`resolveRuntimeChoice` 将 `mediaReady` 硬编码为 `false`，且 `mediaReadyFor` 仅允许 `official` 或 `key` 模式，导致用户即使配置并验证了媒体 Provider（如 `fal.ai`）或节点选用官方专线，媒体生成仍被阻断报错。
2. **中枢执行器模型入参覆盖**：`plugins/omnimux/src/media/execute.js` 强制将 `models[capability]` 绑定为全局单例默认值（`mediaChoice.activeModel`），导致消费端传入的 `seedance-2-0` 等逻辑模型 ID 被覆盖，或带 `@channel` 后缀未剥离。
3. **静态渠道池无法感知用户自备 Provider**：`channel-groups.js` 仅维护静态内置渠道，缺少根据 `runtimeSettings` 动态拼装 `byok-*` 渠道（如 `byok-fal`、`byok-openai`）的能力。
4. **渠道切换缺乏显式契约自愈与失效回退**：渠道切换后参数超出范围无自愈提示，自备渠道被删除后无平滑降级机制。

### 1.2 预期用户旅程与行为表现
1. 用户在全局设置中将对话模式设为「本机 CLI 助手」（`agent`），并配置已验证的媒体 Provider（如 `fal.ai` Key）：
   - 点击生成图片/视频/音频时，系统正常调用对应 Provider，不再无差别报错「尚未配置图片、视频和音频，当前运行方式不能使用这一项」。
2. 画布节点或应用表单指定模型（如 `seedance-2-0@byok-fal`）并发起执行：
   - 执行中枢精准提取 `seedance-2-0` 作为逻辑模型 ID 透传给对应 Provider，不被单例设置篡改；
   - 识别 `byok-fal` 渠道并走 BYOK 直连路径，正确获取 `OMNIMUX_MEDIA_KEY_FAL` 凭证。
3. 在模型渠道选择器与路由规划中：
   - 当配置了自备媒体 Provider 时，渠道列表自动追加显示「我的 fal.ai」（`badge: '自备 API Key · 直连专线'`, `chipLabel: '按需自付'`）；
   - `resolveChannelPlan` 兼容 `byok-*` 渠道，不作为非法未定义渠道抛错。

---

## 二、验收标准（Acceptance Criteria）

- **AC-01（解除连坐）**：当 `runtimeMode: 'agent'`，且配置并通过验证了媒体 Provider（如 `runtimeKeyVerified: true, runtimeMediaImage: true`）时，`assertRuntimeReady(settings, 'image')` 顺利通过不抛错；`resolveRuntimeChoice(settings).mediaReady` 为 `true`。
- **AC-02（优先透传传入模型）**：`resolveEffectiveMediaModel(inputModel, provider, capability, runtimeSettings)` 在 `inputModel` 传入 `seedance-2-0@byok-fal` 或 `seedance-2-0` 时，始终返回 `seedance-2-0`；仅在未提供 `inputModel` 时回退至 `mediaChoice.activeModel` 或 `runtimeSettings.runtimeKeyModel`。
- **AC-03（动态 BYOK 渠道池）**：`resolveModelChannelGroups(modelId, runtimeSettings)` 在 `runtimeSettings.runtimeKeyVerified === true` 时，正确拼接对应的 `byok-*` 渠道项，元数据（id, label, badge, chipLabel, enabled, isAvailable）符合契约。
- **AC-04（渠道规划器兼容）**：`resolveChannelPlan(modelId, { group: 'byok-fal', ... })` 正确解析并包含 `byok-fal` 候选，不被标记为未解析渠道。
- **AC-05（无退化）**：所有现有关于 `runtimeMode`、`channel-groups`、`media/mount` 的已有单测持续 100% 保持通过。

---

## 三、命令（Commands）

```bash
# 工作目录
cd /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-multi-channel-selector-2652

# 运行单元测试
node --test plugins/omnimux/src/settings/runtime-mode.test.js
node --test plugins/omnimux/src/catalog/serving/channel-groups.test.js
node --test plugins/omnimux/src/media/multi-channel-runtime.test.js
pnpm --filter omnimux test
```

---

## 四、项目结构（Project Structure）

```
plugins/omnimux/
  src/
    settings/
      runtime-mode.js       # 重构 mediaReadyFor 与 resolveRuntimeChoice
      runtime-mode.test.js  # 补充 agent 模式放行单测
    media/
      execute.js            # 实现 resolveEffectiveMediaModel，支持 byok 渠道路由
      mount.js              # 放行具备官方/自备渠道的请求
      multi-channel-runtime.test.js # 新增多渠道执行中枢端到端单测
    catalog/serving/
      channel-groups.js     # 导出 BYOK_PROVIDER_DISPLAY_MAP 与 resolveModelChannelGroups
      channel-groups.test.js # 补充动态 BYOK 渠道解析单测
```

---

## 五、代码风格与实现规范（Code Style Sample）

```javascript
// 严格对齐 JSDoc，明确参数与返回值类型，具备异常防御
export function resolveEffectiveMediaModel(inputModel, provider, capability, runtimeSettings) {
  if (typeof inputModel === 'string' && inputModel.trim()) {
    const raw = inputModel.trim()
    const atIdx = raw.indexOf('@')
    const bareModel = (atIdx > 0 ? raw.slice(0, atIdx) : raw).trim()
    if (bareModel) {
      return bareModel
    }
  }

  const mediaChoice = resolveMediaProviderChoice(runtimeSettings, capability)
  const hasMediaProvider = Boolean(runtimeSettings?.runtimeMediaProvider)
  const customModel = typeof runtimeSettings?.runtimeKeyModel === 'string'
    ? runtimeSettings.runtimeKeyModel.trim()
    : ''

  if (hasMediaProvider) {
    return mediaChoice.activeModel || customModel || DEFAULT_MEDIA_MODELS[capability] || 'default'
  }
  return customModel || mediaChoice.activeModel || DEFAULT_MEDIA_MODELS[capability] || 'default'
}
```

---

## 六、测试策略（Testing Strategy）

1. **单元测试层**：
   - `runtime-mode.test.js`：覆盖 `runtimeMode: 'agent'` 配对验证通过的 media provider，断言 `mediaReady` 动态为 `true`，且 `assertRuntimeReady` 正常通过；
   - `channel-groups.test.js`：覆盖 `resolveModelChannelGroups` 在有/无 `runtimeSettings`、不同 provider（fal, openai, openrouter, custom）下的聚合结果；
   - `multi-channel-runtime.test.js`：覆盖 `resolveEffectiveMediaModel` 对各层级入参的回退链与 `@channel` 剥离逻辑，以及 `executeOmnimuxMedia` 的路由与凭证解析。
2. **回归校验**：运行全量 `plugins/omnimux` 单测，确保无非预期回归。

---

## 七、边界规范（Boundaries）

- **总是做（ALWAYS）**：
  - 严格保持函数纯洁性与向下兼容性；
  - 增量修改最小必要代码；
  - 每一行代码完整，禁止使用 TODO / pass / 桩函数；
  - 保持类型标注与错误边界完备。
- **先问（ASK FIRST）**：
  - 涉及持久化存储 schema 或外部协议变更。
- **绝不做（NEVER）**：
  - 严禁硬编码 `mediaReady: false`；
  - 严禁使用单例配置模型覆盖用户显式传入的逻辑模型 ID；
  - 严禁破坏现有官方渠道与计费逻辑。
