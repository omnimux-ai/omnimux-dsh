# H3 六项修复独立 QA 报告

日期：2026-09-09；验收人：Edward。结论：**FAIL / Routing Engineer**。源码离线回归多数通过，但独立反例仍失败，L2 BLOCKED，不具备完整验收或合并放行证据。未修改产品源码、push/merge、部署、真实生成/收费、秘密读取打印或联系其他成员。

## 固定范围与输入

- P：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/h3-contract-fixes-838`
- P base `867b192ecf6aa35be4e1639db7351a89bea782c7` → head `b3d5baee878ac780d7d2bfbee37cd536f497dd48`
- G：`/Users/x/Desktop/Project/OmniMux/.worktrees/h3-contract-fixes-192`
- G base `795039a95dc2d4332360b1061141a20a93194e87` → head `f4a2c7bc2e4819c748ea27a8bede5935d2f7ed43`
- 两树开始干净；结束 G 干净，P 仅新增 qa-evidence，构建产物和任务依赖链接 ignored。HEAD 未变化。
- 已完整读取 P `docs/implementation/h3-contract-fixes-838.md` 61行、G `docs/h3-contract-fixes-192.md` 13行、原 `.worktrees/h3-independent-review/review-probes/REPORT.md` 100行及 plugin-qa/dev-pipeline/ops-entry 合同。工程报告列较早 code SHA，本报告使用直接授权固定最终 HEAD。

## 六项判定

PASS 限定为对应离线缺陷及证据范围，不等于产品整体 L2 或真实供应成功。

| 项 | 判定 | 独立证据与边界 |
|---|---|---|
| 1 GET 不抢 polling 终态/账务 CAS | PASS（限定） | G `relay/relay_task.go:483–504` 仅变响应快照，无持久化；实际 `TestRealtimeReadPreservesPollingCAS` 4个顺序场景通过。真实生产 UpdateVideoTasks/CAS/RefundTaskQuota 被调用，但并非完整生产账务面覆盖，见下节。 |
| 2 canonical operation 与有序素材不降级 | PASS | G `media_inputs.go:17–108`, `model_mapping.go:66–102`；跨仓实际 Hub→Adaptor 三组 URL/完整 body 通过，7个有效/拒绝边界通过；无效 mode/role 不派发，首帧 Max/Turbo 正确。 |
| 3 COMPLETED 无有效产物保持非终态 | FAIL | 裸 COMPLETED、空结果、404/429/503/断网均通过；但 `video.url="https://"` 仍 SUCCESS，失败/取消状态带旧 artifact 仍 SUCCESS，见 F1/F2。 |
| 4 reference 三类 URL 数组 | PASS | G `payload.go:41–47`；新增独立三类各两条有序数组精确比对通过，无 singular image_url/video_url；9图通过/10图拒绝。音频只验证 gateway DTO，不冒充新增音频UI。 |
| 5 detail 数组与 HTTP 错误分类 | PASS（限定） | G `polling_http.go:14–43,46–79`, `polling.go:140–145`；422 msg/loc/type、429/503/404重试及独立数组 detail通过；与显式 status 冲突的缺口归F1。 |
| 6 768p/50000 与旧720p显式拒绝 | FAIL（边界） | P YAML已对齐；Hub专项及50000中文字符gateway通过、50001拒绝；网关带空白 `" 720p "` 绕过退休值拒绝并变768P。裸720/720p/720P均拒绝。见F3。 |

30MB图/50MB视频和MIME改为 policy_conservative；保留9图3视频。P YAML diff限定H3，两款模型之外未发现修改。官方支持事实沿用已读review/工程证据，本轮未访问付费模型或重新抓官网，不将产品MIME/体积策略称官方上限。

## 确认失败与修复方向（Engineer）

### F1：显式失败/取消被旧产物掩盖（P1）

- G `relay/channel/task/fal/polling.go:140–155,165–177`：只将 detail/error 优先；未将 FAILED/CANCELLED status优先于video。
- 实际公开 ParseTaskResult 输入 `{"status":"FAILED","video":{"url":"https://example.invalid/stale.mp4"}}`，期望 FAILURE，实际 SUCCESS。CANCELLED同样失败。
- 影响：状态判定可进入成功结算分支而非退款；这是离线可重现分支，不声称上游真实发生频率或生产损失。
- 要求：所有显式失败/取消别名优先于artifact；补组合回归。

### F2：无主机产物字符串仍被当作可用视频（P2）

- G `relay/channel/task/fal/polling.go:147–154` 仅 HasPrefix http(s)。
- 输入 `{"status":"COMPLETED","video":{"url":"https://"}}`，期望非终态，实际 SUCCESS/url=https://。
- 要求：解析并验证非空host、HTTP(S)合法URL；失败时不进入成功终态。与输入媒体严格URL校验保持一致。

### F3：带空白历史720值仍静默改写（P2）

- G `relay/channel/task/fal/payload.go:38–39` 未TrimSpace，而 `185–200` 解析会TrimSpace并映射720P→768P。
- 实际 ValidateRequestAndSetAction/BuildRequestBody 输入 resolution=`" 720p "` 仍接受。期望明确提示重新选择，不允许静默转换。
- 要求：校验和映射使用同一规范化值；拒绝旧值后再构建。该反例位于直接gateway输入；Hub标准选择值已通过，不夸大为Hub常规UI回归。

## 账务生产路径覆盖核实

不是纯mock账务：工程测试真实sqlite、真实Fal adaptor/local HTTP及 `service.UpdateVideoTasks`。G `service/task_polling.go:578–603` 调用CAS与退款/结算；`service/task_billing.go:166–204` 是实际退款实现。测试先创建User quota900/used100、task quota100，GET-first检查DB仍非终态，poll后失败退到1000、quota0、FinishTime/FailReason正确，反序和stale worker不重复退款。

但必须保留以下缺口：
- 测试直接创建预扣后记录，没有执行生产HTTP鉴权/提交/预扣路径；tryRealtimeFetch是实际内部函数，不是整条外部GET路由。
- TokenId=0，未创建实际令牌额度；subscription/funding、用户UsedQuota/ChannelUsedQuota和账务日志未逐项断言。
- 成功fixture没有BillingContext和token用量，900保持不变只证明基价保持，不证明差额重算发生。fal BaseBilling无差额不能据此推断每任务存在损失。
- SQLite单连接、确定性先后顺序不是并发压力/race、Postgres/MySQL/Redis/batch或退款失败恢复证明。
- GET共享修改影响Gemini/Vertex/GoEasy；相关全包测试通过，task Gemini/Vertex包无测试，未获得这些渠道GET/poll交错专项证明。

因此可以确认原GET抢CAS缺陷修正，不能接受“完整生产账务已覆盖”的扩大声明。

## 命令、退出码与计数

全部测试最多两轮原则：本轮首次独立回归发现源码错误；仅对依赖构建故障做一次修复重试，并补显式子测试输出；未进入Engineer修复后的回归轮。固定源码不变，反例不反复重跑。

| 工作目录/命令 | 结果 | 证据 |
|---|---|---|
| P `npm --prefix plugins/omnimux test` | exit0，1360 pass/0 fail/0 skip（含H3专项5） | hub.log |
| P `node --test scripts/verify-auto-serving.test.mjs` | exit0，10/10 | auto-serving.log |
| P `node scripts/verify-model-contracts.mjs --strict` | exit0，18 registered/16 required，0error/0warning，fingerprint00922927356fb263 | tool bash-96；其最终exit1属于随后Stage步骤 |
| P `node scripts/verify-plugin-boundaries.mjs` | PASS，2209文件 | tool bash-96 |
| G `OMNIMUX_DSH_FIXTURE_ROOT=<P> GOPROXY=off GOSUMDB=off go test ./service ./model ./relay/... -count=1` | exit0，包级输出不伪造用例总数 | gateway-related.log |
| G 同环境 `go test ./relay ./relay/channel/task/fal -run 'TestRealtimeReadPreservesPollingCAS\|TestHubToFalFixtures\|TestResultAvailabilityAndHTTPFailures\|TestCanonicalMediaRequestBoundary' -v -count=1` | exit0，22叶子子测试，0skip，跨仓3个确实执行 | production-paths.log |
| G `GOPROXY=off GOSUMDB=off go test -v <P>/qa-evidence/h3-edward/independent_test.go` | exit1，16叶子断言：12pass/4fail/0skip | independent.log/test.go |
| G `make build-web` | exit0，真正bun frozen install+rsbuild build | gateway-web-build.log |
| G `GOPROXY=off GOSUMDB=off go build ./... && GOPROXY=off GOSUMDB=off make test` | exit0，完整build与根/relaykit正式make test通过；此make未传fixture变量，跨仓证明使用上面显式运行 | tool bash-99完整输出 |
| P `npm --prefix plugins/omnimux-workflow run build` | 首次exit1缺zod/xyflow；任务包node_modules只读链接既有依赖后重试exit0，真实host/client/canvas构建 | workflow-build.log / workflow-build-retry.log |
| P `node scripts/registry-tool.mjs verify` | exit0，12插件 | registry.log |
| P `node scripts/verify-stage-contracts.mjs` | 首次缺market dsh-ui-kit exit1；任务market node_modules链接既有依赖后exit0，10组件/8入口 | stages.log |
| P/G `git diff --check` 与 `git status --short` | exit0；产品源码无diff，P仅qa-evidence | tool bash |

没有采集覆盖率，不填虚构百分比；测试组有重叠，不将以上数字累加为唯一用例总数。构建没有占位文件、复制旧dist、外置依赖绕过或官方DSH修改。只新增任务树workflow/market node_modules依赖链接，读既有依赖而不修改其内容。

## L2 实际证据 / BLOCKED

- 已加载ego-browser skill，实际 `ego-browser nodejs` 的 listTaskSpaces成功（只列id/name/ownership）；未接管无关task，未建测试页，不属于UI验收。
- 当前P不存在 `.l2-dev.env`。
- 已有 `/Users/x/.dsh-dev/tasks/h3-qa` 确有初始化credentials文件（仅存在性，未读内容），但profile的workflow symlink指向**主树** `.../omnimux-dsh/plugins/omnimux-workflow`，Hub为非link。直接添加任务Hub link会违反SOURCE与最多一link合同，故未操作。
- profile port.txt=44201，host.pid=78798；ps确认不存在。host.log只程序化提取错误布尔标记：含dsh-viewer/installSettingsSection、不含正式 `dsh web:` 登录链接。未输出原日志或秘密。
- viewer已受管不等于兼容：任务snapshot、installed入口与公共Dev seed入口SHA256均为 `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a`，version0.1.0、main lib/index.js，仍包含installSettingsSection。未直接采信别任务“已修”信息。
- 正式 `yarn omnimux:dev ls` 首次10秒超时exit129；禁Corepack网络的正式重试完成exit1，只打印另一个stopped任务，不能将列表视为本任务L2成功。
- 实际共享入口 `node scripts/agent-live-qa.mjs workflow --target=l2 --url=http://127.0.0.1:44201`（对应verify:live脚本）exit1：缺少本树.l2-dev.env；失败报告runId `ca069d74-310e-45b7-84ac-d30126a1a619`，路径P `.workbuddy/evidence/live-qa/ca069d74-310e-45b7-84ac-d30126a1a619/live-qa-report.json`。这是预检失败，不是pending/pass/真实浏览器消费。
- 未访问44204旧环境、未启动当前被其他任务分配的44201、未禁viewer、手工改profile或改官方DSH。没有截图/DOM/runtimeProof/真实生成记录。
- 既有任务profile不可合规直接复用；新正式任务初始化会执行 dev-env.sh:521–535 / 678 的credential seed复制，此bootstrap未获授权，故未执行。现有profile还需正式受管刷新以去掉主树link并解决viewer兼容；不存在允许手改node_modules补齐的路径。

L2下一owner为主理人：协调正式viewer兼容依赖证据、提供/授权正规任务profile重建（如涉及新增credential bootstrap必须明确覆盖），绑定当前Hub worktree唯一link及有效运行身份，再用ego同一Tab正常登录、共享verify:live和无付费请求展示核验。UI/mock展示仍不得标真实生成成功。

## 交付与下一步

- Routing：**Engineer**，经主理人处理F1–F3；源码问题未由QA修改，未私联其他成员。
- 返回修复后使用独立反例作为第二轮回归；同时扩展关键账务断言。不得沿用本报告中的限定PASS冒充整体放行。
- 任务内输出：本报告、independent_test.go、完整离线logs及共享探针失败报告。所有本轮后台jobs已收集，无常驻Host或生成任务。没有可用report工具，按结构化报告与最终消息回传。
