# 模型设置显式保存（Issue #4050）

## Objective

OmniMux 模型设置页的配置控件改为「本地暂存 + 一次保存」，不再在每次下拉/勾选时直接写 settings；修改后不出现假死或自动刷新，用户明确点击「保存」才提交。

## User journey

1. 用户打开官方「更多 → 插件 → omnimux → 模型设置」。
2. 修改任意模型默认值、运行方式/场景绑定或输入框/画布模型可见性；控件立即显示新值，但页面不重新加载。
3. 页面出现「有未保存的修改」提示及「保存」「放弃修改」操作。
4. 点击「保存」后只发生一次配置提交，成功后提示消失；点击「放弃修改」恢复保存前的值。
5. 不保存直接离开页面时，草稿丢弃，不写入配置。

## Root cause

`ModelsSettingsCard`、`ScenarioSelection` 及运行时模型选择在每次控件变化时调用 `scope.set` / `scope.unset`，每一次都是 Host `ConfigEditor` 的一次文档编辑与配置同步；官方原生设置页的保存机制是 `SettingsFormModel` / `SettingsForm` 的暂存表单，只有显式保存才调用 `scope.mutate(ops, expectedRevision)` 批量写入。

## Scope

- 新增 `plugins/omnimux/src/client/staged-config-scope.js`：将 `ConfigFormController` 包装成本地草稿 scope，提供 `value/user` 叠加、`set/unset` 暂存、`save()` 单次 `mutate`、`discard()`。
- 修改 `plugins/omnimux/src/client/ModelsSettingsCard.jsx`：使用草稿 scope；增加未保存提示、保存、放弃修改；保存成功后刷新目录事件。
- 保持 `RuntimeModeSection` / `ScenarioSelection` / Provider 配置的现有 server API 行为；它们通过传入的草稿 scope 暂存配置字段。
- 新增/更新相关单测与真实应用 DOM 旅程；文案加入中英字典。

## Acceptance cases

1. 修改模型下拉：`scope.set` 不会被立即调用；页面出现未保存提示和保存按钮。
2. 连续修改多个字段后点击保存：只调用一次 `scope.mutate(ops, revision)`，ops 按字段去重且包含最终值；成功后草稿清空。
3. 点击放弃修改：控件值恢复为保存前值，不调用 `mutate`。
4. 保存失败：草稿保留并显示失败提示；再次保存可重试。
5. 视觉：保存栏固定在设置区顶部滚动可见，按钮/文案符合现有设计规范；不改动模型目录、Provider API 和设置字段语义。

## 假设

官方 Host 的 `configForms` 控制器支持 `mutate(ops, expectedRevision)` 批量写，并按 revision 拒绝过期编辑；`SettingsFormModel` 的官方行为说明暂存表单是原生机制。模型设置页的字段均属于同一个 `omnimux` settings namespace，可安全合并为一次 mutate。

## 证伪方式

在隔离工作树真实应用中修改一个模型默认值：若未点击保存就产生 settings 写入、页面仍假死/刷新，或保存时产生多次 mutate，则本修复不成立。若放弃修改后控件仍显示新值，或保存失败后草稿被清空，也判定失败。
