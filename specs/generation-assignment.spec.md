# #3256 共享完整素材分配

## 目标、授权及前置
用户已批准#3247统一角色生图/视频实施，本切片是#3250子项，依赖#3255/PR#3257正式合入；未取得MERGED收据前只规格，不复制开放PR源码、不实施。本树已由父真实ff取得base9d617d99bf68c958bc2ba337d9bf447cbed06819；PR3257 MERGED mergedAt2026-10-08T13:34:51Z，读取的是该正式底座。目标是修可满足素材组合被顺序分配误拒，以一个共享引擎替换Hub独立greedy/aggregate，保留原入口DTO/Map与旧任务用途。
本稿已按assignment-spec-review.md的F1–F6设计复核收紧；该报告是设计推导不是测试证据。

## 新用户基线与边界
新用户正式Hub包含真实内联bundle，缺产物明确拒绝，无开发机源码fallback。pure包零运行依赖，无Node/HTTP/React/环境/凭据/计时/随机。既有guard/profile/parameter/admission/任务收取不改；候选、多组求交、参数OR域、上市资格、成本排序及全部UI/画布/viewer/apps另层。无公开schema或用户数据迁移，旧video_edit/video_extend/digital_human不被重新推导，无在途标记回填。

## 精确接口与返回
共享包根solveAssetAssignment(operation, assets, context={}, policy={})。policy仅strategy:'legacy'|'strict'、mode:'full'|'accept'、maxStates；缺省legacy/full/100000；maxStates正安全整数，非法policy或枚举TypeError。context仅prompt/duration。未知无关字段不消费、不声称被验证；channel constraints/valueSources/composition/参数不偷偷纳入。
单素材及aggregate各自唯一纯判据，旧aggregate迁入并调整下述已明确combined-only漏检；删Hub重复greedy/aggregate判断体。原validateAssetAgainstSlot公开外形/异常保持，strict内部包装复用同predicate再补明确strict政策，不复制全函数。内部域检查compatible|pending|rejected，unknown元数据是软域而不是丢弃素材。
Result判别联合：ready {bindings,buckets,rejections:[],pending:[],visitedStates}；pending {完整bindings,buckets,rejections与typed pending项,visitedStates}；rejected {bindings:[],buckets全空,rejections非空,pending:[],visitedStates}；indeterminate {bindings:[],buckets全空,rejections含operation_incompatible,diagnostic:'search_budget_exceeded'|'completion_unproven',pending:[],visitedStates}。失败只提供不可提交的空见证，不泄露可被误用的partial bindings。所有私有Result都有uncheckedConstraints窄typed数组，仅{constraint:'combined_output_ceiling',slotIndex,field:'outputDurationSec'}，只在实际因未知output跳过时设置，独立于pending/rejections；旧公开facade仍四字段，不以注释冒称已携带未检查诊断。ready/pending每个纳入媒体恰出现一次，保留重复object引用。
assetIndex=原assets下标（null/text不重编号），slotIndex=原op.inputs下标（包含text）；bindings按assetIndex排序，bucket长度=inputs长度，text桶[]，各桶按assetIndex排序。binding含assetIndex/slotIndex/slot/role和原asset，后端facade恢复 {slot,role,type,pathOrUrl,asset} 和声明顺序Map。输入数组/资产/槽/role永不修改/去重删除。
Pending项有code:'metadata_unknown'|'min_unsatisfied'|'prompt_required'|'operation_incompatible'、diagnostic?:'intent_required'、assetIndex?/slotIndex?/slots?、field?:'mime'|'sizeBytes'|'durationSec'|'outputDurationSec'、具体min/current/limit；稳定旧GUARD_CODES不加枚举。invalid_metadata与malformed_contract用operation_incompatible+明确diagnostic与字段；legacy原单素材非法数值异常保留。

## 声明与单素材规则
1. 输入沿legacy只纳入truthy asset且type truthy非text。inputs属性缺失/非数组是malformed，显式[]合法零媒体操作；槽必须非空唯一slot名，min缺省0，max缺省或null=unbounded，显式Infinity/NaN、负数、非整数、min>max均malformed。数量为安全整数，text槽也校结构但不分配媒体。group须slots非重复真实槽名数组、min缺省0且非负安全整数；空slots仅min0合法；group.min大于总media槽容量为确定结构无解rejected，不能pending。
2. 每素材域由共享predicate、type、target/role确定。target精确槽名优先，只有无精确名再alias；显式不存在硬拒不移动。legacy role无匹配槽保留原type fallback、target覆盖role历史选择；strict role-target矛盾拒。strict语义槽first/last/source/mask/audio_track等必须传入对应role或target，否则intent_required软待选，不用图数量/排序猜用途。这里只按传入显式字段判，不证明normalize默认role来自用户；后续strict上游必须保证真实来源。reference中性域可自动分配。
3. strict非空allowedMimes遇未知MIME→metadata_unknown(mime)软域；已知不支持MIME硬拒；allowedMimes[]无格式限制。受限制的size/duration未知软域保留，负数/NaN/Infinitystrict硬诊断而不崩溃，legacy沿旧单素材函数异常。对每asset-slot失败不是全局失败，须看所有域。未知duration不得当0证明上限或下界。

## 一个引擎的选择、完整性及兼容
4. legacy preferred见证阶段按原asset索引与动态underMin→reference→rest偏好，显式target始终硬约束但此选择阶段不强制提前消费；使用同一个state/域/容量/aggregate validation，不留下旧独立greedy判断体。该见证完整ready即保留原成功绑定及顺序；失败不终止，不用其ok绕过共享核。后续完整搜索才先固定所有显式asset，再以最少合法域数/原assetIndex打平/槽声明顺序进行确定回溯。preferred、完整搜索同预算。
兼容准确口径：合法旧成功见证优先、asset身份/Map/顺序保留；旧失败改成功是本层修正，不保留错误。combined-only已知超限的旧假成功是明确兼容例外，下条修正。旧单一原因失败的code/message/载荷保留，允许新增indices：已知累计上限/combined保留原total/output/ceiling与exclusive；已满known totalMin仅原单条优先，不重复reachable原因；unknown或未来有限上界不可达仍独立硬拒。唯一合法槽容量耗尽保留slot/max与原消息；role无type域保留role/type，无role保留operation incompatible/type。新组合无解诊断确定即可，不展示首greedy分支假作全局证明。
5. 搜索联合容量、slot/group下限、累计时长与combined。数量/已知非负时长上限保守剪枝，ready下限剩余可达剪枝；完整叶统一核验所有约束。inputGroups参与可行性，不是仅greedy后的检查。累计totalMin/Max及exclusive沿原语义，仅非空桶生效。combinedOutputMaxDurationSec为独立约束，即使没有totalMin/Max也检查：已知input6+output5>ceiling10，legacy及strict均硬拒（上述明确例外）。非空桶combined需输入时长未知pending；strict full必要output duration未知pending，legacy以及mode accept缺output沿旧不检查，但必须诊断未检查output ceiling，不宣称已证明combined。空桶沿旧不检查仅output超过ceiling，不扩大输出参数领域。
6. 搜索全局终态：任一无缺项完整合法见证ready可停止；没有ready且相关搜索穷尽，同时有保留全部已选媒体、无已知硬冲突、缺项可补的见证→pending；穷尽且无此见证→rejected。任何仍可能改变终态的状态未检且budget耗尽→indeterminate，即使存过pending。结构或explicit确定全局矛盾可以搜索前rejected。soft未知域与ready域都保留，不用unknown的硬结果过滤成无槽。
全局归并精确顺序：存在ready立即选；仍可能改变终态的预算截断search_budget_exceeded；穷尽后存在已证明pending见证则pending；否则任何seenCompletionUnproven叶存在则completion_unproven；剩余才全局硬无解rejected。不得遇首unproven停止漏后续ready，也不得把未知补全折false。已排除当前ready且有已证pending时其他仅补全未证明叶不强制indeterminate。测试补首unproven叶后ready叶胜出及uncheckedConstraints类型断言。
缺slot/group min的pending须证明可补：单纯数量约束用实际剩余容量/槽域与group联合补全可行性（复用同搜索状态，可用符号占位计数不制造素材数据）。数量补全可对只有时长上限且允许非负零时长的槽给窄存在证明，不生成假素材；涉及正时长下限或totalMin的未来补全不作该证明。有关totalMin的缺项：已选时长区间上界加剩余容量×有限单素材时长上界仍低于min（exclusive下限在相等时亦不可达）→rejected；总时长exclusive上限与下限相等也为硬矛盾。单槽失败只排除该分配，不能压过其他槽ready。没有有限单素材上界或范围不足以证明存在可补解→completion_unproven/indeterminate，不假pending、不假rejected。已chosen未知元数据且无已知硬矛盾可以pending等待元数据，但已知约束若证明任何补值均不能满足必须rejected。不让未知input伪装无限支持。
mode accept：同引擎只看已知输入硬上限/可吸收及其缺项，不要求slot/group min或promptready。facade operationAcceptsAssets only ready或pending仅缺min/prompt可oktrue；unknown metadata/intent/budget都okfalse，不吞indeterminate。requireMins:true映射full。
7. 预算单位=每次进入一个assignment/search state计1（root也计），扩展/验证进入前扣预算，visited<=maxStates；preferred每次新增asset后的state以及最终完整validate进入另计，所有ready/pending/数量补全搜索共享唯一counter，不每阶段重置。schema/domain建立不算搜索状态，故不承诺CPU计时上限；没有所有大输入终局承诺。budget1对应2asset非平凡分配root后扩展无法完成→indeterminate。无计时/随机/timeoutcatch。使用有限状态而非调整greedy当完整解。

## facade与类型
Hub assignAndValidateSlots保留ok/bindings/bySlot/rejections四字段，legacy/full显式传policy，只有ready oktrue；无需公开新增status，budget首项稳定operation_incompatible+diagnostic。operationAcceptsAssets使用同引擎上述accept规则。不得隐去metadata/budget后判绿。typed OperationSlot/InputGroup/Context/Policy/Result明确diagnostic及indices，理由复用原AssetRejection+indices与assignment-only窄union；pending按code/field/diagnostic限定，metadata_unknown不得field inputs。duration分单素材max/min、known累计与有限可达/矛盾诊断变体，不强制所有变体拥有同一字段。零私有Hub类型进入pure包。

## 测试策略（先真红再绿）
新增assignment.test.mjs；PNG先来A通吃/B仅PNG，所有序列均可满足；普通先来后targetA；group需B；audio3/3/2/2各5回溯。旧成功A/Breference min1max2，x普通/y目标A/z普通应保留xA/yA/zB；preferred失败后回溯可ready、MRV不改变旧成功。text/null穿插原索引、重复source两角色原引用保留、strict语义不猜/target-role冲突、legacy override保持。
未知metadata软域与已知MIME硬拒混合、ready优先pending、存pending后budget耗尽indeterminate；group min超总capacity rejected；totalMin已满不可补rejected/未知补值completion_unproven；combined-only6+5>10拒、unknown input pending/strict未知output pending、accept输出不声称检查。单原因旧payload、Map/identity覆盖。
独立小规模oracle不用production solver/check helpers：枚举最多4asset×3slot全部assignment，自己判已知合法标准化counts/MIME/explicit/role/group/整数时长，比较ready存在性，真实caseCount>0，包含可满足/不可满足/实际asset经独立type/MIME/target/role筛选后域≥2的案例且全部顺序对照，扩展totalMin/combined/per-duration/role维度。充足budget的全已知枚举只承诺ready存在性布尔一致，不把未来补全未知终态算成ready证明；有限硬无解、exclusive端点、无有限上界unproven及pending/budget/legacy绑定终态另用上述matrix，不用同solver两遍自比。纯度旧gate持续加入Date/performance/Math.random及别名负样本；不执行恶意片段、不弱化旧断言。

## 写集、风格、文档
pure src/assets.js,index.js,types/index.d.ts,package.json(test含assignment)，新增test/assignment.test.mjs；Hub submit-guard/slots.js；现generation-core-package.test.js仅必要新导出/纯度/兼容预期反例；正常lib/generation-core.js仅正式build生成；spec。旧单素材测试不修改。若assets深模块太大可新增assignment.js，但必须先在本spec明确并同步正式build digest源码清单和packagepurity枚举闭包，不留漏指纹源。
原生ESM JS/JSDoc+d.ts、输入不可变、稳定indices，复用已有规则，限制scope。规格拥有private纯接口，旧公开seam形状不变无公开合同变更；如果真正新增公开字段先补Hub normative合同再审。

## 命令与交付
node --test packages/generation-capabilities/test/assignment.test.mjs先真实红；pnpm --filter @omnimux/generation-capabilities test；Hub scripts/run-tests.mjs及相关slots/guard；正式node plugins/omnimux/scripts/build-client.mjs与纯度/packrelocation/缺源缺产物/新鲜度；JSDoc strict及typedconsumer；boundary/product-baseline/model --strict/modality/impact无UIbrowserfalse、隔离动态HTTP实际路由/guardfinally关server；git diff --cached --check。bash明确workdir/git-C，日志真实exit后读fail/skip。
spec→反例→实现→oracle/type/build/包测→冻结独审→当前requiredCI/MQ确认MERGED→mainff→既有sync-to-app Dev仅omnimux无重启三方字节→清自有tree。父#3250/#3247保持OPEN。不得触#3244工作树/供方模型/凭据/上市/价格/生产/其他仓/重启/APIvideo；未合入不进Dev，不强推主干/删测试/抹失败。solver通过不等于上游支持或真实生成。回退整个PR恢复旧facade+bundle，无用户数据迁移。
