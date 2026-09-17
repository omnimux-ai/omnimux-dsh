# 电商实物产品商品图提取与网络代理兼容验证记录

## 1. 验证目标
在独立工作树（`agent/products-fix-ecommerce-product-images`）中，验证电商详情页（如 Amazon）实物产品图片智能抽取、UI 噪声过滤、Markdown 图片兜底解析及网络代理 Fake-IP（198.18.0.0/15）兼容放行能力。

## 2. 真实数据与链路实测证据

### 2.1 网络代理 Fake-IP（198.18.0.0/15）放行验证
- **测试 IP**：`198.18.39.78`（境外电商与图片域名在 TUN 代理模式下的典型映射地址）
- **验证前状态**：`isPrivateHost` 判定为 `true`，触发 `remote host resolved to a non-public address` 错误阻断所有图片下载。
- **验证后实测**：`isPrivateHost('198.18.39.78') === false`，判定为合法公网代理通道，允许发起安全通信。

### 2.2 电商专属结构化高清画廊图提取与噪声过滤
- **输入页面**：包含 Amazon 真实页面结构（顶层导航雪碧图、Prime 图标、1x1 占位透明图、统计打点，以及主图 `data-old-hires`、`colorImages.initial` 8 张高清画廊图）。
- **实测提取结果**：
  - 噪声图片过滤率：`100%`（成功过滤 `images/G/`、`nav-sprite`、`transparent-pixel`、`$uedata` 等）。
  - 有效商品大图提取：准确提取全部 8 张超清商品图（`61Ga90juB1L._AC_SL1500_.jpg` 等）。
  - 主封面命中：第一张图片精准命中商品主视图 `https://m.media-amazon.com/images/I/61Ga90juB1L._AC_SL1500_.jpg`。

### 2.3 本地原子落盘与权限契约
- **下载与落盘数量**：达到上限 `PRODUCT_IMAGES_MAX = 6` 张高清商品图。
- **落盘文件权限**：`mode=600`（仅属主读写）。
- **封面关联**：`cover_media_id` 精准指向首张商品主图。

### 2.4 自动化测试回归
- `omnimux-products` 全量单测与集成测试：**472/472 100% 绿灯**（新增 4 项针对 Amazon 结构化画廊、Markdown 图片提取、噪声过滤与优先级排序的用例）。
- UI 门禁静态扫描：`UI01~UI10 全部合规，0 违规拦截`。
