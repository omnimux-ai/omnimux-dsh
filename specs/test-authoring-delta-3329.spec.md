# #3329 既有测试的有界风险差异检查

## 目标
恢复 #3301 已批准的正常测试维护：既有完整 JavaScript 测试含历史运行夹具或展开语法时，仅评论、空白或位置调整不再被一律拒绝；新增或改变已识别危险结构仍拒绝。此切片不完成父任务 A 的完整授权与旧标准保护。

## 成功标准
- 真实旧文件评论追加在旧实现确实被拒，修复后经真实标准输入门禁允许；新增危险选择器仍拒。
- 两侧完整解析且复用现有 Acorn 遍历；危险节点去掉 start/end/loc，但保留全部节点内容及声明、作用域、调用回调上下文，按指纹多重集比较，新危险及数量增长拒绝。
- 原 skip 值变化、危险节点移至不同作用域/回调、危险导入来源变化拒绝；评论与位置变化不增加风险。
- 门禁只从实际目标读取 before；edit 匹配失败、匹配歧义、缺文件或读失败拒绝；write 覆盖也读取旧目标，新文件执行完整原有风险检查。自述 before、approved、intent 不能授权测试放行。
- 路径分类统一大小写与分隔符；相对目标按实际工具工作目录解析，已存在目标按真实路径分类。
- 严格拒绝 before/after 不完整或不支持语法；生产与夹具原有行为不扩大。

## 命令
仅执行 node --check scripts/test-authoring-inspection.mjs、node --check scripts/guard-anti-cheat.mjs、node --test scripts/guard-anti-cheat.test.mjs scripts/guard-quality-loop.test.mjs scripts/test-authoring-inspection.test.mjs scripts/test-change-review.test.mjs、git diff --check 与纯内联差异及标准输入验证。父代理之后执行适用完整门禁，本轮不运行全仓门禁、不安装依赖、不 fetch/commit/push。

## 项目结构与文档影响
只改 scripts/test-authoring-inspection.mjs、scripts/guard-anti-cheat.mjs 与本规格；事实和最终证据只落主工作区 tmp/agent-infra-2026-10-14/authoring-delta-3329-implementation.md。规格是本切片行为归属，不改合同或正式测试文件。

## 代码风格
沿用现有 ES module、Acorn parser 与递归遍历，抽取风险收集，不引入第二套 parser、通用数据流分析或新许可框架。所有风险保留类别、规范化节点和上下文，不仅按正则或类别计数。

## 测试策略
先纯内联或只读现有完整测试输入复现 RED，再同一输入验证 GREEN；原 anti/quality/正式 authoring 套件回归，并补充数量、skip 值、导入来源、scope/callback、解析失败、重建歧义、新文件、绝对/相对路径与大小写边界。不得尝试写正式测试根或绕过其拒写。

## 边界与新用户基线
依赖仓库已锁定的 Acorn；缺依赖或解析失败必须拒绝，不依赖开发机服务或隐式全局配置。始终保持真实 before 和有界语法检查；如需额外文件、安装、远端或扩大权限交由父代理。本轮绝不改正式 *.test、其他文件、官方源码或生产状态，也不通过 shell、意图或改名绕过拒写。旧断言删改/弱化仍需固定候选独立审查；no-new-risk 不能认证标准未变。本工具不是 JavaScript 沙箱，不声称覆盖未知第三方函数、所有间接执行或一般运行时行为。
