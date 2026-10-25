# Spec: 把「声明指向已删包」的检查补到全部装配面（Issue #3737）

## 1. 目标与用户结果

#3725 引入的 `scripts/verify-dsh-declaration-range.mjs` 只扫两处（`dsh.client.inject` 与 esbuild external），且把"已删包"写死成一个包名。结果是 `plugins/omnimux-viewer` 的 **devDependency** 与**源码类型导入**指向已删包却一路绿灯——这正是 #3733 要收拾的残留。本任务把扫描面补齐，并加一个可选的"底座清单差集"，让下次底座删包时自动报警。

## 2. 事实与证据

| 事实 | 证据 |
| --- | --- |
| 现有门禁只扫两处 | `scripts/verify-dsh-declaration-range.mjs`（#3725 版）只有 inject 与 build-client external 两段 |
| 因此漏掉 viewer | 补扫后立刻抓到 4 条：`plugins/omnimux-viewer/package.json` devDependencies、`src/client/card-model.ts`、`src/client/index.ts`、`tests/card-model.test.ts` |
| `verify:plugin-load` 不覆盖这个面 | 它读 bundle 导出的 cordis `inject`（服务名）并打桩，不读 `package.json` 的 `dsh.client.inject` |
| rc.3 里这类残留是惰性的 | `dsh-client-modules`：host 侧原样拷进行（`lib/index.js:743`），客户端加载器 `graphRows.get(packageName)` 取不到就跳过（`lib/client.js:788-791`）→ 所以更需要门禁兜住 |

## 3. 改动

- `scripts/verify-dsh-declaration-range.mjs`：把单包名常量换成登记表 `REMOVED_PACKAGES`（含 `since` 出处）；扫描面扩到 inject / esbuild external / dependencies·devDependencies·peerDependencies / `src|tests|scripts` 源码；新增可选 `OMNIMUX_VENDOR_MANIFEST`（或参数）差集；核心逻辑导出为 `collectFailures(root, options)` 以便测试。
- `scripts/verify-dsh-declaration-range.test.mjs`（新增）：7 个用例覆盖四种扫描面、清单命中/未命中/缺失、以及真实仓库当前状态。
- `package.json` 的 `test:gates` 挂上该测试。

## 4. 假设

- viewer 的 devDependency 与类型导入是唯一现存的"已删包残留"（补扫后只报出这 4 条）。
- 底座清单差集只在本地/壳仓有 manifest 时运行；CI 无 manifest 时必须显式 skip，不得静默通过。

## 5. 证伪方式

- 若补扫后仍漏掉别的残留：在壳仓 `vendor/dsh-runtime/<pin>/manifest.json` 上用 `OMNIMUX_VENDOR_MANIFEST` 跑一次，未在清单里的引用名会被列出。
- 若差集在 CI 上变成假通过：检查输出是否打印 `⏭ … 未设置 OMNIMUX_VENDOR_MANIFEST`；缺 manifest 时 `manifestStatus` 必须是 `missing`/`skipped` 而不是 `checked`。
- 若扫描面误报：干净骨架用例（fixture 不引用已删包）必须 0 失败。

## 6. 验证

1. `node --test scripts/verify-dsh-declaration-range.test.mjs`：fixture 用例全绿；**"真实仓库当前通过"用例在 #3733 落地前是红的**——这正是本门禁要抓的东西，故本任务与 #3733 同批合入。
2. `node scripts/verify-dsh-declaration-range.mjs`：当前退出码 1（列出 viewer 的 4 条）。
3. `pnpm test:gates`：接线后随 #3733 一起转绿。

## 7. 非目标与依赖

- 不修 viewer 本身（属 #3733）；不改 peer 范围检查；不联网。
- 本任务的合入依赖 #3733：门禁会红，直到 viewer 的 devDependency 与类型导入清理干净。

## 8. 实施记录（2026-10-25）

原实现留下的三处问题已修，并把清单差集从"摆设"变成能报真问题：

| 问题 | 现象 | 修法 |
| --- | --- | --- |
| 同一处引用报两遍 | `scripts/build-client.mjs` 同时被"external 专用面"与"通用源码面"扫到，单处违规产出 2 条 | 通用源码面跳过 `scripts/build-client.mjs`（专用面更精确）；external 命中的名字仍进清单差集 |
| 清单差集误报第三方依赖 | 对真实清单跑一次，报 `@deepseek-ai/cordis`、`@deepseek-ai/schemastery` 不在清单内 | 差集只看 `@deepseek-ai/dsh-*`（清单是 `vendor/dsh-runtime` 的 tarball 集合，不含随底座安装的 cordis/schemastery） |
| 注释算引用 | market 三处说明性注释里提到旧包名即判失败，真问题会被淹 | 判定前先剥掉行注释与块注释 |

**清单差集抓到的第一个真问题**：`plugins/omnimux-automation/scripts/register-dsh-stubs.mjs` 仍登记 `@deepseek-ai/dsh-agent-presets`（复数）。实测 npm：复数包 0.2.1 系列**不存在**（latest 仅 `0.0.1-rc.1`），rc.3 提供的是单数 `@deepseek-ai/dsh-agent-preset` 与 `@deepseek-ai/dsh-agent-preset-registry`；仓内没有任何代码 import 复数包，属死条目。已从 stub 集合移除，`omnimux-automation` 测试 132/132 通过。

**验证（本机，2026-10-25）**：`node --test scripts/verify-dsh-declaration-range.test.mjs` 7/7；不带清单 → 显式 skip 且 exit 0；带真实清单（`vendor/dsh-runtime/0.2.1-rc.3/manifest.json`）→ 48 个 dsh-* 引用名全部在清单内、exit 0；`pnpm --filter omnimux-automation test` 132/132；`pnpm test:gates` 见提交时的实测输出。

## 9. 独立审查整改（2026-10-25）

| 缺陷 | 整改 |
| --- | --- |
| **阻断 A**：预发布陷阱 canary（单分支 `>=0.1.5-rc.3 <0.3.0-0` 必须判为不满足 `0.2.1-rc.3`）在重写中被删，文件头却仍宣称它在 | 已恢复该 canary；`grep -c "semver 语义异常"` = 1 |
| B：`packages/*/scripts/build-client.mjs` 落在两个扫描面之间（源码面无条件跳过、external 面只扫 `plugins/`） | 新增 `buildClientFiles()` 同时覆盖 `plugins/` 与 `packages/`，源码面按实际文件集合跳过；fixture 实测 `packages/demo-kit/scripts/build-client.mjs` 里的已删包现在会被报出 |
| D：external 面 `readdirSync(join(root,'plugins'))` 无 `existsSync` 保护，合成 fixture 会 ENOENT | 随 B 一并修掉（统一走 `buildClientFiles()` 的守卫） |
| E：`manifestChecked === 0` 时会打印「✅ 0 个引用名全部在清单内」，存在真空通过路径 | 改为独立提示「一个 dsh-* 引用名都没收集到——检查收集面是否失效」 |

**F（设计事实，已写进流程）**：全仓没有任何地方设置 `OMNIMUX_VENDOR_MANIFEST`，所以清单差集在 CI 里**永远 skipped**——「下次底座删包自动报警」只在升级时手动跑才生效。已在 `.agents/skills/omnimux-rc-upgrade/SKILL.md` 的契约核查第 1 条里显式挂上这一步（含为什么 CI 跑不了、覆盖范围只到 `@deepseek-ai/dsh-*`）。

**复审仍留的观察（不阻塞）**：剥注释对「字符串里未闭合的 `/*`」或「同一行字符串里的 `//`」有理论假阴性（当前仓无实际损失）；`scripts/governance-manifest.json` 的排序搬动属噪声（registry 自己会 sort）。
