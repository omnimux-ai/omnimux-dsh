# TikTok 快捷按钮与第三方扩展共存（Issue #3583）

## 1. 业务目标

TikTok 页面上，OmniMux 的幽灵触发器与 CreatOK 等第三方注入按钮**同时可用、互不遮挡、互不改写样式**。
本规格显式取代 [tiktok-conflict-resolution.spec.md](tiktok-conflict-resolution.spec.md) 的 AC-1 / AC-2（顶升对手、级联推移），保留 AC-3 的“优雅恢复”语义（本实现不再写对手样式，因此无需恢复）。

## 2. 现状与证据（ego 实测 2026-10-21）

| 页面 | CreatOK | OmniMux |
| --- | --- | --- |
| 独立视频详情页 / 信息流 | `#creatok-video-trigger` 是动作栏第 1 个子元素（64×64 流内），原生 top=631.8 | 48×48 fixed，头像上方 8px @(1256.9, 651.5)；旧 conflict.ts 用 `translateY(-68px) !important` 把 CK 顶到 563.8 |
| 账号主页 → 点视频（browse 弹窗） | 44×44 fixed，锚定 `#arrow-left` 上方 8px @(1554, 428)，随布局重算；菜单是独立 fixed 全屏 portal（z=2147483647） | 被 `findActiveFeedAvatar` 误锚到右上角全局工具栏的 32×32 图标，算出 (1983, -24)，只露出 24px 在视口顶边 |

## 3. 范围

1. **让位共存**：删除对第三方元素的 `transform` 写入与恢复；检测到同走廊对手时，把**自己的触发器**叠到对手上方 8px（同列），不再移动任何第三方 DOM。
2. **弹窗页锚点**：新增 `browse-modal` 布局；锚点链 `modal-prev-arrow → modal-panel-left → viewport-corner-right`（复刻 CreatOK 的 `#arrow-left` 上方 8px 与“评论面板左缘外”两档）。
3. **收紧会误判的候选**：`[class*="ActionBarContainer"]` 必须带视频自己的动作图标（`like/comment/favorite/share`）或本身就是 `SectionActionBarContainer`，且不在 `#app-header`/全局工具栏内；命名头像 hook 同样排除全局头部；删除“取第一个 24–64px 子元素当头像”的兜底。
4. **视口兜底**：让位计算把标记钳在视口内（top ≥ 10）；无对手时锚点层语义原样保留（既有测试契约不重写）。
5. **借鉴 CreatOK 的层级契约**：场景 host 提到 `z-index: 2147483647`；菜单打开时把 host 移到文档末尾，确保与同为 max z 的 CK 菜单同层时后绘制、不被覆盖。

## 4. 非目标

- 不修改、注入或反编译 CreatOK 扩展本体；不读取它的内部状态。
- 不改 TikTok 原生 UI，不新增扩展权限，不动 manifest 权限面。
- 不做账号数据抓取、不做发布/下载链路改造。

## 5. 成功标准

- **S1 共存（详情页）**：CK 与 OmniMux 同屏可见，垂直间距 8px，二者矩形不相交；CK 元素上不存在 `data-omx-shift`/`transform` 改写。
- **S2 共存（browse 弹窗）**：OmniMux 触发器在视口内（top ≥ 10），位于 CK 上方 8px；不再锚到右上角工具栏。
- **S3 兜底**：browse 弹窗与让位场景下触发器完全在视口内（top ≥ 10）；无对手时沿用锚点层结果，不新增钳位。
- **S4 层级**：菜单打开时位于页面与 CK 菜单之上（同 max z，DOM 末尾）。
- **S5 回归**：`pnpm test`（extension）、`pnpm typecheck`（改动文件无新增错误）、`node scripts/build.mjs` 全绿；worktree 内真实浏览器（`scripts/lib/extension-e2e.mjs` + Chrome for Testing）截图证据覆盖 S1/S2/S4，落 `.agent-reports/tiktok-coexist-3583/`。

## 假设

- 假设 CreatOK 的注入元素仍是 `#creatok-video-trigger` / `[id*="creatok"]` / `plasmo-csui` 这些可识别形态，且它的矩形能通过 `getBoundingClientRect` 准确读到；若它改成 canvas 或跨域 iframe 渲染，共存算法会读不到它而退回基准位（仍不遮挡原生操作栏）。
- 假设 browse 弹窗的 `#arrow-left` 与 `[data-e2e="browse-video"]` 在 TikTok 桌面端保持现有语义；箭头只在 hover 视频时出现，因此链路必须有 `modal-panel-left` 这一档不依赖箭头。
- 假设“不写第三方样式”不会降低可用性：我们的按钮改为向上让位后仍处于动作栏同一列，用户视线路径不变。

## 证伪方式

- 在 worktree 的 extension-e2e 里用合成 TikTok 结构（动作栏 + CK 形态对手 + 头像；browse 弹窗 + `#arrow-left` + fixed 对手）真实加载构建产物：若出现触发器与对手矩形相交、或对手元素 `style.transform`/`data-omx-shift` 被写入、或触发器 top < 10，则假设与实现被证伪。
- 用 ego 在 real TikTok 页面（详情页 + 主页弹窗）复核一次真实 DOM：若真实页面读不到对手矩形（例如 canvas 渲染）或弹窗无 `#arrow-left` 也没有评论面板容器导致退到视口角，记录为证伪并回到锚点策略。
- 若缩放/滚动后两者再次重叠，说明重测链路不足，S1/S2 失败。

## 验收证据

`.agent-reports/tiktok-coexist-3583/`：`report.json` + 三张截图（browse 弹窗共存、信息流共存、只有全局工具栏时的兜底）。运行方式与限制见该目录 `README.md`。

## 文档影响

本任务新增本 spec 并注明取代 #2035 的顶升 AC；[plugins/omnimux-browser/README.md](../../plugins/omnimux-browser/README.md) 中与冲突避让相关的描述若存在，同步改为“共存让位”。不需要新增合同。
