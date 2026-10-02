# Spec · #2927 官方扩展位承载欢迎页吸底 —— 结论与收窄（父 #2890 第 3 步）

## 结论（已核官方源码）
`conversation.composer`（chain）/`conversation.composer.bar`（single）/`conversation.input.dock`（list）等官方扩展位只能向 composer 座位**内容**注入 UI；座位的 Hero 居中 / Active 吸底相位由宿主 `data-phase` 控制，没有官方动作类扩展位让插件在 Hero 下 dock 座位。`shell.overlay` 画第二 composer 被 MUST NOT 禁止。→ 欢迎页吸底无法完全走官方接缝，需要向官方提需求（三选一，见 Issue #2927）。

## 范围（In）
- 宿主 DOM 读取收窄到官方稳定 `data-*` 锚点：`data-phase`、`data-composer-seat`、`data-composer-card`、`data-conversation-scroll`、`data-conversation-region`、`data-omnimux-starter-host`（自有）。
- 替换 `[class*="scrollBody"]`、`.dshDesktopFrame > [class*="conversation"]`、`[class*="centerCol"]`、`[class*="composerStack"]`、`[class*="composerHero"]`、`[class*="heroWorkspaceRow"]` 等哈希类匹配为对应 `data-*` 或自有 `omx-` 类。
- `styles.js` 中凡能用 `data-*` 表达的选择器同步替换；无法用 `data-*` 表达且非自有类的保留并注明。

## 非目标（Out）
- 不删除 `useComposerDocking` 的 DOM 写（吸底必需，官方补齐动作位后整体替换）。
- 不删 `[class*="scrollBody"]` 里对**自有渲染子树**（dsh-ui-kit / omnimux 自渲染 DOM）的查询——只改「读宿主官方页面」那部分。

## 新用户基线
无官方页面结构时（如 hero 缺失），插件行为退化为现有 `return false`，不因锚点收窄而崩溃。

## 验收（AC）
- AC1 用 `data-*` 锚点替换的每一处选择器，在官方 `dsh-client-ui-conversation` 源码里有对应的字面 `data-*` 属性；grep 无遗漏 `[class*="scrollBody"]`、`.dshDesktopFrame > [class*="conversation"]`。
- AC2 `styles.js` 替换后不改变任何渲染（CSS 等效锚点）。
- AC3 session-guide 全部测试绿；run-workspace-tests 全绿；verify-plugin-load 绿。
- AC4 `omnimux:composer:dock-intent` 与 `[class*="composerHero"]` 等死选择器清完。

## 关键旅程
1. 宽屏新会话：滚动后输入框吸底（`data-phase` 判相位 + `data-composer-*` 几何）。
2. 窄分栏：吸底同宽 680px。
3. 会话已有内容：不吸底、保持顶部。
