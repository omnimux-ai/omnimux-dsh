# 规范：omnimux-viewer 底座版本对齐（物化构建 + 启动预检双双通过）

Issue: [#1622](https://github.com/omnimux-ai/omnimux-dsh/issues/1622)

## 1. 目标 (Objective)

让 fork 进来的预览插件在**本仓库**能一路通过物化的三道关口（构建 → 依赖安装 → 启动预检），从而让 #1618 / #1622 的修复真正到达开发版。

前置修复（PR #1630，已合入）只解决了客户端类型增强的实例分裂。实测继续推进 `node scripts/omnimux.mjs sync` 后暴露**第二处同类缺陷**：

```
✖ [omnimux-viewer] 启动预检演练失败:
  The requested module '@deepseek-ai/dsh-attachment' does not provide an export named 'AttachmentError'
```

**根因（实测）**：插件声明的底座依赖停留在 `0.1.1-rc.2`，而宿主（产品/应用）用的是 `0.1.5-rc.2`。
插件的宿主半边在 `src/display-file.ts` 以**运行时值**引入 `AttachmentError`：

- `dsh-attachment@0.1.1-rc.2`：`import()` 失败 / 不提供该导出
- `dsh-attachment@0.1.5-rc.2`：`'AttachmentError' in m === true`

即「同一底座包两个版本」的第二处表现，与客户端 slots 的问题同源。

成功标准（可测）：

- 插件声明的每个底座依赖，与工作区已解析到的同类版本一致（凡存在 `0.1.5-rc.2` 的包一律对齐到该版本）。
- `node scripts/build.mjs` 通过；`node --test tests/*.test.ts` 保持 66 pass / 0 fail。
- `node scripts/omnimux.mjs sync` 三道关口全过（构建 / 安装 / 启动预检 `apply(ctx)` 无异常）。
- `pnpm-lock.yaml` 与本插件 `package.json` 一致。

## 2. 命令 (Commands)

```
node scripts/build.mjs
node --test tests/*.test.ts
node scripts/omnimux.mjs sync
```

## 3. 项目结构 (Project Structure)

- 改动：`plugins/omnimux-viewer/package.json`、`plugins/omnimux-viewer/src/display-file.ts`（若需去除对宿主值导出的硬依赖）、`pnpm-lock.yaml`
- 规格：`specs/omnimux-viewer-harness-version-alignment-2.spec.md`

## 4. 代码风格 (Code Style)

沿用仓库既有约定；提交信息 `type: 摘要`。

## 5. 测试策略 (Testing Strategy)

- 既有 68 项套件即回归面；构建期类型检查与物化启动预检是本任务的关键断言。
- 端到端证据：`node scripts/omnimux.mjs sync` 输出 16 个插件全部 `apply(ctx) 演练成功`。

## 6. 边界 (Boundaries)

- **总是**：本地跑构建/套件；产物不入库。
- **先问**：改其它插件的依赖；写 Dev/Prod profile 数据。
- **绝不**：改官方底座源码；绕过物化守卫；把 `lib/**` 提交进 Git。
