# 真机浏览器验收报告 · 画布节点失败提示显示上游归因（Issue #3235）

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/canvas-upstream-reason`
- 分支：`feat/canvas-upstream-reason`（代码未提交，本次验收未做任何 git 写操作）
- 实施报告：`.agent-reports/canvas-upstream-reason/02-implementation.md`
- 验收日期：2026-10-07
- **结论：验收通过（PASS）** —— 30/30 断言全绿，`report.pass = true`，`REAL_EXIT=0`；A1/A3/A5/A6 四条目标断言均有真机截图与人眼复检。

---

## 一、执行命令与真实输出

```sh
cd .worktrees/canvas-upstream-reason
pnpm verify:app -- --journey .workbuddy/qa-journeys/canvas-upstream-reason.mjs > /tmp/qa-run4.log 2>&1; echo "REAL_EXIT=$?"
```

`REAL_EXIT=0`，stdout（原样）：

```
$ node scripts/worktree-app-qa.mjs -- --journey .workbuddy/qa-journeys/canvas-upstream-reason.mjs
✅ 应用级 Web 验收通过（mode=ui，30 项断言，端口 49361，CDP 49364）
   截图: …/.workbuddy/evidence/app-qa/df128ddd-d3fe-4a04-b762-9d3f1c433e32/app-home.png (1280x713, 59038 字节)
   证据: docs/evidence/worktree-app-qa-report.json
💡【测试工程夹具】：已自动预装带媒体素材的标准测试工程（ID: ws_qa_media）
   前置测试直达：http://127.0.0.1:49361/#/workspace/ws_qa_media
```

运行元数据（`docs/evidence/worktree-app-qa-report.json`）：

| 项 | 值 |
|---|---|
| runId | `df128ddd-d3fe-4a04-b762-9d3f1c433e32` |
| mode | `ui`（合成模型端点，无真实计费） |
| evidenceLevel | `full`（22 个任务插件已装载） |
| origin | `http://127.0.0.1:49361`（动态端口，自清理） |
| 浏览器 | headless Chrome（`--headless=new`，1280×800），CDP 直连，指针输入走 `Input.dispatchMouseEvent`（真实 hover + 真实点击，非 `el.click()` 合成事件） |
| pass | `true` |
| 断言总数 / 失败数 | 30 / **0** |

> 该路径即 `AGENTS.md`「Browser acceptance」允许的两条真机路径之一（worktree web QA runner，`port: 0`，自清理）。**未使用** IAB，**未使用** HTTP 200 / 单测冒充浏览器验收，**未触碰** Dev 应用（45120）。

---

## 二、夹具注入（真源）

在页面同一 realm 内覆写 `window.fetch`，命中产品自己的路由
`POST /omnimux-workflow/api/workspaces/ws_qa_media/storyboard-video` 即返回 HTTP 502：

```json
{
  "ok": false, "code": 502, "data": null,
  "error": "analyze-invalid-input",
  "message": "视频文件不满足理解要求（格式、大小或路径），请更换视频后重试",
  "upstream": { "code": "omnimux-invalid-request", "detail": "tool model only accepts text and image input" }
}
```

- **A3 负向对照**：同一 502，整键删掉 `upstream`。
- **A5 长文**：`upstream.detail` 换成 200 字符长串。
- 命中证据：`journey:A1-interceptor-hit` = `{"hits":1,"urls":["/omnimux-workflow/api/workspaces/ws_qa_media/storyboard-video"]}` —— 走的确实是产品路由，不是伪造渲染。

---

## 三、逐条断言实际结果

| # | 断言 | 结果 | 实际取值 |
|---|---|---|---|
| **A1** | 归因行出现，中文结论 + 技术原文 | **PASS** | `upstreamPresent=true`；`reasonText="该渠道不支持此素材类型，请更换渠道后重试。"`；`detailText="tool model only accepts text and image input"`；拦截命中 1 次 |
| **A3** | 不带 `upstream` 时**不出现**归因行 | **PASS** | `upstreamPresent=false`；卡片仍渲染（`cardText` 含「生成失败」+ 原始 message），结构回到改动前 |
| **A5** | 200 字符长文单行省略号截断，卡片高度与 A1 一致 | **PASS** | `detailLength=200`；`white-space: nowrap` + `text-overflow: ellipsis`；`scrollWidth=1137 > clientWidth=316`（**真的被裁掉了**，不是声明层假绿）；`clientHeight=17`、`line-height=16.5px`（单行）；`title` 保留 200 字符全文 |
| **A6** | 归因行不出现英文机器码 `omnimux-invalid-request` | **PASS** | 对整张 `.wf-gsc__failed` 的 `textContent` 做否定断言，A1 轮与 A3 轮均通过 |

### 3.1 卡片高度实测（A5 的核心判据）

| 阶段 | `.wf-gsc__failed` 高度 | 宽度 |
|---|---|---|
| A1（带 upstream，短 detail） | **195.75 px** | 348 px |
| A3（无 upstream） | **195.75 px** | 348 px |
| A5（带 upstream，200 字符 detail） | **195.75 px** | 348 px |
| **Δ(A5 − A1)** | **0 px**（阈值 ≤ 2 px） | — |

来源：`journey:A5-card-height-equal-A1` = `{"a1Height":195.75,"a5Height":195.75,"delta":0}`，单位 CSS px，取 `getBoundingClientRect()`。

### 3.2 卡片实际文本（A1，原样）

```
生成失败
视频文件不满足理解要求（格式、大小或路径），请更换视频后重试
该渠道不支持此素材类型，请更换渠道后重试。tool model only accepts text and image input
重新生成
```

（A3 轮同位置只有前两行 + 「重新生成」——归因行整行不渲染。）

### 3.3 人眼级复检（用户级规则要求）

三张特写截图均已用 `display_file` 在对话中打开复检，结论：

- **A1**：真实画布节点（标题「QA 视频素材」+ 悬浮胶囊「内容拆解 / 分镜表 / 提取音频 / 更多」）下方的失败卡片，归因行以弱化灰阶落在 message 之下，前置 `·` 分隔符，**层级正确、无破版、无留白黑洞**；技术原文为唯一非中文内容且明显降级，不与中文结论争夺注意力。
- **A3**：同一张卡片、同一条 message，**message 与「重新生成」之间干净无残留行**，结构回退符合预期。
- **A5**：detail 行末尾出现真实省略号 `…`（`tool model only accepts text and image input :: upstream…`），**卡片高度肉眼与 A1 无差别**，长文没有把卡片撑高。

---

## 四、截图与证据清单

目录：`docs/evidence/canvas-upstream-reason/`

| 文件 | 尺寸 | 说明 |
|---|---|---|
| `A1-failed-with-upstream.png` | 1280×713 | A1 全视口：画布已挂载 + 失败卡片含归因行 |
| `A1-card-closeup.png` | 940×660 | A1 失败卡片 2× 特写（人眼复检用） |
| `A3-failed-without-upstream.png` | 1280×713 | A3 负向对照全视口 |
| `A3-card-closeup.png` | 940×660 | A3 失败卡片 2× 特写（对照） |
| `A5-long-detail-200chars.png` | 1280×713 | A5 全视口：200 字符 detail |
| `A5-card-closeup.png` | 940×660 | A5 失败卡片 2× 特写（省略号可见） |
| `A0-canvas-overview.png` | 1280×713 | 画布总览（A5 终态） |
| `report.json` | — | 断言结果 + 高度数值 + 夹具 + 未覆盖项（结构化） |
| `journey-diagnostics.json` | — | 逐阶段探针原始输出（含画布 DOM 普查、节点数、workspace 版本） |
| `app-qa-report.json` / `worktree-app-qa-report.json` | — | runner 完整报告（30 条断言） |

原始 run 目录（runner 自留）：`.workbuddy/evidence/app-qa/df128ddd-d3fe-4a04-b762-9d3f1c433e32/`

### 4.1 提交清单（供主 Agent 处理）

已用 `git check-ignore` 逐条核实：

| 路径 | ignore 状态 | 入库动作 |
|---|---|---|
| `docs/evidence/canvas-upstream-reason/`（7 PNG + 3 JSON） | **IGNORED**（`.git/info/exclude:23` = `docs/evidence/*`） | 需 `git add -f` |
| `docs/evidence/worktree-app-qa-report.json` | **未被忽略**（已跟踪，当前 ` M`） | 正常 `git add` 即可 |
| `.agent-reports/canvas-upstream-reason/03-browser-acceptance.md` | **IGNORED** | 需 `git add -f` |
| `.workbuddy/qa-journeys/canvas-upstream-reason.mjs` | **IGNORED**（`.gitignore:10` = `.workbuddy/`） | 任务本地脚手架，按 #3146 先例不入提交；如需长期保留请另行决定 |

**本次未执行任何 git 写操作**（无 add / commit / push / stash / checkout），HEAD 仍为 `07cc1705b`。请主 Agent 按需：

```
git add -f docs/evidence/canvas-upstream-reason/ \
           .agent-reports/canvas-upstream-reason/03-browser-acceptance.md
git add    docs/evidence/worktree-app-qa-report.json
```

---

## 五、未覆盖项（诚实边界）

1. **「项目 → 项目会话 → 创作画布」的 UI 点击链未走通（环境限制，非本次改动引入）。**
   `tests/fixtures/qa-workspace-media` 预置的是 **chat 工作区**，不是工作流项目；「项目」页显示「暂无项目」，新建项目要原生目录选择器，无头环境点不到。该限制与已合入证据 `docs/evidence/clip-preview-refresh-3146/report.md` §5.1 记录完全一致。
   **替代路径（本报告的实际做法）**：用产品自己的挂载契约 `window.__omnimuxWorkflowCanvas.mountCanvas(el, { workspaceId, locale })` 挂载**真实画布 island**（与 `CanvasBridge.jsx` 打开右侧栏画布 tab 是同一条代码路径）；节点经产品自己的持久化路由 `PUT /omnimux-workflow/api/workspaces/ws_qa_media`（带 `expectedVersion`）落库；失败经拦截产品自己的 `POST …/storyboard-video` 注入；触发按钮是节点上真实渲染的「分镜表」胶囊，用真实指针 hover + 点击。**渲染与交互链路全部是产品真实代码**，被替代的只有「从项目页点进来」这一段导航。
2. **只驱动了「分镜表」分支**，未跑「内容拆解」分支。两者共用同一个 `GenerationStateContainer.renderFailed()` 与同一条 `executionUpstream` 写回链路（`nodeMediaOperations.ts` 两条链路对称），故渲染结论可外推，但未逐条实测。
3. **toast 未同步归因**：失败时 `toast.error(message)` 与卡片共用 message，本轮修复范围只到卡片。用户会看到「卡片有归因、toast 没有」——这是实现报告 §四.3 已登记的已知边界，非本次验收遗漏。
4. **Electron / shell 面未取证**：纯客户端插件改动，无 shell 特有行为。
5. **`executionUpstream` 的画布持久化行为未验**（刷新后是否残留）——实现报告 §四.8 已登记。
6. **Dev 应用（45120）未触碰**，按 `AGENTS.md` 属人工所有。
7. **ego-browser 未使用**：仓库契约明确接受 worktree web QA runner 作为真机路径，本次即用该路径（与 #3146 一致）。

---

## 六、命令与退出码原始记录

| 命令 | REAL_EXIT | 结果 |
|---|---|---|
| `pnpm verify:app -- --journey .workbuddy/qa-journeys/canvas-upstream-reason.mjs` | **0** | `✅ 应用级 Web 验收通过（mode=ui，30 项断言）`；`report.pass=true`；`failed=[]` |

（同一 journey 的前三次运行 `REAL_EXIT=1`，失败根因已定位并修复在 journey 侧：① 画布 island 是懒加载，需先注入 `/omnimux-workflow/canvas.js?v=<hash>`；② 工作区保存路由要求 `expectedVersion`；③ 胶囊由 React `onMouseEnter` 控制，必须发真实指针事件。三次失败均为**脚手架问题**，非被测代码缺陷；详细过程见 `journey-diagnostics.json`。）
