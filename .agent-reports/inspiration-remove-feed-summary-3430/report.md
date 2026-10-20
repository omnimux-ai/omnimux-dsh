# #3430 移除账号监控浏览说明行 · 交付证据

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3430
- 基线：`0abb16c33345214474655ba850b38c2e155ae426`
- 任务工作树：`.worktrees/inspiration-remove-feed-summary-issue-3430`

## 改动

- `RivalAccountsPanel.jsx`：删除有作品时渲染的 `[data-rival-summary]` 行（说明 + 计数）。
- `rival-styles.js`：删除 `.omnimux-rival-summary` / `.omnimux-rival-summary-count`。
- `locales.js`：删除仅该行消费的 `rivalFeed.summary` / `rivalFeed.count`（中英）。
- 渲染门禁：有作品与空态都断言摘要行/旧文案不存在；page 级 e2e 增加同样断言。

## 真实浏览器证据（隔离工作树）

- 真实 `RivalAccountsPanel` + 合成 2 卡 feed，esbuild 打包，仅 `dsh-ui-kit` 使用测试装置 shim；本地 `localhost` 动态端口 52698，ego-browser 真实 Chromium 渲染。
- 断言结果：`rootPresent=true`；`[data-rival-summary]` 不存在；`.omnimux-rival-summary` 不存在；文本不含「正在浏览：」；卡片 2 张；首卡封面 `naturalWidth=360`。
- 截图：`browser-panel-3430.png`；结构化事实：`browser-facts.json`。
- ego 任务空间 115 已 `finish`（closed）。

## 离线检查（工作树直接 node 执行）

| 检查 | 实际结果 |
| --- | --- |
| 插件核心套件 `node --import ./scripts/deny-network.mjs --test src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js` | 1640 项，1640 通过，0 失败，0 skip，0 外连 |
| 受影响渲染门禁 + page e2e | 33 项，33 通过 |
| `node scripts/verify-stage-contracts.mjs` | PASS（14 Stage / 8 sidebar） |
| `node --test scripts/verify-anti-slop.test.mjs` | 3/3 通过 |
| `node scripts/scan-ui-gates.mjs` | 退出 1；与 main 同为 8 条既有违规（UI01/UI02/UI10，均在本次改动之外），inspiration 0 条 |
| `node scripts/build-client.mjs` | 成功，`lib/client.js` 2,372,237 bytes（gitignored） |
| `node scripts/impact-matrix.mjs --git-diff --base origin/main` | `isUiChange=true`、`browser.required=true` |

## 边界

不涉及数据、排序、筛选、卡片形态、其他 Tab；`feed.total` 仍由 Host 返回但不再有 UI 消费方；旧设计稿中的副标题行属于历史记录，不回写，由任务 spec 声明其被移除。
