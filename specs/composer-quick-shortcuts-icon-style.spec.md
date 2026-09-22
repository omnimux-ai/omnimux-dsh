# 输入框下方四条快捷方式：无边框「图标 + 文字 + 箭头」并整行居中（Issue #2572）

## 目标

Issue #2562 已让四条快捷方式落在新对话输入框**正下方**，但形态是**有边框的胶囊**、**只有文字没有图标**、整行**靠左**。本任务只改外观与对齐，不改任何交互契约：

1. 四条按钮作为**一组**在输入框下方**左右居中**（不是靠左、也不是靠右）。
2. **去掉按钮框**：无边框、无圆角底、无底色，只保留「图标 + 文字 + 箭头」。
3. 每项结构固定为：图标（14px）+ 文字 + 箭头（12px）；箭头默认半透明，悬停变实。
4. 悬停与选中态在无边框后仍需可辨；功能一条不减。

## 成功标准（可测）

| 编号 | 断言 | 判据 |
| --- | --- | --- |
| S1 | 位置 | 这一排仍在输入框正下方（DOM 顺序与位置不变） |
| S2 | 居中 | 四条按钮这一组的中心与整行容器中心偏差 ≤ 2px（`getBoundingClientRect` 实测） |
| S3 | 无边框 | 按钮 `border-width` 为 0 或 `border-style: none`；`background-color` 透明；`border-radius` 为 0 |
| S4 | 结构 | 每项 = `svg.omx-quick-shortcut-icon`(14px) + 文案 + `svg.omx-quick-shortcut-arrow`(12px)，共 2 个 svg |
| S5 | 图标逐条对应 | `clone→film`、`breakdown→text-search`、`selling→workflow`、`reverse→sparkles`；箭头统一 `move-up-right` |
| S6 | 箭头态 | 箭头默认 `opacity: 0.5`，悬停该按钮时 `opacity: 1` |
| S7 | 悬停反馈 | 悬停时文字色由次级提亮到一级（有可读反馈，不是死文字） |
| S8 | 选中态 | `is-active` 仍有可辨差异（文字色/字重），并可被读屏（`aria-pressed`） |
| S9 | 控件不干扰居中 | 模型与参数控件不参与居中计算；窄列下不与按钮重叠或压字 |
| S10 | 功能不回退 | 点一条仍：预填提示语、放链接卡槽、选中技能；复刻与带货仍显示模型与参数；写失败仍有提示 |

## 唯一真源与图标映射

四条快捷方式的唯一真源仍是 `plugins/omnimux/src/client/composer-quick-shortcuts/catalog.js`。本任务在该条目上新增 `icon` 字段（lucide 图标名，逐字如下），渲染处只按 `entry.icon` 取图标，**不写四段 if/else 硬编码**。

| id | 图标名 | 尺寸 |
| --- | --- | --- |
| `clone` | `film` | 14px |
| `breakdown` | `text-search` | 14px |
| `selling` | `workflow` | 14px |
| `reverse` | `sparkles` | 14px |
| 行尾箭头（四条共用） | `move-up-right` | 12px |

图标 SVG 的 `viewBox` 与全部 `path`/`rect`/`circle` 逐字照抄产品给定的 lucide 源，不得增删或改写。

## 实现约束

- JSX 零业务内联样式（design.md UI02）：视觉全部落在 `composer-quick-shortcuts/styles.js`，类名驱动。
- 颜色一律取既有 `--dsw-alias-*` token，不新造色值。
- 去边框后必须有悬停反馈与可辨的选中态。
- 保留全部既有行为（预填、链接卡槽、技能选中、模型与参数、写失败提示）。

### 居中实现方式（本任务的关键决策）

`flex` 行的 `justify-content: center` 会被同行的模型/参数控件推偏，因此：

- 行容器继续 `display: flex; justify-content: center`，四条按钮**留在文档流里**共同参与居中；
- 模型与参数控件改为**绝对定位到该行右端**（`position: absolute; right: 0`），**不占布局宽度**，因此不参与居中计算；
- 按钮与控件不重叠由两侧留白保证，且留白只有一种形态：控件显示时给行容器左右**等量**内边距（内容盒仍左右对称，居中不被破坏），窄列下按钮换行而不是压到控件上。

## 范围

只改这一排的样式、结构（图标 + 箭头）与 `catalog.js` 的图标字段，以及随附单测/E2E 断言。不改技能库数据、不改链接卡槽逻辑、不改模型与参数控件自身、不改会话引导。

## 新用户基线

只依赖插件内自带资源与既有通道，不读取任何开发机私有配置，不新引入依赖（图标以内联 SVG 组件落地，不引入 `lucide-react` 运行时依赖）。

## 命令

在任务工作区执行：

- `node --test plugins/omnimux/src/client/composer-quick-shortcuts/*.test.js`
- `node --test plugins/omnimux/src/client/attachments/*.test.js plugins/omnimux/src/client/attachments/*.test.ts`
- `node --test plugins/omnimux/src/client/media-viewer/*.test.js`（既有 1 处红灯，改动前后同名同结果）
- `git diff --check`

浏览器验收：在本任务自己的工作树内起 `ui` 模式完整应用（真实文件形态的 profile + 预登记工作区），用 ego-browser 打开新对话截图。开发版真机验收归人工，不作为本任务完成条件。

## 边界

只改本任务工作区；不 push、不开 PR、不 merge、不物化开发版、不动工作区外文件。
