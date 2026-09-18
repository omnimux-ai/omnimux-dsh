# 产品库微卡移除右上角类型标签与右下角价格规格 (Issue #2347)

## 1. 业务目标
依据用户明确指示，在产品库的商品卡片中：
1. 移除卡片缩略图右上角的类型徽章（不再显示「实物产品」或「数字产品」标签）；
2. 移除卡片底部副标题右下角的价格信息（不再显示价格文本）；
进一步提升商品微卡的视觉纯净度与极简观感。

## 2. 关键用户旅程
1. 用户在「资产中心」切换至「产品库」；
2. 商品卡片缩略图区域展示纯净封面图（及选择按钮、缺省字形），右上角无类型胶囊遮挡；
3. 商品卡片底部文字区域仅显示商品主名称与品牌/卖点信息，右下角无价格；
4. 用户在产品库抽屉/独立视图中，商品卡片同样保持无类型标签的统一极简设计。

## 3. 技术契约与改动规范
### 3.1 资产中心：`plugins/omnimux-assets/src/client/ProductsView.jsx`
- 移除 `<span className="omnimux-products-badge">...</span>` 渲染；
- 移除 `{product.price ? <span className="omnimux-products-card-price">...</span> : null}` 渲染；
- 保留卡片基本品牌与卖点展示。

### 3.2 商品插件：`plugins/omnimux-products/src/client/ProductGrid.jsx`
- 移除 `<span className="omnimux-products-badge">...</span>` 渲染，保持全应用产品卡片一致性。

## 4. 验收标准
1. `ProductsView.jsx` 不再包含 `omnimux-products-badge` 与 `omnimux-products-card-price` 节点；
2. `ProductGrid.jsx` 不再包含 `omnimux-products-badge` 节点；
3. 更新对应单元测试与 E2E 契约测试，全量通过；
4. 生成可交互演示页与真实浏览器截图留存证据。
