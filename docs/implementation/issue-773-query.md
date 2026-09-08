# #773/#774 T02 查询基础实施记录

## 范围与基线

- base/HEAD：`580234923268673562cacb5cd01aebdb780339e1`；branch：`agent/market-skill-workshop-issue-773`。
- 唯一工作树：`.worktrees/skill-workshop-773`。本次仅离线查询、规范化数据、受控推荐透传及纯函数预算/快照契约；不接 runtime、不扫描库存、不安装依赖、不部署、不提交。
- 已全文读取 PRD v0.2.0（906行）、architecture（731行）、acceptance（168行）及独立类图/时序图。能力报告由其他任务维护，本任务不读写、不等待、不作能力承诺。
- 写入范围：Market `src/types.ts`、`src/workshop-query*.ts`、必要的 `src/skill-aggregate.ts` 类型兼容、`src/expert/catalog.js` Skill 字段及相应 query/catalog/aggregate 测试、本记录。
- 不修改 picker 算法、旧工具 fallback、隐藏业务字段/存储、package/lock/tsconfig、Host/API/UI/install/provider/sharing。

## AC 与证据计划

| AC | 本增量可验证层 | 仍未覆盖 |
|---|---|---|
| 05–11、14–16 | L0：领域顺序/共享匹配、严格推荐、整卡胜出、AND、分区、未装过滤 | 真实目录链路/UI |
| 17–20、DATA-01 | L0：全已加载集合排序分页、exact/loaded、版本/游标、预算、TTL | 真实源穷尽和 UI 晚到处理 |
| 21–23、49 | L0：显式库存 fixture、未知来源/启用、读取失败契约 | 真实 scope、库存扫描/迁移/启停 |
| 27、56、COMPAT-01 | L0：保留准确 sourceRef/版本、catalog 专家兼容、旧 aggregate/picker 回归 | 真实详情接线、隐藏数据运行验收 |

所有完整 AC 保持待 QA；pure tests 不构成完整工坊、真实库存或精确远程全量验收。

## 测试入口核对

`plugins/omnimux-market/package.json` 的 `test` 先运行本包 build（删除本包 lib、tsc、concat-client、复制 fixture/expert），再运行 lib/tests、src/expert、src/client 测试。禁止触发其他包/共享库写入。先核对可用工具与依赖，再选择本包检查或明确受限检查；不创建替代 harness 冒充官方验收。

## 实施与实际证据

**初次工程自检：IS_PASS: YES，仅 T02 离线查询基础及受限自检；后续独立 QA 发现两个 P2 并判 NO。最新返修结论和证据见文末，不代表完整 T02、完整工坊或独立 QA PASS。**

### 改动文件与决策

- `plugins/omnimux-market/src/types.ts`：查询/库存输入、精确 SourceRef 联合类型、unknown/null、结果版本；共享 Catalog 类型，旧 SkillCard/SearchResult/InstalledSkill 不变。
- `plugins/omnimux-market/src/skill-aggregate.ts`：仅将 Catalog 类型迁至 types 并兼容 re-export；旧入口实现、返回字段与 fallback 不变。
- `plugins/omnimux-market/src/expert/catalog.js`：仅 kind=skill 且 tab=skills 透传严格 recommended、独立 cover、可信计数、版本及来源日期。专家/team/connector 原字段及顶层 featured 不变。封面暂只接受受控 `catalog/covers/<name>.(png|jpg|jpeg|webp)`；不代理URL、不加载图、不宣称资产授权。
- `plugins/omnimux-market/src/workshop-query.ts`：复用 SkillShelf `skillToken/itemShelfTags/matchesDomainTag` 和 aggregate 身份/渠道函数；整卡 custom > workbuddy > skillhub 胜出后领域/AND匹配，推荐分区、普通扣推荐、精选only、普通未装筛选、稳定最近、快照分页。
- `plugins/omnimux-market/src/workshop-query-budget.ts`：20页/1600项/30秒、重复页/游标停机的纯状态转换；不增加 loader 或服务。
- `plugins/omnimux-market/src/tests/workshop-query.test.ts`（18项）；既有 aggregate 新增1项（共13项）、catalog 新增1项（共7项）；picker 19项原测试不改。

### 输入与后续接线契约

1. `WorkshopQueryInput.catalog` 必须由 Host 受控目录提供，不能来自 HTTP 查询正文、远程卡片、用户包 frontmatter 或库存记录。对象自有字段 `recommended === true` 才有效；不读取 item.featured 或顶层专家 featured 授予推荐。受控目录内同身份低优先项的推荐/版本不会贴到胜出卡。
2. catalogRevision 是调用方提供的真实目录版本/内容指纹，不用 generated_at/抓取时间冒充包更新时间，也不自行拼 Git commit/version。remote 的 sourceRef/统计/日期另给证据输入；旧 SkillCard 的占位0/installed/额外recommended不获信任。remote 不明来源或版本保留 null。
3. 库存输入须先由未来 Inventory adapter 核对 scope、唯一规范身份、实际来源与状态。搜索不是库存；来源下拉从完整或已加载库存生成，unknown有独立项；mine可展示无领域旧项、停用、本地项。重复身份拒绝，不默默覆盖。来源是安装出处，不随发现winner变化。
4. **模型明确偏差**：架构 WorkshopSkill.sourceRef 扩为 `SourceRef | null`，并补 `version: string | null`；用于无可追溯来源历史记录，不能虚构 local contentHash 或来源版本。SourceRef 有值时严格沿架构 discriminated union。
5. `installed` 仍为布尔，故 discover 在库存partial/error时返回 `INVENTORY_UNAVAILABLE`，避免把缺失条目当未装；mine partial可读已加载，error不伪零。调用方须保留上一已验证视图并标只读错误，不据此执行安装/启停。这不是新增库存读取能力。
6. exact 前提是库存 complete 且所有必要来源独立声明 complete+exhausted；空搜索只需 OmniMux/WorkBuddy，非空才需 SkillHub。缺状态、重复状态、错误、未穷尽均 loaded/partial/loaded-result。统计值是过滤后全已加载普通集合，不随分页漂移。来源声明真实性仍是 G-04 待验证事项。
7. 源 adapter 必须在请求及完整body读取前调用预算判断，并在墙钟30秒内实际中止；每页最多80，候选计数是去重前。`accepted` 返回可消费前缀长度，超长页标limit，不能将未接纳尾部传入查询。source-error/no-progress/limit/timeout不得写成 complete；pageKey须由稳定身份序列计算，不能使用随机值绕重复检查。纯函数不实现网络取消，不是负载运行证明。
8. 快照最多8个、TTL从创建算5分钟，调用方每次插入经 retain；不得复用 snapshot ID。分页绑定完整请求条件/queryRevision/catalogRevision/inventoryRevision/scope，变化拒绝旧cursor；续取来源形成新快照并重新排序。作用域鉴权由未来 Host 做，游标不是权限凭据。
9. 响应携 schemaVersion=1、queryKey及版本；旧SearchResult/未来schema/不匹配revision/不同快照页不适用。`isWorkshopResponseApplicable` 只做版本适用性检查（返回boolean），不代替 HTTP schema/内容安全校验。UI的Enter提交、tab独立状态、详情晚到保护仍未接线。
10. 正式 catalog/index.json 未修改；只读核验推荐Skill为0，原顶层8个专家 featured ID 保持不变。没有生产Demo卡、没有真实封面资产写入。

### 实际命令、计数、退出码

以下均在指定任务工作树根执行，Node `v25.8.0`；编译器及类型目录仅从现有仓只读消费，无安装、链接、依赖或配置修改。

| 检查 | 实际结果 |
|---|---|
| `pwd; git status --short; git rev-parse HEAD; git branch --show-current` | exit 0；HEAD/branch符合指定值，预存未跟踪规格及能力报告不属于本次 |
| `node --version; command -v pnpm; ls -ld node_modules plugins/omnimux-market/node_modules plugins/omnimux-market/lib; ls -l ../../node_modules/.bin/tsc ../../node_modules/.bin/tsx ../../node_modules/.bin/esbuild` | exit 1；已调查为工作树无node_modules、根无tsc/tsx；非代码失败 |
| `../../plugins/omnimux-market/node_modules/.bin/tsc -p plugins/omnimux-market/tsconfig.json --noEmit` | exit 2；工作树Node/Host依赖类型无法解析；未生成产物 |
| 同上追加 `--typeRoots ../../plugins/omnimux-market/node_modules/@types --baseUrl ../../plugins/omnimux-market/node_modules` | exit 2；Node类型问题解除，但Host的cordis/dsh-tools/schemastery及关联推导错误仍在；不冒称全包typecheck通过 |
| 下列定向编译 | 3次均exit 0；覆盖query/budget/types/catalog/aggregate及两TS测试的真实依赖图，strict+noEmitOnError |
| 下列Node回归 | 首轮55/55，最终57/57，均exit 0；最终0 fail/cancel/skip；总4个picker describe suites |
| `git diff --check` | exit 0；最终还对新增源码/文档直接查尾随空白，避免漏掉untracked |
| catalog/client/lib边界比较 | exit 0；catalog/index.json、src/client、受跟踪lib未改 |

```sh
../../plugins/omnimux-market/node_modules/.bin/tsc \
  --target ES2022 --module Node16 --moduleResolution Node16 \
  --strict --allowJs --skipLibCheck --esModuleInterop \
  --typeRoots ../../plugins/omnimux-market/node_modules/@types \
  --rootDir plugins/omnimux-market/src \
  --outDir plugins/omnimux-market/.query-check --noEmitOnError \
  plugins/omnimux-market/src/tests/workshop-query.test.ts \
  plugins/omnimux-market/src/tests/skill-aggregate.test.ts
node --test --test-concurrency=1 \
  plugins/omnimux-market/.query-check/tests/workshop-query.test.js \
  plugins/omnimux-market/.query-check/tests/skill-aggregate.test.js \
  plugins/omnimux-market/src/expert/catalog.test.js \
  plugins/omnimux-market/src/client/skill-picker-logic.test.js
```

仅 `.query-check` 是本次临时编译目录，验证后删除；无产物夹带。未运行 `pnpm --filter omnimux-market test`：它会先删除已跟踪lib，且依赖缺失已通过无写typecheck证实；不为获得失败截图破坏产物。未运行其他包build、shared库build、UI/Stage/live检查、Host/L2、目录迁移或真实库存读取。既有catalog回归仅在其测试自行创建的临时fixture内写包，不作用于用户库存/共享profile。

### 未完成 AC / 运行接线门槛

- 上表对应仅L0部分；AC-17/19的真实源全量/稳定最近、AC-21真实作用域库存、AC-27真实同源详情、AC-56完整隐藏业务数据回归均未完成。所有UI、生命周期、新会话、自动更新及完整57 AC维持待验收。
- 真实库存adapter与源分页/exhaustion/统计真实性待 T02 后续；真实pin、权限、scope和统一加载/提交屏障须按G-01–04独立核实，未关闭不得启用安装/启停/更新/卸载。
- 未来 QueryService 装配/query/detail、Host/API/UI接线不在本增量；本次使用架构允许的纯函数模块，不伪实现IO方法。需合法依赖恢复后运行正式本包test/typecheck，由主理人转独立QA。不能以57个pure/兼容用例等同PRD 57个完整AC。
- 无提交/push、无部署/安装/模型调用、无官方源码/外包/sharedprofile改动。本任务不请求扩大scope。

## 2026-09-08 独立 QA 两个 P2 返修

**IS_PASS: YES，仅 Q-01/Q-02 返修工程自检。Route: 主理人 → QA 第二轮。** 独立 QA 尚未复验；不代表完整 T02、工坊、全包 typecheck/test 或运行接线验收通过。

### 输入、修复与边界

- base = HEAD = `580234923268673562cacb5cd01aebdb780339e1`，目标为原未提交工作树增量；未 fetch、切分支或提交。已完整读取 `docs/qa/issue-773-query.md`（148行）、QA测试（276行）、本记录返修前版本（90行），并核对已批准规格的身份、推荐及兼容条款。规格由架构任务维护，本次只读。
- **Q-01**：`src/expert/catalog.js` 的 parser 和 `src/workshop-query.ts` 的直接 CatalogDoc 消费点均增加 `Object.hasOwn(..., 'recommended')`，并保留严格 true 与领域资格条件。不读取继承推荐、不改变专家顶层 featured。
- **Q-02**：remote 仅将 `{ slug: row.card.slug }` 投影给共享 `skillToken` 再小写归一；额外自有或继承 skill 均不能改变规范身份或串用安装状态。合法 slug 的去空白、去引用前缀和大小写归一不变。未修改 picker helper 的历史 skill-first 协议、aggregate/fallback 或类型。
- 持久写入仅四文件：`plugins/omnimux-market/src/expert/catalog.js`（1行替换）、`plugins/omnimux-market/src/workshop-query.ts`（2行替换）、`plugins/omnimux-market/src/tests/workshop-query.test.ts`（新增 mapSkill 导入和4项回归）、本文。未改 QA 失败用例。
- 新增4项覆盖：parser/直接query两入口拒绝继承推荐，null-prototype对象自有true正常推荐、own false遮蔽继承true；自有skill冲突；继承skill冲突；合法slug规范化/停用库存仍已装/仅未安装过滤/catalog整卡优先。
- 证据仍限纯结构化输入边界；没有证明当前线上远程注入、全局原型污染或实际安装权限利用链，不扩大安全结论。

### 本次实际命令与计数

cwd 为本任务工作树。编译器和类型目录只读复用现有主仓，无安装或链接。

```sh
../../plugins/omnimux-market/node_modules/.bin/tsc \
  --target ES2022 --module Node16 --moduleResolution Node16 \
  --strict --allowJs --skipLibCheck --esModuleInterop \
  --typeRoots ../../plugins/omnimux-market/node_modules/@types \
  --rootDir plugins/omnimux-market/src \
  --outDir plugins/omnimux-market/.query-repair-check --noEmitOnError \
  plugins/omnimux-market/src/tests/workshop-query.test.ts \
  plugins/omnimux-market/src/tests/skill-aggregate.test.ts \
  plugins/omnimux-market/src/tests/workshop-query.qa.test.ts

node --test --test-concurrency=1 \
  plugins/omnimux-market/.query-repair-check/tests/workshop-query.test.js \
  plugins/omnimux-market/.query-repair-check/tests/skill-aggregate.test.js \
  plugins/omnimux-market/.query-repair-check/tests/workshop-query.qa.test.js \
  plugins/omnimux-market/src/expert/catalog.test.js \
  plugins/omnimux-market/src/client/skill-picker-logic.test.js

../../plugins/omnimux-market/node_modules/.bin/tsc \
  -p plugins/omnimux-market/tsconfig.json --noEmit \
  --typeRoots ../../plugins/omnimux-market/node_modules/@types \
  --baseUrl ../../plugins/omnimux-market/node_modules
```

| 检查 | 次数 / 实际结果 |
|---|---|
| 上述定向 strict 编译 | 2次，修复前/后均exit0；真实query/budget/types/catalog/aggregate/API/SkillShelf依赖图，无源码豁免 |
| 上述Node测试，修复前 | 1次，exit1，80项：78过/2失败；恰为QA的Q-01 `true !== false`、Q-02 `'victim' !== 'attacker'` |
| 上述Node测试，修复后 | 1次，exit0，84项：84过/0失败/0跳过/0取消/0todo，4 suites；query22 + QA23 + aggregate13 + catalog7 + picker19 |
| 全包typecheck | 1次，exit2；Host缺 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery`，3条TS2307与39条关联隐式any诊断，共42条；不是PASS |
| `git diff --check` + 四文件直接尾随空白检查 | exit0；直接检查覆盖未跟踪query/test/本文，不仅依赖Git |
| 受保护文件前后SHA-256比较 | 239个Market文件（排除本次3个源码/测试写面），路径+POSIX mode+内容集合摘要前后一致；覆盖src其余文件、lib、catalog、package.json/tsconfig.json |

受保护集合摘要：`1af6549e3c42b3e42c3d31bfed182b5aecf3b4c96d70ebc2b856ce17ebe46c16`。QA测试前后SHA-256：`8b0dd3b5b43b84f5cc10666c397239e51bd755780b2f445efbfbb6472717abc7`。保留原始QA报告，不将其NO改写为PASS。

全局一致性复核：仅三处生产表达式修改，无导出/接口变化；新增测试复用现有真实mapSkill和query/parser入口，无第二实现。原80项与新增4项全部保留。无types/budget/picker/fallback/Host/UI/依赖/profile/其他仓或规格写入；工作树中的前序未提交修改继续保留。

本次自建临时编译目录 `.query-repair-check` 已清理，无编译产物夹带；旧QA/工程目录未清理。未运行正式 `pnpm --filter omnimux-market test`：build会先删除受跟踪lib且已证Host依赖缺失，故BLOCKED而非PASS。未运行UI/L2/live/真实库存或网络，未新增coverage声明，未提交、推送、部署或召唤其他成员。

下一步由主理人交QA第二轮复验本次四文件及全部84项；全包依赖恢复另行授权处理，完整功能关闭条件不因本次局部修复解除。
