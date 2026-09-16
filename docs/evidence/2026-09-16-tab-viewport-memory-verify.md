# 实测证据：插件入口页面级全屏与分栏独立视窗记忆体系验证

- **验证日期**：2026-09-16
- **对应特性规格**：`specs/tab-viewport-memory.spec.md`
- **执行环境**：工作树隔离环境（worktree: `omnimux-dsh-wt-tab-viewport-memory`）
- **测试结果**：87 / 87 全量通过（100% 绿灯，耗时 ~618ms）

## 验证场景与结果数据

### 场景 1：全新打开插件入口页面默认全屏展开（最大化利用空间）
- **初始条件**：宿主会话启动，用户未对页面模式进行过手动调整。
- **触发动作**：用户点击进入资产库（`omnimux-assets:library`）。
- **实测表现**：
  - 宿主调和器读取默认偏好：`resolveDefaultFocus('omnimux-assets:library') === 'gui'`；
  - 自动触发点击官方全屏控制按钮（`enterHostRightSidebarFullscreen`）；
  - 右侧面板属性转为 `data-sidebar-right-panel="fullscreen"`；
  - 中间会话栏自动平滑收起。
- **断言结果**：PASS（`enters.length === 1`，进入全屏成功）。

### 场景 2：用户在页面内点击右上角收起全屏（精准单页记录）
- **初始条件**：资产库处于全屏状态。
- **触发动作**：用户点击右上角模式切换按钮（`button[data-sidebar-right-mode="push"]`）。
- **实测表现**：
  - 宿主面板变为 `data-sidebar-right-panel="push"`；
  - 中间会话栏自动展开显示；
  - 调和器检测到非调和锁驱动的模式变化，认定为用户真实意图，精准写入持久化偏好：
    `focusRecordForTab(sessionId, 'omnimux-assets:library').mode === 'split'`。
  - 其他页面的偏好完全不受污染，依然为默认的 `'gui'`。
- **断言结果**：PASS（资产库持久化偏好严格为 `split`）。

### 场景 3：切换到其他插件页面（自动以默认全屏呈现）
- **初始条件**：资产库处于分栏模式，面板为 `push`。
- **触发动作**：用户点击左栏或 Tabbar 切换到灵感社区（`omnimux-inspiration:library`）。
- **实测表现**：
  - 调和器感知当前激活 Tab 变为灵感社区；
  - 查询其偏好记录，未被调整过，继承默认偏好 `'gui'`；
  - 检测到当前面板为 `push`，自动发起调和：触发 `enterHostRightSidebarFullscreen()`；
  - 面板切换为 `fullscreen`，会话栏平滑收起。
- **断言结果**：PASS（自动进入全屏，`panelMode === 'fullscreen'`）。

### 场景 4：切换回曾设为分栏的页面（自动无感还原分栏与会话栏）
- **初始条件**：当前在灵感社区全屏页面，面板为 `fullscreen`。
- **触发动作**：用户点击切回资产库（`omnimux-assets:library`）。
- **实测表现**：
  - 调和器感知当前激活 Tab 变回资产库；
  - 查询其偏好记录，精准匹配到之前记录的 `'split'`；
  - 检测到当前面板为 `fullscreen`，自动发起调和：触发 `exitHostRightSidebarFullscreen()`；
  - 面板自动切换为 `push`，中间会话栏自动展开复位！
- **断言结果**：PASS（自动还原分栏，`panelMode === 'push'`）。

### 场景 5：重新全屏并更新记忆
- **初始条件**：资产库处于分栏模式。
- **触发动作**：用户再次点击右上角全屏按钮。
- **实测表现**：
  - 面板进入 `fullscreen`；
  - 资产库偏好精准覆写为 `'gui'`；
  - 调和锁有效阻止了振荡与死循环。
- **断言结果**：PASS（偏好更新为 `gui`，`exits === 1`，`enters === 1`）。

### 场景 6：生命周期与防泄漏
- 安装与卸载清理验证：`installTabViewportReconciler` 返回清理函数，测试中成功断开 MutationObserver 与点击事件，无引用泄漏。
- 断言结果：PASS。
