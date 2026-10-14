# #3323 治理登记与真实检查入口

## 目标与成功标准
阶段D已批准。沿用单一治理清单和现有登记测试，校验真实脚本库存、持续集成/本地可证入口及有限静态依赖。使用版本2的ciRequired/localRequired/manual/deprecated分类，移除不存在的幽灵路径，真实测试、嵌套helpers和Python脚本均纳入。未知不提升分类；静态可能可达不是实际运行、每次必跑、函数覆盖或业务通过。

## 输入与结构
纯核心仍为scripts/lib/governance-registry.mjs的inspectGovernance，接收只读manifest/files/packageJson/workflows，不执行库存、不联网、不写输入。files键为规范相对路径，值为UTF-8内容；库存为scripts下mjs/js/sh/py。调用者排除node_modules/.worktrees和构建产物，但scripts/lib是源码不能排除；真实fixtures中的源码也登记，不排除测试来伪完整。

现有scripts/verify-governance-registry.test.mjs构造有界只读库存和有限外部静态源输入并调用核心，断言错误诊断为空；unknown保持可见，不能豁免错类。读取所需外部路径只为证明根/静态import，精确相对路径保留，不裁剪basename、不引入第二名单。无法供应的外部源明确unknown。

## 可证语法与来源
支持固定node/node --test/node --check/bash/bash -n及显式pnpm/corepack pnpm run脚本；裸入口仅已核的test/start/rebuild/rb/setup/deploy/clean/purge。其他裸名称分派unknown不升根；失败/不透明前缀不证明后缀。仅合法非空&&和独立命令行；复杂shell、控制流、重定向、变量/通配目标和反斜杠续行不模拟。不能为了静态图拆坏真实隔离环境。

工作流实际jobs.steps.run给出持续集成根，根包scripts给出本地根；语法检查单独记录不展开import执行图。JS仅真实import/re-export/字面import表达式；字符串/注释/夹具不建边。运行条件保留，不称无条件。显式改变解析的PATH/NODE_OPTIONS/BASH_ENV/ENV及错误上下文shape标unknown。YAML无法精确映射的折叠/解码/别名来源line=null并保留unknown，不猜物理行。

有限不透明调用元数据仍在同清单，须绑定真实调用点；调用点不证明调用已运行。fork与未知包装器执行上下文不能由本模块局部AST证明，始终unknown，不因手写目标就升为覆盖。shell手工边只接受整源固定兼容解释器命令；语言/路径不匹配拒绝。任何新增执行支持需真实反例与独立审查，不临时补猜规则。

## 集成与测试策略
在现有质量工作流增加直接有限命令node --test scripts/verify-governance-registry.test.mjs scripts/lib/governance-registry.test.mjs；根test:gates追加既有核心测试。替换旧恒真断言，不删除/跳过旧库存完整性目标。版本2分类按每条证据人工核对并由实际消费者验证，不将临时派生清单当授权。恢复脚本及其测试仅manual且不执行。

保留核心公开13项与各轮已证反例；新增反证覆盖真实测试/helpers漏登记、幽灵/重复/跨类/版本/路径、注释虚构入口、仅语法不执行、真正CI/本地差异、未知目标不升级。消费者测试须在固定候选中通过、持续集成实际运行；本地pure通过不能冒真实CI覆盖。

选择node --check、定向登记/核心测试、test:gates、impact-matrix与git diff --check；脚本/流程改动不需要产品安装或浏览器验收。所有失败原件保留，不改required检查、不自写通过标签。

## 新用户基线与文档影响
离线仓库检查依赖当前仓库源码和既有Node/Acorn/YAML，无秘密、开发版服务或绝对私有路径默认值。缺输入/未知解析明确报告，不执行脚本补证。本文拥有本次检查范围与集成约束，不复制全局Agent规则。

## 边界与后续
仅本任务树的核心、现有消费者/公开测试、同一清单、根包门禁与既有工作流更新；先规格后源码。主报告保留精确base/head、实际检查和未知。无生产/官方/跨仓/全局/真实媒体付款操作，不绕任何hook拒绝，不执行恢复/同步脚本或清理他任务。阶段D的增量静默异常门禁及证据消费者仍由父目标后续完成，不把治理切片通过当完整D。
