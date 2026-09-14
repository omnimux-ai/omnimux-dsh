# 规格说明：右侧栏 chrome 隔离真实浏览器几何门禁

工单 #1638。落点：`scripts/worktree-web-qa.mjs`（扩展）、`scripts/sidebar-chrome-qa-fixture.mjs`（新增）、`.github/workflows/quality-gate.yml`（接入）。

## 1. 背景与缺口

2026-09-13 右侧栏顶栏塌陷（排版导致选项卡底部两个圆角被下方内容背景叠盖 5px）属**纯视觉几何缺陷**：语法正确、契约正确、单元测试全绿，但界面是错的。

实测缺口两条：

1. **合并前无任何渲染环节**：CI 工作流 14 个步骤全为语法检查、静态契约、单元套件与模型契约，零浏览器。
2. **官方隔离运行器覆盖不到右侧栏**：`scripts/worktree-web-qa.mjs` 具备「零 App 依赖 + 真实内核 + 动态端口 + 用完即焚」的良好骨架，但其内建外壳不渲染原生右侧栏（`dockkit` / `data-sidebar-right` 相关选择器出现次数为 **0**），`STAGE_CONFIG` 也没有产品库页。跑它无法发现该缺陷。

## 2. 方案

### 2.1 新增场景（复用既有骨架，不另造运行器）

在 `scripts/worktree-web-qa.mjs` 增加 `runSidebarChromeQa()`，与既有 Stage 流程共用：

- 随机空闲端口：网页服务 `listen(0)`；浏览器调试端口 `--remote-debugging-port=0` 并从 `DevToolsActivePort` 回读；
- 真实浏览器内核：`--headless=new`，真实布局计算与 `getBoundingClientRect`；
- 零污染：临时浏览器配置目录建于 `tmp/` 下，结束整目录删除；
- 用完即焚：进程终止、服务关闭、端口释放，并产出释放回执。

同时补 Linux 侧浏览器可执行文件探测（CI 运行于 Ubuntu），并保留 `CHROME_PATH` 覆盖。

### 2.2 夹具页（忠实镜像，不复制生产逻辑）

夹具页只负责「把真实结构摆出来」，不含任何修复规则：

- 全局 `box-sizing: border-box` 复位（缺陷的真正成因）；
- 镜像 ui-dockkit 真实数值：顶栏容器 `height:28px; padding:10px 6px 0 10px; align-items:center`，选项卡 `height:28px; border-radius:12px`，内容区 `flex:1 1 auto`；
- 原生右侧栏标记：`[data-dockkit-strip]`、`[data-dockkit-tab]`、`[data-dockkit-pane-body]`。

### 2.3 补丁来源（禁止手写，避免自证）

被测样式**从生产源码抽取**（`plugins/omnimux/src/client/sidebar-toggle-topbar.js` 中的 `RIGHTBAR_CHROME_STYLES` 模板字面量），抽取失败即判失败。夹具页与断言均不包含该规则的字面量。

### 2.4 反向对照（本规格的核心）

必须先在不注入被测样式的情况下测量，且**必须复现缺陷**：

- 顶栏高度 = 28；
- 选项卡底边 > 内容顶边（被遮挡为真）；
- 间距为负（实测应为 −5）。

若反向对照未能复现缺陷，则该场景判定为**夹具失真**并直接失败——防止「夹具已经是对的，所以永远绿」。

### 2.5 正向断言（注入被测样式后）

| 断言 | 期望 |
| --- | --- |
| 顶栏高度 | 40 |
| 顶栏盒模型 | border-box |
| 顶栏内边距 | 6px 6px 6px 10px |
| 选项卡上下位置 | 6 → 34 |
| 内容顶边 | 40 |
| 间距 | +6 |
| 是否被遮挡 | 否 |

## 3. 验收标准

1. `node scripts/worktree-web-qa.mjs sidebar-chrome` 在本机与 CI 均通过，且端口为系统随机分配、结束后释放回执为真。
2. 反向对照在夹具失真或修复回退时**必须变红**：`interpretSidebarChromeGeometry()` 对未修复数值返回失败项。
3. 抽取函数在缺少标记时抛错（源码删掉规则即变红）。
4. 单测覆盖：抽取成功/失败、几何裁决正向与反向、真实浏览器端到端。
5. 该场景接入 CI 合并前检查并实际运行（Ubuntu 上自动探测浏览器可执行文件）。
6. `pnpm test:gates` 全绿。

## 4. 不做什么

- 不替换或重写既有 Stage 验收流程（仅新增场景与探测路径）。
- 不改动生产业务逻辑（除夹具需要读取既有常量文本外，零生产源码改动）。
- 不把「开发版运行验收」纳入门禁：按用户级规范，开发版人工验收归人类所有，Agent 不得以其为门禁或自有证据。
- 不处理质量闭环两道门「不按任务归属判定」的问题（已拆至 #1639）。
