# #3360 完整父上下文独立出现序号

## 目标与成功标准
明确新增一个有限语法维护稳定性合同，不将原拒绝倒签为误拦。通过既有公开 `inspectTestAuthoringDelta` 纯字符串入口：before 为 first/second 两个不同固定标题、同形异步回调，各包含既有动态成员 `data[key]` / `other[index]`；after 在前面添加不同固定标题的同形空异步回调。比较应允许，完整候选 `inspectTestAuthoring` 仍拒。先对真实旧源码运行正式测试，必须观察实际 allowed=false 引起正常断言失败，不接受零测试、加载失败或模拟旧实现。

## 结构与文档归属
仅修改既有 `scripts/test-authoring-inspection.mjs`、既有同名 `.test.mjs` 与本规格。主树临时实施报告记录返回值、红绿结果、源码身份及未知；不改现行全局合同，不重建 #3357 原候选。本规格是新有限规则的任务文档归属，无产品界面或新用户运行依赖变化。

## 设计与风格
继续现有私有函数、ES模块、两空格、无分号风格。只把同形函数、BlockStatement、StaticBlock 的出现序号统计域改为可信解析得到的完整父上下文链；域键保留 canonical 的祖先 occurrence、edge、slot/index、type、名称、固定调用参数轮廓。相同完整父域即使非相邻也继续累计；不每个调用清空、不删除上下文或序号、不加测试名白名单，不扩展词法或数据流模型。

## 测试策略与命令
使用原 node:test 文件，所有运行测试标题保持字面量；数据字符串只经 Acorn 解析，不执行。首例独立纵向红绿，随后固定标题分别覆盖：无源码夹具/notGraph/未知导入纯矩阵；重复与超额多重集；位置、标题、作用域、正文变化；同父块及非相邻同形回调序号；作为完整父上下文的 for-of 数据变化；导入引用身份、未知动态选项、新Spread/危险导入/eval/执行选择器等保守行为。

允许命令：
- `node --test --test-name-pattern='unrelated literal parent callbacks preserve existing dynamic member risks in delta only' scripts/test-authoring-inspection.test.mjs`（旧源码红及最小改后绿）。
- `node --test scripts/test-authoring-inspection.test.mjs scripts/test-change-review.test.mjs scripts/guard-anti-cheat.test.mjs`（最终一次相关正式测试，保留自动导入的公开 apply 测试）。
- `git diff --check` 及只读 Git 状态、差异、源码摘要身份检查。

## 硬边界与非目标
保留风险正文、导入引用角色和单specifier字段、完整父上下文、multiset、unknown 动态名称/options、new Spread/危险import/eval等规则。真实 before 和 source-unverified 独立拒绝标志、来源路径规则、manifest、hook与实际授权完全不动；纯入口无可信导入事实不能自行授予真实apply来源信任。#3343 动态 `test(scenario.name)` 不放宽；root角色已交付不产生新selector授权。

不执行 #3357 原拒payload、不调整原位置或标题、不以反例洗写权限；原超时根因仍 unknown。不安装依赖、不新增Git fixtures、不运行quality suite或完整gates、不提交推送fetch、不动远端/App/profile/official/打包/真实模型。正常编辑若安全拒绝或超时，停止整个受影响修改并保留完整payload和返回，不换工具/helper/别名/拆缩重送。新用户仍沿原安装和正式检查路径；本修改不新增配置或服务，缺可信来源仍拒绝。
