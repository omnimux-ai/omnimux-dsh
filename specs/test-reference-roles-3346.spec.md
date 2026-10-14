# #3346 风险相关引用角色精度

## 目标与成功标准
只在现有风险相关导入绑定收集处区分 Identifier 的引用/声明/属性角色，修正局部 ObjectPattern 声明名被误算为顶层静态导入引用的问题。实际642行测试仅在原 node:fs 声明追加 readFileSync/statSync/lstatSync/realpathSync，纯数据差异检查应由旧规则拒绝变为允许，完整候选检查仍拒绝。

## 项目结构与文档归属
源码为 `scripts/test-authoring-inspection.mjs`，正式测试只增补原 `scripts/test-authoring-inspection.test.mjs`，本规格及 `docs/contracts/anti-agent-fake-completion-guard.md` 必要一句说明有界角色规则。实际候选只读取父树原文件作为解析字符串，绝不导入或执行，不新增夹具或测试路径。

## 代码风格与最小计划
沿用现有纯函数、Acorn AST 递归与单项 import Map。新增约20–40行的角色收集 helper；风险正文 canonical 完整保留，角色筛选仅影响 names→bindings。先记录真实候选允许断言失败，再原测试新增最小纯字符串失败断言，再实现、正负矩阵与相关原测试回归。

## 测试策略与命令
公开验证边界只有 inspectTestAuthoring/inspectTestAuthoringDelta；候选源码字符串从不执行。

- `node --test scripts/test-authoring-inspection.test.mjs scripts/guard-anti-cheat.test.mjs scripts/guard-quality-loop.test.mjs scripts/test-change-review.test.mjs`：原79项与新增角色矩阵。
- `node scripts/impact-matrix.mjs --git-diff --base 890f8c5129b209a0b7eb2c92f9ec8dea21d70f94`、`git diff --check`、`node --check scripts/test-authoring-inspection.mjs`、`node --check scripts/test-authoring-inspection.test.mjs`。
- 完整 gates、固定版本独审、CI/MQ及合法根规则更新由父后续执行，本实施不代签。

## 角色矩阵
声明排除：VariableDeclarator.id、函数/箭头参数、catch.param、import specifiers、函数/类自身id，以及上述位置的嵌套对象/数组/rest/default左侧。非computed Property/Member/Method/类字段key、标签与meta名称不是引用。source Literal不是变量。

引用保留：对象表达式 shorthand value（即使key/value共享坐标）、computed key、Member.object与computed property、解构默认值右侧，以及函数参数默认表达式右侧。默认值右侧不因所在pattern被当成本地声明。

新增安全静态项时：仅pattern声明、非computed成员或对象key、参数名落在旧风险上下文的候选 delta允许/full仍拒绝；自由shorthand、computed与defaultRight真引用新增binding继续拒绝。已用source/imported/local/type/raw/attributes/default/namespace改变、新Spread/eval/危险import、未知语法及整声明危险兄弟项仍拒绝。

## 边界与新用户基线
这是角色过滤，不是完整lexical scope：函数/块局部同名的真正引用仍保守按名称关联顶层导入；不得宣称所有同名静态API新增均许可。不实现通用JS数据流、别名传播或作用域框架。

保持原风险reason/detail/context/body/slot/occurrence/multiset完整、真实before读取、未确认来源独立硬拒及公开apply规则；单项Map的原声明全部字段保留。新用户依赖仓库已声明并安装的Acorn，缺失仍显式模块加载错误，无本机服务/凭据/配置默认依赖。

绝不写父#3343受拒文件、不重试其写入、不执行其测试/CLI、不换alias/另一声明绕拒绝；不安装、不fetch/commit/push、无完整gates、Dev/Prod/profile、官方/全局/跨仓/媒体/付款动作。hard deny即停止受影响动作并如实报告。
