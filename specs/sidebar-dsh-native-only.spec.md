# Sidebar DSH-Native Only

## 变更目标

正式版侧栏只保留 DSH 原生入口（新对话、插件、自动化任务），全部 `omnimux-*` 自研入口收敛（不挂载 DOM）。

## 实现

`plugins/omnimux/src/client/sidebar-coordinator.js`：
- `PINNED_ENTRY_PREFIXES` 清空 → `isConvergedEntry` 对所有 `omnimux-*` 返回 `true`
- `EXPLORE_MENU_ITEMS` 缩减为 2 项（`apps`、`clip`），其余 7 项移除

## 旧标准变更

以下测试用例因功能移除而改名/删除，逐条声明：

- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `8 行文案与顺序逐字等于真源清单`
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `Alpha 内测项带行内标识，非 Alpha 项保持纯字符串文案（Issue #3823）`
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `与内置 id 冲突的注册项不出现（内置文案不被冒充）`
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `分组分隔线：上一项 dividerAfter 决定下一行 separatorBefore`
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `注销后注册项从菜单消失，回到 8 行`
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `运行时注册项出现在菜单末尾`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `Alpha entries are excluded from sidebar placement while retaining source registers`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `desktop 外壳包住内层 pane 时仍把 extra row 插在新对话下方`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `常驻行按 rank 挂载在侧栏，探索行不再出现在最下方`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `激活 apps 项时其 element.click 仅被调用一次，绝无重复点击`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `激活委托：命中已注册收敛元素时优先其 click，未注册时回落 tabId`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `移除回归：侧栏不再渲染探索行，源码不再残留浮动菜单实现`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `运行时注册接缝：action 优先于 tabId，非法形状与 id 冲突不产生脏项`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `运行时注册接缝：未注册与内置 8 项完全一致，注册后追加末尾、注销即消失`

## 理由

- `PINNED_ENTRY_PREFIXES` 清空是**产品决策**（用户：正式版只保留 DSH 原生侧栏）
- `EXPLORE_MENU_ITEMS` 保留 `apps` + `clip` 是**技术妥协**（完全清空会导致「更多」菜单空指针、测试断言全崩）
- 测试用例改名是**诚实反映行为变更**，不是掩盖回归
