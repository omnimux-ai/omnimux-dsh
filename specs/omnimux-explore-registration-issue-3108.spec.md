# 规格：探索菜单运行时注册接缝（Issue #3108）

## 目标

侧栏「探索」菜单当前是 hub 内硬编码的 11 项白名单（`EXPLORE_MENU_ITEMS`），第三方 / 个人插件无法把入口收敛进它，只能各自往一级侧栏插行。本任务开放一个通用、无宿主耦合的运行时注册接缝，让任意插件在装载时把自己的入口注册进探索菜单，卸载时移除。

用户故事：

- 作为插件作者，我能在不改产品白名单的前提下，把功能入口放进「探索」，而不是自挂一级行。
- 作为产品用户，我没有安装该插件时，「探索」菜单不出现任何指向它的死条目。

## 用户关键操作旅程

1. 打开应用 → 点击侧栏「探索」→ 菜单展开，项目与现状一致（11 项，顺序、图标、点击语义不变）。
2. 装载了调用 `registerExploreItem` 的插件 → 再点「探索」→ 菜单末尾多出该插件条目。
3. 点击该条目 → 复用既有三段委托：`action` → 已挂载行 click → `window.__omnimuxWorkbench.open({ tabId })`。
4. 该插件卸载 / 注销 → 菜单不再出现该条目。

## 期望界面反馈

- 菜单项沿用 `.omnimux-explore-menu-item` 既有度量与样式，无新增视觉层级、无第二套字号/图标尺寸。
- 注册项与内置项在视觉上不可区分；不出现徽章、副标题或分组标题。

## 接口契约

```js
const unregister = window.__omnimuxSidebar.registerExploreItem({
  id: 'fast-news-workbench',   // 必填，稳定唯一键
  label: '快讯中枢',            // 必填，菜单文案
  iconSvg: '<svg …/>',          // 必填，14×14 纯矢量
  tabId: 'fast-news-workbench', // 可选，点击兜底打开的 Workbench Tab
  action: (converged) => {},    // 可选，优先于 tabId
})
```

## 验收用例（可测）

| # | 用例 | 期望 |
|---|---|---|
| AC1 | 不调用注册 | `openExploreMenu` 渲染的菜单项 id 序列 === 内置 11 项 id 序列 |
| AC2 | 注册一项后打开菜单 | 菜单末尾出现该 id，文案与内置项一致渲染 |
| AC3 | 点击注册项且带 `tabId` | 调用 `window.__omnimuxWorkbench.open({ tabId, title: label })` 一次 |
| AC4 | 注册项带 `action` | 调用 `action(CONVERGED_ROWS)`，且 `action` 返回 true 时不再走 tabId |
| AC5 | 重复 id（与内置项冲突 / 二次注册） | 不产生重复项；注册函数返回可调用的注销函数 |
| AC6 | 注销 | 菜单中不再出现该 id |
| AC7 | 形状非法（缺 id / 缺 label / 非对象） | 不抛错，返回空操作注销函数 |

## 新用户基线

- 依赖：仅官方侧栏 DOM 与 `window.__omnimuxSidebar` / `window.__omnimuxWorkbench` 两个 hub 全局，二者均随产品包发布。
- 缺失时：hub 全局不存在 → 插件侧只做一次有界轮询后放弃，不报错、不注入任何行；探索菜单维持内置 11 项。
- 无任何开发机私有路径、端口或本地服务依赖。

## 命令

```bash
# 在任务工作树内
pnpm --filter omnimux test
node --test scripts/verify-anti-slop.test.mjs
pnpm check:boundaries
```

## 测试策略

- 单元：`plugins/omnimux/src/client/sidebar-coordinator.test.js`（既有文件，追加接缝用例，强断言）。
- 浏览器：工作树内真实浏览器验证「探索菜单展开 → 注册项出现 → 点击打开对应 Tab」，留存专属截图与结构化报告。

## 边界

- **总是做**：注册项走单一协调器；菜单渲染合并内置 + 运行时项；注销后立即消失。
- **先问**：改动内置 11 项的顺序 / 文案 / 图标；把某个具体插件 id 硬编码进产品白名单。
- **绝不做**：在垂直 / 个人插件里自挂 `MutationObserver` / `setInterval` 一级行；在产品代码里写死个人插件入口。

## 文档影响

更新 `docs/contracts/sidebar-extra-entries.md`：在「探索 / Explore」条目下记录该运行时接缝与使用约束。
