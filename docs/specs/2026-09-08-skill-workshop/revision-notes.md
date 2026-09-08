# #773 规格QA与T01证据修订

## 1. 结论与边界

**架构修订交QA定向复核；不授予功能PASS或Issue关闭。** 固定base/HEAD为`580234923268673562cacb5cd01aebdb780339e1`，目标是其上的本地未提交规格，不是远端tip。无fetch、提交、部署或外部Issue写入。

完整输入：同目录[prd.md](prd.md)、[architecture.md](architecture.md)、[acceptance.md](acceptance.md)、[类图](class-diagram.mermaid)、[时序图](sequence-diagram.mermaid)，[QA完整输出](../../qa/issue-773-spec-review.md)72行、[T01完整工程输出](../../implementation/issue-773-capabilities.md)244行（特别§8）。原五份规格分别906/731/168/104/112行，均读完，不只读交接摘要。

只修架构、验收、两图及本文件；PRD、QA、工程报告、T02查询文件均不由本次修改。T02查询独立进行不受本修订影响；不调用其他成员、不跨仓写、不改官方、共享profile或安装根。主理人统一交接与后续日志。

## 2. 修订追踪与QA定向范围

| 输入项 | 最小修正 | 定向复核位置 |
|---|---|---|
| SPEC-01 P1 | state内增加PolicyTombstone，不与InstallRecord共生共灭；固定scope/identity/token匹配、journal恢复和新确认再安装成功解除；公共Registry强制执行缺失时不开放卸载 | 架构§3.1–3.3、§4.3；两图；LIFE-02/CAP-01/02 |
| SPEC-02 P2 | 本地修改默认硬拒绝，无覆盖按钮或新增合并流程；可确认的同源能力声明风险与硬拒绝分行；旧/新hash、来源、风险、revision绑定并锁内复核 | 架构§4.3–4.4；LIFE-04 |
| SPEC-03 P2 | NFC/code point/UTF-8字节、剥包装前后深度、文件名占层、零分母与payload压缩比、原字节frontmatter、单调计时固定；包内SKILL.md同样1MiB | 架构§4.2；SEC-04/05，AC-31–33 |
| T01 §8.1/3/5 | 区分已安装rc.1、默认L2alpha.3及未验runtime；认证接口存在但不等权限/精确Origin；普通get不是无副作用精确验证 | 架构§0.1.1/G-01/02、§3.5；验收导言/SEC/CAP |
| T01 §8.2/6/7 | 默认根非profile隔离、cfg/JIT不一致需核实；start不等零写preflight且不自动生成.l2-dev.env；保留原kit真实依赖声明 | 架构G-03/§3.2/§6/§9；CAP-03及验收§4 |
| T01 §8.4 | A原始快照仅内存；B即时phase/files/plain/空文本/初始revision保护，同步无await再bail；text-CAS不冒充联合atomic；attach失败保留真实B | 架构G-05/§4.5；两图；AC-42/SESSION-01 |
| SPEC-04 P3 | 标题单行/描述最多两行保留在验收；PRD字句由已另派PM处理 | 本次不写PRD；主理人交QA核对PM输出 |

本地修改不支持覆盖是本次明确指令的范围收敛，不是新产品功能。PRD旧“修改专项确认”的泛称须按该拒绝结果理解；主理人可转PM对齐措辞，不能据旧泛称新增覆盖流程。字节阈值未放宽，包内SKILL.md沿原架构1MiB，现补为明确可测安全收紧。

## 3. 精确最小「外部能力需求规格」

这些是交主理人的依赖输入，**不是已创建外部Issue、不是官方API声明、不是外仓实现授权**。优先要求现有Registry/连接/输入所有者补最小公共契约；不自建policy服务器、第二认证体系、第二composer或通用分布式事务系统。

### E-01 Registry统一策略、加载屏障与精确验证（当前阻断）

证据：T01 C04/C05/C07，限定alpha.3/dd632与rc.1/a66e所查公共面。`setAllowed/commitBarrier/verify`是Market适配器的需求名，上游可采用自己的公共命名。

**最小输入/输出与行为**：

- 策略提交输入：已授权的有效scope、稳定skill identity及规范化token、allow/deny、预期revision；输出实际策略revision及是否已在所有适用加载路径生效，冲突/缺能力明确返回。Market持久保存enabled及卸载tombstone，Registry不读取Market私有文件。
- deny须在filesystem/provider/preset、显式/模型加载、缓存候选及JIT执行前统一优先；不被近scope、高rank、同token其他来源绕过。启动恢复期间未确认策略则相关加载fail-closed；插件未装/降级或进程中断不得静默丢弃已生效的deny。由官方所有者确定最小持久/启动接入方案，不要求第二策略数据库。
- 屏障输入：同scope/identity、授权事务身份；成功返回受限句柄及精确覆盖范围。拿到屏障后无新的目标加载/JIT启动，已在途读取须完成于旧一致版本或被阻止；不得读半包。正常结束仅在记录/包/策略一致后释放；调用者崩溃时不因租期届满开放未知内容，须可重建拒绝并完成恢复。无屏障不能做首次rename。
- 精确验证输入：屏障授权上下文、期望provider/source/目标路径或opaque locator、identity、内容hash；输出实际定义的identity/provider/source/path或locator/invocation/非空内容核对结果。能验证非winner和停用目标，不临时启用、不触发JIT/下载/脚本/模型、不fallback至同名winner；不向客户端泄漏私有路径或正文。
- 不要求文件系统rename+JSON+Registry成为不存在的一个原子操作；本域journal负责可恢复步骤，公共屏障负责不可见中间态，revision确认负责释放条件。上游若只能提供其中部分，剩余真实闭环仍阻断。

**关闭证据**：绑定精确提供版本及运行实例，在隔离fixture中覆盖首次安装、更新、卸载、启停，filesystem/provider/preset/JIT/缓存/同名冲突；每个持久/rename/策略点注错和中断；卸载删除记录→重启→catalog revision变化→JIT拒绝→新确认安装成功解除；停用态精确验证无副作用；prompt/submit/model均0。仅Market过滤、UI开关或公开普通get结果不算关闭。

### E-02 可信操作主体与scope授权（先核实既有公共契约）

证据：C14已SUPPORTED_STATIC，C16仍UNVERIFIED。**不要求重造认证**：读取body前直接复用`ctx.connection.requestRejection(req)`。精确configured Origin与流式专属限额是Market最小适配职责，不是必须上游新增helper。

尚需公共所有者确认/提供：由真实请求或合法工具执行上下文取得不可由body伪造的主体/授权上下文，按`operation + effectiveScope + resource/operationOwner`给出许可或拒绝；可为opaque授权检查，不要求暴露用户PII/principal数据或token。自动任务只继承已持久批准范围；过期/撤销/跨scope拒绝。若既有seam已满足，只补精确消费文档与证据，不新增服务。

**关闭证据**：认证通过但越权、缺失/过期身份、跨scope/跨operation重放均在body与staging前拒绝；合法浏览器Origin精确匹配协议/host/有效端口；伪forwarded头不授信；旧工具/JIT入口不绕过。有效cookie、云登录或confirmationRevision单独不能证明许可。

### E-03 输入保护公共契约（条件性，不先要求新atomic API）

证据：C12文本CAS可用，C13附件/phase一体CAS不存在。先采用公开slot最新快照→同步业务复核→同步bail→回读的最小方案；A原快照仅内存、B初始rev保护、action固定B去重均由本域承担。

只有实际pin无法公开即时读齐identity/phase/files/imageIds，或存在检查到应用之间的可重入变化导致安全条件不可保证时，才要求输入所有者提供一个最小受保护插入：目标session、expected文本revision及`plain/empty/no-files`前置条件在实际应用点校验；返回applied/rejected及可回读结果，禁止自动发送。不要求跨会话事务、永久action去重服务或新composer。

**关闭证据**：目标只加附件/只改phase而rev不变、用户输入又清空、异步切C、同步可重入变更、undefined与true后回读冲突、attach失败已有B；均不覆盖、不重复创建/插入、不写A/C。未证明同步方案安全时对应自动预填保持阻断，不能把C12标成C13已支持。

### 不属于新外部能力申请的事项

- G-03：本仓适配cfg.skillsDir、catalog/JIT及官方有效加载根，核实DSH_HOME/profile/project/agents roots；不迁共享根。根或授权不明确保持只读。
- G-04：源分页穷尽/版本更新时间/精确计数证据由原数据任务核验；partial仍不可签全量AC，不修改T02查询代码。
- #778：现有环境责任项处理viewer受管seed。T01仅静态断言不满足且未启动L2；此规格修订不创建重复Issue、不修共享配置、不把问题说成本任务启动失败。
- pin/RC：无需为文档修订升级任何pin；未来要对齐runtime须主理人另安排正式消费链及RC流程。

## 4. T03/T04可推进与阻断矩阵

| 模块 | 可安全离线开发（仅已授权范围） | 不能签成真实闭环 |
|---|---|---|
| T03验证器/准入 | 固定method route适配与认证缺失fail-closed；NFC/CRC/限额/恶意ZIP和MD fixture；精确Origin/权限拒绝纯测试，不处理真实用户文件 | 认证静态存在不等G-02操作权限已证；真实上传写入口在权限/scope未知时不开放 |
| T03事务/策略/更新 | fixture目录内锁、CAS、journal/tombstone恢复及能力不可用分支；同源风险资格、默认关/24h/预算；最小Registry适配接口的拒绝stub | G-01/02/03未关闭，首装/更新/卸载/启停和自动更新提交均阻断；AC-24–26/29/34–37/44–48不能整体PASS；stub成功不算Registry证据 |
| T04界面 | 现有工作台/唯一导航/双tab/卡片/详情/安装状态与错误/能力阻断视图；合成fixture只进测试，不发布假推荐或假开关 | 所有真实UI AC需ego+共享probe，fixture/layout测试不算L2；隐藏三业务不得动 |
| T04会话 | 公开create/scope/bail适配离线合同；A快照、固定B、attach异常、phase/files/rev、切C/TTL/重复消费测试；已准备目标分支的实现 | 未装/停用目标准备依赖T03；精确无副作用注册仍缺E-01；G-05同步安全未证则不预填。AC-38–44/52真实链路仍待INT/L2及零模型证据 |

T02当前仅查询文件的工程/QA不因本轮契约调整重启或改写。后续库存/state实施才消费tombstone契约，由主理人按文件所有权安排，不与查询文件并发抢写。T01–T05原五任务及十步WBS保留，不新增第六任务或控制系统。

## 5. 文档检查与下一责任

本次仅做DOC检查：Python标准库只读全文核对通过，33处本地链接存在，57个AC连续唯一、5任务/10WBS保留，表格列数/围栏/尾随空白合规，两图与架构内嵌逐字一致、时序控制块平衡。首次任务ID正则误命中职责表而断言失败，限定正式任务表后复验退出0，不涉及功能失败。`git diff --check 580234923268673562cacb5cd01aebdb780339e1 -- docs/specs/2026-09-08-skill-workshop`退出0；文件仍未跟踪，故以前述全文检查补足，不以空diff充数。

功能L0/INT/L2/E与Mermaid图形渲染均未在本修订运行，不将前次文档检查或工程报告完整性PASS当功能结果。HEAD仍5802349，任务树另有T02源码/工程/QA输出，不归本次改动，不进行清理或覆盖。未安装依赖、读取用户Skill正文、调用Registry/get或模型、创建会话、启动Host/App或写远端。

下一责任：主理人将本轮五文件交QA，只定向复核SPEC-01–03、T01§8更正及与PM的SPEC-04一致性；QA独立判规格是否通过。外部能力由主理人持本文件在另获授权后处理，工程继续上表安全离线部分。不得据本文件关闭#773/#775/#776/#777或宣称生产可用。
