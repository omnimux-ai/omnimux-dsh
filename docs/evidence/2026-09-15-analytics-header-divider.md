# 数据分析看板分割线迁移实测证据（#1869）

- 日期：2026-09-15
- 分支：`agent/analytics-header-divider-issue-1869`
- 用户诉求：数据分析插件的分割线迁移到 tab 选项卡与标题描述之间
- 取值方式：隔离工作树内 esbuild 夹具（动态端口、自清理）+ 真实浏览器 ego-browser 计算样式与几何；截图为 1280px 宽 stage 的 1:1 像素

## 1. 前一位遗留证据的有效性

| 判定项 | 结果 |
| --- | --- |
| 四图 SHA-256 | 两两互不相同 |
| before-light vs after-light · **页头条带**（x320–1600, y0–141） | 差异 **8773 px**，51 行 |
| before-light vs after-light · **全图**（x320–1600, y0–929） | 差异 **88787 px**，**381 行**，延伸到 y=799 |
| before-dark vs after-dark | 深色同型；QA 仅独立复测浅色，深色的带内/全图数值**未独立复测**（原记带内 9252 px，保留原值并标注未复测） |
| before-light vs before-dark | 全图 1 783 116 px（确为两套主题，未误截同图） |
| 分割线所在行 | before：y=140（浅 204.0 / 深 42.0，std 0.0）；after：y=84（同签名） |
| after 的 y=140 | 已回归纯背景（浅 255.0 / 深 13.0） |

## 2. DOM 顺序（stage 直接子元素）

- 修复前：`HEADER` → `action-row` → `[role=separator]` → `stage-filter` → `stage-body`
- 修复后：`HEADER` → `[role=separator]` → `action-row` → `stage-filter` → `stage-body`

## 3. 几何（单位 px，浅色与深色一致）

| 项 | 修复前 | 修复后 |
| --- | --- | --- |
| 分割线 top / height | 140 / 1 | 84 / 1 |
| 分割线横向范围 | 320 → 1600（贯通 stage 全宽 1280） | 同左（未变） |
| 分割线 margin | 12 / 8 | 同左（未变） |
| 标题描述区 | 0 → 72 | 同左（未变） |
| tab 行 | 72 → 128 | 93 → 149 |
| 筛选行 | 149 → 193 | 149 → 193（未移动） |
| 描述底 → 分割线 | 80 | 24 |
| 分割线 → tab 行内容顶 | —（原在 tab 行下方） | 8 |
| tab 行内容底 → 筛选行内容顶 | 39（含分割线） | 18（纯留白） |

主题取色：浅色 `rgb(204, 204, 204)`（`--dsw-alias-border-l2`）；深色 `rgba(255, 255, 255, 0.12)`（`--dsw-alias-border-l1/l2`）。

行为回归：点击「私信」后 `aria-selected` 正确翻转且内容区切换，分割线仍在 tab 行之上（84 < 93）；harness 控制台错误 0。

键盘（2026-09-15 订正，实测行为）：tab 项可聚焦、Tab 焦点顺序自洽；聚焦未激活 tab 后**只有空格键可激活切换**；**方向键不切换、回车不触发**——共享 `Tabs` 组件本身无 keydown 处理，改动前后完全一致，属**既有能力边界，不是本次引入的回归**。

## 4. 自动化与门禁

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter omnimux-analytics test` | 117 tests / 34 suites，pass 117，fail 0 |
| `pnpm verify:stages` | PASS（11 个 Stage 组件、8 个 sidebar 契约） |
| `pnpm test:ui` | 511 个源文件，违规 0 |
| `plugins/omnimux/src/client/shared-tabs-dividers.e2e.test.js` | 4/4 通过 |
| 新测红绿（`analytics-stage-divider.test.js` + `analytics-header-divider.e2e.test.js`） | 红：回退源码后合计 6 条中 4 条失败；绿：还原后 6/6 通过 |
| PR #1873 required check（Static L0 QA & Tests） | pass（1m48s） |

新增测试说明：`analytics-stage-divider.test.js` 用 react-dom/server 渲染真实 stage 断言元素顺序；`analytics-header-divider.e2e.test.js` 把真实 stage 打成浏览器包后用本机 headless Chrome 打开临时页面，断言子元素顺序为 `PageHeader → separator → action-row → filter`、分割线 1px 高且贯通 stage 全宽、两侧净空 8~28px、筛选栏 `border-bottom` 为 0/none。临时目录随测自清理。

## 5. 图片

- `before-light.png` / `before-dark.png`：修复前，分割线在 tab 行下方（y=140）
- `after-light.png` / `after-dark.png`：修复后，分割线在页头与 tab 行之间（y=84）
- `compare-light.png` / `compare-dark.png`：上=修复前、下=修复后的页头至筛选行对照。**由 QA 用受控渲染重做**（见下）

### 5.1 截图来源标注（2026-09-15 订正）

- **存档的 `qa-evidence/after-*.png` 与本次运行的原始采集并非同一批。** `tmp/after-light.png` 与 `qa-evidence/after-light.png` 哈希不同，差异为**页头 1825 px + 正文 80014 px**（深色同型：1814 / 79958）；而 `tmp/before-*.png` 与 `qa-evidence/before-*.png` 逐像素相同（0 差异）。
- **对比图由 QA 用受控渲染重做**，覆盖 `compare-light.png` / `compare-dark.png`；**覆盖前原图已另存为 `compare-light.engineer-original.png` / `compare-dark.engineer-original.png`**，无信息损失。
- **差异点**：存档 `after-*` 正文区存在约 80014 px（浅色）/ 79958 px（深色）内容差异，与本次只移动一条分割线的改动无关；**受控渲染下正文区差异应为 0 px**（`tmp/` 前后对 0 px，QA 独立受控实验 0 px）。引用存档图做整图差分时，只有**页头条带**差异可归因于本次改动。
- QA 的产物（`qa-report.md` 及上述 `compare-*` 图）**未被本次订正改动**。

## 6. 与共享规范的偏离

`specs/shared-tabs-dividers-polish.spec.md`（#1866/#1868）AC-4 要求「仅保留标签栏下方的一条分割线」。本次按用户明确要求把分割线移到标签栏上方，属对该条位置描述的定向覆盖；该条实质要求（筛选栏下方无底边框、全页仅此一条分割线）未被放宽。已在共享规范 AC-4 处就地补充被覆盖说明。

## 7. 未覆盖

- 未在开发版真机演示（Dev 验收由人工执行）。
- 分割线横向仍贯通 stage 全宽，与内容 20px 内缩不对齐——此为修复前既有形态，本次未改。

## 8. 订正记录（2026-09-15，依据 QA 独立复核）

QA 复核结论为「源码无缺陷、测试有效」，但发现三处证据/报告层面的表述不实。本文档只改措辞，**未改业务源码、未改测试、未动 QA 产物**：

1. **差异口径**（§1、§5.1）：原文写「差异 bbox=(320,80)-(1600,141)，9177 px」，以「差异 bbox」措辞却只统计页头条带，量级低估约十倍。已改为明确区分页头条带（8773 px / 51 行）与全图（88787 px / 381 行，至 y=799），并说明正文区差异来源不是本次改动（受控渲染下正文应为 0 差异）。
2. **键盘结论**（§3）：原文称方向键/回车可切换。实测**方向键不切换、回车不触发，只有空格键可激活**；共享 `Tabs` 组件无 keydown 处理，改动前后一致，属既有能力边界、**非本次引入的回归**。
3. **截图来源**（§5.1）：原文未说明存档 `after-*.png` 与该次运行原始采集并非同一批。已标注对比图由 QA 用受控渲染重做、原图另存为 `compare-*.engineer-original.png` 备份，并写明差异点。

依据记录：`.agent-reports/analytics-header-divider/qa-report.md`（§2.5 / §7.2 / §7.3 / §9）。
