# 规格：TikTok Agent 角色预设探测显式入参绝对优先级与隔离治理

## 1. 目标（Objective）
修复 `isTikTokAgentPreset` 探测逻辑中回退链（Fallback Probes，包括全局状态 `window.__omnimuxActivePreset` 与 DOM 席位元素探测）穿透覆盖显式指定的非 TikTok 预设的问题。
确保只要调用方通过入参显式声明了预设角色（`props?.agentPreset`、`session?.projectionValues?.agentPreset`、`session?.agentPreset`、`session?.meta?.agentPreset`），无论是否命中 TikTok 白名单，均直接根据显式值判定并返回，绝不向下穿透到全局缓存和 DOM 回退探测，杜绝上下文污染。

## 2. 影响范围与结构（Project Structure）
- 核心逻辑：`plugins/omnimux/src/client/composer-quick-shortcuts/isTikTokAgentPreset.js`
- 单元测试：`plugins/omnimux/src/client/composer-quick-shortcuts/isTikTokAgentPreset.test.js`

## 3. 执行命令（Commands）
- 单测验证：`node --test plugins/omnimux/src/client/composer-quick-shortcuts/isTikTokAgentPreset.test.js`

## 4. 详细行为契约（Behavior & Contract）
### 4.1 显式入参优先级检查
按以下先后顺序依次检查显式入参：
1. `props?.agentPreset`
2. `session?.projectionValues?.agentPreset`
3. `session?.agentPreset`
4. `session?.meta?.agentPreset`

判定规则：
- 只要遍历到任一字段满足 `typeof candidate === 'string' && candidate.trim().length > 0`：
  - 立即计算并返回 `matchesTikTokPreset(candidate)`（布尔值）；
  - **严禁继续向后遍历其他入参，严禁继续向下穿透到 `window.__omnimuxActivePreset` 和 DOM 探测！**
  - 例如传入 `{ agentPreset: 'standard' }`，直接返回 `false`，即便全局变量或 DOM 标记为 TikTok 席位，也绝对不能返回 `true`。

### 4.2 回退探测链触发条件（Fallback Probes）
当且仅当上述 4 个显式入参均未提供、为 `null`/`undefined` 或为空字符串（`trim().length === 0`）时，才向下进入回退探测：
1. 检查 `typeof window !== 'undefined' && matchesTikTokPreset(window.__omnimuxActivePreset)`，命中返回 `true`；
2. 检查 DOM 中 `[data-omnimux-preset-seat]` 或 `[data-omnimux-preset-id]` 属性，命中返回 `true`；
3. 检查 DOM 中 `[class*="seatLabel"]` 文本内容，命中返回 `true`；
4. 均未命中返回 `false`。

## 5. 测试验收用例（Testing & Acceptance Criteria）
1. **全局变量污染隔离**：
   - 当 `window.__omnimuxActivePreset = 'tiktok-agent'` 时：
     - `isTikTokAgentPreset(null, { agentPreset: 'standard' }) === false`
     - `isTikTokAgentPreset({ projectionValues: { agentPreset: 'omni-agent' } }, {}) === false`
     - `isTikTokAgentPreset({ agentPreset: 'standard' }, {}) === false`
     - `isTikTokAgentPreset({ meta: { agentPreset: 'software-company' } }, {}) === false`
2. **DOM 席位污染隔离**：
   - 当 DOM 中存在 `div[data-omnimux-preset-seat="tiktok-agent"]` 或 `.seatLabel` 为 `TikTok运营专家团` 时：
     - `isTikTokAgentPreset(null, { agentPreset: 'standard' }) === false`
     - `isTikTokAgentPreset({ projectionValues: { agentPreset: 'omni-agent' } }, {}) === false`
     - `isTikTokAgentPreset({ agentPreset: 'standard' }, {}) === false`
     - `isTikTokAgentPreset({ meta: { agentPreset: 'software-company' } }, {}) === false`
3. **混合多重污染严格隔离**：
   - 同时存在全局 `window.__omnimuxActivePreset = 'tiktok-agent'` 与 DOM TikTok 席位时，显式指定非 TikTok 预设必须严格返回 `false`。
4. **原有测试契约 100% 保持兼容**：
   - 显式命中 TikTok 预设继续返回 `true`。
   - 显式未指定时，回退到全局和 DOM 席位探测。

## 6. 边界与红线（Boundaries）
- **Always**：在提交前运行 `node --test` 确保测试 100% 通过；
- **Never**：严禁在有显式参数时允许回退探测链执行；
- **Never**：严禁使用未声明的全局变量或引入额外的第三方依赖。
