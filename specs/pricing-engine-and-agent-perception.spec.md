# 统一定价算价引擎与 Agent 会话单价感知规范

- 任务工作树：`.worktrees/omnimux-pricing-engine-issue-2167`（分支 `agent/omnimux-pricing-engine-issue-2167`）
- 基线：`origin/main` @ `0fe62357c`
- Issue：#2167
- 日期：2026-09-17

## 1. 背景与问题

此前用户排查中发现：
1. 历史遗留中枢渠道分组表（`channel-groups.js`）及画布镜像配置中，大量模型的 `pointsEstimate` 是人工填写的静态假数字（例如 `seedance-2-5` 标 4500 / 1800 积分），按平台标准 1 美元 = 10 积分折算，相当于生成一条 30 秒视频需要数百美元，产生严重误导。
2. 上游网关接口（`GET /api/pricing`）现已公开提供了完整的真实单价数据（`model_price`，美元标价）、计费计量单位（`per_second` / `per_task` / `per_token`）及各专线渠道倍率（`group_ratio`）。
3. 会话中的 Agent 缺乏对所选模型计费方式与成本的直接感知，当用户询问“生成 5 秒视频需要多少费用”或规划出片方案时，Agent 无法给出正确数字，也无法在调用工具前预估消耗。

## 2. 目标

1. **实现中枢统一定价算价引擎**（`plugins/omnimux/src/catalog/pricing-calculator.js`）：
   - 确立统一汇率基准：`1 美元 = 10 积分`（即 1 积分 = 0.1 美元 = 10 美分）。
   - 实现精确算价函数：
     - 按秒计费（`per_second`）：`积分 = 美元单价 × 秒数 × 线路倍率 × 10`
     - 按次计费（`per_task`）：`积分 = 美元单价 × 线路倍率 × 10`
     - 按量计费（`per_token`）：`积分 = (美元单价 / 1000) × Token数 × 线路倍率 × 10`
   - 提供直观人话单价与梯度预估格式化器（供 Agent 上下文注入与 UI 使用）。
2. **校正中枢渠道配置基准积分**：
   - 更新中枢 `plugins/omnimux/src/catalog/serving/channel-groups.js` 与画布镜像 `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts`。
   - 彻底剔除虚高的 4500 / 1800 等假数字，换算为基于基准生成（如标准视频短片 5 秒）的真实预估积分（如 Seedance 2.5 5秒短片约 16 积分，30秒满血约 94 积分；海螺 H3 5秒短片约 4 积分）。
   - 将已被上游弃用的虚假专线（如 `seedance-2-5-task-pro`）标记 `enabled: false`，避免路由失败。
3. **扩展 Agent 会话首轮上下文注入**：
   - 在 `plugins/omnimux/src/session/context-injector.js` 中，当注入用户选定模型时，主动附加该模型的计费模式、单价及典型时长（如 5 秒、30 秒）费用，使 Agent 具备开箱即用的费用感知与预估回答能力。
4. **保持双向门禁 100% 绿**：
   - 保证 `pnpm verify:model-contracts` 与 `verify-cross-plugin-model-alignment` 零错误通过。

## 3. 验收标准（可测试）

- **AC-1 (算价引擎准确性)**：
  - `seedance-2-5` 标准版（0.3143 美元/秒，倍率 1.0）：5 秒视频返回 15.715 积分（约 16 积分），30 秒视频返回 94.29 积分（约 94 积分）。
  - `minimax-h3` 标准版（0.0714 美元/秒，倍率 1.0）：5 秒视频返回 3.57 积分（约 4 积分）。
  - `seedance-2-5-task` 特惠版（0.558824 美元/次，倍率 1.0）：单次任务固定返回约 5.6 积分。
- **AC-2 (Agent 上下文注入费用感知)**：
  - 会话在 step 1 注入的提示词明确包含选定模型的计费方式（按秒/按次）、基础单价与示例时长预估（包含 5 秒和 30 秒积分数）。
  - 会话未选定模型（自动模式）时不注入计费干扰。
- **AC-3 (中枢渠道配置脱虚向实)**：
  - `channel-groups.js` 中不再出现未按比例换算的 4500/1800 等硬编码失真值。
  - 画布端 `channelGroups.ts` 镜像保持 100% 逐字一致。
- **AC-4 (上游弃用线路避坑保护)**：
  - 上游明确已弃用的 `seedance-2-5-task-pro` 标记 `enabled: false`，默认路由与备选池不再将其下发为活跃线路。
- **AC-5 (自动化测试与门禁 100% 通过)**：
  - 新增算价引擎单元测试；更新 context-injector 与 channel-groups 相关测试；
  - `pnpm verify:model-contracts` 严格模式零警告零错误。

## 4. 产品基线与非目标

- 本功能纯属本地计算与中枢数据收敛，不改动上游网关协议与实际扣款通道。
- 零新增开发机私有状态，新用户环境零配置即可生效。
