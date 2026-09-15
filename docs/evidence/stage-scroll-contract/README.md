# 一级页滚动收敛 · 验收证据（Issue 1977）

任务：一级页**整体滚动**，页头与动作行随页面滚走，**一级/二级 Tab 行滚到顶部后吸附不动**。
分支：`feat/omnimux-stage-sticky-nav-issue-1977`　契约：`docs/contracts/first-level-page-layout.md` §二·补

## 1. 真实浏览器实测（Chrome 内核 · 无头 · CDP 驱动）

夹具使用**仓库真源里的契约类声明**（由各插件 `styles.js` / `css.js` 抽取，并断言逐字一致），渲染「整页滚动 + Tab 到顶吸附」骨架。

| 场景 | 页头位移（滚动 300px 后） | Tab 行位移 | 判定 |
|---|---|---|---|
| 修复后 · 资产中心 | −300px（滚走） | 0px（吸附），继续滚到 900px 仍为 0px | 符合预期 ✔ |
| 修复后 · 技能/专家 | −300px（滚走） | 0px（吸附），继续滚到 900px 仍为 0px | 符合预期 ✔ |
| 反向对照（去掉吸附） | — | −220px（被滚走） | 夹具未失真 ✘ 预期行为 |

- 原始测量：`measurements.json`
- 截图：`after-scroll-assets-market.png`
- 已固化为端到端用例：`tests/e2e/stage-scroll-contract.e2e.test.mjs`
  （`node --test tests/e2e/stage-scroll-contract.e2e.test.mjs` → 1/1 通过，含反向对照）

## 2. 静态门禁与单元测试

| 检查 | 命令 | 结果 |
|---|---|---|
| 骨架契约门禁 | `node scripts/verify-stage-scroll-contract.mjs` | ✅ 5 个一级页全部合规 |
| 门禁自测（含 3 组反向对照） | `node --test scripts/verify-stage-scroll-contract.test.mjs` | ✅ 6/6 |
| UI 规范静态门禁 UI01~UI10 | `pnpm test:ui` | ✅ 0 违规（526 个视图源文件） |
| 资产库 | `pnpm --filter omnimux-assets test` | ✅ 496/496 |
| 技能/专家（客户端） | `node --test src/client/*.test.js` | ✅ 175/175 |
| 创作灵感 | `pnpm --filter omnimux-inspiration test` | ✅ 780/782（fail 0） |
| 内容发布 | `pnpm --filter omnimux-publish test` | ✅ 254/254 |
| 账号中心 | `pnpm --filter omnimux-accounts test` | ✅ 66/66 |

## 3. 证据边界（未覆盖 / 已知限制）

- **未做**：在隔离工作树内对「真实 React 一级页组件」做整页滚动实测。仓库既有的工作树 Web 验收运行器（`scripts/worktree-web-qa.mjs`）在挂载阶段用占位 div 代替真实 Stage 组件（其 `workbenchApi.open` 写入固定 HTML），无法用于页面级滚动断言；本次改以「真源契约类 + 等价骨架」的真实内核夹具取证，并在端到端用例中保留反向对照。
- **未做**：开发版（45120）真机验收 —— 按仓库合同由人工执行，Agent 不阻塞、不代签。
- **未验证**：`omnimux-market` 包 `lib/tests/host.test.js`、`lib/tests/workshop-request-guard.test.js` 两项失败为环境基线问题（`@deepseek-ai/dsh-llm` 未导出 `CallId`），与本次改动无关，本次未触碰其依赖路径。
- 桌面外壳（Electron）层无改动，不需要外壳证据。
