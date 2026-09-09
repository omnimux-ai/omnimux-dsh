# H3 第二轮工程返修（待独立 QA）

日期：2026-09-09。IS_PASS: YES（源码跨文件一致性及本轮离线工程验证）；不是独立 QA、L2、生产或真实生成放行。

## 固定修订与范围

- Plugin worktree：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/h3-contract-fixes-838`；输入 HEAD `b3d5baee878ac780d7d2bfbee37cd536f497dd48`，base `867b192ecf6aa35be4e1639db7351a89bea782c7`。本轮插件产品源码未变，仅工程报告与归档首轮 QA 文本。
- Gateway worktree：`/Users/x/Desktop/Project/OmniMux/.worktrees/h3-contract-fixes-192`；输入 HEAD `f4a2c7bc2e4819c748ea27a8bede5935d2f7ed43`，base `795039a95dc2d4332360b1061141a20a93194e87`。
- Gateway 返修代码 commit `dce642f7a530d7954a1bea4fba18f0e91038a397`；含交付报告最终 HEAD `6341b07b55569dbe90ec0dceff8b4525b199f7cc`。后者仅追加文档，不改变被测源码。
- Plugin 本报告提交的精确 HEAD 由最终回传的 `git rev-parse HEAD` 给出，避免文档自引用 SHA。原始 QA `qa-evidence/h3-edward/REPORT.md` 与 `independent_test.go` 未改内容/预期。
- 两仓授权限定本地源码修复、验证与本地提交；未 push/merge、未写生产、凭据、公共 profile、官方 DSH 或其他任务，未进行真实收费/退款/生成。

## 三个反例修复

| 反例 | 修改 | 正式回归 |
| --- | --- | --- |
| FAILED/CANCELLED 带旧 video 仍 SUCCESS | polling.go 在 artifact 判定前统一失败状态；包含 FAILED/FAILURE/ERROR/CANCELLED/CANCELED，保留 detail/error 原因优先 | 原QA两例及六种别名/规范化输入，失败不带产物URL |
| video.url=https:// 无有效 host 仍 SUCCESS | media_inputs.go 共用 `validHTTPMediaURL`，net/url解析且 Hostname 非空、scheme 为 http/https；polling.go 失败产物保持非终态 | 原QA空host及缺主机、坏escape、空格host、非HTTP、空URL；合法规范化产物仍成功 |
| resolution=' 720p ' 静默768P | payload.go 校验与映射共享 trim+uppercase 规范化，历史720/720P明确拒绝 | 原QA四种退休值全部拒绝，原合法跨仓请求保持768P |

新增 Gateway `relay/channel/task/fal/independent_regression_test.go`，将原 QA 的16叶子同输入/同期望纳入正常 `go test ./...` 与 `make test`；仅测试包名、标准JSON包装、require/assert和可读子测试命名适配项目风格，未降低断言。额外14叶子保护失败别名和URL语法，断言失败不暴露旧产物。修改 `FORK_CUSTOMIZATIONS.md` 同步持续行为。未修改账务实现或QA预期。

## 本轮实际验证

Gateway 所有命令均在指定任务树运行，环境 `GOPROXY=off GOSUMDB=off`；除初次 fal 全包外，下表全部显式设置 `OMNIMUX_DSH_FIXTURE_ROOT=<Plugin worktree>`。

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `go test ./relay/channel/task/fal -count=1` | exit0 | 工具job bash-114；不单独作为跨仓证据 |
| `go test -v <P>/qa-evidence/h3-edward/independent_test.go` | exit0；16叶子16通过、0失败/skip | `round2-independent.log` |
| `go test ./service ./model ./relay/... -count=1` | exit0；相关全包通过，不虚构总用例数 | `round2-related.log` |
| `go test ./relay ./relay/channel/task/fal -run 'TestIndependent\|TestFailureAliasesAndArtifactURLs\|TestRealtimeReadPreservesPollingCAS\|TestHubToFalFixtures\|TestResultAvailabilityAndHTTPFailures\|TestCanonicalMediaRequestBoundary' -v -count=1` | exit0；52叶子全部通过，0skip；含3组实际Hub wire fixture、4个真实SQLite GET/poll顺序场景 | `round2-focused.log` |
| `go build ./...` | exit0；正式已有web产物可用 | `round2-build.log`（成功无stdout）；job bash-115 exit0 |
| `make test` | exit0；root与relaykit均执行，部分未变包命中Go cache | `round2-make-test.log` |
| 两树 `git diff --check` | exit0 | 工具记录 |

日志位于 Plugin `qa-evidence/h3-edward/`，`*.log`按仓规则 ignored，任务树保留可供QA读取。测试组有重叠，不累加成唯一用例总数。没有采集覆盖率。

全局检查：跨文件引用和导入正确；输入/产物同一URL语法检查；失败状态不会落入成功分支；共享resolution规范化；DTO有序集合与wire fixture不变。无新增依赖、路由或并行账务机制。

提交门禁：第一次本地 core pre-commit 因未给单次授权环境变量拒绝（即使消息有trailer）；按已明确授权scope使用 `OMNIMUX_CORE_CHANGE_APPROVED=1` 并保留trailer后通过，未使用no-verify。Caddy模板gate通过。

## 复用证据与限制

- 首轮独立QA已正式 `make build-web`、`go build ./...`、`make test`、workflow host/client/canvas三bundle、registry、Stage通过。本轮没有frontend/plugin产品改动，沿用这些未变面构建证据，不再声称旧构建缺失；本轮另外重跑了受Go改动影响的build及make test。
- Hub 1360/1360、模型严格门禁、registry及Stage首轮证据见原QA报告，未把它们伪称本轮新跑；跨仓Hub wire本轮实跑3组，0skip。
- URL检查是语法检查，不证明远程资源可下载/可播放，也不发网络探测。
- GET/poll测试不是完整生产预扣链、令牌/订阅账务、差额计费、多数据库、race/压力或退款失败恢复证明；原QA所列限制保持。
- L2 BLOCKED：当前任务缺 `.l2-dev.env`，旧h3-qa profile不合规且viewer仍旧e9f78cef；依据首轮QA及本次限定范围，不启动、不手改、不复制凭据或绕过。旧环境不能当作本轮验收证据。

## 下一步与责任人

主理人按两树最终HEAD派第二轮独立QA，复测原反例和正式fal/relay/service/Hub wire回归，独立确认六项源码结论；源码工程IS_PASS不替代独立QA PASS。L2正规依赖/profile授权另由主理人协调，本轮不扩大执行。没有push/merge/部署或任务清理。
