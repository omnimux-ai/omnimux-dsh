# 模型设置显式保存（Issue #4050）

HEAD: 74903d2b4d3ecce8763363cd655de86473bc9a84（实现 + 单测；其后仅补证据文档）

## 现象与根因

修改模型设置页任一配置后，控件直接调用 `configForms` 的 `scope.set` / `scope.unset`；每次控件变化都会触发一次 Host `ConfigEditor` 文档编辑与配置同步。官方原生保存机制是 `SettingsFormModel` / `SettingsForm` 的暂存表单：控件只改本地草稿，只有点击「保存」才调用一次 `scope.mutate(ops, expectedRevision)`。

## 修复

- 新增 `staged-config-scope.js`：提供本地草稿 scope、值/覆盖态叠加、批量 `mutate` 保存与丢弃。
- `ModelsSettingsCard` 顶部显示「有未保存的修改」及「保存」「放弃修改」操作；保存成功清空草稿并刷新模型目录事件。
- 模型默认值、运行方式/场景绑定、输入框/画布可见性均通过草稿 scope 暂存，不再逐项写 settings。

## 真实应用证据

`node scripts/worktree-app-qa.mjs --journey plugins/omnimux/tests/e2e/model-settings-staged-save.journey.mjs`

通过 25 项断言，其中：

- `journey:no-savebar-before-edit`：编辑前没有保存栏；
- `journey:reasoning-option-picked`：选中「低」；
- `journey:savebar-visible-after-edit` / `journey:savebar-copy`：出现「有未保存的修改」；
- `journey:page-does-not-reload-on-edit`：修改后仍停留在 `omnimux` 详情页；
- `journey:savebar-cleared-after-save` / `journey:detail-still-mounted-after-save`：点击保存后保存栏消失且页面仍保持。

结构化报告：`app-qa-report.json`；修改后截图：`staged-save-dirty.png`；保存后截图：`after-save.png`。
