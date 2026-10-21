---
title: "plugin-qa — OmniMux 插件验收证据合同"
id: "contract-plugin-qa"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-28"
updated: "2026-10-18"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# plugin-qa — OmniMux 插件验收证据合同

本合同定义不同变更面需要什么证据。风险与合入授权见 [plugin-git-pr](plugin-git-pr.md)，环境隔离见 [dev-pipeline](dev-pipeline.md)，执行步骤按需加载[仓库 workflow skill](../../.agents/skills/omnimux-repo-workflow/SKILL.md)。静态检查、单测、浏览器与 Electron 各证明不同事实，不得互相冒充。

## 适用矩阵

合并前只在隔离 worktree 完成相关自动化测试、静态检查和独立评审，再通过 PR required CI 与 Merge Queue 合入 `main`。没有合并前独立 App/Host 测试环境，不得换名保留；Agent 侧运行与浏览器验收在**自身隔离 worktree 内**用动态端口执行（ego-browser 或 worktree 隔离 Web QA 运行器，随测随清、保留截图与结构化报告），不再要求 Dev App 真机验收。Dev 真机验收为人工职责，不作为 Agent 交付卡点，也不得由 Agent 声称已取得。

| 变更面 | 合并前 | Agent 侧验收（隔离 worktree Web） | 不要求 |
|---|---|---|---|
| 纯文档 / Issue 模板 / 流程 | metadata、链接、命令与适用文档检查；独立评审 | 无 App 验收 | 45120、App 物化、Electron |
| 纯脚本 / 测试 | 相关脚本测试、静态检查、边界/错误路径；独立评审 | 无 App 验收 | App 物化、无关浏览器截图 |
| Host / 插件运行行为 | 相关单元/集成测试与静态检查；独立评审 | 在隔离 worktree 启动本地服务，验证目标 HTTP/RPC/运行行为 | 无 UI 时不要求 DOM |
| Client / Stage / 侧栏 | 相关组件/行为测试与静态 Stage 检查；独立评审 | 隔离 worktree 的真实浏览器 Web 验证（ego-browser 或 worktree 隔离 Web QA 运行器，动态端口、自清理）+ 截图/结构化报告 | 默认不要求 Electron；Dev 45120 真机验收归人工 |
| 壳层 / 平台门控 | 相关自动化测试与静态检查；独立评审 | 隔离 worktree 的适用浏览器证据 + 真实 Electron renderer/CDP | 不能只用 web 页面替代 Electron |
| 生产发布 | 另见发布授权与发布计划 | 授权目标上的发布/回滚证据 | 不属于普通开发验收 |

已知 `plugins/omnimux/scripts/run-tests.mjs` 仅用于包测试，不在产品安装包文件清单；独立改动与文档、正式测试同为非运行输入，不安装或重启开发版。其它插件构建、宿主、客户端及运行时资源仍按实际用途交付，混合改动不因含测试执行器而跳过安装。

每条 Issue acceptance 只绑定适用阶段。`not applicable` 必须给出变更面理由；skip、环境错误或未执行检查不能写成 PASS。CI `qa:pass` 仅证明合入前静态与测试，不等于隔离 worktree Web 验证通过。历史 QA/evidence 中的失败或未执行不重标为通过。

## 环境身份

| 位置 | 身份要求 |
|---|---|
| 合并前 worktree | base/head SHA、dirty 状态、实际 diff 与测试命令；无 App 物化 |
| 隔离 worktree Web 验收 | 任务自身 worktree 内启动的本地服务，动态端口、自清理；Agent 可自证的验收基线，保留截图与结构化报告 |
| Dev 真机 | `~/.omnimux-dev`，端口 `45120`；**人工职责**，Agent 不据其出证据、不等待、不阻塞交付；插件改动合入后由收尾自动装入，已一致则跳过；Dev/Prod 不得 link 或接收未合并 worktree |
| Prod | `~/.omnimux`；没有独立发布授权不得写入或用于普通交付 |

隔离 worktree Web 验收证据须绑定实际运行的服务进程、端口、URL 与源码身份。源码提交或目标进程变化后，不得拿旧请求、截图或运行身份冒充当前版本；在报告中区分源码检查与已加载版本。

## 工作树测试配置准备

现有 `scripts/test-env-bootstrap.mjs` 的 `startTestEnvironment({ root, mode })` 是兼容准备路径，`root` 必须是本仓 `.worktrees/` 内真实双向登记的直接任务工作树；创建源码工作树本身不读取或复制凭据。调用者负责在 `finally` 中等待 `cleanup()`，只将脱敏 `summary` 写入证据。启动就绪不等于业务验收通过，现有完整装配也不等于新用户安装。

| 模式 | 兼容路径的实际配置来源与行为 | 证据边界 |
|---|---|---|
| `ui`（默认） | 私有运行目录、合成测试凭据与本机动态模拟端点；现有完整插件装配仍读取 Dev 设置、profile 和部分业务数据，并复用其依赖/媒体 | Dev-backed，无契约 smoke；不是不访问共享状态的新用户环境，不证明真实模型、任务安装或加载 |
| `onboarding` | 不配置模型凭据，保留首次配置流程；兼容装配仍可能复用 Dev profile/数据，不能据此证明任务插件已按新用户方式装入 | 只证明实际执行的首启/缺配置局部行为，不作为任务验收绕路 |
| `live` | 只可在当前任务明确凭据授权内使用；现有兼容路径读取 Dev 配置/凭据并可能复用共享资源 | 模式参数不产生授权；不得按固定单密钥假设扩张读取，不证明 fresh 或任务成功；额外付费/视频请求仍受任务边界约束 |

普通界面测试不得在网页填写真实密钥，`live` 不能作为 `ui` 失败的静默回退。缺配置须报告脱敏原因；禁止为凑通过转读 Prod、Base 或扩大当前任务授权。现有 Dev-backed 行为是待替换的兼容事实，不是新任务默认授权，也不改变产品新用户基线。

显式证据请求传入 `evidenceContext:{taskId,runId}`、固定 `candidate:{base,head,outputs?,extraInputs?}` 和 `taskPlugins` 时，准备器支持独立的合成 `ui` 路径。hub 隐含包含，目标仅支持 `omnimux-inspiration`、`omnimux-browser`、`omnimux-assets`；未知目标、命令或源路径在创建资源前拒绝。`onboarding`、`live` 不支持此路径；没有 `taskPlugins` 的旧显式请求仍在 runtime/profile/credential 访问前报 `TEST_ENV_NOT_USER_FRESH_TASK_UNKNOWN`。缺字段或不合规根在启动前拒绝，未必有原件；失败封套有效不等于检查通过。不能回退兼容路径、Stage 夹具或读取 Dev 来刷绿。

任务准备从同一候选捕获源码，在工作树自有目录构建、打包并核对归档；通过已安装 App 的正式 `dsh plugin --profile web add` 离线安装。运行图位于系统真实临时目录下独占的 `omnimux-task-*`，绑定 task/run 与目录身份；HOME、DSH_HOME、agents、配置、缓存与 store 均私有，不继承宿主凭据。普通依赖先验证原声明再改写私有定位；包图不得指回仓库，缺依赖明确失败。核心 base/web-app 来自 packaged App；assets 所需 sidebar 作为固定支持包正式安装并核对发布字节。缺失的 ReactDOM peer 仅支持仓内已安装的固定 `react-dom@18.3.1` 及其声明依赖，复制成普通私有库、不注册为插件；其自身 React peer 仍须实际核验。合成业务夹具显式记账，不等于空数据首启；所有配置路由指向本机 mock，不产生真实模型证据。

登录 URL 仅在受信调用者内存中用于本次同源 token→Cookie 交换，不打印、不持久化、不放入截图说明。浏览器进程不继承宿主密钥。完整核心应用启动或 `evidenceLevel=full` 不证明任务源码已安装加载。正式路径逐文件核安装 payload，通过同一应用 PID 的 inspector 核实际 server 文件 URL、源哈希及声明 peer 的解析位置/版本，再通过真实浏览器 CDP 核 client 注册与候选 bundle；只允许任务私有依赖图或 packaged App 的宿主 peer。旅程前后重核身份与字节。公开消费者据此计算 `userFresh`、`taskBinding=installed-loaded` 与 `task-source-installed-loaded`；缺观测、外源、歧义或漂移均不能通过，注入桩仍是非授权自报。资产库路径按现行内嵌 Explore 或素材工作台结构核验选择状态、内容和未遮挡几何，弹窗/菜单须实际关闭；API 返回成功或隐藏 DOM 存在不能替代可见性。

应用级入口为 `pnpm verify:app`（等价于 `node scripts/worktree-app-qa.mjs`），root 从脚本位置推导，只接受 `<repo>/.worktrees/<task>` 真实直接登记树。无显式请求的旧调用保留无契约 smoke：原件落 `<root>/.workbuddy/evidence/app-qa/<runId>/`，兼容摘要写 `<root>/docs/evidence/worktree-app-qa-report.json`；其 pass 只涵盖真实执行的固定安全名称冒烟，不签 task/fresh。legacy 使用静态断言名称白名单，普通自定义 `journey:<名称>` 不在白名单，会分类失败，不承诺任意 journey 任务成功。摘要不是权威封套，且现有摘要路径没有被 ignore，可能改变候选状态。

自定义任务旅程使用显式 `--request <工作树内非秘密JSON>`，可另给 `--journey <路径>`，或在请求中给 journey。请求启动前固定 taskId/base/head/scope/requiredChecks/expectedAssertions，可列 extraInputs/artifactNames；只接受 ui。正式 fresh 请求列 `taskPlugins`，且 app-environment 必须预声明 `task-source-installed-loaded`，smoke 也适用。固定检查为 app-environment/app-browser；有 journey 增加 task-journey，task/reproduction 必须有 journey、非空具名预期及任务安装加载断言。请求、旅程和显式 helper 文件纳入输入，完整动态输入闭包仍 unknown；断言按预声明检查归组，拒绝跨组重名，不从返回断言反推标准。旅程模块默认导出 `async ({send, sleep, evidenceDir, origin, io}) => { assertions: [{name, pass}] }`，空/空白/重名/非布尔整组拒绝，正常 false 保留；同进程仅允许一次 contract journey，未知名不得持久化原文或投影丢弃后刷绿。入口成功只覆盖请求中的插件、检查与真实旅程，不自动证明其它业务任务或完整阶段 C。

显式请求只写 `<root>/.workbuddy/evidence/contract/<taskId>/<runId>/` 中预声明单层 png/json/log/txt，不写兼容 docs 摘要。顺序为 capture before → 执行/逐项清理并等待 exit+close → 固定 raw-run.json → 相同 options capture after → seal/写 evidence.json → candidate validate。raw 保持 pass=false/unsealed，不在封存后回改；封套不自含，漂移/封存失败保 raw 且最终 false。输出目录不等于排除源码或来源认证，依赖桩明确 dependency-stub/self-reported/not-granted。该封套只承诺结束运行历史完整性及候选适用性，不承诺当前在线、独立认证、完整阶段 C 或真实浏览器。图片/音频真实任务加强证据仍需沿授权正式路径；视频生成 live 验证恒需任务级特批。

`pnpm test:worktree-web` 的现有 Stage 分支是模拟宿主夹具，其中包含占位内容与补入口逻辑；它只可提供其明确覆盖的局部证据，不得作为完整应用、首启或任务插件装配的验收通过。完整应用启动失败不得自动退回该夹具并报告成功。

物化后冒烟（dev-smoke）：`scripts/dev-smoke.mjs` 由 `worktree.sh` 物化成功后自动调用——只读探活 Dev 45120 页面并截图，对本次物化插件比对「物化包内最新文件 mtime vs Dev 主进程启动时间」，晚于进程即输出 `needs-restart` 提示（不自动重启）；Dev 未运行或调试口不可达时报 `blocked` 而非误报 PASS。证据落 `docs/evidence/dev-smoke-report.json` 与 `docs/evidence/dev-smoke-<runId>/dev-page.png`。两者都是本机生成物：报告已被 `.gitignore` 忽略且不进版本库，冒烟覆盖写它不得弄脏主检出（否则 `worktree.sh ship` 的干净检查会拒绝物化）。

## 质量闭环证据消费

当前已建立公开请求读取与历史核证边界：空参数退出2；请求须为绝对规范路径的普通单硬链接非秘密JSON，逐段拒链接、NOFOLLOW/NONBLOCK打开、128KiB有界读取并核前后身份，有效UTF8与固定字段白名单。缺失、损坏、类型/大小不支持及未知字段均分类退出2，不回显路径、请求或底层异常。该字节上限不等于核心全流程资源或耗时上限。原入口已恢复基线行为，仅撤销本片新增的永久拒绝，不代表原证据漏洞已修复。

`node scripts/guard-quality-loop.mjs --verify-report <非秘密固定请求JSON> [--current]` 是非准入核证入口；history 实际调用公共 `inspectTaskVerification`，先绑定精确 root/task/run/base/head、检查/断言、报告与原件，再调用公共核心，只读精确报告及原件。candidate 必须显式 --current 且预声明包含报告和全部原件的 outputs，缺失分别返回 CURRENT_ARGUMENT_REQUIRED / CURRENT_OUTPUTS_REQUIRED、退出2；以同一运行的 outputs/extraInputs 真实调用公共 captureCandidate，仅传本次返回值，不复制封套快照或回退 history。真实当前源字节漂移由核心分类失效；捕获错误保原核心稳定错误码，意外异常为 CURRENT_CAPTURE_FAILED，不回显请求、路径或底层异常。history 加 --current 或多余参数拒绝；JSON 候选或信任自报不在白名单。请求不能伪装 output 排除，根内请求须在原捕获前稳定存在或用已授权根外请求。当前历史/候选域覆盖有限，进程行为、读取竞态及来源认证仍按实际证据独立判断，不据此报完整质量闭环完成。

只有 valid 且 pass 才退出0，有效失败退出1，其余无效/读取/捕获错误退出2；输出分类及代码，始终 self-reported/not-granted，不输出工具权限决策、不执行检查或应用，不证明来源认证、真实业务预演或端到端准入。

无参数已注册工具前入口保持原基线行为；本片撤销自身新增的 E2E/UI 永久拒绝，不修复原 mtime、注释和假PNG 假正例漏洞，也不代表完整质量闭环或批准 D 完成，后继须真实当前持有者及源码安装加载行为闭包。

## 浏览器与共享探针

- API、脚本和配置优先；需要 Web/Stage 浏览器验收时统一使用 ego-browser 的任务隔离空间，先加载 ego-browser skill。不得回退 IAB，也不得用桌面截图替代浏览器检查。ego 缺少 CDP 事件、脚本源、稳定 task/tab 身份或真实 PNG 能力时为 BLOCKED，不降低校验。
- Agent 侧验收在自身隔离 worktree 内完成真实浏览器 Web 验证，动态端口、自清理，可用 `pnpm test:worktree-web`（worktree 隔离 Web QA 运行器）或 ego-browser。Dev 真机 45120 的验收归人工，可使用 `pnpm verify:live <stage>`（目标仅为 `dev`、URL 为 `http://127.0.0.1:45120/`，`all` 只覆盖已登记的公开 Stage）；它不是 Agent 必做项，也不作为 Agent 交付卡点。
- CLI 返回 pending/request path（exit 2）只表示请求已准备，不是通过。在 `ego-browser nodejs` heredoc 中通过唯一正式模块 `scripts/ego-live-qa.mjs` 创建适配页并调用 `runPreparedQa(requestPath, { tab })`；它不会自动登录。历史弱执行器或 IAB 报告不作为当前验收。
- 请求在页面准备成功后原子消费一次；准备前后均检查有效期、代码 SHA 与请求身份。认证或浏览器预检失败不消费请求；真正探针开始后即使失败也保留实际 consumedAt，不得复用或声称未消费。并发执行只能有一个消费者，未取得执行权的调用不得覆盖消费者报告。
- run ID、代码 SHA、目标、URL、ego task space/Tab、profile、Host 或运行版本不匹配时失败。前后身份必须相同，runtimeProof 必须读取同源真实加载脚本并核对唯一注册和 bundle 指纹；截图必须真实可解码。不得复用旧 run、旧截图或旧空白会话。
- 先在同一 ego Tab 完成本地认证与 QA 会话准备。证据不得保存 token；探针不得发送消息、生成媒体或提交账号任务。用户接管、任务 inactive/not assigned 或浏览器拒绝立即停止，必须得到明确确认才可恢复；不得换任务、工具、路径或协议绕过。
- 跨轮复用同一 task space；适配器锁定该任务，每次操作核验所有权与选中 Tab。验收结束后先确认报告，再用独立最终 heredoc 调用 `completeTaskSpace(id, { keep: false })` 并检查 `done`；只有 skill 规定的具体理由才可保留页面。

### 扩展类 e2e（未打包扩展）

验收对象是浏览器扩展本体、需要以未打包形式加载工作树构建产物（`extension/dist`）时，ego lite 是固定构建的 Chromium，不支持运行时加载未打包扩展，故这类验收只能使用真实 Chrome。它是浏览器验收的唯一例外，并遵守以下条款：

- **唯一入口**是 `scripts/lib/extension-e2e.mjs`：一次运行只起一个 Chrome 进程，多个场景通过 `browser.newPage()`（CDP `Target.createTarget`）复用同一进程，禁止每个场景重启浏览器。
- **必须清理**：runner 的 `close()` 与进程退出钩子会终止 Chrome 并删除临时 profile；调用方必须把 `browser.close()` 放在 `finally`，断言失败也不得跳过。
- **禁止仓库外自建脚本**：不得在 `/tmp` 等仓库外路径写 spawn Chrome 的一次性脚本，也不得把调试端口参数散落在未评审的脚本里；扩展 e2e 逻辑应进入受控 runner 或本任务 worktree 内、进入 PR 的脚本。
- **证据**：保留结构化报告与真实 PNG，并记录 Chrome pid、场景数量、profile 是否已清理；运行后核对没有残留进程。
- **门禁**：DSH 的 CDP PreToolUse gate 会读取命令所引用脚本文件的内容；仓库内脚本放行，仓库外脚本命中调试端口模式时拒绝，只有用户明确同意并写入 `~/.dsh/cdp-allow` 后才可临时放行。
- **缺少 Chrome** 时显式失败并给出安装/`CHROME_PATH` 指引，不得静默回退到其他浏览器或 IAB。品牌版 Chrome 137+ 会忽略 `--load-extension`，runner 因此优先使用 Chrome for Testing；可用 `CHROME_PATH` 显式指定。

### 页面准备与认证恢复

页面准备复用 `scripts/ego-live-qa.mjs`，由 `runPreparedQa` 在消费请求前调用，也可单独调用。目标仅限 Dev 45120；先核对当前 Tab 的 origin，再执行页面操作。

按已加载的 ego skill，在 heredoc 中复用已选任务与 Tab，不预写浏览器脚本文件。以下 ID、路径必须替换为本任务实际值，脚本来自已合并源码；正式探针不自动发起登录：

```sh
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace(ACTUAL_TASK_ID) // replace with this task's returned ego id
await switchTab('actual-ego-tab-id')
const { createEgoPage, prepareEgoPage, runPreparedQa } = await import('/absolute/merged-repo/scripts/ego-live-qa.mjs')
const tab = await createEgoPage(
  { currentTab, listTabs, listTaskSpaces, pageInfo, gotoAndWait, cdp, drainEvents, click, waitForElement },
  { taskSpaceId: task.id, tabId: 'actual-ego-tab-id' },
)
cliLog(await prepareEgoPage(tab, { url: 'http://127.0.0.1:45120/', target: 'dev' }))
// In a later heredoc, after preparing the QA session and request:
// cliLog(await runPreparedQa('/absolute/merged-repo/.workbuddy/evidence/live-qa/<run-id>/ego-browser-qa-request.json', { tab }))
EOF
```

已有准备好的 QA 请求时，直接调用同一模块的 `runPreparedQa(requestPath, { tab })`，不需另跑页面准备。准备结果的 `ready` 仅表示产品页面已加载、未发现可见连接警告，并且现有 Cookie 的同源根路径 `GET` 返回 200；已有旧 UI 而该检查返回 401/403 仍是 `auth-required`，不得消费请求。页面准备最多做两次同源只读检查：首个同源页面检查一次；若随后等待页面就绪或执行精确认证页的内部导航，则在最终就绪后再检查一次。两次之间不循环认证检查。`status: 'recovered'` 表示仅精确认证错误页在检查返回 200 后做过一次页面内部同源导航；都不等于 QA `pass`。业务会话、运行身份和 Stage 断言仍由正式探针验证。`prepareEgoPage` 不负责创建标签或取得正式登录链接。

预检失败结果返回给调用者；调用者应保存脱敏结果作为该次尝试的证据。请求的规范报告保持 pending 或保留已有消费者报告，不会被未消费的失败尝试覆盖。

| 状态 | 动作与结果 |
|---|---|
| 已登录且页面就绪，且现有 Cookie 同源 GET 返回 200 | 复用当前页面，不刷新、不切换业务页或会话；随后仍须通过完整运行身份与 Stage 探针 |
| 明确的同源认证错误页 | 一次带 5 秒超时的同源只读请求，使用已有 Cookie；仅在返回 200 时执行一次页面内部同源导航，并等待真实产品 UI 就绪 |
| 任一页面状态下同源请求返回 401/403 | 返回需要认证；仅从有权访问的 Dev Desktop 取得正式登录入口，完成正常登录后重新准备页面 |
| 服务不可达、请求或浏览器工具超时 | 有上限退出并保留未消费请求；区分 HTTP/网络结果与工具等待失败，不默认启动或重启共享 App |
| origin 不匹配或 URL 策略拒绝 | 停止操作，不更换协议、浏览器或请求路径规避拒绝 |
| 页面没有就绪或业务断言失败 | 分别报告准备失败或 QA 失败；HTTP 200、页面标题不能作为业务验收通过依据 |

正式登录链接由当前已运行 Dev Desktop 提供。桌面设置页的“浏览器访问 URL”来自同源 `GET /api/desktop/settings` 的 `web.localUrl`，该接口受现有认证与同源约束保护。必须在有权访问的 Desktop 上取得链接，并仅在内存中交给同一目标 ego Tab 完成正常 token→Cookie 交换；随后使用不含凭据的 URL 调用页面准备。无法可靠读取正式入口时报告阻断，不能把该接口当成免认证 bootstrap API。

禁止复制或伪造 Cookie、读取签名密钥造票、关闭 SameSite、把 fetch 返回的 HTML 写入 DOM、无限重试，以及为验证而清除共享 Dev 认证。缺失认证的错误路径由自动化 fixture 覆盖；真实 Dev 登录问题只沿正式入口恢复。登录入口不可用或浏览器工具失败不授予 App 生命周期、配置或凭据修改权限。

准备结果记录脱敏 origin、时间、有限尝试次数、恢复动作和分类原因；不得持久化 Cookie、token、完整认证 URL 或原始敏感工具错误。Strict Cookie 的请求阻止原因只能在有 Network 证据时确认，不能仅凭 401 推断。外层导航被阻止而同源请求成功时，可证明同源恢复有效；底层浏览器发起者原因另行追踪。

导航命令发出后若工具超时，记录已尝试导航且结果未确认；不得宣称页面完全未变，也不自动再次导航。浏览器自身的网络错误页不等于 URL 策略拒绝，仍需区分页面报告的网络失败与独立监听状态证据。

Stage 探针必须从真实 `datasetKey` / Tab ID 触发入口，并至少断言：目标内容非空、active Tab 与选中项唯一、重复打开幂等、关闭后状态清空、重新打开恢复，以及 viewport/context 属于当前会话。HTTP 200、页面标题、loading 占位或合法空态本身都不足以证明 Stage 通过。

默认摘要写入 `docs/evidence/live-qa-report.json`，完整本机证据写入 `.workbuddy/evidence/live-qa/<run-id>/`；这些运行文件不提交。回收 worktree 前把需要保留的证据复制到不会被清理的任务位置。报告至少包含：

- Issue/PR、base/head/merge SHA 与 dirty 状态；
- run ID、Stage、目标 profile、URL、Tab、Host 身份与运行版本；
- 逐项 Given/When/Then、DOM 断言、可解码截图；
- 开始/结束时间、失败或 skip 原因、探针清理与原会话恢复结果。

## Electron 追加证据

只有改动依赖 Electron 壳层、`data-dsh-desktop-*`、macOS/Windows 平台门控、原生拖拽/窗口布局等 web 页面无法呈现的行为时，才额外执行 `pnpm verify:cdp` 并保存 `docs/evidence/live-cdp-qa-report.json`。普通插件 Client/Stage 不要求重复做 Electron 验收。

45120 是 Dev Host 的 web 页面；它能证明 Dev 物化后的 Web/Stage 行为，但不能证明 Electron-only DOM 或 computed style，且按 2026-09-14 政策变更属人工验收范围，不作为 Agent 交付卡点。Electron-required 任务若 CDP 不可用应报告 BLOCKED，不得回退到截图猜测。

## 本地最小命令选型（Agent 默认）

本节是「变更面 → 最小命令」的唯一真源。[AGENTS.md](../../AGENTS.md) Verification 表只作索引；执行步骤见 [omnimux-repo-workflow](../../.agents/skills/omnimux-repo-workflow/SKILL.md)。`scripts/impact-matrix.mjs` 只判定是否需要浏览器/物化维度，不代替本表选命令。

### 选型算法

1. 列出相对仓库根、相对已核验 base（通常 `origin/main` 或 PR base）的变更路径。
2. 运行或复用 `node scripts/impact-matrix.mjs --git-diff --base <base>`（或 `deriveImpactMatrix`），记下 `browser.required`。
3. 按下表对触及面取**命令并集**并去重；每条记录「为何选 / 为何跳过」。
4. 只跑该并集；通过后不要为了 commit/push 重复已绿项。
5. `pnpm test:all` / `pnpm verify:all` **默认禁止**。仅当用户显式要求、诊断 CI 红灯、或变更跨多插件且无法缩窄时才允许全仓。

### 变更面 → 最小命令

| 变更面（路径/行为启发） | 必跑（最小） | 有触及再加跑 | 明确禁止 / 不适用 |
| --- | --- | --- | --- |
| 纯文档 / skill / 合同 Markdown | `git diff --check`；抽查改动链接、命令与边界句 | 触及配对或 skill 时：`pnpm doc:pairing` / `pnpm verify:skill-bilingual` | 不要求包测、浏览器、物化 |
| 门禁 / CI / hooks / `scripts/*gate*` | 改动脚本所属 `node --test …`；触及 gates 集合时 `pnpm test:gates` | 改 impact/authorization/ci-verdict 时 `pnpm test:ci` | 不要无差别 `verify:all` |
| 产品基线 / 路径 / 本地状态默认 | `pnpm verify:product-baseline` | 相关包测 | 不得把开发机私有状态写进默认路径 |
| 单插件业务逻辑（非 UI） | `pnpm --filter <package> test` | 该插件边界/registry 小测 | 默认不跑 `pnpm -r test` / `test:all` |
| Agent Tools / Schema | `pnpm test:agent-tools` | `pnpm verify:tools` | — |
| DSH 合同 / inject（运行时加载校验） | `pnpm verify:plugin-load` + `pnpm test:plugin-load` | 触及的插件包测 | — |
| 模型契约 / 路由 / 白名单 / 模型面定价 | `pnpm verify:model-contracts` | 下游：`pnpm verify:cross-plugin-models`、相关 submission/whitelist 检查；需要面板时 `pnpm hub:interfaces` | 禁止用真实付费探测发现能力 |
| Client / Stage / 侧栏 / 文案 / CSS | 先读 design 与文案规范；`pnpm verify:stages`（及触及的 `verify:stage-scroll` / `verify:slots` / `test:ui`） | **必做**隔离工作树功能路径浏览器证据（`pnpm test:worktree-web` 或 ego-browser + 截图/结构化报告） | 禁止首页打卡冒充；禁止单测绿替代浏览器证据；Dev `verify:live@45120` 归人工，非 Agent 必做 |
| 表单合同 | `pnpm verify:forms` | 相关包测 | — |
| 壳层 / Electron 门控 | 相关静态/包测；若有页面则加隔离 Web | 仅 Electron-only 行为时 `pnpm verify:cdp` | 不能只用网页替代 Electron |
| 多面混合 | 上表并集 | 仅对真实触及面加跑 | 仍禁止无差别全仓 |

### 假绿与世界态

- 带「无密钥 / 无浏览器则跳过」分支的检查：不得把「全部跳过」写成 PASS；须 preflight 硬失败、或显式 `not applicable` 并写明理由。
- 验收优先断言外部世界：DOM/几何、导出文件、请求体、持久化状态；禁止只扫 Agent/UI 自夸文案关键词。
- 证据须记录命令、退出码、真实用例数与 skip 数。行为代码有变更但命令缺失、`0 tests`、失败或未声明 skip，均不能通过。

### 本机门禁前置条件

本机跑 `pnpm test:gates` 前先确认以下两点，否则失败不代表改动有问题：

| 前置条件 | 缺失时的现象 | 处理 |
| --- | --- | --- |
| 当前 `node` 自带 `corepack` 且在 PATH 上（如 nvm 安装的 Node；Homebrew 的 `node` 没有） | 同步类测试报 `corepack: command not found` 或 `corepack is not on PATH` | 把带 corepack 的 Node 放到 PATH 前面，或执行 `corepack enable` |
| 不经 `pnpm <script>` 自动安装：在工作树里用 `node` 直接执行脚本里的命令 | 自动安装构建失败，或误删已跟踪的 `plugins/*/lib/` 文件 | 用 `git -C <worktree> checkout -- .` 恢复后改为直接执行 |
| 新建工作树没有被忽略的构建产物（如 `plugins/omnimux-forms/assets/examples/`） | 表单准备与 `verify-package-files` 相关用例只在工作树里失败 | 在工作树里完成依赖安装和表单构建，或只在主检出对比这几项 |

`scripts/verify-ci-gates.test.mjs` 会对全仓跑静态门禁，因此会暴露 `main` 上**已有**的问题（如插件边界越界、双语哈希过期、包文件声明缺失）。它不在 CI 必跑列表里，判断本次改动是否引入新问题，要与干净 `origin/main` 的同一命令结果对比。

### 样例（走读）

| 场景 | 期望并集（示例） |
| --- | --- |
| 只改 `docs/contracts/*.md` | `git diff --check` + 链接抽查 |
| 只改 `plugins/omnimux-accounts` 非 UI 逻辑 | `pnpm --filter omnimux-accounts test` |
| 改 Stage/client JSX | `pnpm verify:stages`（+ 触及静态门）+ 隔离工作树功能路径浏览器证据 |

## 静态与测试证据

- 按上一节选出的最小命令集合执行，记录命令、退出码、真实用例数与 skip 数。代码变更但测试命令缺失、0 tests、失败或未声明 skip 均不能通过。
- `pnpm verify:stages` 证明静态 Stage/adapter 合同，不替代隔离工作树浏览器证据。实际 sidebar adapter 仍须覆盖 `getSnapshot`、`subscribe`、`open`、`close`、`set`、`readBox` 及会话隔离/关闭重开行为。
- 模型研究和参数合同只使用官方文档与离线 `pnpm verify:model-contracts`；不得发真实模型请求探测支持情况。
- 文档检查的实际能力边界见 [docs governance](docs-governance-standard.md)；没有执行的检查不得写进报告。

## 评审与验收结论

实施者完成自检后，由独立评审者核对实际 diff、测试证据、授权和未解决风险，满足合入前适用项后进入 required CI/MQ。适用界面任务拿不到**自身隔离 worktree 的功能路径真实浏览器证据**不得宣布交付完成；局部 Stage 证据不能冒充完整应用或任务装配。应用入口的无请求 legacy 只签无契约 smoke；自定义任务旅程须固定显式 request，只有受支持的任务插件、安装/实际加载观测与全部预期检查通过后才能提供相应 fresh/task 结果，不能拿有效失败封套签成功。`live` 真实图片/音频证据仅按实际授权与能力补充，视频生成真实验证需任务级特批。Dev 45120 是单例共享实例：Agent 不重启、不占用、不等待，仅在物化后冒烟或排障时只读使用。证据不完整为 FAIL，工具或环境不可用且无法安全修复为 BLOCKED，仅阻断受影响阶段。

`qa:pass`、合入方式与 R0–R3 权限统一遵循 [plugin-git-pr](plugin-git-pr.md)。
