# Spec · Hub 职责解耦与模板数据按需交付

版本：V4 规格与票面复核稿 · 2026-09-27
状态：用户已确认架构方向、相对固定干净基线至少缩减 20% 的客户端 UTF-8 字节目标及按 7 张纵向票拆分。测试 seams 是待逐票评审的提案，不视为已批准。仓库级隔离 Web 验收与证据入口由 `docs/contracts/plugin-qa.md` / `scripts/worktree-web-qa.mjs` 定义；本任务具体浏览器场景、可用夹具和发布包/体积报告命令尚须在票面明确，不能声称已全部核定。票面草案供用户复核；复核通过前不得发布或派发，实施仍须另行授权并遵守仓库交付流程。
授权范围：修订规格并提出票粒度；不删除业务代码、不发布/派发任务、不提交或部署。

## 一、目标与事实边界

### 1.1 目标

减少 Hub 浏览器初始脚本携带的全量创意模板数据，解除 Host 模板工具对浏览器展示模块的依赖，同时保持既有模板消费行为和活跃 Host Apps 服务。以职责、依赖方向、接口契约和可验证行为判断架构质量，不以目录大小、源码行数、生成文件或 vendor 体积直接判定冗余。

本期不宣称已完成“微内核化”。缩减脚本字节数不等于已证明启动变快；启动解析、交互就绪和构建耗时需要独立测量。

### 1.2 已核对事实

- 旧 Apps 客户端入口停挂，但 Host 的配置解析、目录刷新、标签持久化、HTTP 路由、安装路径选择及卸载标签清理仍在使用；独立 Apps 插件不构成已验证的等价接管。
- 当前浏览器产物使用 esbuild 单输出 CJS 加 ModuleLoader 包装。仅将内部静态 import 改成动态 import，不会产生独立数据分片；改成另一个源码模块也不能保证退出主包。
- 模板数据被 Host 工具、探索页、素材库和资产中心同步消费。外层函数声明为 async，不会自动等待被改成 Promise 的数据。
- 工作流发布仍引用旧 Apps URL。静态调用不能证明现有端到端成功，既有 manifest 路由归属与错误处理需要单独核验，不能把既有缺陷当作本期已修复事项。

### 1.3 观测记录，不作为已验收基线

2026-09-27 审查时进行了源码核对、内存构建与最小分片实验。采样期间存在其他任务提交，不能将工作区采样冒充固定提交的干净基线。

| 指标 | 字节数 | 口径 |
| --- | ---: | --- |
| 未包装客户端输出 | 4,248,939 | UTF-8，无压缩 |
| ModuleLoader 包装后输出 | 4,249,195 | UTF-8，无压缩 |
| 模板 JSON 在产物中的贡献 | 1,162,443 | esbuild metafile bytesInOutput |
| Session Guide 在产物中的贡献 | 2,383,351 | 包含模板 JSON，禁止重复扣减 |

旧 Apps 视图与标签模块未出现在该次客户端构建输入中。这只能证明它们没有贡献该次主包字节数，不能证明可以安全删除。

此前对话中的 3,100,000 字节绝对上限、400 KB 最终体积和“零延迟”均不是已批准目标。构建日志的字符串 length 也不是 UTF-8 字节数。

## 二、范围与不变量

### 2.1 本期拟覆盖

1. 建立 Host 本地模板数据接口，将完整模板数据与纯选择逻辑从浏览器展示职责中分离。
2. 为浏览器提供按需读取模板快照的适配接口，迁移所有受影响消费者。
3. 将共享本机请求校验原语与 Apps 业务职责解耦，保持现有安全语义并迁移测试。
4. 建立可重复的体积、资源交付及行为回归证据。

### 2.2 明确保留

- Apps 配置、目录存储、刷新、标签存储、现有读写路由、安装卸载依赖及 disposal 生命周期。不得称这些服务为“只读”，也不得顺带停止刷新。
- 现有模板 ID、appId 别名、featured apps 优先顺序、JSON 原始顺序、重复记录和首次匹配语义。不得借迁移擅自排序、去重、改写或删减数据。
- Host 搜索与详情的同步返回合同、已注册工具 ID、参数、摘要字段及默认值。同步不代表零耗时。
- 现有用户界面布局、可见文案、入口、登录门禁、设置、快捷指令及工作台分栏行为。

### 2.3 不在本期

- 整体删除 Apps 目录、存储或 HTTP 服务，迁移 Apps 持久化格式，改写工作流发布链路。
- 删除停挂的旧客户端视图：另行证明仓内引用、运行时入口、测试和兼容依赖均已处理后，才可提出独立清理范围；不计入本期体积收益。
- 改造 ModuleLoader、切换 ESM 分片、拆为独立安装插件、引入远程模板服务或后台预取全部模板。
- 新增分页产品体验、模板编辑或搜索语义变更，以及修复无关既有缺陷。

## 三、已确认设计与接口合同

### 3.1 模块边界

数据模块拥有发布包内的完整模板记录与纯选择逻辑，不依赖 React、DOM 或浏览器服务。Host 工具与 HTTP 适配器依赖数据模块；浏览器展示模块依赖轻量 featured 配置及异步快照适配器，不能反向导入完整数据。

保持现有 CJS 交付方式。推荐“Host 包内本地数据 + 同一 Host 只读 HTTP 快照”，不采用未经验证的动态 import 分片。新用户仅需正常安装发布包并运行既有 Host；不得依赖开发机目录、外部软链数据或额外账号。Host/数据不可用必须显式报错，不得伪装成空列表。

### 3.2 Host 同步接口

- 搜索继续接受 category、platform、query、limit；保持现有大小写归一和匹配行为。limit 默认 10，有限数字取整并限制在 1–50；total 是截断前匹配总数，items 为截断后摘要。
- 详情继续返回对象或 null；按现有 id 或 appId 首次匹配，不新增 Promise，不改变默认字段值。
- 分类与货架选择保留现有精确分类匹配和 limit 语义，不得用 Host 搜索的模糊匹配替代浏览器分类行为。
- 用迁移前后相同 fixture 的输出比对验证合同，不靠导出名称相同证明兼容。

### 3.3 浏览器快照传输

建议新增 GET `/omnimux/templates/creative`，作为协议标识而非磁盘路径。

成功响应：`{ schemaVersion: 1, dataVersion: string, items: Array<Record> }`。items 仅包含当前 JSON 的完整原始记录；不重复包含 featured apps，不投影为摘要。dataVersion 是这些有序记录确定性序列化内容的 SHA-256 摘要；相同内容稳定，不使用时间戳。确定性输入字节定义为发布包中 UTF-8 JSON 文件的原始字节，不经解析后重序列化；dataVersion 使用小写十六进制 SHA-256。数据文件缺失或无法读取才属于不可用；有效 JSON 数组即使为空也返回 200，包含 `items: []` 及其摘要。

传输层保持原始记录。Host 与客户端构造消费列表时复用既有规范化规则：JSON 记录按 `{ ...tpl, isApp: false, type: tpl.type || 'template' }` 构造；该规范化不改变 HTTP 原始快照或其 dataVersion 摘要。

本期刻意不做分页、分类参数、关键词参数或详情 HTTP 端点：首次需要完整创意模板的消费者才请求一个完整快照，之后在内存中使用既有纯选择器。featured apps 仍使用轻量本地列表，合并顺序为 featured 在前、快照在后；不增加新去重规则。未来若改为分页/摘要接口，必须另行定义 total、游标稳定性、详情补全和跨页排序合同。

- JSON 内容类型；响应 `Cache-Control: no-store`，只使用浏览器会话内存缓存，避免跨版本磁盘缓存。
- 包内数据不可用返回 503，固定错误码 `templates-unavailable`；其余内部错误返回 500，不泄露本地路径或堆栈。失败响应不使用成功 envelope。
- 非 GET 请求不产生副作用，返回 405；不开放跨域读取、不新增对外监听或匿名访问旁路。新路由继承既有 Host 访问控制，测试跨站访问不能绕过宿主边界。
- 路由随插件注册与卸载，卸载后注销；不新增长期刷新计时器或远程网络依赖。
- 完整数据必须进入发布包。验证对象是解包后的安装产物，不是仅在源码工作区可读取。

### 3.4 浏览器异步适配器

建议接口 `loadCreativeTemplates({ signal } = {}) -> Promise<ReadonlyArray<Record>>`，返回合并 featured 后的完整列表。不得把旧同步数组导出直接替换为 Promise 并保留调用方不动。

- 首次请求必须由需要创意模板数据的展示/操作路径触发；只显示 featured apps 时不拉取 JSON。若该展示路径本身是默认首页，需要明确记录首屏确实发生请求，不得宣称首屏总传输减少。
- 单个插件实例最多缓存一个成功快照、最多共享一个进行中请求。不引入 LRU、多版本缓存或自动重试队列。
- 并发调用共享底层请求；单个调用者取消使自己的 Promise 以 AbortError 拒绝，不取消其他调用者，界面不得将取消呈现为业务错误；传入已取消 signal 时立即以 AbortError 拒绝且不发请求。
- 所有调用者取消或插件卸载时中止底层请求，该请求不再接纳新调用者。立即重入属于新请求代次；旧请求的完成、失败或 finally 清理均不得影响新代次缓存与进行中状态。已取消调用者不接收后续成功或业务错误状态更新。
- 网络、HTTP、JSON 解析、schema 校验失败均拒绝 Promise 并清除进行中状态；不缓存失败，不自动重试。下一次显式调用允许重试。
- 校验 schemaVersion、dataVersion 格式、items 数组及记录基础结构；未知业务字段原样保留。未知 schemaVersion 明确失败，不静默转换。
- 插件卸载清除缓存，后到达的旧响应不得写回；组件卸载和切换上下文使用 signal 或请求代次避免陈旧结果覆盖。
- 既有探索页分类缓存只作为派生缓存；必须绑定快照版本，并在快照失效、重新加载及卸载时失效，不得与网络缓存形成互相独立的真源。

### 3.5 消费者迁移与界面边界

逐项覆盖探索页分类/货架/详情、素材库加载、资产中心加载和 Host 工具。异步消费者必须 await 后再执行 Array.isArray、slice、map 或选择器；加载态、真实空结果和失败态不可混淆。

本规格只定义状态语义，不批准新 UI 元素或逐字文案。实现前由产品经理核定受影响界面的 PRD、原型、文案白名单与规格/计划，优先复用已有加载和失败组件；缺少合适状态时不得由开发自行添加文案。前端遵循项目设计规范，并在完成后取得 PM_SIGN_OFF。

## 四、安全原语迁移合同

共享校验可调整归属，但必须保留缺失 Origin/Referer 时的现有处理、本机 hostname 白名单、cross-site 拒绝规则、Referer 回退、非法 URL 处理、请求头大小写及数组兼容。它不是严格同源比较；本期不顺带加强或放宽策略。

迁移实现时一并迁移测试，并保留旧导入位置的兼容转导出；在独立确认所有消费者及外部兼容要求前，不删除转导出。测试覆盖 localhost、IPv4、IPv6、恶意/非法 Origin、缺失头、Referer 回退和数组头。保留职责的测试不能随目录清理删除；已退役视图测试的撤销须单独说明。

## 五、成功标准与测试 seams（目标预算已确认；seams 待逐票确认）

### 5.1 体积与交付

实施前固定干净基线提交、Node/pnpm/esbuild 版本、依赖锁定状态和构建选项；在相同环境比较改动前后。记录原始输出和 ModuleLoader 包装后 UTF-8 字节数，压缩体积另列，不使用字符串 length 代替字节数。

已批准预算：包装后客户端 UTF-8 字节数相对本任务固定、干净基线至少下降 20%，且主包及初始执行依赖图不再携带完整模板 JSON。该百分比是验收目标，不是已测得收益；绝对字节数须由 T0 基线实测锁定。3.1 MB 不设为硬门槛；若方案达不到 20%，应暂停后续发布并提交证据复审，不得删功能或放宽预算制造通过。

同时记录模板首次请求的响应字节数、请求时机和触发它的首屏/操作；禁止通过挪到首屏 HTTP 请求后只报 JS 缩减来宣称总首屏性能改善。未做性能对照时只报告字节变化。

### 5.2 测试 seam 与验收矩阵

| Seam | 必须验证 | 证据类型 |
| --- | --- | --- |
| 纯数据/同步工具 | 搜索默认值、筛选、摘要、总数、limit 边界、详情 null、id/appId、顺序及重复语义 | Node fixture 和新旧输出对照 |
| HTTP/生命周期 | 成功 envelope、版本稳定性、503/500/405、访问边界、注册卸载、无写入副作用 | Host 路由集成测试 |
| fetch/内存缓存/取消 | 首次按需、共享请求、局部取消、全部取消、失败后重试、卸载及陈旧响应丢弃、未知 schema | 可控 fetch 与取消信号测试 |
| 浏览器消费者 | 探索页分类/货架/详情、素材库、资产中心均能加载；加载/空/失败区分；重入及快速切换无旧结果覆盖 | 真实浏览器行为测试 |
| 保留的 Apps/安全 | 配置、目录刷新、标签操作、bundled 安装选择、卸载只清目标标签、校验行为不变 | Node 与 Host 集成回归 |
| 包分发/初始依赖 | 发布包含数据、解包后可读取、主包无完整 JSON、响应与本地同版本数据一致 | 构建 metafile 与安装产物测试 |
| 邻接行为 | 登录门禁、设置、快捷指令、工作台分栏无新增回退 | 受影响路径浏览器回归 |

工作流发布的旧 manifest 路由与错误吞并疑点先做基线记录；本期必须保持旧路由和持久化依赖，不得宣称既有发布链路已修好。若阻碍验收，单列缺陷并由用户确认处理范围，不能隐式扩项或忽略。

### 5.3 可执行性门禁

已有 Node 测试和构建命令见工程附件。源码正则测试即使名称含 e2e，也只算静态检查；默认 Node 测试发现不覆盖外层 E2E 目录内的 mjs 文件。

仓库级真实浏览器验收能力和身份约束已由 `docs/contracts/plugin-qa.md` 定义，`pnpm test:worktree-web` 使用动态端口、自清理并产出 PNG/结构化报告；该入口是通用运行器，不等同于本功能的业务场景验收。各票须给出可执行的本任务具体浏览器入口/夹具/断言；T0/T6 须核实发布包解包验证和体积报告命令，并将命令与本次源码 SHA、依赖锁定和环境记录绑定。未完成这些票面定义前，不得声称本规格已有全套可执行验收。不得用占位命令、测试文件名或“相关测试通过”代替证据。

## 六、边界、风险与批准条件

始终执行：保留活跃合同、先记录基线、迁移测试、检查新用户发布包路径、如实区分静态证据与运行证据。

先取得确认：任何新增 UI 状态及文案、新增依赖、宿主访问控制变更、Apps 数据迁移、超出本期的缺陷修复。架构方向、HTTP 快照方案、7 张纵向票粒度及相对固定干净基线至少缩减 20% 的预算已确认；测试 seams 仍是待逐票评审提案，不自动视为获批。

绝不执行：按行数判死代码；整目录删除活跃服务；用动态 import 字样证明分片；失败回退为空数组；通过删测试或改预算制造通过；依赖仅开发机存在的数据；未经授权拆票、实现或部署。

主要取舍：完整快照降低接口和兼容成本，但首次进入模板内容仍需传输完整 JSON；本期优化是初始脚本职责与数据交付时机，而非全量数据大小。若产品要求分页或更低首次模板可用延迟，应另行评估，不在实现中偷偷增加复杂缓存与分页系统。

已确认的决策：保留 Host Apps、暂不删旧视图；采用完整快照而非分页/ESM 分片；按相对固定干净基线至少缩减 20% 的客户端 UTF-8 字节数作为预算；按七张纵向票拆分。测试 seams 仍须逐票复核，不能由本规格或票草案自动批准。

实施前置条件：T0 固定基线并核实体积与发布包验证入口；各票补齐本任务可执行测试命令、夹具和断言；涉及 UI 的票先取得产品经理核定的 PRD、原型、文案白名单、Spec/Plan 与设计规范。以上内容未完成前，对应票不得进入实施。票草案仅供复核；未获用户确认前不得发布或派发，实施仍须另行授权。

---

## 工程附件（非规格正文）：源码证据与验证入口

### A. 源码职责定位

- [Host 配置](../plugins/omnimux/src/config.js)、[Host 初始化](../plugins/omnimux/src/host/apply.js)、[HTTP 挂载](../plugins/omnimux/src/host/http.js)：活跃 Apps 服务及生命周期。
- [插件安装卸载](../plugins/omnimux/src/plugins/http-routes.js)、[旧 Apps 路由](../plugins/omnimux/src/apps/http-routes.js)、[独立 Apps 路由](../plugins/omnimux-apps/src/host/routes.ts)：不可默认等价替换。
- [工作流发布调用](../plugins/omnimux-workflow/src/canvas/editor/components/publish/PublishWizardModal.tsx)：旧 URL 调用与基线疑点。
- [模板数据/选择器](../plugins/omnimux/src/client/session-guide/templates/templates-data.js)、[模板 JSON](../plugins/omnimux/src/client/session-guide/templates/creative-templates.json)、[Host 工具](../plugins/omnimux/src/templates/tools.js)：同步数据与输出合同。
- [探索页](../plugins/omnimux/src/client/session-guide/templates/ExploreTemplatesSection.jsx)、[素材库](../plugins/omnimux/src/client/composer-add/library-stage-model.js)、[资产中心](../plugins/omnimux/src/client/workbench/asset-hub-data.js)：客户端迁移对象。
- [安全原语](../plugins/omnimux/src/apps/origin.js)、[安全测试](../plugins/omnimux/src/apps/origin.test.js)：实现与测试一起迁移。
- [构建脚本](../plugins/omnimux/scripts/build-client.mjs)、[包清单](../plugins/omnimux/package.json)、[测试运行器](../plugins/omnimux/scripts/run-tests.mjs)：CJS、发布资源和测试发现边界。

### B. 已确认命令（从仓库根目录执行，仅供后续验证）

```sh
corepack pnpm --filter omnimux run build
corepack pnpm --filter omnimux test
node --input-type=module -e "import { statSync } from 'node:fs'; console.log(statSync('plugins/omnimux/lib/client.js').size)"
```

上述体积命令只测当前磁盘产物，必须紧跟成功构建并绑定源码身份，不能拿旧产物当新构建证据。不要从仓库根目录直接运行插件测试脚本；其发现逻辑（`plugins/omnimux/scripts/run-tests.mjs`）以 `plugins/omnimux` 为 cwd 只收集 `src/**/*.test.{js,ts}`，`tests/e2e/*.e2e.test.mjs` 不被收集。

已核实的验收入口（T0 锁定后作为票面命令）：

- 打包/解包：在 `plugins/omnimux` 目录 `npm pack`（触发 `prepare` → `npm run build`，产物受 `files` 白名单约束）→ `tar -xzf <tgz> -C <临时目录>` → 读 `package/src/client/session-guide/templates/creative-templates.json` 计算 SHA-256。
- 完整应用浏览器验收：`pnpm verify:app`（`scripts/worktree-app-qa.mjs`，只接受 `<repo>/.worktrees/<task>` 直接子级，动态端口、自清理，证据落 `.workbuddy/evidence/app-qa/<runId>/` 与 `docs/evidence/worktree-app-qa-report.json`）。`pnpm test:worktree-web` 是 Stage 夹具，不替代它。
- 当前 `plugins/omnimux/scripts/build-client.mjs` 未开启 `metafile`；模板 JSON 在主包输入中的零断言依赖 T0 提供 metafile 或等价依赖图产出。

本期沿用 JavaScript ESM、现有具名导出和 Node 测试风格，不引入框架或格式化全仓。真实同步 API 形态为 `queryCreativeTemplates({ category, platform, query, limit = 10 } = {})`；异步边界显式使用 await，不混淆两者。

### C. 当前证据状态

V1 技术复审已完成；V4 为此次文档修订产物。此前内存构建与最小机制实验不是业务回归。业务实现、完整单测、真实浏览器 E2E、发布包验收、OCR 代码审查及 PM_SIGN_OFF 均未执行；不因文档落盘改记为通过。
