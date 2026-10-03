# Issue #3043 独立 QA 验收（第 1 轮）

## Conclusion｜结论

**验收结论：FAIL / QA + Engineer；生产界面文案合规：FAIL / Frontend（存量问题，另案处理）。**

正式 comment-native 1/1、generation-feedback 4/4 实际通过且无 skip 的事实予以保留，不将它们改写为失败运行，也不认定存在伪造通过。环境装配确实恢复了真实宿主评论流程及真实生产 viewer 夹具。不过“用例执行通过”不等于“有效业务断言充分且不会假阳性”：修订后的不可读视频断言可以在读取永不完成时通过，任务读取没有 sessionId 联合身份；原生入口的有效命名约束被 class 导航替换且未单独报告。私有 profile 虽已隔离，新增构建仍覆盖工作树公共 lib，宿主/bridge 仍写死本机共享快照来源，异常清理有缺口。以上阻止本轮签发完整环境验收 PASS。

**退役 UI 正向断言应继续退役，不恢复任务标签、长错误或“复制原请求”。** 当前生产仍有越权恢复 UI，正式运行截图也证实存在；必须标记产品合规不通过，不能为了 #3043 全绿恢复旧文案，不能删掉有效负向要求后称界面合规，也不能在本次只限测试环境的授权下改业务源码。

本轮仅创建本报告；未修改业务/测试代码、未构建、未启动或重启应用、未读共享用户 profile/凭据、未调用生成服务。安全定向测试和只读反例验证已执行；没有发起第二轮修复回归。

## Evidence｜验收依据与运行事实

### 1. 范围与规格

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-host-e2e-issue-3043`；HEAD：`d95764912e36da01d879ab65d6340469b48a4625`。
- 已读取 [环境规格](../../../specs/host-e2e-environment-3043.spec.md#L3-L24)、完整 git diff、[diagnosis](diagnosis.md)、主检出 [PM 契约核定](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-reports/issue-3043/pm-contract-audit.md>)，以及指定 [正式 generation 结果](../../../.agent-reports/canvas-generation-feedback/e2e-runs/c19996cd-9aa0-4387-b406-c3f3897dd2b6/result.json)。
- 环境规格原句：“不得新增 skip 掩盖失败、削弱有效断言或用仿制组件冒充生产页面”；“宿主路径若需配置，须显式指定并报可读失败；不读取共享用户数据作兜底”；“每轮仅操作任务私有测试目录、动态端口与测试进程，finally 必须清理”。
- 已核对 [design.md](../../../design.md#L1-L55) 存在；本次无生产样式/组件修改，不签全量视觉设计合规。文案依据为主检出 PM 核定及 [异常态白名单](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.agent-reports/inplace-task-card/pm-preflight.md#L61-L79>)，不是从组件当前字符串倒推授权。
- diff 仅四个文件：原生评论 E2E、generation browser、fixture、server；未发现业务源码修改。修正 viewer 跨插件导入、正式安装 viewer、私有宿主 HTTP 头上限、真实 React/UI kit 接缝均是合理环境方向。

### 2. 正式证据不是本轮重跑

- 最新已读 native 证据：[browser](../../../.agent-reports/comment-only-send/formal/comment-native-e2e-pX0BpI/browser.json)、[assertions](../../../.agent-reports/comment-only-send/formal/comment-native-e2e-pX0BpI/assertions.json)、[cleanup](../../../.agent-reports/comment-only-send/formal/comment-native-e2e-pX0BpI/cleanup.json)。四项检查齐全，`closed=true`、`uploadedCoordinatesExactlyMatch=true`、`outerRejectedBeforeRequest=true`、`hostStopped=true`。只读 access 核实该 `.tmp` 临时目录已删除。原生 1/1、无 skip 的测试汇总依当前任务给定事实；本轮没有原生完整 TAP 重跑。
- 指定 generation 结果：`PASS_SCOPED`、20 项记录、7 张截图、`errors=[]`、浏览器 `closed=true`、server `closed=true`、`changedSources=[]`；[ego-output](../../../.agent-reports/canvas-generation-feedback/e2e-runs/c19996cd-9aa0-4387-b406-c3f3897dd2b6/ego-output.json) 中 `code=0`、`signal=null`。视频记录具有 `videoWidth=160`、`duration=1`、`currentTime=0.071618`，不是只检测 `<video>`。
- 正式夹具 manifest 全部 sourceHashes 与本轮磁盘内容逐项 SHA-256 比对，差异为空。这支持生产组件/fixture 的同版本证据；manifest 未包含 browser/server 文件及 native 构建产物，不能据此声称覆盖了所有 harness/产物完整性。
- 已通过 display_file 查看 [terminal 截图](../../../.agent-reports/canvas-generation-feedback/e2e-runs/c19996cd-9aa0-4387-b406-c3f3897dd2b6/terminal.png) 及 [不可读视频截图](../../../.agent-reports/canvas-generation-feedback/e2e-runs/c19996cd-9aa0-4387-b406-c3f3897dd2b6/video-unreadable.png)。截图中的失败/取消/归属不明块和“复制原请求”确实可见；不是纯静态推断。
- [OCR 报告](ocr-review.txt) 为三个 generation 文件、0 finding；未包含 native 文件。独立 QA 仍发现下列确定性反例及规格缺口，不能拿 OCR 零意见代替有效断言审计。

### 3. 本轮安全定向执行

工作目录均显式为该 worktree，Git 命令均用 `git -C`。执行：

- `node --test --test-name-pattern='bridge regression' plugins/omnimux/src/client/media-viewer/generation-feedback.e2e.test.js`：3/3 通过，0 fail、0 skip；仅选既有三个 bridge 测试，没有执行浏览器场景。名称筛选不是新增代码 skip，也不是完整 E2E 重验。
- `node --test plugins/omnimux/src/client/media-viewer/media-viewer-store.test.js plugins/omnimux/src/client/media-viewer/generation-intent.test.js`：54/54 通过，0 fail、0 skip。
- `git -C <worktree> diff --check`：通过。
- 各命令独立保存退出值并输出 `REAL_EXIT bridge=0 store_intent=0 diff_check=0`，不以管道尾部退出码代替测试退出码。
- 使用 Node `vm.runInNewContext` 执行从当前 browser 文件抽出的原 wait predicate，构造只读输入，获得两条反例：`lifecycle accepts qa-a success while intended qa-b same-id is running`；`unreadable predicates pass with read-start logged, reader never settled, video absent`。未写测试文件、未修改生产 store、未启动浏览器或服务器。这是断言逻辑反例，不冒称已在真实浏览器注入该故障。

## 真实阻断与归属

### B1｜P1｜不可读视频仅等待读取开始，拒绝判定可假阳性

**定位**：[browser:131–136](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-browser.mjs#L131-L136)、[fixture:61–65](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-fixture.jsx#L61-L65)、[生产 loader:38–55](../../../plugins/omnimux-viewer/src/media-viewer/GenerationTasks.jsx#L38-L55)。

**事实**：fixture 的 log 在 readFile 进入时写入，早于返回/拒绝；browser 只等 path 的 log 出现，再立即断言 video 不存在。生产 loader 在异步读取未完成时也没有 video。工具 task 的 success 表示传输结果已归属，不能替代预览读取失败结论。

**反例**：已有正确 path 的 read-start log，readFile 返回永不 settle 的 Promise，DOM 仍处于读取中；当前两个谓词同时通过，报告仍可写 `unreadableVideoRejected=true`。如果以后错误地异步回退远程视频，也可能在回退挂载前通过一次性否定断言。当前 fixture 立即返回 `ok:false`，所以这不是声称该正式运行实际挂死，而是证明修订后的断言丢失原有“读取已完成并拒绝”的等待保证。

**规格对照**：PM 核定要求“拒绝路径确实被读取且失败、不产生可播放假结果、不自动重发”，不是“读过且此刻还没有播放器”。判定：**做错有效拒绝断言**。

**建议（只改 harness）**：对同一 session、path、请求/调用关联记录 read completion 及 RpcResult `ok:false`；等待已完成拒绝及实际预览异步处理收敛，再验证没有可播放 URL/视频及新增生成调用。必须能让“永不完成”和“延迟返回可播放字节”红灯。不得重新等待已退役 role=alert 文案作为成功条件。

**路由**：QA / 测试环境负责人；阻断当前环境修订验收。

### B2｜P1｜任务身份读取未使用 sessionId + requestId

**定位**：[browser:34–52](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-browser.mjs#L34-L52)、[fixture:32–39](../../../plugins/omnimux/test-support/generation-feedback/generation-feedback-fixture.jsx#L32-L39)、[生产 store:220–231](../../../plugins/omnimux/src/client/media-viewer/media-viewer-store.js#L220-L231)。

**事实**：两处 `find` 都只匹配 requestId；返回值中的 sessionId 仅写报告，不做 expected-session 断言。fixture 用跨会话全局递增 ID，因此现有 qa-a/qa-b 切换不会触发同 ID 冲突。生产身份明确是两字段联合。

**反例**：qa-a 的同名请求 success，qa-b 同名请求 running；在当前会话 qa-b 期待 success 时，predicate 拿到 qa-a 第一行返回 true。DOM 也只有 request 标识，未把 store 与当前 session 的媒体对应起来。

**规格对照**：PM 核定逐条要求“按 sessionId+requestId 读取”，早期生成规格要求“真实 session/request RPC ID 匹配”“切换会话隔离，无串单”。判定：**缺实现联合身份验收**，不是证明生产 store 已串单。

**建议**：card 接收 expected sessionId，两处观察同时精确匹配并断言它；媒体 DOM 以当前 session 的生产投影定位，不从任意全局任务拿状态。加入两个 session 共用 requestId、不同媒体/不同状态的既有 transport 级反例；保留正反会话切换。

**路由**：QA / 测试环境负责人；阻断请求隔离验收。

### B3｜P2｜本次新增构建写公共 lib，未隔离或锁定，存在并发产物竞争

**定位**：[native:38–57](../../../plugins/omnimux/src/client/comment-native.e2e.test.js#L38-L57)、[Hub builder:6–8,50–54](../../../plugins/omnimux/scripts/build-client.mjs#L6-L8)、[viewer builder:63–93](../../../plugins/omnimux-viewer/scripts/build.mjs#L63-L93)。

**事实**：两次构建发生在创建任务私有 temp 之前；Hub 覆盖 `plugins/omnimux/lib/client.js` 与 metafile，viewer 写 lib/types、index.js、client.js。没有任务输出目录、锁、原子整组发布或产物 hash 验证。真实路径核对：两个 lib 都在当前 worktree，不是主检出软链；node_modules 解析到主检出共享依赖目录。

**风险边界**：不存在“此次已污染主检出 lib”的证据。不同工作树 lib 不相同；但同 worktree 两次 native 运行/其他构建并行、或其他任务同步该树时，共用非原子输出可以在 profile add 读取过程中变动；声明/Node/client 三件产物也可能分属不同构建。构建失败留在 worktree 的半组输出不会被 finally 清理。共享依赖变化也未固定。动态端口和私有 profile 不能解决这层竞争。

**规格对照**：“每轮仅操作任务私有测试目录”。判定：**超出任务私有产物约束**；不能宣称并发安全。

**建议**：测试环境将真实插件构建/装配落到本次 private staging，再以不可变完整包安装；若构建器暂不支持输出参数，可用 harness 私有副本而非改业务。退而求其次须显式串行锁覆盖构建、安装、运行并记录输入及产物 hash，但仍需主理人核定是否接受写公共 lib 的范围偏差。不要为了本报告重跑并发构建破坏当前证据。

**路由**：Engineer（环境工程负责人）；阻断隔离/并发安全验收。

### B4｜P2｜宿主及 bridge 仍取固定本机共享物化路径

**定位**：[native:13–15,57](../../../plugins/omnimux/src/client/comment-native.e2e.test.js#L13-L15)。

**事实**：应用和 CLI 写死 `/Applications/OmniMux Dev.app/...`，bridge 默认取 `/Users/x/.omnimux-dev/profiles/omnimux/.materialize-snapshots/plugins/dsh-better-sidebar`。本轮未打开该目录，也未读取任何凭据。private DSH_HOME 的确隔离测试数据，但“装配来源不依赖共享用户 profile”仍未满足。

**影响**：新机器/干净 profile 不可复现；shared materialization 可能与工作树插件不同版本，或被别的会话更新后改变测试安装内容。只读借用插件代码不等同于凭据泄漏，不能夸大为已读取用户密钥；但确实违反当前可重复装配来源约束。

**建议**：显式必填宿主/CLI 参数，检查可读性并报告版本；bridge 用受控正式插件/声明依赖或显式 immutable 测试输入，记录内容 hash。无输入就失败，不猜用户 profile 的默认兜底。

**路由**：Engineer（环境工程负责人）；阻断自包含环境验收。

### B5｜P2｜class 导航合理，但有效命名断言被消除而未留下独立不合规结果

**定位**：[native:83–87](../../../plugins/omnimux/src/client/comment-native.e2e.test.js#L83-L87)、[命名规格 AC-4](../../../specs/canvas-naming-unification.spec.md#L30-L42)、主检出 PM 核定 63、73 行。

**事实**：原测试以 `title="点击进入图像生成"` 导航，修订为 `.omx-chat-media-tail__card`，保留真实点击且没有覆盖 disabled/CSS，这能避免把环境流程与文案漂移绑死；但现行有效命名期望未单独核对。diagnosis 已描述历史名漂移，不能将其当“命名已退役”。

**规格原句**：“卡片 title 为「点击进入图像生成」”；PM 要求 class 定位“并单独保留规格文案断言，使真实漂移可见”。判定：**有效规格观察缺失**。

**建议**：保留稳定 class 完成主流程，单独落该入口可见名/title/aria-label 与白名单对比，可作为独立失败/遗留报告，不要求本任务改产品字符串。报告明确区分评论行为 PASS、命名 FAIL，不把名漂移改回旧白名单。

**路由**：QA 补 harness 观察；实际命名修复归 Frontend，须另案授权。阻断“未弱化有效断言”签字。

## 产品合规失败｜不在 #3043 业务修复范围

**UI-1 / Frontend**：[GenerationTasks:63–89](../../../plugins/omnimux-viewer/src/media-viewer/GenerationTasks.jsx#L63-L89) 仍输出读取说明/长 alert、task.message 或状态标签、异常“复制原请求”。正式 terminal 截图可见无媒体 failure/cancelled/unresolved 仍占据大块空间。PM 白名单明确 viewer.recovery、copy、状态显示均为空字符串；当前源码与截图均违反。

本次正确退役了 `text.trim()`、pending/running 必有正尺寸卡、视频长 alert 正向期望和部分取消说明文字。这些删除本身不算削弱。缺口在于没有补等价有效负向审计：无媒体异常无恢复块、无 copy/状态文字、部分结果保留但不显示标签。当前 E2E 的 `negative.cards` 还将已有异常卡集合记下并在切回会话时原样比较（browser:91–105），它是现状一致性，不是 PM 合规。

处理建议：#3043 明确以环境/传输 PASS 与产品合规 FAIL 分轨，保存这项真实失败；若补 PM 负向断言导致红灯，应如实报存量缺陷。另由前端在单独批准范围删除越权展示，保留 URL/attachment/path 解析、完整 RpcResult/32MiB 校验、AbortController/Blob 清理及异常部分媒体。绝不恢复旧 UI 让测试过。QA 不替代 PM_SIGN_OFF，本报告不推翻现有 PM REJECT。

## 清理与异常路径审计

### 已证实正确

- generation 内层 try/catch/finally 有双层保护：task.finish 失败仍尝试 fixture.close；失败记录 error/diagnostics 并重新 throw，source 漂移也会置 FAIL。server 内存构建 `write:false`，随机端口，没有公共磁盘 bundle，正常 close 关闭连接。正式记录 browser/server 已关闭、源未变。
- production loader 有 live 标记、AbortController、object URL revoke；取消部分结果状态与实图保留测试没有移除。代码存在清理不等于本轮验证了卸载时真正触发。
- native 正常 finally 发 SIGTERM、等待 host exit、写脱敏 host.log、删除任务 temp；最新正式临时目录确实不存在。

### 需修或显式保留的异常缺口

1. **native 清理范围不完整（P2，Engineer）**：temp 建好后 env mkdir、settings/seed/evidence 写入全部在 try 之前（41–52 行）；任一步失败不会进 rm。构建也在 try 之前并且非私有。建议资源获取一开始就进入 try/finally，finally 的 writeFile 失败不能阻止最后 rm。
2. **native 子进程失败/超时没有可保证收敛（P2，Engineer）**：host 监听 exit，但无显式 spawn error 接管；`once(host,'exit')` 可能在 spawn error 时拒绝；`await hostExit` 或证据写失败会跳过后续 rm。SIGTERM 无有界等待/升级终止。command 安装/ego 子进程没有 deadline/abort；Node 测试 timeout 不自动清理这些子进程。若 ego 节点不返回，宿主 finally 尚未运行。建议使用可取消 deadline、捕捉 error、嵌套 finally 保证 rm、只对本任务 PID 作终止升级并记录实际退出。
3. **generation 超时/释放接缝未证明（P2，建议）**：外层 browser 测试没有 timeout 或 child abort；内层 waits 不能覆盖构建卡死、taskSpace/finish 卡死。fixture 提供 `window.qa.dispose()`（bridge dispose/root unmount）但退出前未调用，也未验证 signal abort/Blob revoke。关闭页面最终释放上下文不能替代卸载接缝回归。建议失败与结束前调用已有 dispose、观察 reader abort/revoke，再 finish；外层有界 watchdog 确保只清本任务资源。
4. **server 启动失败收尾（P3，建议）**：listen 拒绝时 startFixture 未返回，caller 的 fixture 仍空；建议启动 promise 失败时在该函数内部 close，source hash 阶段失败也不要留下可监听服务。目前构建/源读取均在 listen 前，风险较小；没有本次实际泄漏证据。

## 非阻断建议与覆盖边界

- 两个入口的 `skip: !hasEgoBrowser` 是既有代码，本次未新增，正式运行也没有触发；**不据此指控实际通过是假绿**。但显式要求运行时缺驱动仍可能整条浏览器用例跳过，违背 PM 要求；应另设显式运行模式 fail-closed，保留普通开发 opt-in 策略须说明。
- success 图片 request-1、附件 request-11、video request-9 保留自然宽度/真实播放；但 readFile 日志未断言 expected session/path 的完整调用参数，imageUrl 当前是 `async () => image`，不能发现传错 session/attachment。补具名接缝调用记录/精确断言；保留真实渲染，不换 stub viewer。
- request-4 的 running→success 状态保留；request-5 unresolved 本轮没有显式 `media=[]` 与原有结果不变的断言；3 个 bridge 回归覆盖另一条双候选歧义，但不替代该浏览器场景。补状态与媒体身份投影，去掉固定计数作为唯一完整性保证。
- “普通提问/停止”目前只检查 task ID 集合和 image 所属 ID；不能发现原任务 prompt/status/URL 被改。建议提交前后比较冻结的有效字段。媒体内容全使用同一山峰 SVG，ownership 视觉反例判别力有限。
- pending/running 空媒体“宽度=0”保留了静默要求，但没有历史实图 fixture，未验证主图不被挤压、running+中间媒体无文字、深/浅主题或比例几何；这些不应被单个 pending.png 冒充全量设计验收。
- comment-native 仍仅一条评论（源码 128 行 `comments.length===1`）；[原生规格](../../../specs/comment-only-send.spec.md#L6-L11) 要求至少四条、原生 busy/upload/error、切会话及保留其他内容。它们是既有覆盖不足，本次没有进一步删掉，但 1/1 不能宣称原规格全部验收完成。
- diagnosis 的“正式用例尚未修改，生成反馈尚未通过”是旧阶段记录，与现在真实通过证据不符；应补当前状态而不是覆盖历史根因。HTTP 431→私有头上限合理；fixture server 头上限也扩大，但不是该夹具原始导入失败的根因。

## Unknowns｜尚未证实

- 尚未在真实浏览器执行“永不 settle / 延迟错误回退”或同 requestId 跨 session 故障注入；现有独立 VM 反例已足够证明断言逻辑不完备，不能外推为此次真实运行已触发。
- 尚未做并发构建压测，没有证据称本次产物已污染；只有具体可竞争路径及缺隔离机制证据。
- 独立夹具没有生产主会话/通知渲染器，不能验证不可读媒体/异常结果在主会话可达；没有假造出口补洞。
- native 正式证据没有输入/构建产物 manifest，本轮未查看 shared bridge 或安装包源码/用户 profile，不能确认其版本固定。
- 当前 Dev 进程及用户环境不在读写/操作范围内，未查询进程或端口，也不宣称全部用户应用状态已验。

## Not covered｜本轮未覆盖

不修改业务或测试代码；不构建、不物化、不打开/重启用户应用、不读取凭据、不收费生成、不提交/推送/合并/部署；不替代审秋毫 OCR，不替代 PM_SIGN_OFF；不验真实供应商生成、不验专用 composer 生成、全仓 CI、完整深浅主题与过渡动画。全部发现仅定位并建议，不越权修复。

## 路由与下一步

- **QA**：修 B1、B2、B5 的测试观察与反例门禁，补有效负向文案报告及接缝身份断言。允许状态从真实 store 观察，不允许手动改 state 填结果。
- **Engineer（环境工程）**：修 B3/B4、native 异常收尾和有界子进程控制，仅在 harness/测试环境范围实施。
- **Frontend**：当前越权恢复 UI、入口命名漂移作为独立产品问题；由主理人决定另案授权，不合并进 #3043 环境修复。
- **第 2 轮回归**：先验证永不完成读取应失败、session/request 冲突不误认、私有装配/失败收尾，再运行正式两入口并保存同次证据。若仍失败，停止循环并列 Known Issues；本轮尚不是 Known Issues 最终截断。

**Confidence｜置信度：高。** 两项假阳性有当前源码原 predicate 的确定性反例，文案越权有 PM 白名单、生产源码和正式截图三者一致证据；隔离与 cleanup 判断基于真实路径及具体异常控制流。并发污染实际发生、资源泄漏实际发生没有证据，因此仅报告风险/缺保证，不误写为已发生事故。
