# 规格：指令菜单「从资产库添加」点击直达选择弹窗

Issue: #2102
插件: omnimux
日期: 2026-09-16

## 1. 目标

会话输入框指令菜单里的「从资产库添加」被点选后，必须**立刻**打开既有资产库选择弹窗，供用户按分类浏览并多选素材。不得只关菜单、不得等后台命令跑完才间接触发、不得静默失败。

## 2. 成功标准

1. 打开会话 → 点「+」或输入「/」→ 点「从资产库添加」→ **同一操作内**出现资产库选择弹窗（左侧分类、右侧卡片，沿用既有选择窗）。
2. 键盘选中该条后按回车，行为与点击相同，直接打开选择窗。
3. 取消 / 关闭选择窗：不新增附件。
4. 当前没有可用会话时：给出可见提示，不静默。
5. 选择窗已打开时再次点同一入口：不叠第二层；忙碌或已达上限时给出既有提示。
6. 不改资产库独立页、不改附件写入上限与去重、不改官方指令菜单样式与其它指令。

## 3. 命令与验证

在任务工作树根目录：

- `node plugins/omnimux/scripts/run-tests.mjs src/client/composer-add/commands.test.js src/client/composer-add/controller.test.js src/client/composer-add/install.test.js`
- 相关失败必须先红后绿（直达打开、会话回退、取消无副作用）。

## 4. 结构

- `plugins/omnimux/src/client/composer-add/commands.js`：点击/回车直达打开
- `plugins/omnimux/src/client/composer-add/controller.js`：会话归属与打开条件
- `plugins/omnimux/src/client/index.js`：挂载直达
- 既有 `AssetPickerModal` 复用，不新建第二套选择窗

## 5. 边界

- 总是：点击即打开；取消无附件；单测覆盖直达与会话回退
- 先问：改官方指令菜单结构、改附件配额
- 绝不：提交密钥；改资产库独立页；删除既有选择窗另做一套

## 6. 假设

- 指令菜单条目本身已由宿主注册，本修复只补「点下去立刻打开选择窗」。
- 选择窗视觉与配额沿用既有实现。
