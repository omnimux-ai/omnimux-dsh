# TikTok Shop 网关接入中枢与商品链接解析

## 目标（Objective）
把 OmniMux 网关已接入的 TikTok Shop 模型接到中枢 `omnimux_social_data`，并让商品库「粘贴链接导入」在识别到 TikTok Shop URL 时优先走该通路，稳定拿到标题、价格、主图。

用户：出海卖家 / 运营，粘贴 Shop 商品链接创建实物产品。

成功标准：
1. 中枢可通过官方密钥调用 `tiktok-shop-product-link` / `tiktok-shop-product-v3`（及 V1 回退）。
2. `import-from-link` 对 `shop.tiktok.com/.../pdp|product/<id>` 产出可用 name、price、images，不依赖页面 HTML 与滑块验证。
3. 非 Shop 链接行为不变（Jina + 本地 HTML 双读）。
4. 无 `OMNIMUX_API_KEY` 时 fail-closed，明确未配置错误。
5. 仓库不出现 TikHub 原始密钥。

## 假设
1. 网关生产渠道已登记模型：`tiktok-shop-product-link`、`tiktok-shop-product`、`tiktok-shop-product-v3` 等。
2. 官方调用形态与现有 social-data 一致：`POST /v1/chat/completions`，业务参数为顶层字段。
3. `sg/pdp` 链接转编号上游常失败，需规范为 `view/product` 或直接拆 product_id。
4. 详情优先 V3，失败回退 V1。

## 用户旅程
1. 用户打开产品库 / 选择器，粘贴 TikTok Shop 商品链接并导入。
2. 系统识别为 Shop URL → 中枢 social-data 解析编号与地区 → 拉详情。
3. 界面得到名称、现价/原价、主图列表的草稿（或明确失败文案）。
4. 用户确认后保存为实物产品。

## 命令
- 单测：`node --test plugins/omnimux/src/official/social-data.test.js`
- 单测：`node --test plugins/omnimux-products/src/tiktok-shop-import.test.js`
- 可选相关 filter 测试

## 项目结构
- `plugins/omnimux/src/official/social-data.js` — 目录与字段映射
- `plugins/omnimux/src/official/mount.js` — 工具 schema/描述
- `plugins/omnimux-products/src/tiktok-shop-import.js` — Shop 链接检测、详情映射
- `plugins/omnimux-products/src/link-importer.js` — import 入口优先 Shop
- `plugins/omnimux-products/src/http-routes.js` — hub.socialData 接缝

## 代码风格
沿用现有 ESM、JSDoc、OmnimuxError；不引入新依赖；密钥只走 hub 官方客户端。

## 测试策略
- 单元：capability 映射、share_link 规范化、region 提取、详情 JSON→草稿字段。
- 导入：Shop URL 走 socialData mock，不发起真实网络。
- 回归：既有 social-data / link-importer 测试仍绿。

## 边界
- 总是：官方密钥通道；V3 优先；无密钥 fail-closed；不写密钥入仓。
- 先问：改网关生产路由、扩更多 Shop 能力到 UI 工具面以外。
- 绝不：客户端直连 api.tikhub.io；静默伪造商品字段。

## 验收用例
| # | 操作 | 期望 |
|---|---|---|
| A | `platform=tiktok, capability=shop_product, url=.../sg/pdp/1733...` | model=`tiktok-shop-product-v3`，body 含 product_id + region=SG |
| B | `capability=shop_product_link` + pdp URL | share_link 规范为 view/product |
| C | import-from-link Shop URL + mock 详情 | name/price/images 非空 |
| D | 普通 amazon URL | 仍走原双读，不调 shop 模型 |
| E | 无 socialData/无密钥 | 明确失败或按实现降级说明 |

## 非目标
- 不改 OmniMux 网关仓生产脚本
- 不做 Dev 真机 UI 验收门禁（非 UI 主路径；以单测为 Agent 验收）
