# Spec: 产品基线界面整改（第三步）

**Issue:** #2129（第一步 3ea7718236 已合入；第二步 PR #2135 在飞）｜ **模块:** `omnimux-browser`（扩展面板）/ `omnimux`（客户端预设）｜ **优先级:** P0

## 1. 问题与目标

产品基线门禁登记的最后 4 处存量全部落在界面代码上。用户已看过改前 / 改后演示并拍板：**以新用户为准**。

目标：新用户打开浏览器插件时，默认推荐并连上的是他真正在用的正式版应用；创意预设卡片不再产生指向开发机素材库的地址。

## 2. 范围

| # | 位置 | 现状 | 整改 |
|---|---|---|---|
| 1 | `extension/src/panel/components/DshInstanceSelector.tsx` | 预设 3 个实例，首个 `omnimux-dev`（45120）标 `isRecommended` | 撤掉开发版条目；`omnimux-prd`（43128）设为推荐 |
| 2 | `extension/src/panel/components/WorkspaceSelector.tsx` | 同一份预设，且 `omnimux-dev` 带 `defaultPath: '~/Desktop/Project/dsh-plugin/product/omnimux-dsh'` | 同上；删除开发机 `defaultPath` |
| 3 | 同文件的默认端口回落（`targetPort = 45120`、`loadSavedPort` 回落 45120） | 未保存端口时默认试开发版端口 | 回落改为正式版端口 43128 |
| 4 | `plugins/omnimux/src/client/presets/media-resolver.js` | 相对路径回落到开发机素材库根目录 | 只认显式配置的 `window.__OMNIMUX_CONFIG__.presetAssetRoot`；未配置返回空串 |

**不改**：实例发现的候选端口集合（`DISCOVERY_PORTS`，含开发版 45120）——按产品基线合同属于「允许的本机用法（本机实例发现）」，且对只有正式版的新用户无影响。

## 3. 验收用例

| # | 场景 | 操作 | 预期 |
|---|---|---|---|
| 1 | 新用户首次打开面板 | 无任何已保存端口 | 默认端口为正式版 43128；实例列表只出现正式版与 DSH Desktop，推荐位在正式版 |
| 2 | 列表内容 | 检查预设项 | 不含 `omnimux-dev`；任何条目都不含开发机绝对路径或 `~/Desktop/Project` |
| 3 | 开发者仍可用 | 面板手动填 45120 或自动发现 | 仍能连上开发版（发现端口集合未变） |
| 4 | 预设卡片默认态 | 未配置 `presetAssetRoot` | `resolveMediaUrl` 返回空串，卡片不渲染失效预览地址 |
| 5 | 预设卡片配置态 | 显式配置 `presetAssetRoot` | 返回 omnimux-workflow 本地文件流地址（既有行为） |
| 6 | 端到端 | 见 e2e 用例 | 见下 |

## 4. 验证

- 单元 / 组件测试：扩展 `vitest` 套件（含更新既有 `dsh-instance-selector.spec.ts` 中对「3 个实例 + 开发版推荐」的旧断言）；`plugins/omnimux/src/client/presets/media-resolver.test.js`。
- 端到端测试（仓门禁要求，界面改动必须同时带）：`plugins/omnimux-browser/extension/tests/e2e/instance-presets.e2e.spec.ts` 与 `plugins/omnimux/tests/e2e/preset-media-new-user.e2e.test.mjs`。
- 真实浏览器验收：在本任务的隔离工作树内，用扩展 harness 页面渲染面板实例列表并截图（`docs/evidence/`），补齐结构化报告。
- `node scripts/verify-product-baseline.mjs` 绿，且 `scripts/product-baseline-allowlist.json` 中 4 条存量豁免**全部删除**（否则报僵尸豁免）。

## 5. 边界

- **总是**：先演示后合入（已完成演示与拍板）；只调整默认与推荐，不删除「连接本机其他实例」的能力。
- **绝不**：为了让门禁变绿而保留无理由豁免；不得把开发版能力整体删除（开发版仍可被自动发现或手动填写）。
