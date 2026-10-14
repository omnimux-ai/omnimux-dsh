# Issue #3323：治理登记纯检查核心

## 目标与成功标准

阶段 D 已批准。本切片只实现纯 `inspectGovernance(manifest, files, packageJson, workflows)`（兼容设计中的单对象参数）；检查版本 2 登记、传入脚本库存、可证持续集成／本地入口及有限静态依赖。返回诊断、证据、未知项和方便父代理迁移的可达结果。未知不提升分类，静态可达不证明每次执行、函数调用、业务通过或覆盖率。

真实测试、嵌套 helpers 和 `.mjs/.js/.sh/.py` 都不能因名字被排除。幽灵、重复、跨类、越界路径、错误类别和仅语法检查误当执行必须被发现。普通字符串、注释、夹具和其他目录同名脚本不能建边。循环必须有限终止。

## 输入与项目结构

- 唯一源码：`scripts/lib/governance-registry.mjs`；唯一任务规格：本文件。
- `files` 为 Map 或普通对象，键是规范的仓库相对路径，值为已读取的 UTF-8 内容；库存仅为其中 `scripts/` 下四种扩展名，不自行读盘或猜测整个 workspace。未传入的外部目录明确未知。
- 清单四类均为 `scripts/` 相对路径，版本必须为 2；可选 `invocations` 仍在同一清单，不另造执行名单。
- `packageJson` 为对象或 JSON 字符串，只读 `scripts`。
- `workflows` 为路径→YAML 字符串／已解析对象的 Map 或对象（兼容 `{path, content}` 数组）；只读 `jobs.*.steps.*.run`，保留条件、shell、cwd、job/step 和行号。默认 cwd 是仓库根；变量／复杂 cwd 不猜。
- 少量手工边使用 `{from, to, kind, source: {line, callee, argument}, selector?, reason}`；`from/to` 为清单相对路径，`kind` 为 `module/node/bash/python`。source 必须绑定 AST 中该行的真实调用及字面量目标，不接受普通字符串；shell 仅允许真实固定解释器命令行，且整份传入 shell 源只含注释／空行及无变量、无串联的固定解释器命令；其他 shell 结构不猜。有 selector 的 JS 边必须同时落在同值 switch case 中，且 switch 判别式为无重绑定、无嵌套函数作用域的 `process.argv[2]`，再与入口首参数匹配；别名、其他判别式与复杂作用域明确 unknown，不猜路由。无法证明包装器调用语义的登记返回 unknown，不提升覆盖。fork 的字面量调用点可以定位，但即使本模块没有 `process.chdir`，依赖模块也可能改变目录或参数，因此首版不以该局部检查证明进程调用边，始终记录执行上下文 unknown。不泛化包装器、别名求值或 shell 控制流。

## 命令与验证策略

本切片允许 `node --check scripts/lib/governance-registry.mjs`、`git diff --check` 和临时命令中的纯内存断言。内存反例包括：错误版本／shape、重复／跨类、unsafe/fullpath、幽灵、测试／helpers 漏登记、注释／普通字符串、未调用的包脚本、check-only 不展开、静态 import/re-export/literal import、多级／环、同 basename 错路径、复杂命令／变量／glob、包脚本循环、过期／孤立／错误 selector 的手工边。

不写正式测试，不改原清单／工作流，不跑正式门禁或 full gates；由父代理在获准集成阶段补齐正式测试及持续集成直接入口。报告必须记录实际验证命令、退出状态及未知边，不把候选诊断当已接入持续集成。

## 代码风格与实现计划

沿用仓库 ESM、具名导出、英文标识符及 JSDoc 关键输入契约；复用已有 `acorn` 与 `yaml`，不加依赖。先校验输入／清单，再解析真实命令根，再提取 JS AST 的 import/re-export/literal import，最后按 root→edge→target 生成有限证据并比较分类。执行、语法、本地／持续集成证据分别保存；不透明 shell／Python 保留未知。

仅支持固定 `node`、`node --test`、`node --check`、`bash`、`bash -n`、固定 `pnpm/corepack pnpm [run] <script>` 和独立行／`&&`。复杂 shell、命令替换、重定向、glob、动态目标、runner/workspace discovery 不做全语言模拟；安全的已证前缀可以保留，但未知后续不向全图传播。

## 新用户基线与文档影响

这是仓库离线工程检查，不改变产品运行默认值，不依赖开发版服务、凭据或私有绝对路径。缺少内容／不支持语法时返回诊断或 unknown，不执行脚本补证。文档影响由本任务规格及实施报告承载；现行合同无需修改。

## 边界

始终：先规格后源码，输入只读、不扫描外部、不运行库存脚本；保留可证与未知差异；错误分类不能被 unknown 豁免。

父代理后续处理：原清单迁移、正式测试、工作流接入、独立审查及完整仓库验收。

绝不：写授权两文件及指定主报告之外的文件；提交／推送／远端／安装／服务／同步／恢复；官方、全局、跨仓、其他工作树；绕旧 hook 拒绝、改名隐藏测试或重写意图。
