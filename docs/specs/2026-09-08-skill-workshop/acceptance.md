---
title: "Skill工坊：完整验收规格"
id: "skill-workshop-acceptance-773"
status: "specification-only; functional-tests-not-run"
date: "2026-09-08"
issues: [773, 774, 775, 776, 777]
base: "580234923268673562cacb5cd01aebdb780339e1"
branch: "agent/market-skill-workshop-issue-773"
---

# Skill工坊：完整验收规格

**本文件是待执行验收契约，不是测试通过报告。** 原 PRD v0.1.1 的 AC-01–57 全部保留映射，并应用用户已批准的产品语义及架构安全修订。正式方案见 [architecture.md](architecture.md)，图见 [类图](class-diagram.mermaid) 与 [时序图](sequence-diagram.mermaid)。本次功能用例统一 **NOT_RUN**；不因为某项依赖未核实便断言当前 runtime 不支持。

固定任务 base 为 `580234923268673562cacb5cd01aebdb780339e1`。本轮完整采纳[T01静态能力报告](../../implementation/issue-773-capabilities.md)（244行，含§8）和[规格QA](../../qa/issue-773-spec-review.md)；修订追踪及精确最小外部需求见[revision-notes.md](revision-notes.md)。默认未来L2为alpha.3/dd632，Dev安装声明为App2.0.5、rc.1/a66e；二者不混用，也不等于实际运行身份。**所查两源码面及安装JS的公共Registry缺统一deny/barrier/精确目标无副作用验证，限定静态结论；runtime未验。** `requestRejection(req)`公开认证已静态证实，但操作许可与精确Origin另验；文本CAS不含附件/phase。

## 1. 证据层与完成标准

| 层 | 能证明 | 不能替代 |
|---|---|---|
| DOC | 文档链接、围栏、ID、静态计划自洽、改动边界 | 任何安装/会话/浏览器/运行能力 |
| L0 | 纯逻辑、fixture、对抗输入、并发/失败分支的代码行为 | 实际宿主 seam 与真实运行 |
| INT | 隔离真实目录/Host/公开Registry零模型读、恢复及scope | 用户界面/实际浏览器证据 |
| L2 | 本任务源码绑定的独立Host、ego真实DOM/PNG、共享verify:live | Dev/Prod物化或真实模型发送 |
| E | 适用Electron原生拖放/壳层/CDP | Web UI证据 |

所有适用P0/P1验收通过才能完整交付。P1未做、partial结果、UI假开关、计时安装、mock新会话、HTTP200、包测试通过、探针pending都不能替代完整AC。H3与假Tab提示默认不做，不构成未完成P2。未知来源、无领域、零推荐是合法数据状态，不要求编造内容。

记录每个AC的 `status: NOT_RUN | PASS | FAIL | BLOCKED | NOT_APPLICABLE`、责任人/任务、实际命令/exit/用例数、Given/When/Then、base/head/dirty、profile/Host/run/task/tab身份、脱敏证据路径、错误与下一步。NOT_APPLICABLE仅有具体变更面理由时使用；环境/工具缺失为BLOCKED而非PASS；证据不足不能放行。

## 2. AC-01–57 完整映射

表内场景是目标，不是已发生的测试动作。每行默认状态为 **NOT_RUN**。T01基础设施由#774/总#773集成；T02=#774，T03=#775，T04=#776，T05独立QA=#777。

| AC / SW | Given | When | Then（已批准目标） | 责任 / 证据 |
|---|---|---|---|---|
| AC-01 / SW-01 | 工坊未打开 | 从项目正下方入口打开 | 既有omnimux-market:plaza；入口/Tab名Skill工坊、H1 Skill；仅Skill/我的Skill，Skill唯一激活；插件/专家/连接器入口隐藏 | T04/T05；L0+L2 |
| AC-02 / SW-01 | 新工坊或关闭后重开 | 首次渲染 | 默认Skill/全部，安装/创建可达；仅聚焦已开实例则保留原筛选/滚动，不强重置 | T04；L0+L2 |
| AC-03 / SW-01 | 旧plugins/experts/connectors hidden intent | 打开工坊 | 归Skill，不偷开隐藏页面；原Agent工具不删除/改协议 | T04/T05；L0+L2 |
| AC-04 / SW-02 | 深色参考布局 | 看顶部 | H1 Skill；副标题“发现、安装并管理 Skill，扩展 OmniMux 的创作能力”；按钮“通过 OmniMux 创建”“+ 安装Skill”；无MiniMax品牌/额外工具栏装饰 | T04；L0+L2 |
| AC-05 / SW-03 | 任意目录 | 看分类 | 全部、精选、短剧漫剧、专业影视、动画、商业广告、电商、教育、创意实验、音频音乐、平台工具；全部/精选非领域tags | T02/T04；L0+L2 |
| AC-06 / SW-04 | 当前分类推荐0且有普通项 | 打开分类 | 精选标题/区域/相关空白全移除，普通仍有 | T02/T04；L0+L2 |
| AC-07 / SW-04/05 | 恰1个真实推荐 | 打开分类 | 精选标题+1张正常卡宽，不凑4、不拉满 | T02/T04；L0+L2 |
| AC-08 / SW-04 | 同推荐属动画/广告多领域 | 分别切领域再切全部/精选 | 各所属领域可见，全体聚合仅一次且同身份 | T02/T04；L0+L2 |
| AC-09 / SW-04/14 | custom未推荐与recommended=true各一 | 浏览精选 | 仅严格true入选，缺字段false，来源/安装/认证不能代替推荐 | T02；L0+INT |
| AC-10 / SW-04 | 旧顶层featured含专家ID | 浏览Skill精选 | 不混expert/team，旧元数据语义保留 | T02/T05；L0+INT |
| AC-11 / SW-04 | 推荐与当前搜索不匹配 | Enter提交 | 推荐区域消失，不塞不匹配fallback；旧Agent工具fallback不变 | T02/T04；L0+L2 |
| AC-12 / SW-05 | 标准宽容器4张推荐 | 看/hover/focus | 4列16:9，标题单行/说明至多两行，无作者认证下载底行；查看详情/去对话中试试双按钮等宽、各触发一次、focus/无hover可达 | T04/T05；L2 |
| AC-13 / SW-05 | 无封面或加载失败 | 渲染 | 16:9中性占位，文本/动作可用，无H3自造标；正式封面有授权证明 | T04/T05；L0+L2+内容证据 |
| AC-14 / SW-06 | 推荐与普通都有 | 看其他Skill | 普通扣推荐；双列条卡标题旁仅可信下载量，右启用switch；N符合去重/过滤/分区，精选分类不出现普通区/控件 | T02/T04；L0+L2 |
| AC-15 / SW-03/06 | 动画与音频混合、后端宽召回 | 切动画 | 普通与推荐均领域匹配，不因OR召回混音频；不复制另一套领域算法 | T02/T04；L0+L2 |
| AC-16 / SW-06/07 | 未装A、已装启用B、已装停用C | 仅未安装 | 普通仅A；C不当未装；推荐不受普通控件影响 | T02/T04；L0+L2 |
| AC-17 / SW-06 | 跨页真实更新时间/同时间/缺时间 | 最近及更多 | 全集合更新倒序，缺用真实上架、再缺末，identity稳定；不按抓取时间、不页内局部乱跳；静态最近无假菜单；partial不能算全量通过 | T02/T05；L0+INT+L2 |
| AC-18 / SW-06/14 | 下载unknown、真实0、正数 | 看三种卡 | 普通unknown隐藏、真0/正数如实；精选/我的无下载字段，不混installs/stars | T02/T04；L0+L2 |
| AC-19 / SW-06 | 过滤结果超过一页 | 更多/源失败/截断 | 精确N不随页长漂移、不重复；不全量则已加载N+排序范围；穷尽后才exact，partial不是完整精确能力证据 | T02/T05；L0+INT+L2 |
| AC-20 / SW-03/15 | 查询A在途后切B | A晚到 | 只保留B结果/计数/queryRevision；游标条件不匹配拒绝；详情旧返回也不覆盖新目标 | T02/T04；L0+L2 |
| AC-21 / SW-07/17 | 真库存有停用/本地/无领域历史项 | 我的/全部 | 全部可见，不从当前搜索页推导；卡片仅标题说明switch、无下载 | T02/T04；INT+L2 |
| AC-22 / SW-17 | 多来源多分类库存 | 分类/来源/搜索交叉 | 三条件AND；我的即时、发现Enter不串状态；全部仅解除本维；来源除全部仅存在库存值、五类映射正确 | T02/T04；L0+INT+L2 |
| AC-23 / SW-17 | 来源无法追溯历史项 | 全部/未知来源 | unknown可找到，不从标题/当前winner猜OmniMux；不外查本地文件 | T02；L0+INT |
| AC-24 / SW-07 | 已装启用包有字节基线 | 关switch/刷新/隔离重启 | 文件逐字、来源版本保留且仍我的；持久关闭；filesystem/provider/preset/JIT/缓存后续调用均阻止；不卸载、不撤回已注入上下文 | T03/T04/T05；INT+L2，依赖G-01/G-03 |
| AC-25 / SW-07 | 停用状态、持久化或策略失败 | 启用 | 不假开，旧记录/策略回退、说明原因，卡/详情一致；能力未证实不报已生效 | T03/T04；L0+INT+L2 |
| AC-26 / SW-07/10 | 未装目标 | 开switch且安装失败 | 先确认安装；失败仍未装/未启用，不吞错；初装也先解除barrier/认证/scope门槛 | T03/T04；INT+L2 |
| AC-27 / SW-08 | 同slug本地catalog/SkillHub描述不同 | 本地胜出卡详情 | 绑定该精确sourceRef，不被远程替换；精简完整说明/来源分类版本状态/安装启用试用；关闭恢复原筛选位置 | T02/T04；L0+L2 |
| AC-28 / SW-09 | 未选文件 | 开弹窗/安装 | 深色居中、X、虚线区、规定拖放/文件要求文案；安装真disabled，不发写请求 | T04；L0+L2 |
| AC-29 / SW-09/10 | 合法zip与SKILL.md各一 | 分别选择/拖放安装 | 同一安全验证/事务；只有真文件+记录+官方精确可解析定义才成功；未注册不能说可用 | T03/T04/T05；INT+L2，原生适用E |
| AC-30 / SW-09/10 | readme.md、伪zip、多文件/目录 | 选择或拖入 | 分别拒绝且具体解释，不静默第一项；可重新选择 | T03/T04；L0+L2 |
| AC-31 / SW-10 | 缺SKILL.md/空正文/非法格式/多根 | 安装 | 验证失败无完整安装记录、原包不变；仅根单Skill/唯一包装层可接受 | T03；L0+INT |
| AC-32 / SW-10 | ../、绝对/盘符/UNC、链接、重复及碰撞 | 导入 | 写目标外之前拒绝；规范化/实际落点复核，授权目录外无变化 | T03；L0+INT |
| AC-33 / SW-10 | 炸弹、文件数/字节/时间/深度超限 | 安装边界fixtures | 按架构全部阈值及+1/累计测试，有限时间停止；未提交暂存清理、恢复区不盲删 | T03；L0+INT |
| AC-34 / SW-10 | 包含脚本/hook合法包 | 安装 | 只验证/存储/注册；脚本、hook、模型和包触发的网络外传均0；来源下载不得被误算为包脚本执行 | T03/T05；L0+INT |
| AC-35 / SW-10 | 同身份同来源同hash已装 | 重复/连点/请求重放 | 幂等一份目录，无并行覆盖/统计虚增；同action不同负载冲突，两个Host同根也互斥 | T03；L0+INT |
| AC-36 / SW-10 | 已装旧包，写/注册各阶段注错 | 更新及崩溃恢复 | 真实错误阶段，旧字节/记录/来源/版本/enabled恢复；回滚不确定RECOVERY_REQUIRED只读保留现场 | T03/T05；L0+INT |
| AC-37 / SW-09/10 | Host未完/失败 | 超过demo计时 | 不计时成功；真实阶段/错误/未知结果；关闭不等取消，提交段结束后恢复UI | T03/T04；L0+L2 |
| AC-38 / SW-11/13 | A含草稿/附件/团队preset，Skill就绪 | 试试 | 真B且B≠A，B仅目标引用；A字节/附件/preset不变，不发送、不专家召唤 | T04/T05；INT+L2 |
| AC-39 / SW-12/13 | creator可解析，A空/非空各一 | 通过OmniMux创建 | 均新建B，一次/skill-creator及“帮我使用它来创建一个新的技能。首先询问我这个技能应该做什么。”；无Tab/制表符，无mock | T04/T05；INT+L2 |
| AC-40 / SW-13 | 创建中/结果丢失 | 连点/Enter/action重放 | 同一action只有B及一次预填；超时先查同ID不盲建，不能复用A空会话 | T04；L0+INT+L2 |
| AC-41 / SW-13 | B真创建但composer未就绪 | 10秒超时/安全重试 | 明确B已创建但预填失败，始终绑定B，不创建第二个、不写A；TTL2分钟到期不自动预填 | T04；L0+L2 |
| AC-42 / SW-13 | B待预填、用户编辑/清空、增附件/改phase或切C | 延迟到达 | 同步即时复核identity/plain/空文本与files/初始rev再bail，中间无await；text-CAS只防文本变化，不声称附件/phase atomic；保护不可证明则阻断，不写C、不抢焦点；原A不变 | T04；L0+L2，依赖G-05 |
| AC-43 / SW-11/12 | 安装/启用失败或creator缺失 | 试用/创建 | 未装/停用先确认准备，失败不建会话/不假就绪；无workspace公开选择不建目录，不切preset/专家或生成消息 | T03/T04；INT+L2 |
| AC-44 / SW-13/16 | 引用草稿准备好 | 官方Registry零模型读取 | source/provider/invocation/非空正文精确；Registry get(name,options)与provider get(candidate,options)用法区分，非字符串冒candidate | T03/T05；INT |
| AC-45 / SW-18 | 无自动更新偏好 | 我的/主动开启/隔离重启 | 初始关；持久化成功才开，开启即检查；重启保留；启动/打开我的24h冷却；不更新Market包 | T03/T04；L0+INT+L2 |
| AC-46 / SW-18 | 合格、unknown、local、本地修改、停用混合 | 自动检查 | 只合格同源可证新版更新，其他跳过/明确确认；停用不改变/不临时启用验证；并发1、查50、提交10、5min、超额后轮且不连跑 | T03/T05；L0+INT |
| AC-47 / SW-18 | 新包下载后验证失败 | 完成验证 | 不提交，旧包/记录可用，原因真实，无假更新成功 | T03；L0+INT |
| AC-48 / SW-18 | 未开始、暂存、提交段分别 | 关闭自动更新 | 无新自动任务；暂存可取消；临界段完成或回滚一致，不误报全取消，不影响手动安装/启用 | T03/T04；L0+INT+L2 |
| AC-49 / SW-15/16 | 离线/源超时/库存权限失败 | 浏览管理 | 合法本地仍可用，来源partial如实；库存读取失败不是0，不以空库存允许破坏写入 | T02/T03/T04；L0+INT+L2 |
| AC-50 / SW-15 | 键盘/无hover/窄容器/200%缩放 | 发现→详情→安装入口 | tab/switch/busy/disabled语义真实、焦点恢复/约束、动作全可达，列数降级且无关键裁切；对比度实测正文4.5:1、大字/非文本适用3:1 | T04/T05；L2 |
| AC-51 / SW-10/15 | 恶意Markdown/HTML/SVG/危险URL | 详情/封面 | 不执行脚本、不读任意本机文件、不越权外发；无任意URL代理或未净化内联SVG；中性降级 | T03/T04/T05；L0+INT+L2 |
| AC-52 / SW-01/13/16 | gui对话折叠且A工作台/画布有状态 | 试用/创建 | 真B会话列显露，原A工作台/画布不重建；单纯开工坊不创建会话 | T04/T05；L2 |
| AC-53 / SW-01 | 发布原显示/隐藏两种隔离配置 | 渲染侧栏 | 工坊是顶部项目下一项；发布显示则项目→工坊→发布，否则不打开发布；不改Alpha配置 | T04/T05；L2 |
| AC-54 / SW-01/16 | 曾有底部入口 | 查完整侧栏/点击顶部 | 工坊恰1、footer0；既有omnimux-market:plaza，无新插件/第二页 | T04/T05；L0+L2 |
| AC-55 / SW-01/16 | 其他入口顺序/Alpha/会话树基线 | 迁移后比对 | 除工坊外相对顺序、Alpha原样，会话树内容/层级/展开/选中不变 | T04/T05；INT+L2 |
| AC-56 / SW-01/16 | 隐藏三类已有工具/功能/隔离数据 | 工坊切tab及既有功能回归 | 三类UI不显示；原功能/工具不删不改语义，数据内容/位置不删迁清；不恢复入口来证明保留 | T02/T03/T04/T05；L0+INT+L2 |
| AC-57 / SW-01/16 | 迁移后工坊及确认demo基线 | 首开/Skill与我的切换 | 双tab功能不变、初始Skill/全部、按精简demo和批准修订统一；不做隐藏Tab新UI或恢复旧入口 | T04/T05；L2 |

## 3. 补充强制检查（不重编号原 AC）

这些检查展开既有 SW-10/13/14/16/18 安全和确认边界；不得只跑表中表面UI断言。

| 检查ID | 关联AC / 任务 | 必须覆盖 |
|---|---|---|
| SEC-01 | AC-29/32/51；T03 | 复用公开connection.requestRejection(req)，保留401/403，缺服务拒绝；undefined不等操作许可。连接未认证、已认证无操作权限、过期/跨scope：在body/缓冲/暂存前拒绝；固定路由method、可信主体和资源授权分层测试，不用云登录/确认按钮代授权 |
| SEC-02 | AC-29/51；T03 | Origin缺失、null、非法、多值、协议差异、host差异、端口差异、缺省端口与实际非默认端口、未验证X-Forwarded-Host/Proto：精确protocol/host/effectiveport策略；只经已验证代理配置才认可转发上下文 |
| SEC-03 | AC-24/29/35/36；T03 | 新旧Skill API/工具/catalog/JIT入口共用权限/策略/锁/CAS；GET不得写；operationId跨主体/scope不可读写，相同action不同payload拒绝 |
| SEC-04 | AC-29/33/34；T03 | 严格按架构§4.2统一计量：ZIP20MiB、独立及包内SKILL.md均1MiB、其他单文件10MiB、总100MiB、含目录entry1000；剥包装前后深≤8且文件名占层；NFC后≤240 code points/960 UTF-8字节、组件≤255字节；每entry及总u≤100*c，零分母/伪长度/目录分母/CRC；原字节frontmatter与JSON64KiB、完整body/验证30秒及锁5秒/注册10秒。逐项最大值/+1/累计/中途停止，不以UTF-16或解压后剥层绕过 |
| SEC-05 | AC-31/32/33；T03 | symlink/hardlink/设备、分卷/ZIP64/加密/方法不支持、NUL、UNC、反斜线歧义、Unicode/大小写冲突、文件目录冲突；扫描后实际写点再校验，无递归解包 |
| CAP-01 | AC-24/25/26/29/36/44；T01/T03/T05 | 实际shipping/安装包/L2 pin及API证据；filesystem/provider/preset/JIT/缓存/显式引用/模型skill加载统一deny，无rank/scope/fallback绕过；无法核实不得报运行不支持或通过 |
| CAP-02 | AC-26/29/36/46；T03/T05 | 首次安装、更新、卸载、启用、停用均在scope/统一策略/barrier验证后真实提交；初装不能先rename再检查；停用包授权验证不能临时开放 |
| CAP-03 | AC-21/24/29/36；T02/T03 | 真实DSH_HOME/cfg.skillsDir/provider扫描根/profile、同文件系统非扫描staging、双Host同根锁；shared根未核实只读，不迁目录/越profile |
| LIFE-01 | AC-35/36/47；T03 | 每个journal/rename/元数据/注册/释放屏障点注错和进程中断，初始化先恢复；恢复不了RECOVERY_REQUIRED，不按TTL删除活跃恢复现场 |
| LIFE-02 | AC-27/36；T03/T04 | 按架构§3.2：卸载先持久tombstone与Registry拒绝确认再删包/InstallRecord；卸载→重启→catalog换revision/winner→JIT仍拒绝；tombstone不算库存，不删外源/输出/会话。仅新确认再安装成功清意图，取消/失败/旧action重放不清；各持久点/注册点中断恢复与同token身份冲突不得绕过；缺公共seam即阻断真实卸载 |
| LIFE-03 | AC-45/46/48；T03 | 主动开启检查一次、后续启动/打开我的24h；并发1、查50、提交10、5min；超额轮换不连跑；UI偏好持久化失败回原值 |
| LIFE-04 | AC-27/36/46；T03/T04 | 本地修改默认LOCAL_MODIFIED硬拒绝、自动跳过、详情无覆盖按钮；来源改变/同名异物/不兼容/降级同样拒绝。同源且既有授权内可确认的能力声明扩大，确认绑定旧/新hash、sourceRef、风险集合、state/tombstone及计划revision；取消/过期/确认后旧hash或风险变化使确认失效，锁内重核保旧，不新增覆盖/合并流程 |
| COMPAT-01 | AC-09/10/11/17/56；T02/T05 | picker旧排序与旧精选、旧工具fallback保留；工坊独立新语义；隐藏业务存储内容/位置核对，非通过恢复UI |
| COMPAT-02 | AC-21/24/36；T02/T03 | schema迁移幂等、不改原包、无证据unknown/null、较高schema只读；旧插件降级不会静默重新启用停用Skill；兼容不足先阻断 |
| SESSION-01 | AC-38–44/52；T04/T05 | A原始文本/引用/附件files/phase/preset/工作台快照前后核对且不持久存正文；B输入后清空、只增附件（rev不变）、plain转command/frozen（rev不变）、切C、scope未挂载、返回undefined、true但回读冲突；同步读→保护→bail无await且不使用旧闭包。true已消费不得再插，联合CAS不存在且同步保护不能证明则G-05阻断；create响应丢失/attach失败实体B保留且只重试同B；prompt/submit/模型计数0 |
| DATA-01 | AC-17/19/49；T02/T05 | 20页/1600/30秒/重复游标/源失败/快照8个TTL5分钟/库存revision变化；partial同时标加载N和排序范围，不能替代全量AC |

### 3.1 fixture 与恢复安全

仅在授权隔离目录构造包/库存/会话，记录操作前后manifest/hash与相关元数据，不用用户真实草稿/附件做破坏性测试。ZIP脚本是否执行用不可执行的哨兵/计数检查，不允许为验证主动运行导入脚本。崩溃/重启仅目标隔离Host，在授权后执行，不默认重启App/公共Dev。

成功不是写出目录或看见同名Skill。Registry验证必须核对准确安装路径/来源/provider/invocation与非空定义；停用仍不可被普通调用获取。失败/恢复中仍保持调用屏障；一致性未恢复不能释放后让半包被加载。

## 4. 独立 QA 执行与证据绑定

遵循 [plugin-qa](../../contracts/plugin-qa.md) 和 [dev-pipeline](../../contracts/dev-pipeline.md)。下面是后续工程/QA流程，本轮均未执行。

1. 以实际任务head记录差异，先定向L0，再 `pnpm --filter omnimux-market test`（含build）、`pnpm verify:stages`及适用slots/boundaries；若共享gate脚本变化，跑对应测试及 `pnpm test:gates`。
2. 实际能力复核、当次seed合规及初始化授权后准备独立L2：端口44201–44299，profile `~/.dsh-dev/tasks/<task>`，SOURCE本任务worktree，在研插件link≤1。正式QA工具记录URL/PORT/SOURCE/COMMIT/PROFILE与实际Host，不假定start生成`.l2-dev.env`；start在preflight前可能写task home/复制凭据配置，不是零写检查。当前viewer受管seed问题归现有#778，此修订不修环境、不声称本任务启动失败。L2不是43120或公共Dev45120，默认alpha.3与Dev安装rc.1分开验。
3. ego-browser同一task space/Tab，通过正式 `scripts/ego-live-qa.mjs` / `openL2EgoPage` 准备。认证链接只在内存正常token→Cookie交换，不记录token，不伪造Cookie/票据，不使用IAB。
4. 用 `pnpm verify:live market --target=l2 --url=<实际L2地址>` 创建共享请求，同模块 `runPreparedQa(requestPath,{tab})` 消费。exit2/pending、ready、HTTP200均不是业务PASS。
5. 逐项AC留同run DOM与真实可解码PNG，核实实际加载脚本/bundle指纹与唯一注册；前后SHA、Host PID/启动时间/运行版本、profile、URL、run/task/tab一致。不能复用旧run、旧截图或其他任务证据。
6. 原生拖放/壳层门控有改动时加Electron renderer/CDP证据，普通Web不强加无关壳验收；Electron不能替代Web。
7. 所有Skill注册/新会话验收保持零模型，不为证明引用向真实模型发送消息。真实用户发送不属于本验收操作。
8. 工程自检与独立最终QA分开；#777核对准确diff、证据身份、权限和残留风险。浏览器/认证/能力不足则BLOCKED，不能减少条件或私建弱验收器。

建议结果记录字段（运行后再填，绝不预填PASS）：

```json
{
  "issue": 773,
  "base": "580234923268673562cacb5cd01aebdb780339e1",
  "head": null,
  "status": "NOT_RUN",
  "runtime": null,
  "cases": [],
  "checks": [],
  "blockers": [],
  "rollbackEvidence": [],
  "modelCalls": null
}
```

`runtime`至少需实际pin/version/SHA、profile、origin、Host身份、bundle指纹、run/task/tab；未知用null，不能把期望值写成观测。modelCalls本轮未观测为null，后续真实断言必须0。

## 5. 回滚与放行门槛

- **源码**：仅任务自有变更，Git可达恢复；不回滚主树其他人的脏文件，不修改lib产物或仓外依赖。
- **数据**：安装失败撤销本次初装；更新失败恢复旧字节/来源/版本/enabled/记录；卸载失败恢复受管对象；不删除外源、会话、创作输出、其他Skill。
- **策略**：旧插件不识别enabled可能重新启用，不能把降版本当安全回滚；最低兼容/降级屏障需实测，更高schema只读；迁移另有授权才执行。
- **依赖**：G-01统一策略/barrier与无副作用精确验证、G-02公共连接认证/权限、G-03实际scope解除后才进行真实写提交；G-04真实全量数据解除后才能宣称全量计数/最近完整AC；G-05须证明输入同步业务保护，不能用文本CAS冒充附件/phase atomic。允许离线开发，不允许弱旁路。
- **授权**：仅本仓改动获批不授予外仓Issue/修改、sharedprofile/安装目录迁移、生产/--prod/--all、公共App重启。遇缺口主理人处理，工程不得自行扩大。
- **交付状态**：文档完成、代码完成、自检、独立QA、PR/merge、Dev物化、运行验收分别记录。所有适用P0/P1真实证据齐备才能完整产品放行；本次只完成文档范围。

## 6. 前次正式化文档检查记录（不作为本次修订通过证据）

本轮限定为四份架构文档的路径/链接/围栏/ID/内嵌与独立图一致性、边界文字及 `git diff --check`。实际执行的只读文档检查脚本退出0：19个本地链接均存在、57个AC连续唯一、5个任务和10步WBS顺序正确、15项Q决策完整；Markdown共16个围栏标记成对，两份独立图与正文逐字一致，时序控制块平衡，无尾随空白。首次脚本任务计数同时命中了职责分组表，已限定正式任务表后复验通过，不涉及功能失败。

`git diff --check` 退出0；四份文件为新文件，另以直接文本检查覆盖未跟踪内容，不将空Git差异当全文检查。检查时HEAD仍为指定5802349；另见PM的prd.md及docs/implementation/issue-773-capabilities.md，均非本次架构写入，未修改。Mermaid仅文本/结构核对，未运行渲染器，不宣称图形渲染通过。未运行功能测试、build、Host安装/启停/更新、新会话、浏览器、L2、Dev或Prod。
