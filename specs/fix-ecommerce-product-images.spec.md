# 电商实物产品商品图提取与网络代理兼容规范

**文件：** `specs/fix-ecommerce-product-images.spec.md` ｜ **优先级：** P0 ｜ **模块：** `plugins/omnimux-products`

## 1. 问题与用户旅程

### 1.1 现状与痛点
用户在「添加实物产品」表单中粘贴真实电商详情页链接（如 Amazon 日本站商品链接），点击「智能解析」后：
- 标题、卖点、受众、品牌、特性、价格均解析成功；
- **但右侧「商品主图与素材」区域完全空白，一张商品图片都未能提取出来**。
用户原本期望系统自动抓取并下载商品主图与画廊图片，并将第一张默认设置为主封面。

### 1.2 根因定性
1. **图片抓取候选池被网站 UI 杂质挤占**：
   - `extractImgTags` 原先仅从 HTML 顶部顺次匹配 `<img src="...">`，而 Amazon 等大型电商网站顶部有海量导航雪碧图、Prime 会员图标、购物车图标、1x1 占位图（通常为 `images/G/` 或带 `$uedata` 统计）。
   - `buildProductFields` 对候选图片做了 `slice(0, 8)` 截断，导致 8 张图片配额全被顶部 UI 杂质占满，真正的商品大图（通常在主图模块或第 15 个标签之后）直接被丢弃。
   - 未能识别主流电商专属的商品图高分辨率数据源：如 Amazon 的 `colorImages.initial`（含 `hiRes` 1500px 高清图与 `large` 图）、`data-old-hires`、`data-a-dynamic-image` 以及 `images/I/` 路径特征。
2. **网关 Markdown 兜底缺失图片解析**：
   - 当本机直接请求被阻断转走中枢网关 `readViaHub` 时，`pageFromMarkdown` 直接硬编码了 `images: []`，未从 Markdown 语法的 `![alt](url)` 或 `<img src="...">` 中提取任何图片。
3. **SSRF 防护误拦截标准代理 Fake-IP（198.18.0.0/15）**：
   - `public-host.js` 的 `isBlockedIpv4` 将 `198.18.0.0/15` 判定为私有受阻 IP。然而在现代系统网络（尤其是开启 Surge、Clash、Shadowrocket 等 TUN 模式）中，境外电商域名会被系统虚拟网卡分配 `198.18.x.x` 作为 Fake-IP 路由至代理。
   - `publicLookup` 与 `downloadImage` 拦截此 IP 导致 `publicFetch` 抛出 `remote host resolved to a non-public address`，使图片下载 100% 失败。

## 2. 目标与验收标准 (Acceptance Criteria)

### AC-101：主流电商商品大图优先抽取与画廊解析
- **场景**：输入包含结构化商品图（如 Amazon `colorImages`、`data-old-hires`、`data-a-dynamic-image` 等）的商品详情页。
- **预期**：优先提取 `colorImages.initial` 中的 `hiRes` 和 `large` 超清大图、`data-old-hires` 属性图片，确保商品核心图排在列表首位。

### AC-102：网站 UI 图标、雪碧图与统计占位图过滤
- **场景**：页面中存在大量通用 UI 图片（如 `images/G/`、`nav-sprite`、`transparent-pixel`、`$uedata`、小尺寸占位图）。
- **预期**：自动过滤上述噪声图片，确保流入下载流程的候选图片均为真正的商品展示图。

### AC-103：Markdown 页面兜底图片解析
- **场景**：页面通过中枢网关获取纯 Markdown 格式文本。
- **预期**：`pageFromMarkdown` 自动提取其中的 Markdown 图片语法 `![...](url)`，使中枢网关通道同样具备商品图提取能力。

### AC-104：网络代理 Fake-IP（198.18.0.0/15）安全放行
- **场景**：用户在本机开启了网络代理（TUN 模式），境外图片域名解析为 `198.18.x.x`。
- **预期**：`public-host.js` 不再误拦截 `198.18.0.0/15`，图片下载通道顺畅连接，商品图正常写盘入库。

### AC-105：全量测试与回归验证
- **场景**：运行 `omnimux-products` 现有全套 468+ 测试与新增专项测试。
- **预期**：全部测试 100% 绿灯，端到端真实 Amazon 详情页实测成功提取多张高清商品图并原子写盘。
