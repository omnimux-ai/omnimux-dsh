# Issue #773 / #777：文档阶段独立 QA 审查

## 结论与范围

- **IS_PASS=false（仅规格完整性）；Route=Architect，附 Product 文案修正。** 4项文档问题：P1×1、P2×2、P3×1；不是源码或功能FAIL。已批准产品决策不重开。
- 本次审查完成；主理人分派以下最小修订后可做一次定向复核。问题只约束相关生命周期/验证契约，不阻止已批准且无依赖的查询、布局及离线工作。
- 全文读完 `docs/specs/2026-09-08-skill-workshop/` 下 PRD v0.2.0（906行）、architecture（731行）、acceptance（168行）、类图（104行）、时序图（112行），共2021行。下文行号固定于本次快照。
- base与HEAD均为 `580234923268673562cacb5cd01aebdb780339e1`；目标是其上的五份本地未跟踪规格，不是远端tip；未fetch。审查期间另有他人源码及能力/查询报告变动，未读实现或报告、未采纳其结论、未验证源码、未与其他成员通信。
- 唯一仓库写入为本报告；未修改规格、源码、依赖或能力报告，未提交/推送。L0/INT/L2/E/功能全部 **NOT_RUN**，不授予产品、合入或发布放行。

## 可执行问题清单

### SPEC-01 · P1 · 卸载后的防JIT再装意图缺持久契约

- **位置**：architecture.md:156–162、210–225、357、459；acceptance.md:110、121。
- **问题**：卸载要求删除包/记录，同时要求“无新安装确认不得JIT再装，实际新确认安装才可解除防再装意图”。现持久状态只列安装记录和偏好，`Operation`只列操作阶段；未定义删除记录后由谁持有该意图、以何身份与scope匹配、何时持久提交/恢复、重启或catalog revision改变后是否仍有效。仅写“候选失效”不能构成可供T02存储与T03策略共同实现的状态契约。
- **影响**：两模块可分别符合自己的文字而在记录删除或重启后丢失禁止状态，重新出现未确认自动安装。此为规格缺项，并非认定当前实现已有该漏洞。
- **建议责任人 / Route**：**Architect**。用现有state/journal或已验证公共策略设施承载最小持久删除意图，固定identity/scope、提交/回滚/恢复及显式再安装解除规则，不要求新服务。补 LIFE-02 的“卸载→重启/重新取catalog→JIT拒绝→确认安装才解除”及中断用例。若依赖公共能力，列入对应门槛，不假定API存在。

### SPEC-02 · P2 · 风险确认与硬拒绝尚未对齐到提交协议

- **位置**：prd.md:375、385–386、543；architecture.md:350–351、454、467；acceptance.md:110。
- **问题**：PRD要求本地修改/能力扩大等风险转详情专项确认且不豁免硬限制；架构§4.3提交前却将“本地修改”统一直接拒绝，§4.4又要求风险转详情确认。现请求仅有 `confirmationRevision`/同计划哈希，未说明风险确认如何改变可提交资格；验收LIFE-02又笼统要求“本地修改…拒覆盖”。无法唯一判断“可安全确认的同源新版+本地修改”最终是可提交、永远拒绝，还是确认后仍无动作。
- **建议责任人 / Route**：**Architect**，依据已批准PRD收敛，不重新索要用户原决策。增加短决策表区分不可绕过项与可专项确认项；后者说明确认绑定的旧内容hash、新包hash、风险/计划revision与复核失效条件，并对应取消、过期、确认后再变更的验收。若全部本地修改确实不可安全处理，应明确不支持的技术原因及详情结果，由主理人转Product核对，而非保留无效确认入口。

### SPEC-03 · P2 · 已批准限额仍缺统一计量口径

- **位置**：prd.md:509、719；architecture.md:428–435、443–447；acceptance.md:104–105。
- **问题**：PRD明确要求架构固定深度/规范化计数及压缩比口径；架构只列8层、240字符和单entry/总100:1。未定义包装层剥离前后计算深度、文件名是否占一层、240按code point还是UTF-16单元及Unicode规范化形式、压缩比对零压缩字节和总量分母的计算。另PRD表格仅明确直接SKILL.md为1MiB，架构将包内SKILL.md也限1MiB，需在同一口径中明确该收紧，避免两套合法fixture。
- **建议责任人 / Route**：**Architect**。补一个最小计量表与代表性边界路径/公式，沿用现有有限数值，不扩大资源预算；将包内SKILL.md规则同步到验收。T03再据此写上限/+1测试。本项不等待能力核验，也不阻断T02查询。

### SPEC-04 · P3 · AC-12标题行数表述歧义

- **位置**：prd.md:232、741；acceptance.md:48。
- **问题**：正文是“标题单行，描述最多两行”，PRD AC-12写成“标题两行描述”，可能被读作标题两行；独立验收已正确写为标题单行。
- **建议责任人 / Route**：**Product**。仅将AC-12该短句明确为“标题单行、描述最多两行”，不改已批准样式或重开决策。

## 关键规格对齐结果（非功能PASS）

| 检查面 | 独立结果与证据 |
|---|---|
| 20SW / 57AC / 15Q | PRD定义连续唯一；acceptance有连续57AC。SW-19/20虽未写进该表SW列，其无H3/真实引用目标在AC-13/39及SESSION-01，未遗漏功能目标。15项决策语义一致，未发现旧“待用户确认”重新设门槛。 |
| 推荐与精简详情 | PRD:251、296–303、383–386与架构:42、47、403一致：普通扣推荐、精选only；确认安装成功启用，关仅停用；详情卸载与同源新版手动更新。风险确认细则见SPEC-02。 |
| 24h而非6h | PRD:372、774、828；架构:465；acceptance:81、111均为24h。架构唯一“6小时”是明确被取代的历史值，不构成冲突。 |
| exact / partial不降级 | PRD:329–331、718；架构:109、413–416；acceptance:53、55、115、160均区分已加载/全量排序；partial不能签全量AC。没有因来源能力未核实判功能FAIL。 |
| 首次安装屏障 | PRD:360、547；架构:103、453–457；CAP-02明确初装同样先过scope/策略/barrier再提交，失败不可暴露半包。 |
| 旧tabs与迁移scope | PRD:65、578、687；架构:218–225、460、698；AC-56/CAP-03/COMPAT-02明确隐藏三业务功能/数据/位置原样，仅Skill元数据迁移，未知不猜、较高schema只读、共享根未核实不写。 |
| 会话CAS / 0send | PRD:428–435；架构:475–483；AC-38–44/SESSION-01覆盖固定B、旧A无损、切C不串写、目标draftRev-CAS、超时重试同B及TTL，真实引用零模型。实际公开seam仍待后续核验。 |
| 认证→精确Origin→body | PRD:637–638；架构:342、388–393；SEC-01–03覆盖认证/权限前置、protocol/host/effective port、缺失/null/伪转发头拒绝、body/暂存零消耗，旧工具走合法执行上下文。未把loopback/路由注册当认证。 |
| 文件计划/并行职责 | 架构:119–130、645–666将配置与入口装配集中T01，T02存储、T03事务、T04UI分离；acceptance由T01规格到T05结果属于顺序接力，不是并发冲突。未发现同一实现路径被两个并行任务明确重复领写；共享state契约需补SPEC-01。 |

## 文档检查实测

2026-09-08本次独立只读检查，不转引PM/架构的PASS：

- Python标准库内存脚本退出0：**58处本地链接存在、26个Markdown围栏标记成对、全部表格列数一致、无尾随空白**；20SW/57AC/15Q及验收57AC定义连续唯一；独立类图/时序图与架构内嵌图逐字一致，时序控制块平衡。链接仅核存在，不验证历史源码行号或运行事实。
- `git diff --check 580234923268673562cacb5cd01aebdb780339e1 -- docs/specs/2026-09-08-skill-workshop` 退出0；五份为未跟踪新文件，所以另用全文文本检查覆盖，不以空Git差异充数。
- 文档命令声明核对：Market `package.json:45–47`确认test含build；根 `package.json:48/62/65`有test:gates、verify:stages、verify:live。**仅检查声明，未执行这些实现/运行检查**；本次grep首次空include参数被工具拒绝，改为合法文件glob后成功，不涉及被测功能。
- **Mermaid render：NOT_RUN**。`command -v mmdc`未找到；本任务Node解析`mermaid`及`@mermaid-js/mermaid-cli`均NOT_AVAILABLE。未安装依赖、未启动浏览器/服务、未把文本结构检查写成可渲染PASS。
- 文档检查Round 1结束；未修规格、未进行Round 2或任何功能轮次。报告写后另做自身格式及输入指纹稳定核对，不计为实现回归。

### 目标快照 SHA-256

| 文件 | SHA-256 |
|---|---|
| prd.md | `00cb4018bd402b0f81f65c70d4b9b3885c3ec2c4f85340563bb435ce3b9328dc` |
| architecture.md | `496fecaf928047ee1dffe382d57ba5851a0d731b71dbf93ba5e624a6869a5055` |
| acceptance.md | `582e6790160dd9446eecfe6393399ca2b5cca78d107e71817b01368baa46a370` |
| class-diagram.mermaid | `9b2d5f1cb4674e13b95989d02b9afdfda1943033645f6b22a2e967093b03a56f` |
| sequence-diagram.mermaid | `0206f1e395a66b1713dc51c28dcdabeebffca2dbce5fe5def9d96b0cc5158178` |

**下一步**：主理人转Architect处理SPEC-01–03、转Product修SPEC-04，再由QA只复核改动契约。实际pin、全路径barrier、认证、scope、全量与会话能力仍由原工程任务核验；这些开放技术门槛不是本次规格IS_PASS=false的理由，不机械阻止无依赖的已批准工作。

---

## Round 2 · 最新独立结论（2026-09-08）

**IS_PASS=true（仅本轮定向规格复核）；Route=NoOne。** 首轮4项问题均闭合，新增阻断性规格矛盾0项。此结论取代上方首轮的当前路由，首轮72行证据逐字保留。规格复核到此结束，不自动进入第三轮；不代表源码、功能、完整T01、合入、发布或Issue关闭通过。

### 审查快照与证据边界

- base与HEAD均为 `580234923268673562cacb5cd01aebdb780339e1`；目标是指定工作树 `.worktrees/skill-workshop-773` 上本地未提交规格，非远端tip；未fetch。
- 全文读完PRD 906行、architecture 796行、acceptance 169行、类图114行、时序图120行、revision-notes 83行及T01工程报告244行，并读完本报告首轮72行。本节位置均指本轮文件快照。
- 工程能力事实来自指定T01报告，不冒称本轮重新检查外仓源码、安装包或运行实例。历史记忆只作交接线索，以当前完整文件为准。未读或验收并行查询源码/查询QA，不与其他成员通信。
- 唯一仓库文件写入为本报告的Round 2追加；未改PRD、架构、验收、图、工程报告、源码、依赖、远端或profile。未安装渲染依赖、启动服务、调用Registry或创建会话。

### 四项首轮问题复核

| 项目 | 结果 | 本轮闭合证据与判断 |
|---|---|---|
| SPEC-01 / P1 | CLOSED | architecture:177–181、237–240、505明确现有state内独立PolicyTombstone，键为scopeKey/skillKey，token匹配、身份不明阻断；先journal/持久意图及全路径拒绝确认再删包/InstallRecord。重启、catalog revision/winner变化、外部放回、旧action/TTL均不清意图；仅新确认绑定revision/source/hash且安装验证及durable记录成功才解除。失败恢复旧包/记录/策略，不确定保持拒绝。acceptance:110及revision-notes:35–41补重启/JIT/中断/同token冲突证据。不是用Market过滤或高rank墓碑冒充公共deny。 |
| SPEC-02 / P2 | CLOSED | architecture:509–518风险表唯一确定结果：本地修改默认硬拒绝、自动跳过、无覆盖按钮，不新增合并/备份/卸载重装捷径；授权内兼容同源能力声明扩大才可专项确认。Host不可变计划绑定旧/新hash、sourceRef、风险集合、state/tombstone及confirmationRevision；取消/30分钟过期/字段变化失效，锁内重算。acceptance:112覆盖确认后修改/风险变化及拒绝行为。PRD:375/386/543的旧泛称由本次明确指令和architecture:518、revision-notes:23显式收敛；不是待PM另选后才能执行，也不能据旧句新增覆盖许可。 |
| SPEC-03 / P2 | CLOSED | architecture:454–489固定MiB/KiB、NFC/code point、UTF-8路径/组件字节、Unicode 15.1完整折叠碰撞、包装剥离前后深度与路径都测且文件名占层；entry含目录，包内/独立SKILL.md同1MiB。压缩比明确实际u与核实payload c、单项及合计、零分母/目录排除/整数比较；frontmatter按含闭合行原字节、BOM和换行规则、单调截止时限及起算点明确。acceptance:104–105承接最大值/+1/累计和安全场景。没有放宽既定预算，PRD一般单entry 10MiB不推翻明确的SKILL.md 1MiB特殊上限。 |
| SPEC-04 / P3 | CLOSED | prd:741已为“标题单行、描述最多两行”，与prd:232、acceptance:48、architecture:450一致；不改样式或重开产品决策。 |

### T01更正与跨文档一致性

| 检查面 | 复核结果与限度 |
|---|---|
| pin / Registry | architecture:37–47、115及acceptance:15与T01:58–68、95–98一致：默认未来L2 alpha.3/dd632、shipping源码与Dev安装声明rc.1/a66e分开；未证明45120加载身份。统一deny/barrier/精确非winner及停用态无副作用验证是所查版本静态缺口，适配器方法是需求而非官方API。普通get可能JIT，不能作本轮只读探测。 |
| 认证 / Origin / 授权 | architecture:117、418–425与T01:103–109、137–153一致：公开requestRejection复用并保留401/403；undefined不是操作/scope权限，也不是精确Origin。认证、许可、精确protocol/host/effective port均在body/暂存前；主体未知fail-closed。原始流route可适配，fetch.register无POST；精确Origin属于Market适配职责，不把全部安全要求误记为上游缺能力。 |
| 会话 / 文本CAS | architecture:123、530–540及acceptance:78/115落实A原始快照仅内存、固定B/同ID重试、attach失败已有实体保留。B最新identity/plain/空draft/files/imageIds/初始rev同步无await复核后bail，严格true一次消费并回读；不把文本CAS宣称附件/phase联合原子能力。无法公开读齐或无法排除可重入变化则G-05阻断预填，revision-notes:51–57只条件性申请最小公共补充。 |
| scope / L2 / 依赖 | architecture:237–247、686、695–704、781及acceptance:108/129与工程报告一致：默认根非profile隔离，cfg/JIT与实际扫描根待核实，不迁共享根；外部kit沿既有file声明不改。start可先写task home/复制种子且不自动生成.l2-dev.env；本任务未启动，不能称启动失败。#778保持现有环境责任，不创建重复任务或外部Issue。 |
| 原批准语义 / 图与任务 | 推荐普通去重、精选only、开前确认安装成功启用/关仅停用、详情卸载/同源更新、默认关及24h、partial不放行全量、隐藏三业务原样、唯一入口均保留。类图为模型投影，时序图为流程概览，具体拒绝/恢复与同步保护按正文及强制验收，不以简图省略步骤授予旁路。5任务/10WBS及单文件所有权未改为并发抢写。 |

### 独立DOC检查结果

- 六份规格全文标准库检查最终退出0：**72处本地链接存在（PRD39、架构18、验收8、修订7）、26个围栏标记成对、43个表格列数一致、无尾随空白且末尾换行**；20SW、PRD57AC/15Q、验收57AC连续唯一，5Task/10WBS正确。两份独立图与架构内嵌逐字一致，时序控制块平衡。链接只验证存在，不验证历史源码行号或运行事实。
- 检查器首次Task正则误计职责表，触发AssertionError；这是QA检查器缺陷而非规格问题。限定正式§7任务表后自修复验通过，同属本次Round 2文档检查，不新增规格/功能轮次。首次复合shell末尾Git命令掩盖Python退出状态，未将该次标PASS；复验加`set -e`后整体退出0。
- `git diff --check 580234923268673562cacb5cd01aebdb780339e1 -- docs/specs/2026-09-08-skill-workshop docs/qa/issue-773-spec-review.md`退出0。目标仍未跟踪，因此以上全文检查才覆盖实际内容，不拿空diff充数；报告追加后另核输入指纹、首轮前缀及报告格式。
- **Mermaid render、L0/INT/L2/E、build及功能测试全部NOT_RUN**。本轮没有命令/依赖实施变更，不重跑会清理生成物的包test或安装render依赖；前序命令声明/图形工具缺失记录仅作历史，不当成本轮执行证据。不估算源码覆盖率，不把57条验收定义计成57个通过测试。

### Round 2输入指纹（SHA-256）

| 文件 | 行数 | SHA-256 |
|---|---:|---|
| prd.md | 906 | `499f1f9879984030f70225618aebf0cd8c28c1ecd76434d6a58ccf0f954b9134` |
| architecture.md | 796 | `6ab28ca7858e30bd169691193fbd20b6c96d24dc4bb60d11bb7187178f95d312` |
| acceptance.md | 169 | `1a0a3e5d35750283fc3c40c111761fe3a9cecf0de38961379edb9dc39f3390bd` |
| class-diagram.mermaid | 114 | `3120b05f3df9af2c43cef1a0773ea787133b54b710f5e250f0fee6f6b284208d` |
| sequence-diagram.mermaid | 120 | `b3c2f556d4019c5bf3ab8c646101db045f50afff169e4ab0fadc4606050127b0` |
| revision-notes.md | 83 | `76406b84eebc65006006c2a2ec542f495593ad945664ddf603acd871bfcd9ed6` |
| ../../implementation/issue-773-capabilities.md | 244 | `351cde56ffe7b0404f6f8f99ec6c22c0c051df60f3d3ebddd082f797be6f5f11` |

首轮原始72行共9404字节，SHA-256为`690343cbef11e3c893d707683749b9dbea2b9937e67a463f7e779b1e3fdfb29d`；追加不改该前缀。

### 遗留与下一责任

**本轮Known Issues（规格阻断）：无。** PRD旧风险泛称后续可由Product同义整理，但当前明确指令及架构风险表已唯一限定结果，不是新产品决策或第三轮前置。

**真实功能门槛仍开放**：G-01全路径deny/barrier/精确无副作用验证，G-02可信操作/scope授权及精确Origin实现，G-03实际根/隔离/锁，G-04真实全量计数与最近，G-05输入同步安全证明，以及当次合规L2 seed和全部适用功能证据。静态已缺能力与尚未实测能力保持区分；这些不作为规格FAIL理由，也不能被本次PASS解除。

**下一步 / Owner**：主理人接收本轮规格PASS并推进已授权离线任务；按revision-notes的最小依赖规格安排能力提供/核验及后续独立功能QA，越仓或运行写入仍另核授权。#773/#775/#776/#777不可凭本报告关闭；本规格第二轮已终结，不自动追加第三轮。
