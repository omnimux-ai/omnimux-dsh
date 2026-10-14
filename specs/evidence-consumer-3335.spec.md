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

## 结构与风格
只修改 scripts/worktree-app-qa.mjs、scripts/test-env-bootstrap.mjs 和本规格；主报告为 tmp/agent-infra-2026-10-14/evidence-consumer-3335-implementation.md。保留既有具名 exports/CLI mode，不新 helper/test 文件，不改 core、ignore、CI、合同、通用 token 系统。沿用现有 ESM、具名函数、分号与现有注入 seam；新增内部函数只服务此垂直。

## 验证策略与命令
允许 node --check scripts/worktree-app-qa.mjs、node --check scripts/test-env-bootstrap.mjs、git diff --check；node --test scripts/worktree-app-qa.test.mjs scripts/worktree-app-qa-journey.test.mjs scripts/test-env-bootstrap.test.mjs scripts/evidence-contract.test.mjs（仅现有 fixture）；小内存编排检查允许但不得伪装正式覆盖。可以 node scripts/verify-product-baseline.mjs。禁止安装/远端/fetch/提交/full gates、真实 Chrome/env/Dev/Prod/credential 运行或新 real-Git fixture。基线冲突必须原样报红，不能弱化断言刷绿。正式 *.test 写入与公共正例/CI 待父 #3334 合入 root 后合法补齐。

## 文档影响与未覆盖
规格记录本切片实际边界；现行 QA 合同旧输出/旧 prepare 能力叙述暂未修改（不在本授权），父整合时应记录冲突。未证明 fresh 装配、source-installed-loaded、浏览器实际运行、独立来源认证、完整动态依赖闭包、CI provider 身份、当前在线或完整 C；无远端与交付动作。
