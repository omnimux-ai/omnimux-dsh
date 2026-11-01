# 规格：修复 dsh-ui-kit 构建产物漂移导致物化被拦 (Issue #3887)

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3887
- 前置：https://github.com/omnimux-ai/omnimux-dsh/issues/3883（`prepublishOnly` 路径）
- 状态：已确认
- 工作树：`.worktrees/uikit-build-drift`（分支 `agent/uikit-build-drift-issue-3887`）

## 1. 现象

`scripts/sync-to-app.sh` 的完整物化流程：

1. 第 209 行 `assert_omnimux_sync_main` 检查工作区干净
2. 第 377 行 `corepack pnpm build` 构建 `packages/dsh-ui-kit`
3. 构建**改写了被 git 跟踪的 `lib/` 产物**（4 个文件）
4. 下次运行第 209 行检查时看到这 4 个改动 → 拒绝物化

结果：**只要不跳过 kit 构建，物化永远无法完成**，形成自我污染循环。

## 2. 已完成的根因诊断

| 事实 | 证据 |
| --- | --- |
| `lib/` 被 git 跟踪 | `git ls-files packages/dsh-ui-kit/lib/` 返回 4 个文件 |
| 多个插件硬编码依赖它 | `omnimux-video-preview`、`omnimux-viewer`、`omnimux-device`、`omnimux-workflow` 的构建脚本都 resolve `packages/dsh-ui-kit/lib/index.js` |
| 漂移是工具链版本差异 | 锁文件里同时有 `tsdown@0.22.14` 与 `0.22.2`；入库产物由 2026-10-24 的 `18ba3c1f6` 生成 |
| 差异**语义等价** | `git diff -U0` 过滤掉注释行后，**非注释差异为 0**（0.22.14）；0.22.2 的差异是 `if` 嵌套 vs 合并的格式化风格 |
| 锁版本无法根治 | 0.22.14 与 0.22.2 都产生 diff；产物字节不可复现 |

结论：**入库构建产物 + 浮动工具链 = 必然漂移**。锁版本、或把 `lib/` 移出版本控制都不可行（后者会破坏 4 个插件的硬编码依赖）。

## 3. 用户操作旅程

1. 开发者在 `main` 上跑 `./scripts/sync-to-app.sh`。
2. kit 正常构建，物化继续。
3. 物化结束后，工作区**仍是干净的**（构建产生的产物漂移已被处理）。
4. 再次运行物化，不再被「已跟踪文件改动」拦下。

## 4. 期望反馈

- 物化不打印「工作区存在已跟踪文件的未提交改动，拒绝物化」。
- 物化不要求人工加 `OMNIMUX_SKIP_KIT_BUILD=1`。
- 开发者自己改的源码仍会被拦（门禁意图不能削弱）。

## 5. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | kit 构建后，被跟踪的 `lib/` 产物若发生变化，自动恢复到 HEAD 版本 | 实际跑物化，`git status` 干净 |
| AC-2 | 恢复只在「构建产物路径」上生效，不碰任何源码文件 | 契约测试 + 实际验证 |
| AC-3 | 开发者对源码的未提交改动**仍然**被拦截 | 构造脏源码场景，门禁仍拒绝 |
| AC-4 | 连续两次物化都成功，不出现自我污染循环 | 实际连续执行两次 |

## 6. 设计

在 kit 构建之后、物化之前，把**构建产物路径**上被构建改动的文件恢复到 HEAD：

```bash
# 只针对已知的构建产物路径，不用 git checkout . 这类宽口径命令。
restore_build_artifacts() {
  local dir="$1"
  local dirty
  dirty=$(git -C "$ROOT" status --porcelain --untracked-files=no -- "$dir" 2>/dev/null) || return 0
  [ -z "$dirty" ] && return 0
  git -C "$ROOT" checkout -- "$dir" 2>/dev/null || true
}
```

调用点：`ensure_authoritative_dsh_ui_kit` 的构建分支结束后，对 `$DSH_UI_KIT_DIR/lib` 调用一次。

**为什么安全**：产物已生成在磁盘上供物化使用；恢复 HEAD 版本只影响 git 索引，不影响刚构建出的文件内容——不对，恢复会覆盖文件。所以顺序必须是：**构建 → 复制到物化目标 → 再恢复**。

修正设计：把恢复放在 `materialize_authoritative_dsh_ui_kit` 之后（产物已复制进 profile），确保恢复不影响物化使用。

## 7. 边界与降级

- 若 `git checkout` 失败（权限、锁），只警告不中断——物化本身已完成。
- 只作用于 `$DSH_UI_KIT_DIR/lib`，不碰 `src/`、不碰其它包。
- `OMNIMUX_SKIP_KIT_BUILD=1` 时不做恢复（没有构建就没有新产物）。
- 开发者改的源码永远不在恢复范围内。

## 8. 新用户基线

无关（构建期脚本）。新用户安装已发布包不受影响。

## 9. 非目标

- 不把 `lib/` 移出版本控制（4 个插件硬编码依赖它）。
- 不锁死 tsdown 版本（已验证锁版本也无法字节复现）。
- 不改 kit 的组件源码或构建配置。
- 不放宽 `assert_omnimux_sync_main` 对真实源码改动的拦截。

## 旧标准变更

无。本任务不修改既有测试。

## 假设

1. 构建产物漂移**语义等价**（非注释差异为 0），因此恢复 HEAD 版本不会让插件消费到行为不同的 kit。
2. 恢复必须在产物复制进 profile 之后执行，否则物化会拿到旧产物。
3. 4 个插件的构建脚本 resolve `packages/dsh-ui-kit/lib/index.js`，因此该路径必须始终存在且可用。

## 证伪方式

1. 若恢复 HEAD 后插件运行行为发生变化（图标缺失、样式错乱），则假设 1 错 → 说明漂移不是纯格式，需改为「构建后对比语义」而非直接恢复。
2. 若物化产物与 HEAD 版本不一致（profile 里的 kit 是旧的），则假设 2 错 → 调整恢复时机。
3. 若删除 `lib/` 后 4 个插件构建仍成功，则假设 3 错 → 可考虑移出版本控制（但需另开任务）。
4. 可执行验证：
   - `./scripts/sync-to-app.sh`（不加 SKIP）连续两次成功
   - `git status --porcelain` 在物化后为空
   - 构造源码脏改动，确认仍被 `assert_omnimux_sync_main` 拦下
