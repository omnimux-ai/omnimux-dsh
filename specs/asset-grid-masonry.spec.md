# 规格：资产中心卡片网格 · 封面原始比例瀑布流

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/2150
- 父任务：https://github.com/omnimux-ai/omnimux-dsh/issues/2147
- 前置：https://github.com/omnimux-ai/omnimux-dsh/issues/2149（列数收敛，已合并 `26943359f`）
- 状态：已确认（用户已确认预览演示 `docs/prototypes/asset-grid-masonry.html`）
- 工作树：`.worktrees/b-2150`（分支 `agent/b-2150-issue-2150`）

## 1. 目标

封面不再被塞进同一个 164px 高的框里裁切，也不留黑边：**按原始比例完整展示**，卡片高度随比例变化，网格因此变成瀑布流。

现状取证：

```
.omnimux-assets-cloud-card--media .omnimux-assets-cloud-thumb { height: 164px; }
.omnimux-assets-card-media { object-fit: cover; }
```

实测采样 288 张线上封面，宽高比从 **0.51 到 0.93**（角色立绘 1152×2048 / 1520×2688 为主，场景 736×898 / 675×1200 / 1080×1920 混排）。固定高度 + `cover` 会把竖版立绘裁掉上下两端；改成 `contain` 又会在同一高度的框里留出空白带。两种做法都不是"按比例显示"。

## 2. 用户操作旅程

1. 打开资产中心 → 公共货架。
2. 卡片按封面原始比例排布：竖版立绘是高的，场景图是矮的，同一行里高度不齐但每张都完整。
3. 向下滚动触发追加加载：新卡片接在当前最短的那一列下面，**已经看过的卡片位置不动**。
4. 鼠标悬停在卡片上：原有的播放/预览行为不变（悬停播放、点击放大）。

## 3. 期望界面反馈

- 任一卡片封面的渲染宽高比与图片自然宽高比一致（误差 ≤ 1%），**无裁切、无空白带**。
- 卡片宽度仍由 #2149 的列数规则决定（最多 5 列）。
- 列与列的总高度接近（差 ≤ 一屏高度的 20%），不出现某一列明显空半截。
- 追加一批后，先前卡片不发生位移。
- 卡片圆角、内边距、标题行、悬浮操作沿用现有规范值。

## 4. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | 卡片渲染宽高比与图片自然宽高比误差 ≤ 1%，无裁切、无空白带 | 组件级真实浏览器实测（真实源码 + 真实样式 + 真实 Chrome），对每张卡读 `getBoundingClientRect` 与 `naturalWidth/naturalHeight` 对比 |
| AC-2 | 卡片容器内不存在因比例不匹配产生的空白带（`object-fit: contain` 类留白为 0） | 同上：`<img>` 的 `objectFit` 不为 `contain`/`cover`，或渲染比例与自然比例一致 |
| AC-3 | 列数等于 #2149 的列数上限（最多 5） | 复用 `gridColumnsFor`，断言列容器数量 |
| AC-4 | 一整页（约 24 张）后，各列总高度差相对最高列 ≤ 20% | 纯函数单测 + 浏览器实测列高 |
| AC-5 | 追加一批后，先前已渲染卡片的位置不位移 | 纯函数单测（追加前后同一 id 的列索引不变）+ 浏览器实测 `getBoundingClientRect().top` |
| AC-6 | 分列纯函数单测覆盖：空集合、单列、比例极值（0.5 / 3.0）、追加场景、未知比例回落 | `plugins/omnimux-assets/src/client/masonry.test.js` |
| AC-7 | 工作树内真实浏览器验证证据落盘 `docs/evidence/` | 组件级真实渲染脚本 + PNG |
| AC-8 | 应用本体仍能起：`pnpm verify:app` 通过 | 工作树内真实应用验收 |

## 5. 设计

### 5.1 纯函数（`src/client/masonry.js`）

```js
export const MASONRY_DEFAULT_RATIO = 9 / 16   // 目录里没有宽高字段时的兜底

/** 封面比例：已知的实测/缓存值优先，否则按媒体类型推断，最后回落默认。 */
export function coverRatioOf(asset, known)

/** 最短列优先分列。返回 columns 个数组，元素为 { asset, ratio }。 */
export function distributeColumns(items, columns, ratioOf)

/** 估算列高（列宽归一化为 1，含卡身固定高），用于均衡性断言。 */
export function columnHeights(buckets, ratioOf)
```

分列规则：每次把当前累计高度**最小**的那一列作为目标（相等时取最左），因此同一批输入的分列结果确定，且**追加只影响尾部**——先前元素的列索引不会变化。

### 5.2 卡片按原始比例渲染

- 封面 `<img>` 去掉固定高度约束，改为 `width: 100%; height: auto; display: block`，并带上 `width` / `height` **HTML 属性**（不是内联样式）——浏览器据此在图片到达前就预留正确高度，避免布局跳动。
- 比例未知时先用 `MASONRY_DEFAULT_RATIO` 占位；图片 `onLoad` 后读 `naturalWidth/naturalHeight` 修正属性值（持久化由 #2152 承担）。
- 样式表里删掉 `.omnimux-assets-cloud-card--media .omnimux-assets-cloud-thumb { height: 164px }` 与 `object-fit: cover`；`.omnimux-assets-card-media` 的固定高宽约束同样放开。

### 5.3 瀑布流容器

- 网格容器从 `display: grid` 换成 `display: flex` 的列布局：`.omnimux-assets-masonry`（行）+ `.omnimux-assets-masonry-col`（列，纵向 flex）。
- 列数仍走 `data-columns` 属性（沿用 #2149 的契约），样式表按属性给出列容器宽度。
- 骨架屏同步改为列结构，否则数据到达时列数会跳。

### 5.4 接线点

| 文件 | 改动 |
| --- | --- |
| `CloudAssetsView.jsx` | 网格改瀑布流；卡片封面按比例渲染 |
| `AssetGrid.jsx` / `AssetBrowse.jsx` | 沿用同一分列（本地货架同样是卡片墙） |

## 6. 边界

- **总是**：改动后跑 `pnpm --filter omnimux-assets test`；在工作树内做组件级真实浏览器验证并留证。
- **先问**：任何超出「比例 + 分列」的版式改动。
- **绝不做**：在主检出改业务源码；引入布局依赖；用内联样式绕过 UI02。

## 7. 非目标

- 不改每批条数与请求时机（#2151）。
- 不做比例的跨会话持久化与请求合并（#2152）。
- 不改目录构建脚本与分发的 JSON 结构。

## 8. 假设

1. 封面图来自 CDN 原图，`naturalWidth/naturalHeight` 可信；CDN 不支持缩放参数（已实测）。
2. `ResizeObserver` 可用（#2149 已依赖）。
3. 列宽由容器宽度除以列数得到，与 #2149 的 `GRID_GAP = 12` 一致。
