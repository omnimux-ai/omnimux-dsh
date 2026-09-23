# 工作区应用标签页（AppTab）表单控件升级与旧工程翻新 · 任务规格（Issue #2607）

## 1. 背景与根因
用户在已有工程中打开「巨型商品撞屏与荒诞追逐」等经典预设应用时，发现表单中的「解说人声音色」、「视频成片比例」、「商品主图」等字段全部渲染为普通单行输入框（`<input type="text">`）。

**根因**：工作区内的应用标签页（`plugins/omnimux-workflow/src/client/projects/AppTab.jsx`）使用了一套早期的轻量级表单渲染逻辑，仅判断了 `Array.isArray(prop.enum)`，既不支持 `prop.options`（导致配置了 options 的音色和比例全部落入文本框 fallback），也不支持 `widget` 字段（`ratio-cards`、`select-single`、`library-picker`、`segmented-tabs`、`multi-tags` 等）。

## 2. 目标与范围
1. **升级 `AppTab.jsx` 表单引擎**：
   - 统一选项解析（`resolveOptions`）：兼容 `prop.options` 与 `prop.enum`；
   - 比例卡片（`ratio-cards`）：当 `widget === 'ratio-cards'` 或 options 包含比例格式时，渲染为标准比例点选卡片（1:1, 16:9, 9:16 等）；
   - 下拉菜单（`select-single`）：渲染带 options 的下拉选择器，展示 label 并输出 value；
   - 选项卡（`segmented-tabs`）：2~4 项分段切换；
   - 多选胶囊（`multi-tags`）：支持 maxItems 上限提示与置灰；
   - 库选择与链接（`library-picker` / `media-uploader` / `product-link` / `media-extractor`）：支持从资产库选择与回填卡片；
2. **翻新 7 款经典 Creatify 预设应用**：
   - `builtin-apps.json` 与 `builtinCatalogData.ts` 中 7 款旧应用（`app-creatify-*`）表单：
     - `product_image` 升级为支持从资产库选择（`library-picker`，`library: "asset"`）；
     - `voice` 与 `aspect_ratio` 正确绑定 `options` 与对应控件类型；
3. **保持端到端提交兼容**：
   - 表单提交 payload 与执行桥（`executionBridge`）完全对齐，不丢失数据。

## 3. 验收标准
- `pnpm --config.verify-deps-before-run=false --filter omnimux-workflow test` 100% 通过；
- `pnpm --config.verify-deps-before-run=false --filter omnimux-apps test` 100% 通过；
- 在工作区应用 Tab 中打开「巨型商品撞屏与荒诞追逐」等应用时，音色渲染为下拉、比例渲染为比例卡片组、主图渲染为资产库选择触发器；
- 遵守 design.md、ai-app-ui-spec.md 与文案规范（0 违规）。
