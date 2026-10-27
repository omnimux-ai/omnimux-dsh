# 规格文档：产品库并入资产库，下架独立产品页

**文件：** `specs/products-into-assets.spec.md` ｜ **优先级：** P0 ｜ **模块：** `plugins/omnimux-products` + `plugins/omnimux-assets` + `plugins/omnimux`
**变更面：** Client / 工作台 Tab 装配 / 页面导航 / 门禁脚本 / 契约文档
**设计依据：** [design.md](../design.md)、[first-level-page-layout.md](../docs/contracts/first-level-page-layout.md)、[stage-guards.md](../docs/contracts/stage-guards.md)、[workbench-split.md](../docs/contracts/workbench-split.md)

---

## 1. 业务目标与缺陷根因

### 1.1 用户看到的现象
在「资产库 → 产品库」里点任意产品卡片，会切到另一个工作台页面去显示详情；在那个详情里点「返回」，落回的是**旧产品页面的列表**，不是刚才点卡片的资产库列表。用户感知为「有两个产品库，返回还会跳回旧的那个」。

### 1.2 根因（已在源码确认，非缓存残留）
1. **跨 Tab 跳转**：`plugins/omnimux-assets/src/client/AssetsStage.jsx` 的 `handleOpenCreateProduct` 写全局意图 `window.__omnimuxProductsIntent` 并派发 `omnimux-products:open`，随后 `api.open({ tabId: 'omnimux-products:library' })` —— 详情根本不在资产库里渲染。
2. **意图只有旧页面能接住**：只有 `plugins/omnimux-products/src/client/ProductsStage.jsx` 监听该事件。
3. **返回语义错位**：旧页面的 `onLeave` 是 `setView(LIST_VIEW)`，即回旧页列表。
4. **旧页面仍然完整在线**：`omnimux-products` 仍注册 `omnimux-products:library` Tab、仍在侧栏「更多」菜单里、`localStorage` 仍可能持久化该 Tab id（刷新后会渲染「插件未加载」占位）。
5. **重复实现**：资产库另抄了一份产品卡片（`ProductsView.jsx`）与 17 条同名产品 CSS，与产品插件同名不同值。

### 1.3 核心方案
- 详情二级页改为**在资产库产品库 Tab 内就地展开**，不切换工作台 Tab；返回落回资产库产品库列表并保持筛选、搜索、滚动。
- **下架旧页面**：删除 `omnimux-products` 客户端插件本体（Tab 注册、Stage、侧栏入口），插件降级为「宿主能力 + 浏览器安全 UI 源库」。
- **单一真源**：资产库直接复用产品插件的 `ProductGrid` / `ProductFormPage` / `CreateProductMenu`，删除 `ProductsView.jsx` 与重复 CSS。
- **中枢摘链**：`WORKBENCH_OCCUPANTS`、`TAB_LABELS`、标题兜底、`surface-follow`、侧栏「更多」菜单、产品选择器「前往产品库」全部改指资产库。
- **旧 Tab 迁移**：资产库挂载时收编残留的 `omnimux-products:library` Tab，避免刷新后出现「插件未加载」。

---

## 2. 关键用户旅程与验收标准

### 2.1 就地进入详情（P0）
- **AC-101**：在资产库「产品库」Tab 点击产品卡片，**不发生工作台 Tab 切换**（当前 Tab 始终是 `omnimux-assets:library`），就地渲染全屏二级页。
- **AC-102**：点「添加产品」并选择实物/数字，同样就地进入对应形态的创建二级页。
- **AC-103**：二级页保留面包屑（`产品库 / 编辑 · {产品名}`）、常驻返回按钮、右上角取消/保存。
- **AC-104**：脏表单在返回/取消/Esc 时仍弹三选一（继续编辑 / 放弃修改 / 保存并返回）；干净时直接返回。

### 2.2 返回落点（P0）
- **AC-201**：从二级页返回后仍在「资产库 → 产品库」，筛选胶囊、搜索词、列表滚动位置保持。
- **AC-202**：保存成功或「保存并返回」后回到同一列表，并刷新出新数据。

### 2.3 旧页面下架（P0）
- **AC-301**：`omnimux-products` 不再注册任何工作台 Tab，也不再声明 `sidebar.extra` / `shell.overlay` slot。
- **AC-302**：侧栏「更多」菜单不再出现「产品库」，菜单由 10 项变 9 项，分隔线归属随之正确。
- **AC-303**：`WORKBENCH_OCCUPANTS` 移除 `omnimux-products:library`；`products_*` 工具自动跟随改指向资产库并携带产品库 Tab 过滤。
- **AC-304**：产品选择器「前往产品库管理」不再指向已失效的 `omnimux-products:stage`。
- **AC-305**：已持久化旧 Tab 的用户刷新后不会看到「插件未加载」占位页，而是落在资产库产品库。

### 2.4 单一真源与规范（P0）
- **AC-401**：资产库不再有 `ProductsView.jsx`，也不再有与产品插件重名的产品 CSS。
- **AC-402**：产品库 Tab 的视觉与二级页外观由产品插件样式表提供，不出现两份同名不同值。
- **AC-403**：全部文案走 locale（资产库命名空间 + 产品库命名空间），无硬编码中文。
- **AC-404**：静态门禁零违规（`verify:stages`、`verify:stage-scroll`、`verify:slots`、`test:ui`、`check:boundaries`、`check:package-files`、`registry:verify`）。

### 2.5 宿主能力不变（P0）
- **AC-501**：`products_*` 工具、`/omnimux/products*` 路由、`$DSH_HOME/omnimux/products/` 存储、品牌战略归一化与链接解析行为完全不变。
- **AC-502**：产品 CRUD、媒体预览、草稿媒体只读预览、批量移除均照旧可用。

---

## 3. 任务分解与执行路径
- **T01**：规格落盘（本文件）。
- **T02**：`omnimux-products` 增加浏览器安全 UI 聚合入口，删除客户端插件本体，调整 `package.json` / `dsh.manifest.json`。
- **T03**：`omnimux-assets` 新增 `ProductTab`（列表 + 二级页状态机 + 动作行联动），删除 `ProductsView` 与重复 CSS，注册产品库词典。
- **T04**：`omnimux` 中枢摘掉旧 Tab（occupants / 菜单 / 标题 / 工具跟随 / 产品选择器）。
- **T05**：门禁脚本与契约文档同步；测试逐条改到新结构并补就地展开回归用例。
- **T06**：门禁 + 插件测试 + 隔离 worktree 真实浏览器验收，独立评审后提交 PR。

---

## 假设

- 产品库的宿主能力（`products_*` 工具、HTTP 路由、`$DSH_HOME/omnimux/products/` 存储、导入解析、品牌战略）与本次 UI 收敛无关，保持零改动；因此不需要重新审计或调整任何模型/计费路径。
- 「素材工作台」（`omnimux:asset-hub`）里另有一个商品库 Tab，属于另一个独立面，本次不动它；用户已确认只收敛资产库这一个产品库。
- 资产库可以像现有的 `CreateProductMenu` 转接层一样，在构建期复用产品插件的浏览器安全源码，因此不需要把 `omnimux-products` 变成资产库的运行时依赖，也不需要改动 `pnpm-lock.yaml`。
- 资产库在挂载时能读到工作台快照并关闭残留 Tab，因此旧 Tab 迁移不需要在产品插件里保留一个只为迁移而存在的客户端插件。

## 证伪方式

- 若合并后点击卡片仍触发工作台 Tab 切换（`activeTabId` 变为非 `omnimux-assets:library`），则「就地展开」不成立，本方案前提失效，退回「只改返回目标」的降级方案。
- 若从二级页返回后筛选胶囊、搜索词或滚动位置丢失，说明列表未保活；需检查 `ProductTab` 是否与旧页一样常驻挂载、二级页是否为覆盖层而非替换渲染。
- 若刷新后出现「插件未加载」占位页，说明残留 Tab 未被收编；需在资产库挂载期补上按 tab type 精确关闭的逻辑。
- 若 `check:boundaries` 或 `verify:plugin-load` 因新增依赖报错，说明 UI 聚合入口不满足浏览器纯净性或包声明要求，需拆分导出面或调整 `files` / `exports`。
- 若 `pnpm --filter omnimux-products test` 在删除客户端插件后仍有测试引用被删文件，说明测试未随结构同步，需逐条改到新宿主。

---

## 旧标准变更

- `plugins/omnimux-assets/src/client/ProductsIntegration.test.js` :: `declares 3 first-level tabs including product in AssetsFilterBar`
- `plugins/omnimux-assets/src/client/ProductsIntegration.test.js` :: `mounts ProductsView under AssetsBody when sourceTab is product`
- `plugins/omnimux-assets/src/client/ProductsIntegration.test.js` :: `ProductsView cards omit copyCite actions row and keep only title and sub description`
- `plugins/omnimux-assets/src/client/ProductsIntegration.test.js` :: `ProductsView conforms to design tokens and provides category pills and empty card`
- `plugins/omnimux-assets/tests/e2e/product-cover-preview.spec.js` :: `资产中心产品库商品微卡封面图预览路径规范与图片渲染契约 (Issue #2338)`
- `plugins/omnimux-products/src/client-form-subscreen.test.js` :: `closing the tab never clears what the user typed`
- `plugins/omnimux-products/src/client-form-subscreen.test.js` :: `mirrors the dirty flag upward and never reads it back`
- `plugins/omnimux-products/src/client-form-subscreen.test.js` :: `the list view stays mounted underneath so scroll and filters survive`
- `plugins/omnimux-products/src/client-form-subscreen.test.js` :: `routes every product card by its persisted kind`
- `plugins/omnimux-products/src/client-form-subscreen.test.js` :: `uses the hover split menu for both create entry points and never a character glyph`
- `plugins/omnimux-products/src/client/all-plugins-stage-spacing.test.js` :: `omnimux-products extracts ActionRow to Layer 2 and defines 8px 20px 12px padding`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `stage loads actual state response, opens complete media details and saves without losing references`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `the list view stays mounted behind the sub-screen so filters survive the round trip`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `failed detail request is visible and never opens an empty-media editor`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `empty response clears cards and exposes the grid create action`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `opening a physical product card routes to the physical form`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `opening a digital product card routes to the digital form`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `editing preserves a missing source reference and refuses a name-only save until the file is restored`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `a slow A detail response cannot replace the faster B editor`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `closing an editor invalidates an older pending detail request`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `creating a product invalidates pending edit responses`
- `plugins/omnimux-products/src/client/stage-data.test.js` :: `ProductsStage displays searched-empty state and hides empty action button when query has no match`
- `plugins/omnimux-products/src/client/workbench-seat.test.js` :: `client apply integrates into workbench and registers tab without redundant sidebar entry`
- `plugins/omnimux-products/src/client/workbench-seat.test.js` :: `products workbench seat (sidebar must not claim overlay)`
- `plugins/omnimux-products/src/client/workbench-seat.test.js` :: `sidebar entry uses the workbench store, not the product stage`
- `plugins/omnimux-products/src/client/workbench-seat.test.js` :: `stage ActionRow contains secondary "add in chat" button that reveals middle conversation column`
- `plugins/omnimux-products/src/client/workbench-seat.test.js` :: `stage component has no in-tab FocusBar and does not claim overlay`
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `10 行文案与顺序逐字等于真源清单`
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `与内置 id 冲突的注册项不出现（内置文案不被冒充）`
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `分组分隔线：上一项 dividerAfter 决定下一行 separatorBefore`
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `注销后注册项从菜单消失，回到 10 行`
- `plugins/omnimux/src/client/explore-more-menu.test.js` :: `运行时注册项出现在菜单末尾`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `移除回归：侧栏不再渲染探索行，源码不再残留浮动菜单实现`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `运行时注册接缝：action 优先于 tabId，非法形状与 id 冲突不产生脏项`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `运行时注册接缝：未注册与内置 10 项完全一致，注册后追加末尾、注销即消失`
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `非核心插件（video, products, device, clip, social-harvest, apps 等）收敛，不渲染独立行`
- `plugins/omnimux/src/client/ui-convergence-contract.test.js` :: `AC-5: 删除确认弹窗必须明确提示关联资产名称`
- `plugins/omnimux/src/client/workbench.test.js` :: `default focus matrix: canvas and all libraries default to gui (Issue #2006)`
- `plugins/omnimux/src/client/workbench.test.js` :: `resolveWorkbenchTabTitle prefers opts, then getTab, then human fallback (#345)`
- `plugins/omnimux/src/workbench/surface-follow.test.js` :: `把各工作面工具解析到对应页签`
- `plugins/omnimux/src/workbench/surface-follow.test.js` :: `识别用户接管：当前页签既不是上次自动目标、也不是本次目标`
- `scripts/live-qa.test.mjs` :: `stage selection and actual runtime discovery reject empty or unknown targets`
- `scripts/studio-live-qa.test.mjs` :: `Studio is explicit-only and preserves the eight existing Stage targets`
- `tests/e2e/fix-create-product-action.e2e.test.mjs` :: `E2E: 修复资产库「添加产品」点击无响应与二级表单唤起链路验证`
- `tests/e2e/integrate-products-tab.e2e.test.mjs` :: `E2E: 资产库一级 Tab 整合产品库及操作按钮动态联动验证`
- `tests/e2e/product-selection-delete.e2e.test.mjs` :: `E2E: 验证产品库支持批量选择与删除（对齐本地 Tab 规范）`
- `tests/e2e/remove-product-copy-cite.e2e.test.mjs` :: `E2E: 验证产品库卡片彻底移除「复制引用」整行操作栏并仅保留标题与描述`
- `tests/e2e/remove-unnecessary-page-header-actions.e2e.test.mjs` :: `E2E: 全局所有一级插件页面右上角彻底移除非必要的刷新与关闭按钮`
- `tests/e2e/ui-duplication-convergence.e2e.test.mjs` :: `E2E-3: 新建产品分流菜单单一真源收敛与资产库副本清除`
- `tests/e2e/ui-duplication-convergence.e2e.test.mjs` :: `E2E-4: 删除二次确认弹窗原生 ConfirmModal 替代与薄包装清除`
- `plugins/omnimux-studio/tests/independent-qa-round2.test.mjs` :: `QA2 existing eight production Stage contracts retain strict sidebar validation`

产品库并入资产库后，下列既有用例的断言对象（`ProductsStage` / `ProductsView` / 独立产品 Tab / 10 项菜单 / 8 个 Stage 目标）已不存在，因此必须改写。每条给出：原断言 → 必须改的理由 → 新期望证据。

