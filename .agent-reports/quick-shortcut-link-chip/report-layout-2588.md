# 报告 · 快捷方式那一排在窄列下横向溢出输入框卡片（Issue #2588）

- 工作树：`.worktrees/omnimux-quick-shortcut-link-chip-issue-2579`，分支 `agent/omnimux-quick-shortcut-link-chip-issue-2579`
- 起点提交：`0fcd3a035`（PR #2587 已开，未 push 新提交，未开新 PR，未 merge，未物化）
- 规格：`specs/quick-shortcut-link-chip.spec.md`（追加「Issue #2588」一节，含 S12–S18 与取舍登记）
- 量测通道：`.agent-reports/quick-shortcut-link-chip/layout-scenario.mjs`（本任务新写，无头 Chrome + CDP，
  原生 Web 应用、动态端口、跑完自清理）

## 一、根因（带量测数字，先证伪再定性）

### 先修掉一处误判：这一排的宽度本来就跟随卡片

用户与任务描述都怀疑「这一排取的是卡片宽度上限或外层 dock 宽度，而不是卡片实际宽度」。**实测不成立**：

扫描 720–1600px（步长 20，共 45 个宽度），「这一排实际宽 − 卡片实际宽」的**最大差值是 0px**。
原因是结构性的：两者求的是同一个令牌——卡片自身是 `max-width: var(--dsh-composer-card-max-width)`，
这一排是 `width: min(同一令牌, calc(100% − 2 × var(--dsh-composer-side-clearance)))`；
实测该令牌解析为 `calc(clamp(680px, calc(1160px * .64), 920px) + 32px)`。
所以「让这一排跟随卡片实测宽度」这条修法**不需要**新增任何依赖（也据此未去臆造宿主变量——
`app.asar` 里只有 `--dsh-composer-dock-inset` / `-side-clearance` / `-card-max-width` / `-height` /
`-text-max-height` / `-stack-gap` / `-hint` 七个，**没有任何一个是卡片实测宽度**）。

### 真正的病灶：行内部那块 nowrap 内容压不动

| 项 | 实测值 |
| --- | --- |
| 控件内容最小内容宽（`.omx-media-config-controls`） | **509.3px**（模型胶囊 170 ＋ 参数胶囊 197.34 ＋ 模型回执 112.95 ＋ 3×8px 间距 ＋ 1px 分隔线） |
| 卡片宽（窗口 1440 / 1280 / 1167 / 1024） | 774.39 / 712 / 712 / 702 |
| 卡片宽（窗口 720–1020 的紧凑列） | **318**（该区间恒定） |
| 内容右缘越出卡片（窗口 900） | 内容右缘 416.34 − 卡片右缘 338 ＝ **+78.34px** |
| `.omx-quick-shortcut-controls` 溢出（窗口 900） | scrollWidth 388 − clientWidth 318 ＝ **70px** |
| 参数胶囊（窗口 900） | 211 → **408.34**（右端越出卡片，被裁切） |
| 模型回执（窗口 900） | 被压成 **宽度 0**（文字不可读） |
| 溢出的窗口区间 | **720–1020**；1040 起卡片 712px，不再溢出 |

成因链：`.omx-quick-shortcut-controls` 自己可以被压缩（`min-width: 0`），但它只有**一个**子节点——
共享控件本体 `.omx-media-config-controls`，而后者是为媒体面板定的 `flex-wrap: nowrap` 行，
两个胶囊又是 `flex-shrink: 0` ＋ `white-space: nowrap`。父盒的 `min-width: 0` 只能压盒子，
压不动一个 nowrap 行里的内容，于是 509.3px 的内容从行右缘顶出去 78.34px。

这也解释了用户截图为**什么两件事同时发生**：卡片进紧凑列时（其 1167px 窗口在桌面外壳里对应窄列），
这一排已不足以一行放下四条按钮 → 按钮换行；同一时刻控件内容仍是铁板一块 → 越界 + 裁切。

## 二、修法（为什么在别的窗口宽度上也成立）

只改 `plugins/omnimux/src/client/composer-quick-shortcuts/styles.js`，三条作用域规则：

1. `.omx-quick-shortcut-controls > .omx-media-config-controls { flex-wrap: wrap; justify-content: center; max-width: 100% }`
   —— 只在这一处放开共享控件本体的折行（媒体面板里的三件套仍是单行，见 `media-composer-direct` 既有断言）。
2. `.omx-quick-shortcut-controls .omx-popover-anchor` / `.omx-capsule-trigger { max-width: 100%; min-width: 0 }`
   —— 单个控件不得宽过所在行（`min-width: 0` 是前提：flex 项默认最小宽是 min-content，
   不归零的话 `max-width: 100%` 只是相对自身取 100%，等于没写）。
3. `.omx-quick-shortcut-controls .omx-model-name-display` / `.omx-channel-name-display { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }`
   —— 模型胶囊里唯一由数据驱动的两段文字走省略号兜底。

**为什么不是「只调那一个宽度」**：修法不含任何像素常量、不读窗口宽度、不依赖断点，改的是「内容能不能折」
这一条结构性性质。可用「不变量」而非「某几个宽度」验收（见下 S1–S5，45 个宽度全过）。

## 三、改了哪些文件

| 文件 | 改动 |
| --- | --- |
| `plugins/omnimux/src/client/composer-quick-shortcuts/styles.js` | ＋3 条作用域 CSS 规则；行宽规则与模块头注释补上实测事实（45 宽度宽差恒为 0，不要再换宽度来源） |
| `plugins/omnimux/src/client/composer-quick-shortcuts/styles.test.js` | ＋1 个用例（4 组断言）把折行能力、收敛链、省略号兜底钉在源码层 |
| `specs/quick-shortcut-link-chip.spec.md` | 追加 Issue #2588 一节：问题 / 根因（含实测表）/ 目标 / S12–S18 / 命令 / 4 条取舍 |

JSX 零改动；胶囊组件、功能、技能对应关系、技能货架数据、媒体面板排版均未动。

## 四、验证结果

| 验证 | 结果 |
| --- | --- |
| `node --test plugins/omnimux/src/client/composer-quick-shortcuts/*.test.js` | **92/92 通过**（修前 91 ＋ 新增 1） |
| `node scripts/auto-qa-gate.mjs . --diff --base origin/main` | **PASS**（SYNTAX / LIFECYCLE / SECURITY / TOKENS / GUARDS 全绿） |
| `git diff --check` | 通过（无空白错误） |
| 邻近套件（规格命令内） | attachments 129/129、composer-video-token 11/11 |
| `node scripts/verify-stage-contracts.mjs` | **2 处失败，但与本任务无关**：`omnimux-social-harvest` 缺 `injectStyles()`、`omnimux-accounts` 侧栏契约。已在**干净 main 主检出**上跑同一脚本复现同一 2 处失败，且本任务改动集不涉及这两个插件 → 既有问题 |
| 真实浏览器几何验收 | **全绿**：S1–S5 扫描带 ＋ G1–G9 证据宽度，见下 |

### 浏览器验收（`layout-geometry.json` / `layout-geometry-fixed.json`）

扫描带 720–1600px（步长 20，45 个宽度）：

| 不变量 | 修前 | 修后 |
| --- | --- | --- |
| S1 这一排与卡片实测宽差（≤1px） | 0 | **0** |
| S2 这一排超出卡片 | 0 | **0** |
| S3 控件内容越出卡片 | **78.34px** | **0** |
| S4 页面级横向滚动条 | 0 | **0** |
| S5 四条按钮整组居中（左右留白差 <2px） | 0.02 | **0.02** |

三个关键宽度的几何数字与截图（`before-*` 用 `--build-ref 0fcd3a035` 构建的真前态客户端产物，
`after-*` 用本工作树含修复的产物；两轮同一通道、同为中文界面、都已关掉首启「内测声明」模态）：

| 窗口宽 | 卡片宽 | 这一排宽 | 控件内容 | 内容越界 | 参数胶囊 | 模型回执 | 按钮 | 截图（前 / 后） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1440（宽窗） | 774.39 | 774.39 | 1 行 509.3px | 余量 132.55px（修前修后相同） | 完整在卡内 | 112.95px 在卡内 | 不换行 | `before-1440*.png` / `after-1440*.png` |
| 1167（用户截图宽度） | 712 | 712 | 1 行 509.3px | 余量 101.36px（修前修后相同） | 完整在卡内 | 112.95px 在卡内 | 不换行 | `before-1167*.png` / `after-1167*.png` |
| 900（更窄，紧凑列） | 318 | 318 | **3 行**：181 / 197.34 / 112.95 | **0**（修前 **+78.34**） | **完整在卡内**（修前越界） | **112.95px**（修前 0 宽） | 折两行、每行居中 | `before-900*.png` / `after-900*.png` |
| 另附证据宽度 | 1280 / 1024 | — | — | 均无越界 | 完整 | 在卡内 | 不换行 | `before-1280*.png` `before-1024*.png` / `after-1280*.png` `after-1024*.png` |

每张截图都有一份整窗版（`*-<宽度>.png`）与一份聚焦输入框区域版（`*-<宽度>-composer.png`）。
`before-900-composer.png` 可直接看到用户描述的两个症状：参数胶囊右端被卡片右缘裁断、
模型回执整段不可见；对应的 `after-900-composer.png` 中三者各自成行、完整落在卡片内。

**宽窗零回退的硬证据（逐字节）**：`before-1167-composer.png` 与 `after-1167-composer.png`
sha256 完全相同（`49e85b010f7622ed…`），`before-1440-composer.png` 与 `after-1440-composer.png`
同样逐字节相同（`0c755062db175234…`）——即 1440 与 1167 两个宽度下前后渲染**一个像素都没变**；
只有 900（紧凑列）不同：`04cc1ad2c8d6235e…` → `26d5f07c5f67b575…`。

窄列（900）折行后的逐行实测：第 1 行「模型胶囊 87.5→257.5 ＋ 分隔线 267.5→268.5」，
第 2 行「参数胶囊 80.33→277.67」，第 3 行「模型回执 122.52→235.47」，
每行右缘均 ≤ 卡片右缘 338（余量 69.5 / 60.33 / 102.53）；这一排 712→882，视口高 900，未被裁切。

**宽窗未回退**：1440 / 1280 / 1167 / 1024 四个宽度下卡片宽、这一排宽、两个胶囊宽（170 / 197.34）、
模型回执宽（112.95）、内容余量、按钮是否换行、居中偏差**与修前逐点相同**。

## 五、仍未解决 / 需产品裁决

1. **用户截图的 1167px 未能逐像素复现**。在隔离浏览器环境里 1167px 窗口的输入框卡片是 712px（按钮不换行），
   紧凑列（卡片 318px）出现在 ≤1020px。用户的 1167px 是桌面外壳里的窗口宽，其内容列更窄才会落进紧凑列。
   本次因此改用「不变量 + 45 宽度扫描」验收，而不是对齐某一个窗口宽度；缺陷类别一致（按钮换行 + 内容越界），
   修后该类在扫描带内 0 越界。
2. **修前状态用真前态构建复现，不是重绘**：`--build-ref 0fcd3a035`（`git archive` 到临时目录构建，
   不碰工作树）得到真前态客户端产物，同一场景跑出 `before-*.png` 与 `layout-geometry-before.json`，
   复现出与基线完全相同的读数（内容越界 78.34、回执 0 宽、参数胶囊越界）。
3. **折行时分隔线留在模型胶囊那一行**（第 1 行行尾），已在规格取舍 #1 登记。消掉它需要改共享控件结构，
   会同时影响媒体面板 → 未做。
4. **省略号兜底当前不可达**（卡片实测下限 318px ＞ 单个胶囊最大 197.34px），是为「将来卡片更窄 / 模型名更长」
   留的；规格取舍 #2 已登记。
5. 未 push、未开新 PR、未 merge、未物化到开发版（按任务约束）。

## 六、收尾状态（最终一轮，冻结源码后复跑）

- `node --test plugins/omnimux/src/client/composer-quick-shortcuts/*.test.js` → **92/92 通过**
- `node scripts/auto-qa-gate.mjs . --diff --base origin/main` → **PASS**
- `git diff --check` → 通过
- 在分支上追加提交（不 push）；HEAD 前一个提交仍是 `0fcd3a035`
- 临时环境已清：无遗留 `boot-app` / `OmniMux Dev` / 无头 Chrome 进程，`.test-env-*` 私有 profile 目录与
  `.build-ref` 构建缓存均已删除；开发版 profile（`~/.omnimux-dev`）只被读取、未被写入；
  共享开发版端口 45120 未被本任务占用

### 证据文件清单（`.agent-reports/quick-shortcut-link-chip/`）

| 文件 | 内容 |
| --- | --- |
| `report-layout-2588.md` | 本报告 |
| `layout-scenario.mjs` | 几何量测场景（45 宽度扫描 ＋ 5 个证据宽度） |
| `layout-geometry-before.json` / `layout-geometry-after.json` | 修前 / 修后逐宽度原始读数 |
| `before-*/after-*[-composer].png` | 修前 / 修后截图（整窗 ＋ 聚焦输入框区域） |
| `layout-run-before.log` / `layout-run-final.log` | 两轮运行的逐条判定日志 |
