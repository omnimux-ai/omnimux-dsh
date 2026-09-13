# VENDOR — omnimux-viewer 的 fork 出处与二次开发约定

## 出处

| 项 | 值 |
| --- | --- |
| 上游仓库 | `https://github.com/Crosery/dsh-viewer` |
| 上游基准 commit | `4a913a4`（Merge pull request #1 from Crosery/docs/conventions） |
| 许可 | MIT（见 `LICENSE`，版权归上游作者 Crosery） |
| 引入方式 | 上游源码原样 fork 进本仓库，作为 OmniMux 套件成员在树维护 |

## 为什么 fork

上游没有本插件需要的改动通道（本机账号对上游仓库无写权限，也不把上游 PR 作为交付路径），而 OmniMux 需要：

1. 自己修自己发 —— 官方 harness 自带的 `read_image` 卡片行与本插件的同名卡片在同一 rank 注册时抛错，异常会回滚整个客户端半边（`display_file` 卡片一起挂掉）。修法见下。
2. 脱离「外部未受管 `file:` tarball」形态：原 Dev 依赖指向外部工作区备份目录里的 tarball，版本、哈希与来源都不可控。

## 相对上游的改动

- 身份：包名与两个半边的 `name` 导出统一为 `omnimux-viewer`；资产路由改为 `/omnimux-viewer/asset`。
- **保留**设置命名空间 `crosery-viewer`：它是既有持久化 key，改名会丢用户已有设置（如需改名另开任务）。
- 卡片注册 rank（本仓库新增）：`display_file` 归本插件（rank 0）；`read_image` 以 rank 1 让位给官方自带的同名行；官方没有该行时仍由本插件提供卡片。见 `src/client/registration.ts`。
- 移除上游 `.github/`、`package-lock.json`、`AGENTS.md`、`CLAUDE.md`（上游仓库的 CI 与自身协作规范不适用本仓库；本仓库规则以根 `AGENTS.md` 为准）。

## 再同步上游

上游仍可能修 bug。再同步时：

1. 拉上游目标 commit，与本目录做三方比对（基准即上表 commit）。
2. 冲突优先保留本仓库的 `registration.ts` 与身份改动。
3. 同步后必须实跑 `npm run typecheck && npm run test && npm run check && npm run build`，并跑构建纯度门（`lib/client.js` 只允许 `require("react")` 与 `require("react/jsx-runtime")`）。
4. 更新本文件的「上游基准 commit」与改动清单。
