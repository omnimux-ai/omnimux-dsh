# 工程师交付报告 · 灵感社区分类筛选动态化（Issue #2497）

## 结论

缺陷已修复：分类下拉不再写死 9 个中文电商类目，改为由中枢新增的
`GET /omnimux/inspiration/categories` 聚合端点驱动的云端真实分类动态选项；
端点带 10 分钟 SWR 缓存与永不报错降级，前端加载失败/为空时降级为仅「全部」首项。
提交于工作树分支 `agent/inspiration-dynamic-category-filter-issue-2497`
（commit `139aadf3c` + 规格 `a85201f94`），未推送、未开 PR。

自检判定：**IS_PASS: YES**（接口与类型调用端/实现端对齐、跨文件引入与导出无误、
无重复实现；真实浏览器验证通过）。

## 改动文件清单

| 文件 | 改动 |
| --- | --- |
| `specs/inspiration-dynamic-category-filter.spec.md` | 新增：六区规格（背景/目标/验收/范围外/风险/测试要点） |
| `plugins/omnimux/src/official/inspiration.js` | 新增 `collectCategoryCounts()`（page_size=100、并发 5 分页聚合 category 去重计数、计数降序+名称字典序 tiebreak、空/缺失剔除）与 `createCategoryCache()`（10 分钟 TTL、SWR、单 in-flight 去重、失败保陈） |
| `plugins/omnimux/src/official/inspiration-http.js` | 新增 GET `/omnimux/inspiration/categories` 路由（注册在 `:id` 通配之前）；仅 GET、沿用 PAT 通道、无管理员限制；上游失败有陈缓存回陈缓存、无缓存回 200+`{data:[]}` |
| `plugins/omnimux-inspiration/src/client/api.js` | 新增 `listCategories()`（无守卫，失败静默降级） |
| `plugins/omnimux-inspiration/src/client/feed-helpers.js` | 新增 `buildCategoryFilterOptions()`：首项固定「全部」+ 动态分类（trim/去重），已选值缺失时保留显示 |
| `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` | 分类下拉选项改动态；仅全部/云端 tab 发分类请求；本地/账号监控 tab 不发 |
| `plugins/omnimux-inspiration/src/client/locales.js` | `category.all`：商品分类→全部（zh）/ All Categories→All（en） |
| `plugins/omnimux/src/official/inspiration.test.js` | +7 用例：多页聚合、并发上限、空值剔除、tiebreak、缓存 TTL/去重/失败保陈 |
| `plugins/omnimux/src/official/inspiration-http.test.js` | +7 用例：聚合应答、`:id` 不冲突、TTL 缓存命中、SWR 陈缓存+后台刷新、失败降级空数组、失败保陈、非管理员 GET 放行 |
| `plugins/omnimux-inspiration/src/client/category-options.test.js` | 新增：选项构建单测（首项恰为「全部」/降级/去重/已选保留）+ `listCategories` 路径与失败不抛 + 文案门禁断言 |
| `plugins/omnimux-inspiration/src/client/inspiration-category.e2e.test.js` | 新增：jsdom 真实打包渲染门禁——动态选项渲染、失败降级仅「全部」、本地 tab 不发分类请求 |
| `scripts/verify-inspiration-dynamic-category.mjs` | 新增：任务专属真实浏览器（无头 Chrome + 动态端口 + 测完即焚）验证脚本 |
| `docs/evidence/inspiration-dynamic-category-filter-verified.png` / `-verify.json` | 真实浏览器截图与结构化报告（菜单展开态：全部✓/digital/Health & Wellness/女装和内衣） |

## 测试实际结果

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter omnimux-inspiration test` | ✅ 877 pass / 0 fail / 2 skipped（879 total） |
| 中枢 inspiration 两测试文件（单跑） | ✅ 33 pass / 0 fail |
| `pnpm --filter omnimux test`（全量） | ❌ 7 fail —— 全部位于 `src/text/execute.test.js`（模型契约守卫），stash 基线对照同样 7 fail，与本改动无关的基线红 |
| `pnpm verify:stages` | ❌ 2 项（omnimux-social-harvest injectStyles、omnimux-accounts gui/split），基线对照同样失败，与本改动无关 |
| `pnpm test:gates` | ❌ 多项（live-qa 舞台契约 gui/split、sync 物料化矩阵等环境相关），基线对照同样失败；与任务相关的 `guard-quality-loop` / `auto-qa-scan` / `verify-stage-scroll-contract` / `verify-skill-bilingual` 单跑均 ✅（47/47、8/8） |
| 真实浏览器验证（本工作树隔离环境） | ✅ 4/4 断言：触发器正几何、动态选项首项恰为「全部」且含 digital/Health & Wellness/女装和内衣且无旧写死类目、聚合失败降级仅「全部」、截图落盘 |
| 文案门禁正则 `/全部(平台\|账号\|来源\|类型\|状态\|分类\|发布方式)/` | ✅ 改动文件零命中（存量命中均为基线既有注释/测试文本） |

## 未覆盖项

1. **云端首刷实测**：聚合端点对真实云端约 30 页的首刷耗时（估算并发 5 下约 6s）未在真实 Dev 实例实测——Dev（45120）为共享单实例，真机验收属人工范畴；逻辑已由分页/并发单测覆盖。
2. **Dev 真机验收**：按仓库约定为人工执行，Agent 不代签。
3. **分类计数显示**：下拉 label 仅显示分类名，未展示 count（方案未要求）。
4. 全量 `pnpm test:gates` 基线红项（live-qa/sync 等）未修复，属既有仓库状态，超出本任务边界，已留证对照。
