# 规格：本地资产封面按类型使用不同比例

## 目标

本地资产库现在把所有非公共卡片都裁成 3:4。场景和背景被切掉左右，道具被切掉上下。

用户打开资产库看自己的本地资产。成功是：

- 角色仍是 3:4，图片从顶部对齐，保住头部。
- 场景和背景是 16:9。
- 道具、风格、知识、其他类型和没有类型的卡片是 4:3。道具完整显示，不裁切。
- 列数、最小列宽 260px、分屏列数上限和「素材缺失」文案保持主线现状。

卡片组件没有 3:4 档。角色比例只由本地样式决定，不把不受支持的 `3:4` 传给卡片组件。

## 命令

在 `.worktrees/assets-cover-ratio` 执行：

```
node --test plugins/omnimux-assets/src/client/assets-vertical-cards.e2e.test.js plugins/omnimux-assets/src/client/AssetGrid.test.js
```

## 结构

- 规格：`specs/assets-cover-ratio.spec.md`
- 比例：`plugins/omnimux-assets/src/client/AssetGrid.jsx`
- 样式：`plugins/omnimux-assets/src/client/styles.js`
- 验收：`plugins/omnimux-assets/src/client/assets-vertical-cards.e2e.test.js`

## 风格

类型先限制为字母、数字、下划线和连字符，再拼进 class。比例映射只覆盖本规格列出的类型：

```js
const ASSET_ASPECT_RATIO_MAP = {
  scene: '16:9',
  background: '16:9',
  prop: '4:3',
  style: '4:3',
  knowledge: '4:3',
  custom: '4:3',
}
```

角色不进入这张表，继续走 3:4 样式。

## 测试

现有竖版用例改为带 `omnimux-assets-card--character` 的角色卡，仍断言 3:4。另测场景 16:9、道具 4:3 且 `object-fit: contain`。

## 边界

- 总是：只改本地非公共卡片的封面比例。
- 先问：改 `gridColumnsFor`、最小列宽、分屏列数或文案。
- 绝不：搬入 `agent/assets-grid-adaptive-splitview` 的整份提交；把 `3:4` 作为 `MediaCard` 的 `aspectRatio`。

## 成功标准

- 上述测试通过。
- diff 不含 `grid-columns.js`、`use-grid-columns.js`、`locales.js`。
- 场景封面计算比例为 16:9，道具为 4:3，角色仍为 3:4。
