# Spec: 「探索」菜单 10 项注册进官方「更多」菜单（sidebar.panellist.actions）

- Issue: #3774
- 风险级别: R1（客户端侧栏入口增量，可逆；不改官方源码、不改布局 rank）
- 宿主: OmniMux Dev 2.0.10 / dsh `0.2.1-rc.3`（submodule `1f81c047fc`）
- base: `origin/main` @ `457db50c1`

## 1. 目标与用户故事

DSH `0.2.1-rc.3` 的官方左侧栏自带「更多」菜单：root 作用域列表 seat `sidebar.panellist.actions`，只要有注册就渲染该行，菜单内容由注册项渲染。产品侧当前把 OmniMux 的 10 个入口只画在自绘的「探索」浮动菜单里，官方这个入口是空的。

用户故事：用户点侧栏「更多」→ 看到「应用 / 视频剪辑 / 产品库 / 发布 / 账号 / 手机管理 / 数据分析 / 自动化 / 任务表单 / 社交采收」→ 点任一项 → 菜单关闭并打开对应 Workbench Tab / 产品 Stage。

## 2. 现状与官方接缝（已核对）

| 事实 | 位置 |
|---|---|
| seat 定义：`sidebar.panellist.actions`，kind `list`，scope `root` | `deepseek-harness/packages/client/ui-sidebar/src/client/contract/slots.ts:38`（submodule `1f81c047fc`） |
| 官方参考实现：一个注册渲染多行菜单项，点击 `onDismiss()` 后执行动作 | `packages/client/ui-entry-customization/src/client/EntryMenuContent.tsx` |
| 菜单行原语 `MenuItemButton`（支持 `icon` / `separatorBefore` / `current`） | `packages/client/ui-primitives/src/index.ts:26` |
| 侧栏渲染：`renderSlot('sidebar.panellist.actions', { entries, onOpen, onPinnedChange, onDismiss })` | `packages/client/ui-sidebar/src/client/SidebarRoot.tsx:120` |
| 本仓 10 项清单（唯一真源）+ 运行时注册项合并 | `plugins/omnimux/src/client/sidebar-coordinator.js` → `EXPLORE_MENU_ITEMS` / `resolveExploreMenuItems()` |
| 本仓激活三段委托（`action` → 已挂载行 click → `__omnimuxWorkbench.open`） | 同文件 `activateExploreItem(item)` |
| hub 客户端入口（已注入 `slots`，已传 `primitives`） | `plugins/omnimux/src/client/index.js`（`installCommandsI18n(ctx, primitives)` 为先例） |

## 3. 实现设计

1. 新增 `plugins/omnimux/src/client/explore-more-menu.jsx`：
   - `EXPLORE_MORE_MENU_SLOT = 'sidebar.panellist.actions'`、`EXPLORE_MORE_MENU_ID = 'omnimux-explore'`。
   - `createExploreMoreMenuContent({ MenuItemButton })` 返回 React 组件：按 `resolveExploreMenuItems()` 渲染菜单行，`separatorBefore` 取「上一项 `dividerAfter`」，`icon` 用该行既有 `iconSvg`（受信 HTML，沿用 DOM 菜单同一信任边界），`onSelect` = `onDismiss?.()` 后 `activateExploreItem(item)`。
   - `installExploreMoreMenu(ctx, primitives)`：`ctx?.slots?.inject` 不是函数时直接 no-op；否则 `ctx.slots.inject(EXPLORE_MORE_MENU_SLOT, () => ctx.slots.register({ name: EXPLORE_MORE_MENU_SLOT, id: EXPLORE_MORE_MENU_ID, order: 100 }, Content))`。
2. `index.js` 的 `apply()` 里调用 `installExploreMoreMenu(ctx, primitives)`。
3. 单一真源：清单、图标、分组、激活语义全部复用 `sidebar-coordinator.js` 现有导出，新模块不得复制第二份。
4. 不订阅运行时注册变更：菜单每次展开重新挂载即读取最新集合，与现有浮动菜单「下次展开即最新集合」语义一致。
5. 常驻「探索」行与浮动菜单本次保留不动（非目标）。

## 4. 范围 / 非目标

范围：hub 客户端新增模块 + 入口挂载 + 单测 + `docs/contracts/sidebar-extra-entries.md` 合同同步。

非目标：删除「探索」行/浮动菜单；改侧栏 rank 或布局；改官方 `packages/`；Electron 壳层；`sidebar.panellist`（一级行）注册。

## 5. 验收标准（可观察）

- [ ] 「更多」菜单展开后含 10 项，文案与顺序与「探索」菜单逐字一致，分组分隔线一致（视频剪辑后、手机管理后各一条）。
- [ ] 点击任一项：菜单关闭，并走既有三段委托打开对应 Workbench Tab / 产品 Stage。
- [ ] 未安装对应插件时不出现死条目（沿用现有白名单 + 运行时注册语义）。
- [ ] 无 `slots` 服务时 no-op 不抛错（老宿主兼容）。
- [ ] 隔离 worktree 真实浏览器证据：截图 + 结构化报告。
- [ ] 单测与所选静态检查通过。

## 假设

- 假设 A：`0.2.1-rc.3` 宿主把 `sidebar.panellist.actions` 注册项渲染在「更多」菜单内，且 `MenuItemButton` 在该宿主可用。
- 假设 B：清单与激活语义可直接复用现有导出，无需第二份实现；复用后点击行为与「探索」菜单一致。
- 假设 C：seat 不存在时 `ctx.slots.inject` 的回调不触发（cordis 惰性注册语义），因此不需要 try/catch 兜底。

## 证伪方式

- 证伪 A：真实浏览器里「更多」菜单没有我们的行，或注册抛错 → 停手，回到官方 seat 文档与 `entry-customization` 参考实现复核，不改为自绘 DOM 硬塞进菜单。
- 证伪 B：复用后点击行为与「探索」菜单不一致（鉴权、Stage 分支、Tab 兜底不同）→ 以既有 `activateExploreItem` 为唯一真源修正，不在新模块重写一套。
- 证伪 C：老宿主（无该 seat）启动时报错或菜单渲染出空占位 → 改为显式存在性判定（读 slots 规范）后再注册，不保留静默 `catch`。

## 8. 证据计划

- 单测：`pnpm --filter omnimux test`（或该包既有 run-tests 入口）覆盖注册形状、10 行渲染、点击委托 + `onDismiss`、无 slots 服务 no-op。
- 静态：`pnpm verify:stages`、`node --test scripts/verify-anti-slop.test.mjs`（client/Stage 面）。
- 浏览器：隔离 worktree 内 `pnpm test:worktree-web` / ego-browser，截图证明「更多」菜单含 10 项且点击生效；证据落本 worktree。

## 9. 文档影响

`docs/contracts/sidebar-extra-entries.md` 增补「官方『更多』菜单注册」小节（seat、单一真源、激活语义、与浮动菜单的关系），并更新 occupants 说明；本 spec 位于任务 worktree。
