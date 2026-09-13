# 规范：随全量同步清退历史外部预览插件 `@crosery/dsh-viewer`

Issue: [#1622](https://github.com/omnimux-ai/omnimux-dsh/issues/1622)

## 1. 目标 (Objective)

用户报告的第二个界面缺陷是「图片/文件预览卡片整体不加载」，根因是**同一个 keyed slot 上同优先级重复注册**：官方 harness 的 `read_image` 卡片与外部预览插件 `@crosery/dsh-viewer` 都在 `tool.call.toolview` 的 `read_image` 键上以 priority 0 注册，框架同键同优先级直接抛错并连带回滚整个预览插件客户端半边。

代码面已解决：预览插件 fork 进套件（`plugins/omnimux-viewer`，PR #1624），并提供「`display_file` 归本插件 rank 0、`read_image` rank 1 让位官方行」的显式 rank（PR #1624 内含）。

但**开发版 Profile 里仍同时挂着二者**（实测 `~/.omnimux-dev/profiles/omnimux`）：

```
dependencies: "@crosery/dsh-viewer": "file:.materialize-snapshots/plugins/@crosery/dsh-viewer"
              "omnimux-viewer":      "file:.materialize-snapshots/plugins/omnimux-viewer"
bundles:      ... @crosery/dsh-viewer ... omnimux-viewer
node_modules: @crosery/dsh-viewer 与 omnimux-viewer 并存
```

老实现仍会被加载并继续抢位，修复在界面上不生效。

成功标准（可测）：

- 全量同步后，Profile 的 `dependencies`、`dsh.profile.bundles`、`node_modules/`、`.materialize-snapshots/plugins/` 四处均不再出现 `@crosery/dsh-viewer`。
- `omnimux-viewer` 保持存在且被加载。
- 复现口径：直接检查上述四处（不需要启动应用）。

## 2. 命令 (Commands)

```
node scripts/omnimux.mjs sync            # 全量同步（默认 Dev）
grep -c '@crosery/dsh-viewer' ~/.omnimux-dev/profiles/omnimux/package.json   # 期望 0
```

## 3. 项目结构 (Project Structure)

- 改动：`scripts/sync-stable.sh`（`LEGACY_PRUNE_NAMES` 增加该包名）
- 规格：`specs/retire-legacy-crosery-viewer.spec.md`

## 4. 代码风格 (Code Style)

沿用该脚本既有的清理注释风格；包名与数组元素按既有排序追加。

## 5. 测试策略 (Testing Strategy)

- `bash -n scripts/sync-stable.sh` 语法检查。
- 端到端：执行全量同步后，按「成功标准」四处逐一核对（本任务内实测取证）。

## 6. 边界 (Boundaries)

- **总是**：只清退已 fork 进套件、且已被替代的历史包名。
- **先问**：清退仍在套件外独立维护的插件；改动清理机制本身。
- **绝不**：手工编辑 Profile 文件或 `node_modules`（绕过物化流程）。
