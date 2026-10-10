# #3280 角色首次自动选择跳过停用默认组
## 目标、授权与新用户基线
母#3247/#3250已批准保留角色入口漂移纠正；本票只修首次自动选组与主设定板明确全停用阻断，不迁移新产品执行或声称全部生成请求安全。base13a3fd17893a27630d6fb06d6cb98186987e0997，W=.worktrees/avatar-enabled-selection-3280，branch agent/avatar-enabled-selection-3280-issue-3280；主检出只镜像。普通Issue/spec/test/review/PR/官方MQ/命名Dev文件核验/自有清理已覆盖，不重启/生产/跨仓/真实供应商/付费。
新用户从既有正常安装/登录/数字人页读取中枢model-catalog；仅目录enabled状态与default偏好判断，不依赖本机模型或凭据。缺目录的原HTTP错误继续如实显示；缺组/空默认语义本票保旧，不伪造目录或恒资格reader。
## 现状、复用与假设
现catalog.js185–190先default无enabled，真实puremodule反例停用default+启用组→off/disabled-wire，全部停用default→off；groupsOfModel保目录全行、enabled!==false。Stage65–70按自动id转wireGroup，223–234仅第一次自动设置，280/355–376主生成不检查目录全部停用。单修helper后emptygroup仍可旧autoroute，需直接在主生成前阻断。
ModelPicker全部组可手选，换模型清group、空项表示默认；b.group可id或wireGroup。本票不修手选id/wireGroup映射、不强制补空为新值、不把缺组等同全停用。历史retry、多视角与在途collection另有路径，保持原参数和taskRef，不能用本片声称所有新请求禁停用组。
复用原groupsOfModel/pickAutoGroup、GenerateBar disabled/canGenerate、Stage callbacks/toasts与双语locales；不新建选择框/路由/helper平台，不导入其它插件私有模块，样式/布局不改。
## 可测验收标准
AC1 自动选择偏好仍启用的默认组（isDefault===true且enabled!==false），否则保持目录顺序第一个启用组；全部停用默认/非默认返回空，empty/undefined仍空。缺enabled沿既有启用语义；不突增价格排序或组别。
AC2 原启用default/id≠wireGroup依旧自动选该id且Stage初次b.group为同wireGroup；停用default+启用非默认初次改为启用wireGroup。目录所有行及enabled/default/pricing/constraints原值保持不删不改；自动初始化仍只一次，不抢用户手选/历史恢复。
AC3 当前选中模型的组快照非空且每项enabled===false时，主设定板生成按钮不可用；同一判据在onGenerate回调中前置拒绝，不能仅靠disabled。即使有角色/model/brief/selection也零POST /api/omnimux/avatar/sheet，不调用sheet.submit以免清旧pending计时器；原说明/选项/seed/参考图和任务元信息保留。
AC4 目录缺组/空组/缺模型组、目录加载前及旧空默认选项不能仅因组空被新判据阻断；有任何enabled组则保持原主生成与手选语义（本票不保证手选停用组亦被拒）。明确全停用的组即使当前b.group非空也阻断，不偷偷改为自动重路由。
AC5 明确全停用拒绝提示采用准确中文“当前图像生成渠道均不可用”及对应英文词条，复用现页面内提示形状，无额外CSS。既有任意缺目录错误/归档错误/冲突提示保持；按钮不可用不清草稿、不让旧任务轮询/查看/归档补偿因新组检查失效。
AC6 原catalog.test.mjs179–185唯一it与本票相冲突，允许先独审后仅名称改为“falls back to the first enabled group when the marked default is disabled”，唯一expected 'off'→'on'；groups输入/另assert/其它测试全字节保持。保存原整文件/完整it/prefix/suffixSHA与反向整体还原证据；不删it、不扩大豁免、不借source regex作主要行为证据。新增全停用default与真实生产Stage操作主证。
AC7 新avatar-enabled-selection.test.mjs实际bundle完整AvatarStage与原hooks/API，同React实例，真实DOM打开/选择设定选项或套用预设/按钮操作+受控fetch返回目录/角色/数据并捕获主sheetPOST；不得复制算法/替换onGenerate/hooks/新假页面。真实RED必须因原停用组被自动选或全停用主提交而失败，环境import/无角色错误不是业务RED，所有失败保留。
AC8 实际完整App专项只任务私有离线UI：正常login/workspace/session/注册数字人Tab→读取合成目录A停用default+启用group→原生选择设定选项/套用预设或恢复历史参数→明确启用wire值提交仅受控本地响应；场景B全部停用→原主生成不可用/零sheetPOST，已选设定可继续编辑。当前完整页未提供brief/seed/参考URL直接输入框，不伪造输入或加框扩范围；brief/seed/参考字段仅在原历史恢复或原预设确有载荷时以实际HTTP证据证明，不能称任意文字原生输入已验证。对旧task metadata/在途轮询选独立非生成观察，不创建供应商请求。原图专属功能路径实际display人眼，新界面同版明确采用后才合入，不继承3278确认。
AC9 复用createTestEnvironmentStarter/privateStarterFs正式CLI/声明依赖图materializePackages；任务私有HTTP响应代理只GET model-catalog提供版本化夹具，其余正常认证/页面/HTTP及WebSocket透传，零共享配置/凭据/DOMfetch替换。代理先实际验证origin/login/升级与清理，真实Hub未覆盖GET证据和合成夹具证据分开，不声称真实Hub现alloff/资格。与旧原像素/声明图同边界，源码/加载bundle/响应hash绑定、beforeafter不变；Ego同invocation finishkeep[]，Host/privateDir/代理服务全清。
AC10 本票仅主设定板首次自动选组与明确全停用阻断；onRetry/meta.group、多视角、tools/server/Hub组规则及旧在途task恢复不改，不做全局重新准入，不改变已受理任务。母目标/真实资格与新产品执行仍未完成。
## 结构、计划与代码风格
业务写集：plugins/omnimux-avatar/src/client/lib/catalog.js仅preferred enabled条件及注释准确；AvatarStage.jsx仅局部hasGroupsAllDisabled派生与canGenerate/onGenerate同判据；locales.js仅新提示双语同既有dotted格式（必要TEXT_KEYS按原机制，不造翻译器）。不改ModelPicker/hooks/API/server/store/styles/manifest/CI/包依赖。
测试写集：新增src/client/avatar-enabled-selection.test.mjs；旧src/client/catalog.test.mjs仅AC6受审it。文档本spec+成功后日期规范docs/evidence报告/功能原PNG。实际完整页先.tmp任务adapter/journey/runner探索；只有真实专项已通过并精确独审准入后才固化tests/e2e与test-support本票最小支持文件，不改旧3280以外driver或复制新通用安装平台。
JavaScript ESM具名export/JSDoc，原无分号与单引号风格；判断精确消费enabled布尔语义，局部状态只读，不添加目录default造假或客户端黑名单。总是先spec独审→新测试业务RED+checkpoint→最小源修及唯一oracle纠正→GREEN+真实功能→精确终审→PR/MQ/Dev/清理；仅新UI同版采用保留人拍板。
## 命令与测试策略
avatar cwd原基线/整包：`node --test src/*.test.mjs src/client/*.test.mjs src/client/*.test.js src/client/components/*.test.mjs`；新增聚焦：`node --test src/client/avatar-enabled-selection.test.mjs`；正式构建：`node scripts/build-client.mjs`。两初旧failure不overwrite；不得pnpm自动install共享状态，不走test:all全仓。
root：`node scripts/impact-matrix.mjs --git-diff --base 13a3fd17893a27630d6fb06d6cb98186987e0997`、`node scripts/verify-plugin-boundaries.mjs`、`node scripts/verify-stage-contracts.mjs`、`node --test scripts/verify-anti-slop.test.mjs`、`node scripts/verify-product-baseline.mjs`、`node scripts/auto-qa-gate.mjs --diff --base 13a3fd17893a27630d6fb06d6cb98186987e0997 --output .tmp/3280-l0.json`、`git -C <W> diff --check`；新locale既有双语门适用。缺dependency只任务link已声明现存源，不加依赖或改gate。任何整包skip保持原值并说明。
修改执行语句80%以上可达（default启用/停用+主回调block/allowed），实际包函数V8或精确生产bundle映射，不能将测试代码/抄写判断作coverage；缺层/映射未证如实记录。真实browser专项通过前不提交永久E2E以凑UI门，无allskipPASS。
## 边界与未决
目录真实enabled来源语义本片只沿目前合同，不证明supplier域/价格/当前完整资格；缺组是否未来拒绝与全部新请求防停用需另spec。任务私有代理/正式离线依赖图可执行性尚未实际证明；遇不可用先查现seam，不修改官方DSH或共享profile/旧工厂。
任何扩大到historyretry/multiview/空默认/手选映射/Hub真实执行的设计先另定范围；不可借守卫例外降断言。不restartApp、ship触发restart、生产、跨仓、重写main/stash/reset/force、伪qa:pass、真实provider，UI同版采用前不merge。
当前仅规格待独审，没有本票已通过功能/代码/测试/包加载/浏览器或资格证据，旧报告是准备不是批准。下一第一动作两独审规格边界及唯一oracle例外，再写生产DOM新反例；独立Hub缺资格工作不受本片开展授权影响。
