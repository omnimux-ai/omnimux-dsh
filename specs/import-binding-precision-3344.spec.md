# #3344 使用处风险的导入绑定精度

## 目标与成功标准

修复 #3301 / #3343 正常测试维护的直接误拒：同一非危险静态导入声明新增未用安全兄弟项，不应改变既有使用处风险的绑定指纹。仅改变 `scripts/test-authoring-inspection.mjs` 的导入 Map 粒度，既有风险不得被清零。

实际反证使用只读 `scripts/verify-silent-catch.test.mjs` 完整 464 行作为 before，after 只在唯一 `  main,\n` 后加 `  analyzeIncrementalChanges,\n`；旧 helper 对“允许”断言必须真实失败，修复后纯公开差异接口必须允许。候选仅字符串输入，绝不导入、执行候选或调用新增 API，不写被拒原测试。

## 命令

- 真实旧失败：在任务树用 `node --input-type=module` 对上述内存候选调用公开 `inspectTestAuthoringDelta`，断言 `allowed === true`，保留实际退出码与输入摘要。
- 正式回归：`node --test scripts/test-authoring-inspection.test.mjs scripts/guard-anti-cheat.test.mjs scripts/guard-quality-loop.test.mjs scripts/test-change-review.test.mjs`。
- 存量清单：`node scripts/verify-silent-catch.mjs --json`，只读运行，不执行 scanner 测试夹具。
- 语法：`node --check scripts/test-authoring-inspection.mjs` 与 `node --check scripts/test-authoring-inspection.test.mjs`。
- 差异与影响：`git diff --check`；`node scripts/impact-matrix.mjs --git-diff --base be43a027a0cb7db405bb962956809e7866eaebbd`。
- 完整 `test:gates` 留给父代理交付阶段，不安装依赖、不构建或启动 App、不远端写入。

## 项目结构与文档归属

仅可写 helper、原 `scripts/test-authoring-inspection.test.mjs`、本规格、所属 `docs/contracts/anti-agent-fake-completion-guard.md` 必要一句；唯一主报告为主树 `tmp/agent-infra-2026-10-14/import-binding-3344-implementation.md`。父代理负责后续独立审查与集成，报告完成前不写上述路径。

## 代码风格与实现

保持既有 JavaScript 命名和风格；最小实现为 `imports.set(specifier.local.name, Object.assign({}, statement, { specifiers: [specifier] }))`。复制原声明所有字段，唯一覆盖 specifiers 为当前单项；复用既有 canonical 去坐标，保留完整 source Literal 的 value/raw、specifier type/imported/local，以及解析器可支持的未知声明属性、kind、attributes。无需新 helper、tokenizer、resolver、名单、审批 token 或 Spread 语法。

## 测试策略

用户已指定公开纯接口 `inspectTestAuthoringDelta` / `inspectTestAuthoring` 为测试 seam；在原正式测试追加可见断言，先一条旧 red 再最小 fix，再补矩阵，不新增临时测试文件或夹具。

- 同 source 新增未用无关兄弟项允许；不同绑定类型分别覆盖具名、default、namespace 使用处风险。
- source value/raw 改变、已用 imported/local 变化、default/namespace 类型变化仍拒绝；具名字符串 imported 变化仍拒绝。
- 新 known builtin 导入、新危险具名导入、新 Spread、类型语法与不完整语法仍拒绝。
- 原整声明 ImportSpecifier 风险上下文、危险内建 ImportDeclaration 正文旁增加兄弟项仍保守拒绝，明确不是全面 import-list 维护放行。
- 无 before 的新文件仍做完整检查；既有 full 检查、公开 apply 19 项、导入来源及质量循环回归保持。

不将纯 helper 的 synthetic resolver 或语法允许等同真实来源认证、旧标准批准或沙箱安全。

## 边界、新用户基线与未知

总是先读实际文件、先规格、保留旧断言与真实运行证据，发生正式测试 edit 拒绝即停止该动作，不用 shell/别名/新 helper/另声明替代载荷绕过。

不改风险 reason、node body、context、slots、出现身份、多重集、真实 before 或 guard 未确认来源独立硬拒；`contextOf(ImportDeclaration)` 仍 whole。旧 oracle 删除/变弱、作用域解析、模块副作用和通用执行安全不属于本切片。

新用户使用仓库既有离线 Node/Acorn 环境，不增加任何机器私有依赖或默认服务；解析失败继续 `unsupported-or-incomplete-test-syntax` 保守拒绝。属性/type 语法是否被当前 parser 支持以实际解析为准，不声称新 parser 能力。

禁止任务 commit/push/fetch、其他树写入、依赖安装、完整 gates、Dev/Prod/profile、官方/全局/跨仓修改、真实模型/媒体/付款、原受拒文件写入或夹具准备。报告必须区分本地验证与未执行的父级交付。
