# #832 / PR #855 基线同步

## 结果与范围

2026-09-09，独立基线同步完成；PR 保持 Draft / 不可合并，整体验收未通过。未启动 viewer、L2 或浏览器，未 merge PR、部署、修改官方外仓或 shared seed。

- 输入 HEAD：`c70436bbfcc57e6476598604ffa9c7946b33370b`。
- 先读取唯一 dirty 文件 `issue-832-recovery-pr-draft.md`，原样提交保全：`7d6a8d44540a56cf52ebf9dda39f0c8f345d1d41`；未 stash。
- fetch 后实际 `origin/main`：`e3f71ae6097c49ed507130d7ece566f73ad78386`，原共同祖先 `867b192ecf6aa35be4e1639db7351a89bea782c7`，实际 behind 5。
- 五项基线提交涵盖授权连续性、可执行 form 合同、stable baseline 文档合同、assets Python supply-link 验证。任务路径与基线路径交集为空，采用正常 `git merge --no-edit origin/main`。
- merge commit：`2b010fc94b416cfe7541c1e88f98c75346dd01eb`；父提交为上述保全 commit 与实际 main。无冲突，无 rebase、force 或手工实现修改。
- 整个 `plugins/omnimux-market` 相对输入 HEAD 的 Git diff 为空；顶部、首页1/global49及683+4测试保持。57个 incoming 基线路径逐路径与 main 比较均无差异，新合同未被任务覆盖。

## 本轮实际验证

验证目标为 merge commit；本报告是后续纯文档增量，不伪称文档提交后的运行验收。

| 命令 / 检查 | 实际结果 |
| --- | --- |
| `pnpm --filter omnimux-market test`、`pnpm verify:stages` | 启动前依赖自动安装以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 退出；未强制 purge/install |
| `npm --prefix plugins/omnimux-market test` | build + 687/687 PASS，8 suites，0 fail/skip/cancelled |
| `npm run verify:stages` | PASS：10 Stage / 8 sidebar targets |
| `npm run verify:slots` | PASS：1670文件，0违规 |
| `npm run check:boundaries` | PASS：2217文件 |
| `npm run test:ui` | PASS：279视图，0违规 |
| `npm run registry:verify` | PASS：12插件 |
| `npm run test:gates` | FAIL：149项，143 pass / 6 fail，0 skip/cancelled |
| `node --test scripts/auto-pipeline.test.mjs scripts/sync-release-policy.test.mjs` | PASS：25/25；临时fixture，不是真实物化 |
| `npm run verify:forms` | FAIL：`ERR_MODULE_NOT_FOUND`，缺少新 form workspace 的 `zod` 依赖；后续命令成功不覆盖该失败 |
| `node --test plugins/omnimux-assets/src/python-runtime-links.test.js` | PASS：11/11 |
| `git diff --check origin/main...HEAD` | PASS |
| 构建后工作树 | 干净，无 tracked 生成物漂移 |

npm 入口执行 package.json 中相同脚本，避免 pnpm 启动前无关依赖清理，不替换测试或预期。

`test:gates` 六项失败定位：4项 sync-repeat-install fixture 设置离线且隔离 HOME，Corepack 缓存未提供 pnpm 11.7.0，报 `Network access disabled by the environment; can't reach ...pnpm-11.7.0.tgz`；另2项打包检查发现 assets 声明的 `runtime/cpython-3.13.15+20260807-darwin-arm64` 与 `darwin-x64` 目录缺失。未造空目录、跳过断言或修改基线实现以换取通过。依赖与运行时供应尚不完整，不宣称全门禁 PASS。

## 交付与剩余边界

本轮允许普通 push 到任务分支并保持 Draft；远端最终 HEAD 和 CI 初始回执由交付回复登记，不等待 CI 结束，不创建依赖轮询。原 run 34311019804 的 Static L0 SUCCESS 已只读确认，仅证明旧 HEAD。

整体 L2 / ego-browser / verify:live 继续依赖 #839 的正式受管兼容制品、receipt 及任务消费证据；没有新交付不启动 viewer。本次基线同步阶段未扩展到共享环境安装；缺失的离线包缓存、form 依赖与 assets Python runtime 的后续任务私有恢复记录见下节。基线同步完成不等于 #832 可关闭或可合并。

## 任务私有验证环境恢复（2026-09-09）

验证输入 HEAD 为 `8da92b0681f123ed8847a7adfaa7198a77f17039`；只补本任务环境，不改业务、测试断言、共享缓存、其他任务或外仓文件。原失败回执保留在上表。

- 先只读参考本 repo 的 `issue-786-non-git-guard.md` 及 `cross-docs-governance/deliverables/cross-docs-governance/env-remediation.md`，再核对当前入口。当前 `guard-worktree.qa.test.mjs` 已在清除 ambient Git 变量后设置 fixture 自身的 `GIT_CEILING_DIRECTORIES`；因此任务内 `scratch` 可用，不套用旧版“仓内 TMPDIR 必失败”结论，也不全局伪造 Git 身份。
- `sync-repeat-install` 的安装写入 fixture HOME/profile/store，`sync-targets` 的 App 路径由既有 fixture 重定向，Alpha policy 自建 clean-main fixture。实际入口不启动真实 viewer 或物化真实 profile。包清单检查只读，forms 使用 `tsc --noEmit`、临时目录测试与 `docs --check`。
- Corepack 实现缓存命中时只读 `.corepack` 并直接返回；仅在任务 `.workbuddy/evidence/local-recovery-832/corepack/v1/pnpm/11.7.0` 建链接，指向既有 `/Users/x/.cache/node/corepack/v1/pnpm/11.7.0`。关闭网络、auto-pin 与 latest；Corepack 根目录为任务私有，版本实际返回 11.7.0。
- assets 两个 runtime 链接指向既有 `assets-storage-766` 产物。以本任务 HEAD 的 tracked integrity 为准，核验全目录路径集合、文件 SHA256/字节数、POSIX 模式及软链目标/无逃逸：arm64 **1809/1809**、x64 **1805/1805**。不执行外部 Python，不创建空 runtime，不将这两个 untracked 链接提交；此证据不等于发布 tarball 已包含 runtime。
- 在 `packages/form-contract/node_modules/` 创建 zod **4.4.3** 与 TypeScript **5.9.3** 的只读消费链接，源为主仓既有 `.pnpm` 模块。原 root `node_modules -> ../../node_modules` 保持不变；无 install、force 或 purge。使用正确的 `pnpm_config_verify_deps_before_run=false`，不依赖无效的 `npm_config` 同名参数阻止自动安装。
- HOME、TMPDIR、XDG config/cache/state、npm cache/store/config 和 Corepack 根均置于任务 `.workbuddy/evidence/local-recovery-832/`。复现：在任务树执行 `source .workbuddy/evidence/local-recovery-832/env.sh`，随后运行 `corepack pnpm test:gates` 与 `corepack pnpm verify:forms`。准备脚本是一次性链接创建器，不在已有链接上重跑。

| 恢复后命令 | 实际结果 |
| --- | --- |
| `corepack pnpm test:gates` | **149/149 PASS**，4 suites，0 fail/skip/cancelled，exit 0，298606ms；原六项失败全部恢复 |
| `corepack pnpm verify:forms` | **PASS**：TypeScript noEmit、77/77 tests、docs check `ok:true`，exit 0 |
| `git diff --check` | PASS；tracked 增量仅本报告 |

本次恢复复跑没有新增测试失败。原始本地回执保留于同一 ignored 目录：`source-verification.json`、`gates.log`、`forms.log`；没有另建重复报告。两个后台作业均已结束并收齐 exit 0 回执。测试临时 Git fixture 自动清理，保留两条 untracked Python 环境链接与 ignored 私有缓存/依赖/日志，以供后续复验。

本地验证环境可恢复目标已达到；687/687 market 既有成功证据仍适用于未改的业务源码，本轮不重复执行。仍不证明真实 Host、L2、ego-browser 或 `verify:live` 已通过；#839 正式受管兼容交付依赖不变，PR 保持 Draft，不可据此合并或关闭 #832。
