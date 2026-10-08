# #3264 参数成员核最小纵向切片（实施规格）

## 目标与依赖
父#3262完整候选蓝图的第一个可交付子片，依#3256正式MERGED后读取固定公开接口/快进方能实施。前置#3256/PR3263已正式MERGEDdf2ab2ad9b2dfbafc2f6f4ecfaf26c8a3403c530，本任务同base；不新增候选API/产品开放/组求交/采购路由/UI/上市/真实生成，不修改其他工作树或凭据/配置。参数成员判据贯通共享源码→正式Hub内联包→原guard请求入口与schema默认入口，修options/range二验误拒且不留第二算法。

## 深模块与精确接口
在现generation-capabilities新增src/parameters.js并root导出/type；checkParameterMember(definition,value,policy?)返回member|nonmember|indeterminate，窄diagnostic malformed_definition/unresolved_options/precision_unproven及field不携model/profile/secret。evaluateDeclaredParameters(request,operationDefinitions,modelDefinitions,policy?)一次op整字段覆盖model、来源/默认求值+每成员核，不修改输入，返回okvalues或typednonready原因；接口最终命名由实施冻结但语义不得隐式迁移。
policy省略默认{mode:'canonical'}；仅普通对象{mode?:'canonical'|'legacyGuard'}且mode缺省canonical，禁止额外policy键、数组/null/非object/未知mode一律TypeError；同一域核只有薄参数输入提取政策差异。canonical字段必须声明，null/空串显式域检；undefined absent、false/0有效；legacyGuard保原未知transport字段忽略、null/空串未供、supportedfalse但未供原默认可输出的窄历史政策、返回形状/字段顺序/消息，已声明值的OR/step成员不另算。OR二验旧假拒与坏默认统一纠正作为明确兼容例外，不保逐值错误结果。新最短十进制政策替换旧浮点格点解释，不承诺巨大数值边界逐值binary格点兼容：value2^55/min2^55-8/step8的原二进制差8但String十进制差10明确nonmember；正常现有合法参数须走原入口回归，不据此宣称已全兼容。

## 声明结构、成员与默认
op同字段完整覆盖而非deepmerge；只primitive string/boolean/finite number及显式null option，array/object/NaN/Infinity拒。type支持integer/number/string/boolean，缺type按声明分支约束；未知type不member。integer必须safe，numberstring不强转；caseInsensitive明确才fold。options数组标量或object.value，非空/去重/合法primitive结构，空options无range时空域非member；range存在与options OR，不option成功后二验range；range非法结构即malformed而非option洗绿；range语义未知精度分支但合法option证明仍member。未解析optionsFrom仅在没有确定option/range成员见证时unresolved；未来组合语义不猜。supported:true要求boolean，supported:false canonical显式拒；legacy未供原默认窄policy保留但非candidate资格。文本长度codepoints只string可受限，非法bounds/string值类型不可绕。
defaultValue不存在=absent；明确有undefined default为malformed不注入。默认使用同成员核包括step/type/length，indeterminate默认不能目录ready；schema保原定位/结构校验，只删其重复默认域判据适配新成员结果。新schema不会把未消费扩展全体自动下架，但影响成员语义未知不可member。坏默认应有准确目录错误，不伪报用户超范围。canonical unknown field不member，legacy保original忽略；没有声明对legacy不额外制造限制。

裸结构校验与执行ready分层：仅现已注册voice字段、volcengine-voice-index来源且没有options/range确定域时，可延后同核unresolved_options来源成员检查；裸schema返回[]只证明结构，不证明默认成员或产品ready。其他已知type/length/flags/undefined默认与未知语义仍由同核拒绝，不按optionsFrom一概skip；正式load依既有路径先物化注册来源并删除optionsFrom，再同核严格验默认，未知未注册来源不得假绿执行，schema不读来源文件或虚造选项/default。所有own names（含nonenum）与symbols的未知definition/range约束必须关门，合法描述metadata不移除。声明的__proto__/constructor/toString等名称按普通对象own数据属性原值保存，保持Object.prototype及输入不变。legacy首错解释仍options-first，命中options或原range bounds见证后外层type/length仍合取；canonical不被option洗非法值，同核一次域判与解释、不新增mode或Hub域算法。

## 精度可测政策：有界精确十进制余数
选择明确且小的数字解释：已经是finite Number的value、range.min、step按ECMAScript原生String(number)最短往返十进制值进行格点判定，非接收用户string转number。负零视0。range min/max仍用原Number精确比较严格bounds，不扩宽。不以Number减法/除法形成q再比较误差，避免大offset消差。无min但step存在语义未定indeterminate；step必须正finite。无step仅bounds检查，range:{}所有finite数。
把三Number的原生表示解为带符号整数系数与十进制指数，用内置BigInt统一最小指数缩放；输入最多17有效十进制位、指数区间-324..308，缩放指数差最多632，整数数量级有界（<700十进制位），不支持外部任意高精度字符串/通用数值库。出现不符原生表示界限或无法安全处理返回precision_unproven，不构建任意大指数。BigInt仅域核内部，结果/public参数仍原Number，不JSON序列化BigInt、不截断修改用户值。
统一尺度后整数V,M,S，bounds内D=V-M>=0且S>0，Q=max(S,D)，R=min(D mod S,S-(D mod S))。继承有限格点近似政策tau=8EPSILON*max(1,q)=Q/(2^49*S)，但用精确整数比较而非浮点商。分辨预算须tau<1/4，即4Q<2^49*S，否则precision_unproven/indeterminate。成员 iff R*2^49<=Q，非成员 iff大于；这只是原数据最短十进制数的有界格点残差，不称数学实数无容差精确相等。明确近格点policy与格点判据不得混淆：.1+.2可在tau内，不吸附值。大offset不是自动不可判，必须按同余数证明；不再“把舍入误差加容差”扩大接受。
options明确命中且结构合法无需range成员证明；只有range未证明但option非member才indeterminate。allowAuto明确true允许数值-1独立成员分支，类型/外层约束仍有效，不视输出时长已知。
此新内置BigInt须纯度门允许该一个确定无I/O全局并增加正例；Date/Math.random/eval/timers/network/constructor链等原负例全部保留，不扩大任意globals或删验证。非成员解释只给公共field/value已有消息，不泄profile/cost/endpoint。

## 可测验收：旧两轮P1不能凭旧绿关闭
A options[-1,5] OR range4..30step2：-1/5/6 member、7 nonmember，不改值；若integer+option5.5外层拒。allowAuto/-1与bounds/step-only各政策验证；非数值option不被range numeric二验。
B .3/.1/.1 member，.1+.2/.1/.1 member，.31/.1/.1 nonmember；value2^48+.25/min0/step1预算>=.25 indeterminate；value8.5/min=-2^52/step64精确残差17/128超tau必须nonmember；valueMAX/min=-MAX/stepMIN巨大商预算indeterminate而非NaN洗绿。bounds外明确nonmember、option巨大值合法OR仍member。原Number对象字段和值调用前后相同。
C rangeonly/default/Unicode/boolean/integersafe/false0/null空串/undefined明确default/未知policy/unknownfield矩阵；op完整覆盖不继承model默认；默认值不符合step真实schema入口报默认错误，unresolved与malformed有分层。旧合法samples与原guard形状精确断言，不仅新函数自测。
D 真红：当前guard离散options与range格点假拒/当前schema不验step默认；新核经正式包原guard与schema入口同成员；独立小数oracle由不同表达方式（有界合理数或十进制整倍数）核正负量级案例，实际caseCount/分布记录，不能拷同helper当oracle。预算无时钟/随机与资源上界限定检查，无新资产分配/组/采购“ready”概念。

## 写集、风格与构建闭合
ESM JS/JSDoc+d.ts无runtime依赖：pureparameters/index/types/package新增test；Hubguard/schema薄适配和相关测试；正式build-client六源digest清单加入parameters（七源），packagepure四模块枚举加入一模块（五模块），硬gate缺任何源及新产物拒，不手写lib。只扩真实确定BigInt builtin，不搬Hubloader/I/O到包；原scalar谓词与#3256分配不修改。命名与风格依现深模块，自有spec+临时namespace。
未知schema诊断适配保现issuecode路径/所有声明结构检查；请求shape旧公开合同不新增status，只让内层不可证明旧guard拒。文档影响限本spec与原内部类型，公开产品/DTO/组约束尚不实施，normativehub无新seam故不改。

## 命令、阶段及授权
#3256固定合入→当前treeff→参数反例tests真实红→kernel+typedconsumer→正式build和guard/schema两入口绿→纯度/真实npm/pnpm受管离仓闭包→必要scope/Hub全测/boundary/baseline/strict/impact（noUIbrowserfalse）→冻结独审→普通PR/CI/官方MQ→真MERGED→mainff命名Dev无restart三方身份→仅清自有已合入子树。所有日志真实exit与fail/skip核；node --test共享包tests/原guard与parameter-schema tests、nodepluginsbuild-client、TS5.9.3noemitstrictJS、Hub正式runner、对应verifygates，不全仓testall。
本票只参数小片，结果不叫产品ready；后续单组candidate/qualification/privatehash/publicDTO/消费者/UI确认/授权live仍父3247范围，未覆盖不得宣传已做。绝不生产、重启、其他仓/树写、修改failed门禁/供应商模型/已有上市、将未合入tree装Dev或替human45120验收。
