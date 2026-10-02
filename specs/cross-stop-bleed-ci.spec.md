# Spec: 止血——主干测试全绿，全部插件测试与插件装载检查进入合并前 CI

Issue：#2891（父任务 #2890 第一步）
基线：`origin/main` `b5c51e023`；基线证据 `.agent-reports/arch-churn-audit-20261001/`（审计）与本任务 `.agent-reports/cross-stop-bleed-ci/`（测试基线与分诊）。

## 背景

- 23 个工作区包中有 10 个在 main 上测试失败（约 180 个失败用例），CI（`.github/workflows/quality-gate.yml`）不运行插件测试，红灯长期不可见。
- 测试中存在互相矛盾的断言：新会话输入框宽度 780 / 680 / 952 三套断言并存。
- 存在静默假绿：`node --test` 中 suite 级异常显示 `not ok` 但进程退出码为 0（例：`omnimux-accounts` bundle freeze）。
- 没有任何检查用真实 Cordis 装载插件，「读取未 inject 的服务」类崩溃反复出现（#2712、#2773、#2788、#2791）。
- `verify-dsh-contracts` 在 main 上为红且不在 CI。

## 验收标准

### AC-1 主干全绿
- 在干净检出、按 CI 方式安装依赖后，每个声明了 `test` 脚本的工作区包：退出码 0、用例数 > 0、失败 0、cancelled 0。
- 统计以测试运行器汇总行为准，同时扫描 `not ok` 行；任一包出现 `not ok` 即判失败（防 suite 级静默假绿）。

### AC-2 失败按根因处理，不掩盖
- 每个失败用例归入且仅归入一类：环境缺失（构建产物/依赖）、过期断言（被后续明确决策取代）、真实缺陷。
- 过期断言：删除或改为当前决策，并在分诊报告中给出取代它的提交或决策出处。
- 真实缺陷：修代码，不改断言迁就实现。
- 禁止新增 skip / todo 规避失败。

### AC-3 矛盾测试清理
- 输入框宽度只保留与当前决策（680）一致的断言；断言 780、952 的旧用例删除或改正。

### AC-4 CI 覆盖
- `quality-gate.yml` 的必需检查任务 `Static L0 QA & Tests` 内新增：可复现的工作区依赖安装、全部插件测试、插件装载检查。
- 不修改仓库规则集与必需检查名单。
- 新步骤在本任务 PR 上真实执行并通过（以 CI 日志为证）。
- 实施记录（已满足）：Node 24.18.1；`corepack pnpm install --frozen-lockfile --ignore-scripts` 真实工作区安装（替代 QA_DEPS 临时目录；`packages/dsh-ui-kit` 经 `file:../../packages/dsh-ui-kit` 入库，CI 内可解析）；`node scripts/build-all.mjs`；`run-workspace-tests.mjs`；`verify-plugin-load.mjs`。原 yaml/workflow 临时安装黑客随真实安装移除。

### AC-5 插件装载检查
- 对每个有服务端入口的插件，用真实 `@deepseek-ai/cordis` 装载：只提供该插件 `inject` 声明的服务，执行 `apply`。
- 出现「未 inject 即读取服务」错误即失败，报告插件名、服务名。
- 反向自测：读取未声明服务的夹具插件必须被判失败；声明齐全的夹具必须通过。

### AC-6 红门禁处理
- `pnpm verify:dsh-contracts` 在 main 上退出 0（去除与官方 `defineTool` 写法冲突的误报规则）并进入 CI，或删除并说明由 AC-5 取代。
- 实施记录（已满足）：删除。`verify:dsh-contracts`/`test:dsh-contracts` 脚本、`verify-dsh-contracts.mjs`、`verify-dsh-contracts.test.mjs`、`verify-plugin-inject-contract.mjs` 及其 verify-ci-gates 用例一并移除；AGENTS.md 与 plugin-qa 表行改指 `verify:plugin-load`/`test:plugin-load`。取代理由：静态 inject 扫描既误报（`ctx.get` 旁路、try/catch、root-provided 服务）又漏报（不跑 apply 看不到真实加载错误），AC-5 的运行时装载按真实 Cordis 语义判定，同域更严。

## 非目标

- 不改产品行为（真实缺陷修复除外）。
- 不处理 #2885 正在修的静态门禁违规（插件边界越界、HarvestStage 样式注入、双语哈希）。
- 不改官方 DSH，不改仓库外目录（含 `personal/dsh-ui-kit`）。

## 新用户基线

本任务只改测试与 CI，不改产品运行路径；新用户安装后的行为不变。

## 文档影响

更新 `docs/contracts/plugin-qa.md` 中 CI 覆盖范围与本机前置条件说明。

## 验证命令

- 逐包测试：`bash .tmp/run-all-plugin-tests.sh`（本地基线脚本；正式入口为本任务新增的 CI 脚本）
- 装载检查：本任务新增脚本及其测试
- `pnpm test:gates`、`git diff --check`
