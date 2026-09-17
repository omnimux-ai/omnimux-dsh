# 规格：资产中心卡片网格列数收敛（每行最多 5 列）

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/2149
- 父任务：https://github.com/omnimux-ai/omnimux-dsh/issues/2147
- 状态：已确认（用户已确认预览演示 `docs/prototypes/asset-grid-masonry.html`）
- 工作树：`.worktrees/a-5-2149`（分支 `agent/a-5-2149-issue-2149`）

## 1. 目标

资产中心卡片网格的列数不再由窗口宽度无限膨胀，**封顶 5 列**，并把列数计算收敛到一个可单测的纯函数，供后续切片（瀑布流、分批加载）复用。

现状取证：`.omnimux-assets-cloud-grid` 的 `repeat(auto-fill, minmax(180px, 1fr))` 在 1560px 容器下实测铺出 **7 列**（ego-browser 实测 `gridTemplateColumns` = 7 段）。

## 2. 用户操作旅程

1. 用户打开资产中心 → 公共货架。
2. 网格按容器宽度铺列：宽屏 5 列、中屏 4 列、窄屏 3 列、更窄 2 列。
3. 用户拖动窗口变窄/变宽，列数在断点处平滑变化，**始终 ≤ 5**。
4. 切到「本地」货架，同一窗口下列数与公共货架一致。

## 3. 期望界面反馈

- 列数上限 5：1560px 容器实测 `gridTemplateColumns` 为 5 段。
- 每列宽度随容器自适应（`minmax(0, 1fr)`），列间距保持 12px。
- 卡片几何不变：12px 卡片圆角、卡身内边距 `10px 12px 12px`、标题 14px/20px。
- 列数变化时无横向滚动条、无卡片溢出。

## 4. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | 容器 1560px → 5 列；1280px → 4 列；1024px → 3 列；768px → 2 列 | 纯函数单测 + 浏览器实测 `gridTemplateColumns` 段数 |
| AC-2 | 任意宽度下列数 ∈ [2, 5] | 单测遍历边界（0、负值、NaN、超宽、极窄） |
| AC-3 | 列数函数有单元测试覆盖边界 | `plugins/omnimux-assets/src/client/grid-columns.test.js` |
| AC-4 | 本地货架与公共货架在同一窗口下列数相同 | 同一 hook + 同一 CSS 属性选择器；浏览器实测两处 `data-columns` 相等 |
| AC-5 | 工作树内真实浏览器验证证据（截图 + 结构化几何断言）落盘 `docs/evidence/` | ego-browser |

## 5. 设计

### 5.1 纯函数（`src/client/grid-columns.js`）

```js
export const GRID_MAX_COLUMNS = 5
export const GRID_MIN_COLUMNS = 2
export const GRID_MIN_COLUMN_WIDTH = 260
export const GRID_GAP = 12

export function gridColumnsFor(containerWidth) {
  const width = Number(containerWidth)
  if (!Number.isFinite(width) || width <= 0) return GRID_MIN_COLUMNS
  const fit = Math.floor((width + GRID_GAP) / (GRID_MIN_COLUMN_WIDTH + GRID_GAP))
  return Math.max(GRID_MIN_COLUMNS, Math.min(GRID_MAX_COLUMNS, fit))
}
```

`GRID_MIN_COLUMN_WIDTH = 260` 由 AC-1 的四个断点反解得到（见下方推导），因此卡片比现状（180px 最小列宽）明显更宽。

断点推导（`(width + 12) / 272` 向下取整，再封顶 5）：

| 容器宽度 | floor((w+12)/272) | 结果 |
| --- | --- | --- |
| 1560 | 5 | 5 |
| 1280 | 4 | 4 |
| 1024 | 3 | 3 |
| 768 | 2 | 2 |

### 5.2 列数落到 DOM 属性，而不是内联样式

`docs/contracts/ui-design-guidelines.md` 的 UI02 硬门禁禁止内联样式，因此列数通过 `data-columns` 属性表达，由样式表消费：

```css
.omnimux-assets-grid[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.omnimux-assets-grid[data-columns="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.omnimux-assets-grid[data-columns="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.omnimux-assets-grid[data-columns="5"] { grid-template-columns: repeat(5, minmax(0, 1fr)); }
```

### 5.3 共享 hook（`src/client/use-grid-columns.js`）

`ResizeObserver` 观测网格容器宽度 → `gridColumnsFor(width)` → 返回列数。非浏览器环境（单测、SSR）直接返回默认 5 列，不抛错。

### 5.4 接线点

| 文件 | 网格 |
| --- | --- |
| `CloudAssetsView.jsx` | `.omnimux-assets-grid.omnimux-assets-cloud-grid` |
| `AssetGrid.jsx` | `.omnimux-assets-grid`（网格视图） |
| `AssetBrowse.jsx` | 两处 `.omnimux-assets-grid` |

## 6. 边界

- **总是**：改动后跑 `pnpm --filter omnimux-assets test`；在工作树内做真实浏览器验证并留证。
- **先问**：任何超出「列数收敛」范围的版式改动（例如封面填充方式）留给后续切片。
- **绝不做**：在主检出改业务源码；引入新的布局依赖；用内联样式绕过 UI02。

## 7. 非目标

- 不改卡片内部版式与封面填充方式（#2150）。
- 不改分页条数与请求时机（#2151）。
- 不改缓存（#2152）。

## 8. 假设

1. 资产中心的内容区宽度等于网格容器宽度，`ResizeObserver` 可准确测得。
2. `ResizeObserver` 在 Electron 宿主与 ego-browser 均可用；不可用时退回默认 5 列，不阻塞渲染。
