# UI audit fixes — 独立 QA 报告

## 结论

- **IS_PASS: NO。Routing: Engineer。** K1 在多份独立 kit 模块下仍有行为失败；正式 L2 Host 被 viewer/settings API 不兼容阻断。其余已执行离线用例通过，不代表完整 UI 放行。
- 独立 QA：Edward；执行日期 2026-09-09，约 10:26–10:35 Asia/Shanghai；Node v25.8.0。
- 本轮是首轮独立测试及补充验证；未改实现、未进入 Engineer 修复后的第三轮循环。
- 主测试集合：**1015 tests / 1007 pass / 6 fail / 2 skip**。其中 5 fail 是历史制品缺失，1 fail 是新增跨模块 Drawer 回归。基线重复执行 5 fail 不计入主集合。
- Coverage：未收集行覆盖率；F1/F2/F3/K1/K2/K3、Hook、TypeCard、AssetGrid 均有实际 React/DOM 行为检查，但所有正式浏览器专项仍 BLOCKED。

## 固定审查身份与边界

| 仓库 | Base | Head |
|---|---|---|
| 产品 `.worktrees/ui-audit-fixes` | `867b192ecf6aa35be4e1639db7351a89bea782c7` | `7f0dee48eeba47393fd5ddd60caab79014c96bed` |
| kit `.worktrees/ui-audit-fixes` | `9d52a0cd5b41211d4fd8a260330b89d50be99f64` | `eba33873f3ebaf89ba69e8bbe9d53cafd5402283` |

kit 源码构建 commit `98767d80a74bdd375b12f5897856f1fe5ba93de5` 到最终 HEAD 的 src/lib diff 为空。以本地指定 SHA 为准，未 fetch/push/PR/merge。初始产品只有用户提供 tgz/bundles 未跟踪，kit 干净。结束时产品仅增加 QA 测试、报告、证据，既有受审实现无修改；kit 实现与 lib 未修改。

授权仅隔离 L2 正式初始化开发凭据/本地认证和 UI 合成数据；未调用付费模型、真实账号业务，未写 Dev/Prod、共享 store 或官方实现，未创建私有页面。未另委派。

## 发现与路由

### QA-K1-01：共享 Drawer 锁仅在单份模块内生效 — Engineer / P2

- 位置：kit `src/drawer/Drawer.tsx:47–61`，模块级 `scrollLocks` / `acquireScrollLock`。
- 条件：两个独立加载的 kit bundle 的 Drawer 同时使用同一 body。产品 build-client 脚本并未 externalize `dsh-ui-kit`，每个 ModuleLoader factory 拥有自己的模块状态。
- Given：body overflow=`auto`，模块 A 的 Drawer 打开，再打开模块 B 的 Drawer。
- When：关闭 A，B 保持打开。
- Expected：body 仍 `hidden`，最后 B 关闭后恢复 `auto`。
- Actual：关闭 A 立即变成 `auto`。见 `qa-independent.log:16–34`，`ERR_ASSERTION: 'auto' !== 'hidden'`。
- 可复现命令：`UI_AUDIT_KIT=/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit/.worktrees/ui-audit-fixes node --test scripts/ui-audit.independent.test.mjs`，exit 1；4 tests，3 pass / 1 fail。
- 这是实际 React mount/rerender 行为，不是正则。两次独立执行编译模块刻意模拟插件 factory 隔离，不能用同一个模块缓存导入两次替代。
- 影响限定：当前产品 JSX 搜索仅 assets 的 DetailPanel 显式消费 Drawer，未证明当前 UI 存在两个不同插件 Drawer 同时打开的路径，因此不声称已有用户可见 L2 事故。缺陷针对共享 kit 的跨 bundle 所有权，当前单 bundle 双实例、StrictMode、乱序关闭已通过。
- Engineer 下一步：明确并实现跨 kit 实例的容器锁所有权方案，或给出该共享库强制单实例运行的可验证契约；补两种关闭顺序/卸载回归。QA 不擅改实现。

### QA-ENV-01：正式 L2 Host 无法启动 — Engineer / BLOCKED

正式命令（exit 1）：

```sh
bash scripts/dev-env.sh start ui-audit-qa-0909 omnimux-accounts --source=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/ui-audit-fixes
```

- 正式脚本已复制开发 credentials/settings 到任务，pnpm 私有依赖初始化完成（1822 packages），仅 link `omnimux-accounts`。
- 任务：`/Users/x/.dsh-dev/tasks/ui-audit-qa-0909`。
- Profile：`/Users/x/.dsh-dev/tasks/ui-audit-qa-0909/profiles/omnimux-dev-ui-audit-qa-0909`。
- 分配端口 44201；Host PID 6580。20 秒启动检查未监听，随后进程退出。`ps -p 6580 ...` exit 1、`lsof -nP -a -p 6580 -iTCP:44201 -sTCP:LISTEN` exit 1；无 watch.pid。
- 最终实际错误：`failed to import loader entry viewer (@crosery/dsh-viewer): The requested module '@deepseek-ai/dsh-settings' does not provide an export named 'installSettingsSection'`。
- 使用正式脚本默认 DSH_SRC `/Users/x/Desktop/Project/Github/deepseek-harness`，只读 HEAD `dd6322d604e00eec1ba5e0c8541159906a21094a`。未改官方文件。
- 证据：`qa-l2-start.log`；脱敏完整栈 `qa-l2-host-redacted.log`。未记录凭据内容、Cookie 或认证 URL。
- 未移除 viewer、未更换 seed/Host 绕过。因同一 seed 阻断其余四个 profile 的基础启动，不重复克隆四次。账户 L2 任务保留供授权 owner 排障，Host 已退出，无仍运行的本任务后台工作。

### QA-ENV-02：正式入口与工作树依赖解析阻断 — Engineer / BLOCKED

1. `pnpm verify:live accounts --target=l2 --url=http://127.0.0.1:44201/` exit 1：自动依赖检查尝试 install，内层 exit 254，`ENOENT ... scandir '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/personal/dsh-ui-kit'`。日志 `qa-verify-live.log`。未手动修 store/依赖位置。
2. 为区分包管理器与正式 probe，本次执行 package.json 原始入口：`node scripts/agent-live-qa.mjs accounts --target=l2 --url=http://127.0.0.1:44201/` exit 1，`ENOENT .../.l2-dev.env`。日志 `qa-live-direct.log`。
3. 正式 run ID `1710f75b-6d2e-4eb7-b04c-1bedb8970edd`，报告 `.workbuddy/evidence/live-qa/1710f75b-6d2e-4eb7-b04c-1bedb8970edd/live-qa-report.json`，status failed / pass false，未生成 pending 请求、未消费探针。
4. `dev-env.sh` 本身不写 `.l2-dev.env`；`git-wt.sh:254` 仅在成功启动后写。Host 启动失败不能伪造绑定。

### QA-ENV-03：任务受管 kit 不是本次 kit — Engineer / BLOCKED

- 任务受管 snapshot `dsh-ui-kit/lib/index.js` SHA256：`cb27fd9f29182777516098dcec703657810042029bb47c5bc662f9480f4c13fb`。
- 本次绑定应为 `a9dbc0222a3d3ce29465d38e24dc8dbe82ba5ae02140e1fa170fd595eb311d0b`。
- 源码构建依赖确实链接本次 kit，但 L2 稳定 snapshot 不是同一份。当前 linked accounts 本地 bundle 包含修复 kit，不等于全 profile 已绑定新 kit。
- 未调用面向 Dev 的 full sync，未手改 snapshot/profile/store。Engineer/环境 owner 应通过受支持的 task-only snapshot 纳管方式给出精确身份，再恢复 L2。

## 离线行为回归

以下命令均在固定产品任务树执行，kit 命令除外。每条均保留独立日志。

| 命令 | Exit | 实际结果 | 证据 |
|---|---:|---|---|
| `UI_AUDIT_KIT=<上述kit绝对路径> node --test scripts/ui-audit.behavior.test.mjs` | 0 | 12 pass | qa-behavior.log |
| `UI_AUDIT_KIT=<上述kit绝对路径> node --test scripts/ui-audit.independent.test.mjs` | 1 | 3 pass / 1 fail | qa-independent.log |
| kit: `node --test src/**/*.test.js` | 0 | 52 pass | qa-kit.log |
| kit: `node --test src/kit-export.test.js` | 0 | 4 pass | qa-kit-exports.log |
| kit: `npm run typecheck` | 0 | 通过 | qa-kit-typecheck.log |
| `npm --prefix plugins/omnimux-accounts test` | 0 | 62 pass | qa-accounts.log |
| `npm --prefix plugins/omnimux-analytics test` | 0 | 84 pass | qa-analytics.log |
| `npm --prefix plugins/omnimux-inspiration test` | 0 | 189 pass / 2 skip | qa-inspiration.log |
| `npm --prefix plugins/omnimux-publish test` | 0 | 254 pass | qa-publish.log |
| `npm --prefix plugins/omnimux-assets test` | 1 | 347 pass / 5 fail | qa-assets.log |
| `node scripts/verify-stage-contracts.mjs` | 0 | 10 Stage / 8 sidebar contracts | qa-stages.log |
| `git diff --check` | 0 | 无空白错误 | 命令回执 |

- F1：原生 button、th aria-sort、disabled/busy、DataTable 三态、Accounts/Analytics/Publish 消费者通过；独立补测验证 icon click 只回调一次、currentTarget/ref/class/style 仍在 th。
- F2/F3：真实挂载空数据无 CopyButton；请求延迟/失败/重试成功的 badge 状态流通过。Hook null→row→null 通过。没有真实系统剪贴板与浏览器键盘证据。
- K1：单模块多实例通过，跨模块失败，不能无条件称“共享 Drawer 修好”。
- K2：extra button click 不切 tile、keydown 不取消默认行为、本体 Enter/Space 切换通过；独立补测 preventDefault 后代不切换通过。
- K3：execCommand true/false/throw 清理与恢复焦点通过；独立补测现代 clipboard rejection→fallback 通过。
- TypeCard：实际 button 动作语义与 onPick 通过；多行视觉未验收。
- AssetGrid：子选择按钮键盘事件不冒泡、手工 click 不打开父 MediaCard；这不证明真实 Enter/Space 默认 click。
- 未重跑无关模型/registry/Electron；本次 UI 无 Electron-only 变更。工程 boundaries/UI linter 绿仅作为提供方事实，本次独立只复跑 Stage，不将其余旧绿重标为新证据。

## 历史 assets 制品基线核对

- `git diff 867b192e HEAD -- plugins/omnimux-assets/src/final-package-qa.test.js` 空，exit 0；`git show` 字节比较相同。
- `git ls-tree 867b192e plugins/omnimux-assets/omnimux-assets-0.2.0.tgz` 空，exit 0；本地指定 tgz 不存在。
- 从 `git show 867b192e:plugins/omnimux-assets/src/final-package-qa.test.js` 取得原始测试，以 Node stdin 执行，只将 import.meta.url 推导 root 改为同一任务 assets 绝对路径，其余断言不变，复用相同已准备 runtime。exit 1，**同五项 before hook 失败**，`tar ... omnimux-assets-0.2.0.tgz: ... No such file or directory`。见 `qa-assets-baseline.log`。
- 因此确认五项缺失制品失败与固定基线测试在相同供给环境相同，不是本次 UI 引入。此结论不是完整基线仓所有测试重跑，也不是确认旧包内容正确。
- 旧测试固定 48,587,041 bytes / SHA256 `4133161d36e651f04ea97024517c3536c2996e0c4c651d855edc36734ba7bb29`，且要求归档源码与当前源码相同。不能用新包冒充旧 SHA；未修改测试或造包。
- 计数纠正：工程原始 `omnimux-assets-tests.log` 同样是 **347 pass / 5 fail**，README 的“完整348 pass /5 fail”不精确。排除命令的 `assets-business.log` 为 348 pass，不能直接与完整命令相加替换；本报告只使用实际完整命令计数。
- 后续归档供给/测试基线处置由 Engineer 提供合法制品及新版本验收策略，QA 不删历史断言。

## 源码 → lib → tgz → bundle 绑定

- `node scripts/ui-audit.binding-qa.mjs` exit 0：`qa-binding.log` / `qa-binding-result.json`。
- kit tgz SHA256 `57de2a0bff91941b007a805ff13e239a075f7f4f9a0bf207337efbb7915da03f` 匹配 binding；tar 逐个读取 73 文件与固定 kit checkout 逐字节比对，全部一致，安全检查无越界路径。
- kit lib source map 31 个存在的 src 文件 contents 与源码完全一致。
- kit `node_modules/.bin/tsdown --out-dir <产品任务>/docs/implementation/ui-audit-fixes/qa-kit-rebuild` exit 0；未覆盖 kit lib。重建 index.js SHA 与 binding 完全一致；index.d.ts SHA `685cb4dfa1e99b304889402484ff9a22a44557ab992fc81218e2bc12fdad1557` 一致；map mappings / sourcesContent 一致，输出路径导致 map source 相对路径不做原始文件 hash 等同比较。
- 五个插件：执行各自受审 build-client 源码，仅将 root 固定为原插件路径、outFile 重定向 QA 证据目录；实现/构建参数均不变，全部 exit 0，与 binding 的原 bundle bytes/hash 一致。

| Bundle | SHA256 |
|---|---|
| accounts | c36ce5c69a222603c82acd45446868db78c4e13e26ee5d5474051ecb1e777ad6 |
| analytics | 6d2fe8e82af69872f7b5979db8186fd22a8d71efc153307b622df7005ec4bc44 |
| inspiration | c7bbe6e3f8f27c8226733f1b544b05641ca0bbf7f19c2a8238f4f544747e6a5c |
| publish | 104d99cf8cb69cda2b1db3bc63e1aa662d65cb9a3cb703d27704613fd1478448 |
| assets | 16134f3ee047d9ed694efd2ad646a1b0929040a64fd09197a4957c62939d0625 |

- `git bundle verify docs/implementation/ui-audit-fixes/product-fix.bundle` exit 0；包含产品 HEAD，要求指定产品 base。
- kit 仓执行 `git bundle verify <产品任务>/kit-fix.bundle` exit 0；包含 kit HEAD，要求指定 kit base。
- binding.json 未直接存 productHead；由本报告固定 SHA、Git bundle refs 与构建重现补足。建议交付清单明确 productHead，但本次未修改提供方 binding。

## 正式浏览器专项验收矩阵

已加载 ego-browser skill 与 plugin-qa 合同。`ego-browser nodejs` 调用 `listTaskSpaces()` exit 0，工具可用；没有本任务既有空间。Host 已失败，未创建空间/Tab、未导航到无服务端口，也未借用其他任务空间；无需关闭并不存在的新空间。

| 必需专项 | 状态 | 缺少证据 |
|---|---|---|
| accounts / analytics / publish / DataTable 原生 Tab→Enter/Space、忙态、aria-sort、布局 | BLOCKED | 当前 L2 同源页面、真实 keyup/click 序列与 PNG |
| 空脚本/拆解无复制、预置剪贴板未清空 | BLOCKED | 真浏览器/系统剪贴板 |
| 分析 idle→running→failed→done（仅合成受控请求） | BLOCKED | 当前 L2 DOM 与非模型请求拦截证据 |
| Drawer 两实例/乱序关闭/卸载/滚动恢复 | BLOCKED | 真实产品消费路径；跨 bundle 离线另有 FAIL |
| Tile extra、AssetGrid 子选择按钮默认键盘激活 | BLOCKED | 真浏览器键盘不串扰 |
| publish 多行按钮视觉、主题及几何 | BLOCKED | 可解码真实 PNG |
| `runPreparedQa` 身份、Stage、会话、runtimeProof | BLOCKED | Host/正式 allocation/request 均未就绪 |

未将 JSDOM、手工 click、HTTP 状态、私有页面或旧截图替代这些证据。

## 下一步与收口

1. **Engineer**：处理 QA-K1-01，保留并通过独立测试，提供新 kit/build/tar/bundle 对应 SHA。
2. **环境 owner / 主理人**：在已有授权边界内提供兼容的受管 viewer/Host 及 task-only kit 纳管方案；不得由 QA 擅自修 shared Dev 或删除 viewer。
3. **Engineer**：澄清 assets 历史制品验收策略及完整计数；QA 已证明当前五失败为基线相同条件。
4. **QA**：得到新实现/合规 L2 后执行剩余一次回归及正式 ego 专项。当前不可放行、不可归档为验收完成。没有正在等待的运行任务，不声称后台继续。
