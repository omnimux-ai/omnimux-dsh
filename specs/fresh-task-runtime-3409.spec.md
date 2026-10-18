# #3409 正式 ui 任务隔离安装与加载验收

## 授权与范围

用户明确要求继续修复 TEST_ENV_NOT_USER_FRESH_TASK_UNKNOWN。仅补正式合成 ui 的新用户任务运行链；不交付完整 #3301，不修扩展类型错误，不运行真实模型、不读共享 Dev/Prod，不改官方DSH源码。普通PR/MQ合入及脚本交付已获授权。主检出只读；本树与任务子树承载实施。

新用户基线是已安装的官方 packaged runtime 与本任务候选源码、仓内已安装构建依赖。运行配置、业务数据、HOME/DSH_HOME、agents、缓存、store全部在一次性私有目录；运行环境不继承凭据。缺runtime或依赖明确分类失败，不读Dev补缺，不下载真实上游。

## 公开交接

- 保留无evidenceContext的旧兼容路径；显式fresh路径仅支持ui，onboarding/live保持明确拒绝。
- fresh starter必需 `root`、`evidenceContext:{taskId,runId}`、`candidate:{base,head,outputs?,extraInputs?}`、`taskPlugins`；只接收有限已实现构建适配的插件ID，不接命令、任意源目录或已安装包路径。hub始终包含，首批支持omnimux-inspiration与omnimux-browser。未知插件/字段在创建运行资源前拒绝。
- app-QA显式request增加taskPlugins，固定后纳入输入身份；向starter传同一base/head、outputs/extraInputs与task/run。旧legacy请求不被偷偷转为fresh成功。
- 复用现有候选捕获、stage、固定构建命令、packlist/归档字节核验。新增task包与声明生产依赖必须从任务源码或仓内已装依赖形成私有可审file图；核心官方base/web-app来自packaged runtime正常初始化，不用仓内旧peer覆盖宿主。不自动安装peer，不读取全局npmrc/registry凭据。
- 通过官方packaged `dsh plugin --profile web add` 安装，不手写bundle注册表冒充安装；读取实际manifest与安装路径，逐发布文件比较。依赖manifest重写只限私有file定位与禁安装生命周期，记录转换前后身份。安装失败不得启动或回落legacy。
- 使用空私有配置和本机动态mock；所有已配置模型/媒体路由指向mock，不能沿默认fallback触及真实上游。不伪造CLI可用或agentVerified。需要的合成业务夹具显式标记，不复制Dev数据。
- 动态端口启动，严格解析内存login capability；通过同一子进程的Node inspector核PID、真实server入口URL与源码哈希。无法观测保持failed，不用HTTP成功替代server加载。

## 证明交接与消费

starter保留现有origin、非枚举loginUrl、summary、observations、assertAlive、cleanup，增加installation与serverLoading，提供assertInstalledIntegrity；这些记录不能单独由journey返回布尔签成功。

installation固定包含taskId/runId、sourceRoot/privateRoot/profile、base/head、candidateDigest/inputsDigest、packages。每个package包含name、installedRoot、发布payload(path/sha256/size)、serverEntry(path/sha256)与可选clientBundle(path/sha256/bytes)。所有实际路径均落该任务自有目录；源码或归档身份可追回捕获的候选。

独立proof helper实现：
- `verifyTaskServerLoading({inspectorUrl,pid,installation})`：同进程CDP实际script URL、getScriptSource、源哈希，返回匹配清单；不落原始脚本、login token或环境变量。
- `captureTaskClientProof({send,readEvents,origin,installation})`：实际浏览器Debugger脚本，复用live-runtime-proof的AST注册/语义哈希比较，真实页面origin前后一致；任务动态origin入口独立于既有Dev白名单，不放宽原Dev入口。
- 旅程前后比对客户端证明和安装完整性，保留server+client+candidate绑定。缺失/重复/旧脚本或漂移不能通过。

消费者只有在正式生产者、任务候选一致、安装完整性、同PID server加载与browser客户端观测全部满足后计算userFresh/taskBinding和task-source-installed-loaded。依赖桩仍明确dependency-stub、自报且不授权，不升级为真实fresh证据。

断言按预声明expectedAssertions归属分组并拒绝跨组重名，不能从返回断言推导预期。失败记录真实阶段，cleanup必须await子进程exit+close并清理精确自有目录；不会因清理失败签通过。保留历史失败封套。

## 实施分工与验收

- runtime worker：bootstrap、安装/构建新模块及其最小单元，负责空环境/正式CLI/安装身份/启动/清理。
- proof worker：server/client实际脚本证明与live-runtime-proof行为保持提取，相关单元。
- coordinator：公开app-QA请求/消费者/driver接线、合同、集成、实际运行与交付。

先用真实runtime验证Node inspector可观测入口，再完成公开consumer。最小检查为相关bootstrap/root/app-QA/proof/evidence脚本测试、test:gates、product-baseline、impact与diff检查；不默认全仓verify:all。新增确定性单元不冒称E2E。正式路径必须实际完成一次私有安装/启动、浏览器脚本读取、真实PNG与封套核验，并保留清理结果；未完成则准确报告对应阶段，不将删除拒绝分支计为成功。

文档仅更新plugin-qa拥有的实际能力与调用说明。脚本任务无需向Dev物化；仍走Issue、独审、requiredCI、MQ和标准收尾。后续#3402功能验收单独执行，不因本入口成功自动通过。
