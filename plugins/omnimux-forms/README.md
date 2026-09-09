# OmniMux 任务表单

三个配置式拆解与复刻模板，生成可编辑的新会话草稿，由用户确认发送。

- 浏览器构建打包 `@omnimux/form-contract` 和统一模板，案例从 `packages/form-contract/examples/` 复制到安装产物。
- 七种字段使用 Chakra UI 3；关闭全局 reset、默认条件主题及 keyframes，变量只写入 `.omnimux-forms-body`。
- `window.__omnimuxForms` 是 hub 公共接缝，负责真实素材导入、核验及会话草稿交接。
- 表单草稿仅保存在显式 `$DSH_HOME/omnimux/forms/`，按工作区、模板和模板版本隔离，以乐观版本避免跨页面覆盖。
- 无自动发送、模型调用或源文件删除。

开发：`pnpm --filter omnimux-forms build`；验证：`pnpm --filter omnimux-forms test`。浏览器与 Dev 验收由仓库 `verify:live` 执行。
