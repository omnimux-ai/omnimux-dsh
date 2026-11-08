# 项目创作页打开后中间会话栏可见（RC 右栏多会话挂载适配）

## 目标

从左侧「项目」进入项目库、点开某个创作页后，界面必须呈现可用的三栏：左侧导航、中间该项目会话的对话栏、右侧画布。当前在 DSH `0.2.1-rc.3` 上中间栏呈现为等宽空白占位，用户看不到会话内容。

根因假设：rc.3 官方右侧栏为「访问过的每个会话」保留挂载；非活动会话只在外层加 `hidden`，内部面板仍保留 `data-sidebar-right-panel="fullscreen"` 与 `data-sidebar-right-open`。插件 `isHostRightSidebarFullscreen()` 只按属性查询任一面板，于是把「上一个会话的全屏」误判成当前会话全屏；`fullscreen-collapse-sync` 持续写 `html[data-omnimux-conversation-collapsed]`，把当前会话栏的 `centerCol` 压成 0 宽。同时 `conversation-box` 的网格规则在左栏展开时仍给中间列保留 `--omnimux-conversation-width`，形成等宽空白死区。

## 新用户基线

全新用户安装 OmniMux、登录后：左侧「项目」→ 新建/选择项目 → 打开项目自带的创作页即可复现与验收。不依赖开发机项目、凭据、本地模型或历史缓存；任何会话都不应因为另一个隐藏会话的右栏全屏而把当前会话栏折叠。

## 用户旅程

1. 左侧「项目」打开项目库（右栏为全屏项目页）。
2. 点项目文件夹，进入「创作页」列表，点某个创作页卡片。
3. 期望：项目库页关闭；主区切到该项目会话；右侧出现画布标签页；中间会话栏可见（不是空白占位），左栏保持展开；画布与对话按 split 比例并排。
4. 期望：随后点左侧任意其他会话，中间栏能正常显示该会话内容；再点回项目会话，三栏仍成立。

## 结构与实现

- `plugins/omnimux/src/client/workbench/host-fullscreen.js`
  - `isVisibleSidebarPanel(panel)`：用原生 `closest('[hidden], [aria-hidden="true"]')` 排除 rc.3 的非活动会话面板（与官方 `visibleSidebarPane` 同一判据）。
  - `isHostRightSidebarFullscreen(doc)`：只在**在屏**面板中匹配 `data-sidebar-right-panel="fullscreen"`。
  - `findHostRightPanel(doc)`：优先返回在屏面板；隐藏面板只在没有任何可见面板时兜底。
  - `findHostFullscreenExitButton(doc)`：只从在屏全屏面板找退出按钮，避免点到隐藏会话的按钮。
  - `findHostFullscreenEnterButton(doc)` 与文档级按钮兜底：同样跳过隐藏会话的按钮，保持进入/退出对称。
- 现有 `fullscreen-collapse-sync` 与 `tab-viewport-reconciler` 继续消费该判定；不新增第二套折叠状态。
- 若判定修复后中间栏仍被 `conversation-box` 网格规则留白，再修对应 CSS：`html[data-omnimux-conversation-collapsed]` 下中间列必须为 `0px`（与 `docs/contracts/three-column-layout.md` INV-9 对齐），不得用 `--omnimux-conversation-width`。

## 命令

- `pnpm --filter omnimux test`
- `node --test plugins/omnimux/src/client/workbench/host-fullscreen.test.js`
- `node scripts/impact-matrix.mjs --git-diff --base origin/main`
- `pnpm verify:product-baseline`
- `node scripts/worktree-app-qa.mjs --journey .workbuddy/diag/layout-dump.journey.mjs`（真实应用诊断旅程，断言打开创作页后中间栏宽度 > 0 且可见）
- `git diff --check`

## 风格与测试

- 纯函数/查询改动，保持现有防御式 try/catch 风格与中文注释；不引入 React 依赖。
- 单测：构造两个 `.session` 包装（一个 `hidden` 内含 fullscreen 面板、一个在屏 push 面板），断言 `isHostRightSidebarFullscreen` 为 false、`findHostRightPanel` 返回在屏面板、退出按钮不取自隐藏面板；再构造在屏 fullscreen 面板断言 true。
- 真实浏览器旅程：项目库 → 创作页卡片；断言 `html[data-omnimux-conversation-collapsed]` 不存在、`[class*="centerCol"]` 宽 > 0 且 opacity 非 0、画布 tab 可见；截图留证。

## 边界与文档

- 不改官方 DSH 源码、不改 `dsh-better-sidebar` 包；只在 `plugins/omnimux` 客户端适配层读取官方 DOM 属性。
- 不改变用户手动收起中间栏的持久化语义（`omnimux-conversation-collapsed:v1:*`）。
- 更新 `docs/contracts/workbench-split.md` 的 Current session 小节：补充「rc.3 右栏按会话保留挂载，全屏判定必须排除 `hidden` 会话面板」。

## 假设

- rc.3 隐藏会话的判定确实在原生日面板外层写入 `hidden` 或 `aria-hidden="true"`（官方 `visibleSidebarPane` 使用同一选择器），且 `data-sidebar-right-panel` 在隐藏面板上仍保留 `fullscreen`。
- 中间栏空白由 `data-omnimux-conversation-collapsed` + 网格中间列保宽共同造成；修复隐藏面板判定后 `fullscreen-collapse-sync` 会解除折叠。

## 证伪方式

- 旅程修复前记录到 `html[data-omnimux-conversation-collapsed]` 存在且 `[class*="centerCol"]` 宽 0、opacity 0，截图中间为空白占位；修复后同一旅程断言折叠键不存在、centerCol 宽 > 0 且画面可见。若修复后折叠键仍存在，说明还有第二个写入方，假设部分被证伪。
- 单测中若隐藏会话的 fullscreen 面板仍让 `isHostRightSidebarFullscreen` 返回 true，说明选择器口径不成立，需改用官方 `sidebarRight.mounted` 会话匹配。

## 旧标准变更

- `plugins/omnimux/src/client/workbench/host-fullscreen.test.js` :: `a hidden session panel never marks the current session fullscreen (rc.3 keeps visited sessions mounted)`
  - 原断言（本任务初稿）：在 `findHostRightPanel(doc)` 返回值上断言 `data-sidebar-right-session` 为空。
  - 必须改的理由：`data-sidebar-right-session` 属于会话包装层而非面板本身，该断言测错对象；本任务修复后新增 hidden/aria-hidden/在屏全屏三组用例，原语义不减少。
  - 新期望证据：断言返回面板的 `data-sidebar-right-panel === 'push'`，并在相邻新增用例中覆盖隐藏面板跳过、aria-hidden 等价、在屏 fullscreen 胜出。
