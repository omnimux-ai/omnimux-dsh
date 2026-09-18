# 资产中心搜索框输入锁定修复与公共素材检索联动规格（Issue #2268）

- 任务单：Issue #2268（修复资产中心公共搜索框无法输入及搜索联动脱节缺陷）
- 分支：`agent/assets-search-input-issue-2268`
- 关联模块：`plugins/omnimux-assets/src/client/AssetsStage.jsx`、`plugins/omnimux-assets/src/client/CloudAssetsView.jsx`

## 1. 目标（Objective）

**问题**：
1. 用户在资产中心（尤其是「公共」分类页签）点击顶部工具栏的「搜索资产」框输入时，无法键入任何字符（敲击按键即被瞬间刷白清空）。
2. 在「公共」分类页签下，顶部搜索框的状态未接入 `CloudAssetsView`，导致公共素材无法响应搜索关键词。

**根因**：
1. `AssetsStage.jsx` 中的 `AssetsFilterBar` 组件在调用 `dsh-ui-kit` 的 `<SearchField />` 时，传递的属性为 `onChange={feed.setQuery}`。然而 `<SearchField />` 组件在受控模式下解构并监听的是 `onValueChange`。由于 `onChange` 未被识别为值变更回调，外部的 `query` 状态从未更新，而组件在受控模式下每次按键重新渲染时，受控值 `value`（初始为空字符串 `""`）强制将 `<input>` 元素重置为空，导致输入框无法输入。
2. `AssetsStage` 顶层维护的 `feed` 为本地资产的 feed（`useAssetsFeed`），而在 `sourceTab === 'cloud'` 时，底下的 `<CloudAssetsView />` 使用独立的 `useCloudAssetsFeed`。顶栏的搜索状态没有向 `CloudAssetsView` 透传，使得公共素材流脱离了全局搜索。

**修复方案**：
1. 将 `AssetsStage.jsx` 中 `SearchField` 的属性由 `onChange` 修正为 `onValueChange={handleSearchChange}`。
2. 建立统一的搜索状态管理或分发：
   - 保证无论当前在一级 Tab 的哪个标签（本地、公共、产品库、生成的），顶栏搜索框均能正常输入、清除；
   - 当处于 `cloud` 标签时，将当前的搜索关键词传递给 `CloudAssetsView`（或由顶层协调 `setQuery`），驱动公共素材检索逻辑 `cloudSearch` 生效。
3. 补充自动化测试（单元测试与 DOM 探针测试），验证打字、值更新与清除逻辑。

## 2. 验收标准（可测）

| ID | 场景 | 期望 |
|---|---|---|
| AC-1 | 资产中心各分类下点击搜索框键入文字 | 搜索框能够正常输入字符，不会被重置为空，光标与文本正常保持 |
| AC-2 | 搜索框清除操作 | 点击搜索框右侧清除按钮或调用清除方法时，搜索框内容清空 |
| AC-3 | 公共分类下搜索联动 | 在「公共」标签下输入关键词，下方的公共素材卡片能够响应搜索词进行检索过滤 |
| AC-4 | 自动化测试与门禁验证 | `pnpm --filter omnimux-assets test` 全绿，DOM 探针与 UI 规范检查 100% 通过 |

## 3. 新用户基线与错误处理

- 新用户首次打开资产库时，搜索框默认占位符根据当前选中的 Tab 正确展示（公共/本地展示「搜索资产」，产品库展示「搜索产品名称、卖点、品牌」等）；
- 搜索无结果时，展示对应的空状态占位提示，无白屏或崩溃。

## 4. 边界（Boundaries）

- **总是**：遵循 `dsh-ui-kit` 的标准属性契约（`onValueChange`）；
- **绝不**：破坏本地资产库、产品库、生成历史既有的搜索与筛选逻辑。
