# #3274 现创作页完整素材与权威预检

## 目标、准据与交付边界
母#3247/#3250已批准角色生图/生视频能力与消费端一致；前置#3270/PR3271、#3272/PR3273正式合入。基线为本次成功fetch的origin/main=ddc582f0b33118b41d035e75d48d7019f53eb0b4。当前新中枢只有list/preparePreview、所有executable:false、默认两产品indeterminate；本片只现创作页可达的完整源任务检查草稿，不新增生成授权、激活模型或迁移旧任务。UI最终合入须先同版本真实隔离演示并获得用户明确确认；不得把规格独审或测试绿视为该确认。
新用户基线：正常安装/登录与中枢同源公共产品API即可检查；服务未提供/目录错误时显示“生成条件暂不可用，请重试”，绝不读取本机服务/profile/本地型号作为兜底。已有画布节点可为空；无节点/素材不伪造。既有生产资格待验证，不与不支持混淆。
准据：docs/contracts/product-positioning.md、hub.md生成章节、node-input-submission.md、plugin-qa.md、design.md及UI文案合同。资料冲突保全：先前consumer-authority-design-round10.md声称旧reader可保完整，但现readNodeInputSource find首项、归一元信息与派生身份，不是本片无损源；viewer也合并地址/切槽slice。依据新consumer-complete-assets-next-3272.md只读原图选择器，旧读口和旧生成均不改。

## 有界源码与复用
业务写集精确七路径：plugins/omnimux-workflow/src/canvas/editor/components/HeaderControls.tsx；新增同目录GenerationProductDraft.tsx、generationProductPreview.ts、generationProductDraft.test.mjs；plugins/omnimux-workflow/src/canvas/theme/components.css；src/canvas/i18n/dict.zh.ts与dict.en.ts。另仅本spec及.workbuddy/qa-journeys/generation-consumer-preview.mjs与任务本地证据，报告在主检出.agent-reports/generation-unification-20261008/；不增scripts/生产JSON或API路由。
仅HeaderControls增加一个检查按钮与临时草稿开关，原标题/viewport/旧运行控制保持；CanvasEditor和App当前挂载不改。草稿读取现useCanvasStore nodes/edges的只读selector、getState；不调用set/hydrate/reconcile/执行/持久化。正常画布原变更与原任务恢复继续，草稿不会产生新图或任务。
复用apiClient.request同源GET /omnimux/generation-products、POST /omnimux/generation-products/preview；不导入Hub私有source/purecore、供应商client或第二参数/MIME/配槽算法。精确V1公共类型和必要原源运输放generationProductPreview.ts，不能有ready/资格成员判断。
UI复用画布同React岛既有CustomModal、CustomSelect和胶囊按钮/现控件样式；不将依赖宿主React18的dsh-ui-kit组件跨入独立React19岛、不改包依赖/builder/官方底座。新增32px/8px控件、16px弹窗、SVG图标、官方语义令牌及portal兜底；不裸select、emoji/自造色彩。所有新文案进双语字典。

## 公共接口与状态
目录V1精确：{schemaVersion:1,currentFingerprint,products:[{productId,label,status,intents:[{intent,label,status,alternatives}]}]}。公开仅生图、生视频，用途按该响应显式选，不从素材数/品牌/图节点params推用途，不默认首项。不携内部模型/组/渠道/证明。alternatives每项六键status,inputs,inputGroups,parameters,output,constraints；逐分支独立原样展示，不能跨分支union参数值/上限、clamp或用available声称授权。参数名称可作输入字段导航的集合，但该集合不代表可联合成立的域。
RequestV1六必需键schemaVersion/currentFingerprint/productId/intent/parameters/assets，及可选prompt；parameters只已声明字段的用户显式primitive，显式false/0/null/空串保留，未填写省略而非造默认。所有参数能力/组合裁定在中枢；草稿可采用每字段显式类型+值输入，选择“未设置/文字/数值/开关/空值”只是transport类型，不是成员合法性。数值用完整解析，非法非有限值显示待填写，不clamp/trim或偷偷改原值；内容在正常change完整记录，不范围即时自愈。prompt保用户原字符串，未输与空串区分，不读取旧节点params/default。服务器各分支参数原声明与固定/only约束必须可展开查看。
响应仅四态ready/pending/rejected/indeterminate，executable必false；ready显示“输入预检通过，尚不能生成”，qualification_pending“生成资格待验证”，input_pending“素材信息待补齐”，default_ambiguous“参数待确认”，其余未证“条件尚未核实”，input/parameter硬拒只说明本次请求问题。目录/预检失败清掉旧结果，显示可读原因；禁止按HTTP200/available/ready启用旧execute。
同开草稿每次fresh GET，无目录缓存/票据/token；换产品清用途但不删素材/参数/说明，不将旧参数自动套新域，未知参数交服务器硬拒或由用户显式移除。切用途/改值/素材角色次序/移除/当前源版本/断边/目录变更立即令旧结果失效；异步响应仅在此次提交的完整草稿与当前目录仍同一时显示，迟到结果不复活。409 stale只重新GET及清结果，说明条件已更新；用户第二次点击检查才以新fingerprint重发完整请求，不自动POST重试。

## 完整原素材运输（直接门）
供给不等于全选。原图nodes/edges只提供选择清单：用户显式选择真实node.id、可选真实edge.id及mediaAssets数组某索引；列出原数组每项，不find首项、不filter有效项、不去重、不从历史versions继承全部结果。没有数组的节点仅展示其当前明确data媒体源；不会把文字/缩略图猜成image。每次用户选择追加独立有序记录，同素材可重复选择并赋予不同角色；排序/移除仅改草稿不改图。普通in/input边不能锁用途或角色。
正向运输AssetV1字段：type,pathOrUrl,role,targetSlot,mime,sizeBytes,durationSec,sourceNodeId,edgeId,outputId,outputVersion,originalName,dimensions。raw现有这些键原值保持；mimeType→mime只确定改名，若两键同时存在且不同，必须显示冲突待用户明确选择、不私选其一。raw sourceNodeId/edgeId与当前真来源不符不得伪改，两者清楚展示并交由用户确认适用来源；当前选中真实来源可作为仅缺省时sourceNodeId/edgeId依据。禁止从URL/path/taskId/时间/序号/hash制造outputId或outputVersion；缺失原样省略并标“输出身份/版本未提供”。
地址取用户明确选中的现pathOrUrl/url/path/realPath/relativePath/mediaUrl原字符串；唯一已声明地址可直接运输，多个不同地址在素材行供显选，无地址保行标缺项、不滤掉、不猜HTTPS或读取/上传/下载。relativePath不会未经workspace身份拼绝对路径。选中条目变更/消失/断边只标该行待重新确认，保用户完整已选列表，不用已就绪子集POST假通过；缺地址时请求可保pathOrUrl空串让中枢invalid_request，界面不得自造可用值。
已知type/role/targetSlot/MIME/bytes/duration/dimensions/null/原名/身份/版本保持；不从文件扩展名/尺寸猜type/MIME、字符串转数字、lowercase、补0、单位换算或省略已声明null。已选未知type/重复/超量/role冲突仍保全POST让中枢裁定。枚举、读取或复制已选原容器及待运输字段前，检查own描述符：symbol、getter/setter、非枚举字段、非普通对象或稀疏/带额外成员数组明确阻断并保原行；不得调用getter/toJSON、借spread/JSON忽略异常，递归运输字段同样检查。undefined、非有限数、不可JSON值或环引用显式阻断，POST与getter调用均为零；该门仅运输安全，不判断MIME/成员/资格。不得删undefined后声称已运输。
role和targetSlot仅用户明确选择且值来自当前单个分支的声明或原已明确角色；不自动同义词修复、默认reference/firstframe、按图数切首尾。用户选择的role覆盖仅本草稿用途而不改原asset。所有selected source内容/已知version改变必须使结果失效并可见；重新检查采用最新用户已确认原条目，不用旧请求缓存。全部数组冻结副本是草稿隔离，不是生产执行快照。

## 用户旅程与可测验收
AC1：正式应用导航现创作页→右上“检查生成输入”→真实GET只显示服务器两产品与对应用途；空图也可选用途/填写说明，POST含全部六键assets=[]；任一预检状态零新execute/生成/任务写，目录失败无本地回退。
AC2：已有角色多图原数组+动作视频+说明连接项目，清单逐项显选，重复图用于首尾两角色；未知MIME/超量/重复/全部原身份版本metadata完整字面POST，不改nodes/edges/旧params；切用途保素材，0/null/false/空串保；源更版/断边/改参数后旧结果失效；原角色/地址有歧义不得猜。symbol、getter、非枚举、稀疏/额外数组成员及不可序列化源反例必须保原行/原图且POST为零、getter调用为零，不用HTTP序列化洗白。
AC3：模拟409→freshGET→不自动POST→用户确认再整请求；迟到旧成功不盖新请求，组件关闭取消并不写图、不清全局草稿或媒体；重新开fresh目录不恢复可生成承诺。
AC4：旧edit/extend/digital_human及非新五intent已保存任务/在途taskRef原身份/请求/参数保持；正常旧收取照原任务，不启动新预检/重提/迁移operation；新草稿开关无执行调用。与零新执行分开计原允许收取。
AC5：真实隔离完整应用ui bootstrap+正式安装，三场景逐导航/选择/检查/关闭并保PNG、脱敏完整请求、零新执行与原旧任务收取证据；源码/加载bundle/端口/进程/run身份前后同版，TaskSpace和服务全部闭合；人眼复检构图、明暗token对比、dropdown/modal层级及空场景无黑洞。不可用Stage伪页、首页、HTTP200/静态测试或Dev45120冒验收。
AC6：用户看到同版演示后明确确认才提交UI正式PR/MQ/mainff/Dev/自树清理。本spec或技术审查不构成此确认；保留母任务未完成及视频live专项授权，不为了演示补active/qualification/channel常量。

## 测试、计划与命令
公开接缝：现HeaderControls真实DOM按钮→apiClient.request→完整同源JSON；新模块测试只通过该用户流程观察原请求和UI，原图只读对照；不得mock按钮、请求运输、候选判定或执行入口来掩盖缺实现。必须先现入口行为RED，只导入已存在HeaderControls等，缺按钮为ERR_ASSERTION；缺新文件导入/编译失败不算RED。保HeaderControls旧测试全部原样。其后最小入口GET→GREEN，再逐个资产/显式值/异步stale/旧用途反例纵向增加，不一批想象全部行为。
专项 `node --test plugins/omnimux-workflow/src/canvas/editor/components/generationProductDraft.test.mjs plugins/omnimux-workflow/src/canvas/editor/components/HeaderControls.test.mjs`；包 `node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"`（cwd插件）；类型 `node plugins/omnimux-workflow/node_modules/typescript/bin/tsc -p plugins/omnimux-workflow/tsconfig.canvas.json --noEmit`（真实声明5.9.3缺link只任务test解析，不能改shareddeps）。构建 `node plugins/omnimux-workflow/scripts/build-host.mjs && node plugins/omnimux-workflow/scripts/build-client.mjs && node plugins/omnimux-workflow/scripts/build-canvas.mjs`，产物不入Git。
适用并集：`node scripts/verify-plugin-boundaries.mjs`、`node scripts/verify-product-baseline.mjs`、`node scripts/verify-stage-contracts.mjs`、`node --test scripts/verify-anti-slop.test.mjs`、`git -C <本任务树> diff --check`；原模型/Hub/purecore不改则不重复全Hub和全仓。新增source行为专项覆盖≥80%且真实fall/skip/exit核，不用覆盖率代真实浏览器。
正式应用journey按plugin-qa声明同任务root执行 `node scripts/worktree-app-qa.mjs --journey .workbuddy/qa-journeys/generation-consumer-preview.mjs`，若runner需ego适配采用现正式bootstrap+同egoPage旅程、任务内证据，不绕过其缺能力为私造伪页。先核runner现真实能力，命令存在不是浏览器成功。所有后台job逐项收；taskSpace finish keep[]与finally cleanup在同调用，没真实调度工具不得称已设自动wake。
计划：独审规格/source-transport/产品边界并冻结→入口RED→最小按钮/GET→每个完整POST资产反例GREEN→类型/专项/包与构建→同版完整应用三旅程演示→等保留UI确认→确认后正式PR/MQ/Dev/clean。限定root/tmp与报告保失败原文；文档影响仅此任务spec定义消费行为，hub.md新公共形状不变，不双写官方模型domain。

## 禁止与待定
不改App/CanvasEditor/ConfigPanel/原读取口/store/执行器/纯核/模型/groups/价格/Host公共契约；不第一选项默认、参数clamp/跨域拼表、slice/去重已选素材、旧用途“升级”、常量supplierchannel/虚构版本；不新工作流/新跨包UI组件/缓存/平台/提供方客户端；不sharedkit/Prod/restart/跨仓。若实际验收必须扩大以上写集，先更spec并复审，不擅自用广泛修复抹门禁。
真实supplierchannel/完整官方域/采购/同版产物另方向取证；三个官方原文保未证矛盾。缺input身份/版本的新草稿不能表示已有可稳定执行资格，本片检查不激活生产。
