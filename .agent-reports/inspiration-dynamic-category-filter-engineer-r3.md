# 工程师第 3 轮修补报告 · Issue #2497

- **任务**：按第 2 轮复审修 H1-r2 + M1-r2 / M2-r2 / M3-r2 / M4-r2（本任务最后一轮审查修补）
- **工作树**：`.worktrees/inspiration-dynamic-category-filter`
- **分支**：`agent/inspiration-dynamic-category-filter-issue-2497`
- **基线 HEAD 入场**：`15abcd500`
- **审查输入**：`.agent-reports/inspiration-dynamic-category-filter-review-r2.md`
- **规格**：`specs/inspiration-dynamic-category-filter.spec.md`（补验收 7/8，方向未改）
- **时间**：2026-09-21 00:10–00:50 CST
- **约束**：不推送、不开 PR

## 结论

第 2 轮 1 高 4 中均已落地。「全部」tab 选中云端分类时，本地半边永不带 `category`；验证脚本不再假绿；聚合 walk 超时停排程、短页/后续页失败在吸收本批后结束。自检判定：**IS_PASS: YES**。

## 每条意见如何修

### H1-r2 高 · `api.js` 全部 tab 本地半边仍带 category

- `loadInspirationsAtomic` 拆成 `sharedArgs`（永不带 category）与 `cloudArgs`（才挂 category）。
- `tab=local` 与 `tab=all` 的 `/local` 走 `sharedArgs`；`tab=public` 与 `tab=all` 的云端半边走 `cloudArgs`。
- 单测：`tab=all + category=digital` 时 local URL 无 `category=`，cloud URL 有 `category=digital`。

### M1-r2 / M2-r2 中 · 验证脚本假绿（第 1 轮 M4 未关闭）

- 点 digital：缺选项即失败，不再用空 `click()` 吞掉。
- 选中后等到**云端**请求落地 `category=digital` 再切 tab（本地半边修完后本来就不会带 category）。
- 切本地后对 `logLocal.slice(beforeSwitch)`：切片非空，且任意一条都不得含 `category=`。

### M3-r2 中 · 超时只 reject 不停止 walk

- `withDeadline` 超时置 `aborted`，walk 跳出后续批次排程。
- 官方 `withPat` 不能 abort，当前批次仍结算。
- `createCategoryCache.refresh`：成功立刻清 inflight；超时/失败等到底层 walk settle 再清，避免叠扫。
- 单测：deadline 后不再开下一批；超时后立刻 retry 共享 inflight。

### M4-r2 中 · 后续页 catch 不置 short

- 后续页 `catch` 置 `short`；短页或失败在吸收本批成功页后 `break`，不再排到 `maxPages`。
- 单测：concurrency=1 后续页失败只打 page 1+2；concurrency=2 短页吸收同批其余页后停止。

## 测试结果

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter omnimux-inspiration test` | ✅ 879 pass / 0 fail / 2 skipped |
| `node --test inspiration.test.js inspiration-http.test.js`（中枢） | ✅ 44 pass / 0 fail |
| `node scripts/verify-inspiration-dynamic-category.mjs` | ✅ 5/5：触发器几何、动态选项首项「全部」、`200 { data: [] }` 降级、切本地切片非空且无 `category=`、截图落盘 |

## 未覆盖

1. 真实云端约 30 页首刷耗时未在共享 Dev 45120 实测（人工范畴）。
2. 默认 15s 超时未在 HTTP 路由层用真 15s 挂起验证（walker 单测覆盖超时停排程 + 缓存 inflight 持有）。
3. 未推送、未开 PR。

## 改动文件

| 文件 | 要点 |
| --- | --- |
| `plugins/omnimux-inspiration/src/client/api.js` | 分类只挂云端请求 |
| `plugins/omnimux-inspiration/src/client/api.test.js` | tab=all 本地无 category / 云端有 category |
| `plugins/omnimux/src/official/inspiration.js` | aborted 停排程；后续失败置 short；inflight 等 walk settle |
| `plugins/omnimux/src/official/inspiration.test.js` | 超时停排程 / 失败结束 walk / inflight 持有 |
| `scripts/verify-inspiration-dynamic-category.mjs` | 缺选项失败；等云端 digital 落地；切片排除 category= |
| `specs/inspiration-dynamic-category-filter.spec.md` | 验收 7/8 |
| `docs/evidence/inspiration-dynamic-category-filter-verify.json` | 浏览器证据刷新 |

## 自检

1. 接口与类型调用端/实现端对齐：`loadInspirationsAtomic` 本地半边不再接收 category；`collectCategoryCounts` 仍返回 `{ name, count }[]`，路由未改签名。
2. 引入路径与导出无误。
3. 无重复实现；`CATEGORY_WALK_SETTLE` 仅缓存层读取。
4. **IS_PASS: YES**
