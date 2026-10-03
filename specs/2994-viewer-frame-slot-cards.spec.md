# Spec · Issue #2994 媒体查看器首帧/尾帧空卡槽视觉适配

## 1. 目标（Objective）

视频模式「首尾帧」页签下的两个空素材卡槽（first_frame / last_frame）当前与其它槽位共用同一类型图标空态，无法直观表达"首帧→尾帧"的配对语义。本规格对这两张空卡做纯视觉适配：加号上置、槽名下置、成对微倾斜、两卡之间一枚纯装饰换向箭头。**不改变任何交互、选材、绑定与提交流程**；除「首帧」「尾帧」两个已核定文案外不新增任何可见文本或元素。

用户故事：作为在查看器里切到「首尾帧」生成方式的用户，我看到两个带「首帧」「尾帧」文字、对称微倾斜的空卡槽及中间的分隔箭头，能立刻明白先放哪张帧、再放哪张帧。

## 2. UI 元素与文案锁定（PM 核定白名单 —— 唯一权威）

1. 空态首帧卡：+ 号 SVG 图标（lucide plus）上置 + 逐字文案「首帧」下置，卡片微左倾（rotate -4° ~ -6°）。
2. 空态尾帧卡：同上 + 逐字文案「尾帧」下置，卡片微右倾（对称角度）。
3. 两空卡之间分隔：lucide arrow-left-right SVG，渲染约 12px，muted 色，aria-hidden，无交互无 tooltip；仅当 first_frame 与 last_frame 两槽紧邻且均空时显示，任一槽有素材即隐藏。
4. 填入素材后缩略图、角标（omx-slot-badge-mark）、移除按钮行为完全不变。

红线：禁止新增除「首帧」「尾帧」外的任何可见文本；禁止其他图标/徽章/分割线/发光装饰；样式仅作用于紧邻的 first_frame+last_frame 两槽，其余模式与槽位渲染零差异。

## 3. 命令（Commands）

在工作树根目录按仓库既有约定跑 media-viewer 目录下相关单测文件（slot 与 composer 两份）。

## 4. 项目结构（涉及文件，均在工作树内）

- plugins/omnimux-viewer/src/media-viewer/MediaSlotGroup.jsx — 卡槽组件；slot.role 与 slot.label 由 media-slot.js 的 slotPlan/slotLabel 保证（first_frame→首帧、last_frame→尾帧）。
- plugins/omnimux-viewer/src/media-viewer/MediaViewerComposer.jsx — omx-slot-row 内 map slots 渲染 MediaSlotGroup（约 1130 行）；buckets[bucketKey(slot)] 提供每槽已填素材，用于判断"两槽均空"。
- plugins/omnimux/src/client/media-viewer/styles.js — .omx-slot-* 样式单源（JS 内嵌 CSS 字符串，约 1052–1304 行）。只改 src，禁止动 lib/ 构建产物。

## 5. 代码风格（Code Style）

- 100% 消费 var(--dsw-alias-*) 官方 Token（design.md v2.0），禁止裸色值、禁止自建 --omx-* 变量、禁止 Emoji/字符图标（UI04 门禁：必须用内联 SVG）。
- .omx-slot-btn 基础 transform（translateX 槽位位移变量）无 !important；hover 规则特异性 (0,2,1)，可被成对倾斜选择器 (0,4,1) 合法覆盖。覆盖时必须保留既有位移分量再追加 rotate，否则悬浮会回正跳变。
- 倾斜只作用于空态 omx-slot-btn（占位卡），填入素材的 omx-slot-card 保持回正 —— 两卡倾斜状态天然一致（空=斜、填=正），不触碰已有叠卡 rotate 体系。
- 类名沿用现有 is-* modifier 约定：is-frame + is-frame-first / is-frame-last 挂在 omx-slot-group 上；分隔元素类名 omx-slot-swap。
- 按钮内文字用独立 span（aria-hidden），不参与 aria-label（aria-label 保持现有 addLabel 逻辑）。

## 6. 验证策略（Testing Strategy）

沿用仓库既有的源码契约检查风格，覆盖以下内容：

- 卡槽组件源码中出现成对帧槽 modifier 类名、lucide plus 图标路径；槽名 span 仅由 isFrameSlot 门控渲染；aria-label 仍走既有 addLabel。
- 组合器源码中出现 omx-slot-swap 分隔元素，其渲染条件为相邻 first_frame + last_frame 且两槽素材均空。
- 样式单源中出现成对倾斜规则、omx-slot-swap 规则、槽名 span 规则，且悬浮覆盖保留既有位移分量。
- 相关既有单测全量回归不回归。

## 7. 边界（Boundaries）

- 总是做：改前读文件、改完跑相关单测、样式只用 --dsw-alias-* Token。
- 先问：超出白名单的任何文案/元素、动 lib/ 产物、动交互行为（点击/选材/绑定）。
- 绝不做：提交 commit、改 lib/ 构建产物、新增 Emoji/字符图标、为分隔箭头加交互或 tooltip、让非帧槽渲染文字/箭头。

## 8. 成功标准（Success Criteria）

1. 视频「首尾帧」页签下两槽全空时：左卡显示 + 与「首帧」且左倾约 5°、右卡显示 + 与「尾帧」且右倾约 5°、两卡间有 12px muted 双向箭头。
2. 任一槽填入素材后箭头消失；填入的卡显示缩略图与既有角标/移除按钮，零行为差异。
3. 「首帧」单槽页签、参考/编辑/音频等其余槽位渲染与现状零差异。
4. 相关单测全部通过。

## 9. 假设（Assumptions）

- slot.role 为 first_frame/last_frame 是帧槽的唯一判定依据（slotPlan/slotLabel 已保证 label 与 role 配对），无需按 label 文本匹配。
- 帧槽 max 为 1，填入后 add 按钮消失，故"填入后回正"自然达成，两卡一致性不破坏。
- 箭头插在 omx-slot-row 内两个 MediaSlotGroup 之间（flex gap 已由 omx-slot-row 提供），map 输出用 React.Fragment + key 包装。
