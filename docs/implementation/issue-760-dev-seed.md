# Issue #760 — Dev seed 依赖调查与修复边界报告

- 调查日期：2026-09-08 08:04–08:07 +08:00。
- 结论：**BLOCKED / 需要主理人确认最小正式入口扩展方案；未修改 Dev，未启动 L2 Host。**
- Task worktree：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/slot-mention-menu-760`。
- Target HEAD：`308389388931fe6398654fe1b1c73a816e639bb7`。
- Base / 主 checkout HEAD：`5485c25875cb9f71d7cb78a6aa69d07e07fffbab`。
- 本轮交付仅为此报告；没有改 #760 源码、脚本、合同或门禁，没有 commit、push、merge。

## 1. 授权与边界

本轮授权保留现有 `@crosery/dsh-viewer` 功能，在 `~/.omnimux-dev` 必要受管依赖范围内恢复合规，并在修复成功后为本任务启动正式 L2。禁止删除 viewer、放宽/跳过门禁、伪造 seed、手工 cp/rsync 进 profile、将未合并 #760 代码物化到 Dev、修改 Prod/官方 DSH/其他 workspace 源码或默认重启 App。

若既有入口不能完成最小修复，而需要正式脚本支持或扩大完整同步，必须先报告方案等待主理人。当前达到此暂停条件，不是 sandbox 权限错误。

读取的本仓政策：

- [dev-pipeline](../contracts/dev-pipeline.md)：L2 seed、唯一物化入口、受管快照、合并与重启边界。
- [plugin-git-pr](../contracts/plugin-git-pr.md)：共享环境及合并授权边界。
- [ops-entry](../contracts/ops-entry.md)：公开运维入口与内部实现角色。
- [原实现报告](issue-760-slot-mention-menu.md)及[QA 报告](../qa/issue-760-slot-mention-menu.md)中的前序证据。

主 checkout 当时存在其他成员的 Market / Hub 修改：Market 的 client/test 文件，以及 Hub `workbench.test.js` / `workbench/focus-state.js`。这些文件未写入、未 stash、未 reset、未提交。任务树调查开始时 clean、ahead 3。

## 2. 已核验根因

实际 Dev seed：`/Users/x/.omnimux-dev/profiles/omnimux`。

`package.json:33` 的依赖为：

```text
@crosery/dsh-viewer = file:/Users/x/Desktop/Project/dsh-desktop/backups/omnimux-dev-install-dsh-viewer-20260907-190742/crosery-dsh-viewer-0.1.0.tgz
```

而 `scripts/dev-env.sh:283–309` 要求 profile-level `file:` 依赖精确为：

```text
file:.materialize-snapshots/plugins/@crosery/dsh-viewer
```

并要求对应目录与 `package.json` 存在、锁文件不含 profile 绝对路径及非受管 `file:` 路径。当前 viewer 受管目录不存在；锁还包含以下不合规身份：

- `pnpm-lock.yaml:96`：绝对 tarball specifier。
- `pnpm-lock.yaml:97`、`:1054–1055`、`:4324`：`file:../../../Desktop/Project/dsh-desktop/backups/...tgz` 及 tarball resolution。

本轮只读遍历全部 **287** 个 profile dependency：viewer 是唯一不符合精确受管目录规则的 `file:` 依赖；其余已声明受管依赖没有发现缺少 source `package.json`。这不等于所有受管包内容或运行闭包都已通过验收。

这是包安装来源与 L2 可重定位 seed 合同不一致，不是 viewer 缺包，也不是 #760 源码问题。仅将 manifest 字符串改为相对路径仍会因 source 缺失/锁残留失败；不能靠改一行 JSON 完成修复。

## 3. Viewer 身份与功能包保留证据

### 安装身份

- 已安装目录：`/Users/x/.omnimux-dev/profiles/omnimux/node_modules/@crosery/dsh-viewer`，realpath 仍是此目录。
- 包名/版本：`@crosery/dsh-viewer@0.1.0`。
- Host 入口：`lib/index.js`；Client export：`./client` → `lib/client.js`。
- `dsh.bundle.patch`：`./cordis.patch.yml`。
- `dsh.profile.bundles` 中仍包含 `@crosery/dsh-viewer`。
- patch 的实际加载行仍为 `id: viewer` / `name: '@crosery/dsh-viewer'`。
- 包说明包含内联 image/video/audio/PDF/Office 展示和 `display_file` 工具；patch 声明默认保留 tool/read redirect/model image feed。此处是静态功能装配证据，不是运行测试。

### 原 tarball 一致性

原 manifest 指向的 tarball 仍存在。使用 Python `tarfile` 只读逐个比较包内 **27 个普通文件**与已安装对应文件，**0 个缺失或字节差异**，未解包写入任何目录。

Tarball SHA-256：

```text
7786848ddbabca4cc2dc05dc0bdb3d2cdef99b16b2fd195764a542c30d6a4907
```

### Before / after（after 为本轮调查结束，不是修复成功）

| 检查项 | Before | After |
| --- | --- | --- |
| Viewer name/version | `@crosery/dsh-viewer@0.1.0` | 未变 |
| dependency spec | 上述外部绝对 tarball `file:` | 未变，仍不合规 |
| managed viewer snapshot | 不存在 | 仍不存在 |
| viewer bundle membership | 存在 | 存在 |
| tarball payload 对 installed | 27 文件一致 | 本轮未修改 |
| Dev 依赖重建 | 未执行 | 未执行 |
| App restart / browser test | 未执行 | 未执行 |

以下 SHA-256 在本轮前后只读重算，均未变：

| Dev profile 相对路径 | SHA-256 |
| --- | --- |
| `package.json` | `499491a87b82d1b86594737a242d285a30ceff9d8a287a8f1b22d3c420ffb7e5` |
| `pnpm-lock.yaml` | `85fa4bbb3f251c86039b2423b99b28534af725bebb78718280424fa2749442b1` |
| `pnpm-workspace.yaml` | `ad0f0134749a51d3dab70fde6848185a1d10a23b0637cd544b030799d40e9dc6` |
| `node_modules/@crosery/dsh-viewer/lib/index.js` | `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a` |
| `node_modules/@crosery/dsh-viewer/lib/client.js` | `ef581017c94a3fdee31d20742201c2886458b69218f6c315b95b18be1ef7c548` |
| `node_modules/@crosery/dsh-viewer/cordis.patch.yml` | `70511659982d5e461ef1fd7ea492c167c6c7244cdc29599c8ddda29af5dc0aec` |

这些证据支持“现有 viewer 功能包及装配保留”，**不声称 Dev 已重新加载、工具可实际调用或媒体渲染正常**。

## 4. 既有正规入口与适用性

### A. Packaged `dsh plugin` 安装

官方 CLI `apps/cli/src/plugin.ts:120–162` 的 `runPlugin` 是 profile 目录内 pnpm 转发器，成功后 reconcile bundles。`:94–111` 将相对目录/file/link 参数锚定到调用目录；没有将外部 tarball 纳入 OmniMux `.materialize-snapshots` 的操作。

这解释了“插件成功安装”和“可作为 L2 seed”并非同一条件。重新安装同一个 tarball 仍会留下非受管路径；本轮没有尝试。改装 registry 版本可能不再触发 `file:` 检查，但尚无 registry 包与现有 27 文件、peer 元数据完全一致的证明，不能把同名同版本当成功能保留证明，也不是当前受管 source 修复方案。没有访问 registry 或替换版本。

此入口仅做只读源码核查，未执行任何官方源码/安装层写入。

### B. `yarn omnimux:sync [plugin]`

正式链：fork `scripts/omnimux.mjs:148–150` → 产品 `scripts/sync-to-app.sh` → `scripts/sync-stable.sh`。

已核查：

- `sync-to-app.sh:94–105` 要求 clean main；当前任务树是未合并分支，主 checkout 有他人的脏改动，二者都不适合 Dev 物化。
- `sync-to-app.sh:261` 默认全同步清单不含 viewer。
- `sync-to-app.sh:460–466`、`sync-stable.sh:323–348` 从 `$PLUGINS_ROOT/<name>/package.json` 的真实源码目录物化，**没有 tarball 参数/导入支持**。
- `sync-stable.sh:259–287` 的既有产品依赖迁移循环仅覆盖产品清单；默认全同步不会把任意第三方 tarball 转为受管 source。
- 全同步还更新 kit 和 Agent Presets；当前授权不允许为 viewer 修复顺带覆盖这些面。
- `sync-stable.sh:651` 确实会运行 pnpm install，但前面的 source 物化能力不覆盖此 tarball；不能用“会 install”推断“会修复 viewer seed”。

结论：未发现可直接处理当前 tarball 且保留其确切内容的既有最小 sync 调用。没有设置任意 source override、构造临时插件树、直接调用 internal sync 或跳过 main 门禁。

### C. 正式全 profile rebuild

找到真实公开入口：

```text
yarn omnimux:profile rebuild --target dev --app <absolute-frozen-candidate.app>
```

实现位置（只读）：

- `/Users/x/Desktop/Project/omnimux-desktop-fork/scripts/omnimux.mjs:72–89`。
- `dsh-plugin-desktop/scripts/rebuild-managed-profile.ts:86–133`：显式冻结 App / Electron-as-Node，全图 candidate 物化。
- `dsh-plugin-desktop/src/managed-profile.ts:424–468`：选择已有受管 source 或候选 owned package；`:753–784`：完整依赖图校验和提交。

关键阻断是 `managed-profile.ts:436–443`：对于不在候选 ownedPackages 的依赖，非受管 `file:` 会直接 `fail`，不会导入外部 tarball。`/Applications/OmniMux Dev.app` 的 preset 没有 viewer 目录，`owned-packages.json` 没有 viewer。只读路径存在性检查也没有在 `/Applications/OmniMux.app` preset 中找到 viewer；未读写 Prod profile。

因此当前已核查的 Dev App 不能通过 full rebuild 自动接纳此 viewer。完整 rebuild 本身还超出单依赖修复的写入面。**此命令未执行**；不能将代码推导写成实测失败，也没有通过给 frozen App 加包来伪造候选。

## 5. L2 seed 校验结果

前序正式 `dev-env.sh start` 失败、Host 未启动是主理人/QA 提供事实。

本轮新增证据是**原样只读重放**当前任务树 `scripts/dev-env.sh:285–304` 内的 Node seed 检查代码：Python 从该精确 heredoc 标记提取字符串，送入 `node --input-type=commonjs - /Users/x/.omnimux-dev/profiles/omnimux`；没有改检查条件、写 seed 或调用 Host。

实际结果：**exit 1**，Node `v25.8.0`，首个错误：

```text
Error: 未受管 file: 依赖 @crosery/dsh-viewer = file:/Users/x/Desktop/Project/dsh-desktop/backups/omnimux-dev-install-dsh-viewer-20260907-190742/crosery-dsh-viewer-0.1.0.tgz
seed_checker_exit=1
```

已检查并确认这是预期根因，不是测试基础设施错误。本轮只有这一次失败的校验重放，没有反复 retry、第三种旁路或完整安装失败试验。

同时 `git diff --exit-code <base> -- scripts/sync-to-app.sh scripts/sync-stable.sh scripts/dev-env.sh` 返回 0，证明所核查脚本与给定已合并 base 相同，不是 #760 私改门禁。

运行身份状态：

| 项 | 实际值 |
| --- | --- |
| task | `slot-mention-menu-760` |
| intended source | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/slot-mention-menu-760/plugins` |
| source HEAD | `308389388931fe6398654fe1b1c73a816e639bb7` |
| intended profile | `~/.dsh-dev/tasks/slot-mention-menu-760/profiles/omnimux-dev-slot-mention-menu-760` |
| profile directory | 不存在 |
| profile node_modules / host.pid / port.txt | 均不存在 |
| assigned port / PID | 无 |
| Host / watch | 本轮未启动 |
| browser / verify:live | 未执行，由主理人另派 QA |

`~/.dsh-dev/tasks/slot-mention-menu-760` 根下有前序初始化残留文件；本轮未读取其凭据内容、未修改/清理。没有创建 managed background job，因此无待收集后台作业。

## 6. 建议方案（未实施，等待主理人）

**推荐：在本产品仓既有 `sync-to-app.sh` → `sync-stable.sh` 链增加显式、单包、保留内容的 tarball 纳管能力；不要改 L2 门禁或合同来接纳任意外部路径。**

四项披露：

1. **需越过的边界**：当前仅允许执行既有正规最小修复；新增运维脚本支持是 R1 工作，并涉及把经过审查的新正式运维实现投入 Dev 使用的授权/合入顺序。当前 #760 未合并代码绝不能借此进入 Dev。主理人应决定独立环境修复 Issue/任务及先合入正式入口的安排，不在 #760 功能源码中夹带环境补丁。
2. **最小实现范围**：只扩展上述两个正式入口及必要 helper/测试，显式接收现有 viewer tarball 路径和预期 name/version/hash；安全校验 archive 路径、链接、身份和文件清单后，经该链将该包放入 `.materialize-snapshots/plugins/@crosery/dsh-viewer`，保持 Host/Client/patch/peer 元数据；只改 viewer spec 和 pnpm 生成的锁/安装态；保留 bundle 次序、kit、其他 source、Agent Presets、App 包、设置和数据。入口失败必须恢复一致依赖图，不新增私有 deploy 工具。
3. **成本/风险**：需要新增脚本测试与 `pnpm test:gates`、第三方包 provenance/路径安全、pnpm 重建和失败恢复验证；pnpm 可能重解 hoisted 依赖，不能只备份一行 manifest 或只验证 viewer 三个文件。应增加其他包/source/配置未变证据；不重启 App，运行时证明仍由后续 L2 QA 提供。具体差异和可恢复范围必须先完成设计，不能承诺现有脚本只改一包的安装文件。
4. **不扩大的替代**：保留现状并等待环境维护方提供已经通过正式入口建立、包含同一 viewer 内容的真实受管 Dev seed。现有全 sync/full rebuild 不足以直接处理当前 tarball，不推荐盲跑；不以其他 seed 或 registry 替换回避内容保留证明。

原 tarball 是可验证源（见 SHA-256 / 27 文件比较），不是允许手工拷 profile 的授权，也不是可删除的历史备份。任何实际纳管前都应重新验证 hash，防止调查后被改动。

## 7. 恢复点、检查与关闭状态

- 已加载 `agent-backup` 技能。因为本轮没有执行破坏性操作、替换 Dev 依赖或改已提交源码，**未创建无必要恢复副本**。
- 未来实施前：使用 shared `backup.py` 对确实会覆盖、不可由已验证源重建的最小配置集合建立恢复点，并实际验证恢复；可由 reachable Git 保留的正式脚本不重复备份。依赖树不可机械塞进备份工具；pnpm 安装失败的候选图/回滚策略必须随正式入口设计验证，不得只靠 source 存在宣称可恢复。
- Markdown 检查实测：`git diff --check` exit 0；新报告 `git diff --no-index --check /dev/null docs/implementation/issue-760-dev-seed.md` 无空白诊断（exit 1 是新文件与 `/dev/null` 存在差异的正常语义）；本仓 Markdown 链接存在性检查 PASS。首次串联命令因 no-index 的差异退出码提前终止，已解释其原因并单独完成余下检查，没有当成空白错误重试修复。最终任务 HEAD 不变，Git 唯一新增项为本报告。没有变化的 #760 全包/Stage/tsc/i18n/boundary 沿用前序工程/QA 证据，未重复跑并冒称新证据。
- 工程本地 QA、seed 合规、L2 实际交互、PR/CI、Dev 物化是独立状态；本轮未完成后四项。
- 下一 owner：主理人。先审批/安排最小正式 tarball 纳管支持，再委派实施；只有 seed 修复完成并通过正式检查后，才为 `slot-mention-menu-760` 运行正式 `dev-env.sh start ... --source=<task worktree>`，通过 managed background 启动并 collect，再交 QA 做 ego-browser + verify:live。

**当前不具备 Issue #760 合入/交付/关闭条件。**
