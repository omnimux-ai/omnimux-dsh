# #3335 应用验收首消费者

## 目标与成功标准
在既有应用验收入口消费 evidence-contract 公共接口，最小承诺是结束运行的历史完整性与当前候选适用性，不是实时在线、权限认证或完整阶段 C。显式请求在启动前固定 taskId/base/head/scope/requiredChecks/expectedAssertions；缺字段拒绝启动。默认真实准备路径在本切片全部 contract scope 均明确拒绝，不因 scope=smoke 而转读 Dev；仅原无 context 的兼容路径仍保留旧行为。固定检查为 app-environment、app-browser，任务/复现加 task-journey。任务还必须包含环境断言 task-source-installed-loaded，本切片该绑定 unknown，永不声称任务成功。

## 新用户基线
当前准备器的完整 UI 装配依赖共享 Dev，不符合新用户合成环境合同。本切片 contract 请求在任何 runtime/profile/credential 访问之前明确 TEST_ENV_NOT_USER_FRESH_TASK_UNKNOWN，保留有效失败封套；不扩建安装器，不转用真实环境凑正例。原无 context 调用保留 legacy smoke，明确无 contract、task unknown、fresh unknown；不升级为 task。

## 请求、路径与顺序
库入口直接接受 taskId/base/head/scope/requiredChecks/expectedAssertions/extraInputs/artifactNames。CLI --request 指定工作树内非秘密 JSON（相同字段，可含 journey），请求文件与显式 journey/helpers 纳入 extraInputs。不能根据返回断言反推标准。task/reproduction 必须有 journey 和非空具名预期。预期与数组复制冻结；每个进程只运行一次 contract journey，避免 import 缓存误复用。旅程输入须常规文件、逐段无链接、不得处于 contract 输出目录，缺闭包完整证明标 unknown。

顺序严格为：固定请求/精确 outputs → 公共 capture before → 真实准备/同源登录/浏览器与旅程 → 所有自有资源逐项 cleanup 并等待 exit 与 close → 非秘密 raw-run.json 固定 → 相同 options capture after → seal → evidence.json 写入 → candidate validate → 返回非权威摘要投影。current-runtime/pre-e2e 仍 unsupported。没有独立执行观察，provenance self-reported。依赖注入 producer dependency-stub。

产物仅 .workbuddy/evidence/contract/<taskId>/<runId>/ 下预声明单层 png/json/log/txt，封套不得自含。核心 root/base/head/extraInputs/outputs 规则不修改。固定 docs 摘要未 ignore，contract 路径停止写它；legacy 保留旧路径兼容。before/after 漂移或封套失败必须保 raw，最终 false。

## 生命周期与断言
固定资源集合：app-child/mock-server/app-private-directory（owner app-environment），browser-child/cdp-transport/browser-private-directory（owner app-browser）。未创建才可 n/a；已创建必须真实 owner cleanup，缺项/重复/错 owner/失败均失败，异常也尝试全部资源。mock.close 失败不阻其它清理。Chrome 私有 user-data-dir/安全环境，按持有 child 句柄 TERM→bounded KILL→exit+close，绝不按报告 PID 清理。应用 unexpected exit 独立导致失败。不能先 pass 后 cleanup。

旅程 []、空白名、重名、非布尔 pass 拒绝整组形状；正常 false 原样保留。契约检查断言名集合必须和固定请求完全一致，未执行项 false，但 tests 只数真实执行单元；额外或畸形断言不能被投影丢失后刷绿。所有错误只留分类码，禁止原始错误/环境/登录 URL/cookie/token/动态详情写入原件。原生 exitCode/signal 与检查结果分开。

## 正式公共小仓回归（父集成范围）
父已读关键路径再评估，采用分层真实根：核心封套正负矩阵使用task-owned两数据真实Git主仓，不创建secondary工作树；应用仅少量公共编排复用本任务已有真实直接登记工作树，核心capture/seal/validate不注入。应用依赖桩仍明确smoke/dependency-stub/self-reported/not-granted，不签真实浏览器/fresh/task。核心环境由公开正常数据owner提供EVIDENCE_FIXTURE_REPO/ROOT/SHA，其中ROOT可等真实primary，SHA真实Git读取；缺环境同次fail非skip/全产品回落。原件精确ignored contract目录/唯一run，准备owner核实自有绝对根和identity后清理。小仓数据生命周期候选先正常测试写入、固定独审及工具前明确允许后才执行；不将旧被拒worktree-add准备载荷搬进test/helper/换tool绕。不得新增child_process导入或隐藏断言。持续集成必须实际完成准备再直接执行覆盖；现未运行旧init-main/detached-worktree方案须正常联动替换为上述可运行分层，不删除覆盖来假绿。治理清单按真实闭包同步，不第二runner/installer。

父集成允许现有core/app/env/journey测试、现质量工作流、单一治理清单与QA所属合同联动，不受初实施子代理仅两生产文件/no-CI限制；未改变用户原批准A-E的权限边界。所有新测试必须正常工具写入，通过固定独审和真实CI/MQ；任何硬拒均停止受影响动作，不换工具/意图/别名绕写。

## 结构与风格
首实施边界为两个生产入口与本规格，初实施报告保留历史事实。父整合已合法补入原 core/app/env/journey 测试及现质量工作流；本次联动只写 .github/workflows/quality-gate.yml、scripts/governance-manifest.json、docs/contracts/plugin-qa.md、本规格。唯一联动报告为主根 tmp/agent-infra-2026-10-14/evidence-consumer-3335-ci-integration.md。不改生产脚本、测试、解析标准、ignore、依赖或新增 helper；保留具名 exports/CLI 与原断言。

## CI 数据、引用与清理合同
核心准备仅创建 canonical RUNNER_TEMP 下本次 mktemp 返回 owner，直属 primary 内固定两数据文件；env-i 清继承 Git 状态、隔离 system/global、禁 hooks/fsmonitor/签名/交互及模板，分支 fixture-seed。mktemp 后立即登记 owner 与实际 Linux dev/ino 到 GITHUB_ENV、建立阶段/退出收据；早失败也由 always cleanup 承担责任。删除前核 canonical、直接父级、精确前缀、逐段无链接和原 dev/ino；身份变动拒删并保留失败。先复制必要 contract 原件、两源数据、哈希与实际 owner 收据到原 checkout 的 .workbuddy/evidence/contract-core-retained，再删自身 owner；复制或删除失败不得写成功。

应用不 clone：在实际 actions checkout 的 .worktrees/ 下 mktemp 一个直接 task，立即记身份与安装退出 trap，随后标准 worktree add --detach <task> origin/main，再 checkout 实际 github.sha 候选。origin/main 必须来自原 checkout 真正已获取的 refs/remotes/origin/main，先解析真实完整 main SHA，登记后核 HEAD 等于该 SHA；候选对象及 SHA 均核实，不造 refs。原 checkout 可以 detached，但必须是真实 primary .git 目录。任务在原 checkout 祖先链内，使用前序锁定安装的根 node_modules 正常解析 yaml/pngjs，不靠 NODE_PATH、loader、假模块或新 symlink。before/after 期间不改登记元数据；退出前留存 contract 原件与 owner/ref/阶段收据，identity 核对后只 remove 本次登记树，未登记空目录只删自身。独占 owner 与无敌对并发替换是显式假设，dev/ino 校验不是原子删除保证。

治理清单只按当前支持语法的真实静态闭包分类；复杂 shell、动态 task 路径未证明的应用 test 根继续 unknown/manual，不以 CI 文本、依赖安装或原件路径当运行权威。

## 验证策略与命令
联动最小本地检查为工作流 YAML 解析及所有 run 的 bash -n（不执行载荷）、git diff --check、node --test scripts/verify-governance-registry.test.mjs scripts/lib/governance-registry.test.mjs、node scripts/impact-matrix.mjs --git-diff --base 890f8c5129b209a0b7eb2c92f9ec8dea21d70f94。明确不跑 full gates、core/env/app 重测、数据准备、clone/init/worktree add/fetch、安装、真实 Chrome/App/Dev/Prod/profile/credential 或提交；CI 中的正常准备代码必须先由父固定审查，再沿真实 CI/MQ 执行。

历史缺环境 37/36/1/0skip 与治理 17/16/1/0skip 原日志保留。父已正常新 owner 提供真实 primary/SHA 并实跑 core7+env22+journey8=37/37/0skip，四场景在一个核心 test 内，8原件加创建收据已父留存；原数据尚未清理。历史应用 9/9/0skip 仍绑定旧1619277候选，不冒称修后候选重跑。本次静态检查与治理结果以联动报告为准，CI 未执行不能写 PASS。

## 文档影响与未覆盖
QA 所属合同同步 legacy Dev-backed 无契约 smoke、安全名称白名单、显式 request/自定义 journey、精确 contract 输出与真实准备前置拒绝；不删除或重标历史失败。未证明 fresh 装配、source-installed-loaded、浏览器实际运行、独立来源认证、完整动态依赖闭包、CI provider 身份、当前在线或完整 C；这些不是本切片的新增泛化阻断。无远端与交付动作。
