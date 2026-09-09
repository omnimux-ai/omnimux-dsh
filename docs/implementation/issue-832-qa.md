# Issue #832 独立 QA 报告

## 最终第二轮独立 QA（2026-09-09）

### 结论

- **Routing Decision: NoOne（本轮审查和离线复验未发现需返修的 #832 源码 bug）**。
- **离线 PASS；正式 L2 / ego-browser / verify:live BLOCKED；整体 IS_PASS: NO，不具备 qa:pass、合入或归档放行条件。** NoOne 仅为源码路由，不代表运行验收通过。
- 固定 base `867b192ecf6aa35be4e1639db7351a89bea782c7`；head `37211b40f0978a9deb101b7143c5e21974b41079`；源码提交 `95e127e7a64191265d70fb2e2cbfeb1733461023`。按用户指定本地 SHA 审查，未 fetch 或改变基线。
- 任务树 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-header-832`，初始干净，构建后 tracked 文件仍无变化。本轮仅补本报告和任务内实测日志，未改测试或业务源码。
- 已全文读取工程报告85行与首轮QA报告99行，并审查返修 diff、实际函数、catalog helper、QA 六项用例及现有正式启动脚本。第二轮已结束，不进行第三轮源码测试。

### 修复复验与风险边界

1. **Q1 已修复**：我的 Skill 精选使用 `isRecommendedInstalledSkill`，以 bundled catalog 中 `kind=skill && recommended=true` 的稳定 skill slug 集合判定；不依赖 listInstalled 缺失的 flags，不依赖当前搜索页。真实 listInstalled 响应的 clip-export 保留、未知条目伪推荐被拒、Tab/分类重入/列表刷新均通过。
2. **Q2 已修复**：确认安装失败只写原错误，保持未安装、我的列表不增、确认框不关闭；错误以 role=alert 显示。重试先清错，请求中禁用按钮和关闭，成功才 mark/关闭；再次确认的重渲染状态守卫通过。
3. 首轮报告中的原四项测试均保留在 `skill-header.qa.test.js`（未改断言），另有工程追加两项回归，本次6项全部通过。该文件在源码返修提交中首次纳入 Git，父提交无该文件，不能声称对首轮未提交文件做了 Git 字节级比对；前序日志及现存四项名称/断言与首轮报告一致。
4. VM hook/API 边界测试不是 DOM/真实点击证据；未执行运行覆盖率统计，不虚报百分比。确认弹窗已有中文文案与真实浏览器连点/布局/国际化效果仍需运行验收，离线不代签。
5. Catalog JSON import 的源与生成 helper 路径一致，真实包 build/test 成功；没有发现返修新增阻断性源码风险。首轮所列本地文件安装仅按文件名 slug 的既有能力限制不变，不承诺任意 zip 字节上传。

### 独立实测

| 命令 | 退出码 | 本轮结果 |
|---|---:|---|
| `npm --prefix plugins/omnimux-market test` | 0 | build + 654 tests / 654 pass / 0 fail / 0 skipped / 0 cancelled |
| `node scripts/verify-stage-contracts.mjs` | 0 | 10 Stage / 8 sidebar targets |
| `node scripts/verify-slot-contracts.mjs` | 0 | 1670 client files / 0 violations |
| `node scripts/verify-plugin-boundaries.mjs` | 0 | 2210 source files |
| `node scripts/scan-ui-gates.mjs` | 0 | 279 views / 0 violations |
| `node scripts/registry-tool.mjs verify` | 0 | 12 plugins consistent |
| `git diff --check` | 0 | 无空白错误 |

原始日志均位于 `.workbuddy/evidence/issue-832-qa/`：`final-round2-market.log`（摘要694–701行，QA六项575–580行）、`final-round2-verify-stage-contracts.mjs.log`、`final-round2-verify-slot-contracts.mjs.log`、`final-round2-verify-plugin-boundaries.mjs.log`、`final-round2-scan-ui-gates.mjs.log`、`final-round2-registry.log`、`final-round2-dependency.log`。任务 job bash-59、bash-60 均收集完成 exit0。没有新启动后台 Host/watch。

### 外部依赖只读核验：未变化，不重启

- 用户本轮已明确授权正式任务私有根继承现有 Dev 凭据/settings；首轮下方“未授权”为历史结论，不再作为当前阻断。本轮未读取/显示凭据内容、未再次复制、未改来源、未发模型或付费请求。
- 正式默认 seed：`/Users/x/.omnimux-dev/profiles/omnimux`；manifest 的 viewer 仍是 `file:.materialize-snapshots/plugins/@crosery/dsh-viewer`，version `0.1.0`。
- seed 与任务 profile `.materialize-snapshots/plugins/@crosery/dsh-viewer` 所有文件逐一 SHA256 相同；任务实际 node_modules 入口也与 seed 相同。`lib/index.js` SHA256：`e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a`；`lib/client.js`：`ef581017c94a3fdee31d20742201c2886458b69218f6c315b95b18be1ef7c548`；manifest：`e84a7b50cb13e63ec39cef7cc5d132e3e922bdf6405a246723e02c067d0d4df7`。
- viewer `lib/index.js:3` 仍静态导入 `installSettingsSection, settingsNamespace`，659/710行使用。由任务 viewer 位置解析的 settings 是 `/Users/x/Desktop/Project/Github/deepseek-harness/packages/settings/settings/lib/index.js`；610行实际导出仅 `SettingsConflictError, SettingsProvider, default, redactSecrets`，缺少上述两项。此处只读确认，不动态启动/改写官方底座。
- 正式脚本 `dev-env.sh:684-693` 对已有 node_modules 不重新克隆 seed；即使未来共享 seed 更新，也不能假设已有任务 profile 会自动刷新。兼容制品必须通过受管流程进入实际任务解析依赖，不能手拷未纳管包或删 viewer。
- 本轮核验44201连接返回 ECONNREFUSED（connect_ex=61）；历史PID99970不存在（ps exit1），watch.pid及 `.l2-dev.env` 均不存在。没有重新执行正式 start，没有制造成功身份文件或 pending 探针。
- **精确阻断**：受管 viewer 制品与正式 L2 默认 settings 导出面不兼容；不是 #832 业务代码失败，也不是缺少 bootstrap 授权。未联系其他任务成员，未检查或修改其 workspace，未改共享 seed/官方DSH/外部仓库。

### 未验项目、Owner 与收口

1. **主理人 / 外部 viewer 依赖负责人**：提供正式受管 seed 及任务实际依赖兼容证据（不以 Issue关闭代替制品证明）。因已有profile不自动更新，还需正式受管更新路径，禁止直接拷贝或修改官方包绕过。
2. **运行 QA**：依赖就绪后按原授权、原任务树正式 start 一次，验证当前 COMMIT/SOURCE/PROFILE/PID/端口及 `.l2-dev.env`，再在同一 ego task/Tab 执行 `openL2EgoPage` 与 `verify:live` / `runPreparedQa`。
3. 仍待验：宽/分屏/375px、中英/深浅主题、48推荐卡逐一视觉与无H3、标题说明截断及完整详情、分类横滚及搜索/Tab组合；创建单击/连点、工作区继承、草稿附件保护、无自动发送与右栏保持；安装关闭重开/失败重试与授权范围内成功链；宿主tab关闭/重开。
4. 普通Client变更，无Electron-only修改，额外Electron层 N/A。未push、未PR、未merge、未共享部署。
5. 本次是最终第二轮源码QA交付；剩余为外部依赖与运行验收，BLOCKED不算PASS。当前工具无原生定时唤醒能力，未创建继续任务，不宣称后台持续等待；回主理人保留单一依赖续验责任。

---

## 第一轮结论与身份（历史保留）

- 时间：2026-09-09，Asia/Shanghai。
- Routing Decision：**Engineer**；离线功能 **FAIL**，正式 L2/ego 验收 **BLOCKED（凭据 bootstrap 未授权）**。不可 qa:pass、不可归档放行。
- 固定 base：`867b192ecf6aa35be4e1639db7351a89bea782c7`。
- 固定 head：`4cf79b2d47675f04bad1abb25097c19ff486b074`。
- 任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-header-832`。
- 初始工作树干净；QA 仅新增本报告及 `plugins/omnimux-market/src/client/skill-header.qa.test.js`，未改业务代码。构建后没有 tracked 文件差异。
- 已全文读取前序 `docs/implementation/issue-832-engineering.md` 60 行；读取 AGENTS、design.md、UI guidelines、plugin-qa、plugin-git-pr、dev-pipeline、sidebar-extra-entries。已加载 repository workflow、dsh-plugin-dev、ego-browser、code-review-expert。
- 仅完成第 1 测试轮；尚无 Engineer 修复，不空跑第 2 轮。最多保留一轮修复后回归。

## 失败项 / Engineer 路由

### Q1 — P1，本次新增：我的 Skill 的“精选”必然丢失真实已安装推荐项

- 位置：`plugins/omnimux-market/src/client/skill-plaza.js:206-215,335-338`。
- `list` API 直接调用 `listInstalled`（`src/local-api.ts:136-138`），只返回 slug/name/description/version/path（`src/install.ts:171-177`）；loadInstalled 仅补 installed/enabled，不补 recommended/featured/tags。
- 新增的 `category === "featured" && !isFeaturedItem(item)` 因此会拒绝从 API 重载的所有项目。即使确已安装的推荐 Skill，也显示空列表。发现页选精选后切“我的 Skill”也复现。
- 独立回归 `QA: featured My Skills retains a recommended skill returned by real listInstalled` 使用真实 `listInstalled(catalog/skills)` 读取 bundled SKILL.md，核对 catalog 的 clip-export 确为 recommended，再执行真实 SkillPlaza 函数。预期 1 张卡，实际 0。
- 建议：以稳定 slug/catalog 身份补齐推荐元数据或建立推荐成员集合后筛选；不能依赖 list API 并未返回的 flags。修复后覆盖刷新/切 Tab/精选重入。

### Q2 — P1，基线已有但属于本次要求核验的安装交互风险：确认安装失败仍伪成功

- 位置：`plugins/omnimux-market/src/client/skill-plaza.js:305-317`，`handleConfirmInstall`。
- 普通卡片未安装 switch → ConfirmInstallModal → 确认安装 → api 拒绝时，catch 仍执行 `mark(item, true)`、关闭确认框。
- `src/client/api.js:31` 会在 HTTP 错误或 body.ok=false 时抛出；此错误路径会真实发生，不是虚设输入。
- 独立回归 `QA: rejected confirm install must not mark a skill installed or close confirmation`：预期 installed=false、我的列表不增、确认项保留；实际第一项 installed=true，断言失败。源码同时证实后两项会被错误更新。
- 与工程修复边界区分：上传选择 InstallModal 的 catch 已修正并通过既有负路径测试；确认分支未修复。本项不归因为新引入，但阻止“安装失败不再伪成功”的笼统结论。
- 建议：确认安装失败保留真实状态，显示错误并允许重试。禁止 QA 改业务代码，因此交 Engineer 决定最小修复与范围。

## 独立执行命令与结果

以下均在任务树执行，未运行 pnpm 自动依赖清理；使用 package.json 已定义的同一 npm test/build 脚本。

| 命令 | 退出码 | 实际结果 |
|---|---:|---|
| `npm --prefix plugins/omnimux-market test` | 1 | build 成功；652 tests / 650 pass / 2 fail / 0 skipped / 0 cancelled；其中原有648均通过，QA新增4中2过2败 |
| `node scripts/verify-stage-contracts.mjs` | 0 | 10 Stage / 8 sidebar targets |
| `node scripts/verify-slot-contracts.mjs` | 0 | 1670 client files / 0 violations |
| `node scripts/verify-plugin-boundaries.mjs` | 0 | 2210 source files |
| `node scripts/scan-ui-gates.mjs` | 0 | 279 client views / 0 violations |
| `node scripts/registry-tool.mjs verify` | 1 | 无关 omnimux-workflow/dist/index.js 未构建，不能标为全仓通过 |
| `git diff --check` | 0 | 无空白错误 |
| `git rev-parse HEAD` | 0 | 固定 head 未变化 |

完整命令输出保存在任务内 `.workbuddy/evidence/issue-832-qa/round1-market.log`、`verify-stage-contracts.mjs.log`、`verify-slot-contracts.mjs.log`、`verify-plugin-boundaries.mjs.log`、`scan-ui-gates.mjs.log`、`registry.log`。原始全包测试摘要在 round1-market.log:692-699，失败栈在703-735。

QA 新增四项为离线函数行为测试：Hook 序列闭/开/闭一致；我的列表分类和搜索交集与 All 恢复；真实 listInstalled 响应缺推荐元数据；确认安装拒绝状态。测试使用 VM 注入 React hooks/API 边界，不是真浏览器，不构成 ego 证据。未测运行覆盖率，不虚报百分比。

## 已确认源码与资产

- 三层结构顺序：intro（Skill、OmniMux副标题、创建/安装）→分隔→Tab+搜索→分类；按钮为原生 button，aria-pressed 与 focus-visible 已添加。
- 入口/工作台显示名改为“Skill 工坊”；创建按钮明确传 `{ text: "/skill-creator" }`，沿用既有 createSkillSession。其工作区继承、CAS、连点保护、保留右工作台及禁止自动发送已存在并有原测试覆盖；新增入口的真实时序仍待 L2。
- InstallModal hooks 已移至 early return 前；closed/open/closed 离线 hook 次序测试通过。该弹窗失败保留与报错通过；成功行为仍只根据文件名走 slug 安装，不上传文件字节，不把本地任意 zip 安装视为已交付。
- 仅 Skill 页插件重复顶栏 hidden；宿主 tab 及非 Skill 顶栏未改。关闭/重开运行行为待 L2。
- 推荐卡标题/描述两行、40px/32px固定文本槽；普通卡两行；图片容器 aspect-ratio=16/9、object-fit=cover。容器 ≤380px 搜索折行；宽屏单行、网格 auto-fit。
- Python/Pillow 逐一 decode 48 推荐封面成功。分布：34×1672x941、11×1248x832、3×1280x720。旧45不是精确16:9，未越界更换。
- 三张变更 PNG 均1280x720：brand-promo-video-generator、clip-export、dot-matrix-brand-wordmark-motion；仅此三图发生二进制变化，catalog/index.json在固定diff中未变化，推荐数仍48。
- 三张资源已通过 display_file 打开展示；此为文件展示，不是正式 L2 48卡逐一视觉/无H3验收。实际生成provider无法从文件独立确定；不复述请求provider为事实服务provider。

## L2：只读调查结果与授权所需精确范围

没有执行 `dev-env.sh start`、没有复制或读取凭据内容、没有创建任务 profile、没有改 shared seed/viewer/其他会话或外部 repo。

只读存在性与环境检查：
- `DSH_DEV_HOME`、`OMNIMUX_L2_SEED_PROFILE`、`ALLOW_SEED_FROM_PROD`、`OMNIMUX_DEV_LEGACY_HOME`、`DSH_SRC` 均 unset；DSH_HOME set（未使用其内容）。
- `/Users/x/.dsh-dev/.credentials.yaml`：存在且非 symlink。
- `/Users/x/.dsh-dev/settings.yaml`：存在；`/Users/x/.omnimux-dev/settings.yaml` 亦存在。
- `/Users/x/.dsh-dev/tasks/skill-header-832`、旧 profile `/Users/x/.dsh-dev/profiles/omnimux-dev-skill-header-832`、任务树 `.l2-dev.env` 均不存在。
- 默认 Dev seed manifest/snapshots 存在；manifest仍含 `@crosery/dsh-viewer: file:.materialize-snapshots/plugins/@crosery/dsh-viewer`。未验证其当前 Host 兼容性，不据此称可启动。

正式脚本路径：
1. `scripts/dev-env.sh:678` 默认调用 ensure_task_credentials；`:521-539` 在目标缺失时直接 `cp` 整个 `/Users/x/.dsh-dev/.credentials.yaml` → `/Users/x/.dsh-dev/tasks/skill-header-832/.credentials.yaml`，随后 chmod 600。不是按provider/key筛选，不知道其中有多少凭据，未读取秘密。
2. ALLOW_SEED_FROM_PROD 只控制生产 fallback；设置为0不能禁用已存在的 Dev 种子复制。没有 skip/no-credentials 参数。无种子时函数允许继续，但本机种子存在，不能把该理论分支称为当前合规无凭据路径。
3. 已有任务凭据会跳过复制，但本任务目录不存在；不制造占位文件、不改DEV_HOME、不用legacy共享模式、不绕过门禁来规避授权。
4. 同次 start 随后整文件复制 `/Users/x/.dsh-dev/settings.yaml` → `/Users/x/.dsh-dev/tasks/skill-header-832/settings.yaml`（目标缺失才复制）。设置内容未读取，可能包含配置敏感值，应把此整文件继承同时纳入授权说明。
5. profile初始化从默认 `/Users/x/.omnimux-dev/profiles/omnimux` 复制 package.json、cordis.patch.yml、pnpm-lock.yaml、pnpm-workspace.yaml 与完整 `.materialize-snapshots/` 到 `/Users/x/.dsh-dev/tasks/skill-header-832/profiles/omnimux-dev-skill-header-832/`；不复制seed node_modules/.npmrc，由任务私有store安装依赖，仅market成为在研link。

**当前正式路径没有可直接执行的无凭据启动方式。** 所需授权是允许正式脚本执行上述任务内整文件凭据/设置继承及正式L2初始化（来源只读、不写回），不是允许输出密钥、访问生产或任意跨仓修改。主理人取得授权后另行转达；本子代理不扩大权限。

授权后命令（本轮未执行）：

```sh
OMNIMUX_PLUGINS_DIR="$PWD/plugins" bash scripts/dev-env.sh start skill-header-832 omnimux-market
```

保留 viewer，遵循源闭包/受管seed门禁；若再报依赖或viewer错误记录具体阻断，不换私有harness。启动完成后将真实 URL/PORT/SOURCE/COMMIT/PROFILE_DIR 绑定 `.l2-dev.env`，使用同一 ego task/Tab 的 openL2EgoPage 和正式 verify:live/ego-live-qa.mjs。

## 未验范围 / 下一步与Owner

1. **Engineer** 修复 Q1；处理 Q2 的最小错误路径（若判范围外，必须由主理人明确登记风险，不可冒充安装链已通过）。回传新head及变更报告；QA再执行第2轮回归。
2. **主理人** 获取并转达上述精确bootstrap授权；未授权前 L2 局部 BLOCKED，不影响已完成离线工作。
3. **QA 授权后**：正式L2身份、ego共享探针、宽/分屏/375px、中英/深浅主题、48卡逐一无H3与截断/完整详情、分类横滚与组合搜索、创建单击/连点/工作区/草稿附件保护/无自动发送/右栏保持、安装关闭重开/失败重试、宿主tab关闭重开。
4. 安装写操作只在明确任务L2范围授权内测试；不发送模型请求、不复制真实业务会话、不做付费操作。
5. Registry仍缺workflow构建物；未扩建无关包、未复制无关产物。无关外部修复由主理人协调，不在本QA直接修改。
6. 此diff不改Electron平台门控，按plugin-qa普通Client规则，额外Electron层 N/A；如后续确需证明拖拽/壳原生行为再扩适用项。
7. 未push、未PR、未merge、未部署、未改官方DSH或外部repo。现阶段不具备闭环/放行条件。
