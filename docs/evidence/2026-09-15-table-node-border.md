# 创作画布表格节点卡片顶部边框与圆角修复实测证据

## 1. 验证目标
针对 Issue #1879，排查并彻底解决创作画布表格节点（TableNode）在暗色模式及选中高亮状态下，顶部表头直角底色贴顶覆盖外层卡片圆角高光边缘、造成内外双重边框与两端圆角切断覆盖的问题。

## 2. 根因溯源实证
- **外层卡片设计规范**：
  - 卡片本体 `.wf-material-node__card` 定义 `border-radius: 18px` 与 `border: 1px solid var(--wb-border)`。
  - 节点选中态 `.wf-material-node--selected .wf-material-node__card` 激活白色边框与 `box-shadow: inset 0 0 0 2px var(--wb-node-ring)`，总厚度 3px，呈连续高光圆角轮廓。
- **冲突机制**：
  - 表头元素原定义 `background: color-mix(in srgb, var(--wb-surface) 60%, transparent)`，并且未声明顶部圆角。
  - 子元素背景的绘制层级在父容器 `box-shadow: inset` 之上，直接压盖了父容器顶部 2px 高光环。白色高光被 60% 深色底色过滤后衰减为灰色线（实测 rgb(114, 114, 116)），与外层 1px 细白边并排形成了“双边框”视觉。
  - 表头的直角直接冲入 18px 外圆角弧度区，造成左上角和右上角的内侧高光被硬性切断。

## 3. 修复实现与验证证据
1. **圆角内切对齐**：
   - 表头容器显式声明 `borderTopLeftRadius: 'calc(var(--wb-node-radius, 18px) - 1px)'` 与 `borderTopRightRadius: 'calc(var(--wb-node-radius, 18px) - 1px)'`。
   - 内容包裹层同步声明内切圆角并补充 `overflow: 'hidden'`。
2. **彻底根除双边框**：
   - 表头背景调整为 `transparent`，直接继承卡片本体底色，由下方 `borderBottom: 1px solid var(--wb-border)` 承担区域分隔。
   - 彻底避免子元素背景层对 `box-shadow: inset 0 0 0 2px var(--wb-node-ring)` 的颜色过滤与遮盖。
3. **单测回归证明**：
   - `TableNode.test.mjs` 新增针对圆角收敛与透明底色的契约断言，全部 4 项测试 100% 绿灯通过。
   - `tableStore.test.mjs` 4 项测试 100% 绿灯通过。
