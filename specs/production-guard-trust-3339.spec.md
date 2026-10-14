# #3339 生产防造假规则移除自述授权

## 目标与成功标准

父任务 #3301 / #3302 阶段 A 的剩余最小信任移除切片。固定基线为 `09555b25e1d4668df2e72d8319c2de99af9f2932`。生产文件中原有假数据声明和 catch 返回状态对象规则保持原模式与路径资格，只删除调用者自述意图、本地 approved 文件与传参 exemptions 的放行权。

- 生产 mock 声明即使带 `test_authoring` / `frontend_skeleton` 或 approved 元数据仍拒绝。
- 命中原 catch 状态对象模式，即使带 `fallback_infra` 与日志仍拒绝。
- `handle` 不再读取 `DSH_TASK_INTENT` 或 `.tmp/anti-cheat-exemptions.json` 作为权限；公开兼容参数接收但 ignored_noauthority。
- 测试/fixture 路径、完整候选、已有 delta 风险比较与公开 apply 来源的现有严格规则不变；不删除或跳过原回归用例。
- 生产正常占位、缓存返回、抛错原有控制继续通过；不新增一般关键词或重写异常解析器。

## 命令

先通过 `evaluateAntiCheat`、`handle` 与真实 CLI stdin 记录基线反证；再执行：

- `node --test scripts/guard-anti-cheat.test.mjs`
- `node --test scripts/guard-quality-loop.test.mjs scripts/test-authoring-inspection.test.mjs scripts/test-change-review.test.mjs`（authoring 已导入公开来源套件）
- `node --check scripts/guard-anti-cheat.mjs` 与 `node --check scripts/guard-anti-cheat.test.mjs`
- `git diff --check`
- `node scripts/impact-matrix.mjs --git-diff --base 09555b25e1d4668df2e72d8319c2de99af9f2932`

完整 gates 由父代理在实施 final 后执行；本代理不运行全量 gates、安装或构建。

## 项目结构与写范围

仅修改 `scripts/guard-anti-cheat.mjs`、`scripts/guard-anti-cheat.test.mjs`、`tests/anti-cheat-samples/` 内相关 JSON、本契约 `docs/contracts/anti-agent-fake-completion-guard.md` 与本规格。唯一实施报告位于主检出的 `tmp/agent-infra-2026-10-14/production-guard-3339-implementation.md`，先保存再最终更新。CLI 本地 approved 文件仅可使用小型 task-owned synthetic fixture，绝不读取真实主根豁免内容。

## 代码风格与最小实现

沿原规则删除免检分支，不重写大块守卫。保留已有规则编号、返回协议及公开入口。移除 unused intent/exemptions 解构及权限 I/O；兼容参数文档明确没有授权效果。新增正常公开测试优先 `Object.entries`，不得添加 spread、computed fields 或新 child_process import 风险；若 root gate 拒绝正式测试或必要 fixture 写入，停止受影响写入，不通过 shell、别名或 intent 绕行。

## 测试策略与标准独立性

预先确认的测试入口为 `evaluateAntiCheat`、`handle`、真实 CLI stdin。先证明基线在旧意图/approved 条件下确实放行生产 mock 或假成功 catch，后验证这些同一输入拒绝；合法真实 fixture 路径作为正向控制。现有 ALLOW-002 骨架样例实际使用 placeholderItems 而非 mock 声明，不依赖意图即可通过，保留原路径和原代码，更新描述澄清。若发现依赖旧授权的白样例则保留身份明确改为 deny，不把它搬成 fixture 来刷绿。既有 approved 用例保留并改为拒绝，属于已经批准的权限标准更正，仍交独立评审核验。

本次不机械证明旧标准语义等价，已有标准删除、跳过、聚焦或期待变化仍需独立审查；不因本次测试通过宣称阶段 A 完成。

## 执行时边界记录

正式测试增加 `handle` 具名导入遭 root guard `RULE-01-TEST-IMMUTABLE` 拒绝，立即停止该测试后续扩写，未以 shell/intent/别名绕写。普通 samples 的三黑一白新增及两个描述更正也遭同一门禁拒绝，全部未落地且停止该面写入。保留原七个 samples，不删除或 skip；批准的原 approved 测试更正已先合法落地并产生一次红再绿。必要 owned synthetic approved JSON 已正常 write 成功但被全局 `*.tmp` 忽略，仅作一次 CLI 证据，不把它当成已入库正式回归。

初轮新增意图/CLI/fixture控制仅有临时行为证据。父后通过正常既有CLI测试作用域，合法增加三种环境意图与传入approved自述均不得免检的正式反例，保留原测试及规则ID；既有质量工作流直接执行该套件，单一治理清单同步归入ciRequired。实际本地approved文件持续回归和新增JSON样例仍未补齐，不据此宣称完整A。该CI与清单联动是父批准交付的必要证据入口，独审须核新增反例确实执行而非只有名称。

## 边界与新用户基线

新用户只依赖仓库现有 Node/acorn 与已注册钩子，不需要开发机意图环境、本地审批文件或新 token 服务。无法解析或无法确认既有测试来源仍走原 fail-closed，不扩大权限。

总是：保留全部原用例，保存真实退出码、实际计数、反证、源码 hash、差异和未知项。先问/停止：需要扩大写范围或被 root gate 拒绝的新增执行风险。绝不：commit/push/fetch、修改其他树或 #3302 dirty 草稿、读取真实豁免内容、安装、Dev/Prod/profile/官方全局或跨仓写入、真实模型媒体付款。浏览器/物化不适用，变更仅脚本和所属文档。
