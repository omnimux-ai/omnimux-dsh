# #3270 中枢权威生成产品视图与无状态预检

## 目标、前置与用户旅程
父目标#3247；前置#3267/PR3269正式MERGED。任务工作树`.worktrees/cross-generation-authority-3270`、branch `agent/cross-generation-authority-3270-issue-3270`；固定HEAD/base `5833da5f4cd04bfeff22c1d06185c0c2551700fd`。先规格独审，再行为源码；普通事项/PR/官方队列/开发物化沿既有实施授权，不追加生产、界面合入或真实视频授权。
用户建立角色→提交角色图与参考动作→生成角色视频→导出；普通用户只见生图/生视频及明确用途，不能选择或传内部模型/分组。本片只完成服务器权威能力目录与完整请求预检，供应商调用恒0，不改变现消费端、不声明业务生成成功。
新用户基线只有正式打包中枢、内置规范目录及现Host请求授权；不依本机端口/设置/缓存/本地模型/开发资料。缺当前来源明确未证，缺Host连接503；不凭listed、文档地址、live profile或测试绿把新产品开放。

## 一个Module的小Interface与归属
单一Hub `catalog/generation-products.js` owns当前权威快照读取、候选投影、逻辑来源冻结、完整指纹及公共白名单结果，外部seam `generationProducts={list(),preparePreview(request)}`；同一Interface供调用者与测试使用。依赖接收现规范索引读取与真实组读取，不复制合同loader/音色物化/参数成员/素材分配/路由。
GET `/omnimux/generation-products`与POST `/omnimux/generation-products/preview`仅加法挂载现Host；不改旧modelCatalog、media seam、编辑/延长/数字人/在途收取。无submit endpoint、准入token、签名/JWT、TTL Map、请求持久缓存、独立账号体系、unused路由flag或恒拒包装器。
正式文档owner为`docs/contracts/hub.md`，新增版本化请求、结果、拒绝及Host授权；规格不是新上市或真实资格凭证。公共产品policy只声明`generation.image`/生图与`generation.video`/生视频，公开新用途沿真实registry id/label：生图text_to_image、image_to_image、multi_reference；生视频video_multi_ref、first_last_frame。此为已批准新任务产品用途白名单，旧用途及旧入口保持，不是consumer隐藏表或根据型号名猜操作。

## 权威快照与资格（不扩大证据）
每次list/prepare读取一次当前正式规范合同快照、registry全部规范id、音色已注册来源物化结果、真实channel group原始声明以及必要非秘密私有映射语义。loadAll同次已物化options可复用，不能将公共DTO当资格源；读取失败不返回空成功。所有候选在这份快照派生，已证输入不在循环中重新读默认或修改。
每个候选私有身份绑定canonicalModelId、channelId、realGroupId、wireGroup、wireModel、operationId、purpose、protocol和当前mappingDigest；字段缺来源不得自造。组必须当前存在且明确启用，不使用resolveChannelPlan跨组tail或禁用head。只从规范operation.output.type与真实registry匹配产品，不从品牌/前缀/素材数量推断。
资格必须有当前active真实证据与该身份相等，证据包含固定sourceDigest/官方文档版本身份、mode live任务身份、适用完整输入参数域及可核对输出事实；历史一次样本不证明更大域。当前已读取证据尚无可直接复用的完整资格resolver，生产来源缺失严格pending，不读取任意研究地址或另造持久证据平台。测试私有依赖可注入明确fixture验证eligible与陈旧身份，但绝不写生产active/listed。
确知disabled、身份/用途不匹配为rejected；只是缺字段/缺样本/未绑定当前映射为pending。资格hint仅由服务器派生再传共享core；公开请求eligible/source/默认已解析均非法。所有适用候选仍调用共享core收集完整请求硬证，缺资格不提前跳过判断；一个候选失败不盖另一待判候选。
本片不定采购序、不返回采购status或金额、不读采购配置；未知当前可比进货价不等于0/free，积分/权重不得当采购证明。后层执行须明确单真实组，只同组合格渠道按已核可比采购价低优先。

## 完整请求、默认来源与纯核复用
RequestV1只接受schemaVersion:1、currentFingerprint、productId、intent、prompt?、parameters和assets；parameters是显式逻辑primitive字段，不接收parameterSources/defaults/constraints/model/group/route/credentials/taskId/dest。未知版本/顶层键或不在产品policy的intent拒绝，不静默sanitize。
assets保持全部原数组项、顺序、重复、身份和角色；白名单字段type?、pathOrUrl、role?、targetSlot?、mime?、sizeBytes?、durationSec?、sourceNodeId?、edgeId?、outputId?、outputVersion?、originalName?、dimensions?（仅width/height）。类型未知不能默认image/先过滤；缺分类沿core未证。身份声明不是服务器真实性凭据；不在本片查询用户磁盘、下载URL或借合成版本补齐。pathOrUrl仅规范非空字符串、不能在判决中更换素材；后续上游实际调用只免鉴权公网HTTPS。
HTTP/进程seam输入都只plain/null own data稠密JSON域，拒访问器/hidden/symbol/额外数组属性，getter不得调用；不扩至恶意Proxy安全平台。额外资产字段/嵌套对象不接受任意meta。prompt与parameters.prompt不得分叉：若同时存在必须exact相等，一份显式值冻结一次；空串/false/0/null仍显式，undefined在进程请求明确按absent，JSON不含undefined。
按既有参数整字段operation覆盖model语义形成每候选defs。registered options同快照物化后只有value/label进入core，未知optionsFrom不可洗成域；不重算步长/复制域表。候选group rawconstraints必须全部消费，未知约束保indeterminate，不能只pick支持键后丢未知。
唯一logical snapshot在候选判断之前形成。所有适用候选每字段均无默认时absent；均有同标量默认且同已证定义来源时才definition-default；任一缺默认或默认冲突时不挑候选默认，parameterAuthority unresolved。显式值原样保留，未知参数仍由core拒；group fixed/only不得重写请求。每字段explicit/default/absent完整own记录与冻结值same-exact，并通过共享候选原来源门。
如果现evaluateDeclaredParameters只能逐候选注default，不把它用于重建请求；参数合并遵循原同一whole-field覆盖，不新增成员/默认计算helper核。仅服务器必要的来源一致性收集与安全数据投影归本Module，最终值合法性一律同canonical checkParameterMember/evaluateCandidateRequest。
先冻结全部显式值（包括声明存在性运输的显式prompt），仅未显式供应字段进入默认共识。已显式字段不因候选default缺失/非法/冲突/来源差异标unresolved，原非默认域照canonical检查；全局authority仅由未显式且需默认而无法共识字段置unresolved。字面A/B同number域defaults5/15、explicit n=7且其他完整/资格eligible须ready且无default_ambiguous，同请求省略n为pending、不公开effective默认；explicit域非法仍rejected。默认来源可比较身份明定为同一productId/intent/policyVersion及已合并definition的规范非默认数据摘要；只有每个适用候选该字段都存在、有primitive默认、摘要相等且默认same-exact，才冻结default。未证定义/非法默认/默认或来源摘要不同标unresolved，不作为请求值。给core的请求判断defs只安全副本移除defaultValue（全部候选统一），其他成员语义原样；原完整定义/默认来源仍参与当前指纹，不重写原索引或修改core。core从此只检查已冻结请求值，不用其候选default回退制造请求硬拒；已冻结默认仍由原其余定义域canonical检查。A options[]+default5/B default15、省略n时不得因未采用default5产生parameter_nonmember，合法only[]独立硬证仍拒；显式5仍按原options[]拒。A default5/B无default为unresolved/pending不生5，全部无default为absent。
参数名union先从所有适用candidate的whole-field合并defs形成，public parameters的union外own键为独立unknown-parameter/rejected，绝不过滤。所有显式参数在每候选完整保留；A声明n/B不声明、explicit n仍让B由coreunknown_field拒。顶层prompt是独立文本运输来源，只有该candidate声明prompt参数时才在其运输视图logical/source中加入同一已冻结prompt值；未声明prompt参数的candidate仅用snapshot.prompt，不注入新参数或定义。这个唯一允许的候选运输视图差异只由声明存在性决定，预先创建，不选默认/不修改值；原logical快照、explicit parameters和资产始终完整保。若调用者explicit parameters.prompt，本字段不得因候选无定义而删，未声明候选照常拒。top prompt与parameters.prompt不等独立rejected，相等只用同一值；只有parameters.prompt时同一值成为snapshot.prompt，无新文本。真实生图仅prompt槽而无prompt参数、top prompt='x'/parameters={}须pending资格而非unknown_field。
每个单model+group+op规范投影只含core五必需键；private identity/proof/mapping不得塞core。一次原assets数组、同logical snapshot交evaluateCandidateRequest（strict/full既有分配、原预算），不再DFS/union或按候选删图/改值。knownOperationIds取同快照registry完整冻结id集合而非listed子集/公开caller。

## 白名单公共结果、判决和指纹
ListV1={schemaVersion:1,currentFingerprint,products:[{productId,label,status,intents:[{intent,label,status,alternatives}]}]}。alternatives仅已证明可以准确投影的完整规范声明分支（inputs/inputGroups/parameters/output）；按全部相关域等价去重，不泄model/group/候选数量，不union min/max/options或拼独立字段。未证资格的声明分支标pending，不是allowed承诺；无法完整消费约束的分支不可宣称已列能力，也不伪造通用schema。
Public input/parameter/output字段必须正向白名单，labels取正式registry/明确产品copy，options只primitive value及安全label；不得透传help/meta/notes/proofURL或自由诊断。所有status/错误code固定公共枚举；field只来自已声明公共参数名，assetIndex保原index，不输出私有slot/group/身份证据。
AlternativeV1精确为{status,inputs,inputGroups,parameters,output,constraints}，六键均必需；constraints为同一候选core支持的operations/parameters/inputs正向白名单数据，子键only/fixed/supported及每媒体max原标量保留，不以域代数改defs、clamp多槽或range/options求交。相同defs但only5/only15/fixed15/max1/max2须不同完整分支，域等价去重包含constraints。未知约束、非法已知约束或无法准确公共表达语义时该分支不列完整alternative，intent保持indeterminate；不把未列分支悄悄过滤后宣告available。H3 range4–15/default5+group fixed15公开为该原域与fixed15的合取，参数defaultValue不对外承诺；消费端必须读取整个分支，不能将5标默认/允许。两个同类槽各max2且group总max2原样保跨槽cap，不承诺4。
PreviewV1={schemaVersion:1,currentFingerprint,requestFingerprint?,status,executable:false,issues:[{code,field?,assetIndex?}]}，status保ready/pending/rejected/indeterminate区别；ready只说明完整预检通过，不是可兑付授权，生产缺资格不得ready。任何失败均无assignment/effectiveParameters/vendorPayload/private identity。
整请求候选聚合：任一合格checkedready→ready；否则有indeterminate→indeterminate；否则有pending→pending；只有所有适用候选已证hardrejected→rejected。适用规范候选集合合法为空明确pending/unavailable，不用空every制造rejected/ready。原core每候选hard→unknown→pending优先保持。输入自身硬malformed/非法产品用途或版本为独立rejected，不需猜候选。
currentFingerprint为完整不截断SHA256：版本/policy+旧合同content covered语义与同次registered options+registry+私有候选当前mapping/wireModel/protocol/group enabled/全部constraints/default来源/资格证据身份active。每次重取私有真源并重算，不只复用load YAML memo或旧公共hash；仅必要非秘密白名单投影，不将credentials、任意settings原文、endpoint/token或购买金额塞hash。规范object key顺序变化不影响，语义数组顺序保。
requestFingerprint覆盖currentFingerprint、完整冻结逻辑值与来源、所有原序asset白名单身份/角色/元数据/选择结果、product/intent；hash仅变更检测非授权。currentFingerprint不等请求值则HTTP409公共stale结果（status pending/executable false/currentFingerprint）；不沿旧默认判或自动接受新状态，调用者需重发完整请求。伪current哈希仍重建服务器事实并完整判断。

## V1精确类型、枚举与有界字段
唯一进程运输例外：仅可选top prompt和参数名union内已声明parameters字段允许own enumerable data值undefined；先验descriptor/getter0，再安全快照按未供应处理（仍可进入未显式默认共识），与省略字段同来源/同requestFingerprint。此为JSON域与Primitive的唯一例外，不改caller原对象；unknown参数键包括unknown:undefined先unknown_parameter拒，必需top键/资产任何字段/其他嵌套undefined一律invalid_request。HTTP JSON严格Primitive不含undefined。字面n:undefined与省略n、prompt:undefined与省略prompt同快照hash；未知/必需/资产undefined固定拒，原引用/prototype不变。
下列records一律plain/null own enumerable data、额外键/hidden/symbol/accessor拒；arrays稠密且无额外键。非空string是原值.length>0且trim后非空，但不改原值。Fingerprint仅64位小写hex；schemaVersion仅数字integer1。Primitive仅string/boolean/finite number/null。Request六必需键schemaVersion/currentFingerprint/productId/intent/parameters/assets，prompt可选string；parameters是开放字段名→Primitive记录，合法声明__proto__/constructor/toString安全own往返，无名称黑名单。
Asset必需pathOrUrl非空string；type可省或非空string（未知string留core拒/未证，非string独立malformed）；role/targetSlot/mime/sourceNodeId/edgeId/outputId/outputVersion/originalName存在须非空string，outputVersion明确opaque string不合成整数版。sizeBytes存在可null或非负safe integer，durationSec存在可null或非负finite number；dimensions存在须仅width/height两必需positive safe integers。字段省略与null区分且入requestFingerprint，不能把缺元数据标已证。
List顶层三必需键schemaVersion/currentFingerprint/products，products固定两个完整Product键productId/label/status/intents；Intent必需intent/label/status/alternatives；product/intent status枚举available/pending/rejected/indeterminate。alternative status枚举pending/available（只是声明资格状态，available仍非执行许可）；有未表达未知分支优先indeterminate，否则任合格当前分支available/任待资格pending/全硬拒rejected，无候选pending。标签仅固定产品copy与规范registry安全label，不透私有自由文本。
Input完整分支白名单slot/type/role/source/min/max/allowedMimes/maxSizeMb/maxSizeExclusive/minDurationSec/maxDurationSec/totalMinDurationSec/totalMaxDurationSec/totalMinExclusive/totalMaxExclusive/combinedOutputMaxDurationSec，slot/type必需、role/source按原声明可选；type仅text/image/video/audio，source仅user/upstream_edge/node_field；counts为非负safe integer，max允许null，省略与null保持原core语义；MIME null或非空唯一非空strings数组，size/duration有限非负数/exclusive boolean，采用共享core原检查不第二数值算法。inputGroups元素仅slots必需唯一非空strings引用、min可选非负safe integer，hint私有自由文案不公开；无法无损语义投影为indeterminate不漏constraint。
Public parameters为开放已声明field→{type?,options?,range?,supported?,allowAuto?,caseInsensitive?,minLength?,maxLength?,unit?}；type integer/number/string/boolean，options稠密Primitive或{value:Primitive,label?:安全string}（无meta），range仅finite min/max/positive step按原canonical域，length非负safe integer、flags boolean、unit仅已规范安全string。无defaultValue/help/description/optionsFrom/URL/notes：默认不作为分支允许值或公开推荐。原默认与已证域仍私有fingerprint；合法特殊参数名保own identity。未知域无法物化则不列该分支而非抹未知。constraints三可选键operations（registry规范id数组）、parameters（field→{fixed?:Primitive,only?:Primitive[],supported?:boolean}）、inputs（image/video/audio→{max?:非负safe integer}），非法原constraint保core未知/拒，不借投影补值。
Output必需type=image/video且等产品；可选allowedMimes（null或非空唯一strings数组）、min非负safe integer、max非负safe integer或null，min≤max。只该四键；未知有消费语义的output字段不能丢为完整alternative，标indeterminate，未声明count不补。
Preview必需schemaVersion/currentFingerprint/status/executable:false/issues，requestFingerprint只在完整快照可形成时出现且为Fingerprint；issues稠密{code必需,field?已声明公共参数名string,assetIndex?非负safe integer}，无message/detail/slotIndex/rawvalues。Status四值ready/pending/rejected/indeterminate；code封闭invalid_request/unsupported_version/unknown_product/unknown_intent/unknown_parameter/catalog_unavailable/stale_fingerprint/request_too_large/qualification_pending/qualification_rejected/default_ambiguous/parameter_invalid/parameter_unresolved/input_invalid/input_pending/input_unresolved/unavailable。core code按参数nonmember/empty/fixed/disabled→parameter_invalid、参数/source未知→parameter_unresolved、素材hard→input_invalid、pending→input_pending、未证→input_unresolved；资格和default对应同名公共码；任何未列corecode默认input_unresolved，不透原未知码或私有field。HTTP授权拒只保status及固定error，不回传本产品目录/身份；catalog异常503/code catalog_unavailable，输入非法400/code分类、合法预检200、stale409、oversize413。
来源定义/内部身份不在公共schema内；此节只冻结运输表达，不新增通用schema平台、数值域或匹配算法。

## 鉴权与零副作用
GET/POST都使用现requestRejection(req,getConnection)先Host授权与精确同源，缺connection503/跨源或未认证拒；真实mount传getConnection，不默认undefined宽放。纯预览不调用identity.require/status（可能/self+写profile），不访问auth/provider网络、用户设置/凭据或任务状态。
HTTP解析复用现readJsonBody/sendJson及请求拒绝helper；新增正向白名单结果，不把secret正则/CORS当鉴权或脱敏充分证明。未知method404。预检错误有固定公开code，source异常503无raw details/内部路径，零空catch伪success。
仅新POST的UTF-8 body上限固定1048576bytes（1MiB），先Host授权再读取；超过立即停止累积且HTTP413/status rejected/code request_too_large，无预检调用。现readJsonBody无上限并非已有保证：允许现helper新增可选maxBytes参数及明确超限结果，旧调用缺参数保持原行为；不新增第二JSON parser/依赖/安全系统。auth/http-routes.js及其现test只此兼容加法纳入写集，未认证/跨源请求body读取计数0，边界1048576与1048577字面测。

## 成功标准与测试策略
新增直接字面门：同defs不同only/fixed/总媒体cap是完整不同alternative，H3 fixed15不承诺default5，多槽总cap2不承诺4；未支持约束wholebranch不列能力且未证保。合法__proto__/constructor/toString参数own往返getter0/prototype不变，public V1缺必需键、非法primitive/尺寸/版本/unknowncode均固定拒；最大JSON体两边界与认证先body计数0。
独立字面测试从公开generationProducts list/preparePreview及真实挂载HTTP跨同Interface；fixture明确合成且依赖注入计数，provider/auth network/task/file writes恒0。
AC1 现listed+verified docURL+live profile缺精确当前proof仍pending；合成同身份active适用域+完整合法请求ready但executable false，fake公开eligible拒。
AC2 A组参数满足但图数失败/B组图满足但fixed值失败，不得拼ready；另C合法但缺资格应pending而不是被A/B硬错盖拒；候选总为空pending。
AC3 group-disabled硬拒、only[]硬拒/已知固定值冲突在每候选缺资格时仍拒；坏source/未知约束/未物化options保indeterminate，不被pending盖；所有硬拒才请求rejected。
AC4 模型与op参数整字段覆盖；跨候选default5/15或一方缺default不可选一方默认，快照unresolved；explicit5不自愈fixed15；false/0/null/空串原值及exact来源保。
AC5 原资产未知type不变image、缺type不消失、稠密顺序/重复/上游node edge output版本/角色/targetSlot/MIME/大小/时长/尺寸任一改变requestFingerprint变化；输入descriptor/getter0/原引用不变，失败无执行projection。
AC6 只改wireModel/protocol/enabled/constraints/证据identity active/default来源/registry/registered options任一currentFingerprint变化，原covered契约字段仍变；仅object键序不变，private secrets不进DTO/hash/log，旧指纹409。
AC7 公共目录两产品及正式intent，无model/group/wire/profile/endpoint/purchaseCost/evidenceURL/账号/raw diagnostics，私有fixture标记反例核JSON输出；未知版本/私有字段/额外meta拒，参数schema输出不拼域。
AC8 真实Host mount+HTTP GET/POST跨源/未认证/缺connection按现拒，认证预览实际结果符合本规范；新路由真实provider/auth/task计数0。旧catalog DTO与旧media/edit/extend/digital_human/inflight固定回归不变。
测试先真行为RED（不是入口未实现import失败）→最小实施→green；旧assert/负门不删弱。正式runner真实exit/count/fail/skip/log非空读取，不tail假绿。纯核package不改/不重建第二builder。

## 项目结构、风格与命令
预计写集仅Hub catalog/generation-products.js与对应test、catalog/http.js和对应test、host/apply.js/host/http.js必要挂载及既有测试、auth/http-routes.js与对应现test仅JSON helper可选字节上限加法、docs/contracts/hub.md与本spec；需要更宽写集先记录具体原因并重审规格，不改模型YAML/group策略/config/价格/purecore/consumer/UI。
遵循Hub ESM具名导出、JSDoc关键输入/返回类型、现同层2空格风格；现Interface实例为registerCatalogRoutes(webServer,deps)和requestRejection(req,getConnection)，保持依赖由caller给、结果对象返回，错误不透传私有对象。新依赖0。
工作树先`node --test plugins/omnimux/src/catalog/generation-products.test.js plugins/omnimux/src/catalog/http.test.js plugins/omnimux/src/host/apply.test.js`（前两test计划新增，后者现有）；随后在plugins/omnimux cwd `node scripts/run-tests.mjs`。根边界`node scripts/verify-plugin-boundaries.mjs`、`node scripts/verify-product-baseline.mjs`、`node scripts/verify-model-contracts.mjs --strict && node scripts/verify-modality-matrix.mjs`；已实读package.json49/50/68核此真实入口。`node scripts/impact-matrix.mjs --git-diff --base 5833da5f4cd04bfeff22c1d06185c0c2551700fd`；Git均`git -C W diff --check`。不test:all或重复已绿原purekernel；无UI则browser不适用。

## 三层边界与收尾
总是：规格独审先行、真实来源、单候选全请求、当前状态重算、旧用途保全、正向脱敏与Host授权、真红绿日志、当前冻结独审与正式required/官方队列。先问：新依赖/破坏迁移/实际外部成本/凭据配置/生产/超本目标或用户保留UI合入/video专项。绝不：裸模型执行、跨组补能力、凭证泄露、未合入Dev链接、重启桌面、改上架假激活、真实供应商调用、弱门禁、跨仓写。
通过本片仅权威目录/预览，后续真实资格激活、可比采购价证明、实际执行和消费界面另片。当前规格待双方向审查；不把设计报告建议签成批准。
正式收尾：审定freeze→PR/当前required实际24包归档→官方MQ真实MERGED→main只ff→命名Dev无restart并source/snapshot/installedidentity→仅自树branchclean，保存父持久报告。开发版Host运行归用户自然启动/人工验收，不冒物化或HTTP200等于业务生成。
