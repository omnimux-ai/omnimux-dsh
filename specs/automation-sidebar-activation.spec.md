# 规格：自动化 Tab 身份收敛与左侧栏单激活位仲裁映射修复

## 背景与问题陈述
在 OmniMux 桌面端中，当用户点击或切换至「自动化」插件页面时，虽然右侧工作台已成功展开并显示自动化任务内容，但左侧侧边栏中「自动化」导航项却没有显示激活高亮（选中状态），而其他所有一级插件（项目、资产库、灵感社区、技能/专家、发布、数据分析、账号）在激活时均能正确保持高亮背景。

### 根因分析
1. `plugins/omnimux/src/workbench/contract.js`：
   `WORKBENCH_OCCUPANTS` 常量列表中未收录 `omnimux-automation:workbench`，导致在工作台 Tab 成员判定及相关快照校验中其身份被视为非法/缺失。
2. `plugins/omnimux/src/client/workbench/focus-state.js`：
   `WORKBENCH_TAB_TITLE_FALLBACKS` 字典中未配置 `'omnimux-automation:workbench': '自动化'`。
3. `plugins/omnimux/src/client/workbench/sidebar-activation.js`：
   左栏单激活位仲裁器依赖 `WORKBENCH_TAB_TITLE_FALLBACKS` 派生 `RAIL_TAB_IDS` 和 `RAIL_TAB_BY_TITLE`，以执行原生页签身份到左栏 `tabId` 的三级容错映射 `mapNativeTabKeyToRailTab`。由于映射缺失，仲裁器直接判定 `winner: 'none', reason: 'tab-has-no-rail-row'`，导致左栏「自动化」入口的激活谓词恒为 `false`。

## 需求与修改方案
1. **中枢契约补齐**：
   在 `plugins/omnimux/src/workbench/contract.js` 中的 `WORKBENCH_OCCUPANTS` 追加 `'omnimux-automation:workbench'`。
2. **焦点状态与标题回退补齐**：
   在 `plugins/omnimux/src/client/workbench/focus-state.js` 中的 `WORKBENCH_TAB_TITLE_FALLBACKS` 追加 `'omnimux-automation:workbench': '自动化'`。
3. **单元测试与 E2E 测试扩展**：
   - 在 `plugins/omnimux/src/client/workbench.test.js` 中更新 `libraries` 列表及 `WORKBENCH_OCCUPANTS` 长度断言；
   - 在 `plugins/omnimux/src/client/workbench/sidebar-activation.test.js` 中追加对 `'omnimux-automation:workbench'` 与 `'自动化'` 映射与裁决的断言；
   - 在 `plugins/omnimux/tests/e2e/tab-viewport-native-reconciler.spec.js` 中补充自动化页面的左侧栏激活校验。

## 验收标准
- [ ] AC-1: `WORKBENCH_OCCUPANTS` 包含 `'omnimux-automation:workbench'`。
- [ ] AC-2: `WORKBENCH_TAB_TITLE_FALLBACKS` 包含 `'omnimux-automation:workbench': '自动化'`。
- [ ] AC-3: `mapNativeTabKeyToRailTab('omnimux-automation:workbench')` 返回 `'omnimux-automation:workbench'`。
- [ ] AC-4: `mapNativeTabKeyToRailTab('自动化')` 返回 `'omnimux-automation:workbench'`。
- [ ] AC-5: 当宿主右侧栏展开且 activeTab 为自动化时，`resolveSidebarActiveTarget` 返回 `{ winner: 'row', tabId: 'omnimux-automation:workbench' }`，`isRailRowActive('omnimux-automation:workbench')` 返回 `true`。
- [ ] AC-6: 现有 84 项测试及新增测试全部 100% 绿灯通过，无任何倒退。
- [ ] AC-7: 实机 Dev App 上点击自动化入口，实测验证左侧栏高亮属性 `data-active="true"` 生效，截图存证。
