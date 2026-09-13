# 规范：物化启动预检的宿主包替身需覆盖插件实际使用的具名导出

Issue: [#1622](https://github.com/omnimux-ai/omnimux-dsh/issues/1622)

## 1. 目标 (Objective)

物化预检 `scripts/verify-profile-preflight.mjs` 在 Profile 里解析不到 `@deepseek-ai/*` 宿主包时，会把它们重定向到一个**最小替身模块**（`HOST_PACKAGE_STUB_SOURCE`）。该替身是静态 ESM，具名导出必须预先声明；当前只提供 `defineTool` / `Schema` / `createUserMessage` / `dshHomePath` / `dshProfilePath`。

fork 进来的预览插件在宿主半边使用了替身未声明的具名导出，于是预检在第一处就抛错，物化被阻断：

```
✖ [omnimux-viewer] 启动预检演练失败:
  The requested module '@deepseek-ai/dsh-attachment' does not provide an export named 'AttachmentError'
❌ [Pre-flight] 物化演练预检失败: 发现 1 个异常！已阻断提交并触发回滚
  （其中 12 次宿主包解析使用最小替身（仅保签名））
```

实测插件宿主半边共用到替身缺失的 5 个具名导出：

| 宿主包 | 缺失导出 | 用途 |
| --- | --- | --- |
| `@deepseek-ai/dsh-attachment` | `AttachmentError` | 附件错误判别（`instanceof`） |
| `@deepseek-ai/dsh-attachment` | `AttachmentId` | 附件标识构造（真实值调用） |
| `@deepseek-ai/dsh-fs` | `FsError` | 文件系统错误判别 |
| `@deepseek-ai/dsh-sandbox` | `canonicalPath` | 路径规范化 |
| `@deepseek-ai/dsh-settings` | `installSettingsSection` | 设置座席注册 |
| `@deepseek-ai/dsh-settings` | `settingsNamespace` | 设置命名空间 |

注意：这不是插件版本问题。替身只在**解析不到**时介入，与插件自身 `node_modules` 里的版本无关。

成功标准（可测）：

- 替身模块声明上述 5 个具名导出，保持「只保签名、不做真实行为」的定位。
- 新增回归用例：插件导入这 5 个导出时，预检 `apply(ctx)` 演练放行并如实标注替身次数。
- `node --test scripts/verify-profile-preflight.test.mjs` 全绿；`pnpm test:gates` 全绿。
- 物化 `node scripts/omnimux.mjs sync` 的启动预检不再因缺导出失败。

## 2. 命令 (Commands)

```
node --test scripts/verify-profile-preflight.test.mjs
pnpm test:gates
node scripts/omnimux.mjs sync
```

## 3. 项目结构 (Project Structure)

- 改动：`scripts/verify-profile-preflight.mjs`（替身源码）、`scripts/verify-profile-preflight.test.mjs`（回归用例）
- 规格：`specs/preflight-host-stub-exports.spec.md`

## 4. 代码风格 (Code Style)

替身源码以字符串数组逐行书写，沿用既有缩进与「只保签名」注释风格；测试用例沿用 `makeProfile` / `runPreflight`。

## 5. 测试策略 (Testing Strategy)

- 新增一个 fixture 插件，import 上述 5 个导出并在 `apply(ctx)` 中轻量使用它们（构造错误、调用函数），断言预检退出码 0 且输出含替身标注。
- 既有用例保持通过。

## 6. 边界 (Boundaries)

- **总是**：把替身限定为「签名占位」，不实现真实业务行为。
- **先问**：改变预检的通过/失败判据；改动其它门禁脚本。
- **绝不**：因缺失导出而放宽断言、跳过插件、或把替身变成真实依赖。
