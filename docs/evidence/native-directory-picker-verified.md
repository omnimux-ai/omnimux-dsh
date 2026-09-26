# 原生目录选择器（Native Directory Picker）重构实机与单元验证报告

- **时间**：2026-09-26
- **责任人**：裴像素（前端开发工程师）
- **核准需求**：`specs/native-directory-picker.spec.md` (v3.0.0)
- **对应目标**：彻底废除弹窗内自定义内嵌文件树，统一改由系统原生文件夹选择窗口（Native Directory Picker）唤起，全面解决 macOS TCC 权限与弹窗冗余交互报错。

## 一、验证环境与改动范围
1. 涉及文件：
   - `plugins/omnimux-workflow/src/client/api.js`（导出 `pickProjectDirectory`，通过 `/omnimux-workflow/api/pick` 调用系统原生选择目录窗口）
   - `plugins/omnimux-workflow/src/client/projects/NewLocalProjectDialog.jsx`（彻底移除内嵌文件树，接入原生选择窗口，展示已选卡片）
   - `plugins/omnimux-workflow/src/client/projects/promptNewProjectName.js`（无 React DOM 场景原生对齐，移除内嵌 browse）
   - `plugins/omnimux-workflow/src/client/projects/ForkAppProjectDialog.jsx`（应用副本创建弹窗对齐极简规范与原生打开窗口）
   - `plugins/omnimux-workflow/src/client/locales.js`（白名单文案中英双语锁定：创建项目/创建副本/存放位置/选择文件夹/更改/移除文件夹/取消/创建项目）
   - `plugins/omnimux-workflow/src/client/styles.js`（现代 SaaS 36px/8px 极简几何）
   - `plugins/omnimux-workflow/tests/app-edit-and-fork-flow.e2e.test.mjs`（更新端到端断言对齐产品经理锁定文案白名单）

## 二、测试套件验证结果
1. 单元与组件测试（20/20 PASS）：
   - `plugins/omnimux-workflow/src/client/projects/pickDirectory.test.mjs`：PASS (4/4)
   - `plugins/omnimux-workflow/src/client/projects/NewLocalProjectDialog.test.mjs`：PASS (5/5)
   - `plugins/omnimux-workflow/src/client/projects/promptNewProjectName.test.mjs`：PASS (4/4)
   - `plugins/omnimux-workflow/tests/app-edit-and-fork-flow.e2e.test.mjs`：PASS (5/5)
2. 全量工作流套件验证：
   - 2167 项测试全部通过（0 fail, 0 cancelled）。
3. 质量门禁与反过度设计自检：
   - 彻底移除 `browse-directory` 弹窗内遍历，杜绝 macOS TCC 错误与红字提示
   - 零冗余文字、零主观胶囊、零 Emoji、零括号废话
   - 严格消费 `--dsw-alias-*` Token，符合 32-36px 控件与 8px 圆角规范
