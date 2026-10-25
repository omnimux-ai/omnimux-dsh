# Spec: 物化后校验依赖是否都有受管快照（Issue #3761）

## 1. 目标与用户结果

物化结束后立刻知道「profile 里有没有依赖没有受管快照、有没有插件清单条目没有任何来源」，并指名失败；不再只能等新版 Dev 启动时被宿主断言拦下。

## 2. 事实与证据

| 事实 | 证据 |
| --- | --- |
| 新版宿主只对 **preset owned** 依赖强制受管快照 | 壳仓 `dsh-plugin-desktop/src/managed-profile.ts:281` `assertExistingManagedProfile` 只遍历 `ownedPackages`；`/Applications/OmniMux Dev.app/.../preset/owned-packages.json` 共 318 项，`sharp` 不在其中 |
| 曾经的启动失败正是 owned 依赖没快照 | `~/Library/Application Support/OmniMux-Dev/diagnostics/diagnostics-1792889053502-*.zip` → `dsh-2026-10-25.error.log`：`dependency "@aws-crypto/sha256-js" must be "file:.materialize-snapshots/plugins/@aws-crypto/sha256-js", found "5.2.0"` |
| 我们没有任何检查覆盖它 | `scripts/verify-profile-preflight.mjs` 全文 `snapshot` 出现 0 次，只看 `omnimux*` 插件包是否装进 `node_modules` |
| 契约规则已有、执行没有 | `docs/contracts/dev-pipeline.md:37`「依赖声明必须指向受管 snapshot」 |
| 悬空插件清单条目同样致命 | profile `dsh.profile.bundles` 曾挂着 `@dsh-external/dsh-translator`，既不在 dependencies 也不在 node_modules（已摘除） |
| 壳仓重建后实测 | `rebuild5.log` `REBUILD=0`；profile 333 条依赖里 owned 318 条全部受管快照，仅剩 `sharp`（非 owned）是版本号 |

## 3. 改动

- 新增 `scripts/verify-profile-dependency-snapshots.mjs`（只读）：硬失败＝受管快照声明缺目录/缺 `package.json`、插件清单条目无来源、owned 依赖未指向存在的受管快照；警告＝非 owned 依赖仍是版本号；拿不到 owned 清单时打印原因并显式标记 `ownedStatus=skipped`。
- 新增 `scripts/verify-profile-dependency-snapshots.test.mjs`（11 个用例）。
- 接线：`scripts/sync-stable.sh` 在启动预检之前调用（失败即恢复暂存入口并中止物化）。
- `package.json` 的 `test:gates` 挂上新测试；`scripts/governance-manifest.json` 登记两个新脚本（verify→manual、test→ciRequired）。

## 4. 假设

- 宿主断言的口径就是 preset owned 列表；非 owned 依赖从 `node_modules` 解析即可，因此拦下它们会比宿主更严。
- 目标应用可从 profile 路径推导（与 `verify-profile-preflight.mjs` 同一张表）；推导不出时应显式跳过 owned 断言而不是假装通过。

## 5. 证伪方式

- 若 owned 依赖没快照却不失败：构造 owned 依赖为版本号的 fixture，必须报 `owned 依赖 … 未指向受管快照`。
- 若非 owned 依赖被误判为失败：构造非 owned 版本号依赖，必须只有警告、退出码 0。
- 若拿不到 owned 清单时静默通过：`ownedStatus` 必须是 `skipped` 且打印原因；`--owned` 指向不存在文件时同样如此。
- 若真实环境误报：在已重建的 Dev profile 上跑，除 `sharp` 警告外必须通过（实测通过：333 依赖 / owned 318 / 插件清单 26）。

## 6. 验证

1. `node --test scripts/verify-profile-dependency-snapshots.test.mjs` → 11/11。
2. `node scripts/verify-profile-dependency-snapshots.mjs ~/.omnimux-dev/profiles/omnimux` → 通过 + `sharp` 警告。
3. `pnpm test:gates`（含 registry 一致性）。
4. 反向验证：把 fixture 的 owned 依赖改成版本号 → 退出码 1。

## 7. 非目标与依赖

- 不创建/回填快照（首次建立仍归官方完整 profile rebuild）；不修改 profile 内容；不修壳仓重建的顺序问题。
- 与壳仓的 rebuild 顺序修复并行，互不阻塞。
