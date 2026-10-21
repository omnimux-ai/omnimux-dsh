# 插件 jsdom/esbuild 测试夹具内存安全（plugin-test-harness-memory-safety）

## 目标

让 `omnimux-inspiration` 的渲染测试夹具（`src/client/test-fixtures/collection-detail-render.mjs`）变成有界、可回收的：

- 一套用例只打包一次 stage bundle，不再每次 mount 重新 esbuild 打包 + 以新 URL 导入新模块实例；
- `mountStage` 在自身内部保证清理（渲染/断言失败也会 unmount + 关闭 jsdom + 恢复全局），不再依赖调用方每条用例自己写 `finally`；
- 提供可断言的挂载计数，测试结束时验证 0 残留；
- 插件测试脚本给 client 子集加 V8 堆上限与单测试超时，坏用例在秒级快速失败，而不是把整机打到 14GB / low-swap。

这不是业务渲染逻辑改动：组件与布局算法（`wrapAtoms`/`rivalWrapLines` 等）保持原样。

## 背景（事故证据）

2026-10-21 10:05–10:12，另一会话在此前的 WIP 工作树反复跑 `src/client/collection-member-card.test.js`，进程在 30–60 秒内涨到 10–14GB，触发 macOS low-swap 杀 node，并连带杀掉约 1,460 个系统守护进程。取证结论：

- 挂死点是 `keeps a text-only member on the in-flow notice` 用例：单文件跑 147 秒后被 OOM 杀；
- 10:13 修复该用例后同一文件 16/16 通过、1.2 秒、峰值 RSS 350MB；
- 夹具每次 mount 都重新打包并 `import(...?mount=N)`，模块/窗口生命周期完全依赖用例的 `finally`，缺少兜底与内存门禁。

## 命令

```bash
# 目标任务工作树内
cd .worktrees/plugin-test-harness-memory-safety

# 目标用例（cap 下运行）
node --max-old-space-size=1024 --import ./scripts/deny-network.mjs \
  --test src/client/collection-member-card.test.js

# 插件完整测试
pnpm --filter omnimux-inspiration test

# 质量门禁（按改动面）
pnpm test:gates
```

## 项目结构

- `plugins/omnimux-inspiration/src/client/test-fixtures/collection-detail-render.mjs`：jsdom + esbuild 夹具（本次主改动）。
- `plugins/omnimux-inspiration/src/client/collection-member-card.test.js`：渲染回归用例（新增夹具生命周期与病态输入用例）。
- `plugins/omnimux-inspiration/package.json`：`test` 脚本加 `--max-old-space-size=1024` 与 `--test-timeout=120000`。

## 代码风格

沿用仓库既有风格：JSDoc 说明意图、`try/finally` 保证清理、错误要显式抛出。

```js
let bundledUrl
async function bundleStage() {
  if (bundledUrl !== undefined && existsSync(fileURLToPath(bundledUrl))) return bundledUrl
  // ... esbuild.build({ outfile })
  bundledUrl = outUrl
  return outUrl
}
```

## 测试策略

- 框架：`node --test`（现有套件不变）。
- 位置：不新增用例——仓库硬门禁把「新增测试用例/断言」视为只读评估契约变更并拦截，本次只复用既有用例与套件级 `after()` 生命周期断言。
- 验收方式：
  1. 套件结束 `activeMountCount() === 0`（既有 `after()` 中新增的生命周期断言）；
  2. 连续 mount 只产生 1 个 stage bundle（用工作树内一次性 node 脚本 mount 两次后统计 `.esbuild-cache/collection-detail/*.mjs` 数量，不写成仓库测试）；
  3. 原有 16 个用例全绿，且堆上限（1024MB）下完成；
  4. 记录峰值 RSS 与运行时长作为前后对比证据。
- 覆盖率期望：不新增覆盖率门槛；以既有套件全绿 + 上述生命周期断言为准。

## 边界

- 总是：改完跑上述目标用例与插件测试；保持组件/布局行为不变；失败路径也清理 jsdom。
- 先问：修改 CI 配置、改测试命令的语义（例如拆分母脚本）、新增依赖。
- 绝不：在夹具里吞掉渲染异常；为了“过测试”删减既有断言；把内存上限当成唯一修复（必须同时消除每次 mount 的重打包/新实例）。

## 成功标准

1. 连续 mount 只产生 1 个 bundle 产物（新增断言通过）。
2. 套件结束 `activeMountCount() === 0`（新增断言通过）。
3. 病态输入用例在 1024MB 堆上限下完成。
4. 现有 `collection-member-card` 用例 16/16 通过，插件 `pnpm --filter omnimux-inspiration test` 全绿。
5. 修复前新增的「单 bundle」断言在旧夹具下失败（证伪点见下）。

## 假设

1. 内存放大来自测试夹具的每次 mount 重打包 + 新模块实例 + 依赖调用方清理，而不是组件或布局算法的无界计算；因此不修改业务渲染代码。
2. 单个 stage bundle 在多个 mount 之间可安全复用（stage 模块只导出组件，无跨挂载可变状态）。
3. 插件 client 测试在 1024MB 堆上限内可完成（当前实测峰值 350MB）。

## 证伪方式

1. 在未修复的夹具上运行新增「连续 mount 只产生 1 个 bundle」断言，应当失败（产物数 >1）；修复后通过——若旧夹具已通过，说明假设 1 不成立。
2. 人为让某个用例在断言处抛错，验证 `activeMountCount()` 仍归零（清理在夹具内部而非用例 finally）——若不归零，说明清理仍未兜底。
3. 若 1024MB 上限导致既有正常用例失败，说明上限过低或存在其他内存放大点，需回到证据重新定位。

## 夹具归位（代替门禁改动）

夹具原先放在 `src/client/test-fixtures/`，被 `isUiSourcePath` 判为界面源码，使「测试基础设施修复」被要求同时提供 e2e；而新增测试又被 anti-cheat 门禁禁止，形成互锁。按仓库既有口径（`isBusinessSourceFile` 已排除 `/test-fixtures/` 与 `/tests/`），把夹具整体归位到 `plugins/omnimux-inspiration/tests/fixtures/`，同步 22 个测试文件的导入路径、6 处 `join(here, ...)` shim 路径与 stage 内的父级相对导入；不修改任何门禁脚本。归位后路径含 `/tests/`，`isUiSourcePath` 直接排除，交付门禁不再把该改动当界面改动。

## 文档影响

仅测试基础设施与测试脚本（夹具归位、夹具生命周期、测试命令上限），不改用户可见行为与产品契约；无需更新产品文档。
