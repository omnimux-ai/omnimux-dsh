# Seedance 2.5 按次计费与通道组对齐规格 — Issue #1801

## 目标 (Objective)
用户于 2026-09-14 批准 Seedance 2.5 按次计费模型接入方案。在执行中枢（Hub）与工作流（Workflow）画布中，将网关真实开放的按次计费模型与通道组完整对齐，支持特惠按次（30秒9图专线）与进阶按次（高价满血专线），消除寻址断联，并在节点配置面板中呈现清晰的计费与时长约束。

## 验收标准 (Acceptance Criteria)
1. **通道组配置闭环**：
   - 在 `plugins/omnimux/src/catalog/serving/channel-groups.js` 与 `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts` 中保持逐字镜像一致。
   - `seedance-2-5` 新增 `pro` 进阶版（按次高价专线），`wireGroup` 映射至 `seedance-2-5-task-pro`，计费模式为 `per_task`。
   - `seedance-2-5` 修正 `cheap` 特惠版（30秒按次专线），`wireGroup` 对齐为网关真实生效的专属分组 `seedance-cheap`，计费模式为 `per_task`。
   - 保留原有 `standard` 标准版（按秒计费，`wireGroup: default`）。
2. **路由与候选解析**：
   - `resolveChannelPlan('seedance-2-5', { group: 'pro' })` 解析候选首位为 `seedance-2-5@seedance-2-5-task-pro`。
   - `resolveChannelPlan('seedance-2-5', { group: 'cheap' })` 解析候选首位为 `seedance-2-5@seedance-cheap`。
   - `resolveChannelPlan('seedance-2-5', { strategy: 'cost_first' })` 优先选择成本最低的 `cheap` 按次通道。
3. **节点配置面板呈现**：
   - 画布中选中 Seedance 2.5 时，线路切换列表可清晰看到「进阶版（按次高价专线 · 满血）」与「特惠版（限时特惠 · 30秒按次专线）」。
   - 切换至按次通道时，时长等生成参数预期明确（30秒整段出片）。
4. **质量门禁与回归**：
   - 单元测试与契约门禁全绿：`pnpm test` 及 `pnpm --filter omnimux test` 全数通过。
   - 门禁脚本无报错，不破坏既有模型契约。

## 涉及文件 (Project Structure)
- `plugins/omnimux/src/catalog/serving/channel-groups.js`：执行中枢通道组定义。
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts`：工作流通道组镜像定义。
- `plugins/omnimux/src/catalog/serving/channel-groups.test.js` 或相关路由测试：通道解析测试。

## 测试策略 (Testing Strategy)
- 先运行既有测试建立基线。
- 增加通道组解析与针对 `seedance-2-5` 按次线路（`pro` / `cheap`）的单元测试。
- 运行工作区测试确保 100% 通过。
