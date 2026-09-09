# H3 第二轮独立 QA 报告

日期：2026-09-09 11:28 Asia/Shanghai；验收人：Edward。

## 结论

**源码/离线回归 PASS；F1–F3 全部闭合；L2 BLOCKED。** 本轮未发现需返修的源码遗留问题。源码 Routing：**NoOne**；L2/后续交付 Routing：**主理人**。不构成整体运行验收、合并放行、真实生成或完整生产账务保证。此为返修后的第二轮，未进入第三轮，未更改产品源码或测试预期。

## 固定身份与证据来源

- P：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/h3-contract-fixes-838`。
- P base `867b192ecf6aa35be4e1639db7351a89bea782c7` → 固定 HEAD `72b30196691b9e40439fe08b6c0674191d37e2f2`。
- G：`/Users/x/Desktop/Project/OmniMux/.worktrees/h3-contract-fixes-192`。
- G base `795039a95dc2d4332360b1061141a20a93194e87` → 固定 HEAD `6341b07b55569dbe90ec0dceff8b4525b199f7cc`；返修源码 `dce642f7a530d7954a1bea4fba18f0e91038a397`。
- 两树开始干净、HEAD 实际一致；结束 G 干净，P 只新增本报告及 ignored `qa2-*.log`。没有 fetch/rebase/切换分支；按授权固定 SHA，而非声明对最新远端 main 的验收。
- 完整读取首轮 `REPORT.md`、原始 `independent_test.go` 和两轮工程说明；重新审阅返修 diff、正常套件中的同预期回归、GET 响应快照、SQLite 生产调用测试、媒体归一与 HTTP 错误分类。
- 原 QA 文件保持不变，`independent_test.go` SHA256：`58f0e30474f19f3484efa8afbe026e2972e446a9b5cb7d9c7a37e5e4c6969772`。不覆盖首轮 FAIL 历史。

## 三项反例闭合

| 缺陷 | 判定 | 独立核实 |
|---|---|---|
| F1 FAILED/CANCELLED 带旧 video 被判 SUCCESS | PASS | `polling.go` 先处理 detail/error 和规范化失败状态，再检查 artifact。原 FAILED/CANCELLED 均 FAILURE；正式套件另外覆盖 FAILED/FAILURE/ERROR/CANCELLED/CANCELED/带空白小写别名，失败无旧 URL。 |
| F2 `https://` 空主机产物成功 | PASS | `media_inputs.go:75–79` 使用 net/url、HTTP(S)、非空 Hostname；`polling.go` 共用此检查。原反例及空host、仅端口、坏escape、空格host、非HTTP、空URL均非终态，规范化有效URL仍成功。 |
| F3 ` 720p ` 静默映射 768P | PASS | `payload.go` 校验和映射共享 trim+uppercase 的 normalizedResolution；原四种退休值全部拒绝，实际跨仓合法768P不变。 |

## 六项总体回归

以下 PASS 均限于相应离线契约，非整体 L2 PASS。

| 项 | 判定 | 证据与边界 |
|---|---|---|
| 1 GET 不抢 polling 终态/账务 CAS | PASS（限定） | `relay_task.go:483–504` 仅修改响应快照、不持久化；真实 SQLite + 实际 tryRealtimeFetch/UpdateVideoTasks 四种成功失败先后顺序通过，stale worker 不重复退款。 |
| 2 canonical operation 与有序素材不降级 | PASS | 7个网关媒体边界通过；3组实际 Hub guard/mapper → Adaptor 最终 URL/完整 JSON body 精确比对，Max/Turbo 首帧、Max 多参考保序。不是实际公网 wire。 |
| 3 COMPLETED 无有效产物保持非终态 | PASS | F1/F2闭合；裸完成/空结果/result404/429/503/断网不误成功；有效artifact成功。URL仅语法，不证明下载或播放。 |
| 4 reference 三类 URL 数组 | PASS | 独立双图、双视频、双音频有序数组精确比对，singular字段不泄漏；9图通过/10图拒绝。音频只证明gateway DTO，不代表新增音频UI。 |
| 5 detail 数组与 HTTP 错误分类 | PASS（限定） | detail数组转换与422 msg/loc/type通过，HTTP暂态保持重试；显式失败不再被旧artifact掩盖。没有真实供应故障恢复试验。 |
| 6 768p/50000 与旧720p拒绝 | PASS | Hub全包含H3专项通过；gateway中文7001/50000接受、50001拒绝；四种退休720输入均拒绝；严格模型门禁fingerprint不变。 |

30MB图/50MB视频及MIME仍是 `policy_conservative` 产品策略，不改称官方上限；保留既有9图3视频支持。未重新抓官网或探测模型API。

## 本轮实际命令及结果

P/G 为上述固定任务树。所有 G 命令均显式继承 `GOPROXY=off GOSUMDB=off OMNIMUX_DSH_FIXTURE_ROOT=<P>`。全部命令本轮执行一次，无失败修复重试。

| cwd / 命令 | 实际结果 | 本轮日志 |
|---|---|---|
| G `go test -v <P>/qa-evidence/h3-edward/independent_test.go` | exit0；16叶子16通过/0失败/0skip，原预期不变 | `qa2-independent.log` |
| G `go test ./relay ./relay/channel/task/fal -run 'TestIndependent\|TestFailureAliasesAndArtifactURLs\|TestRealtimeReadPreservesPollingCAS\|TestHubToFalFixtures\|TestResultAvailabilityAndHTTPFailures\|TestCanonicalMediaRequestBoundary' -v -count=1` | exit0；52叶子52通过/0失败/0skip；含Hub wire3和SQLite4 | `qa2-focused.log` |
| G `go test ./service ./model ./relay/... -count=1` | exit0；相关全包通过 | `qa2-related.log` |
| G `go build ./...` | exit0，无stdout；消费正式已有web构建产物 | `qa2-build.log` |
| G `make test` | exit0；root与relaykit，部分包Go cache | `qa2-make-test.log` |
| P `npm --prefix plugins/omnimux test` | exit0；主套件1360/1360，前置另2/2；0失败/skip | `qa2-hub.log` |
| P `node --test scripts/verify-auto-serving.test.mjs` | exit0，10/10 | `qa2-auto-serving.log` |
| P `node scripts/verify-model-contracts.mjs --strict` | exit0，18 registered/16 required；fingerprint00922927356fb263 | `qa2-model-contracts.log` |
| P `node scripts/verify-plugin-boundaries.mjs` | exit0 | `qa2-boundaries.log` |
| P `node scripts/registry-tool.mjs verify` | exit0 | `qa2-registry.log` |
| P `node scripts/verify-stage-contracts.mjs` | exit0，10 Stage/8入口 | `qa2-stages.log` |
| P/G `git diff --check` | exit0 | 工具输出 |

测试集合有重叠，不累加成唯一总数；未采集覆盖率。日志在本报告同目录，按仓规则ignored，不等于自动随提交保存。首轮正式 `make build-web` 与 workflow host/client/canvas三bundle 的成功构建证据沿用：此后相关前端源码未改；不伪称本轮再次执行frontend构建。本轮相关Go全包与build/make已独立重跑。

### 账务证据边界（不扩大）

实际测试确实调用生产 CAS/退款路径，而非纯mock账务，但直接创建预扣后的数据库记录；未执行完整生产HTTP鉴权/提交/预扣。TokenId=0；未逐项覆盖令牌额度、subscription/funding、User/Channel used quota及账务日志。成功场景无BillingContext/用量，900不变证明基价保持，不证明差额重算。SQLite单连接、确定性顺序不是并发/race/压力、多数据库、Redis/batch、退款失败恢复证据。共享GET路径的其他渠道全包通过不等于Gemini/Vertex/GoEasy各自交错专项通过。因此原GET抢CAS缺陷可确认修正，不能签署完整生产账务保证。

## L2 当前只读实查：BLOCKED

采样约11:26–11:28。没有启动Host、访问无关端口、修改profile或复制凭据。

1. P `.l2-dev.env` 仍不存在。
2. 真实旧 profile 是 `/Users/x/.dsh-dev/tasks/h3-qa/profiles/omnimux-dev-h3-qa`，不是 task根目录。其 workflow 是指向共享主树 `.../omnimux-dsh/plugins/omnimux-workflow` 的symlink；Hub是非link。既不绑定本任务SOURCE，直接再加Hub将违反最多一link，不能手改绕过。
3. 该profile `port.txt=44201`、`host.pid=78798`，PID实际不存在。host.log仅做安全布尔提取：含installSettingsSection错误，不含 `dsh web:` 登录标记。不输出原日志或秘密。
4. 旧profile与当前 Dev seed `/Users/x/.omnimux-dev/profiles/omnimux` 的 installed viewer `lib/index.js` 均为 SHA256 `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a`，仍含 `installSettingsSection`。首轮的旧viewer阻塞没有被实际部署解除。
5. #839真实依赖有进展：只读任务树 `.worktrees/common-viewer-managed-upgrade-839`，HEAD仍867b192e、9文件未提交；`.workbuddy/unit-recovery-final.log` 为64/64，`transition-final.log` 为2/2、0skip。它们仅证明该开发任务测试结果，不是正式受管升级receipt、seed兼容身份或当前H3 Host证据；采样时未找到839工程交付报告。未运行或修改其脚本。
6. 任务根 `.credentials.yaml` 仅核实存在，未读/打印内容。存在旧凭据不自动授权新bootstrap。当前未获得可合规直接复用的绑定profile。
7. 首轮共享verify:live已实际失败于缺 `.l2-dev.env`（旧报告有runId）。本轮缺口未变，不重复无效探针；无ego页面、DOM、截图、runtimeProof、同run浏览器验收。不把静态Stage通过当L2成功。

### 阻塞动作、下一owner与最小输入

主理人接续，先取得**正式兼容viewer的可消费证据与目标身份**（source/installed/receipt及适用profile），再通过正规入口刷新或重建任务profile，绑定当前P的Hub唯一link、其他插件稳定副本，生成有效 `.l2-dev.env`。不能消费#839未交付脚本自行转换，不能禁viewer、双link、改官方DSH或手写node_modules。

最小必要输入：
- 合规profile的精确路径/任务身份及正规修复动作覆盖范围；优先复用已授权profile与既有登录状态。
- viewer正式兼容版本/内容身份与正规消费receipt，而非“已经修好”文字。
- 仅若正规重建不可避免新增凭据bootstrap：由主理人补齐该**具体目标**的明确授权；不索取或在报告内传递任何密钥/Token。

具备后由主理人安排任务Host启动与ego同Tab登录、共享verify:live和H3无付费请求展示专项（768p/旧值提示、多图多视频内容、失败回显）。不以mock/UI演示标记真实生成。此轮QA任务已完成并回传；没有留常驻Host/后台job或宣称自动等待的计时器。

## 安全与交付状态

未修改产品源码、原QA预期、公共/生产profile、官方DSH或其他任务文件；未push/merge/commit/部署、真实收费/退款/生成、凭据bootstrap。后台bash-121和bash-122均已收集，exit0。主理人可接续保存/提交本报告与处理L2依赖；整体交付尚不具备关闭/合并验收证据。当前工具集无report工具，使用本结构化报告及最终消息回传。
