# 工程师第 2 轮修补报告 · Issue #2497

- **任务**：按第 1 轮审查意见修 H1/H2/M1–M4（低档两条丢弃）
- **工作树**：`.worktrees/inspiration-dynamic-category-filter`
- **分支**：`agent/inspiration-dynamic-category-filter-issue-2497`
- **审查输入**：`.agent-reports/inspiration-dynamic-category-filter-review.md`
- **规格**：`specs/inspiration-dynamic-category-filter.spec.md`（方向未改）
- **时间**：2026-09-20 23:21–23:38 CST

## 结论

审查必修 6 条均已落地。切到「本地」后分类下拉恰为「全部」，且本地查询不再携带云端分类；冷启动聚合有页数上限、短页终止、15s 超时，后续页失败不丢首页结果。自检判定：**IS_PASS: YES**。

## 每条意见如何修

### H1 高 · 切「本地」不丢云端分类

- `InspirationSection.jsx`：非全部/云端时 `buildCategoryFilterOptions` 传入空列表与空选中值；下拉 `value` 在本地 tab 强制 `''`。
- `use-inspiration-feed.js`：`setTab` 离开全部/云端时同步 `setCategory('')`，React 批处理避免本地查询看到残留 `digital`。
- `api.js` `loadInspirationsAtomic`：`tab === 'local'` 时不转发 `category`（双保险）。
- 测试：`inspiration-category.e2e.test.js` 切 tab 后选项恰为 `['全部']` 且本地 URL 无 `category=`；`use-inspiration-feed.test.js` 切 tab 清选中值；`api.test.js` 本地不转发、云端仍转发。

### H2 高 · 冷启动聚合无界

- `collectCategoryCounts`：`maxPages` 默认 50（可配置）；一页 `items.length < pageSize` 即停，且按并发批次走，短页后不再开下一批；整次 walk 15s 超时，失败走现有 SWR `200 { data: [] }`。
- 官方 `withPat` 无 AbortController，超时用 Promise 竞态；迟到拒绝被吞掉，不产生 unhandledrejection。
- 测试：毒 `total` 只打 3 页；短页停；超时 reject。路由层既有失败降级用例覆盖 timeout 失败路径。

### M1 中 · `Number(total) || firstCount` 塌 0

- 用 `Number.isFinite(rawTotal) && rawTotal >= 0` 判定 `total`。
- 无 `total` 且首页满页时继续翻到 `maxPages`。
- `total === 0` 且首页空数组不再翻页。

### M2 中 · 后续页抛错丢弃已吸收结果

- 仅首页失败才整次失败；后续页 `try/catch` 跳过，保留已吸收计数。

### M3 中 · 验证脚本失败桩

- 生产失败路径改为 `200 { data: [] }`（`emptyCategories`）。
- HTML 内联 + `Page.addScriptToEvaluateOnNewDocument` 在导航前挂 `window.onerror` / `unhandledrejection`。

### M4 中 · 切「本地」场景

- 新增 `scenarioLocalTabDropsCloudCategory`：选项恰为 `['全部']`；本地 tab 查询为 `sort=new` 且无 `category=`。

### 丢弃（按指令）

- ttlMs=0 无法关缓存：不改。
- Chrome 路径仅 macOS：不改。

## 测试结果

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter omnimux-inspiration test` | ✅ 879 pass / 0 fail / 2 skipped |
| `node --test inspiration.test.js inspiration-http.test.js`（中枢） | ✅ 40 pass / 0 fail |
| `node scripts/verify-inspiration-dynamic-category.mjs` | ✅ 5/5：触发器几何、动态选项首项「全部」、`200 { data: [] }` 降级、切本地仅「全部」且本地查询无 category、截图落盘 |

## 未覆盖

1. 真实云端约 30 页首刷耗时未在共享 Dev 45120 实测（人工范畴）。
2. 默认 15s 超时未在 HTTP 路由层用真 15s 挂起验证（walker 单测覆盖超时 reject；路由层覆盖任意 walk 失败 → 200 []）。
3. 低档两条按指令未改。
4. 未推送、未开 PR。

## 改动文件

| 文件 | 要点 |
| --- | --- |
| `plugins/omnimux/src/official/inspiration.js` | maxPages / 短页批次终止 / 超时 / 合法 0 / 后续页跳过 |
| `plugins/omnimux/src/official/inspiration.test.js` | H2/M1/M2 单测 |
| `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` | 本地选项空列表 |
| `plugins/omnimux-inspiration/src/client/use-inspiration-feed.js` | 离云端 tab 清 category |
| `plugins/omnimux-inspiration/src/client/api.js` | 本地不转发 category |
| `plugins/omnimux-inspiration/src/client/*.test.js` | 切 tab / 不转发 |
| `scripts/verify-inspiration-dynamic-category.mjs` | M3/M4 |
| `docs/evidence/inspiration-dynamic-category-filter-verified.png` / `-verify.json` | 浏览器证据刷新 |

## 自检

1. 接口与类型调用端/实现端对齐（`collectCategoryCounts` opts 仅测试覆盖，路由仍走默认）。
2. 引入路径与导出无误。
3. 无重复实现；排序抽了 `sortedCategoryRows`。
4. **IS_PASS: YES**
