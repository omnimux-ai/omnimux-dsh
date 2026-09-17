# 规格：资产中心卡片网格 · 按列数推导每批条数 + 只加载看得见的封面

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/2151
- 父任务：https://github.com/omnimux-ai/omnimux-dsh/issues/2147
- 前置：https://github.com/omnimux-ai/omnimux-dsh/issues/2150（瀑布流，已合并 `656fae8bf`）
- 状态：已确认（用户已确认预览演示）
- 工作树：`.worktrees/c-2151`（分支 `agent/c-2151-issue-2151`）

## 1. 目标

首屏更快：每批条数跟当前列数走，封面只在进入视口（含一屏缓冲）时才真正拉图。目录分片仍是 24 条一份，不改构建脚本。

现状：

- 每次请求固定 24 条。
- 一批到齐就把这批**全部**封面提前解码（`preloadMedia(covers)`），看不见的图也一起拉。

## 2. 用户操作旅程

1. 打开资产中心 → 公共货架：首屏很快出现骨架，随后只看见的封面陆续清晰。
2. 向下滚动：接近底部时再请求下一批；新封面只在进入视口附近才开始拉。
3. 已经看过的卡片位置不动（沿用瀑布流追加稳定性）。

## 3. 期望界面反馈

- 首屏请求条数 = 列数 × 3 行（5 列 → 15，4 列 → 12，3 列 → 9，2 列 → 6），下限 6、上限 24。
- 视口外的封面不发起图片请求（允许一屏高度的提前量）。
- 骨架张数与首屏条数一致，不再固定 12。
- 卡片圆角、间距、瀑布流比例沿用现有规范。

## 4. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | `pageSizeFor(columns)`：5→15、4→12、3→9、2→6；非法列数回落 6；结果夹在 [6, 24] | 纯函数单测 |
| AC-2 | 公共货架请求 `limit` 使用 `pageSizeFor(gridColumns)`，不再写死 24 | 源码契约 + 单测 |
| AC-3 | 封面 `<img>` 带 `loading="lazy"`；去掉「一批到齐就预取全部封面」 | 源码契约 |
| AC-4 | 骨架张数 = `pageSizeFor(gridColumns)` | 源码契约 |
| AC-5 | 组件级真实渲染：首屏只对视口内（含缓冲）卡片发出封面请求 | 真实浏览器 + 请求计数 |
| AC-6 | 工作树内 `pnpm verify:app` 通过 | 应用本体验收 |

## 5. 设计

### 5.1 纯函数

```js
export const PAGE_ROWS = 3
export const PAGE_SIZE_MIN = 6
export const PAGE_SIZE_MAX = 24   // 目录分片上限，不能超过
export function pageSizeFor(columns)
```

`columns * 3`，再夹到 [6, 24]。非法列数回落 6。

### 5.2 请求

`use-cloud-assets-feed.js` 的 `limit` 改为调用方传入的每批条数（默认仍 24，避免无列数时越界）。`CloudAssetsView` 把 `pageSizeFor(gridColumns)` 传进去。

过滤接口的 `limit/offset` 同样用该条数，偏移按「已加载条数」而不是固定 24 的页码。

### 5.3 封面只加载看得见的

- 去掉 `CloudAssetsView` 里对整批 `preloadMedia(covers)`。
- 封面 `<img>` 保留 `loading="lazy"`（浏览器原生视口加载）。
- 预取只保留「下一屏」这一档：`preloadTrailingCovers(items, pageSize)`，不再整批。

### 5.4 骨架

`CLOUD_SKELETON_COUNT` 改为 `pageSizeFor(gridColumns)`。

## 6. 边界

- **总是**：改动后跑资产库测试；组件级真实浏览器验证并留证。
- **先问**：改目录分片大小（24）或构建脚本。
- **绝不做**：在主检出改业务源码；用内联样式绕过 UI02。

## 7. 非目标

- 不做比例跨会话持久化与请求合并（#2152）。
- 不改目录 JSON 分片结构。
- 不改瀑布流分列与封面比例（#2150 已合）。

## 8. 假设

1. 目录接口接受 `limit ≤ 24`；超过 24 会跨分片，本切片不上。
2. 浏览器 `loading="lazy"` 对视口外图片推迟请求，本切片以此作为「只加载看得见的」实现。
