# #3616 3D 导演台入口引导卡与逐次截图独立节点 — 真实浏览器证据

- 任务：`workflow-director-node-card-issue-3616`（Issue #3616）
- 证据目录：`docs/evidence/2026-10-22-director-node-card-3616/`
- 采集方式：本工作树内真实浏览器（ego-browser / ego lite），任务私有 `ui` 合成环境
- 状态：**PASS** — 4/4 断言通过，2 张 PNG 可解码且 >1KB，任务空间已自清理
- 版本：**最终修复版（含独立评审 LOW-1 / LOW-2）复跑**，本目录留存的断言/旅程/产物即该轮结果（runId `evidence-mvjtexdm-cp6181`，2026-10-23 01:28:45 → 01:30:09 +08:00）

## 一、结论

本节结论对应「最终修复版（含 LOW-1/LOW-2）复跑」，即本目录当前留存的证据。在本工作树源码构建并安装的任务私有运行时里，用真实 Chromium 走完整条用户路径后确认：

1. 画布新增的「3D 导演台」节点已变成**入口引导卡**：`.wf-director-card` 内**没有 `img`、没有 `textarea`**，只有图标、标题「3D 导演台」、说明「在 3D 空间中搭建场景并进行多视角截图。」和「打开导演台」按钮；节点右侧连接桩 `.wf-handle--right` 存在（`wf-handle--plain`，`id` 为空，`type=source`）。
2. 导演台内每点一次「截图」（`aria-label="截图"`，唯一可点实例），画布就新增**一个独立 material 图片节点**并自动连线回导演台节点：第 1 次得到 `主摄影机-shot-01` + 1 条 `director-screenshot-*` 边；第 2 次得到 `主摄影机-shot-02`（与 shot-01 是**不同节点 id、不同画布坐标**）+ 第 2 条边。两次点击期间都没有出现任何错误 toast（含「截图来源已变化，请重新截图」）。
3. 点「关闭导演台」后，导演台节点卡仍然**不含 `img`、不含 `textarea`**——关闭不再截图回写当前节点；两个截图节点与两条边都保留。

未覆盖/未断言的部分见「六、限制」。

## 二、运行身份与命令

### 运行身份

| 项 | 值 |
| --- | --- |
| worktree | `.worktrees/workflow-director-node-card-issue-3616` |
| HEAD | `fa53080ab0552a0d9f3fac63c5c5bb9d9d789b33` |
| base (`origin/main`) | `60deb4be954ff4bd1f0a051ec1a27fccf63af7f6` |
| runId | `evidence-mvjtexdm-cp6181` |
| evidenceContext | `{ taskId: '3616', runId: 'evidence-mvjtexdm-cp6181' }` |
| candidateDigest | `ca386d7dcad4b695b2b71791f9c82a8cb1acc4075e0a4dde6b4f4123263633bf` |
| inputsDigest | `abf4d19b6c63303c26e2d4b010a1110925cfc8f4873c8fc4d6ae02e74723412c` |
| evidenceLevel | `task-source-installed`（从本工作树源码构建、打包、安装，不复用 `lib`/`dist` 缓存） |
| taskPlugins | `omnimux-workflow`, `omnimux-automation`（+ 核心 `omnimux`，`taskPluginsCount=3`） |
| mode | `ui`（合成环境，`modelConfiguration=QA模拟`，`realModelRequest=false`） |
| seededWorkspace | `ws_qa_media`（`seededDataDomains=['synthetic-workspace']`） |
| 运行时来源 | `startTestEnvironment({ root, mode:'ui', evidenceContext, candidate:{base,head}, taskPlugins })` |
| 浏览器 | ego-browser 0.6.0.16（Chromium 154.0.8037.44） |
| Node / Python | node v25.8.0 / `/usr/local/bin/python3` (3.12) |
| 采集时间 | 2026-10-23 01:28:45 → 01:30:09 (+08:00)（UTC 2026-10-22T17:28:45Z → 17:30:07Z） |

运行器（工作树内临时脚本，未纳入源码）：`.workbuddy/issue-3616/run-evidence.mjs`
证据原始 JSON 里只保留 loopback 运行时 origin（`http://127.0.0.1:64015`）；**登录 URL/token 一律未写入任何证据文件**（证据目录内 grep `token|loginUrl|secret|authorization` 无命中）。

### 复跑记录（评审 LOW-1 / LOW-2 修复后）

| 轮次 | 被测源码 | runId | origin | 结果 | 时间 (+08:00) |
| --- | --- | --- | --- | --- | --- |
| 第 1 轮（首次 PASS） | `DirectorPanel.tsx` 两条 LOW 修复前 | `evidence-mvjr5xg8-53p29c` | `http://127.0.0.1:61585` | 4/4 PASS | 00:25:46 → 00:27:19 |
| 第 2 轮（**本目录当前证据**） | 含 LOW-1（只有 `rolledBackNodeIds` 确实回滚了该节点才删边）+ LOW-2（`addScreenshotNode` 账本确认交叉校验 ledger 的 size/mimeType） | `evidence-mvjtexdm-cp6181` | `http://127.0.0.1:64015` | 4/4 PASS | 01:28:45 → 01:30:09 |

- LOW-2 落在截图 happy path 上（新增 size/mimeType 交叉校验），因此本轮复跑专门证明：两次「截图」仍各自建出独立图片节点并自动连线，且**两轮都未出现任何 error toast**（`assertions.json` 两个截图断言的 `toasts` 均为 `[]`）。
- 本轮「截图」按钮可点实例仍为唯一（`total=1, actionable=1, disabled=false`），未出现「截图来源已变化，请重新截图」。
- 两轮产物对比：`node-card.png` 字节数与 sha256 完全一致（入口卡渲染确定性）；`canvas-screenshot-nodes.png` 因节点/边 id 与画布状态不同而变化（见第四节）。
- 本轮两个截图节点的 DOM 身份：`主摄影机-shot-01` = `80ec6c77-8f2a-411d-a7d5-62e99961e357`、`主摄影机-shot-02` = `fa33b68b-aa40-481b-ae58-832922c4904e`，对应两条边 `director-screenshot-80ec6c77-…` / `director-screenshot-fa33b68b-…`。

### 命令 1 — 启动任务私有环境（含从源码构建/打包/安装）

```bash
cd /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/workflow-director-node-card-issue-3616
DIRECTOR_EGO_BROWSER=/Users/x/.local/bin/ego-browser \
  node .workbuddy/issue-3616/run-evidence.mjs
```

实际结果（日志 `.workbuddy/issue-3616/run.log`，身份 `.workbuddy/issue-3616/runtime.json`）：

```
[3616-evidence] 2026-10-22T17:28:45.179Z ego=ego-browser 0.6.0.16 python=3.12 base=60deb4be954f head=fa53080ab055 runId=evidence-mvjtexdm-cp6181
[3616-evidence] 2026-10-22T17:28:45.218Z starting task-private ui environment (builds+packs task plugins from this worktree)
[3616-evidence] 2026-10-22T17:29:38.361Z app ready evidenceLevel=task-source-installed taskPluginsCount=3 origin=http://127.0.0.1:64015
```

环境就绪耗时约 53s，`startTestEnvironment` 未返回任何 `TEST_ENV_*` 失败码（首轮那次 `TEST_ENV_PREPARE_INPUT_UNSUPPORTED` 未复现）。

### 命令 2 — 浏览器 journey（ego-browser 子进程）

运行器通过 `runBrowser()` 以子进程方式执行，等价形态为：

```bash
DIRECTOR_EGO_BROWSER=/Users/x/.local/bin/ego-browser \
  ego-browser nodejs < <journey 脚本>      # spawn(executable, ['nodejs']) + stdin 传入 journey
```

journey 内 `taskSpace("3616 director entry card <ts>")` → `p1` → `goto(loginUrl)`，全程 1 个任务空间、1 个页面。实际结果（`.workbuddy/issue-3616/browser-process.json`）：

```
exitCode=0  signal=null  timedOut=false  diagnostics=[]
[3616-evidence] 2026-10-22T17:30:07.060Z browser journey exit=0 timedOut=false diagnostics=[]
[3616-evidence] 2026-10-22T17:30:07.061Z PASS assertions=node-card-entry-guide,screenshot-a-creates-image-node,screenshot-b-creates-second-node,close-director-keeps-card-image-free
```

journey 耗时约 29s。journey 实际步骤：首启提示 `Continue` → Projects → New Project → 画布工具条 `+` → 菜单项 `3D Director` → 断言入口卡 → 点「打开导演台」→ 等 `.director-viewport-shell[data-renderer-ready="true"]` → 点「截图」×2 → 点「关闭导演台」→ Fit View → 截图。

## 三、断言表

断言名与 `assertions.json` 顺序一致（`assertions-readback.json` 已核对 `expected == actual`，`allPassed=true`）。

| # | 断言名 | 结果 | 关键观测 |
| --- | --- | --- | --- |
| 1 | `node-card-entry-guide` | PASS | `.wf-director-card` 存在；`imgCount=0`、`textareaCount=0`；`hasCaption=true`（含「在 3D 空间中搭建场景并进行多视角截图。」）；`hasOpenCta=true`（`.wf-director-card__cta` = 打开导演台）；`hasIcon=true`；`hasRightHandle=true`（`wf-handle--plain wf-handle--right`，`type=source`）；卡内文本 `3D 导演台在 3D 空间中搭建场景并进行多视角截图。打开导演台`；此时画布仅 1 个节点、0 条边 |
| 2 | `screenshot-a-creates-image-node` | PASS | `.wf-director-root` 可见且 `data-renderer-ready="true"`；`aria-label="截图"` 唯一可点实例（`total=1, actionable=1, disabled=false`）；点击后出现 material 节点 `主摄影机-shot-01`（`80ec6c77-…`），`edgeCount=1`（`director-screenshot-80ec6c77-…`）；toast 为空 |
| 3 | `screenshot-b-creates-second-node` | PASS | 再点一次「截图」后画布同时存在 `主摄影机-shot-01`(`80ec6c77-…`) 与 `主摄影机-shot-02`(`fa33b68b-…`)；两节点 id 不同、坐标不同（shot-01 `x=1460,y=275`，shot-02 `x=1460,y=645`，各 350×632），即**新增而非覆盖**；`edgeCount=2`；toast 为空 |
| 4 | `close-director-keeps-card-image-free` | PASS | 点「关闭导演台」（pointer click 成功）后 `.wf-director-root` 消失；`.wf-director-card` 仍在且 `imgCount=0`、`textareaCount=0`；两个截图节点与两条边全部保留（`edgeCount=2`）；Fit View 后落盘画布截图 |

## 四、媒体产物（sha256）

| 文件 | 含义 | 字节 | sha256 |
| --- | --- | --- | --- |
| `node-card.png` | 入口引导卡特写（382×406）：立方体图标 + 标题「3D 导演台」+ 说明文案 + 「打开导演台」按钮；无封面图、无描述输入框 | 13 866 | `4d217ca9f8323da1ebf21db67fa0c45c2454e912c28b1f740b2eb579703b426c` |
| `canvas-screenshot-nodes.png` | 关闭导演台并 Fit View 后的画布（1728×883）：导演台入口卡节点 + `主摄影机-shot-01` / `主摄影机-shot-02` 两个图片节点 + 2 条自动连线 | 109 627 | `9ee791eeb25bb7bf6ad09b880ed3e2ee641286ada1692aa5004470da873ae9e8` |

两张 PNG 均通过 PNG 魔数（`89 50 4E 47 0D 0A 1A 0A`）校验且 >1KB（`artifacts.json`）。截图由真实 Chromium 渲染产生，非单测/HTTP 200 替代。
`node-card.png` 两轮 sha256 完全一致（入口卡渲染确定性）；`canvas-screenshot-nodes.png` 本轮 sha256 为 `9ee791ee…`（首轮 `69a8fb88…`），差异来自节点/边 id 与画布状态，构图与结论一致。

配套原始证据：

| 文件 | 内容 |
| --- | --- |
| `assertions.json` | 4 条断言的完整观测明细 |
| `assertions-readback.json` | `expected`/`actual` 断言名集合与 `allPassed` |
| `journey-detail.json` | journey 关键节点事实（卡片文本、两次截图节点标题/边 id、最终画布节点矩形） |
| `artifacts.json` / `result.json` | 产物摘要与运行结论 |
| `browser-cleanup.json` / `completion.json` | 任务空间清理回执与 journey 完成标记 |
| `space.json` | 任务空间 id/名字（无 URL、无 token） |

## 五、清理

- ego-browser：`task.finish({ keep: [] })` 已执行 —— `browser-cleanup.json`：`spaceId=220`、`closedSpace=true`、`keptManagedLabels=[]`、`closedManagedLabels=["p1"]`、`preservedUnmanagedCount=0`。未保留任何 Agent 管理页面（首轮空间 214 亦已关闭）。
- 任务私有环境：`app.cleanup()` —— `.workbuddy/issue-3616/cleanup.json`：`cleaned=true`，`app-child` / `mock-server` / `app-private-directory` 三项均 `completed`；工作树内无残留 `.test-env-*` 目录。
- 未修改任何源码/测试/规格：`git status --short` 仅显示本次任务既有的源码改动与 `specs/3616-…spec.md`、`tests/e2e/director-node-entry-card-3616.e2e.test.mjs`，无本次证据采集引入的改动。

## 六、限制

1. **截图构图**：`canvas-screenshot-nodes.png` 中 `主摄影机-shot-01` 的节点标题栏被画布顶部浮动工具条（「Check generation inputs」/缩放胶囊）遮挡；两个图片节点本体、两条连线和 `主摄影机-shot-02` 标题清晰可见。shot-01 的标题与矩形由 `assertions.json` 第 3 条与 `journey-detail.json`（`x=1460,y=275,350×632`）以 DOM 事实记录，未依赖该截图判读。**该构图限制在两轮复跑中都存在**（两轮画布截图构图一致）。
2. **未断言**：截图节点内图片字节的真实可解码性（如 `naturalWidth>0`）与节点 `mediaUrl` 的 HTTP 200 未单独断言；本次只断言「独立 material 图片节点 + 连线」这一 UI 出口。图片节点在画布上渲染为黑色区域，与 `ui` 合成环境（`modelConfiguration=QA模拟`）的截图内容一致。
3. **环境约束（装配前提，复跑必须遵守）**：`scripts/test-env-bootstrap.mjs` 的 `copyTree` 会为候选白名单之外的磁盘条目抛 `TEST_ENV_PREPARE_INPUT_UNSUPPORTED`。本工作树 `plugins/omnimux/lib/` 下两个**被 gitignore 的构建产物** `client.js`、`client.metafile.json`（`plugins/omnimux/.gitignore` 第 1–2 行）正落在该路径上：2026-10-22 16:17:10 首次运行即因此失败（失败码原样保留在 `.workbuddy/issue-3616/run.log`），2026-10-23 01:00 lead 用 `corepack pnpm --filter omnimux build` 重新生成后，本轮复跑同样必须先把它们临时移出 `plugins/omnimux/lib/` 才能装配（移出后本轮未再出现该失败码）。**当前状态（2026-10-23 01:57 lead 再次重建后）：`plugins/omnimux/lib/client.js` 与 `client.metafile.json` 已归位**（sha256 与移出副本逐字一致）；临时副本仍在 `.workbuddy/issue-3616/parked/`（gitignore、不入库）。**下次采集证据前仍须再次移出**，否则装配必然失败。该约束与本次两条 LOW 修复无关，是 bootstrap 与既有构建产物之间的既有摩擦。
7. **e2e 契约位置**：本轮证据对应的静态契约测试位于 `tests/e2e/director-node-entry-card-3616.e2e.test.mjs`（与仓库根 `tests/e2e/` 下 147 个既有用例同一约定位置；曾短暂尝试迁入 `plugins/omnimux-workflow/tests/e2e/`，因测试只读门禁禁止改写既有断言而保持原位置，路径与 `root` 解析一致）；真实验收凭证仍是本目录留存的浏览器证据，该测试只锁源码契约。
4. **语言**：本次运行时 UI 为英文（`New Project` / `3D Director` / `Fit View`），因此按钮文案断言走的是 DOM class 与中文卡片文案（卡片文案本身为源码固定中文）；断言未覆盖中文语言包下的菜单项文案「3D 导演台」。
5. **端口/地址**：证据中记录的 `http://127.0.0.1:64015`（本轮）与 `http://127.0.0.1:61585`（首轮）都是任务私有运行时的一次性 loopback origin，不是 Dev 45120，也不代表可复现地址。
6. **证据入库方式**：本目录被 `.git/info/exclude:23`（`docs/evidence/*`）本地排除，`git status` 默认不显示；交付时由 lead 用 `git add -f docs/evidence/2026-10-22-director-node-card-3616/` 显式纳入变更集合（与近期 `docs/evidence/canvas-add-node-squircle/` 的做法一致）。
