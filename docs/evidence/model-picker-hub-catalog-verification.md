# Issue #2136 · 会话模型选择器动态中枢目录 — 预演与 DOM 证据

## 结论
会话「模型」面板列表真源改为中枢 `modelCatalog` 的 video/image **已上架桶**；静态 `DEFAULT_MODEL_CATALOG` 已删除。未上架的 Seedance Fast / Mini / Trial 不再出现在列表 DOM。

## 预演方式
- 隔离工作树：`.worktrees/market-model-picker-hub-catalog-issue-2136`
- 纯投影单测：`node --test src/client/model-picker-catalog.test.js`
- 真实 Chromium headless DOM 探针（`scripts/test-fixtures/style-dom-probe.mjs`）：
  `node --test src/client/model-picker-hub-catalog.e2e.test.js`

## 核心场景
| 场景 | 期望 | 结果 |
|---|---|---|
| 中枢 listed 视频桶 | 仅 minimax-h3 / seedance-2-0 / seedance-2-5 | PASS（见 video-probe.json） |
| 未上架 Fast/Mini/Trial | DOM 无对应 data-model-id / 名称 | PASS |
| 图像桶 | 仅 gpt-image-2.5 三系 | PASS |
| 空目录 | 0 行 + 空态文案，无假 Seedance | PASS（见 empty-probe.json） |
| 缓存 | 30min TTL 读写；过期失效 | PASS（catalog 单测） |

## 产物
- `docs/evidence/model-picker-hub-catalog-video-probe.json`
- `docs/evidence/model-picker-hub-catalog-empty-probe.json`
- 规格：`specs/model-picker-hub-catalog.spec.md`
