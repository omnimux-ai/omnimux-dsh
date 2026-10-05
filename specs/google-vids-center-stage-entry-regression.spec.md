# Google Vids 中栏入口生命周期回归规格

- **Issue**: #2721
- **关联基线**: #2698 的 PRD、原型及 `specs/google-vids-split-stage.spec.md`；座位与 claim 相关表述由 Issue #3165 取代（Vids 迁至官方 `main` 插槽，commit `fd127b520` / #2767）
- **状态**: PM 增补已审；UI 文案白名单沿用 split-stage Spec 第 3 节，本次可见文案变化为零。座位/claim 段落已按 #3165 更正，原 #2721 claim 序列作为历史基线保留并标注为已被取代
- **设计约束**: 遵循仓库根 `design.md`；不改视觉布局、图标或界面文案

## 1. 目标与用户旅程
用户从左侧 Google Vids 入口开始创作。Vids 生成页由 `omnimux-video` 注册为官方 `main` 插槽面板（`key: 'omnimux-vids'`，manifest `target: main`），渲染在中间会话列内；Clip 工作台 `omnimux-clip:studio` 必须显示在右侧 `betterSidebar`。用户点击入口后，客户端先请求 Clip 以 split 焦点打开，等待 Host 确认成功，再以 `layout.selectPanel('omnimux-vids')` 选中 Vids 面板。Vids **MUST NOT** claim 任何产品舞台：产品舞台 chrome 会隐藏会话列内非 `shell.overlay` 的子节点，而 `main` 面板正渲染于其中（claim 会隐藏刚被选中的面板，表现为空白）。

成功状态：`layout.panelInfo.activePanelId === 'omnimux-vids'`、中间会话列显示 Google Vids、右栏 Clip 可见，Workbench 焦点为 `split`。关闭 Vids 后中心会话恢复（`layout.selectPanel(null)`），Clip 保持打开。

## 2. 假设与边界
- 现有 Host `openWorkbench` API 接受 `focus: 'split'`，成功返回严格布尔 `true`；失败返回 `false` 或抛错/拒绝。
- Clip Tab 由 `omnimux-clip` 唯一注册于 `betterSidebar`；Vids 只注册官方 `main` 插槽面板（`key: 'omnimux-vids'`），不得另注册右栏 Tab，也不得 claim 产品舞台。
- 不新增 Host slot、右栏 fallback、可见元素或文案；不改变 Clip 的通用焦点默认值。
- 当 Workbench、`layout.selectPanel` API 缺失或 Clip 未能打开时，本次操作不得切换 Vids 面板、不得 claim 产品舞台，也不得单独改焦点；保持当前状态。

## 3. 可见界面与文案白名单
界面、文案、元素均 100% 沿用 `specs/google-vids-split-stage.spec.md` 第 3 节及批准原型。本回归无新增/删除/改写可见 UI、文案或图标。中栏仍为 Google Vids，右栏仍为 Clip；左侧入口保持 `Google Vids` 与既有内测微标。

## 4. 行为契约
1. 入口 click 调用 `workbench.open({ tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' })`。
2. 在 Promise settle 前不得切换 Vids 面板（`layout.selectPanel`），也不得另调 `setFocus`。
3. 仅当 open 严格返回 `true` 时，随后调用 `layout.selectPanel('omnimux-vids')`。
4. `false`、同步异常、Promise rejection、API 缺失均不切换面板、不作独立焦点写入。
5. 异步完成后若入口/插件已卸载，必须避免对已失效界面执行 `layout.selectPanel`（如本次实现增加生命周期保护，应有专测）。
6. Vids 的 manifest slot 唯一指向官方 `main` 插槽；Vids 客户端不得注册 `betterSidebar` Tab；Clip 仍由 Clip 插件注册右栏 Tab。
7. Vids 的任何路径都 MUST NOT 调用 `claimProductStage` / `__omnimuxStage.claim` / `stage.claim(`。**（#2721 历史基线：旧实现为「Clip open 严格成功 → `stage.claim('omnimux-vids')`」，该 claim 序列已被 Issue #3165 取代。）**

## 5. 验收用例
- 异步延迟成功：打开 Promise pending 时只观察到 open；resolve `true` 后观察到先 open、后 `selectPanel('omnimux-vids')`，参数包含 `focus: 'split'`；全程无 claim。
- 失败分支：对 `false`、同步 throw、异步 reject 分别验证只有 open 调用，没有 selectPanel/claim 或 `setFocus`。
- 新用户/缺依赖：全新安装按正式插件安装机制加载 Vids 与 Clip；缺活动会话/右栏服务时不创建 dev-only fallback、不 claim 假舞台，并沿用 Host 当前不可用反馈。
- 注册拓扑：验证 Vids 官方 `main` 插槽注册（`key: 'omnimux-vids'`）与 manifest `target: main` 声明，验证不存在 Vids `betterSidebar.registerTab` 与任何产品舞台 claim，Clip 仍保有 `omnimux-clip:studio` 注册。
- Host 焦点：覆盖本次 `focus:'split'` 的打开路径；不得改变其他 Workbench Tab 默认焦点行为。
- 双栏运行：隔离 worktree 浏览器从左侧入口真实触发，DOM/运行态同时证明中间会话列的 Vids 面板（`activePanelId === 'omnimux-vids'`）、右侧 Clip tab、split 焦点；截图保存。关闭 Vids 后会话恢复、Clip 仍在右栏。

## 6. 命令与测试策略
- 回归单测：`node --test plugins/omnimux-video/src/client/sidebar-entry.test.js plugins/omnimux-video/src/client/workbench-seat.test.js`
- Split E2E 静态/功能契约：`node --test tests/e2e/google-vids-split-stage.e2e.test.mjs`
- 相关宿主验证：`node --test plugins/omnimux/src/client/workbench.test.js plugins/omnimux/src/client/stage-mutual-exclusion.test.js`
- 构建：`pnpm --filter omnimux-video build`
- UI 静态门禁：`node scripts/scan-ui-gates.mjs`
- 交付验收：按 `docs/contracts/plugin-qa.md` 在隔离 worktree 完成真实浏览器验证并留存报告与截图；不把历史 #2698 截图/报告当成本回归运行证据。

## 7. 实施计划
1. 先补齐入口异步时序与失败分支测试并证实失败。
2. 在 `sidebar-entry.js` 将 click handler 改为等待 Clip 打开成功，再 `layout.selectPanel('omnimux-vids')`；移除对 `setFocus` 的无条件补调。
3. 清理 `omnimux-video/src/client/index.js` 中 Vids 的 `betterSidebar` 注册及专属依赖，同时保留 `main` 插槽注册与 Clip 插件既有实现。
4. 更新本规格和冲突的旧入口 Spec/Workbench split 合同，准确记录 Vids 的 `main` 插槽面板座位（#3165 取代原 overlay 舞台例外）；检查不影响普通 Workbench occupant。
5. 跑回归测试、相关宿主测试、构建、独立审查及隔离浏览器验收；满足门禁后走 Issue #2721 PR/Merge Queue/Dev 物化。

## 8. 风险与约束
- 风险为 Host `open` 时释放先前产品舞台；当前规避方式是 Vids 不依赖任何产品舞台，固定以「Clip open 严格成功 → `layout.selectPanel('omnimux-vids')`」序列选中面板。**（#2721 历史基线：旧实现以「Clip open 成功 → Vids stage claim」规避，已被 Issue #3165 取代。）**
- 不得更改用户已有 UI 文案/白名单，不得通过造假 DOM 状态、强制 Stage API 调用或静态 grep 取代真实浏览器验收。
- 仅允许修改服务此回归的业务代码、测试与关联规格/合同；不触碰主工作区未提交文件。
