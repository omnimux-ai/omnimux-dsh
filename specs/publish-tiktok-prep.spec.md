# 3898 TikTok 官方发布最小闭环准备（恢复账号入口与清理假排期）

Issue: #3898 · 分支 `agent/publish-tiktok-prep-issue-3898` · 风险等级 **R2**（单插件 `omnimux-publish` 非破坏性功能恢复与清理）

## 背景与问题

在云端网关完成 TikTok 官方接口联调前，`omnimux-publish`（内容发布中心）存在两处阻断最小闭环体验的断层：

1. **TikTok 专属绑号入口在主界面丢失**：`plugins/omnimux-publish/src/client/AccountsSidebar.jsx` 与 `AuthorizeModal.jsx` 已完整实现了针对 `provider='tiktok_direct' & platform='tiktok'` 的账号列表、搜索、VPN 节点确认弹窗、3 秒新账号轮询及安全断开连接；但在历史 UI 改版（`92b37c829`）中，`PublishStage.jsx` 顶层的「发布 / 账号」视图切换被移除，且新建发布页（`Composer`）左侧 `AccountPanel` 在无账号空态时仅文字提示“请在发布插件的「账号」页添加官方授权”，没有可点击跳转入口，导致用户无法在发布中心内绑定或管理 TikTok 官方账号。
2. **工具栏存在无后端支撑的“假排期”与“日历视图”误导项**：`PublishControlBar.jsx` 暴露了 `modeFilter`（全部 / 定时发布 / 即时发布）下拉框与 `calendar`（日历视图）切换按钮，但 `Composer` 与后端 `SubmitService` 仅支持即时发布，日历视图也只是按历史提交时间展示非草稿记录，容易误导用户以为已支持自动定时排期。

## 方案

1. **恢复顶层「发布 / 账号」视图切换与空态快捷跳转**：
   - 在 `PublishStage.jsx` 的操作行（`PublishActionRow`）右侧或顶层导航区，使用 `dsh-ui-kit` 标准 `Tabs`（或 `Button`）恢复 `stageView`（`'publish' | 'accounts'`，默认 `'publish'`）切换，严格遵守禁止裸 `<button>` 与一级页滚动吸附契约（`.omx-stage-scroll` / `.omx-stage-sticky` 均保持在 DOM 中）。
   - 在 `AccountPanel.jsx` 的空态区域（`groups.length === 0`）增加 `dsh-ui-kit` `Button`（文案引用 `acct.add`「新增账号」），当父组件传入 `onManageAccounts` 回调时，点击直接从 `Composer` 返回并切入 `stageView = 'accounts'` 视图。
   - 将 `AccountsSidebar.jsx` 中的原生 `<input type="search">` 升级为 `dsh-ui-kit` 的 `SearchField` 组件，彻底消除可见原生 HTML 输入控件。
2. **清理工具栏“假排期”筛选与“日历视图”切换入口**：
   - 从 `PublishControlBar.jsx` 的 `PublishControlTools` 中移除 `modeFilter` 下拉框；从 `PublishViewSwitcher` 中移除 `calendar` 视图切换按钮（仅保留 `grid` 与 `table`）。
   - 保留 `feed-helpers.js` / `usePublishFeed.js` 中底层 `filterRecord` 纯函数的 `modeFilter` 参数兼容，确保纯函数历史契约不被破坏。
3. **增补《网关 TikTok Direct 联调对账单》**：
   - 更新 `plugins/omnimux-publish/docs/hub-tool-contracts.md`，明确列出网关 `/api/social/v1/*` 四个端点（含 `media/presign` 自有存储切换兼容性）的入参、响应信封与状态映射对账表。

## 假设

- `AccountsSidebar.jsx` 与 `AuthorizeModal.jsx` 现有的 `/omnimux/accounts?provider=tiktok_direct&platform=tiktok` 读写与轮询逻辑完好可用，只需在 `PublishStage.jsx` 恢复视图挂载并在 `Composer` 空态提供跳转回调即可打通绑号到发帖的 UI 路径。
- 保持 `.omx-stage-sticky` 元素在 `PublishStage.jsx` 中始终渲染（承载顶层视图切换或发布控制栏），即可同时满足 `scripts/verify-stage-scroll-contract.mjs` 对 `.omx-stage-scroll` 与 `.omx-stage-sticky` 的静态与运行契约要求。
- 移除 `PublishControlBar.jsx` 中的 `modeFilter` 下拉框与 `calendar` 按钮不会影响草稿创建、账号分配、一键提交、状态刷新与失败重试等核心发布账本功能。

## 证伪方式

- 在隔离 worktree 启动挂载本地模拟网关的真实 Web 界面，用 `ego-browser` 打开【发布】工作台 Tab：若找不到「账号」切换入口、点击后未能渲染 TikTok 账号侧栏与「新增账号」VPN 提示弹窗，或从 `Composer` 空态点击「新增账号」未能切到账号视图，则假设 1 被证伪。
- 运行 `node scripts/verify-stage-scroll-contract.mjs` 与 `pnpm verify:stages`：若因切换 `stageView` 导致 `.omx-stage-sticky` / `.omx-stage-scroll` 契约报错，则假设 2 被证伪。
- 运行 `pnpm --filter omnimux-publish test`、`pnpm --filter omnimux-publish run typecheck:contracts` 及端到端测试 `plugins/omnimux-publish/tests/e2e/publish-tiktok-flow.e2e.test.mjs`：若工具栏仍渲染 `modeFilter` / `calendar` 按钮，或任一发布流程断言失败，则假设 3 被证伪。

## 新用户基线

- 全新安装但尚未登录 OmniMux 的用户打开【发布】工作台 Tab：
  - 草稿箱本地创建、编辑、删除无需登录即可正常使用；
  - 切换到「账号」视图或打开新建发布页左侧渠道面板时，当 `/omnimux/accounts` 返回 401/`needs-omnimux`，界面明确提示「需要登录 OmniMux 后同步账号列表（可在 设置 → 个人资料 中完成登录）」，不会静默显示为空账号列表或崩溃；
  - 不依赖任何开发机私有环境变量、本地代理或第三方 Zernio 账号配置。

## 文档影响

更新本插件自有契约说明 `plugins/omnimux-publish/docs/hub-tool-contracts.md`，增补网关 TikTok Direct 4 个接口的联调对账单；不涉及根 `docs/contracts/` 契约变更。
