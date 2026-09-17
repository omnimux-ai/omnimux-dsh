# 规格：全局所有插件页面右上角移除非必要的刷新和关闭按钮

## 1. 背景与目标
在 OmniMux 工作台（基于 Tab 与 Stage 体系）中，各垂直插件页面作为常驻或可切换的工作台主标签页存在。
当前，资产中心、产品库中心、数据分析看板、发布分发中心、创作项目库、灵感创意中心、账号管理与应用广场等多个页面的顶栏（`PageHeader`）右上角机械性地挂载了「旋转刷新（⟳）」与「叉号关闭（✕）」按钮。
这些按钮存在以下突出问题：
1. **关闭逻辑多余易误触**：用户管理与关闭工作台标签页均在顶层标签栏操作，页面右上角孤立的叉号不仅多余，更极易引发误触关闭；
2. **刷新按钮意义不明确**：现代页面具备本地数据订阅、事件驱动或局部精确同步逻辑（如数据分析看板下方的「同步平台状态」），顶栏上粗粒度刷新图标容易造成用户认知混淆；
3. **视觉杂音破坏大留白**：破坏了现代桌面设计的大标题留白排版风格。

**改造目标**：
在各插件主页面顶栏（`PageHeader`）中移除 `onRefresh`、`refreshing`、`refreshTitle`、`onClose`、`closeTitle` 属性的传递，彻底清除右上角多余的旋转刷新与叉号关闭图标；
同时 **100% 完整保留** 必要业务操作（如数据分析看板的「导出数据表格」操作、商品编辑表单右上角的「保存」与「取消」动作，以及各模态对话框内部的关闭逻辑）。

## 2. 详细验收标准（Acceptance Criteria）

- **AC-1（资产中心 AssetsStage）**：
  - `AssetsStage.jsx` 移除 `onRefresh`、`refreshing`、`refreshTitle`、`onClose`、`closeTitle` 传递。
  - 页面右上角不再渲染任何刷新与关闭图标按钮。
  - 资产分类切换、添加资产等主体功能不受任何影响。

- **AC-2（产品中心 ProductsStage）**：
  - `ProductsStage.jsx` 移除 `onRefresh`、`refreshing`、`refreshTitle`、`onClose`、`closeTitle` 传递。
  - 主列表页面右上角不再渲染刷新与关闭图标按钮。
  - `stage-data.test.js` 中相关的测试调用适配调整，保证测试绿灯。
  - 二级表单页面（`ProductFormPage.jsx`）右上角 `actions` 内的「取消」与「保存」按钮 100% 完整保留。

- **AC-3（数据分析看板 AnalyticsStage）**：
  - `AnalyticsStage.jsx` 移除 `onRefresh`、`refreshing`、`refreshTitle`、`onClose`、`closeTitle` 传递。
  - 顶栏右上角的「导出数据表格（`IconDownloadOutline16`）」操作按钮无损保留。
  - 标签栏下方的「同步平台状态」操作与数据刷新流程正常可用。

- **AC-4（发布分发中心 PublishStage）**：
  - `PublishStage.jsx` 移除 `onRefresh`、`refreshing`、`refreshTitle`、`onClose`、`closeTitle` 传递。
  - 页面右上角不再渲染刷新与关闭图标按钮。
  - 列表与批处理操作不受影响。

- **AC-5（灵感创意中心 InspirationStage）**：
  - `InspirationStage.jsx` 移除 `onClose`、`closeTitle` 传递。
  - 页面右上角不再渲染关闭图标按钮。

- **AC-6（创作项目库与画布 WorkflowStage & ProjectLibraryPage）**：
  - `ProjectLibraryPage.jsx` 移除 `onRefresh`、`refreshing`、`refreshTitle`、`onClose`、`closeTitle` 传递。
  - `WorkflowStage.jsx` 移除 `onClose`、`closeTitle` 传递。
  - 页面右上角不再渲染刷新与关闭图标按钮。

- **AC-7（账号管理与应用广场 AccountsStage, AccountsSection & AppsStage）**：
  - `AccountsStage.jsx` 与 `AccountsSection.jsx` 移除 `onClose`、`closeTitle` 传递。
  - `AppsStage.jsx` 移除 `onClose`、`closeTitle` 传递。
  - 页面右上角不再渲染关闭图标按钮。

- **AC-8（设计门禁与质量无回归）**：
  - UI01~UI10 设计规范门禁扫描通过（无裸用控件、无裸色、字号合规）。
  - 各受影响插件的既有单元测试与端到端测试 100% 通过。

## 3. 涉及文件清单
1. `plugins/omnimux-assets/src/client/AssetsStage.jsx`
2. `plugins/omnimux-products/src/client/ProductsStage.jsx`
3. `plugins/omnimux-products/src/client/stage-data.test.js`
4. `plugins/omnimux-analytics/src/client/AnalyticsStage.jsx`
5. `plugins/omnimux-publish/src/client/PublishStage.jsx`
6. `plugins/omnimux-inspiration/src/client/InspirationStage.jsx`
7. `plugins/omnimux-workflow/src/client/WorkflowStage.jsx`
8. `plugins/omnimux-workflow/src/client/projects/ProjectLibraryPage.jsx`
9. `plugins/omnimux-accounts/src/client/AccountsStage.jsx`
10. `plugins/omnimux-accounts/src/client/AccountsSection.jsx`
11. `plugins/omnimux/src/client/AppsStage.jsx`
