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

整体 L2 / ego-browser / verify:live 继续依赖 #839 的正式受管兼容制品、receipt 及任务消费证据；没有新交付不启动 viewer。后续本地全门禁需要正式供应缺失的离线包缓存、form 依赖与 assets Python runtime；本次未扩展到共享环境安装。基线同步完成不等于 #832 可关闭或可合并。
