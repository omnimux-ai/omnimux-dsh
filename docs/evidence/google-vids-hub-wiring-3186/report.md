# Google Vids 中枢接线（Issue #3186）· 端到端与浏览器验收证据

工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/video-vids-hub-wiring`
分支：`feat/video-vids-hub-wiring`　日期：2026-10-06
验收者：独立验收 Agent（未修改任何产品源码；仅新增本目录与 `tests/e2e/google-vids-hub-wiring.e2e.test.mjs`）

> 本目录被 `.git/info/exclude` 忽略，提交时需 `git add -f docs/evidence/google-vids-hub-wiring-3186/`。本次**未执行任何 git 写操作**（不 add / 不 commit / 不 push）。

---

## 一、结论摘要

| 交付物 | 结论 |
| --- | --- |
| D1 端到端（替身中枢缝） | **PASS**：14 个 `node:test` 用例全绿，81 处断言；四种模式、上传路由、两条负路径均按强判据通过 |
| D2 真实浏览器逐旅程 | **BLOCKED**：`ui` 模式影子实例可正常启动，但 Google Vids 面板在隔离实例中**无法打开**（侧栏入口已注册却未落到 DOM、`omnimux-vids` 产品舞台无内容），四种模式 / 附件行 / 选图上传 / 未配置提交四条旅程**均未能执行** |
| D3 验证报告 | `.agent-reports/vids-hub-wiring/e2e-and-browser.md` |

D2 的 BLOCKED **不是**接线失败，也**不是**通过：它是「验收环境里面板打不开」，按 `docs/contracts/plugin-qa.md`「环境不可用且无法安全修复为 BLOCKED，仅阻断受影响阶段」如实标注。

---

## 二、运行环境与命令

### D1（离线端到端，自包含：无网络、无真实生成、`port: 0`、临时目录自清理）

```sh
node --test tests/e2e/google-vids-hub-wiring.e2e.test.mjs > /tmp/v3186/e2e-run1.log 2>&1; echo "REAL_EXIT=$?"
# REAL_EXIT=0
# ℹ tests 14 / ℹ pass 14 / ℹ fail 0 / ℹ skipped 0
# grep -E "✖|not ok" → 无命中
```

变体自检（证明判据不是「永真」）：把临时副本里的 `operation: 'first_frame'` 改成 `'text_to_video'`、`duration: 8` 改成 `9` 后
`MUTANT_EXIT=1`、`ℹ fail 3` —— 逐字段 `deepEqual` 的强判据确实会咬。

### D2（工作树隔离 Web QA 运行器，`ui` 模式，动态端口、自清理）

```sh
pnpm verify:app -- --journey docs/evidence/google-vids-hub-wiring-3186/journey.mjs \
  > /tmp/v3186/appqa1.log 2>&1; echo "REAL_EXIT=$?"
# REAL_EXIT=1
# ❌ 应用级 Web 验收未通过 -> journey:j1-panel-entry-present; journey:j2-*; journey:j3-*; journey:j4-upload-route-200; journey:j5-submit-clicked
```

后续三次诊断运行（同一入口，同一 `ui` 模式）：

```sh
pnpm verify:app -- --journey docs/evidence/google-vids-hub-wiring-3186/probe.mjs   > /tmp/v3186/probe2.log 2>&1   # REAL_EXIT=1（面板缺失）
pnpm verify:app -- --journey docs/evidence/google-vids-hub-wiring-3186/probe2.mjs  > /tmp/v3186/probe3.log 2>&1   # REAL_EXIT=1
pnpm verify:app -- --journey docs/evidence/google-vids-hub-wiring-3186/probe3.mjs  > /tmp/v3186/probe4.log 2>&1   # REAL_EXIT=1
pnpm verify:app -- --journey docs/evidence/google-vids-hub-wiring-3186/probe4.mjs  > /tmp/v3186/probe5.log 2>&1   # REAL_EXIT=1
```

（另有一次 `probe.mjs` 首版因本文件内的模板字符串语法错误报 `journey-load: missing ) after argument list`，已修；该次运行报告保留在 `probes/` 之外，未计入结论。）

---

## 三、D1 实测覆盖（强判据）

`tests/e2e/google-vids-hub-wiring.e2e.test.mjs` 真实构造 `createHubVidsGenerator` 与 `createVeoDispatcher`，
在真实 `node:http` 服务上挂真实 `registerVeoRoutes`，用 `fetch` 走插件自己的 HTTP 面；唯一替身是**中枢缝本身**。

| 用例 | 判据（节选） |
| --- | --- |
| 媒体字节自检 | `MP4_BYTES[4..8] === 'ftyp'`；PNG 魔数 `89 50 4E 47` |
| 选图上传 | `POST /uploads` → 200，`url === <origin>/omnimux-video/api/veo/media/<file>`（绝对地址、非 `blob:`），回抓 200 且字节逐字节相同 |
| 创建 | `POST /tasks` → 202；终态 `completed`、`channel==='hub'`、`progress===100`；`videoUrl` 回抓 200 + `video/mp4` + 字节等于缝写入的字节；缝收到的请求 `deepEqual` `{dest,model:'google-vids-omni',operation:'text_to_video',prompt,duration:8,resolution:'1080p',aspectRatio:'portrait'}`，且无 `seconds`/`image`/`references` |
| 动画 | `operation:'first_frame'`、`duration:6`、`image===上传返回的服务地址`，无 `seconds`、无 `references` |
| 修改 | `operation:'video_edit'`、`image` + `references:[{type:'video',role:'source',pathOrUrl: 前序任务 upstreamUrl}]`；断言 `pathOrUrl !== 插件任务号` 且不含插件任务号 |
| 延续 | `operation:'video_extend'`、只有 `references`、无 `image`；两个前序任务的 `upstreamUrl` 互不相同，证明按任务各自解析 |
| 负路径 1 | 缝抛 `本机 Google Vids 通道未配置：…`（`code='omnimux-unconfigured'`）时：POST 仍 202，`task.error/message` 原样为该中文原因、`errorCode` 透传，不是通用 500、无 `videoUrl` |
| 负路径 2 | `video_id` 指向不存在的任务：终态 `failed`，原因含「无法解析前序任务 … 的取片地址」，且缝**一次都没被调用**（不猜一个任务号顶上） |
| 负路径 3 | 缝缺失 + opencli 未装 → `503 opencli-missing`；缝缺失 + 桥未连接 → `503 opencli-bridge-disconnected`；两种情况内部驱动均未被调用 |
| 正路径对照 | 缝可用 + opencli 未装/未连接 → `202` 并真的走中枢生成，`/health` 报 `ok:true`、`hub.available:true` |

> 术语说明：任务终态在真实代码里是 `completed`（`veo-task-store` 的 `queued|generating|completed|failed`），
> 任务书中的「ready」按此理解为面板消费的终态成功值，本测试断言的是真实字段值。

---

## 四、D2 实测：面板不可达（BLOCKED）及其证据链

### 4.1 现象

1. 应用本体正常：运行器的 11 项保底断言全 PASS（`app-runtime-ready`、`same-origin-login`、`chrome-cdp-listen`、`auth-cookie-applied`、`app-dom-mounted`、`visible-geometry-positive`、`runtime-modal-bypassed`、`blank-session-guide-visible`、`explore-section-visible`、`explore-cards-present`、`asset-hub-reachable-via-library`）。
2. `[data-omnimux-google-vids-entry]` 不在 DOM；侧栏当时有 6 行（项目 / 技能·专家 / 资产库 / 灵感社区 / 探索 / 虚拟形象），**没有 Google Vids 行**。
3. 点不到入口 ⇒ 后续 j2/j3/j4/j5 全部拿不到面板，`journey-01-panel-create.png` 是「应用壳、无面板」的实况截图。

### 4.2 诊断链（四次独立运行，逐层排除）

| # | 检查 | 结果 | 排除/指向 |
| --- | --- | --- | --- |
| probe1 | `window.__omnimuxSidebar/__omnimuxStage/__omnimuxWorkbench` | 均存在；`__omnimuxWorkbench.open({tabId:'omnimux-clip:studio'})` 成功 | 宿主协调器与工作台可用 |
| probe1 | `__omnimuxStage.claim('omnimux-vids')` | `claimed:true`、`documentElement.dataset.dshProductStage==='omnimux-vids'`，但 `[data-vids-mode]` 仍为 false | 舞台认领有效，**组件未挂载** |
| probe1 | 样式表清单 | `omnimux-video-google-vids-styles` **存在** | 该样式由侧栏协调器在 `register(row)` 时注入 ⇒ 插件的注册**确实被调用过** |
| probe2 | `window.__DSH_BOOT__.entries`（75 条） | **含 `omnimux-video`**，`url=/plugins/??omnimux-video/client.js&rev=…` | 客户端 bundle 已被宿主装载，不是「插件没装」 |
| probe3 | 整页重载 + 预先注入的 `console.error/warn`、`window.error`、`unhandledrejection` 收集器 | **0 条错误**；重载后侧栏仍无 vids 行、样式仍在 | 不是「apply 抛异常被吞」这类可捕获错误 |
| probe4 | 用同一个协调器手动注册一行探针行（新 id、rank 7.6） | **立即出现在 DOM**（侧栏出现「探针行」） | 协调器本身工作正常，能放行新注册 |
| probe4 | 用**插件自己的 id**（`omnimux-video-google-vids-entry`，rank 7.5）再注册一次 | **未出现在 DOM**（`inDom:false`） | 该 id **已被占用** ⇒ 插件此前注册成功，但那一行的元素没落到 DOM |

### 4.3 事实结论与未定项

- **已证实**：`omnimux-video` 客户端已装载；其侧栏行**已向协调器注册成功**（id 被占用 + 样式被注入）；但**该行未出现在 DOM**，因此面板入口不可见、`omnimux-vids` 舞台无内容。
- **未证实（不做断言）**：根因未定位。可捕获的错误为零，说明不是同步抛错；插件 `mountSidebarEntry` 的注册重试在 10s 后放弃，因此「注册落在协调器挂载行容器之前、此后不再补位」是一条**可能**的机制，但本次没有取到证实它的证据。同理，`slots.inject('main', …)` 是否注册成功本次未单独取证（`claim` 只设了 `documentElement` 标记），不能据此断言槽位缺失。
- **按要求**：这是产品缺陷线索，**我未修改任何产品代码**，仅以证据形式上报，由实现方处置。

### 4.4 因此未能执行、也不得记为通过的检查

- 四模式标签与其每模式附件行 / 参数控件的渲染断言；
- 本地选图 → 上传路由返回可抓取服务地址 → chip 显示本地缩略图；
- 未配置中枢通道时提交，结果卡出现「本机 Google Vids 通道未配置…」可读原因。

以上三项在本次会话中为 **BLOCKED / 未执行**，`app-qa-run.json` 内对应断言均为 `pass:false`，没有任何一项被写成通过。

---

## 五、证据文件清单

| 文件 | 内容 |
| --- | --- |
| `report.md` | 本文件 |
| `app-qa-run.json` | D2 主运行的**原始机读报告**（run `40880c1c-7061-4b43-abb9-9fd64521dfaa`，`pass:false`，逐条断言与失败原因） |
| `journey.mjs` | D2 使用的旅程模块（被 `--journey` 注入；放在本目录以满足「只写工作树内文件」与写域约束） |
| `journey-01-panel-create.png` | 旅程第 1 步截图：应用壳已就绪、**Google Vids 面板未出现**（失败实况，非面板证据） |
| `app-home.png`、`hub-business-path.png` | 运行器自身保底截图（应用首页、中枢业务路径） |
| `probes/probe1-globals-and-stage-claim.{json,png}` | 全局协调器、`claim('omnimux-vids')`、样式表存在 |
| `probes/probe2-client-boot-entries.{json,png}` | `__DSH_BOOT__.entries`（75 条，含 `omnimux-video`）、侧栏行清单 |
| `probes/probe3-reload-error-capture.{json,png}` | 整页重载 + 错误收集器：0 条错误，重载后状态不变 |
| `probes/probe4-coordinator-discriminator.{json,png}` | 手动探针行可落 DOM / 插件同 id 再注册为 no-op |
| `probes/probe1..4-run-report.json` | 四次诊断运行的原始机读报告 |
| `probe*.mjs` | 诊断旅程源码（保留以便复现） |

---

## 六、明确「未证实」清单

1. **真机 live 生成**：本会话**没有**任何一次经本机 vids2api 的真实生成；D1 全程是替身缝，D2 连面板都没打开。`AC-10` 未做。
2. **本机 vids2api 能否抓取插件回环图片地址**：未证实。D1 只证明上传路由返回的是插件自身 HTTP 面上的绝对地址、且本机 Node 能抓取；「上游服务能否抓取该回环地址」只有真机冒烟能证明。
3. **中枢侧改动（`plugins/omnimux/**`）**：本报告未复验（另见 `hub-fix.md`）；D1 只覆盖插件侧到「中枢缝入参」这一层，缝内部实现被替身替代。
4. **面板在真实 Dev 实例（45120）里的表现**：未取，属人工验收范围；且 45120 与本次隔离实例的插件装载路径不同，不能互相推断。
5. **`omnimux-video` 侧栏入口不可见的根因**：未定位（见 §4.3）。
6. **`pnpm verify:plugin-load`**：本工作树 `plugins/omnimux-forms`、`plugins/omnimux-viewer` 缺 `lib/client.js`，该命令在本工作树整体失败，与本次改动无关，故未作为本次证据（`plugin-wiring.md` 已记录同一现象）。

---

## 七、工作树状态

- 本次新增：`tests/e2e/google-vids-hub-wiring.e2e.test.mjs`、本目录（`docs/evidence/google-vids-hub-wiring-3186/**`）、`.agent-reports/vids-hub-wiring/e2e-and-browser.md`。
- 未触碰任何产品源码；未运行 `pnpm install`；未执行任何 git 写操作（add / commit / push）。
- `.workbuddy/evidence/app-qa/**` 为运行器临时产物（已复制所需部分到本目录）。
