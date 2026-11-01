# 规格：修复 dsh-ui-kit 的 prepublishOnly 脚本路径 (Issue #3883)

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3883
- 引入缺陷：https://github.com/omnimux-ai/omnimux-dsh/pull/3858
- 状态：已确认
- 工作树：`.worktrees/uikit-prepublish-path`（分支 `agent/uikit-prepublish-path-issue-3883`）

## 1. 现象

`packages/dsh-ui-kit/package.json` 的发布钩子指向不存在的路径：

```json
"prepublishOnly": "node ../scripts/verify-publish-source.mjs ."
```

从 `packages/dsh-ui-kit` 出发，`../scripts/` = `packages/scripts/`，该目录不存在；脚本实际在仓库根 `scripts/`。

## 2. 影响链

1. `corepack pnpm build` 在 `prepublishOnly` 阶段报 `MODULE_NOT_FOUND` 并失败。
2. `scripts/sync-to-app.sh` 的 kit 构建门禁（`corepack pnpm build >/dev/null 2>&1`）因此判定失败，打印「dsh-ui-kit 构建失败，禁止物化」并 `exit 1`。
3. 每次把插件物化到开发版都必须人工加 `OMNIMUX_SKIP_KIT_BUILD=1` 绕过——而跳过门禁本身是风险（可能物化到残缺 kit）。

## 3. 用户操作旅程

1. 开发者改完插件，跑 `./scripts/sync-to-app.sh`。
2. kit 构建门禁正常通过，物化继续。
3. 不再需要 `OMNIMUX_SKIP_KIT_BUILD=1` 这类绕过手段。

## 4. 期望反馈

- `corepack pnpm build` 在 `packages/dsh-ui-kit` 下成功退出。
- `sync-to-app.sh` 不再打印「dsh-ui-kit 构建失败」。

## 5. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | `packages/dsh-ui-kit` 下 `node ../../scripts/verify-publish-source.mjs .` 能解析到脚本 | 实际执行，不报 MODULE_NOT_FOUND |
| AC-2 | 该钩子路径与插件侧约定一致（`../../scripts/`） | 源码契约测试 |
| AC-3 | 全仓 `prepublishOnly` 指向的脚本路径都真实存在 | 契约测试遍历 `packages/*` 与 `plugins/*` |

## 6. 设计

单点修正：`../scripts/` → `../../scripts/`。

插件侧同类钩子已经是正确写法（`plugins/*/package.json` 全部为 `node ../../scripts/verify-publish-source.mjs .`），本次让 `packages/` 与之一致。

## 7. 边界与降级

- 只改路径字符串，不动校验脚本本身逻辑。
- 不影响已发布的包（`prepublishOnly` 只在发布时触发）。
- 若未来 `packages/` 下新增其它包，同样适用 `../../scripts/`。

## 8. 新用户基线

无关（构建期钩子）。新用户安装已发布的包不受影响。

## 9. 非目标

- 不改 `scripts/verify-publish-source.mjs` 的校验逻辑。
- 不改其它包或其它 npm script。

## 旧标准变更

无。本任务不修改任何既有测试。

## 假设

1. `prepublishOnly` 只在 `npm publish` / `pnpm publish` 时触发，修正路径不会改变构建产物。
2. 仓库根 `scripts/verify-publish-source.mjs` 是该钩子唯一正确的目标（插件侧已如此引用）。
3. `packages/` 与 `plugins/` 两种目录深度相同，故 `../../scripts/` 对两者都成立。

## 证伪方式

1. 若修正后 `corepack pnpm build` 在其它阶段出现新的失败，则假设 1 错 → 需分别记录 prepublishOnly 与构建本身的输出。
2. 若全仓存在第三种目录深度引用同一脚本，则假设 3 错 → 契约测试会列出该路径，按实际深度修正。
3. 可执行验证：
   - `cd packages/dsh-ui-kit && node ../../scripts/verify-publish-source.mjs .`（应输出校验结论而非 MODULE_NOT_FOUND）
   - `node --test tests/e2e/uikit-prepublish-path.e2e.test.mjs`
