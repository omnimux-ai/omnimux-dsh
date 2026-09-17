# 规格：资产中心卡片网格 · 封面比例持久化缓存与请求合并

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/2152
- 父任务：https://github.com/omnimux-ai/omnimux-dsh/issues/2147
- 前置：https://github.com/omnimux-ai/omnimux-dsh/issues/2150（瀑布流）、https://github.com/omnimux-ai/omnimux-dsh/issues/2151（视口加载）
- 状态：已确认
- 工作树：`.worktrees/d-2152`（分支 `agent/d-2152-issue-2152`）

## 1. 目标

优化缓存算法：记住真实封面比例，二次进入完全零跳动；合并重复并发网络请求，避免无效请求风暴；保持严格的 LRU 热度淘汰，内存与本地存储体积恒定受控。

现状与痛点：
1. 首次加载图片后通过 `naturalWidth/naturalHeight` 算出的真实比例未持久化，刷新或二次打开页面时重新按兜底比例占位，引发二次布局跳动（CLS）。
2. 在用户快速切换分类、搜索或滑动时，若同一资源/页面的请求仍在进行中，重复触发会产生重复的网络请求（无 in-flight 请求合并）。
3. 缓存策略未对封面比例做跨会话持久化与容量防膨胀保护。

## 2. 用户操作旅程

1. 用户浏览资产中心，封面图片按视口渐进加载。
2. 图片加载完成后，系统静默记住该封面真实宽高比并落入持久化 LRU 缓存。
3. 用户在分类之间来回切换或重新进入资产中心：已看过的封面直接以精确比例占位，页面**完全零跳动**。
4. 即使并发快速触发相同查询或页面，网络层自动合并请求，无重复流量损耗。

## 3. 期望界面反馈

- 再次浏览已加载过的卡片时，占位高度与图片最终渲染高度 100% 吻合，无任何视觉跳跃。
- 连续快速切换分类或刷新时不发生卡顿，并发网络请求明显减少。
- 本地存储与内存占用严格受限（默认最多缓存 1000 条比例数据，超限按最少使用自动淘汰）。

## 4. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | `RatioCache` 纯模块：提供 get/set/has/clear，内存 LRU 并同步受控持久化到本地存储；默认上限 1000 项，超限淘汰最久未访问条目 | 纯函数单测 |
| AC-2 | `coverRatioOf` 优先使用持久化比例，使得已知卡片在挂载首帧即获得精确比例 | 纯函数单测 + 源码契约 |
| AC-3 | 图片 `onLoad` 获取到真实尺寸后自动持久化记录比例 | 源码契约 |
| AC-4 | 并发请求合并（Coalescing）：同 URL/参数的在飞请求共享同一 Promise，完成后自动释放 | 单测 + 源码契约 |
| AC-5 | 组件级真实浏览器验证：两次渲染同一批卡片，第二次直接以真实比例占位，跳动量（高度差）为 0 | 真实浏览器实测与截图 |
| AC-6 | 现有功能与契约测试 100% 保持通过，UI 门禁 0 违规，产品基线合规，`verify:app` 通过 | 门禁与自动化套件 |

## 5. 设计

### 5.1 `ratio-cache.js` 比例持久化缓存

- 基于 `LruCache` 构建，包装 `localStorage` 的安全读写（带 try/catch 防私密模式或配额超限报错）；
- 存储键：`omnimux_asset_cover_ratios_v1`；
- 单例导出 `coverRatioCache`，提供 `get(id)`、`set(id, ratio)`、`has(id)`、`clear()`；
- 支持序列化与安全初始化。

### 5.2 请求合并器 `request-coalescer.js`

- `coalesceRequest(key, fetcher)`：若已有相同 `key` 的 Promise 在进行中，直接返回该 Promise；
- Promise 决议后（无论成功还是失败）从内部 Map 中移出；
- 应用在 `cloudPage` 与 `cloudFilter` 或公共请求入口处。

### 5.3 接线点

- `masonry.js`：`coverRatioOf(asset, known)` 中如果未传 `known`，默认回退查询 `coverRatioCache.get(asset?.id)`；
- `CloudAssetsView.jsx`：图片 `onLoad` 时不仅设置 DOM 属性，还调用 `coverRatioCache.set(asset.id, ratio)`；
- `api.js`：对静态页面请求引入请求合并。

## 6. 边界与红线

- 绝不用任何可能超出浏览器配额的无界存储。
- 绝不改动已定稿的 5 列封顶与瀑布流结构。
- 保证无浏览器/Node 环境降级兼容（Node 单测中 localStorage 不存在时平稳降级为内存 LRU）。
