# 资产中心产品库商品封面图加载与服务兼容规格 (Issue #2338)

## 1. 业务目标
解决资产中心产品库中商品卡片无法加载封面图的问题。使已录入/导入的实物与数字商品能正常渲染高清缩略图，避免错误退回显示名称首字占位符。

## 2. 关键用户旅程
1. 用户进入资产中心，切换至「产品库」标签；
2. 系统渲染商品微卡列表；
3. 带有商品主图/截图的商品，在卡片缩略图区域正常显示高清封面图片（加载成功，未隐藏）；
4. 当商品确实无图片或图片已失效时，优雅兜底显示首字文字占位符。

## 3. 技术契约与改动规范
### 3.1 前端：`plugins/omnimux-assets/src/client/ProductsView.jsx`
- 修正 `previewUrl` 方法：
  从 `/omnimux/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`
  改为 `/omnimux/products/${encodeURIComponent(productId)}?preview=${encodeURIComponent(mediaId)}`。
- 与 `omnimux-products` 现存 `previewUrl(productId, mediaId)` 契约保持完全一致。

### 3.2 服务端：`plugins/omnimux-products/src/http-routes.js`
- 路径解析 `parseProductPath` 扩展对 `/omnimux/products/{productId}/media/{mediaId}` 的兼容支持；
- 当捕获到 `parsed.kind === 'media-item'` 时，调用 `library.resolvePreview(parsed.id, parsed.mediaId)` 返回图片只读流；
- 形成双向保护，即使后续有其他模块按 RESTful 子路径请求，也能正确解析并返回流。

## 4. 验收标准与测试设计
1. 单元测试 / 契约测试：
   - 验证 `parseProductPath` 正确解析 `/omnimux/products/prd_1/media/med_1`；
   - 验证分发器对 `/omnimux/products/prd_1/media/med_1` 请求能成功调用 `library.resolvePreview` 并返回 200 流；
   - 验证原有的 `/omnimux/products/prd_1?preview=med_1` 继续正常工作；
   - 验证原有的 `/omnimux/products/prd_1/media`（获取媒体列表）不受破坏。
2. 前端组件测试：
   - 验证 `ProductsView` 生成正确的图片 URL 并展示。
3. 真实浏览器 / CDP 验证：
   - 确保当前运行中的真实实例或测试页面中，商品卡片图片真实渲染（naturalWidth > 0）。
