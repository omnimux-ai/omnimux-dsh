# 规范：omnimux-viewer 的 harness 依赖版本对齐与物化可构建性

Issue: [#1622](https://github.com/omnimux-ai/omnimux-dsh/issues/1622)

## 1. 目标 (Objective)

让 fork 进来的预览插件在**本仓库**里可以被构建与物化，从而让 #1618（侧栏宽度自反馈）与 #1622（`read_image` 槽位冲突）的修复真正到达开发版。

实测阻塞（`node scripts/omnimux.mjs sync` 的构建阶段确定性失败）：

```
src/client/index.ts(146,40): error TS2345: '"tool.viewer"' is not assignable to '"common" | "settings.locale"'
src/client/index.ts(160,7):  error TS2769: No overload matches this call
```

**根因（已证明，非推测）**：同一 harness 包在依赖树里存在两个实例——
本插件自身解析到 `@deepseek-ai/dsh-client-ui-slots@0.1.1-rc.2`，而工作区/宿主侧使用 `0.1.5-rc.2`。
插件的客户端半边用模块增强（`declare module '@deepseek-ai/dsh-client-ui-slots'`）注册 `LocaleNamespaceMap['tool.viewer']`，
而 pnpm 为不同 peer 组合生成两份物理副本，增强只落在其中一份上，故另一份看不到 `tool.viewer`。

判定性实验：仅把插件内该包的链接指向宿主用的那份实例后，`tsc -p tsconfig.client.json` 立即 exit=0。

成功标准（可测）：

- 插件声明的 client 侧 harness 依赖与宿主实际使用的版本一致；插件目录下该包只解析到一个实例。
- `node scripts/build.mjs`（含声明产物 emit）通过；客户端产物纯度门保持只含 `react` / `react/jsx-runtime`。
- `node --test tests/*.test.ts` 全绿（既有 66 pass / 0 fail 不回退）。
- `pnpm-lock.yaml` 补齐该插件的 importer 条目（此前缺失）。
- `node scripts/omnimux.mjs sync` 不再在构建阶段失败。

## 2. 命令 (Commands)

```
# 在 plugins/omnimux-viewer 内
node scripts/build.mjs
node --test tests/*.test.ts

# 仓库级
pnpm install                 # 同步 lockfile importer
node scripts/omnimux.mjs sync
```

## 3. 项目结构 (Project Structure)

- 改动：`plugins/omnimux-viewer/package.json`（依赖版本）、`plugins/omnimux-viewer/src/client/index.ts`（补类型引入）、`pnpm-lock.yaml`
- 规格：`specs/omnimux-viewer-harness-version-alignment.spec.md`

## 4. 代码风格 (Code Style)

沿用仓库既有约定：JS/TS 源码用英文标识符与注释；提交信息 `type: 摘要`。

## 5. 测试策略 (Testing Strategy)

- 不新增测试：本次是依赖解析与类型可见性修复，行为由既有 68 项套件覆盖（构建期类型检查是关键断言）。
- 回归证据：`node scripts/build.mjs` 通过 + `node --test tests/*.test.ts` 66 pass / 0 fail。

## 6. 边界 (Boundaries)

- **总是**：本地跑构建与套件；保持产物不入库（`check-tracked-artifacts` 硬门禁）。
- **先问**：改动其它插件的依赖版本；动 Dev/Prod 的 profile 数据。
- **绝不**：把 `lib/**` 提交进 Git；改官方 harness 源码；绕过物化守卫。
