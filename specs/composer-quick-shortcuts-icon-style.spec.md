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
| S9 | 控件不干扰居中 | 模型与参数控件独占一行（`flex-basis: 100%`），不参与按钮行的居中计算；窄列下与按钮无重叠、无横向溢出 |
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

实测数据（中文界面，行宽上限 952px）：四条按钮合计 **575px**（英文 756px），模型 + 参数控件合计约 **300px**。同排时 `575 + 2×300 > 952`，所以「同排 + 严格居中」会压住最右两字，「同排 + 控件右对齐」会让按钮整体左移约 150px —— 二者与用户要求不可兼得。因此：

- 行容器 `display: flex; flex-wrap: wrap; justify-content: center`，四条按钮**留在文档流里**共同参与居中；
- 模型与参数控件、写失败提示取 `flex-basis: 100%`，**各自独占一行**，因此不参与按钮那一行的居中计算；
- 控件另取 `min-width: 0` + `flex-wrap: wrap`：窄列下两个胶囊自己折行，绝不横向溢出压住按钮；
- 行宽与输入框卡对齐：`width: min(var(--dsh-composer-card-max-width, 952px), calc(100% - 2 * var(--dsh-composer-side-clearance, 16px)))`。

浏览器实测（1920×929）：按钮组中心与行中心、输入框卡中心偏差 **0px**；控件与按钮行 `anyOverlap = false`；窄列 640px 下按钮折成 2 行仍居中且不压字。

### 位置（本轮修正）

这一排挂在官方停靠槽 `conversation.input.dock` 上，而 hero 栈把该槽排在输入框**之前**，照原样落位就在**输入框上方**（改动前实测：这一排 y 210→240、输入框 258→372）。本轮用 `[data-phase='hero'] .omx-quick-shortcuts { order: 3 }` 把它排到输入框那块（其 order 为 2）之后，实测输入框 202→316、这一排 334→364，间距 18px（与 hero 栈既有间距同值）。

## 范围

只改这一排的样式、结构（图标 + 箭头）与 `catalog.js` 的图标字段，以及随附单测/E2E 断言。不改技能库数据、不改链接卡槽逻辑、不改模型与参数控件自身、不改会话引导。

## 新用户基线

只依赖插件内自带资源与既有通道，不读取任何开发机私有配置，不新引入依赖（图标以内联 SVG 组件落地，不引入 `lucide-react` 运行时依赖）。

## 命令

在任务工作区执行：

- `node --test plugins/omnimux/src/client/composer-quick-shortcuts/*.test.js`
- `node --test plugins/omnimux/tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs`（本任务的端到端用例；该目录**不在**包内测试发现器 `plugins/omnimux/scripts/run-tests.mjs` 的收集范围里——它只收 `src/**/*.test.js|ts`，CI `quality-gate.yml` 也无 `tests/e2e` 收集，同目录已有 54 个同类文件同样不被收集，属既有口径问题，本任务不擅自改收集器，故在此显式列出）
- `node --test plugins/omnimux/src/client/attachments/*.test.js plugins/omnimux/src/client/attachments/*.test.ts`
- `node --test plugins/omnimux/src/client/media-viewer/*.test.js`（既有 1 处红灯，改动前后同名同结果）
- `node scripts/verify-stage-contracts.mjs`（既有 2 处红灯，与本改动无关）
- `git diff --check`

浏览器验收：在本任务自己的工作树内起 `ui` 模式完整应用（真实文件形态的 profile + 预登记工作区），用 ego-browser 打开新对话截图。开发版真机验收归人工，不作为本任务完成条件。

## 边界

只改本任务工作区；不 push、不开 PR、不 merge、不物化开发版、不动工作区外文件。
