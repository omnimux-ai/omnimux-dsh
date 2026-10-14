# #3349 中枢测试最小资源安排

## 目标与成功标准
在既有中枢测试入口内减少明确资源测试文件的重叠执行。先独立执行原网络防护测试；其通过后，将原收集集合的其余文件分为普通阶段和资源阶段，同步顺序执行，不重叠。资源阶段包含全部 `.e2e.test.js`、`.e2e.test.ts`、`.e2e.test.mjs` 文件和明确的 `src/client/provider-config-state.test.js`，使用 `--test-concurrency=1`；普通阶段保留 Node 默认并发和原参数。

正常完整运行必须保持原收集边界、排序、每个文件恰好一次，集合互斥且并集等于原集合，不新增跳过。空发现集合或缺少原网络防护文件必须报错。网络防护失败不执行后续阶段；后续某阶段非零仍执行另一阶段，最终保留首先出现的非零退出码。启动错误或信号保持原抛错语义，不能被后续成功覆盖。始终经原 finally 清理本次私有 DSH_HOME，返回值仍是原数字退出码。

## 新用户基线与文档影响
仅改变开发/持续集成测试入口，不改变安装后产品路径、账号、模型或配置，不依赖开发机服务。原运行依赖缺失直接失败，不静默安装或替代。任务规格记录此有限安排；现行合同无需改动。

## 命令
- 先执行 `node --test plugins/omnimux/src/test-support/test-discovery.test.js`，新公开计划行为应先真实失败，最小实现后通过。
- 静态检查执行 `node --check plugins/omnimux/scripts/run-tests.mjs` 和 `git diff --check`。
- 一次执行原探针：`node --test --test-concurrency=1 plugins/omnimux/src/client/ModelsSettingsCard.e2e.test.js plugins/omnimux/src/client/components/inspiration-picker/picker-card.e2e.test.js`，保留原 30 秒上限、参数和全部断言；缺依赖则记录未执行，不安装。
- 完整中枢包测、独立评审与真实 required/Merge Queue 验证由父代理接报告后推进，不由本委派自行执行。

## 项目结构与风格
只改 `plugins/omnimux/scripts/run-tests.mjs`、既有 `plugins/omnimux/src/test-support/test-discovery.test.js` 和本规格。复用既有无分号、具名公开函数、单引号风格。公开 `planHubTestRuns(files)` 返回有序执行组 `{ files, args }`，由真实 `runTests` 消费，不导出仅供测试使用的私有实现，不改变 `runTests(cwd)` 的参数和返回形状。

## 测试策略与已批准观察边界
既有正式测试直接测试原发现/拒空接口和实际运行器消费的公开计划接口：原网络防护文件存在、空集合拒绝、三个后缀、显式非 e2e 资源文件、普通参数不变、资源参数为 1、空阶段不启动、互斥并集与每文件一次；真实当前收集集合不为空且四个已知浏览器文件归入资源阶段。不将计划参数测试伪称真实子进程/浏览器峰值证明。

不为故障矩阵新增模块拦截、测试服务或生产注入参数。若当前合法边界无法执行真实故障矩阵，报告明确区分代码证据和未测状态，不能宣称该矩阵通过。

## 边界与实施顺序
先规格与正式纯测试真实红，再最小实现、相关测试与限定原探针、持久报告。保留原 glob/exclude、preload、环境隔离、网络防护和错误传播。不改 CI、Node/Ubuntu、Chrome helper、30 秒超时、flags、旧模型断言、包清单和契约；不自动重试、不扩大 tests/e2e 收集、不另建运行器或 AST/import 图服务、不运行全仓、不安装依赖、不访问共享浏览器配置或杀共享进程。

这是保守资源安排，不是浏览器执行认证、全中枢有界并发或未来动态导入完整覆盖。Chrome 原因、Linux稳定性改善与总耗时增量必须保持待证；本地原探针成功只能证明本次本机执行。
