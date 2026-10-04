# #3058 Workflow slice: capabilities seam carries `preview_fingerprint`

Issue: #3058 官方音色试听跨层一致性。本规格只覆盖 workflow 插件这一个垂直票的 seam 改动。

## 背景与范围

- hub worker 已在公共 Catalog 顶层新增 `preview_fingerprint: string`（原 `fingerprint` 语义不变）。
- workflow `CapabilityCatalog` 类型尚未声明该字段，`readCanvasCatalog` 的顶层白名单会把它剥掉。
- 范围内：`plugins/omnimux-workflow/src/shared/api.ts`、`src/workflow/seam/canvasCatalog.ts`、`src/shared/generationPolicy.hub.test.mjs`。
- 范围外（其他 worker 负责）：`plugins/omnimux` hub 实现、前端 VoicePickerDialog、omnimux-assets。

## 用户操作旅程（系统视角）

1. 画布 capabilities 消费方读取 public seam（`omnimuxGateway.capabilities` → `readCanvasCatalog`）。
2. 新 hub 下发的 `preview_fingerprint` 原样到达 capabilities 顶层，供跨层一致性断言 `export.preview_fingerprint === hub.preview_fingerprint === capabilities.preview_fingerprint`。
3. 旧 hub 或 static stub 无该字段时，capabilities 照常工作，字段为 `undefined`，不产生错误。

## 验收用例

1. `readCanvasCatalog` 收到含 `preview_fingerprint`（64 hex）的 Catalog body 时，返回值顶层逐字携带同一字符串，不附 `:canvas:` 后缀、不重新计算 hash。
2. `projectCanvasCatalog` 输入带 `preview_fingerprint` 时输出保留（经既有 `...catalog` spread，无需新增逻辑）。
3. body 缺少该字段、字段为 `null`、或 static-stub 兜底路径返回空目录时，`preview_fingerprint` 均为 `undefined`，不抛错。
4. 既有指纹语义不变：`fingerprint` 仍附 `:canvas:` 后缀；两字段互不替代。

## 非目标

- 不新增 hash 算法、不造字段别名、不改 `projectCanvasCatalog` 的 curation fingerprint。
- 不改 `mockCatalog` 等静态夹具（optional 字段即兼容）。
- 不做端到端浏览器验收（本票为纯 seam 投影改动）。
