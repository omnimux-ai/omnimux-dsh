# 规格：把「谁是真源」写进 L1 合同，并退役仍对着本地表的老门禁

**任务**：合同真源口径 + 门禁收口（第三步）
**分支 / 工作树**：`agent/contracts-gate-truth` / `.worktrees/contracts-gate-truth`
**基线**：`origin/main` @ `dfc4e58e0e5bb1ac4855ab02d8df30da7c62d0b3`
**Issue**：无（由父任务直接派发；无对外发布授权，本任务不 commit / 不 push）

## 1. 背景

P1a / P1b / P1-2 已合入主干：

- P1a：网关快照接入运行时（拉取 / 缓存 / 刷新 / 只读诊断）。
- P1b：**成员资格、线路、价格已切换为网关快照**；本地只保留调用契约与展示覆盖；`dispositions.json` 删了 16 行（83 → 67）；`requiredInAuto` 已删除（#3734）。
- P1-2：快照丢型号校验（基线对比）、语音转写豁免改成清单显式声明（`gatewayMembershipExempt`，#3763）、`verify-models.mjs` 已退役联网分支（存在性改用随包快照）。

但 L1 合同仍写着「成员资格真源 = hub listed / patch 拥有 model list」，且门禁层缺一条「契约 listed ↔ 快照在售」的离线口径断言。本任务把真源口径写进合同，并给门禁补上这条口径。

## 2. 目标

1. L1 合同改口径：**在售由网关快照决定**；hub 四个列表 = `快照在售 ∩ 调用契约` 的投影；patch 只拥有字段形状（wire 参数 / 模态 / 窗口 / reasoning）。
2. `listedOperations` 明确为**调用契约准入集合**（≠ 在售），最终可见性再 ∩ 快照。
3. 门禁：`scripts/verify-model-contracts.mjs` 增加离线断言，把「目录 listed 型号 ↔ 随包快照在售」的关系固定下来。
4. `scripts/verify-models.mjs` 把「存在性用随包快照」写进输出与措辞（已无联网 / 密钥路径）。

## 3. 不改动（硬约束）

- 不动 `scripts/verify-channel-group-pricing.mjs`、`scripts/verify-channel-group-naming.mjs`、`scripts/verify-cross-plugin-model-alignment.mjs`（未合入的画布分支正在改写它们，避免冲突）。
- 不 commit / 不 push；不改工作树之外的文件。
- 不新增空 `catch {}`、动态 `import`、`eval`、`require`。
- 新增 / 修改的**测试代码**不使用展开写法（`...`）或计算成员访问；用 `Object.assign` / `Object.fromEntries` 替代。
- 不改 `package.json`（§3.1 写保护 + 保持 `test:gates` 486 基线，理由见 §9）。

## 假设

本次改动依赖两条关键假设：① 运行时「谁在售」的唯一判据确实是 `usableSnapshotModels(snapshot)`（即 `enable_groups` 非空），而不是任何本地标志位；② 契约 `listedOperations` 由 `computeOperationListed` 的五元判定独立算出，与快照无关，因此「契约 listed ↔ 快照在售」是两条独立真源的交叉，可以真的报错。

## 证伪方式

若假设 ① 错，`plugins/omnimux/src/catalog/list.js` 的四个列表过滤条件里会再出现本地表 / 本地标志（可 grep `gatewayIds` 之外的在售判据），或删掉快照后目录仍非空。若假设 ② 错，`listedOperations` 会随快照变化（对同一 specs 换不同快照跑 `pnpm verify:model-contracts`，`listedOperations` 数量会变）。两条都可直接跑命令观测：`node -e` 读 `buildModelCatalog({snapshot})` 与 `getContractIndex()` 对比，或对空快照断言 `catalog.text.length === 0`。

## 4. 旧标准变更

本次修改了既有门禁脚本的行为面，逐条声明：

- `scripts/verify-model-contracts.mjs`：`runVerify()` 的总体 ok 判定新增一个离线子门禁 `gatewayMembership`。此前该脚本不校验「契约 listed ↔ 随包快照在售」；此后该项失败会让 `ok=false` / `exitCode=1`。**不是**放宽，是收紧；未删除任何既有断言。
- `scripts/verify-models.mjs`：stdout JSON 新增 `existence` / `snapshot` 字段。既有字段与失败条件（`missing` / `mismatches` / `whitelistMissing` / `reasoningMissing` / `reasoningDefaultWrong`）不变；新增字段只描述事实，不新增失败条件。
- `docs/contracts/channel-group-pricing.md`：删除一句与事实不符的「CI 与代码提交时执行 … 立即阻断合入」（实测该脚本不在 `test:gates`、也不在 CI），改为如实描述本地按需执行。这是**文档措辞纠错**，不改变门禁行为。
- 文档类合同（`model-list-ownership.md` / `model-capabilities-matrix.md` / `hub.md` / `plugin-qa.md` / `model-api-authority.md` / 两个 `AGENTS.md`）：口径与计数更正，不改变运行时准入。

## 5. 门禁改动与证伪实验记录（anti-agent-fake-completion-guard §3.4.1）

### 5.1 改了什么

`scripts/verify-model-contracts.mjs` 新增导出 `verifyGatewayMembership(index, snapshot, catalog, options)`，并在 `runVerify()` 里与 `verifyAutoServing` / `verifyCrossPluginModelAlignment` 并列执行。

### 5.2 为什么不是「目录 listed ⊆ 快照在售」的字面写法

字面写法在当前实现里**恒真**：`buildModelCatalog` 的四个列表就是拿同一份快照过滤出来的（`plugins/omnimux/src/catalog/list.js:184-191` 的 `listed()` / `textRows`）。这一点上游 P1b 已经踩过：`scripts/verify-auto-serving.mjs:213-215` 留了明确注释——「The catalog is built from this same snapshot, so "listed but not on sale" cannot happen by construction; asserting it was a tautology」，并因此**删掉了**那条断言。所以本任务不重复那条恒真断言，改为固定 `catalog.gateway.missingContract` 与快照在售集合的关系（父任务指令的兜底口径）。

### 5.3 实际断言

用**随包快照**（`readBundledSnapshot()`，离线、无密钥、无网络）独立重算，与目录自己报告的 `gateway.missingContract` 对账：

1. `gateway_missing_contract_drift`（error）：`catalog.gateway.missingContract` 必须**精确等于** `随包快照在售集合 \ 契约 listed 型号集合`。右侧由 `getContractIndex()` 的 `op.listed` 独立算出，左侧由 `buildModelCatalog` 自己算出，两条路径不同源。
2. `gateway_missing_contract_not_on_sale`（error）：`missingContract` 的每个 id 都必须在随包快照在售集合内（防止诊断项指向幽灵型号）。
3. `gateway_exempt_now_sold`（error）：声明了 `gatewayMembershipExempt` 的型号如果已经在随包快照在售，说明豁免已过期，必须回收（`auto-serving-manifest.json` 自己写了「快照发布 speech_to_text 型号时立即回收」）。
4. `gateway_missing_contract_all_contracted`（error）：反向核对——随包快照在售集合里、**有**契约 listed 的型号不得出现在 `missingContract` 里。

### 5.4 证伪实验（收紧型）

反例造在**内存入参**上（不落盘、不改生产数据），直接调用导出的求值入口：

- 实验 A（断言 1，收紧型）：造一个 `catalog.gateway.missingContract` 被篡改为少一项的假 catalog，喂给 `verifyGatewayMembership`。
  - 造之前：真实入参 → `ok=true`，`issues=[]`（贴真实输出）。
  - 造之后：`ok=false`，出现 `gateway_missing_contract_drift`（贴真实输出）。
  - 已回退：改用真实入参重跑 → 再次 `ok=true`。
- 实验 B（断言 3，收紧型）：造一个 `gatewayMembershipExempt` 型号（`whisper-1`）**同时**出现在快照在售集合里的假快照。
  - 造之前：真实快照 → `ok=true`。
  - 造之后：`ok=false`，出现 `gateway_exempt_now_sold`。
  - 已回退：真实快照 → `ok=true`。
- 实验 C（断言 4，收紧型）：造一个 `missingContract` 里混入已 contracted 型号的假 catalog → 出现 `gateway_missing_contract_all_contracted`，回退后绿。

三项都写进 `scripts/verify-model-contracts.test.mjs`（作为有意的回归用例保留，因此不回退测试本身；回退的是反例数据）。实验的真实输出见交付报告。

## 6. 验收

| 项 | 命令 | 期望 |
| --- | --- | --- |
| 门禁单测（新增） | `node --test scripts/verify-model-contracts.test.mjs` | 全绿，含 3 条证伪回归 |
| 模型契约门禁 | `pnpm verify:model-contracts` | ok=true（admission 0 error；modality matrix ok） |
| 边界 | `pnpm check:boundaries` | 绿 |
| 门禁总集 | `pnpm test:gates` | 486/486（本机已清理代理产物） |
| 文档 | `git diff --check` | 无空白错误 |
| AGENTS | `node --test scripts/verify-agents-md.test.mjs` | 绿（改了根 / 插件 AGENTS.md） |
| 双语配对 | `pnpm doc:pairing` | 改动文件不在配对表内则说明 not applicable |

## 7. 原文 → 新文 对照

见交付报告（逐文件逐条）。对应已合入实现：

| 合同改动 | 对应实现 |
| --- | --- |
| 在售真源 = 网关快照 | `plugins/omnimux/src/catalog/list.js`（P1b `gatewayIds`） |
| 四列表 = 快照在售 ∩ 调用契约 | `list.js` 的 `listed()` / `textRows` |
| `gateway` 字段与 `defaultsByOperation` 兜底 | `list.js` 返回体；`resolveDefault` 的 byOperation 层 |
| 转写豁免 = 清单显式声明 | `auto-serving-manifest.json` `gatewayMembershipExempt` + `serving/id-universe.js` |
| D1 收窄 | `contract/dispositions.js` D1 注释与实现 |
| 处置表 83 → 67 | `contract/dispositions.json`；`git show a2a3c5286^:` = 83 行，`git show a2a3c5286:` = 67 行（P1b #3734/#3752，删 16 行） |
| `verify:models` 离线 | `scripts/verify-models.mjs` #3763 |
| 丢型号门禁 | `scripts/verify-auto-serving.mjs` `snapshot_model_dropped` |

## 8. 依赖与遗留

- **依赖（必须注明）**：存在一条**未合入**的画布分支，已改写 `scripts/verify-channel-group-pricing.mjs`、`verify-channel-group-naming.mjs`、`verify-cross-plugin-model-alignment.mjs` 的渠道段（改为对着目录校验）。本任务**未触碰**这三个脚本，以免冲突；本任务新增的 `verifyGatewayMembership` 只读契约索引与随包快照，不依赖它们的内部结构。
- **决定：不把 `verify:group-naming` / `verify:group-pricing` 接进 `test:gates`**。理由：① `package.json` 属 §3.1 写保护的配置面，改动需单独审批，本任务权限范围不覆盖；② 这两个脚本正被未合入画布分支改写，接入会在两分支间制造隐性耦合；③ 保持 `test:gates` 486/486 基线可比。改为在 `plugin-qa.md` 如实登记「有脚本、有自测、未接入自动化 runner」，并纠正 `channel-group-pricing.md` 里「CI 必检」的过期表述。
- 已处理：`docs/contracts/channel-group-naming.md` / `channel-group-pricing.md` 里「强制 (MANDATORY)」「CI 与代码提交时执行 … 立即阻断合入」的过期表述已就地更正为「离线、本地按需执行、未接入 `test:gates` 或 CI」（只改措辞，不动那两个脚本）。
- **已核实的数字**：`dispositions.json` 由 **83 → 67** 行已用 git 历史核对（`git show a2a3c5286^:` = 83，`git show a2a3c5286:` = 67；提交 `a2a3c5286` = P1b #3734/#3752）；随包快照在售 **11**、契约 listed **9**、`missingContract` **6**、四列表 text/image/video/audio = **1/1/2/1** 均为本机实测。
- **不确定处**：新门禁的 `gateway_missing_contract_drift` 在快照刷新（型号增删）时可能自然变红——这是设计意图（快照与契约必须同批对账），但未在本次任务里模拟一次真实的快照刷新；`gateway_exempt_now_sold` 的复核触发日期（2026-11-25）也依赖人工，门禁只能提示不能强制到期。
