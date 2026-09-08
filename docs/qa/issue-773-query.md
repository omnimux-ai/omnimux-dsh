# #773/#774 T02 离线查询基础独立 QA 报告

## 结论与路由

**IS_PASS: NO（仅本次 T02 离线查询基础增量）。Route: Engineer，经主理人中转。**

- 独立执行：80 tests / 4 suites，78 passed / 2 failed / 0 cancelled / 0 skipped / 0 todo，Node test exit 1。
- 工程既有用例：57/57（query 18、aggregate 13、catalog 7、picker 19）。新增独立 QA：23 项，21 passed、2 failed。
- 两项失败是实现的输入/身份保护问题，断言对应受控推荐及规范身份要求；不通过修改断言消除失败。
- 定向 strict 编译最终 exit 0；全包 typecheck exit 2，Host 三个依赖无法解析，不是全包 PASS。
- 仅执行了一次运行时测试批次；此前 QA 测试编译出现 TS2339，由 QA 修正 union narrowing 后通过。没有重复跑相同失败，没有第三轮。源码修复后的回归尚未执行。
- 完整 T02（真实库存/adapter）、工坊完整功能、Host/API/UI、生命周期、L2/Dev/Prod、合入/发布仍未通过或未执行。它们不属于本次 query 增量失败原因。

## 1. 身份、完整输入和改动边界

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773`。
- branch：`agent/market-skill-workshop-issue-773`。
- base = HEAD = `580234923268673562cacb5cd01aebdb780339e1`；target = 该 HEAD 上指定九文件的未提交内容。用户指定本地 diff，因此没有 fetch，不声称评审远端最新 tip。
- 已全文读取工程报告 `docs/implementation/issue-773-query.md`、PRD v0.2.0（906行）、architecture（含并行文档修订后读取到的750行版本）、acceptance（168行）、独立类图与时序图。已读取实际五个 tracked diff 与四个新增文件全文，补读 query 依赖的旧 aggregate、SkillShelf、catalog parser、API mapSkill 与包命令。
- 规格重点：PRD §6/§10/§13.2、AC-05–11/14–23/27/49；architecture §3.1/§4.1；acceptance COMPAT-01/DATA-01。规格中的 UI/lifecycle 只作范围判断，不把未接线当离线函数失败。
- 本次唯一持久测试/报告输出：`plugins/omnimux-market/src/tests/workshop-query.qa.test.ts` 和本文。没有修改源码、规格、工程/其他 QA 报告；没有安装依赖、改锁文件/profile、访问真实库存、提交或推送。
- 编译使用任务树临时 `.query-qa-check`，回归结束后仅清理该 QA 自建目录；未写受跟踪 lib。既有 catalog tests 按原入口在 `os.tmpdir()` 创建隔离 fixture，没有使用真实用户库存；本次新增测试全部内存 fixture、无 IO/网络/模型。

### 九文件目标 SHA-256

| 文件（相对任务树） | SHA-256 |
|---|---|
| plugins/omnimux-market/src/workshop-query.ts | 921a15417474fb4be27b9b1c8560d005c1150ce1365d3a3f2b009200cdbb545d |
| plugins/omnimux-market/src/workshop-query-budget.ts | 957bcfe1d5e49e3ea2894c0aa5a391b4f25f420357fc8454d0954d2e783d442c |
| plugins/omnimux-market/src/types.ts | 8e618ab6ba5fc22dd2d8e5914ed3459ad498bd7f7a9b2bf1a4c809fa86205fc0 |
| plugins/omnimux-market/src/expert/catalog.js | bb971a5b15438002b9e52b44a2b0f548372e87ee8e3ca182c96775c8db7758db |
| plugins/omnimux-market/src/expert/catalog.test.js | 4a2536c9fbb1ddbf43161e51ca5dee2c794f2148fbf1a736d4d906e075f1ccd4 |
| plugins/omnimux-market/src/skill-aggregate.ts | 611482e84012a66836b7cd02c868fde2e1bebc1e0d93c323b285463e617c15d8 |
| plugins/omnimux-market/src/tests/skill-aggregate.test.ts | 900260146ff5e3c54e668ab656d07476f440885924630f7cb21e2de58bc7f23b |
| plugins/omnimux-market/src/tests/workshop-query.test.ts | 30950b19620de4263a6ba8e69c0c770ad50f11dfae34bf8e9314ca717ea2e1bb |
| docs/implementation/issue-773-query.md | c3e19628a39e14e3ea447bee8aebcec1069b6bb7cfd9d6a4ba9b32f41f49208f |

## 2. 必须修复的增量问题

### Q-01 — P2：继承的推荐属性被当成受控显式配置

- **路径/函数**：`plugins/omnimux-market/src/expert/catalog.js:150–159`，`parseItem`；另一消费点 `src/workshop-query.ts:105`，`normalizeWorkshopDiscovery`。
- **测试**：`QA recommendation must be an own controlled field, not inherited metadata`（QA测试第54–60行）。
- **复现**：`Object.assign(Object.create({ recommended: true }), catalogItem('ordinary'))`。该行拥有合法 catalog 字段，但没有自有 recommended；通过真实 `parseCatalog`。
- **期望**：没有显式受控字段，`recommended=false`，不进入精选。
- **实际**：`row.recommended === true` 读取原型链，parser 产出 `recommended=true`；断言 `true !== false`。
- **影响/证据限度**：纯函数接受了继承的权限型元数据，违背“缺字段false”与防prototype边界。本测试只构造局部对象原型，不污染全局原型。正常 `JSON.parse` 不会仅凭 `__proto__` JSON键修改原型；尚未有 HTTP 接线，因此**不宣称已存在可远程利用的 prototype pollution 漏洞**。
- **最小建议**：受控推荐须为对象自有字段且严格 true；parser 与可直接消费 CatalogDoc 的 query 两入口保持同规则。不能修改旧专家 featured 或 picker 推荐语义。

### Q-02 — P2：远程卡额外 skill 字段覆盖 slug，串到其他身份的安装状态

- **路径/函数**：`plugins/omnimux-market/src/workshop-query.ts:113–122`，`normalizeWorkshopDiscovery`。共享 helper `src/client/skill-picker-logic.js:48–51` 按 `skill || slug` 取值，但远程 `SkillCard` 规范身份字段是 slug（`src/types.ts:190–214`）。
- **测试**：`QA remote extra skill cannot impersonate a different installed slug`（QA测试第63–73行）。
- **复现**：真实 `mapSkill` 产生 slug=`attacker` 的卡，再附加未知字段 `skill='victim'`；库存中 victim 是已安装启用本地项。远程 `sourceRef.identity` 仍为 `owner/attacker`。运行非空搜索 `fixture`。
- **期望**：`skillKey=attacker, installed=false, enabled=null`；未知扩展字段不能改写规范身份，也可选择明确拒绝冲突输入。
- **实际**：结果 `skillKey=victim`（断言显示 `'victim' !== 'attacker'`）；代码随即按 victim 查库存，附上 victim 安装/启用状态，却保留 attacker 来源描述。
- **影响/证据限度**：可绕规范身份去重、隐藏/冒认卡片并拼上另一身份安装状态。当前 `mapSkill` 自身不透传 skill，该风险出现在 query 的结构化输入边界及未来透传 adapter；**未证明当前远端搜索能够实际注入，也未执行安装或权限操作**。
- **最小建议**：远程路径明确只将 `{ slug: row.card.slug }` 交共享 token 规则，或严格校验并拒绝歧义字段；不要改 picker 的合法 skill-first 历史协议。新增回归应同时覆盖自有和继承的额外 skill 字段。

## 3. 已验证逻辑与证据限度

| 审查项 | 实际结论 |
|---|---|
| 身份优先、完整去重 | 标准输入 custom > workbuddy > skillhub 整卡胜出在领域/AND前执行；较低来源的推荐/版本/统计不拼上胜出卡；同标题不同slug保留。额外skill冲突见Q-02 |
| 推荐信任 | 严格布尔、无领域不得推荐、普通扣推荐、精选only、远程/库存自荐均不获信任；继承属性例外见Q-01 |
| prototype键 | `__proto__`、`constructor`、`tostring` 作为远程身份使用Map，均不误认已装、不写Object.prototype |
| 坏请求 | null/数组query、未知domain/source、非布尔switch、负数/非安全revision被INVALID_REQUEST拒绝；并非完整HTTP schema/fuzz证明 |
| 共享领域 | 导入同一SkillShelf membership helper；明确合法领域tags优先，去重复并按工坊顺序；Shopify受限fallback有效，ad/music不新增宽匹配 |
| filters/AND | 标题/说明/token跨字段AND、大小写/外部空白、未知词空结果、mine来源+分类+搜索交集有效；发现不应用mine来源过滤（无此控件） |
| 未安装与历史 | complete库存决定installed；停用仍已装；partial发现拒绝而不伪造未安装；mine部分可读、error拒绝；unknown来源/版本/启用/null sourceRef保留 |
| partial/exact | 必需来源缺失、重复状态、未穷尽、负数/NaN fetched、error均loaded/partial/loaded-result；exact只依据调用方提供完整证据，不代表真实远程已穷尽 |
| 排序/分页 | 163条跨3页全局identity平局稳定，无重复/计数漂移；真实updated优先，缺失用published，双缺末尾；无按页排序拼接 |
| 日期/统计 | 非UTC、错误闰日/月份日期、24点/60分拒绝；真实闰日毫秒保留；unknown不补0，合法0保留 |
| 快照/cursor | 全条件/revisions/scope绑定，跨snapshot拒绝；非法offset/JSON拒绝；TTL创建时算，299999ms有效/300000ms失效，时钟倒退/非有限拒绝；响应/输入嵌套变更不影响已生成快照 |
| 快照缓存 | 同创建时间连续10次只保留最新8；到TTL整批失效；重复ID由既有测试拒绝 |
| 加载预算 | 20页/1600候选、每页80、81只接受80并limit、exact最后一页穷尽允许complete；30秒精确边界；重复page/cursor/空无进展/失败停止，空且穷尽可complete，终止状态不复活 |
| 预算局限 | 仅纯状态转换；不证明真实body读取30秒中止、真实pageKey、候选来源和exhaustion真实；调用方仍需完整loader约束 |
| 版本适用 | 旧envelope/未来schema/错queryRevision及跨快照页被拒绝；该函数不是通用schema/内容安全校验，不以缺HTTP validator判本增量失败 |
| 来源模型偏差 | `sourceRef: SourceRef | null` 与独立 `version: string | null` 已披露；历史无证据保持null符合PRD诚实语义，本次不以此阻断，但架构模型同步仍归架构负责人 |
| 兼容 | aggregate仅类型迁移/re-export，运行fallback不改；picker源码无变更、19/19；catalog测试7/7，旧专家/团队/连接器字段不扩推荐 |

### 正式目录和隐藏边界

对 `catalog/index.json` 以固定base读取字节比较：**完全未改**；正式 recommended Skill **0**。原8个featured ID不变：

`exp-ai-content-creator-team`、`exp-software-company`、`exp-design-engine`、`exp-ad-creative-strategist`、`exp-ad-tracking-expert`、`exp-adort-design-expert`、`exp-ai-humanizer`、`exp-ai-image-prompt-engineer`。

`git diff --name-only` 核对 client、lib、catalog/index.json、package.json、pnpm-lock.yaml 均空。此为静态及已有catalog隔离测试证据，**不是隐藏功能/存储完整INT/L2回归，不给AC-56整体标PASS**。

## 4. 真实命令与结果

全部命令 cwd 为上述工作树，Node `v25.8.0`；编译器只读复用现有主仓工具，不安装、不链接依赖。

| 命令/检查 | 结果 |
|---|---|
| `pwd && git rev-parse HEAD && git status --short` | exit0，固定HEAD及未提交目标确认 |
| `git diff -- <五个tracked源码/测试路径>` + 新增四文件全文读取 | 完整九文件输入，不以untracked空diff冒充完成 |
| `node --version; command -v pnpm; git diff --check; git status --short --branch -uall; ls -ld ../../plugins/omnimux-market/node_modules/.bin/tsc ../../plugins/omnimux-market/node_modules/@types plugins/omnimux-market/lib` | exit0；可只读使用tsc/types；lib存在且受保护 |
| 下列全包typecheck | exit2；host.ts第2/3/4行TS2307缺cordis/dsh-tools/schemastery，另39条相关隐式any诊断（42条总诊断）；非PASS |
| 下列定向strict编译，初次 | exit1；仅新增QA测试TS2339：parser返回联合类型未先narrow recommended字段；未生成产物；Route QA，自行加`in`检查，不改运行断言 |
| 同一定向strict编译，修正QA类型后 | exit0；包含query/budget/types与真实aggregate/API/catalog/SkillShelf依赖图，无源码豁免 |
| 下列Node测试（唯一运行时批次） | exit1；80/78/2，4 suites，0 skip/cancel；原工程57全过、新QA23中2失败 |
| Node SHA-256、`git show <base>:catalog/index.json`字节对照、受保护路径diff检查 | exit0；九文件指纹和目录/兼容证据见上 |
| `git diff --check` + 新QA文件/本文直接尾随空白检查 | exit0；覆盖untracked，不仅依赖Git检查 |

```sh
../../plugins/omnimux-market/node_modules/.bin/tsc \
  -p plugins/omnimux-market/tsconfig.json --noEmit \
  --typeRoots ../../plugins/omnimux-market/node_modules/@types \
  --baseUrl ../../plugins/omnimux-market/node_modules

../../plugins/omnimux-market/node_modules/.bin/tsc \
  --target ES2022 --module Node16 --moduleResolution Node16 \
  --strict --allowJs --skipLibCheck --esModuleInterop \
  --typeRoots ../../plugins/omnimux-market/node_modules/@types \
  --rootDir plugins/omnimux-market/src \
  --outDir plugins/omnimux-market/.query-qa-check --noEmitOnError \
  plugins/omnimux-market/src/tests/workshop-query.test.ts \
  plugins/omnimux-market/src/tests/skill-aggregate.test.ts \
  plugins/omnimux-market/src/tests/workshop-query.qa.test.ts

node --test --test-concurrency=1 --experimental-test-coverage \
  --test-coverage-include='**/workshop-query.js' \
  --test-coverage-include='**/workshop-query-budget.js' \
  plugins/omnimux-market/.query-qa-check/tests/workshop-query.test.js \
  plugins/omnimux-market/.query-qa-check/tests/skill-aggregate.test.js \
  plugins/omnimux-market/.query-qa-check/tests/workshop-query.qa.test.js \
  plugins/omnimux-market/src/expert/catalog.test.js \
  plugins/omnimux-market/src/client/skill-picker-logic.test.js
```

**Coverage：未取得有效百分比。** 本次Node coverage报表没有列出任何目标文件（仅空汇总显示100%），故该100%无效、不报告为代码覆盖率；测试数量和实际失败均有效。未为了刷新空覆盖率报告重复测试或多消耗回归轮次。

### 未执行/阻塞检查

- `pnpm --filter omnimux-market test`：**BLOCKED/未执行**。package.json:45/47先 `rm -rf lib` 再全包tsc；无写typecheck已证明依赖缺失，执行会先破坏受跟踪生成物且不会成功。需主理人安排合法依赖恢复后运行正式包test；本QA不安装或改lock/profile。
- 未重复工程最初“无typeRoots”的全包编译：现有修正路径已复现核心Host依赖缺口；重复缺Node类型不增加行为证据。
- `verify:stages`/slots、浏览器/shared live probe、L2/真实库存/Host/API/UI/生命周期：**NOT_APPLICABLE于本离线增量执行面；完整交付仍NOT_RUN/BLOCKED**。没有变更相应接线，不为未承诺接线给query判失败。
- 仓库gates/模型合同/其他包build：变更不涉及gate脚本、模型或其他包，不执行。
- 未做通用恶意HTTP schema、真实网络预算或安装安全验收；本报告不把纯fixture结果扩成上述证明。

## 5. 下一步与关闭条件

1. 主理人将Q-01/Q-02及本文完整转工程，限定修复query/catalog输入投影；保持旧picker/helper公共行为、fallback、正式目录及隐藏业务不变。
2. 修复后读取实际diff和工程更新报告，由QA回归这80项与定向strict编译；保留新增失败用例作为回归，不删测降格。
3. 全包依赖问题独立处理；合法恢复后执行正式包typecheck/test。离线局部PASS仍不能替代真实库存、源exhaustion、Host/UI、生命周期以及全部适用AC。

当前可交接但**不具备该离线增量放行条件，不具备完整功能关闭/归档条件**。没有调用其他成员、没有发起外仓或远端操作；通信由主理人负责。

---

## Round 2 — 2026-09-08 Q-01/Q-02 独立返修验收

**IS_PASS: YES，仅 #773/#774 query 离线基础增量。Route: NoOne。Q-01、Q-02 两项 P2 均关闭。**

首轮以上148行原文及失败证据保留；本节是返修后的最新结论，不覆盖首轮 NO。完整 T02、Host/API/UI、真实库存与 L2 仍未验，不构成全包或完整工坊 PASS。

### R2.1 基线、输入与精确差异

- 唯一工作树仍为 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773`；branch `agent/market-skill-workshop-issue-773`；base = HEAD = `580234923268673562cacb5cd01aebdb780339e1`。target 为其上指定 query 增量的当前未提交内容，没有 fetch 或改 Git 状态。
- 全文读取首轮 QA 报告148行、最新工程报告148行、`catalog.js`303行、`workshop-query.ts`257行、工程 query 测试316行、QA测试276行；读取全部五个 tracked diff，核对共享 `skillToken`、package scripts 和适用推荐/兼容验收条款。新增 untracked 源码及测试按实际内容审查，不把 Git 空 diff 当无改动。
- 对内存字符串撤销 parser 的 own recommended、query 的 own recommended、remote 的 slug 投影三处表达式后，两个生产文件 SHA-256 **分别精确恢复首轮表中的指纹**；未向磁盘回写旧源码。工程 query 测试仅去掉新增 mapSkill 导入和第68–120行四项回归后，同样精确恢复首轮指纹。由此确认不存在所述返修之外的源码或原工程断言变化。
- QA测试 SHA-256 为 `8b0dd3b5b43b84f5cc10666c397239e51bd755780b2f445efbfbb6472717abc7`，与工程返修前后记录一致；全文确认 Q-01/Q-02 原失败断言保留，本轮没有修改、删除、跳过或降格任何测试。budget/types/catalog tests/aggregate源码与测试均精确匹配首轮指纹。

| 当前返修文件 | SHA-256 |
|---|---|
| `plugins/omnimux-market/src/expert/catalog.js` | `7e6d0b763add78bd801fe4d782b7f2ba825b8bb43615c2bc69d585d54dbd0de4` |
| `plugins/omnimux-market/src/workshop-query.ts` | `1abab01616a46846dcdbe615b5415860f34da9b39415f85f8cbceb80e3881fda` |
| `plugins/omnimux-market/src/tests/workshop-query.test.ts` | `ccae896c4b9531f9dc16bdc7587a92c9f405cb61ccb861c3085590e16ba01b40` |

### R2.2 两项关闭及兼容性

| 项 | 独立结果 |
|---|---|
| Q-01 / P2 | **CLOSED**。真实 parser 与直接 CatalogDoc query 两入口只接受 own 严格 true；继承 true 不推荐，null-prototype 上 own true 正常推荐，own false 遮蔽继承 true。原 QA `QA recommendation must be an own controlled field, not inherited metadata` 通过；领域资格与旧专家 featured 不变。 |
| Q-02 / P2 | **CLOSED**。remote 只将 `{ slug: row.card.slug }` 交共享 token 规则；自有/继承额外 skill 均不能冒认 victim 的身份与安装状态。原 QA `QA remote extra skill cannot impersonate a different installed slug` 通过；正常 slug 去空白、去 `/`、小写归一、停用仍已装、未装过滤和 catalog 胜出均通过。 |
| 来源优先 | 原三来源整卡 custom > workbuddy > skillhub 去重、先胜出再领域/AND、无低优先推荐/版本拼接均通过；新增正常输入回归确认 remote 不覆盖同身份 catalog。 |
| picker / fallback | picker 源码相对 base 无改动，`skillToken` 仍为历史 `skill || slug`；19/19 原测试通过。aggregate 源码仅首轮类型迁移/re-export，没有返修改动；13/13 含旧 Agent popular fallback、local命中时不拼远端fallback的回归通过。 |
| catalog / 隐藏边界 | catalog 7/7 通过。client、lib、正式 catalog/index.json、package.json、tsconfig.json、根 pnpm-lock.yaml 相对 base 的定向 diff 为空；没有更改旧专家/team/connector 推荐协议或正式目录。此处不替代 AC-56 完整隐藏功能/存储验收。 |

输入保护的安全结论仍仅限本地结构化输入边界；不声称证实了线上远程注入、全局原型污染或实际安装权限利用链。

### R2.3 本轮实际命令与结果

cwd 为上列唯一工作树，Node `v25.8.0`。只读复用已有编译器/types，不安装、链接或改变依赖。

```sh
../../plugins/omnimux-market/node_modules/.bin/tsc \
  --target ES2022 --module Node16 --moduleResolution Node16 \
  --strict --allowJs --skipLibCheck --esModuleInterop \
  --typeRoots ../../plugins/omnimux-market/node_modules/@types \
  --rootDir plugins/omnimux-market/src \
  --outDir plugins/omnimux-market/.query-qa-round2-check --noEmitOnError \
  plugins/omnimux-market/src/tests/workshop-query.test.ts \
  plugins/omnimux-market/src/tests/skill-aggregate.test.ts \
  plugins/omnimux-market/src/tests/workshop-query.qa.test.ts

node --test --test-concurrency=1 \
  plugins/omnimux-market/.query-qa-round2-check/tests/workshop-query.test.js \
  plugins/omnimux-market/.query-qa-round2-check/tests/skill-aggregate.test.js \
  plugins/omnimux-market/.query-qa-round2-check/tests/workshop-query.qa.test.js \
  plugins/omnimux-market/src/expert/catalog.test.js \
  plugins/omnimux-market/src/client/skill-picker-logic.test.js
```

| 检查 | 实际结果 |
|---|---|
| 定向 strict 编译 | **exit 0，1次**；沿真实query/budget/types/catalog/aggregate/API/SkillShelf依赖图，无源码豁免 |
| Node 原84项回归 | **exit 0，1次；84 tests / 4 suites；84 passed / 0 failed / 0 cancelled / 0 skipped / 0 todo**；query22 + QA23 + aggregate13 + catalog7 + picker19 |
| 首轮/返修差异指纹 | exit 0；三生产表达式与四项新增测试之外无差异；QA原断言完整保留 |
| 本轮 Market 前后路径/mode/内容 | exit 0；`git ls-files --cached --others --exclude-standard` 在 Market 下列出的全部251文件逐项相等；没有新增残留文件 |
| 文档格式及原文保留 | `git diff --check` 与本文直接尾随空白检查；首轮148行前缀SHA-256核对，避免untracked文档漏检 |

本轮指纹集合按上述 Git 枚举的相对路径排序，行结构为 `[path, lstat.mode & 0o7777, sha256(fileBytes)]`，取整个数组的 JSON SHA-256。251文件摘要前后一致：`6a86a915d92f94210dc2aa56f43adb333b4eab94e21eb5aa8748c605c62cb178`。排除返修3个源码/测试文件后为248文件，摘要 `3cea7bc416ac0dc38562670d900a7f649a71ef8da6acd039a72a5af38bf6690e`；这是本轮独立枚举口径，不冒充复算工程239文件的旧集合摘要。首轮报告原文 SHA-256：`482196d126e99e3804ff8c9d890bdca8bc94906de35e4ba2636cef3b95405343`。

本轮自建 `.query-qa-round2-check` 在测试后已清理，未写受跟踪lib；既有catalog测试仅使用其隔离临时fixture。没有增加coverage声明：首轮空目标coverage的100%仍无效，本轮未重跑coverage。至此两轮QA结束，无第三轮。

### R2.4 限制、遗留与交接

- **本次 query 离线增量 Known Issues：无；Route NoOne。** 两个 P2 在此范围可关闭，无需工程再次返修或修改QA测试。
- **全包 typecheck 仍非 PASS**：复用首轮及工程最新返修证据，exit2，Host缺 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery`，3条TS2307 + 39条关联隐式any，共42条。当前无依赖恢复新证据，按指令不重复该全包检查。
- 正式 `pnpm --filter omnimux-market test` 仍 BLOCKED/未执行：其build先删受跟踪lib，且已知Host依赖缺失。本轮84项离线回归不是正式全包test的替代PASS。
- 完整T02真实库存/adapter、真实源分页与exhaustion、Host/API/UI、生命周期、完整AC及L2/Dev/Prod仍 NOT_RUN/BLOCKED，未因离线通过解除运行接线门槛。主理人负责后续合法依赖恢复和完整适用验收；本次不扩大实施范围。
- 本轮仓库持久写入仅向本文追加Round2；没有源码/测试/规格/依赖/profile修改，没有提交、推送、部署、模型调用或其他成员通信。该离线增量具备限定放行条件，完整功能仍不具备关闭/归档条件。
