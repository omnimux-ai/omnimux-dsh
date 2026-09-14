# Stage 打开意图契约维护（Issue #1768，关联 #1762）

## 目标
保持已合入的产品行为不变，消除侧栏导航与普通工作台重开的验证语义混淆。父代理已批准根因报告中的最小方案：仅维护契约、门禁与测试，不改生产代码。

## 验收标准
- 通用侧栏 adapter.open（首次、已有 split 记录、收起后）与 set(true) 均进入 gui，激活正确 Tab，不重复、不占 overlay。
- 普通 api.open({tabId}) 不传 focus，恢复同会话该 Tab 的 split/gui 偏好及宽度。
- 关闭后 detach/attach 不自发打开；会话隔离、取消订阅、模式和宽度原断言全部保留。
- 所有 Stage 仍受检查，不设 accounts 特例或跳过。
- 文档明确导航例外，不废除普通重开的偏好恢复规则。

## 命令
在本任务树运行：`node --test plugins/omnimux/src/client/workbench.test.js`；`node --test scripts/live-qa.test.mjs`；`pnpm verify:stages`；`pnpm test:gates`；`git diff --check`。原始输出保留于 `.agent-reports/local-sort/stage-*.log`。

## 项目结构与改动范围
- `scripts/live-stage-contracts.mjs`：真实装配门禁的双路径断言。
- `scripts/live-qa.test.mjs`：现有运行集成回归。
- `plugins/omnimux/src/client/workbench.test.js`：侧栏显式焦点用例。
- `docs/contracts/workbench-split.md`：默认焦点、导航适配器与普通 open 边界。
- `.agent-reports/local-sort/stage-fix.md`：交付证据与未知。

## 代码风格
沿用具名函数、Node strict assert、单引号、无分号。断言期望固定为契约语义，不从实际结果动态生成期望。复用现有 captureStageContract，不建第二测试装配器。

## 测试策略与计划
先保留现有集成门禁红证据，再为通用侧栏增加明确 gui 验证并将模式记忆循环改为普通 open。补侧栏参数单测，复跑双路径与全部门禁。后续新失败先复现并定位，不扩大修复范围。此维护不改产品 UI，因此不以静态测试冒称新浏览器验收；#1762 浏览器证据由父代理另线持有。

## 边界
总是：保留模式/宽度/会话/取消订阅/overlay全部原有保护；检查输出真实落盘。
先问父代理：出现需要生产变更、CI配置或新依赖的结论。
绝不：改生产行为、跳过目标、放宽断言、写Git、改其他工作树、物化或发布。

## 已知前提
PR1593已合入，历史关联Issue误链；此维护依据父代理本轮明确批准，不伪称历史L1已包含导航例外。暂无待决实施问题。
