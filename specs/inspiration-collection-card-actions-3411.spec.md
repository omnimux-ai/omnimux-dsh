# 灵感库合集卡：悬停查看与加入会话（Issue #3411）

## 授权与范围

用户已确认需求并要求实施：合集卡悬停显示「查看」「加入会话」；查看进入合集内容；加入会话打开会话栏并把带来源标注的合集信息预填到输入框，用户随后提交问题时 AI 针对该合集检索读取。交付包含实现、最小充分检查、工作树真实浏览器证据、独立评审、正常 PR/Merge Queue、主干同步、开发版物化与任务工作区清理。不得修改官方 DSH、其它仓库、生产资料或凭据，不调用付费生成。

基线 `881487d97695ace8441aad19aff4632ab5605a74`（`origin/main`）。

## 新用户基线与复用

已安装并登录的新用户只依赖两项既有能力：本地灵感库（含合集元数据）与官方会话输入框。不依赖模型配置、云端社区账号、本机服务、开发端口或绝对路径。

空合集、无成员、无活动会话、目标输入框已有草稿/附件等状态都必须给出明确提示，不伪造成功、不覆盖用户草稿。

复用：合集卡 `InspirationCollectionCard.jsx`、合集打开链路 `useInspirationCollections.open`、灵感列表请求 `listLocalInspirations({ collection_id })`、官方会话预填 seam `window.__omnimuxSessionPrefill.queueSessionPrefill`、会话栏展开 `window.__omnimuxWorkbench.setConversationCollapsed/setFocus`、官方 `Button`/对话框/主题 token、既有合集真实浏览器夹具（`tests/e2e/inspiration-collections.fixture.mjs`）。

## 确定行为

### 1. 合集卡悬停操作

- 仅 `card_type === 'collection'` 的合集卡新增操作层；普通灵感卡、账号监控卡保持现状（无这两个按钮）。
- 操作层含两个按钮：`查看`（outline）与 `加入会话`（primary），位于封面底部渐变遮罩内，水平居中；卡片标题、文件夹图标与「更多操作」菜单不被遮挡。
- 鼠标悬停显示；键盘 Tab 聚焦按钮时经 `:focus-within` 同样显示；无指针悬停能力（触摸）时操作层常显，避免功能被 hover 独占。
- 过渡只做透明度/位移，遵守 `prefers-reduced-motion`；不改变卡片尺寸、不引起布局跳动。
- 按钮点击与 pointerdown 不冒泡到卡片详情、不触发拖拽合并；`aria-label` 使用本地化文案；禁用/忙碌时不可重复触发。
- `查看` 调用既有 `open(collection)`：进入合集内容视图（显示返回与重命名），不触发会话预填。
- 卡片整体点击仍保持原行为（进入合集），不新增第二套导航。

### 2. 加入会话

- 点击后先读取合集完整成员（真实本地列表接口，按 `collection_id` 取全部成员，最多 100 条，lean 投影）；读取失败 → 提示「合集内容读取失败，请重试」，不预填、不展开空会话。
- 目标会话为**当前会话**：优先 `__omnimuxWorkbench.getSnapshot().sessionId`，回退 `__omnimuxAttachments.getActiveSessionId()`；无有效会话 → 提示「没有可加入的会话，请先打开一个会话」，不静默失败。
- 展开会话栏（`setConversationCollapsed(false)` + `setFocus('split')`），再通过官方预填 seam 写草稿；不点击发送、不提交消息、不改动合集数据。
- 预填文本必须清晰标明来源，至少包含：来源产品与功能（OmniMux 灵感库 · 本地合集）、合集名称、`collection_id`、成员条数、成员清单（序号 + 名称 + 成员 id + 平台/类型可用时）、以及明确指令「使用 `inspiration_get` 按上述 id 逐条读取（标题、正文、拆解、本地媒体路径）再回答问题」；末尾留出用户输入问题的位置。
- 目标输入框已有草稿、附件已满或 seam 拒绝时不覆盖：提示「输入框已有内容，请先清空或新建会话后重试」（或等价明确文案），并保留原草稿。
- 同一时刻只允许一次加入会话操作；重复点击返回忙碌状态，不重复写草稿。
- 所有提示走既有 toast/status 通道，不新增全局弹窗。

### 3. 文案与可访问性

- zh/en 同步新增：`collection.view`、`collection.addToSession` 及失败提示键；文案遵循仓库命名与微文案规范，动词开头、无字符图标。
- 按钮可键盘到达与触发；隐藏态不得从可访问树移除（焦点触发显示，不靠 `aria-hidden` 欺骗）。

### 4. 失败与回退

- 任一失败只影响该次操作：卡片点击、拖拽合并、菜单重命名/移出/撤销行为不变。
- 无 Host/Agent 工具新增，不改合集数据模型与接口契约；改动可整体回退。

## 实施边界与文档影响

改动限于 `plugins/omnimux-inspiration/src/client/`（合集卡、样式、文案、视图接线、会话预填充模块）及其测试；`plugins/omnimux-inspiration/README.md` 补充合集卡操作说明；新增本规格与工作树验证记录。不改 `plugins/omnimux/` 宿主、`packages/`、官方 DSH、CI/门禁或其它插件。

## 验收与先后顺序

先写本规格，再实现并跑相关插件测试；随后在任务工作树用独占合成资料库 + 真实浏览器验证（悬停显隐、查看进入合集、加入会话后草稿文本与来源标注、普通卡片无按钮、失败提示），保存可解码截图与结构化报告；有证据后再固化 E2E 回归测试；最后独立评审、最小命令并集检查、PR/Merge Queue、主干同步、开发版物化与工作区清理。

最小命令取相关插件包测试、product-baseline、stages、anti-slop、插件边界、格式、i18n 与必要文档检查的并集；不跑全仓大套件。Dev 45120 真机验收归人工，代理不等待、不声称取得。
