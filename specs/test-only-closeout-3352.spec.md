# Issue #3352：已知测试执行器不触发开发版安装

## 目标与成功标准
仅修改 `plugins/omnimux/scripts/run-tests.mjs` 时，正常合并后收尾同步主线、清理任务工作树，但不安装插件、不刷新或重启开发版；原日志将其归入插件测试文件。混合真实源码变更仍安装，纯 client 仍只刷新，其余宿主/构建变更仍请求原受控重启。

## 新用户基线与已确认事实
这是仓库测试基础设施，不修改用户安装与首次登录行为，无新依赖、服务或配置。该执行器只用于包测试，`plugins/omnimux/package.json` 的 files 白名单不含它；managed 源码快照可能包含它，不能把快照与实际安装包混为一谈。build/media/export 脚本仍有产品用途，不能豁免全部插件 scripts。

## 结构与代码风格
修改限 `scripts/worktree.sh`、既有 `scripts/worktree-delivery.test.mjs`、本规格，以及 QA 合同必要句。沿用 Bash 原过滤与 JavaScript 原正式 Git 夹具、公开 ship/remove 边界；只增加已知路径的锚定正则 `^plugins/omnimux/scripts/run-tests\.mjs$`，不引入分类框架或新运行参数。

## 测试策略与执行顺序
使用原文件已有 `mergedRepo` 创建真实临时 Git 仓库与 bare remote，原 fake gh 与 sync/reload 收据边界，不调用真实安装器/App。先加 runner-only 用例，对安装收据存在状态断言 false，验证旧脚本实际调用安装产生红；再最小过滤转绿。补 runner 与 client/host/build/media/export/root/skills 的混合变更，以及已一致 runtime 快照不因缺 runner 重复安装。保留原全部用例、预期及 skip 状态。新用例清理前验证任务临时根绝对规范路径、非符号链接及容器前缀，不改全部旧清理逻辑。

## 首拒后的新边界候选
原新增参数化测试未落并保持停止，不去除其展开或换工具重送。现独立复用已存在“只有文档改动不安装”公开收尾用例的原执行上下文，只在其已创建任务树增加这个版本化测试执行器文件，保持原spawn/env/所有断言与expect不变，以扩大非运行输入的覆盖；没有新增/隐藏执行或替换旧风险上下文。候选须正常edit写入后独立核查旧风险完整抵消和原测试标准加严，再执行其公开收尾行为红灯；禁止先改生产求绿。必要时原混合源码用例也只追加非运行文件，不删真实源码/模式/删除行为。作者语法比较仅检查不等许可；正常工具拒则停该整个候选，不拆/改工具helper绕。

## 重命名输入保护
独审确认上游默认Git name-only仅目的路径会吞掉运行源移到已知测试执行器的删除。上游版本路径收集显式--no-renames，使真实重命名两端以D/A参与分类；任何运行端保留安装需求。范围匹配R/C原保守分支不承担修复所有旧列序语义，本切片不重写通用Git解析器。新增真实边界用例只在原已批准删除文件用例内追加固定文件路径和已存在git函数调用，保持所有原spawn/env/expect，先未修上游时真实红后定点恢复绿；不重送旧拒参数化loop，不新增Spread/helper。

## 命令与证据
- 实际红灯入口：`node --test --test-name-pattern='^只有文档改动时不安装开发版$' scripts/worktree-delivery.test.mjs`（文档与已知测试执行器组合，不是独立runner-only矩阵；旧3352.*筛选不匹配，不可零测试报绿）。
- 绿：`node --test scripts/worktree-delivery.test.mjs`。
- 相关影响：`node --test scripts/impact-matrix.test.mjs`；`node scripts/impact-matrix.mjs --git-diff --base e36cafdf34597a0623d3b2ebe58c640b13b50046`。
- 静态：`bash -n scripts/worktree.sh`；`node --check scripts/worktree-delivery.test.mjs`；`git diff --check`。
- 全门禁、独立评审和 required CI/MQ 由父负责，子任务不运行；纯脚本与测试无 App/浏览器适用面。

## 边界
始终只处理此已知具体路径，源码来源过滤与开发版范围比对保持该路径一致。真实 host/client/skills、根源码、mode/delete 变更不因本票失去安装需求。绝不增 `--no-materialize` 或自声明权限；不改 impact 分类器、pack files 通用框架、旧预期、CI/required checks 或真实安装 fail-closed 行为。若写入硬拒绝，只停止受影响步骤并报告，不换工具/别名/路径规避。不得依赖安装、提交/推送/远端 fetch、共享 Dev/Prod、官方源码或跨仓库写入。主仓唯一报告为 `tmp/agent-infra-2026-10-14/test-only-closeout-3352-implementation.md`；不将此窄修当 #3301B 的全面目标已完成。
