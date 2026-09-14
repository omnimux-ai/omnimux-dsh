# 规格：插件构建脚本不得依赖 PATH 中的 pnpm（修复合入后物化中断）

## 1. 目标

**症状**：`yarn omnimux:sync` 物化在 `→ build omnimux-browser (package.json scripts.build)` 处中断：

```
[ERROR] This project is configured to use 11.7.0 of pnpm. Your current pnpm is v11.8.0
Corepack invoked pnpm with this version, and pnpm does not switch versions when running under corepack.
```

**已取证的事实**：
- `scripts/sync-to-app.sh:470` 以 `(cd "$dir" && npm run build --silent)` 触发插件构建；
- `plugins/omnimux-browser/package.json` 的 `build` 脚本内部再调 `pnpm run build:server && pnpm run build:extension`，`build:extension` 又是 `cd extension && pnpm run build`；
- 该内层 `pnpm` 在**同步脚本重置后的环境**里解析到 corepack 垫片，垫片拉起 pnpm **11.8.0**，与仓库锁定的 **11.7.0** 冲突而终止；
- 在普通 shell 里直接跑 `npm run build`（同一脚本）**成功**；把真实 pnpm 11.7.0 前置 PATH 直接跑 `pnpm run build` 也成功；
- 以下环境侧绕过**全部无效**：真实 pnpm 前置 PATH、`npm_config_pm_on_fail=ignore`、`~/.npmrc` 加 `pm-on-fail=ignore`、`COREPACK_ENABLE_PROJECT_SPEC=1` + `COREPACK_DEFAULT_TO_LATEST=0`。

**根因判定**：该插件的构建脚本把「包管理器的具体实现」当成了外部可变量；同步链本身已经以 `npm` 作为可用前提（其它包同样用 `npm run build`），只有这个包额外依赖 `pnpm`，于是任何 pnpm 解析异常都会打断整条物化。

## 2. 命令

```bash
node -e "JSON.parse(require('fs').readFileSync('plugins/omnimux-browser/package.json','utf8'))"   # 清单可解析
cd plugins/omnimux-browser && npm run build                                                        # 构建通过
```

## 3. 改动面

| 角色 | 路径 |
| --- | --- |
| 改动 | `plugins/omnimux-browser/package.json` —— 把 `build` / `build:extension` 里的 `pnpm run …` 换成 `npm run …` |
| 规格 | `specs/pnpm-invoke-in-sync-build.spec.md` |

`scripts/sync-to-app.sh` 不动（它用 `npm` 是既有约定，且已被其它包依赖）。

## 4. 成功标准

- `plugins/omnimux-browser` 的 `build` 全链路不再出现 `pnpm` 字样；`npm run build` 在**清空 PATH 中 pnpm 的环境**下同样成功。
- 产物 `extension/dist/**` 与改动前一致（同一 vite 配置与入口）。

## 5. 边界

- **总是**：只改这一个清单的脚本字段；改完在本工作树实跑一次 `npm run build` 取证。
- **先问**：改 `scripts/sync-to-app.sh` 的调用方式、改其它包的构建脚本。
- **绝不**：动 `packageManager` / `devEngines` 版本声明；放宽或绕过 pnpm 的版本校验；改构建产物内容。
