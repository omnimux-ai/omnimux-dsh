# #3350 质量闭环证据消费者首片

## 目标与成功标准
在原质量门真实调用公共证据核心，区分缺失、损坏、失效及有效失败，停止把近期文件、文件后缀、注释中的断言文字当作执行证据。有效历史封套与候选适用性不等于实际任务已运行、已安装加载或获得写端到端测试的权限。本片为部分交付，不承诺真实预演准入已经可用。

## 输入与公共接缝（本次批准范围）
测试 `inspectTaskVerification(input)`、原 `decideQualityGate` / `handle`、兼容 `hasEvidenceAfterSpec` 与现有路径/规格门。消费者接收调用者明确固定的 request：purpose/root/taskId/runId/scope/baseSha/headSha/requiredChecks/expectedAssertions/reportPath/artifactPaths。root 与提交必须实际精确，reportPath 固定 `.workbuddy/evidence/contract/<taskId>/<runId>/evidence.json`；原件路径同次固定，不能从返回封套反推。只读精确报告及公共核心所核原件，不扫描仓库找近期文件。

candidate 仅接收调用者在本次实际执行路径持有的 currentCandidate；本片不重捕全仓、不复制封套快照当 current，不把工具参数或 JSON 中的 trusted/approved/producer/observation 当来源或授权。history 可验证结束运行的记录，但必须始终标明 self-reported / not-granted。核心当前明确拒绝 pre-e2e/current-runtime；错误如实保留。

## 项目结构与代码风格
只改 scripts/guard-quality-loop.mjs、scripts/guard-quality-loop.test.mjs、本规格、docs/contracts/plugin-qa.md 的质量证据门段。复用现有同步函数、具名导出与公共 validateEvidence；不添加模块、服务、来源认证或批准令牌。输出稳定对象 `{ valid, applicable, pass, authorization, reason, evidenceStatus }`，另保 provenance/errors；授权沿核心恒 not-granted，不自授。

## 测试策略与旧标准变化
正常 Node 单元/集成测试维护合法，先正规反例红灯再修生产，不 skip、不只改期望绕旧失败。历史两项 E2E 正例仅手写 `ok:true` 或 PNG/mtime，应保留它们的攻击输入与历史名称信息，重述为来源自报不能准入，逐项交独审；原弱断言拒绝与业务 ownspec 必须保留。已有 UI 交付文件名齐备正例仅证明静态齐备，不再静默产生实测放行。

正式反例覆盖 touch/mtime/任意后缀/假 JSON/注释断言/自报信任、有效标志却损坏报告、缺 current、错 root/run/标准/原件、准备失败与有效失败不等于行为失败授权。真实公共正向封套必须用已交付 C 的实际 EVIDENCE_FIXTURE_REPO/ROOT/SHA 与公共 capture/seal/validate；缺环境硬失败不 skip，本代理不 init，不用手造 snapshot 作正例。真实任务行为 red、安装加载及当前持有者缺失列未知。

## 固定读取与分类返工
独审指出原件集合绑定晚于核心读取，现固定report/base/head与精确artifact集合必须在核心读取任何原件前核对；无效根单独invalid，不冒报告缺失，原件缺失missing/不可读corrupt分别保原因。核心仍负责真正摘要/候选/检查/清理/pass派生，不增加认证系统。父仅缺请求单例旧edit重建字符串匹配两处导致通用来源拒绝，已只读核实际old_string计数，后用唯一完整上下文正常重建参数成功，不换工具/路径/helper绕安全拒绝。真实公共正负与读取边界测试接缝继续原test file，原封套数据仅from公共capture/seal/validate，所有错误源码原件已声明且可见，不执行被审代码。

## 验证命令
本片允许 `node --test scripts/guard-quality-loop.test.mjs`、相关 authoring/anti/inventory/source 检查、`node scripts/impact-matrix.mjs --git-diff --base e36cafdf34597a0623d3b2ebe58c640b13b50046`、`git diff --check`。父代理后续负责 `pnpm test:gates`、必要 CI 与固定独审。本代理不运行全仓套件、commit、push、fetch、安装或应用。

## 边界与新用户基线
总是保留业务规格前置、原拒绝反例与正常 unit/integration TDD；这些写入无需尚不存在的执行收据。hook 当前没有受信请求与 currentCandidate 持有者，分类拒绝 E2E 写入，不阻全部测试；内容 regex 仅为静态提示，不是执行证明。UI 交付静态 E2E/证据文件门保留，但文件名齐备仍缺真实候选验证/权限，明确受影响交付阻断，不称完整闭环。

新用户只依赖仓内脚本和公开核心；缺精确请求、报告、原件或当前捕获时明确失败，不读开发 profile、秘密、不扫描全仓 mtime、不启动浏览器，不替换核心 purpose 扩权。没有真实公共正向历史测试时保持 partial/not-ready。本规格是上下文，不是授权或执行收据。
