# Spec: 删除 omnimux-browser 的 invariants companion 与死声明（0.2.x 已整体移除）

- Issue: #3667（R2，单插件 `omnimux-browser`）
- 来源：#3658 清点报告 §4.2/§4.3
- 依赖批次：#3652；本改动只删无运行时行为的空 companion，不依赖 pin 切换先后

## 目标

DSH `0.2.1-rc.3` 移除了 `invariants` 服务与 `@deepseek-ai/dsh-invariants` 包（344 个运行时包 0 命中）。`omnimux-browser` 仍带着一个包级 invariant companion：它的 `install` 是空实现（无断言、无状态），只用于在旧宿主上「认领包所有权」。新宿主下该 companion 因服务缺失无法装载，peer 指向已不存在的包。本任务把这个空 companion、它的构建入口、测试 setup 与死 peer 一起清掉。

## 范围

- 删除 `plugins/omnimux-browser/src/invariant.ts`（空 installer）。
- 删除 `plugins/omnimux-browser/tests/setup-invariant.ts`（只为执行该 companion 而存在）。
- `vitest.config.ts`：去掉 `setupFiles`。
- `tsdown.config.ts`：entry 从 3 个减到 2 个，注释同步（不再声称三个运行时入口）。
- `package.json`：去掉 `exports['./invariant']`、`files` 里的 `lib/invariant.js`、peer `@deepseek-ai/dsh-invariants`。
- `pnpm-lock.yaml`：同步被删 peer 的 importer 记录。
- 不改 bridge 运行时行为、协议、扩展代码；不改其他插件。

## 假设

1. 该 companion 的 `install` 为空函数，唯一作用是向旧宿主的 `invariants` 服务登记包名，不产生任何运行时断言或状态；删除后 bridge 的连接注册表、待处理工具表与协议行为不变。
2. 本仓与桌面壳仓库都没有消费 `omnimux-browser/invariant` 子路径（本仓仅自引用：`tsdown.config.ts`、`package.json`、`tests/setup-invariant.ts`；壳仓库 0 命中）。
3. 宿主 SDK 的 invariant 覆盖脚本按包枚举 companion，包没有 companion 只是没有条目，不会因此报错。
4. `tests/setup-invariant.ts` 不被任何 spec 断言依赖，去掉后 `tests/**/*.spec.ts` 仍能独立运行。

## 证伪方式

1. 若 `pnpm --filter omnimux-browser build:server` 失败（tsdown 仍指向已删 entry、tsc 找不到文件），按报错修正配置；仍失败则说明 companion 与构建强耦合，改为保留空文件并只删死 peer。
2. 若 `npx vitest run`（browser 包）在去掉 setupFiles 后失败，检查是否有 spec 依赖该 setup 的副作用；有则恢复 setup 并改为不导入已删模块。
3. 若 `pnpm install --lockfile-only --offline` 因删除 peer 需要重新解析而失败，说明 lock 不能离线收敛，记录阻断并改为等 pin 切换时随 lock 一起处理。
4. 若 grep 发现真实消费方（非自引用）导入该子路径或 `dsh-invariants`，停止删除，改为只删 peer 并把消费方列入残留。

## 验收

1. `rg "@deepseek-ai/dsh-invariants|\./invariant" plugins/omnimux-browser` 0 命中（README/CHANGELOG 历史文本除外）。
2. `pnpm --filter omnimux-browser build:server` 通过；产物不再包含 `lib/invariant.js`。
3. browser 包 vitest 套件通过（与改动前同一通过集合）。
4. `pnpm-lock.yaml` 不再为 `plugins/omnimux-browser` 解析 `@deepseek-ai/dsh-invariants`。
5. 无 bridge 运行时行为改动；风险按实际 diff 复核。

## 风险

R2。删除的是空 installer 与死声明；失败模式是构建配置遗漏（由验收 2 覆盖）。若假设 1 不成立（旧宿主上 companion 实际承担所有权登记），影响限于旧宿主的 invariant 覆盖统计，不改变 bridge 功能。

## 旧标准变更

- `plugins/omnimux-browser/tests/setup-invariant.ts` :: `*`
  - 理由：该文件不是用例文件（无 `test`/`it` 与断言），只为在 vitest 启动时执行已删除的空 invariant companion；删除后 vitest 仍运行同一批 spec。
  - 新期望与证据：`npx vitest run` 的通过集合与改动前一致——338 通过 / 6 跳过；失败仅 `composition.spec.ts`、`session-purge.spec.ts` 两文件，原因是 `@deepseek-ai/dsh-session` / `@deepseek-ai/cordis-plugin-loader` 在本仓（含 `origin/main`）从未声明，属预存在环境缺口。

