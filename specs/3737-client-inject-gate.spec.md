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
