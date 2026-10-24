# Issue 3681 · ComfyUI 页面型节点 + 全屏打开（M1）

- 任务工作树：`.worktrees/comfy-page-node-3681`（分支 `agent/comfy-page-node-3681-issue-3681`，base `origin/main`）
- 驱动：插件 dev harness（真实 `CanvasEditor`）+ ego-browser 真实 Chromium；目标页面用本机真实 HTTP 服务（8188）充当，验证完即停
- 截图：`docs/evidence/issue-3681-00-comfy-page-reachable.png`、`-01-comfy-page-unreachable.png`、`-02-comfy-page-retry-connected.png`

## 做的是什么

1:1 路线（Issue #3681）的第一个里程碑：**页面型节点 + 全屏层**。画布「添加节点」面板新增「ComfyUI 页面」条目，节点卡显示目标地址与连通状态；双击或点「打开」进入全屏层，里面 iframe 指向该地址。目标不可达时给引导（说明 + 地址输入 + 重试 + 关闭），不是空白。**M1 不打包任何 ComfyUI 代码、不下载安装任何后端**（GPL 合规从 M2 起）。

## 实测（真实浏览器，1728×883，三轮）

| 断言 | 实测 |
| --- | --- |
| 调色板条目 | 面板 9 项：文本 / 表格 / 图片 / 视频 / 音频 / 导演台 / 视频剪辑 / 导入素材 / **ComfyUI 页面** |
| 创建节点 | 节点卡出现，地址 `http://127.0.0.1:8188`，状态「未检测」 |
| 可达时打开（真实鼠标点击 64×32 按钮） | 全屏层出现，状态「已连接」，iframe `src=http://127.0.0.1:8188`，全屏层里**真的渲染出目标页面**（截图里可见目标页内容） |
| 同一时刻最多一个 | 再次派发打开事件后 iframe 数量仍为 1 |
| ESC 退出 | 全屏层消失、`iframe` 从 DOM 移除（0 个） |
| 不可达（目标服务停掉） | 全屏层出现**引导**：「没有检测到该地址的页面」+「先安装并启动 ComfyUI（默认端口 8188），或填入你已经在跑的地址。」+ 地址输入框 + 重试；状态「未检测到页面」，0 个 iframe |
| 改地址并重试（死端口） | 地址栏与全屏层地址同步为 `http://127.0.0.1:8199`，重新探测后仍为引导 |
| 非法地址 | 输入 `ftp://nope` → 「只支持 http / https 地址」 |
| 地址写回节点 | 关闭后节点卡地址变为 `http://127.0.0.1:8199`（写回节点数据） |
| 目标起来后重试 | 引导层点「重试」→ 「已连接」+ 1 个 iframe，截图确认页面渲染 |
| 关闭按钮 | 全屏层消失、iframe 移除 |

## 自动化检查

- `pnpm --filter omnimux-workflow test` → **2955 pass / 0 fail**（新增 `comfyPageUrl.test.mjs` 8 用例）
- `pnpm --filter omnimux-workflow typecheck` → canvas + host + director 三段绿
- `pnpm verify:stages` → PASS（14 Stage / 8 sidebar）；anti-slop 3/3；`git diff --check` clean
- 旧标准变更：`#3640` 冻结的调色板清单因新增条目由 8→9（dock 9 / context 8），5 个既有用例按 spec 的「## 旧标准变更」逐条声明后只改计数与清单内容（用例名、断言结构不变）

## 独立验收反馈与修复（第二轮）

独立验收（另一浏览器复测 + 反例）结论 PASS，并提出两条真问题，已修：

| 反馈 | 事实 | 修复 | 复测 |
| --- | --- | --- | --- |
| `ports: []` 与运行事实不符 | `CanvasNodeShell` 的 `showLeftHandle/showRightHandle` 默认 true，页面节点实际渲染了两个连接桩，从右桩**能拖出物料边** | 节点卡显式 `showLeftHandle={false} showRightHandle={false}` | 节点上 `.react-flow__handle` 数量 **0**；从节点右边缘拖到另一个节点，边数 2 → **2（没有新边）** |
| 右键钻取面板末行被底部控制坞压住 | 面板 `maxHeight` 只扣视口边距，控制坞（`bottom:24px`，实测 y813–859）盖住末行 | `ContextMenu` 新增 `ADD_MENU_DOCK_RESERVED = 72`（24 偏移 + 44 高度 + 间隙）并从 `maxHeight` 扣掉 | 面板底 807 ≤ 控制坞顶 813（不再重叠）；列表可滚动，滚到底后末行「ComfyUI 页面」`elementFromPoint` 命中自身并可点击**建出节点** |
| 悬空 i18n key `palette.node.comfyPage` | 注册表 `palette.label` 引用了它，zh/en 都没有 | 两个字典补齐 | key 集合对称 |
| `frameRef` 赋值后未使用 | 死代码 | 删除 | typecheck 绿 |

另外两条如实记录、不修：
- **目标站点 `X-Frame-Options: DENY` / CSP `frame-ancestors` 时 iframe 被拒，但顶栏仍显示「已连接」**：`no-cors` 探测拿到的是 opaque response，原理上读不到响应头，无法在 JS 侧区分「能连上」与「拒绝被嵌入」。已由独立验收**实测复现**（8199 返回 200+DENY：状态「已连接」、iframe 存在，框内是 Chromium 的拒绝页）。兜底是顶栏「在新窗口打开」。
- 5 个既有用例名里仍写「8 项 / 7 项」而断言是 9/8：按 spec 的「## 旧标准变更」要求，用例名保持不变，故名字里的数字已过期（有意为之）。

## 已知缺口

- 浅色主题、键盘可达性（全屏层内 Tab 顺序）、Electron 壳层未覆盖；en locale 仅静态对齐。
- 目标站点若自带 `X-Frame-Options: DENY` / CSP `frame-ancestors`，iframe 会被拒（探测仍显示已连接）；M1 的兜底是顶栏「在新窗口打开」。本轮测试目标未发这些头部，因此这条限制**未被实测**，属已知未覆盖。
- 「地址随工作区保存/重载不丢」本轮只验证到「写回节点数据」（harness 无后端，无工作区持久化）；工作区快照路径未变（沿用既有 `sanitizeNodes`）。
- 探测依赖 `fetch(url, { mode: 'no-cors' })`；若页面本身是 https 而目标为 http，会被混合内容策略拦下并显示为不可达（未实测）。

## 非目标（M1 未做）

托管后端下载/安装/启动（M2）、Python 运行时、失败态矩阵（M3）、平台/GPU 矩阵与版本绑定（M4）、模型权重下载、GPL 合规产物（M2 起）。
