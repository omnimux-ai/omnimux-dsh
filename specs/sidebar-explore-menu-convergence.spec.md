# 侧边栏收敛与常驻探索菜单规格文档（Spec）

## 1. 目标与背景（Objective）
- **背景**：随着 OmniMux 垂直插件与 Alpha 插件数量不断增加，侧边栏出现严重垂直膨胀，信息信噪比降低。
- **目标**：
  1. 收敛侧边栏为极简架构，仅保留核心常驻项与并排新建项目，其余插件全部收敛至「探索」菜单中；
  2. 实现常驻的「探索」侧边栏行（rank 3.9，在「项目」上方），展开态显示图标与“探索”，折叠态显示居中图标；
  3. 实现浮动菜单（挂在 `document.body`），严格展示产品经理核定的 11 项白名单，点击激活对应 Workbench Tab 并关闭菜单；
  4. 支持点击外部与按 Esc 键关闭，支持防溢出几何定位；
  5. 100% 消费官方原生 `--dsw-alias-*` Token，严禁任何 Emoji，使用矢量 SVG 图标，文案逐字对齐白名单。

## 2. 交互旅程与期望界面反馈（User Journey & UI Feedback）

### 旅程 1：侧边栏常驻与折叠形态展示
- **展开态**：
  - 侧边栏在「新建会话/新建项目」下方、项目（rank 4）上方展示高度为 32px 的「探索」行；
  - 左侧展示 14px 纯矢量 SVG 罗盘图标，中间展示锁定文本「探索」，无任何副标题、徽章或 Emoji；
  - Hover 时背景变为 `var(--dsw-alias-interactive-bg-hover)`，Click 时变为 `var(--dsw-alias-interactive-bg-active)`。
- **折叠态**：
  - 侧边栏收起为 56px 轨（`[data-sidebar-collapsed]`），探索行尺寸为 36px×36px，居中放置；
  - 仅展示 14px 矢量罗盘图标，隐藏文本标签「探索」；
  - 悬停或点击行为与展开态一致。

### 旅程 2：探索浮动菜单弹出与浏览
- 用户点击「探索」行按钮：
  - 浮动菜单以 Popover 形式挂载在 `document.body`；
  - 采用深色半透明圆角面板（圆角 12px，背景 `var(--dsw-alias-bg-elevated)` + 毛玻璃 `backdrop-filter: blur(16px)`，细腻描边 `var(--dsw-alias-border-l2)`，阴影 `var(--dsw-alias-bg-mask-1)`）；
  - 浮层位置计算调用 `computeExploreMenuPosition`，优先展示在按钮右侧 6px，当接近屏幕右侧或底部时自动翻转并贴边，防止溢出视口；
  - 浮层内部按产品经理 Spec 白名单展示严格 11 项：
    1. 应用
    2. 视频剪辑
    3. Google Vids
    （细分割线 `var(--dsw-alias-border-l1)`）
    4. 产品库
    5. 发布
    6. 账号
    7. 手机管理
    （细分割线 `var(--dsw-alias-border-l1)`）
    8. 数据分析
    9. 自动化
    10. 任务表单
    11. 社交采收
  - 每一项高度为 32px，内边距 `0 10px`，圆角 8px，左侧为 14px 纯矢量 SVG 图标，中间为锁定文案；
  - 鼠标悬停在菜单项上时触发 hover 态高亮反馈。

### 旅程 3：菜单项激活与退出交互
- 用户点击菜单项：
  - 浮层立即关闭（DOM 移除并解绑 document 监听器）；
  - 若对应插件已被加载并注册，委托触发其已注册元素的 `click()` 处理器；
  - 兜底调用 `window.__omnimuxWorkbench.open({ tabId, title })` 唤起对应 Workbench Tab；
- 用户在菜单外部点击（mousedown）或按下键盘 `Escape` 键：
  - 浮层平滑关闭，探索行按钮状态恢复（`aria-expanded="false"`）。

## 3. 收敛与常驻规则（Convergence Rules）
- **核心常驻项**：
  - `omnimux-workflow`（项目，rank 4）
  - `omnimux-assets`（资产库，rank 6）
  - `omnimux-inspiration`（灵感社区，rank 7）
  - inline 的「新建项目」（`kind: 'inline'`）
  - 常驻「探索」行（rank 3.9）
- **排除技能专家**：
  - `omnimux-market` 排除在侧边栏 extra rows 之外（归属底部 footer）
- **收敛项**：
  - 其余所有业务插件（包括所有 Alpha 插件 accounts, publish, analytics, forms, automation 以及垂直插件 video, products, device, clip, social-harvest, apps 等）调用 `register` 时被收敛；
  - 不再作为独立行插入侧边栏 DOM（`element.parentElement === null`）；
  - 实例保存在 `CONVERGED_ROWS` 中供探索菜单委托激活。

## 4. 验收用例与测试策略（Acceptance Criteria）
1. `EXPLORE_ROW_RANK`: 探索行 rank 必须严格为 3.9，排在项目（rank 4）正上方；
2. `EXPLORE_ROW_RENDER`: 展开态包含 14px 矢量 SVG 图标与文案「探索」，折叠态隐藏文案居中展示；
3. `CONVERGED_PLUGINS_EXCLUDED`: 被收敛插件注册后 `element.parentElement === null`，侧边栏不显示独立行；
4. `PINNED_PLUGINS_MOUNTED`: 核心常驻项（`workflow`, `assets`, `inspiration`）与 inline 项正常挂入 DOM；
5. `EXPLORE_MENU_WHITE_LIST`: 探索菜单包含 11 项白名单，文案逐字匹配，零 Emoji，零多余徽章与副标题；
6. `EXPLORE_MENU_DISMISS`: 按 Esc 键或点击外部关闭菜单；
7. `EXPLORE_ITEM_CLICK`: 点击菜单项激活对应 Tab 并关闭菜单；
8. `GEOMETRY_CLAMP`: 浮动菜单几何定位具备视口防溢出夹逼。
