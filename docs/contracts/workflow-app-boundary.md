---
title: "画布插件与 AI 应用插件职责边界与协作契约"
id: "contract-workflow-app-boundary"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-08"
updated: "2026-09-09"
authors: ["Gao", "agent-architect"]
subsystem: "omnimux-workflow"
tags: ["workflow", "apps", "boundary", "manifest", "headless"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/ai-app-ui-spec.md"
  - "docs/contracts/node-input-submission.md"
  - "docs/contracts/apps-catalog.md"
  - "docs/contracts/hub.md"
---

# Canvas / AI 应用协作契约

## 1. 范围与状态

本文是目标契约，不是运行 API 手册。代码证据固定在旧任务树 `omnimux-dsh-wt-contracts` 的 `a1ecf7bddc110992d870efd3b4e56511dfe43c9e`；审计基线为 `e416238631cc78ef8caeab7b5313d9571947ef5a`。本次只将已审计文档融合到 main 基线，不合入旧树的原型代码，不做 App 物化或部署。

此前 Production Ready、零缺陷、端到端闭环、Apps 持久化、CI 已接入、11 组对抗测试、完整团队 TDD 的宣称全部撤回。前序审计的 4 个 Apps 单测与 1 个 mock seam 单测、弱静态扫描通过，仅证明有限隔离行为，不是 E2E。本轮未重跑行为测试。实现与验收缺口见第 7 节，不能以本文规范覆盖这些事实。

产品目标由 [AI 应用 UI 规范](ai-app-ui-spec.md) 维护：唯一「AI 应用」入口，视频/图片/音频三类（全部仅为过滤），选应用收起二级栏且可重开；compact tabs 后单个左右大卡片，左表单右历史/示例。空历史默认示例但历史仍为零；发布者自主上传/选择多图、多视频、音频、封面及 Demo 输入快照。排除 agent 第四类、计费/退款/算力展示、评分、VS SYNC/wipe、冗余回填动作及工作流源链接。媒体按自身比例呈现，不强制全媒体 9:16。

## 2. 所有权与复用边界

| 所有者 | 负责 | 不负责 |
| --- | --- | --- |
| Canvas `omnimux-workflow` | DAG 调度、执行准备、有效输入、节点执行与执行状态权威；经现有项目资产能力处理产物 | Hub 凭证/provider HTTP/模型路由、Apps 私有存储 |
| Hub `omnimux` | 凭证、provider HTTP、模型路由、宿主接入及既有共享事件通道 | DAG 调度器、Apps 发布版本与任务投影存储 |
| Apps `omnimux-apps` | 应用注册/版本与域存储、表单/schema/UI 发布规范、Demo、执行发起与结果投影 | DAG 解析、依赖调度、节点重试编排、provider 客户端 |
| 既有资产域 | 受管媒体身份、文件解析、访问控制、入库与谱系 | Apps 任务成功判定 |

遵循 [Hub](hub.md)、[节点输入](node-input-submission.md)、[项目资产](project-assets-contract.md)。域间只消费公开契约，不导入另一插件私有实现或读写私库。Hub 的 [Apps catalog](apps-catalog.md) 是插件安装货架，不是工作流发布 Registry；不得复用其 `/omnimux/apps` 读视图作为 AI 应用发布写 API。

沿用现有 TypeScript/React、宿主 primitives 与 CSS Token，不引入新调度器、数据库服务或测试平台。处理中视觉优先使用已有公开共享组件；若画布视觉尚无公开导出，须在后续授权实现中建立最小共享展示边界并验证，不能导入画布私有 CSS/组件或用同名 class 冒充复用。几何例外只按 UI 规范，尤其 `448 - 2 - 48 = 398px`，不修改 design 总规范。

## 3. 发布数据与校验目标

本节定义必须满足的语义，不发布新的可调用 TypeScript/HTTP 接口。现有 `ApplicationManifest` 名称不代表完整 Draft-07 支持；`version` 是应用版本，不可兼任 schema 方言版本。后续实现须由 Apps 在公开契约出口统一 runtime validator 与类型，Canvas 向导消费同一份契约，不能继续复制 `any` 版本。

| 数据 | 必须表达与校验 |
| --- | --- |
| 应用身份 | 稳定 appId、应用精确版本、独立 schema 版本；分类只含 video/image/audio，SVG 图标与宿主语义 Token |
| 工作流绑定 | 已验证的工作流身份及可复现修订；由 Canvas 解析/确认，不接受发布者自行填写版本字符串作为证明 |
| 表单 | object 根、字段名、类型、必填、标签、顺序、默认值、枚举与范围；未知字段和不支持关键字拒绝，不忽略 |
| 字段映射 | 显式记录每个表单键对应的节点 ID、允许写入的输入字段或槽位、类型、媒体角色与顺序；绑定必须唯一且目标存在 |
| 展示配置 | comparison（并排）/carousel/gallery；有序多媒体引用、可选封面及真实元信息；不包含 wipe、评分或计费 |
| Demo | 独立 preset 身份、有序媒体/封面引用、完整输入快照、所属应用与工作流修订；不复用 Task 类型伪造状态/时间 |
| 任务关联 | 当前授权主体、应用版本、执行 ID、固定输入快照、状态投影与资产引用；执行状态真源仍为 Canvas |

### 3.1 Schema 与控件

目标采用明确受限的 JSON Schema Draft-07 子集，而非声称支持完整方言。首个可执行子集覆盖 `type`、`properties`、`required`、`additionalProperties: false`、`default`、`enum`、`minimum/maximum`、`minLength/maxLength/pattern` 以及数组 `items/minItems/maxItems`；对象递归使用同一子集。未支持的组合关键字和远程 `$ref` 阻止发布，不静默降级。数值控件须保留 number、布尔控件保留 boolean；不能把全部字段转为 string。默认值仅可来自已发布且通过校验的配置，必填输入缺失不得执行时凭空补值。

九种 UI widget 保留：`media-extractor`、`media-uploader`、`input-text`、`textarea`、`select-single`、`select-grid-pair`、`ratio-cards`、`slider-range`、`switch-boolean`。控件选项必须与字段类型兼容；双列下拉只是布局，分别引用两个真实字段，不能生成未声明第三个值；双游标范围须使用明确的数值数组及长度约束，不能假装是标量。媒体控件输出受管资产引用，不把 File、blob URL 或缩略图当可执行输入。解析/上传能力未连接时显示不可用，不制造成功。

### 3.2 三步发布

1. 基础画像：选择允许暴露的工作流输入与应用分类，Canvas 确认源修订。不得通过扫描任意节点并猜测 `paramKey/fieldKey/id` 生成执行绑定。
2. 字段映射：保留类型、约束及明确节点/槽位绑定，配置控件、顺序、示例；校验所有必填键与双列关联。
3. 素材与 Demo：发布者上传或选择多媒体与封面，排序并配置展示，保存对应输入快照。选取不是填一条任意 URL，数量/文件约束来自已验证能力，不人为新增 1–3 条限制。

前端预检、Host 发布校验、Host 提交校验使用相同契约；Host 不能信任 UI 已校验。默认值、枚举、Demo 输入快照、映射目标、资产可用性或版本任一不合法，整份发布失败且返回字段位置和可理解原因。发布后必须读回相同版本、媒体及快照才能显示发布成功。

## 4. 执行与版本：fail closed

### 4.1 执行准备

Apps 只传应用身份、精确版本及通过 schema 的输入。Host 从授权上下文解析主体，读取已发布记录，核对映射和资产访问权，再请求 Canvas 执行；不能信任客户端传入的 DAG、provider 密钥、任意字段路径或 caller 身份。

Canvas 必须复用 `executionRoutes.ts` 已有的准备语义：图/版本解析、`prepareExecutionSlotGraph`、`resolveExecutionSubgraph`、`findExecutionReadinessFailure`、项目绑定、异步准备后的版本复查和 `buildInitialOutputs`，再进入现有 `ExecutionManager.createExecution`。共享逻辑应在 Canvas 内收敛，而不是在 Apps 或 Headless 中复制一套简化调度。

输入遵循节点合同：上游选定结果与本地补充要求共同保留；Slot 角色/顺序、初始输出及素材身份可追溯；未就绪依赖不得静默丢弃，未入槽供给不得混入请求。提交时固定内容快照，后续编辑不改变在途任务。

找不到图、读取失败、映射缺失/重复、类型错误、必填缺失、版本不一致、缺执行能力或资产不可用，都必须在创建执行前拒绝。禁止吞错后切换模板、空图 mock 成功、忽略旧键、默认 fallback 补新必填、暗中改模型或版本。显式 fixture 仅用于隔离测试，不能进入真实任务历史。

### 4.2 精确版本

应用版本、Canvas workspace 数值修订和展示用 semver 是不同概念。当前 workspace 的 `expectedVersion` 冲突检测不等于已存在不可变历史版本仓库。

发布记录必须绑定 Canvas 可验证的不可变快照/修订及其内容身份；生成和验证该身份由 Host/Canvas 完成，不能由浏览器伪造。若旧修订无法解析或当前实现仅能读取最新 workspace，提交必须拒绝并提示重新发布，不能冒称执行了旧版本。修改图、输入契约或默认值产生新应用版本；同一 appId@version 不得覆盖不同内容。旧记录只能经显式、可审计转换生成新版本，不采用自动兼容猜测。

## 5. 现有接线与目标操作边界

以下“存在”只指固定 SHA 的源码；并不证明构建、宿主挂载或可以从浏览器调用。

| 接线 | 已验证源码事实 | 限制 |
| --- | --- | --- |
| Canvas seam | `plugins/omnimux-workflow/src/workflow/index.ts:134–145` 尝试 `provide('omnimux-workflow', headlessSeam)` 并直接赋 ctx 属性；Headless 定义 executeHeadless/cancelJob/getJobStatus | 生命周期与跨插件可达性需宿主验证；执行准备不完整 |
| Apps Host | `plugins/omnimux-apps/src/host/index.ts:208–257` 直接赋 `ctx['omnimux-apps']`，含 registerApp/getApp/listApps/submitTask | 不是已验证的 `ctx.provide` 注册；无 Apps HTTP 注册、完整输入校验或状态同步 |
| Canvas HTTP | `executionRoutes.ts:49–52` 在 workspace 作用域定义执行集合、详情、控制及 events 路由 | Headless 返回的 streamUrl 缺 workspace 段，不能作为有效 URL 文档化 |
| Apps 前端 bridge | `workflowBridge.ts` 读取 Canvas seam，并声明单独 EventSource 消费 task:* | 未与真实消费 UI 打通；与 Canvas event 名称及 Hub 事件边界不符 |

删除旧草案中的 Apps publish/submit/stream/cancel 路径和可调用 Context 伪代码。后续需在既有 Host 注册模式下落地以下**逻辑操作（非现有 API 名称或路由）**，注册完成并验证前不得向用户暴露为可用：

| 逻辑操作 | 输入/输出与拒绝条件 |
| --- | --- |
| 初始化/查询 | 按主体与应用版本读取持久化发布记录、Demo 和任务投影；坏数据报告错误，不回填内存样例 |
| 创建/更新发布 | 完整发布数据及预期修订；新版本写入后读回；重复同内容可识别，冲突内容拒绝 |
| 发起执行 | 精确应用版本与输入；返回真实 executionId 及已确认状态；不接受 guessed streamUrl |
| 查询状态 | 校验主体/应用/执行归属；按 Canvas 快照返回状态与经校验产物，未知/不可达不冒充 queued/completed |
| 取消 | 向 Canvas 请求，返回实际接受/拒绝结果；请求已接收不等于终态已取消 |
| 删除历史/下架 | 仅操作 Apps 域记录或可见性并反馈持久化结果；不隐式取消执行、删除原文件或跨域 GC；下架不篡改历史版本 |

新写入必须遵循既有本地写保护与授权模型；查询、订阅、取消及删除都验证归属。请求/响应失败包含稳定错误类别、字段位置（适用时）及可理解信息，不能泄露凭证、私有路径或内部提示词。具体 wire 名称、公开类型出口及错误码在注册与适配实现时确定并补源码证据，本文不猜测。

## 6. 事件、状态、产物与恢复

- Canvas 当前发出 `execution_start / execution_complete / execution_error / execution_cancelled` 等事件；Apps 声明的 `task:completed` 等不是可直接消费的同一协议。不得用字符串改名代替校验事件载荷。
- Apps 客户端复用 [Hub 共享事件通道](hub.md) 与既有连接，不新增私有 EventSource/WebSocket。后续适配应把执行 ID、应用/主体关联及版本信息投影为域通知；通知触发权威状态对账，不把通知本身当可靠任务账本。Hub 不存 Apps 私有任务表。
- 当前 Canvas SSE 只有 event/data、重连提示和内存 replay 参数，没有 event id / Last-Event-ID 协议；不承诺 120 秒重放或无损恢复。即便 Hub 包络有 id，也必须独立验证 Canvas→Apps 映射、去重及断档行为，不能继承另一通道的保证。
- 查询快照是恢复依据。重复、乱序、断连、通知缺失、未知事件/状态时，标记待同步并对账；不能将 paused/未知默认映射 queued。最终状态不能被较旧通知回退。状态投影未打通前，应显示不可用，不本地计时假成功。
- Canvas `mediaAssets` 实际是按 nodeId 分组的数组。适配须按发布定义的输出集合取值，逐数组展开并保留 nodeId、资产身份、类型及顺序；不能将数组当单资产，也不能把全部中间产物当应用结果。合法空结果与适配失败必须区分。
- Apps 成功展示需同时具有 Canvas 完成依据和满足应用输出要求的可用资产；视频/音频须可播放、图片可检视。产物持久化身份是受管资产 ID/项目相对路径，预览 URL 按资产合同解析；URL 字符串或 tmp 文件存在不能证明持久化。
- Apps 自有存储至少保留发布版本、Demo、输入快照和 executionId 关联。复用既有域内文件存储模式与原子写策略，不新建数据库服务；具体文件布局、并发控制、崩溃恢复与读回仍待实现验证。写失败不能返回发布成功。执行接受但关联写失败时必须报告不确定状态并对账，禁止自动重提造成重复执行；幂等机制须有端到端证据后才可承诺。
- Canvas 有执行记录持久化与 recovery 代码，不等于 Apps 已支持重启恢复。读回记录、恢复监听、恢复执行是三件不同的事；Host 崩溃期间外部模型是否继续运行、如何避免重复调用仍需验证。不承诺自动恢复每个任务。
- 取消沿用 Canvas 控制和 Hub signal 传播。provider 不支持撤销时只报告实际能力；不能承诺立即停止远端模型、释放 GPU 或退款。完成/取消竞态以后端确认终态为准，不能先在 UI 标记已取消。

## 7. 已验证实现状态与 QA 缺口

本节和前文“当前”源码事实均限定为固定目标 SHA，不是 main 的现状声明。路径均相对该 SHA 的仓库根，仅作纯文本历史证据，不要求 main 存在这些文件。后续实现变化须重新核验。下表短文件名的完整历史路径为：

- `publishTypes.ts`：`plugins/omnimux-workflow/src/canvas/editor/components/publish/publishTypes.ts`。
- `workflowBridge.ts`：`plugins/omnimux-apps/src/shared/workflowBridge.ts`。
- `ExecutionContext.ts`、`ExecutionSSE.ts`：位于 `plugins/omnimux-workflow/src/workflow/execution/`。
- `executionRoutes.ts`：`plugins/omnimux-workflow/src/workflow/routes/executionRoutes.ts`。

| 证据 | 固定 SHA 现状 | 必需验收（均未完成） |
| --- | --- | --- |
| `plugins/omnimux-apps/src/client/index.tsx:118–228,249–281,458–492` | 忽略 manifest、硬编码字段，空历史用 sampleTasks，4 秒 mock 完成 | 三类 schema 配置、真实输入校验、历史隔离、无假成功 |
| `plugins/omnimux-workflow/src/canvas/editor/components/publish/PublishWizardModal.tsx:44–55,93–149` 与 `publishTypes.ts` | 向导未挂载；schema 全 string，复制 any 类型，版本常量、默认媒体 URL；缺上传/选择器 | 真入口三步发布、类型与映射、版本核验、多媒体/封面/快照读回 |
| `plugins/omnimux-apps/src/shared/manifest.ts:164–178` | 仅弱结构判断，仍要求 creditCost；类型保留 agent/wipe/评分且 Demo 缺 audio | 递归白名单 schema、跨字段与 Demo 校验；移除已排除字段 |
| `plugins/omnimux-apps/src/host/index.ts:160–257` | Map Registry，注册覆盖同版本；任务只记录初态 | 域持久化、不可变版本、归属检查、任务状态对账 |
| `plugins/omnimux-workflow/src/workflow/execution/HeadlessExecutionSeam.ts:58–108` | 忽略 workflowVersion、吞错 fallback 空图、猜字段写 value/paramValue、绕过执行准备 | 拒绝路径无 createExecution/provider 调用；有效输入与 Canvas 请求一致 |
| 同上 `:129–142`，`ExecutionContext.ts:187` | 按节点数组被当作单对象映射；未知状态回退 queued | 多节点多产物、顺序/角色/身份与未知状态适配 |
| `workflowBridge.ts:83–134`、`ExecutionSSE.ts:23–35,107–112`、`executionRoutes.ts:49–52` | 事件名不兼容、无 event id、返回 URL 不匹配路由 | Hub 单连接适配、重复/乱序/断档对账、取消竞态；无无损重放保证 |
| `scripts/verify-ai-app-spec.mjs`、根 `package.json`、`.github/` | 独立文本脚本，未发现该脚本 CI 调用链；仍检测白底黑字裸色、全局 9:16 及 shimmer 类名，与新目标不一致 | 后续先修正过时断言，再接入既有检查并提供 workflow 调用及 run；不得用旧脚本约束文档退回错误要求 |

前序 `pnpm test:gates` 结果由主理人提供：124 pass / 4 fail / 1 cancel，涉及 pnpm 下载受限及超时；该历史结果不代表本次 main 基线检查。当前文档交付须另行记录 diff、链接、声明一致性与适用 gates 的实际结果。全审计区间既有 `plugins/omnimux-apps/src/client/style.css:41` 空白属于旧树代码，本次不合入或修复。

本次纯文档按用户授权跳过 L2，无 App 物化，不声明运行通过。后续实现验收复用现有单测/请求捕获和 [plugin QA](plugin-qa.md)：合入前自动化/静态及独立评审，合入后按需 Dev、ego-browser、shared verify:live，绑定实际构建 SHA。至少证明合法输入携带完整内容、拒绝输入未执行、真实发布后读回、可播放产物、刷新/重启/断连后的状态真伪、取消竞态。测试通过、代码完成、合并、Dev 物化与运行验收分别报告，不新造测试平台。
