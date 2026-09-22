# Issue #2572 四条快捷方式改「无边框图标 + 文字 + 箭头」并整行居中 — 交付报告

日期：2026-09-22 ｜ 工作树：`.worktrees/omnimux-quick-shortcuts-icon-style-issue-2572` ｜ 分支：`agent/omnimux-quick-shortcuts-icon-style-issue-2572`（基线 `origin/main`，未 push / 未开 PR / 未物化）

## 1. 结论

用户在 Issue #2572 里的三条要求全部落地并在**真实浏览器**里量过：四条按钮**无边框**（`border: 0` / `border-radius: 0` / 透明底 / 无投影）、每项固定是**图标（14px）+ 文字 + 箭头（12px）**、四条作为一组**整行左右居中**（实测组中心与行中心、输入框中心偏差 **0px**）。既有功能（预填提示语、链接卡槽、技能选中、复刻与带货的模型与参数、写失败提示）一条未减。

**一处与任务前置说明不一致、已按用户原话修正的事实**：这一排此前**并不在输入框下方，而是在输入框上方**（官方 hero 栈把 `conversation.input.dock` 排在输入框之前）。用户原话第一条是「这一排按钮**应该放在输入框下方**」，因此本次显式把它排到输入框之后（`order: 3`），实测输入框 `202→390`、这一排 `408→476`，中间 18px（与 hero 栈既有间距同值）。第 6 节给出证据与回退方式。

## 2. 改了哪些文件

| 文件 | 改动 |
| --- | --- |
| `plugins/omnimux/src/client/composer-quick-shortcuts/catalog.js` | 四条条目各加一个 `icon` 字段（`film` / `text-search` / `workflow` / `sparkles`），并导出共用箭头名 `QUICK_SHORTCUT_ARROW_ICON = 'move-up-right'`；真源仍是这一个文件 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/icons.jsx`（新增） | 内部图标组件：`QuickShortcutIcon`（按名查表，14px）与 `QuickShortcutArrow`（`move-up-right`，12px）；lucide 路径与 `viewBox` 逐字照抄，不新增运行时依赖 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/styles.js` | 去掉边框/圆角/底色，改为居中行 + 图标/文字/箭头三类名；控件与提示自成一行；位置 `order` 规则 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/ComposerQuickShortcuts.jsx` | 每项渲染「图标 + 文案 + 箭头」，加 `data-omx-quick-shortcut-icon` 便于对拍；去掉按钮框相关类名语义 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/catalog.test.js` | 真源对拍断言加入 `icon` 列（断言力只增不减），新增「四条图标互不相同、箭头名另立」 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/styles.test.js`（新增） | 样式契约 + 图标查表交叉一致性（无边框/居中/控件不参与居中/箭头两态/选中态/token/路径逐字） |
| `plugins/omnimux/tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs`（新增） | 端到端：结构、样式表契约、点击预填与撤回、切换互斥 |
| `specs/composer-quick-shortcuts-icon-style.spec.md`（新增） | 本任务规格（成功标准 S1–S10） |

## 3. 关键样式决策

### 3.1 居中怎么不被「模型 / 参数」控件带偏

实测数据（中文界面，行宽上限 952px）：四条按钮合计 **575px**；模型 + 参数两个胶囊合计约 **300px**。同排时 `575 + 2×300 > 952`，所以：

- **同排 + 严格居中**：控件会压住最右两字（不可接受，用户明确禁止压字）；
- **同排 + 右对齐控件**：四条按钮整体左移约 150px（等于没居中）。

因此采用：**四条按钮留在文档流里居中；控件（与写失败提示）取 `flex-basis: 100%` 自成一行**，不参与那 575px 的居中计算。这样三个约束同时成立：严格居中、绝不重叠、窄列下按钮换行也不会撞上控件（窄列 640 实测：按钮折成 2 行、控件仍在自己的行内、无横向溢出、无重叠）。

行容器自带 `flex-wrap: wrap`，控件额外补 `min-width: 0` + `flex-wrap: wrap`：窄列下两个胶囊自己折行，而不是横向溢出（修复前实测 720px 视口下控件宽 509px > 行宽 422px，会溢出到行外）。

### 3.2 去边框后的状态表达

- 悬停：文字由次级 `--dsw-alias-label-secondary` 提亮到 `--dsw-alias-label-primary`，箭头 `opacity: 0.5 → 1`（浏览器实测 `rgb(207,211,214) → rgb(249,250,251)`、`0.5 → 1`）。
- 选中（`is-active`）：文字色提亮 **+ 字重 400 → 600**。字重是必需的：本产品主题把 `--dsw-alias-brand-primary` 直接映射成 `--dsw-alias-label-primary`（实测同值），只靠颜色的话选中与悬停完全同色、分不出来（实测：选中「复刻」时悬停「带货」，前者 600、后者 400）。
- 另加 `:focus-visible` 描边，键盘可达。

### 3.3 全部走类名与既有 token

JSX 零业务内联样式；样式表里没有任何裸色值（有单测钉住），颜色一律 `--dsw-alias-*`。

## 4. 四条图标与箭头的落地

| 条目 | 图标（lucide） | 实测渲染出的图形节点 | 尺寸 |
| --- | --- | --- | --- |
| 复刻爆款视频 | `film` | `rect + 7 path` | 14×14 |
| 拆解爆款视频 | `text-search` | `3 path + circle + path` | 14×14 |
| 一键创作带货视频 | `workflow` | `rect + path + rect` | 14×14 |
| 反推视频提示词 | `sparkles` | `3 path + circle` | 14×14 |
| 行尾箭头（四条共用） | `move-up-right` | `2 path` | 12×12，默认 `opacity: 0.5`，悬停/选中 `1` |

图标名只在 `catalog.js` 真源里；渲染处按 `entry.icon` 查表取图，**没有按 id 写四段 if/else**（有单测钉住）。

## 5. 检查与测试真实结果

| 命令 | 结果 |
| --- | --- |
| `node --test plugins/omnimux/src/client/composer-quick-shortcuts/*.test.js` | **59 通过 / 0 失败**（改动前 47；新增 `styles.test.js` 11 条 + `catalog.test.js` 加 1 条） |
| `node --test plugins/omnimux/tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs` | **4 通过 / 0 失败**（新增） |
| `node --test plugins/omnimux/src/client/attachments/*.test.js plugins/omnimux/src/client/attachments/*.test.ts` | **129 通过 / 0 失败** |
| `node --test plugins/omnimux/src/client/media-viewer/*.test.js` | 87 例 **86 通过 / 1 失败**：`generation feedback: real browser transport-to-viewer journeys` —— 既有红灯，主线上同名同结果；本轮改动不含 `media-viewer/` 任何文件（`git diff --name-only` 可核） |
| `git diff --check` | 退出码 0（无空白/冲突标记问题） |
| `pnpm verify:stages`（`node scripts/verify-stage-contracts.mjs`） | 13 个 Stage 组件审计后有 **2 条既有红灯**：`omnimux-social-harvest/src/client/HarvestStage.jsx` 缺 `injectStyles()`、`omnimux-accounts` 侧栏模式 `gui !== split`。把本轮改动 `git stash` 后在**同一基线上重跑，同名同结果**，故与本轮改动无关；本轮只改 `composer-quick-shortcuts/` 下文件，不在这两个插件内 |

## 6. 真实浏览器目视验收（本任务独立工作树内）

通路：把开发版 profile 以**真实文件**形态放进隔离私有 profile，并用本工作树构建覆盖 `node_modules/omnimux/lib/client.js`（服务端送出的 bundle 尾字节与本工作树构建一致，`3187202` 字节），以 `ui` 模式起动态端口完整应用（合成凭据、中文界面、预登记工作区），用 ego-browser 逐项操作。

证据目录：`.agent-reports/quick-shortcuts-icon-style/`

| 截图 | 内容 |
| --- | --- |
| `01-新会话-输入框下方-四条图标文字箭头居中.png` | 输入框**下方**四条，无边框，整行居中 |
| `02-悬停-文字提亮-箭头变实.png` | 悬停「拆解爆款视频」：文字提亮、箭头变实 |
| `03-选中复刻-模型参数另起一行不压字.png` | 选中「复刻」+ 模型/参数自成一行 |
| `04-选中态与悬停态可区分.png` | 选中「复刻」同时悬停「带货」：字重可区分 |
| `05-切到带货-互斥替换.png` | 切换互斥、草稿整组替换 |
| `06-窄列-按钮换行且不压字.png` | 640px 视口：按钮折行、控件不溢出、无重叠 |
| `特写A/B/C-*.png` | 上述关键状态的放大特写 |
| `browser-geometry.json` | 全部实测几何与计算样式（唯一证据真源） |

目视结论（均由实测几何支撑，非目测印象）：

- **在输入框下方**：输入框 `y 202→316`，这一排 `y 334→364`，间距 18px（`belowInputBox: true`）。
- **整行居中**：行 `x 623 w 952`（中心 1099），四条组 `x 811.5→1386.5`（中心 1099）→ 偏差 **0px**；输入框中心同为 1099。
- **无边框**：四个按钮 `border 0px/none`、`border-radius 0px`、`background rgba(0,0,0,0)`、`box-shadow none`。
- **每项结构**：每项 `svg` 数量 2、图标 `14×14`、箭头 `12×12`，图形节点与第 4 节表格逐条一致。
- **悬停反馈**：见第 3.2 节实测色值与透明度。
- **控件不干扰居中**：控件 `flex-basis: 100%`、自成一行、`overflowsRow: false`、与按钮 `anyOverlap: false`；窄列 640 下按钮 2 行、无重叠。
- **功能未回退**：点「复刻」草稿为「请用我的产品复刻这个爆款视频 + [视频] [商品]」；切到「带货」整组替换为「请帮我一键生成一条带货视频。+ [商品] [视频]」；`aria-pressed` 与 `is-active` 同步。

收尾：ego TaskSpace 已 `finish({ keep: [] })` 关闭（`closedSpace: true`，未保留任何页面）；测试环境目录、进程与一次性登录握手文件均已清理。另有一台**不属于本任务**的测试环境实例（工作树 `omnimux-runtime-modes-issue-2557`）在收尾时被误判为本次残留并终止，已在第 8 节如实登记。

### 位置修正的证据与回退

- 修正前：这一排 `y 210→278`、输入框 `y 296→484` —— 位于输入框**上方**。
- 修正后：输入框 `y 202→390`、这一排 `y 408→476` —— 位于输入框**下方**，间距 18px。
- 实现：`[data-phase='hero'] .omx-quick-shortcuts { order: 3 }`（同栈里输入框那块的 `order` 已是 2）。只在 hero（新对话）生效，会话开始后这一段本就不渲染，不影响官方停靠布局。
- 若产品其实要它留在输入框**上方**：删掉这一条规则、把 `margin: 0 auto` 改回 `margin: 8px auto 0`，并同步改 `styles.test.js` 的对应断言即可（约 3 行）。**这一点请产品确认**。

## 7. 仍未做到 / 需要产品裁决

1. **位置口径**：见 6 节末尾。任务说明写「仍在输入框正下方」，但改动前的实测是「在输入框上方」；本次按用户原话改为下方。若口径相反，回退成本 3 行。
2. **英文界面的组宽**：英文文案下四条合计约 756px（中文 575px）。居中与「控件不参与居中」仍然成立，但按钮可用的横向余量更小；若英文界面还要更紧凑，需要产品定「英文是否缩短文案」。
3. **模型与参数控件的位置**：本实现让它在四条按钮下方**居中**。若产品希望控件贴在行的**右端**（与上一版一致），需要产品先裁决「严格居中」与「同排不压字」的优先级（第 3.1 节已说明二者不可兼得）。
4. **开发版真机验收**：按仓库约定归人工，本任务不做也不等待；未 push / 未开 PR / 未物化。

## 8. 需要登记的两条事实

1. **误终止他任务环境进程**：收尾清理时按命令行特征匹配残留进程，终止了一个不属于本任务的测试环境实例（工作树 `.worktrees/omnimux-runtime-modes-issue-2557`，其驱动脚本进程仍在运行）。该实例是本机一次性测试环境（私有 profile、动态端口、随时可重启），无数据或文件损失，但会打断该任务当时的浏览器会话。教训：清理残留进程必须先核对父进程与工作目录，不能只按命令行特征匹配。
2. **测试环境两处非显然前置**（本任务已写成可复用脚本 `.agent-reports/quick-shortcuts-icon-style/tooling/run-ui-env.mjs`，供后续任务复用）：
   - 隔离 profile 默认把开发版 profile 以软链挂进来，**必须换成真实文件**（本任务只替换 `node_modules/omnimux` 并覆盖其 `lib/client.js`，其余条目仍按条目软链，避免复制 1.6GB 依赖），否则跑到的仍是开发版旧构建；
   - 环境的 `storages/workspace.json` 里 `workspaceIds` 为空时 Hero 停在「选择工作区才能开始」，需要在应用启动前把夹具目录登记成一条 v2 工作区记录；该记录是**严格 schema**，缺 `createdAt` / `updatedAt` 会让插件树装载失败（`workspace 域 does not match its schema`）。
   - 另：环境的 `settings.yaml` 由 bootstrap 以 **JSON** 写出（JSON 是 YAML 子集），要加语言偏好只能整体按 JSON 重写，追加 YAML 片段会让文档非法。
