# 数字人改名「AI网红工作室」+ 左栏入口收敛进「更多」菜单（Issue #3811）

## 目标与成功标准

两件互相独立但同批交付的事：

1. **改名**：把用户可见的「数字人」改为「AI网红工作室」，中文与英文词条同步。
2. **入口收敛**：左栏常驻行退役，入口只出现在官方「更多」菜单里，点击打开同一个工作台。

- 侧栏不再出现「数字人」常驻行（展开态与收起态都不出现）。
- 官方「更多」菜单出现「AI网红工作室」，点击打开 `omnimux-avatar:studio` Tab。
- 页面标题、Tab 标题、菜单项文案三者一致。
- 既有 356 项插件测试零退化；新增用例覆盖入口收敛与文案一致性。

## 改名边界（改什么、不改什么）

改名只作用于**面向用户的产品表面**。业务概念「数字人」作为数据类型仍保留，因为改名它会让资产库分类、Agent 工具语义与已有数据对不上。

| 位置 | 处置 | 理由 |
|---|---|---|
| `locales.js` 的 `nav` / `avatar.label` | 改为「AI网红工作室」/ `AI Creator Studio` | 页面标题与 Tab 标题都读这两个键 |
| `locales.js` 的 `avatar.create` / `avatar.switch` / `avatar.empty` 等动作文案 | 改为「新建工作室」等中性说法 | 这些是用户看到的按钮，同属产品表面 |
| `locales.js` 的 `TEXT_KEYS` 里 `['数字人', 'Characters']` | 改为新名称 | 源工作台对照词条 |
| `tools.js` 的 Agent 工具描述 | **保留**「数字人」 | 工具是给 Agent 用的数据接口，改名会与既有调用与文档脱节 |
| `store.js` / `library-sync.js` 的错误与标签 | **保留**「数字人」 | 资产库分类标签是数据分类，已有资产已按此打标 |
| `plugins/omnimux/src/client/locales.js` 的 `characterPicker.cat.digitalHuman` | **不改** | 那是中枢角色分类器的一个类别，不是本插件名称 |

## 用户旅程

1. 打开侧栏，看不到「数字人」常驻行；侧栏第一屏被释放。
2. 点「更多」展开官方菜单，里面出现「AI网红工作室」。
3. 点击它，打开数字人工作台；左侧栏该菜单项与工作台 Tab 都呈现选中态。
4. 关闭 Tab 后再次从「更多」打开，行为一致。

## 项目结构与复用

- 入口收敛复用本仓已有先例：`plugins/omnimux/src/client/explore-more-menu.jsx` 向官方 seat `sidebar.panellist.actions` 注册（#3785 把探索入口这样收敛）。
- avatar 的 `apply()` 已声明 `inject = ['slots', 'locale']`，因此 `ctx.slots` 直接可用，不需要新增宿主能力。
- 打开工作台沿用现有 `createWorkbenchStageStore(...).open()`，不新写导航。
- 行图标复用 `index.js` 里已有的 `ENTRY_ICON`（14×14 纯矢量，符合侧栏契约），不引入新素材。

## 新用户基线

只依赖正式安装的插件与官方宿主提供的 `sidebar.panellist.actions` seat。该 seat 不存在时（老宿主）入口回落到既有 `betterSidebar` Tab 注册面，用户仍能从工作台 Tab 进入；不静默丢失入口，也不依赖开发机配置。

## 命令与测试策略

- 插件测试：`cd plugins/omnimux-avatar && npm test`。
- 构建：`node plugins/omnimux-avatar/scripts/build-client.mjs`。
- 静态：`node scripts/verify-plugin-boundaries.mjs`、`node scripts/verify-product-baseline.mjs`、`node scripts/verify-stage-contracts.mjs`、`node --test scripts/verify-anti-slop.test.mjs`、`node scripts/verify-sidebar-panel-chrome.mjs`。
- 真机浏览器：任务工作树完整应用 `ui` 合成模式 + 专属 journey，断言侧栏无常驻行、菜单有该项、点击能打开页面。
- 先写会失败的回归（常驻行不存在、菜单项存在、文案一致），再实现。

## 假设

官方 `sidebar.panellist.actions` 是 root 作用域 list seat，任意插件注册即渲染成菜单行；`omnimux` 插件已在用同一 seat，说明本机宿主已提供该能力。因此 avatar 只需持有 `slots` 服务即可注册，注册项按 `order` 排序渲染。

## 证伪方式

若 avatar 注册到该 seat 后「更多」菜单里不出现该项，或点击无法打开 Tab，说明该 seat 对非 `omnimux` 插件不可用、或注册 id/order 与该插件冲突。证伪步骤：在真实应用里展开「更多」菜单，检查是否出现「AI网红工作室」；不出现则改用 `ctx.inject(['betterSidebar'])` 已有的 `registerTab` 做等价收敛（把常驻行移除、只保留 Tab 入口），并把结论写回本规格。

## 边界

- 总是：先读规则与文件，先规格后代码，只改本工作树，保留真实错误。
- 先问：生产发布、凭据、跨工作区修改。
- 绝不：改官方 `packages/` 或中枢私有实现，用 CSS/DOM 隐藏残留行充数，把数据类型标签一起改名导致既有资产与工具脱节。

## 旧标准变更

- `plugins/omnimux-avatar/src/client/workbench-seat.test.js` :: `registers the left-rail row with its own dataset marker`

理由：该用例原断言 `source.includes('data-omnimux-avatar-entry')`、`datasetKey`、`customClassName: 'omnimux-avatar-entry'`，锁的正是本轮要退役的左栏常驻行实现。入口收敛进官方「更多」菜单后这三处必然消失，不改就无法实现需求。

新期望比原断言更严：改为正向断言「必须注册进官方「更多」菜单」与「点击复用 `stageStore.open()`」、并保留「工作台 Tab 注册仍在」作为老宿主回退保证，同时以负向断言确认 `createSidebarEntry` 与 `mountSidebarEntry` 都已从源码移除（防止有人用 CSS 隐藏充数）。这是本任务唯一一条改写的既有用例，其余 355 条原样保留。
