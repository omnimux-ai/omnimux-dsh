# 规格说明书：输入框加号四项 + 可复用灵感库选择器 + 恢复技能面板

## 1. 业务目标与价值
把对话输入框左下角收敛为「+」与「技能」。加号菜单四项与产品图 2 逐字对齐；资产库、商品库打开现成选择弹窗；仅「从灵感库选择」新增弹窗，且必须复用共享弹窗外壳，抽象成可被输入框、槽位芯片、日后画布复用的组件。技能面板从历史提交恢复，数据和分类仍来自技能市场插件。选中素材进入输入框内侧卡槽（纯缩略图）。

新用户基线：资产库/商品库/灵感库均可为空。空态引导去对应一级页导入，不依赖开发机私有目录。未登录时云端灵感列表走现有登录门禁，不伪造数据。

## 2. 交互细节

### 2.1 加号菜单（宿主命令，不自绘第二套菜单）
四项顺序与文案：

1. 上传媒体或文件（`add-file`）→ 本机文件选择，写入附件卡槽
2. 从资产库选择（`add-from-library`）→ 现成 `AssetPicker` / `AssetPickerModal`
3. 从商品库选择（`add-from-product`）→ 现成 `ProductPicker` / `ProductPickerModal`
4. 从灵感库选择（`add-from-inspiration`）→ 新增 `InspirationPicker` / `InspirationPickerModal`

不含「计划模式」。不含独立「从角色库选择」（角色走资产库「角色」分类）。

### 2.2 灵感库选择弹窗（唯一新增 UI）
- 位置：执行中枢 `plugins/omnimux/src/client/components/inspiration-picker/`，与资产/商品选择器并列
- 外壳：`picker-dialog` 共享契约，变体 `inspiration`，几何 6×156+16 = 1016
- 组件：`PickerHeaderTabs`、`PickerToolbar`、`PickerFilterPills`、`PickerSearchInput`、`PickerFooter`、`PickerEmpty`、`ModalCloseButton`
- Tab 第一项必须是「全部」：全部 / 本地 / 云端。不含账号监控
- 数据：HTTP `/omnimux/inspiration/local`、`/omnimux/inspiration`；**禁止** import `omnimux-inspiration` 客户端
- 确认：写入会话附件卡槽（封面作缩略图）。不预填复刻文案、不新开会话
- 空态：引导打开灵感库一级页 `omnimux-inspiration:library`
- 导出契约：`InspirationPicker({ open, onClose, onConfirm, t, occupied, alreadyIds, maxSelect })`，与 `AssetPicker` 同形

### 2.3 技能面板
在 `omnimux-market` `apply.js` 按历史提交 `07bbea411` 删除前的方式，把 `SkillPickerButton` 重新挂到 `conversation.input.left`（id `omnimux-market-skill-picker`，order 10）。
分类与搜索仍走 `skill-picker.js` + `skill-picker-logic.js`（`PICKER_TABS` / `SKILL_SHELF_TAXONOMY`）。
不恢复底栏模型选择器。营销模式继续隐藏技能按钮。

### 2.4 底栏与卡槽
卸掉独立「产品」「角色」「广告格式 / 亮点 / 风格」按钮。
卡槽沿用 `AttachmentTray` 媒体态 44×44 纯图，位于输入框内侧、文字上方。
商品/灵感确认只入卡槽，不往输入框插入文字胶囊。

## 3. 验收标准
1. **AC-1** 加号菜单仅四项，中文文案与 2.1 完全一致。
2. **AC-2** 「从资产库选择」「从商品库选择」分别打开现有 `omx-pick-dialog--assets` / `omx-pick-dialog--product`，不新写弹窗。
3. **AC-3** 「从灵感库选择」打开 `omx-pick-dialog--inspiration`：Tab 首位「全部」、6 列微卡、共享外侧关闭按钮、确认写入卡槽。
4. **AC-4** `InspirationPicker` 可被 Modal 适配层以外的调用方以同形 props 打开。
5. **AC-5** 底栏可见「技能」按钮；面板分类来自技能市场货架；不出现独立产品/角色/预设胶囊。
6. **AC-6** 卡槽只显示缩略图，无名称、无类型英文标签。

## 4. 边界
- 总是做：复用 picker-dialog；Tab 首位「全部」；先演示后合入。
- 先问：把「计划模式」加回加号；恢复底栏模型选择器。
- 绝不做：重写资产/商品弹窗；重写技能面板；在灵感弹窗里做「去对话复刻」；import 灵感库客户端模块。
