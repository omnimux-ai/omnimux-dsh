# #3350 质量闭环证据消费者首片

## 目标与成功标准
独审确认当前首片替换已注册根门会永久阻断合法E2E/UI工作流，不能部署。现在只交非准入历史/候选生产核证命令，保留原公共完整性消费者；撤回本次引入的active入口恒拒差异，恢复e36原入口行为以移除新增部署P1。原mtime/注释/假PNG漏洞明确未解决、不记安全修复通过，完整D仍待真实当前持有者与source-installed-loaded行为闭包后迁移原门禁。非准入核证结果只表示本次声明的完整性/适用性，无来源认证或用户行动授权。

CLI显式--verify-report读取非秘密固定请求，只支持history/candidate。candidate必须显式--current，由命令真实调用已有captureCandidate(root/base/head/task/run/outputs/extraInputs)并只传本次返回值；拒收JSON currentCandidate/trusted/approved/observation，不复制封套快照，也不把输入请求伪装output排除。只有valid且pass退出0，有效失败仍退出1，缺失/损坏/失效/异常非零与分类保留。无参数hook不走CLI捕获、不改变原权限决策或降低其它规则。恢复旧用例预期仅记录基线现状，不宣已修fakepositive；假JSON与假截图攻击在新核证命令独立拒绝矩阵仍保。

## 输入与公共接缝（本次批准范围）
测试 `inspectTaskVerification(input)`、原 `decideQualityGate` / `handle`、兼容 `hasEvidenceAfterSpec` 与现有路径/规格门。消费者接收调用者明确固定的 request：purpose/root/taskId/runId/scope/baseSha/headSha/requiredChecks/expectedAssertions/reportPath/artifactPaths。root 与提交必须实际精确，reportPath 固定 `.workbuddy/evidence/contract/<taskId>/<runId>/evidence.json`；原件路径同次固定，不能从返回封套反推。只读精确报告及公共核心所核原件，不扫描仓库找近期文件。

公共消费者 candidate 接收调用者真实持有的 currentCandidate；显式 CLI candidate 则必须 --current 并真实调用公共 captureCandidate。固定请求仅允许 purpose/root/taskId/runId/scope/baseSha/headSha/requiredChecks/expectedAssertions/reportPath/artifactPaths/outputs/extraInputs，未知字段拒绝，不接收来源或权限自报；outputs 预声明报告与全部原件，可含同 task/run 的额外单层产物，extraInputs 可为空。请求不能伪装为输出排除；根内请求须在原运行捕获时已经稳定存在，或使用已授权根外非秘密请求。history 仅验证结束运行，结果始终 self-reported / not-granted；pre-e2e/current-runtime 不支持。请求须规范普通文件、单硬链接、无链接祖先、不跟随叶链接、有效 UTF-8 JSON，读取上限128KiB。CLI valid且pass退出0，valid-failure退出1，其余无效或读取/捕获错误退出2，输出仅稳定分类与错误代码，不回显请求、路径或环境。

## 项目结构与代码风格
只改 scripts/guard-quality-loop.mjs、scripts/guard-quality-loop.test.mjs、本规格、docs/contracts/plugin-qa.md 的质量证据门段。复用现有同步函数、具名导出与公共 validateEvidence；不添加模块、服务、来源认证或批准令牌。输出稳定对象 `{ valid, applicable, pass, authorization, reason, evidenceStatus }`，另保 provenance/errors；授权沿核心恒 not-granted，不自授。

## 测试策略与旧标准变化
先在原 Node 测试文件写真实 CLI 回归并验证缺入口红灯，不 skip。原27项基线测试名称、攻击输入及期望恢复为 e36 原行为，仅证明撤销本次入口永久阻断，不把 mtime/注释/假PNG 原假正例称安全修复；公共消费者和新增 CLI 继续独立拒绝自报信任、伪 JSON、假截图、触改时间等攻击。原弱断言拒绝、业务 ownspec、UI 静态完整性拒绝不降低。

正式反例覆盖 touch/mtime/任意后缀/假 JSON/注释断言/自报信任、有效标志却损坏报告、缺 current、错 root/run/标准/原件、准备失败与有效失败不等于行为失败授权。真实公共正向封套必须用已交付 C 的实际 EVIDENCE_FIXTURE_REPO/ROOT/SHA 与公共 capture/seal/validate；缺环境硬失败不 skip，本代理不 init，不用手造 snapshot 作正例。真实任务行为 red、安装加载及当前持有者缺失列未知。

## 固定读取与分类返工
独审指出原件集合绑定晚于核心读取，现固定report/base/head与精确artifact集合必须在核心读取任何原件前核对；无效根单独invalid，不冒报告缺失，原件缺失missing/不可读corrupt分别保原因。核心仍负责真正摘要/候选/检查/清理/pass派生，不增加认证系统。父仅缺请求单例旧edit重建字符串匹配两处导致通用来源拒绝，已只读核实际old_string计数，后用唯一完整上下文正常重建参数成功，不换工具/路径/helper绕安全拒绝。真实公共正负与读取边界测试接缝继续原test file，原封套数据仅from公共capture/seal/validate，所有错误源码原件已声明且可见，不执行被审代码。

## 独立命令参数域接缝
前批真实进程/链接/漂移两大测试与助手写被拒未落，保持停止，不拆批缩写重送。本阶段新边界仅公开薄verificationCommand(argv)：其为真正生产main显式--verify-report路由消费的命令参数与结果退出适配，不新物理helper/私有测试导出。先增加由生产main显式参数分支实际调用的公开函数骨架，暂以exit0作为待修行为基线；再原文件一个只对[]无参数调用的参数域正式用例，期待稳定缺参数exit2且not-granted，必须观察实际值比较失败的行为红灯，缺导出或编译失败不算红灯。随后只修该参数分类，不据此宣称请求读取或完整命令已完成。该独立领域接缝不新增spawn/夹具/旧拒payload的任何断言，不以它替代真正命令stdout/exit/历史正向或漂移矩阵完成声明。后续正常实际CLI行为按独立已批准owner再验证，不搬拒批进此函数或另tool绕。所有新正常编辑若被安全拒仍停止整请求。

## 第二纵切：非秘密请求读取
独立参数域已正规行为红后绿，现只完成请求读取域：显式argv恰--verify-report和一个绝对规范.json路径，可选--current；未知或重复参数拒绝。请求文件逐段无链接、叶普通单硬链接、128KiB上限、NOFOLLOW/NONBLOCK打开，固定128KiB+1缓冲读取以检出增长，核路径/FD前后身份、实际字节数与再次realpath、有效UTF8/JSON；缺文件、损坏、越界类型分别明确exit2分类，不回显内容。请求固定字段白名单与purpose/history-candidate校验后才交已有公共消费者；本轮candidate不捕获，缺--current为CURRENT_ARGUMENT_REQUIRED，带--current为CURRENT_CAPTURE_NOT_IMPLEMENTED，history带--current无效。新测试仅这个独立读取边界，不迁移前被拒进程/链接/漂移大批矩阵；正常编辑/执行受拒仍停整请求。history实际调用消费者不启动App或授准入，只有valid且pass出口0，否则按有效失败1/invalid2保结果。真实历史三场景在原capture/seal集成用例沿公开参数接缝读取根外owner侧独立请求，固定标准非由封套反推；新普通缺失路径实际COMMAND_NOT_IMPLEMENTED对REQUEST_MISSING行为红后绿。128KiB只限请求，不宣核心总资源/超时或全部DoS防护；完整命令仍partial/not-ready。

## 第三纵切：当前候选实际捕获
history生产进程已真实核验valid-pass出口0与零用例valid-failure出口1/not-granted，第二域39正式项通过。现在candidate必须带--current且预声明outputs，命令直接调用原captureCandidate以请求root/baseSha/headSha/task/run/outputs/extraInputs真实获得current，传已有公共消费者；拒收自报current，不取封套snapshot副本，不回落history。新的正式参数域candidate正向仅沿已存在真实公共capture/seal用例在其稳定根外请求改purposecandidate/outputs，旧CURRENT_CAPTURE_NOT_IMPLEMENTED实际红后最小真实capture绿；读取期间源固定。真实源字节漂移产生另一个有效当前snapshot应由原核心返回CANDIDATE_CHANGED_DURING_RUN，不仅坏clone；漂移只本测试持有source.txt临时固定非秘密合成字节，finally恢复原固定字节与模式，再同请求恢复成功。capture options与原运行完全相同，outputs/extraInputs不能扩大排除；无outputs返回CURRENT_OUTPUTS_REQUIRED，core原生稳定错误码保留，意外异常只返回CURRENT_CAPTURE_FAILED，不回显路径或底层异常。此域不新增spawn/helper/链接批或旧拒矩阵，不捕获App，不为用户/来源授权限；缺outputs/真实Git错误exit2保原因，只有完整candidatevalid且pass出口0。

## 实际持续检查接入
完整质量核证正式套件需要已存在公共数据环境，不能在无环境阶段提前运行后跳过。复用现持续检查的公共数据准备步骤，在其原件保留与准确删除之前，与证据核心同一步串行明确调用本正式套件，原三套件命令不删且先结束，避免其capture与质量测试的源漂移同时运行。普通请求也只写该公开数据primary外的原owner；保留仅接受测试已声明的 reader-policy-/reader-current-/reader-envelope-/request-missing-/request-corrupt-/request-limit-/request-current-git-/request-reader-consumer-/request-current-consumer- 前缀JSON，核规范普通单硬链接、复制前后身份与摘要，未知owner根项失败并保留owner，不扫描仓库、复制.git或整primary。登记真实静态根与具名静态import闭包：guard/test从localRequired升ciRequired，既有core保持ciRequired；动态进程调用仍unknown，不冒称函数执行。原工作流最终判据、总退出、始终上传证据及版本保持。真实封套反例使用环境提交标识；只在参数/字段分类前终止的纯形状反例用40个0，不依赖本机一次性提交。正式测试不新增或跳过，不改变断言标准。

## 验证命令
本片允许 `node --test scripts/guard-quality-loop.test.mjs`、相关 authoring/anti/inventory/source 检查、`node scripts/impact-matrix.mjs --git-diff --base e36cafdf34597a0623d3b2ebe58c640b13b50046`、`git diff --check`。父代理后续负责 `pnpm test:gates`、必要 CI 与固定独审。本代理不运行全仓套件、commit、push、fetch、安装或应用。

## 边界与新用户基线
无参数 hook、hasEvidenceAfterSpec、decideQualityGate 和原拒绝文案恢复 e36 原行为；CLI 不参与 permissionDecision，不隐藏实际已注册入口，也不扩权。原 mtime/注释/假PNG 与静态文件名齐备漏洞未修，完整 D 未完成；后继须真实当前持有者及源码安装加载行为闭包后才能迁移根门禁。正常 unit/integration TDD 与业务规格前置仍保持，CLI 不执行 App、旅程、安装或 Git 写操作。

新用户只依赖仓内脚本和公开核心；缺精确请求、报告、原件或当前捕获时明确失败，不读开发 profile、秘密、不扫描全仓 mtime、不启动浏览器，不替换核心 purpose 扩权。没有真实公共正向历史测试时保持 partial/not-ready。本规格是上下文，不是授权或执行收据。
