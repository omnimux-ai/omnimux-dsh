# OmniMux Form Contract

配置式任务表单的离线契约。包为仓库内部使用，不注册插件、不渲染页面、不读取素材、不发送对话。

## 使用

运行环境沿用仓库的 Node/pnpm 约束；Node 原生类型擦除执行源文件，TypeScript 独立执行严格类型检查。已声明的依赖是 Zod 与开发用 TypeScript，不需要 UI 库。工作树仅安装本包依赖时可运行 `npm install --prefix packages/form-contract --workspaces=false --package-lock=false --ignore-scripts`，避免整仓安装对本地插件路径的依赖。

从仓库根运行 `pnpm --config.verify-deps-before-run=false form: --help` 查看真实命令，执行 `pnpm --config.verify-deps-before-run=false verify:forms` 完成类型检查、测试与生成物检查。参数仅关闭 pnpm 命令前的隐式安装，不关闭验证。

使用[表单创建 Skill](../../.agents/skills/omnimux-form-authoring/SKILL.md)创建、修改或检查表单。[生成参考](generated/reference.md)包含字段定义、命令和可运行的官方结构示例；[作者工作流](../../.agents/skills/omnimux-form-authoring/references/workflow.md)说明统一页面、素材与更新边界。

## 公开接口

从 `@omnimux/form-contract` 导入：

- `validateDefinition(unknown)`：结构与跨字段语义检查，成功返回解析后的配置。
- `validateValues(definition, unknown)`：先检查配置，再检查填写数据；仅对缺省值应用默认值。
- `buildDraft(definition, unknown)`：检查配置和填写数据，成功返回版本、模板标识、纯文本 Prompt 和按映射顺序排列的附件引用。

三个接口统一返回 `ok: true, value` 或 `ok: false, errors`。每条错误包含稳定 `code`、字段 `path` 与可读 `message`；校验错误不抛异常。函数不执行 I/O、不修改输入；公开 TypeScript 类型与结构定义一起推导。JSON Schema 通过 `@omnimux/form-contract/schema` 导出，不能代替完整语义检查。

## 版本与验收

协议版本与模板内容版本独立维护。未知协议拒绝，不存在隐式迁移。协议规则变化需同时运行测试、更新生成参考，并核对官方模板的业务含义；不能只重新生成预期草稿来让测试通过。

三个官方样例中的 `example:` 引用用于离线测试，并非可用素材。大小、时长等限制是样例输入政策，不是模型能力声明。测试覆盖元数据一致性，不能证明文件存在、上传成功、页面可用或 Agent 已执行。
