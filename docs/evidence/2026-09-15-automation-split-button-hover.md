# 定时任务工作台分裂创建按钮视觉与悬停样式优化实测证据

## 1. 验证目标

解决定时任务工作台右上角「创建」分裂胶囊按钮在深色主题下的视觉割裂与鼠标悬停时背景底色过深（出现突兀深黑硬块）的问题。

## 2. 根因溯源与冲突机制

1. **左右底色割裂**：
   - 左侧主按钮 `.dsh-st-btn--primary` 默认底色为 `var(--dsw-alias-button-primary-fill, #fff)`（深色主题下为纯白胶囊实心填充）；
   - 右侧下拉开关 `.dsh-st-split-toggle` 原硬编码了 `background: var(--dsw-alias-bg-layer-4, #e5e5ea)`；在深色主题下，`--dsw-alias-bg-layer-4` 解析为深暗色底，导致左侧亮白、右侧深黑，破坏了组件设计规范所要求的「左半与右半同底同色、只被一条细分隔线切开，视觉上仍是一颗完整胶囊」。
2. **悬停底色过深**：
   - 鼠标悬停在右侧下拉开关时，原代码使用了 `.dsh-st-split-toggle:hover { background: var(--dsw-alias-interactive-bg-hover, #d1d1d6); }`；在深色模式下，该 Token 表现为极暗的黑色块，反差刺眼，用户反馈「鼠标悬停的时候按钮背景颜色太深了」。

## 3. 修复实现与验证证据

1. **左右同底同色收敛**：
   - `.dsh-st-split .dsh-st-split-toggle` 默认背景统一设置为 `var(--dsw-alias-button-primary-fill, #fff)`，文本与图标颜色为 `var(--dsw-alias-label-primary-foreground, #111)`。
   - 中间通过 `box-shadow: inset 1px 0 0 color-mix(in srgb, var(--dsw-alias-label-primary-foreground) 14%, transparent)` 实现自适应双主题的微透精致分割线，彻底消除生硬的拼贴感。
2. **悬停柔和浅色高亮**：
   - 主按钮与下拉开关悬停态（`.dsh-st-split .dsh-st-split-main:hover`、`.dsh-st-split .dsh-st-split-toggle:hover` 以及展开态 `.dsh-st-split.is-open .dsh-st-split-toggle`）统一消费 `var(--dsw-alias-button-primary-hover, #ebebeb)`，文本颜色保持 `var(--dsw-alias-label-primary-foreground, #111)`。
   - 鼠标悬停无论停留在左侧或右侧，均呈现柔和、微暗的浅灰高亮，彻底根除深黑突兀块。
3. **测试回归**：
   - `render.test.js` 补充静态规则与 DOM 渲染契约测试；
   - `tests/e2e/split-button-hover.e2e.test.mjs` 覆盖端到端样式规范与防回退契约；
   - 单元测试与端到端测试 132/132 100% 保持绿灯。
