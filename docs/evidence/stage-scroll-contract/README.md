# 一级页滚动收敛 · 验收证据（Issue 1977）

任务：所有一级页向上滚动时，页头与一级/二级 Tab 固定在顶部，只有内容数据区滚动。
分支：`feat/omnimux-stage-sticky-nav-issue-1977`　契约：`docs/contracts/first-level-page-layout.md` §二·补

## 1. 真实浏览器实测（Chrome 内核 · 无头 · CDP 驱动）

夹具使用**仓库真源里的契约类声明**（由各插件 `styles.js` / `css.js` 抽取，并断言逐字一致），渲染「固定栈 + 唯一滚动区」骨架，滚动内容区 220px 后测量固定栈在视口内的位移。

| 场景 | 内容滚动量 | 固定栈位移 | 判定 |
|---|---|---|---|
| 修复后 · 资产中心 | 220px | **0px** | 导航固定 ✔ |
| 修复后 · 技能/专家 | 220px | **0px** | 导航固定 ✔ |
| 反向对照（旧行为：固定栈放进滚动区）· 资产中心 | 220px | **−220px** | 导航被滚走 ✘（证明夹具未失真） |
| 反向对照 · 技能/专家 | 220px | **−220px** | 导航被滚走 ✘ |

- 原始测量：`measurements.json`
- 截图：`after-scroll-assets-market.png`（修复后）、`before-scroll-negative-control.png`（反向对照）
- 该验证已固化为端到端用例：`tests/e2e/stage-scroll-contract.e2e.test.mjs`（`node --test tests/e2e/stage-scroll-contract.e2e.test.mjs` → 1/1 通过）

## 2. 静态门禁与单元测试

| 检查 | 命令 | 结果 |
|---|---|---|
| 骨架契约门禁 | `node scripts/verify-stage-scroll-contract.mjs` | ✅ 5 个一级页全部合规 |
| 门禁自测（含 3 组反向对照） | `node --test scripts/verify-stage-scroll-contract.test.mjs` | ✅ 6/6 |
| UI 规范静态门禁 UI01~UI10 | `pnpm test:ui` | ✅ 0 违规（526 个视图源文件） |
| 资产库 | `pnpm --filter omnimux-assets test` | ✅ 496/496 |
| 技能/专家（客户端） | `node --test src/client/*.test.js` | ✅ 175/175 |
| 创作灵感 | `pnpm --filter omnimux-inspiration test` | ✅ 780/782（2 项为既有跳过项，fail 0） |
| 内容发布 | `pnpm --filter omnimux-publish test` | ✅ 254/254 |
| 商品库 | `pnpm --filter omnimux-products test` | ✅ 453/453 |
| 账号中心 | `pnpm --filter omnimux-accounts test` | ✅ 66/66 |

## 3. 证据边界（未覆盖 / 已知限制）

- **未做**：在隔离工作树内对「真实 React 一级页组件」做整页浏览器实测。仓库既有的工作树 Web 验收运行器（`scripts/worktree-web-qa.mjs`）在挂载阶段用占位 div 代替真实 Stage 组件（其 `workbenchApi.open` 写入固定 HTML），因此无法用于页面级滚动断言；本次改以「真源契约类 + 等价骨架」的真实内核夹具取证，并在端到端用例中保留反向对照。
- **未做**：开发版（45120）真机验收 —— 按仓库合同由人工执行，Agent 不阻塞、不代签。
- **未验证**：`omnimux-market` 包 `lib/tests/host.test.js`、`lib/tests/workshop-request-guard.test.js` 两项失败为环境基线问题（`@deepseek-ai/dsh-llm` 未导出 `CallId`），与本次改动无关，本次未触碰其依赖路径。
- 桌面外壳（Electron）层无改动，不需要外壳证据。
