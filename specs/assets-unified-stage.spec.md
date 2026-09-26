# 规格说明书：本地资产库统一 3:4 展台模式与响应式网格

## 1. 目标与用户体验（Objective）
解决本地资产库在各素材类型混合排布时卡片高度参差不齐（瀑布流下沿严重犬牙交错、视觉破碎）的问题。
对齐现代化专业生产力工具（Figma / Eagle / Midjourney Showcase）的陈列哲学与灵感社区的整洁秩序感：
- **外框 100% 绝对统一**：所有本地资产卡片封面统一锁定规整 3:4 黄金画幅，彻底消灭瀑布流犬牙交错，实现行行齐平。
- **内容等比自适应呈现**：
  * **角色立绘（character）**：以 `object-fit: cover` 撑满 3:4 容器，`object-position: center top` 保护发型与面部关键构图。
  * **非角色素材（场景 scene、背景 background、道具 prop、知识包 knowledge、风格包 style、自定义 custom 等）**：以 `object-fit: contain` 完整容纳在 3:4 展台内，**100% 拒绝裁剪**，画面四周/上下配以柔和中性底衬 `--dsw-alias-bg-module-platform`。
- **响应式阶梯网格**：每行最多 5 列，依据容器宽度自动适配列数（1560px: 5列，1280px: 4列，1024px: 3列，768px: 2列），保持舒适列宽与高密度扫描效率。

## 2. 详细技术实现方案（Implementation Plan）

### 2.1 样式表：`plugins/omnimux-assets/src/client/styles.js`
1. 统一封面展台容器：
   ```css
   .omnimux-assets-card:not(.omnimux-assets-cloud-card) [class*="coverWrapper"],
   .omnimux-assets-card:not(.omnimux-assets-cloud-card) .omnimux-assets-card-thumb {
     aspect-ratio: 3 / 4;
     width: 100%;
     height: 100%;
     position: relative;
     overflow: hidden;
     background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-1));
   }
   ```
2. 角色立绘撑满居上：
   ```css
   .omnimux-assets-card--character:not(.omnimux-assets-cloud-card) .omnimux-assets-card-media,
   .omnimux-assets-card--character:not(.omnimux-assets-cloud-card) .omnimux-assets-card-video {
     width: 100%;
     height: 100%;
     object-fit: cover;
     object-position: center top;
     display: block;
   }
   ```
3. 非角色素材等比完整容纳（无裁切）：
   ```css
   .omnimux-assets-card:not(.omnimux-assets-card--character):not(.omnimux-assets-cloud-card) .omnimux-assets-card-media,
   .omnimux-assets-card:not(.omnimux-assets-card--character):not(.omnimux-assets-cloud-card) .omnimux-assets-card-video {
     width: 100%;
     height: 100%;
     object-fit: contain;
     object-position: center;
     display: block;
   }
   ```

### 2.2 组件逻辑收敛：`plugins/omnimux-assets/src/client/AssetGrid.jsx`
1. 移除先前拆分的 `ASSET_ASPECT_RATIO_MAP` 字典和 `resolveAssetAspectRatio` 函数，统一将 `aspectRatio="3:4"` 作为基准规范传递给底层卡片组件。
2. 维护类型安全类名 `omnimux-assets-card--${safeType}` 与属性 `data-type={safeType}`，为样式表提供精确的样式分流勾子。

### 2.3 测试规范更新：
1. `plugins/omnimux-assets/src/client/AssetGrid.test.js`：更新断言契约，确保 MediaCard 与 CSS 声明均严格对齐 3:4 统一展台标准。
2. `plugins/omnimux-assets/src/client/assets-vertical-cards.e2e.test.js`：测试角色、场景、道具在 3:4 统一展台下的呈现状态（角色 cover 居上，非角色 contain 居中）。

## 3. 验收标准（Acceptance Criteria）
- AC-1：在真实 Dev App 资产库「本地」页面中，第一行和后续所有行的卡片上沿、下沿完全齐平，无高度参差与犬牙交错现象。
- AC-2：场景素材（16:9）与道具素材（1:1 或 4:3）在 3:4 展台内完整居中展现，无任何横向或纵向画面裁剪。
- AC-3：所有现有自动化测试 100% 通过（`pnpm --filter omnimux-assets test`）。
