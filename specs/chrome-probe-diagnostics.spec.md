# Chrome样式探针隔离及失败诊断规格（#3265）

## 目标与现状
直接阻#3256/PR3263/父#3247：同提交required首次与两次MQ中唯一既有ModelsSettingsCard探针Chrome进程ETIMEDOUT；同提交required重跑全24包过、本地原用例1/1过，不证明根因。当前基线2c06d0778b88e6333c19062d8a72ab4f4fcdc2d2，故障5相关files非3256diff；仅此独立树治理，不改冻结产品或旧断言。
现helper30秒spawnSync，错误路径直接抛不含stderr/stdout/status/signal，无法区分测量已完成/启动/退出卡；incognito未显式独立profile。CI已有workspace runner logs/json可复用但未收、上传失败后不执行。

## 范围和关键旅程
仅scripts/test-fixtures/style-dom-probe.mjs、scripts/style-dom-probe.test.mjs、.github/workflows/quality-gate.yml及本spec必要变更。测试接口仍runStyleDomProbe原同步shape，使用既有findChromePath，不发明浏览器运行器、不新增runtime依赖。所有调用测量流程、原ModelsSettingsCard断言、30秒上限/virtualbudget1500、真实error/status/missingRESULT仍硬失败；不skip/吞错/自动重试/扩timeout/删用例/擅改Node/ubuntu版本/宽flags修未知原因。不图像/模型/参数/UI产品变更。新用户baseline不涉及产品默认服务、数据或provider，仅已装Chrome测试前置，缺失继续明确失败。
开发旅程：同样真实固定页面成功测量→返回原值与临时空间清除；两个并发probe使用各自临时profile，不能读取默认HOME Chrome；浏览器有结果但超时→仍失败并保有限诊断；CI失败→同层完整包日志与结构化汇总可取证。

## 可测验收
1. 在一个已创建唯一临时页面目录内使用子目录profile构造显式--user-data-dir，不改浏览器发现或业务输入。成功/失败finally清页面和本次profile，不清共享/他人空间；临时路径不作为产品依赖。无第二进程管理器、外部app重启/全机Chrome kill。
2. 保守错误收据：spawn error保原error.code/cause，非零status/missing RESULT仍失败；附可读取diagnostic结构（name, timeoutMs30000,status,signal,stdoutTail,stderrTail,measurementPresent），输出尾部独立上限2048字符，全文不存/不含用户真实profile凭据。错误message可追加有限诊断，但首原原因不被固定新中文常量取代。正确RESULT也不能覆盖ETIMEDOUT/非零退出；JSON解码异常仍抛不空ok。
3. 新test只在public helper seam边界用Node registerHooks虚拟child_process/findChromePath隔离，真实dummyChrome输出控制、记录传入argv与cleanup。先红测试独立profile和失败收据（原helper确缺），再最小绿。仅测试loader不得进入产品helper、不得增加正式可注入mock配置绕真Chrome。测试完整参数、重复目录不同、finally失败清除、成功返回原值、超时即使RESULT仍拒、非零/缺RESULT仍拒，测试进程不能影响共享用户浏览器。
4. CI既有Run regression tests显式纳入scripts/style-dom-probe.test.mjs（根scripts新test不会由包级collector自动全收，必须实际持续执行）；workspace step只加已有--logs .tmp/ci-workspace-logs --json .tmp/ci-workspace-summary.json，保原exit与全包判据；现Upload QA evidence加if:always及包含两.tmp路径，原.workbuddy/evidence保留且retention7，无secrets或profile采集；actions/upload-artifact@v4默认排除隐藏files，实际这三目标均隐藏目录，须include-hidden-files:true且只这三个显式目标，不得放宽.tmp/根目录导致收集profile、凭据或其他scratch。此输入由正式action.yml事实确定，不仅断言路径存在算收据已上传。失败日志不是source/产物提交，上传diag失败不能变检查green，不改ci-verdict/requiredchecks/mergequeue。
5. 实际原ModelsSettingsCard.e2e以及另一个原helper调用点从glob/grep选择真实browser regression均通过零skip；这些是测试probe，不等同产品真UI验收。公开helper所有call-sites数/类型需核，运行与现fixture一致，Diff-awarebrowser门判断不要因为测试helper误声称用户界面改变。
6. scoped新test+对应既有runner/gates/影响/隔离browserprobe正式log真实退出码、独立review冻结后普通PR required/MQ，diagnostic仅改善可观察性+隔离候选原因，不在远端trace不足时宣称生命周期根因已修。两次远端失败保留，若新diag仍失败用真实stdout/stderr分流排查，不盲重排。

## 权限与文档
直接授权交付阻断的低风险测试基础设施治理，普通Issue/独树/PR/官方MQ覆盖，无产品安装默认/数据迁移；纯test/CI变更不Dev物化。仅本任务有权写本树自有范围，main只读mirror。禁止生产/应用重启/跨仓/用户profile/供应商调用/改3256冻结files。新增scripts测试必须由现CI regression显式纳入并有配置断言，根collector不会自动发现新根test；不新manual脚本无需伪治理枚举。文档影响为此spec，未变产品契约；不同层投影/用户界面不本票。

## 未知与完成标准
超时发生前是否RESULT已出、实际runnerChrome/OS版本、默认profile竞争或子进程持stdio仍未知；显式隔离是已有可靠入口的最小复用，不凭本地绿宣称CI稳定。真正当前PR/MQ成功与合入身份才解除3263合入前置；诊断票合入后3263安全吸新main保九自有差异重新核审查身份，不复制开放stack。
最小完成：新真实红绿门、原probe运行、完整失败收据上传配置被门禁锁、独审通过、普通CI/MQ合入，然后重新目标产品PR必需checks/MQ闭环；父3247仍未完成，下一参数#3264等3256MERGED。
