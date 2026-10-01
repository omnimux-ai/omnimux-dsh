# 规格说明：素材选择框打通资产库真实数据与两行自适应比例

**Issue**: #2863  
**状态**: 实施中  
**范围**: `plugins/omnimux/src/client/media-viewer/`  

---

## 1. 目标与用户意图对齐

根据用户明确指示与参考图比对：
1. **真实数据打通与分类对齐**：
   - 废除原静态 mock 占位分类（上传资产/AI生成/数字人/商品）；
   - 100% 对齐资产库页面的四个核心一级分类：
     - **本地** (`local`，默认激活，包含首格“从本地上传”+本地已沉淀资产)
     - **公共** (`cloud`，云端公共素材)
     - **产品库** (`product`，已录入电商与实物商品)
     - **AI 生成** (`generations`，创作画布与任务生成产物)
2. **两行检视视口与排布**：
   - 弹窗内容视口调整为 `min-height: 260px; max-height: 310px; overflow-y: auto;`，确保默认能够完整检视两整行卡片数据；
3. **卡片比例分流契约**：
   - **「本地」与「AI 生成」**：卡片缩略图固定锁定为 **1:1**（正方形比例，`aspect-ratio: 1 / 1; object-fit: cover;`）；
   - **「产品库」与「公共」**：按实际卡片比例显示（自适应封面原始宽高比，保留完整立绘与海报细节）；
4. **入槽交互闭环**：
   - 点击任意真实素材卡片，安全派发标准 asset 结构到目标卡槽，并自动关闭选择框。

---

## 2. 详细接口与映射契约

### A. 真实数据接口
1. `local`: `GET /omnimux/assets/state` -> `body.assets`
   - 封面：`/omnimux/assets/library/preview?id=${asset.id}&file=${coverFile.id}`
2. `cloud`: `GET /omnimux/assets/cloud/search?q=&limit=24` -> `body.items`
   - 封面：`item.meta?.source_cover_url` 或 `/omnimux/assets/cloud/media?id=${item.id}&which=cover`
3. `product`: `GET /omnimux/products/state` -> `body.products`
   - 封面：`/omnimux/products/${product.id}?preview=${cover_media_id}`
4. `generations`: `GET /omnimux/assets/artifacts` -> `body.artifacts`
   - 封面：`/omnimux/assets/artifacts/preview?id=${artifact.id}`

### B. 常量与向后兼容 (`reference-constants.js`)
- `REFERENCE_TABS`:
  - `{ id: 'local', label: '本地' }`
  - `{ id: 'cloud', label: '公共' }`
  - `{ id: 'product', label: '产品库' }`
  - `{ id: 'generations', label: 'AI 生成' }`
- 保留 `PRESET_REFERENCE_ASSETS` 兜底导出，满足既有单测白名单。
