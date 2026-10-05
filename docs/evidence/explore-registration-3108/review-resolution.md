# 独立评审处理结果 · PR #3115（Issue #3108）

评审报告：[independent-review.md](./independent-review.md)（结论 REQUEST CHANGES）。以下为逐条处理结果，均在合入前完成。

## 阻塞项

| 编号 | 处理 | 落点 |
|---|---|---|
| B1 长菜单防溢出失效 | **已修**：`computeExploreMenuPosition` 新增第 3 个参数 `menuSize`，`openExploreMenu` 先 `append` 再用 `menu.getBoundingClientRect()` 实测尺寸定位（缺省/零尺寸回落原保守常量，既有行为不变）；`.omnimux-explore-menu` 补 `max-height: calc(100vh - 16px)` + `overflow-y: auto` 作为滚动兜底 | `plugins/omnimux/src/client/sidebar-coordinator.js` |
| B1 回归守卫 | **已补**：新增单测「computeExploreMenuPosition 用实测菜单尺寸定位：长菜单底边必须留在视口内」（实测 700px 高菜单底边 ≤ 视口下沿、零尺寸回落常量） | `plugins/omnimux/src/client/sidebar-coordinator.test.js` |
| B2 断言静态证据文件（测试剧场） | **已删**：移除读取 `docs/evidence/*.json` 的两条断言，替换为两条真实行为断言（`label` 注入标签不被解析为 HTML 元素；注册项带 `entryId`/`pluginId` 不得委托到已挂载行的 click） | `tests/e2e/sidebar-explore-convergence.e2e.test.mjs` |
| B2 该 e2e 未接入 runner | **未处理，如实记录**：属仓库既有状态（该文件在本 PR 之前就未被任何 runner 引用），接入 `test:gates` 会改根 `package.json` 且超出本任务边界；本 PR 的浏览器证据由 `scripts/verify-explore-registration-browser.mjs` 自身以退出码表达（失败即 `REAL_EXIT=1`），不依赖该 e2e | — |

## Nits

| 编号 | 处理 | 落点 |
|---|---|---|
| N1 `label` 走 `innerHTML` 未转义 | **已修**：菜单项改为 DOM 构造，`label` 走 `textContent`；`iconSvg` 保持受信 HTML | `sidebar-coordinator.js` + 契约新增「文本与 HTML 边界」规则 |
| N2 契约 `updated` 未推进 | **已修**：`2026-09-25` → `2026-10-05` | `docs/contracts/sidebar-extra-entries.md` |
| N3 契约未写「同 id 二次注册移到末尾」 | **已修**：幂等规则补「覆盖后该项位于末尾；旧注销函数随即失效」 | 同上 |
| N4 契约未列 `entryId`/`pluginId` 的委托通道 | **已修（收紧实现而非补文档）**：`registerExploreItem` 只保留白名单字段 `id`/`label`/`iconSvg`/`tabId`/`action`，其余一律剥离；契约新增「字段白名单」规则 | `sidebar-coordinator.js` + 契约 |
| N5 hub 无 ready 事件 | **未处理，如实记录**：本接缝与既有 `registerWhenReady` 实践的关系属仓库级一致性话题，超出本任务边界；消费端（个人插件）采用有界轮询 | — |
| N6 证据 JSON 落盘开发机绝对路径 | **不处理**：该文件是验收证据（记录实际使用的 Chrome 与仓库路径），不是产品运行时产物；`pnpm verify:product-baseline` 已通过 | — |

## 修复后复验（同一工作树）

| 检查 | 结果 |
|---|---|
| `node --test plugins/omnimux/src/client/sidebar-coordinator.test.js` | 24 pass / 0 fail |
| `node --test tests/e2e/sidebar-explore-convergence.e2e.test.mjs` | 2 pass / 0 fail |
| `node scripts/verify-explore-registration-browser.mjs` | REAL_EXIT=0，10/10 断言 PASS（真实 Chrome，bundle 40888 B） |
| `node --test scripts/verify-anti-slop.test.mjs` | 3 pass / 0 fail |
| `pnpm check:boundaries` | PASS（3940 source files） |
| `pnpm verify:stages` | PASS（14 Stage / 8 sidebar targets） |
| `pnpm verify:product-baseline` | PASS |
