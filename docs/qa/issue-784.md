# Issue #784 独立 QA 报告

## 当前结论（第二轮独立 QA）

**源码返修 Routing: NoOne；离线回归 PASS。整体不放行：真实 L2 / ego + verify:live / Electron 验收 BLOCKED。**

2026-09-08 第二轮明确授权后的最终回归：104 tests / 104 pass / 0 fail / 0 skip，12 suites。QA-784-01、QA-784-02 均已修复；保存副作用和重复 portal 开关的新增覆盖通过。没有发现本次返修新增源码缺陷。ErrorBoundary 宿主中文及既有跨节点/导入并发风险仍未扩改，不宣称全量翻译或真实媒体验收完成。第二轮详细证据与剩余验收见本文末节。

## 首轮历史结论（保留，不代表当前状态）

**首轮不放行。Routing: Engineer；Known Issues: 2 个已复现源码缺陷。真实 L2 / ego / Electron 验收 BLOCKED。**

首轮独立 QA 期间执行两次测试（第二次仅修复 QA 的 JSDOM fixture），达到该次上限后停止；随后由主理人交回工程并明确授权本次第二轮最终回归。本报告保留首轮证据，不循环自授更多测试轮次。

## 身份与范围

- QA：Edward，独立于工程执行者，2026-09-08 16:16–16:21 Asia/Shanghai。
- 唯一工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/composition-locale-784`。
- Branch：`agent/cross-composition-locale-issue-784`。
- 固定 base / HEAD：`0fe89ef047c687d156204fa48a177d92d590c6a4`；目标为其上的未提交 diff，不冒充远端 tip 审核。
- 已完整读取工程交接 79 行、实际 tracked diff、两个新增工程文件、相关组件/store/ingestion/bridge、AGENTS、plugin-qa、dev-pipeline、ops-entry、plugin-git-pr；加载 repo-workflow、dsh-plugin-dev、ego-browser。
- 未修改生产源码、共享依赖、外部 fork、官方 DSH、Dev/Prod/profile；未 commit/push/PR/merge/物化/启动或重启 App。
- QA 新增：`plugins/omnimux-clip/src/client/composition-locale-qa.test.js`。用现有 React 18 + JSDOM + esbuild 渲染真实包装组件、真实 useHostLocale、真实 stage store/portal；仅替换 OpenReel 媒体/引擎、项目 I/O、ingestion 与桥接通知作为单元边界。没有自建可冒充 L2 的页面或服务。

## 实际执行结果

所有 pnpm 命令均前置 `pnpm_config_verify_deps_before_run=false`，未安装依赖或允许隐式 purge。

| 检查 | 实际结果 | 说明 |
|---|---|---|
| 首次 `corepack pnpm --filter omnimux-clip test` | exit 1，98 tests / 95 pass / 3 fail / 0 skip，12 suites | 2 源码缺陷 + 1 QA fixture 缺少 HTMLStyleElement |
| QA 自修 fixture 后同命令 | exit 1，98 tests / 96 pass / 2 fail / 0 skip，12 suites | 两个源码缺陷稳定复现，停止测试循环 |
| `corepack pnpm verify:stages` | exit 0，10 Stage / 8 sidebar targets | 静态合同，不是运行验收 |
| `git diff --check` | exit 0 | 未发现空白错误 |
| `gh issue view 778 --repo omnimux-ai/omnimux-dsh --json number,state,title,updatedAt` | exit 0，OPEN | updatedAt=2026-09-08T07:51:08Z |
| Dev seed manifest 只读检查 | exit 0 | viewer 仍指向备份绝对 tarball，详见阻断 |
| build / boundaries / i18n / workflow typecheck | 本轮未重跑 | 工程报告成功，源码未被 QA 改动；不归为 QA 独立通过 |

原始日志：`docs/qa-784-test-output.txt`、`docs/qa-784-regression-output.txt`。覆盖率未量测，不填写虚构百分比；新增4条行为测试，最终2通过2失败。

### 新增行为测试

1. PASS：非 slot Studio 在 initial=en 时显示实际字典 My video；变更为 zh 立即刷新，revision-only 通知可处理，卸载释放订阅，再挂载读取 en。此为模拟宿主快照，不证明实际 Host 持久化。
2. FAIL：English Studio preset options contain no untranslated Chinese directions。
3. FAIL：saved hostbar status changes language without saving again。
4. PASS：返回调用通知并清空 stage.activeSession；隐藏时仍保留同一 portal/editor DOM；同节点重开没有卸载/重新挂载；隐藏期间切 en 后重开显示 Back to canvas。媒体编辑器被 mock，此项证明宿主组件身份保活，不证明真实 OpenReel 时间轴或导出。

## 源码缺陷（交回 Engineer）

### QA-784-01：英文宿主的分辨率选项仍为中文（P2，中）

- 文件：`plugins/omnimux-clip/src/client/OpenReelStudioTab.jsx:12-17,117-120`。
- 复现：宿主语言 en → 无已打开项目的 Studio 创建页 → 查看分辨率下拉。
- Expected：宿主包裹层方向标签跟随 en / zh（例如 Landscape / Portrait / Square）。
- Actual：`横屏 1920×1080竖屏 1080×1920方形 1080×1080横屏 1280×720`。
- 失败位置：`composition-locale-qa.test.js:75-79`；AssertionError ERR_ASSERTION / doesNotMatch。
- 判断：这不是 OpenReel vendor 文案，而是本仓宿主创建表单直接输出的 PRESET_OPTIONS，属于已承诺的宿主包裹层语言适配。工程列为“未覆盖”不能自动缩减验收范围。
- 最小建议：preset 配置只存方向 key/value；render 时使用宿主 t 与当前字典拼接尺寸，补 zh/en key；不新增第二语言源。

### QA-784-02：已保存提示不会随语言切换刷新（P2，中）

- 文件：`plugins/omnimux-clip/src/client/OpenReelStudioTab.jsx:200,220-232,242,249-252`。
- 复现：zh 下有项目 → 保存成功显示“已保存” → 宿主切 en → 不再次保存。
- Expected：hostbar status 为 `Saved`，与旁边已变成 `Save` 的按钮一致。
- Actual：status 持续为 `已保存`；组件虽然重绘，但状态保存的是旧语言字符串。
- 失败位置：`composition-locale-qa.test.js:81-90`；AssertionError `已保存 !== Saved`。
- 最小建议：存 `saving/saved/saveFailed` 语义状态，渲染时 t(key)。不要通过 locale effect 重新发保存请求，也不要把 t 加入 autosave deps 造成不必要保存。异步成功/失败均更新状态 key。

## 真实验收阻断与下一动作

### L2：BLOCKED（已只读核查，不盲启动）

实际 seed：`/Users/x/.omnimux-dev/profiles/omnimux/package.json`。

```
@crosery/dsh-viewer = file:/Users/x/Desktop/Project/dsh-desktop/backups/omnimux-dev-install-dsh-viewer-20260907-190742/crosery-dsh-viewer-0.1.0.tgz
```

`pnpm-lock.yaml` 存在，但 seed manifest 已足以确定无法通过当前 `scripts/dev-env.sh:283-308`：每个 file: spec 必须精确为 `file:.materialize-snapshots/plugins/<name>`，否则抛出“未受管 file: 依赖”。#778 当前仍 OPEN，未见依赖已解除的事实。本轮没有执行 start，也不把静态推断说成新启动失败日志。未复制 profile、绕过 seed、接入其它任务环境或修改外部实现。

- 本任务没有 `.l2-dev.env` 运行身份绑定、池内 URL、Host PID/启动时间、task profile 或运行 bundle 指纹。
- ego skill 已加载；没有因无法建立合法 L2 而打开共享 Dev 代测，也未创建 ego task/Tab。不存在浏览器所有权接管或待清理任务。
- `verify:live` 未发起（不是 pending/pass），没有真实 PNG / runtimeProof。
- Electron 原生拖拽实际点击未执行；无本任务源码身份的 renderer 证据，不能将 JSDOM click 或 web computed style 冒充原生命中证据。
- 下一 owner：主理人协调 #778 正式解除依赖并提供合规 seed；之后用正式 fork `yarn omnimux:dev start ...` 入口仅 link clip、SOURCE 指向本树，先绑定核对后的 commit，再按 plugin-qa 的 openL2EgoPage + 同任务 verify:live 完整验收。不可把修复 seed 交给当前 QA 越权完成。

## 状态/跨节点与剩余风险

- `lastSession` 确实修正了同 canvas portal 关闭即卸载的问题；同节点立即重开保留 DOM 的 offline 测试已通过。语言订阅保留 this，读取完整 snapshot，无第二语言存储，无 locale key 重挂载。
- 跨节点不是已解决能力：`useCanvasIngestion.ts:86-102` 切 node 清 processed，但只在没有打开项目时新建项目，当前 project store 仍全局共享；projectId/draftSchema 不在该 hook 中恢复。A→B→A 不保证各节点工程隔离，不应宣传为跨节点草稿恢复。此为既有路径的静态风险，未列为本次新增回归。
- 导入并发必须实测：`useCanvasIngestion.ts:154-163` 在 fetch 前检查 isMounted，await fetch 后没有再检查就 importMedia；关闭后保留 session 会允许导入继续，切节点 cleanup 也不保证停止已在途一次导入。`processedRef` 比较 raw，却写 item.url，对本地路径可能不能去重（112/121/132 对比156）。这些为既有未改代码，不应因本次 portal 保活而宣称全部修复；需主理人裁定最小必要补测/归属。
- return row 为 8px+32px+8px 的独立行，静态布局移除重叠64px占位有明确依据；无法从JSDOM证明短窗口 clipping、Export可点击、长文案不截断。真实窄/短窗口、异步导入时返回、编辑时间轴后重复开关仍待 L2。
- 真实系统语言初载 provisional→Host 接管、持久化刷新、实际 DSH 与 OmniMux Dev 设置入口都未运行。新增测试的“remount”不是浏览器 reload 持久化证据。
- OpenReel vendor 大范围硬编码英文可明确作为本补丁外的范围限制；不能与宿主文件中的 preset/status 混为同一种排除。ClipErrorBoundary中文也是宿主错误路径残留，应由工程在同次语言收口中核对，而非宣称vendor所致。

## 收口条件

1. Engineer 修复两个已复现包裹层语言缺陷，保留新增失败测试，不改断言隐藏问题。
2. 主理人取得合规 L2 seed；当前 QA 不继续第三轮测试。后续修复验收必须显式安排新的有界 QA 任务。
3. 完成真实 canvas 修改→返回→重开、跨节点风险确认、en/zh实时切换与刷新、短窗口/Export；原生 drag 场景追加 Electron 真实鼠标命中证据。
4. 所有适用证据到齐前：不可 qa:pass，不可将本地工程通过写成整体通过，更不可合入或物化。

## 第二轮最终独立回归（2026-09-08）

### 身份、边界与路由

- QA：Edward；16:28–16:34 Asia/Shanghai。完整读取工程交接 113 行（含返修段）和首轮 QA 95 行，再读取实际 diff、Studio、ClipStage、locale hook、原 QA 测试及 plugin-qa / plugin-git-pr / seed gate。
- 唯一树及 base / HEAD 均与上文一致：`0fe89ef047c687d156204fa48a177d92d590c6a4`，目标为未提交 diff；未 fetch/切树或把远端 tip 当成本轮目标。
- 接收时原 QA 文件 SHA-256 与工程记录一致：`7195cff01bc02bb438c582baf999010876b49fd13c892618f9f7c8b7c5a2c218`。原4条测试和全部断言保留；只增强项目 I/O mock 的可计数/可延迟 seam，并追加6条行为用例。
- 本次最终全包回归只执行一次，无失败重试，无第三轮。源码返修 Routing: **NoOne**；QA fixture 无剩余失败，不路由 QA 自修。环境验收为 **BLOCKED**，不能将环境问题误报为返修源码失败，也不能据离线 PASS 整体放行。
- 本轮仅修改 QA 测试和本报告，新增两份 QA 输出日志。未修改生产源码、工程报告、其他树、官方 DSH、fork、共享 profile 或依赖；未构建/安装/commit/push/merge/物化/启动/重启。

### 实际执行检查

所有 pnpm 命令前置 `pnpm_config_verify_deps_before_run=false`，不允许隐式安装或 purge。

| 检查 | 本轮独立结果 | 证据边界 |
|---|---|---|
| `corepack pnpm --filter omnimux-clip test` | exit 0；104/104 pass，0 fail / skip / cancelled / todo，12 suites | 全部包声明的测试入口；含原 QA 4/4 和本轮新增6/6 |
| `corepack pnpm lint:i18n` | exit 0；8 locale files / 12 manifests | 非 vendor 全量翻译证明 |
| `corepack pnpm verify:stages` | exit 0；10 Stage / 8 sidebar targets | 静态合同，非 UI 证据 |
| `corepack pnpm check:boundaries` | exit 0；2123 source files | 依赖及运行边界静态校验 |
| `git diff --check` | exit 0 | 最终报告更新后复核 |
| build / workflow typecheck | 本轮未运行 | 复用交接中的工程 build exit 0；workflow 源码/桥接签名未变，前序 tsc 非本轮独立通过。Clip 无独立 typecheck |
| #778 / seed | 只读复核成功，阻断未变 | 详见下节；未 start |
| ego + `verify:live` / Electron | BLOCKED，未发起 | 无 pending 请求、runtimeProof 或真实 PNG，不冒充 pass |

完整输出：[第二轮全包测试](../qa-784-round2-test-output.txt)、[第二轮门禁](../qa-784-round2-gates-output.txt)。覆盖率未量测；104 是包声明测试数，不是全 vendor 测试或覆盖率。

### 两项返修与副作用验证

1. **QA-784-01 已修复**：`OpenReelStudioTab.jsx:12-17,117-120` 存方向 key / 尺寸 value，render 调 t；`index.js` zh/en 与中文 fallback 的三个 key 一致。测试精确断言4个英文标签与4个中文标签；选择 `1080x1920` 后 en→zh→en 不改变实际表单值。不是仅“没有中文字”的弱通过。
2. **QA-784-02 已修复**：`OpenReelStudioTab.jsx:223-235,245,250-255` 手动和自动分支保存语义状态，渲染翻译；无 locale effect，autosave deps 仍为 `[hasOpenProject, project]`。
3. **无语言切换额外保存（离线行为证据）**：4个参数化用例覆盖 manual/auto × saved/saveFailed。拦截且仅拦截1200ms debounce 定时器，执行真实 effect 回调；用延迟 Promise 验证 Saving…↔保存中…、成功/失败 settled 状态 zh→en，revision-only 通知后 I/O 调用仍1次，timer 总调度仍1次。首次切语言时 I/O 为0，不重置既有 autosave deadline；卸载清空未执行 timer。手动保存原先就可能与挂载 autosave 共存，本轮不把已有定时器误算成语言引起的额外保存。
4. **重复 portal 保活（离线行为证据）**：同节点5次返回→隐藏期间切语言→重开，逐次检查 stage closed / activeSession null、display:none、原 portal host 包含同一 editor DOM、mount=1 / unmount=0、正文与 aria-label 一致、每次通知一次；最终卸载为1、locale listener 清空。原单次测试仍通过。OpenReel/ingestion 是 mock，不证明媒体内容、时间轴、导出或异步导入保留。

### 当前阻断：只读复核，未重新启动

- `gh issue view 778 --repo omnimux-ai/omnimux-dsh --json number,state,title,updatedAt` exit 0：**OPEN**，updatedAt=`2026-09-08T07:51:08Z`，与首轮一致。
- `/Users/x/.omnimux-dev/profiles/omnimux/package.json:33` 的 viewer 仍为首轮记录的备份绝对 tarball；本树 `scripts/dev-env.sh:283-308` 仍要求精确 `file:.materialize-snapshots/plugins/<name>`。这是当前静态 gate 不能通过的直接证据，不伪称一次新的启动失败。
- 未创建 `.l2-dev.env`、ego task/Tab 或共享探针请求；未访问共享 Dev 45120/官方 DSH 代测。无浏览器接管/待清理 task，无 Electron 本任务身份 renderer 证据。

### 精确剩余验收与 owner

以下均是必需证据缺口，不是本轮已完成事项；当前不能归档、qa:pass、合入或物化。

1. **主理人 / #778 owner**：完成 #778 并提供正式合规 seed；未变前不重复 start，不由 QA 越权修 seed、改 fork 或使用共享 Dev。依赖解除后，由主理人明确安排有界运行验收，不重新开启无限工程/QA循环。
2. **运行 QA owner**：按正式入口建立 SOURCE 指向本树、仅 link clip 的独立 L2（池44201–44299、任务profile），绑定核对后的 commit/dirty身份与 `.l2-dev.env`；记录 URL、profile、Host PID/启动时间及实际 bundle 指纹。在同一 ego task/Tab 通过 `openL2EgoPage` 与共享 `verify:live` 完成身份、Stage断言、runtimeProof、真实可解码PNG及清理。
3. **画布行为**：同会话同Tab的视频合成节点→真实导入/修改时间轴或剪辑参数→鼠标返回→画布可继续点击且节点编辑状态退出→重开保留实际编辑；重复至少5次，并覆盖导入尚在途时返回/重开。A→B→A 应确认既有共享 project/并发风险的可接受边界，不能宣称每节点独立草稿恢复。
4. **宿主语言**：Stage与Studio实际设置en/zh切换；首载 provisional→Host接管、已开页面、保存 pending/success/failure 显示和真实网络保存次数、刷新后偏好保持；返回正文及aria一致、方向选择值不变。明确 vendor 英文不是本补丁全面翻译目标。
5. **布局与导出**：记录实际窄/短窗口尺寸，检查48px返回行、长返回文案无裁切、不遮挡OpenReel Export；真实点击并产出可播放/可导出结果，不用 mock 或CSS字符串替代。
6. **Electron QA owner**：同候选源码身份在 compatibility/extended 两种适用模式用真实鼠标点击返回按钮，确认不被 native drag 截获，保存renderer/CDP、平台/模式和操作证据；执行适用 `verify:cdp`。Web click/DOM事件不是原生命中证据。当前启动/重启不在本轮授权内。

### Known Issues / 非本次新增回归

- `ClipStage.jsx:34,43` 的 ErrorBoundary 标题与重试为**宿主中文残留**，工程已承认，本轮只读核实；不把它冒充 vendor 排除，也不宣称宿主全路径翻译完成。按照本轮明确的两项返修范围未扩改、未新增为返修失败；整体语言覆盖声明必须保留此限制。
- 原报告中的跨节点共享工程、await 导入竞态与 raw/url 去重风险维持既有未验结论；没有因 portal 离线保活而变为“已解决”。
- **最终状态：源码返修 NoOne / L0 PASS；真实验收 BLOCKED；整体不放行。**
