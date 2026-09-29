# Spec: 变更面到最小命令选型纪律

## Goal
Agent 改仓后默认按变更面选出最小充分检查集，禁止无差别全仓；假绿与世界态规则可查；Dev 真机验收不回落到 Agent 卡点。

## User / Agent journeys
1. 文档-only 改动：只跑 git diff --check 与必要文档配对检查，不跑包测或浏览器。
2. 单插件非 UI：只跑对应包过滤测试及触及的契约门禁，不跑全仓。
3. Stage/UI：跑 stages 静态门及隔离工作树功能路径浏览器证据；不把 Dev 45120 真机验收当 Agent 必做。

## Success criteria
- plugin-qa 合同含本地最小命令选型专节（算法、表、假绿、世界态），作为命令表唯一真源。
- omnimux-repo-workflow 含五步选型流程并指向该专节。
- workflow skill 不再要求 Agent 必做 Dev verify:live；交付门槛明确为隔离工作树 Web 证据。
- AGENTS Verification 保留粗表并指针到 plugin-qa / workflow；写明默认禁止全仓 test:all 与 verify:all。
- 三处交叉一致；git diff --check 通过。

## Non-goals
不新增选型脚本；不改 CI required checks；不照搬上游百分百覆盖率。

## Baseline
新用户机器不依赖本纪律文档即可安装使用；本变更只约束 Agent 与开发流程。
