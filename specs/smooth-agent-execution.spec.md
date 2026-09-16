# 规格说明：Agent 感知运行丝滑化与统一引用指针消费规范

## 一、背景与问题
1. **统一引用被误当物理文件**：在灵感复刻与素材流转等业务场景中，系统会向 Agent 注入 `@inspiration/<id>`、`@asset/<id>` 等虚拟实体引用。Agent 误以为是缺失绝对路径的本地磁盘文件，从而尝试通过 `glob` 或 `find` 工具在磁盘上翻找。
2. **根路径无界扫描导致 60 秒假死**：Agent 误调 `glob` 扫描 `/Users/x` 触发底层进程限制抛出红字报错（`ripgrep launch failed`）；随后退回 `bash` 调用 `find /Users/x -name ...` 递归扫描整个用户根目录，严重吃满资源并在 60 秒超时后被强制中断杀死，给用户造成“深度求索中 1分35秒”的卡死体验。
3. **工具 Schema 描述缺乏引导**：`video_breakdown_analyze` 与 `video_analyze` 的参数描述仅声明了支持 URL 与本地绝对路径，未明示支持 `@inspiration/` 虚拟引用，加剧了大模型的参数顾虑。

## 二、验收标准与核心行为
1. **工具 Schema 显式支持统一虚拟引用**：
   - `video_breakdown_analyze` 参数 `url` 描述明确注明：支持视频 URL、本地路径以及 `@inspiration/<id>`、`@asset/<id>` 等虚拟引用指针。
   - `video_analyze` 参数 `video` 描述明确注明：支持本地绝对路径、`data:video` URI 或 `@inspiration/<id>` 虚拟引用指针。
2. **中枢提示词注入【统一引用消费公理】**：
   - 在 `plugins/omnimux/src/agents/contracts/` 下新增 `virtual-reference.md` 契约，对所有智能体生效（`agents: ['*']`）。
   - 明确规则：形如 `@inspiration/`、`@asset/`、`@product/` 的标识符为一等虚拟实体指针，直接作为参数传入工具即可被底层解析器透明消费，严禁调用 `glob`、`find`、`bash` 扫描本地磁盘查找物理文件。
3. **零破坏与全自动化验证**：
   - 不改变任何业务逻辑与外部工具调用行为；
   - 单元测试验证中枢契约加载正常、工具 Schema 描述包含虚拟引用声明。

## 三、测试与验证计划
1. 单元测试：
   - 测试 `contracts-loader` 正常解析并注入 `virtual-reference` 契约；
   - 测试 `video_breakdown_analyze` 与 `video_analyze` 的 Schema 包含支持 `@inspiration/` 的描述。
2. 静态检查：
   - `git diff --check` 与 eslint / tsc 验证通过。
