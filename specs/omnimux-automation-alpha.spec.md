# 规范：自动化插件标记为内测版（Alpha）

> 任务真源：用户指示“把自动化 插件 标记为 内测版 检查下其他插件标记的方式” · 分支 `agent/omnimux-automation-alpha`。
> 本文件是本任务人与 Agent 共享的验收真相源：写码前定死"建什么、怎样算完成"。

## 1. 业务目标与背景

### 1.1 现状与需求
1. **统一内测标准**：系统中现有账号（`omnimux-accounts`）、发布（`omnimux-publish`）、数据分析（`omnimux-analytics`）、任务表单（`omnimux-forms`）均在中枢生命周期注册表中登记为 Alpha 内测版；
2. **自动化功能成熟度定级**：自动化插件（`omnimux-automation`）目前处于快速迭代内测阶段，业务决策要求明确标示为内测版；
3. **安全隔离诉求**：正式环境（生产打包）需排除内测功能与 AI 工具调用，开发与内测环境保留完整可用性。

### 1.2 目标
1. 将 `omnimux-automation` 正式纳入 `plugins/omnimux/src/plugin-lifecycle.json`，标记为 `stage: "alpha"`；
2. 登记其 6 项工具的前缀防护 `toolPrefixes: ["automation_"]`；
3. 更新生命周期契约文档 `docs/contracts/alpha-release.md`；
4. 更新与修复生命周期同步策略测试 `scripts/sync-release-policy.test.mjs` 以及侧栏协调器测试；
5. 保证内测版在左侧栏自动呈现 `Alpha` 徽标与悬停说明，且所有现有自动化单测与中枢守卫测试 100% 通过。

## 2. 交互与技术契约

### 2.1 中枢生命周期注册表
`plugins/omnimux/src/plugin-lifecycle.json` 新增条目：
```json
"omnimux-automation": {
  "stage": "alpha",
  "toolPrefixes": ["automation_"]
}
```

### 2.2 视觉与侧边栏渲染契约
- 左侧功能入口（`omnimux-automation`）右侧渲染 `.omnimux-sidebar-alpha-badge` 徽标，文本为 `Alpha`；
- `aria-label` 为 `Alpha · 内测`；
- `aria-description` 与 `title` 为 `Alpha · 内测：开发阶段优先完善非 Alpha 功能；正式版不包含此功能。`；
- 折叠状态下自适应隐藏；
- 点击入口行为保持不变，正常打开自动化工作台 Tab（`omnimux-automation:workbench`）。

### 2.3 工具层与发布管线契约
- 在生产渠道（`production`）下，工具网关识别 `automation_` 前缀，执行拦截（`isAlphaTool` 返回 true 并禁用）；
- 在开发渠道（`development`）下正常放行；
- 生产打包排除 `omnimux-automation` 及其产物，开发环境物化保留。

## 3. 技术落点

1. `plugins/omnimux/src/plugin-lifecycle.json`:
   - 登记 `omnimux-automation`，`stage: "alpha"`，`toolPrefixes: ["automation_"]`；
2. `docs/contracts/alpha-release.md`:
   - 文档中将 Alpha 名单说明补充「自动化」；
3. `scripts/sync-release-policy.test.mjs`:
   - 断言 `alphaPluginIds` 包含 `omnimux-automation`；
   - 断言 `alphaToolPrefixes` 包含 `automation_`；
4. 验证套件：
   - `plugins/omnimux/src/client/sidebar-coordinator.test.js`
   - `plugins/omnimux/src/gate/guard.test.js`
   - `plugins/omnimux-automation` 全量测试

## 4. 验收标准（可测）

- [ ] **A1 注册表收敛**：`plugin-lifecycle.json` 包含 `omnimux-automation`，`stage` 为 `alpha`，`toolPrefixes` 包含 `automation_`。
- [ ] **A2 工具网关识别**：中枢工具安全网关能正确识别 `automation_create` 等工具为 Alpha 工具并在生产渠道阻断。
- [ ] **A3 侧栏协调器呈现**：协调器为 `omnimux-automation` 入口正确添加 `Alpha` 徽标与悬停说明，且不干扰点击。
- [ ] **A4 契约与测试同步**：`docs/contracts/alpha-release.md` 与相关生命周期测试全部通过。
