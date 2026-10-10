# #3276 已知双来源文本声明与共享判据版本

## 目标、授权与新用户基线
父#3247已获2026-10-08实施授权，关联#3249分类但不关闭其全量缺口；本片仅使已声明的双来源规范化prompt不被误判未知。基线origin/main=6b593118843b7b75d905e35c7c970e1d66ce8d07。此规格先于实现与行为失败测试，需独立规格审定；普通PR/MQ/Dev与清理按原授权，新可见界面仍先演示保用户确认、视频live专项批准不扩大。
新用户正式安装/正常登录，无需私有profile、本机路径、历史任务或离线数据库；目录或当前资格缺失明确不可确定或待验证，不能回落本机型号、临时配置或默认eligible。此修复不开放真实生成，也不新增text_to_video产品intent。

## 事实与假设
当前canonical文生图prompt含valueSources:[local_field,upstream_output]、composition:{kind:content_with_instruction,localRole:instruction}；node_field是请求字段映射，不等于只能本地输入。现共享candidate及Hub公开域不认识两字段，未知判定是真实结构缺口；不得删字段后声称完整域。
RequestV1/CandidateSnapshot已有prompt是最终字符串，没有原始上游正文或来源证据。本片只验证声明可表达规范化prompt与字符串存在，不证明其来源、顺序、角色组合完整性，不由判据重新组合/去重/裁剪/猜用途。领域既有文本组合与来源验收保持；upstream-only等需来源证明的声明仍不解。

## 精确受理域
旧无两字段的槽与请求结果保持原语义。新受理仅单text槽、role=prompt、source=node_field、min∈0/1且max为原允许0/1/null/省略；必须同时有两字段，valueSources为严格dense数组，恰含唯一local_field、upstream_output（集合排列不影响合法性，但原顺序保到公开域与摘要），composition是严格own enumerable data对象，恰有kind=content_with_instruction与localRole=instruction。
缺任一字段、重复/空/未知来源、单来源、其他组合及角色、metadata加在媒体槽、nested多余键/undefined/accessor/symbol/hidden/nonplain/sparse均不得借新分支放行；不消费的语义维持indeterminate或既有更强rejected，不能静默sanitize。媒体约束附在text保持原unchecked，不能转成ready。
已校验合法新声明仅沿当前snapshot.prompt的非空trim存在性计数，min/max合取及所有参数/素材/资格继续同一candidate内判断；不改原字符串和调用对象。显式false/0/null/空参数、完整素材顺序重复角色照旧。

## 公开投影与版本
Hub在inputs[]原位保两字段及nested完整声明，不增V1顶层/branch键，不公开模型/channel/proof/target/purchase，未知整分支继续indeterminate。当前消费端inputs是递归JSON，不另造matcher；补当前真实reader运输/签名反例证明metadata保全，无消费端业务或视觉修改。
完整raw资格domain与mappingDigest包含声明两字段；current/request fingerprints按现语义规则重建。声明变化使current失效、旧hash返回stale；任何资格缺证不因受理声明变eligible，所有preview executable=false。
当前generation-mapping sourceVersion绑定固定13源码，不含实际generation-core产物；本片把同版真实打包判据字节纳入固定source identity，读不到产物failclosed、模块首次加载冻结照旧。不能从工作区package source拼身份或为测试新增可调用hashwrapper；沿同package relativeURL读取lib现正式文件，构建产物只用原build-client生成不手改。

## 最小写集及所有权
业务/类型/派生产物仅packages/generation-capabilities/src/candidate.js、types/index.d.ts，plugins/omnimux/src/catalog/generation-products.js、media/generation-mapping.js、lib/generation-core.js。源码处理尽量内聚在现candidate深模块，不能复制参数/素材匹配或新增一般平台。
加法测试仅packages/generation-capabilities/test/candidate.test.mjs，Hub catalog/generation-products.test.js与media/generation-mapping.test.js，workflow src/canvas/editor/components/generationProductDraft.test.mjs；保全部原断言。文档仅本规格与docs/contracts/hub.md的精确公开输入/版本语义追加；未纳新资料/reader/proof/json平台。
不改YAML模型、listed/research/execution、group/price、Config/route/execute/旧mapper/旧媒体reader或store、UI/CSS/字典、CI/gates/manifest、旧测试期望、#3244树、外部仓/officialDSH。无资格读取器、缓存/token/第二router或执行wrapper。

## 用户旅程与验收
AC1 真已有canonical声明：以正常readIndex与readGroups加载的现有图文生图精确双来源候选核公开alternatives保留两nested字段，不再仅因两字段整枝省略。整体intent/product/preview状态仍按全部当前候选合取聚合，若另枝尚含未知保持indeterminate，不承诺全局降为pending；单独精确分支缺qualification仍pending。新建空创作页→检查生图文生图，公开嵌套声明原文可查看；填非空最终prompt后仍不可执行，空/空白按min保缺文字诊断，不假造内容。真实正常来源目录与完整App同源导航举证，不用封闭合成fixture替代全部真实目录或主页打卡/standalone弹窗。
AC2 源与正式artifact双入口：合法双来源两排列及旧无声明，非空/空/纯空白/可选文字/容量零/qualification pending/rejected分别符合合取；未知/恶意结构都闭锁、不返回assignments/effective，旧hard拒绝优先不弱化。对象冻结/descriptor前后同且getter调用零。
AC3 Hub合成当前mapping/proof仅测试行为非实际资格：公开JSON原位完整元信息，缺资格pending/executablefalse；旧同domain proof不能覆盖声明变化，重复读取fingerprint稳定、语义对象键序不影响、声明值/数组顺序变化失效；旧current请求409需要明确重发，不自动确认。
AC4 实际映射身份：只改任务private复制package generation-core字节，fresh模块身份变化、已加载模块保持旧freeze，缺产物catalog unavailable；在生产固定source中精确纳同版artifact，原13冻结/凭据零读取/单literalgroup/target边界全部回归。
AC5 原消费端transport实际readDirectory/copyTransport保两nested字段、输入原顺序/数据不变；实际current/request fingerprint遇声明变化失效，JSON差异可观察，reader无独立directory签名API，不借asset.source.signature作目录证明。不新增PublicV1键，不改匹配/业务。完整功能页在隔离任务私有正式安装应用走正常登录/项目/会话/创作页，文生图草稿非空、原连接素材和旧三用途收取仍保持，零新execute/供应商POST。
AC6 截图实际展示人眼复检，新的可见声明与实际检查结果先展示按已保人类门；分别保存实际目录JSON、preview.status与issues和页面文案，不将qualification_pending文案当总体pending，因为当前页面文案可能优先该原因。若真实精确branch仍因其它参数/约束未知不可投影，须留逐项剩余阻断与分层证据，不报完整真实目录恢复；空白输入诊断不承诺压过其它未知。新源metadata是权威事实，不能靠UI隐藏。正式runtime绑定base/head/完整源码及实际bundle，场景原PNG留存，自清空间/Host/fixtures/privateDir。合成验证不证明供应商真实生成或Dev人工验收。

## 命令、顺序与证据
任务W=.worktrees/cross-generation-text-declaration-3276内显式workdir，所有Git -C；先spec独审→现有行为测试加法RED真断言→最小实现→原build产物→focused GREEN→相关整包/类型/正式bundle→适用门→完整App旅程→独审→PRrequiredCI/MQ→MERGED三事实→mainff/namedDev字节→本树清理。主检出始终干净只读镜像，不mirror规格、不stash/reset/localmerge/mainpush。
初始命令node --test packages/generation-capabilities/test/candidate.test.mjs plugins/omnimux/src/catalog/generation-products.test.js plugins/omnimux/src/media/generation-mapping.test.js；core source/artifact同测，RED不能由import missing冒充。node plugins/omnimux/scripts/build-client.mjs生成正式core并核源码标记；pnpm --filter @omnimux/generation-capabilities test、pnpm --filter omnimux test，workflow consumer专项并选完整pnpm --filter omnimux-workflow test保护真实DOM。
按node scripts/impact-matrix.mjs --git-diff --base 6b593118843b7b75d905e35c7c970e1d66ce8d07选最小并集；pnpm check:boundaries、pnpm verify:product-baseline、pnpm verify:stages及node --test scripts/verify-anti-slop.test.mjs按真实影响明确执行或理由不适用。复用真实正式generation-consumer-preview E2E入口，但新增E2E文件仅事先验证后再审入，不将DOM改名E2E或旧run当本版。所有cmd > log 2>&1保存真exit与fail/skip/cancel计数，不tail管道报假零。
PR不自label qa:pass、不改required/rules，GitHub正式MergeQueue；不得使用worktree ship默认restart入口，合入后沿已证主干ff+sync-to-app命名omnimux仅Dev/适用workflow按影响同版物化，逐字节source/snapshot/installed与manifest限定路径改写；标准remove只有整range匹配跳重复安装/restart，否则仅合规本树cleanup。生产/重启/凭据引导/付款/跨仓绝不做。

## 测试风格、覆盖与完成判据
现node:test具名业务断言，assert.equal真实结果，静态字串不能代行为；真实source+packagedartifact两入口保证单源一致。修改函数关键分支含负向/边界/descriptor反例，目标修改代码执行行≥80%，必须说明范围，不冒全仓/分支覆盖；所有旧测试不删弱不改expected。
规格及准确Hub合同同版提交，独立源码/公共I/O审查只批准精确freeze；实际源码/运行/PR/MQ/Dev/cleanup分别记录，不用一层替代。完整域/资格/采购仍独立未知，#3247母任务不因此完成，#3249全量存量分类与#3244独立纠正不关闭。

## 唯一旧反例输入迁移
仅允许generation-products.test.js:262旧首个mutate的valueSources由精确双来源替换为['upstream_output']，以持续验证不支持声明整枝闭锁；旧名称、全部断言及其余三个反例原字节不变。其余测试仍仅加法；新增canonical双来源支持测试完整保留。
此例外须独立规格复审后才实施，仅限定该旧输入对象，不许可改expected、删除失败、生产/fixture特判或条件跳测试。迁移后反向一次替换核原文件prefix与HEAD及旧260–269 SHA3f6743b90e49075497dab74df9f98772809fe3f07587b2e1b05bbe903e697418，整旧文件SHA6a152dc476a98bcd64182a0a9f8858d620f3feb4af5f3bb5dde671f05f9eef85。原失败与初次两审仍保各自身份，不伪装旧绿续签新规格。
