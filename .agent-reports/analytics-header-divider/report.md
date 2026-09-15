# 数据分析看板分割线迁移 · 结论报告

- Issue：#1869
- 分支：`agent/analytics-header-divider-issue-1869`
- 工作树：`.worktrees/analytics-header-divider-issue-1869`
- 变更面：`plugins/omnimux-analytics/src/client/AnalyticsStage.jsx`（2 行位移）+ 新增单测 + 规格
- 主题：用户诉求「数据分析插件的分割线迁移到 tab 选项卡与标题描述之间」

## 1. 结论

已完成。分割线从「tab 选项卡行下方」上移到「`PageHeader` 与 `ActionNavRow` 之间」，标签行下方不再有分割线；筛选栏位置完全未动。真实浏览器实测（浅色/深色）与自动化测试、静态门禁全部通过。**未合并**（界面改动硬门禁：先演示、后合入）。

## 2. 前一位遗留证据的有效性判定

对四张截图做了逐字节 SHA-256 与像素级差分，结论：**前一位证据真实有效，方向正确，且浅色/深色确实为两套主题**。

> ⚠️ 本节的差异数字已于 2026-09-15 按 QA 独立复测订正，见 §2.1 与 §10。原文只统计页头条带却以「差异 bbox」措辞呈现，量级低估约十倍。

| 判定项 | 结果 |
| --- | --- |
| 四图 SHA-256 | 两两互不相同 |
| `before-light` vs `after-light` · **页头条带**（x320–1600, y0–141） | 差异 **8773 px**，51 行 |
| `before-light` vs `after-light` · **全图**（x320–1600, y0–929） | 差异 **88787 px**，**381 行**，一直延伸到 y=799 |
| `before-dark` vs `after-dark` | 深色同型。QA 仅独立复测浅色；深色的带内/全图数值**未独立复测**（原记带内 9252 px，保留原值并标注未复测） |
| `before-light` vs `before-dark` | 全图 1 783 116 px 差异（确为两套主题，而非误截同图） |
| 被误截成 after 的可能 | 排除：before 两图的分割线都在 y=140，after 两图都在 y=84 |
| 渲染的是真实 `AnalyticsStage` | 确认：`tmp/.../harness/entry.jsx` 直接 import 工作树源码；截图中标题「数据分析看板」、描述、tab「发布效果分析/私信」、筛选栏俱全；harness 控制台错误 0 |
| bundle 与源码时序 | 源码 mtime 11:48:09 → bundle 11:48:14 → after 截图 11:48:39/40；before 截图 11:47:35/37（早于改动） |

### 2.1 差异口径订正（页面头条带 vs 全图）

原文写「差异 bbox=(320,80)-(1600,141)，差异像素 9177，涉及 51 行」，措辞为「差异 **bbox**」却只统计了**页头条带**，把正文区的大范围差异排除在外，量级因此低估约十倍。按 QA 独立复测，正确口径如下（浅色，x320–1600）：

| 口径 | 差异像素 | 差异行数 | 纵向范围 |
| --- | --- | --- | --- |
| **页头条带**（y0–141） | 8773 | 51 | 至 y=141（行数与原文 51 行吻合，像素数差 −4.4%） |
| **全图**（y0–929） | 88787 | 381 | 一直延伸到 y=799 |

**正文区差异的来源不是本次改动。** 在受控渲染下，正文区差异应为 **0 px**：QA 的 `tmp/` 原始前后对实测正文 **0 px**，其独立受控实验同样得到正文 **0 px**（我的独立复现亦为 0）。全图 88787 px 中超出页头带的约 80014 px，来自**存档截图与本次运行原始采集并非同一批**（详见 §8.1），属与本次分割线位移无关的正文内容变化，不能计入本次改动的视觉效果。

因此本次改动的准确表述是：**页头条带差异 8773 px / 51 行**；全图 88787 px / 381 行**不等于**本次改动的影响面。

## 3. 改动内容

`AnalyticsStage.jsx` 内 `<Divider />` 由 `<ActionNavRow>` 之后移到 `<PageHeader>` 与 `<ActionNavRow>` 之间（净 +1/−1 行，无其他改动，无内联样式、无裸色值、未改组件库）。

**DOM 顺序（stage 直接子元素）**

- 修复前：`HEADER` → `action-row` → `[role=separator]` → `stage-filter` → `stage-body`
- 修复后：`HEADER` → `[role=separator]` → `action-row` → `stage-filter` → `stage-body`

## 4. 实测间距（真实浏览器，stage 宽 1280，浅/深色一致，单位 px）

| 项 | 修复前 | 修复后 |
| --- | --- | --- |
| 分割线 top / height | 140 / 1 | 84 / 1 |
| 分割线横向范围 | 320 → 1600（贯通全宽，左右 0 内缩） | 同左（未变） |
| 分割线 margin | 12 / 8 | 同左（未变） |
| 描述底 → 分割线 | 80 | **24** |
| 分割线 → tab 行内容顶 | —（原在 tab 行下方） | **8** |
| tab 行内容底 → 筛选行内容顶 | 39（含分割线） | **18**（纯留白，无分割线） |
| 筛选行 top–bottom | 149 → 193 | 149 → 193（未移动） |

节奏结论：分割线沿用组件默认 12/8 外边距，与页头 24px、与 tab 行 8px，落在规格 AC-6 要求的 8–28px 区间内；标签行与筛选行之间保留 18px 净留白，无视觉断裂。

主题取色：浅色 `rgb(204,204,204)`（= `--dsw-alias-border-l2`）；深色 `rgba(255,255,255,0.12)`（= `--dsw-alias-border-l1/l2`）。

行为回归：点击「私信」后 `aria-selected` 正确翻转、内容区切换，分割线仍在 tab 行之上（84 < 93）。

键盘可达（2026-09-15 订正，实测行为）：Tab 焦点顺序仍自洽、tab 项**可聚焦**；聚焦未激活 tab 后**只有空格键可激活切换**（`aria-selected` 翻转）。**方向键不切换、回车（Enter）不触发**——共享 `Tabs` 组件本身没有 keydown 处理，改动前后表现**完全一致**，属**既有能力边界，不是本次引入的回归**。原文「键盘焦点保持在 tab 按钮」的表述不足以反映上述边界，已按实测改写；规格 AC-7 同步订正（见 §10）。

## 5. 红绿验证

新增两个测试：
- `plugins/omnimux-analytics/src/client/analytics-stage-divider.test.js`：esbuild 打包真实 stage → `react-dom/server` 渲染 → 断言元素顺序。
- `plugins/omnimux-analytics/src/client/analytics-header-divider.e2e.test.js`：真实 stage 打成浏览器包 → 本机 headless Chrome `--dump-dom` 打开临时页面（临时目录、自清理）→ 断言子元素顺序、分割线几何（1px、贯通全宽、两侧净空 8~28px）与筛选栏无底边框。

红绿（源码临时回退到 HEAD，分割线回到 tab 行下方）：

| 测试 | 红 | 绿 |
| --- | --- | --- |
| 顺序/结构测试 | 3 条中 2 条失败 | 3/3 通过 |
| 端到端测试 | 3 条中 2 条失败 | 3/3 通过 |
| 合计 | 6 条中 4 条失败 | 6/6 通过 |

## 6. 测试与门禁（真实数字）

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter omnimux-analytics test` | 117 tests / 34 suites，pass 117，fail 0 |
| `pnpm verify:stages` | PASS：11 个 Stage 组件、8 个 sidebar 注册契约 |
| `pnpm test:ui` | 扫描 511 个客户端视图源文件，UI01~UI10 违规 0 |
| `plugins/omnimux/src/client/shared-tabs-dividers.e2e.test.js` | 4/4 通过（含「数据分析看板移除下方重复分割线」） |
| 未跑全仓 `pnpm test` | 改动面仅单插件源码 + 规格 + 单插件测试；已跑目标插件套件与受影响门禁 |
| PR #1873 required check（Static L0 QA & Tests） | pass（1m48s） |

## 7. 对共享规范 AC-4 的处理

`specs/shared-tabs-dividers-polish.spec.md`（#1866/#1868）AC-4 要求「仅保留标签栏下方的一条分割线」，本次用户要求的位置正好相反。处理方式：

- 在本任务规格 `specs/analytics-header-divider.spec.md` §8 写明这是**用户明确要求驱动的定向调整**，不是遗漏；
- 就地在共享规范 AC-4 下补一条被覆盖说明（只标注这一条），写明数据分析页调整后的期望位置（标签栏上方），并明确该条实质要求（筛选栏下方无底边框、全页仅一条分割线）未被放宽，产品库/资产库/技能市场不受影响；
- 未改动共享规范的其他条目。

## 8. 证据路径

`qa-evidence/analytics-header-divider/`

- `before-light.png` / `before-dark.png`（修复前，分割线 y=140）
- `after-light.png` / `after-dark.png`（修复后，分割线 y=84）
- `compare-light.png` / `compare-dark.png`（前/后上下叠放对照）
- `*-crop.png`（页头至筛选行的裁剪对照）

夹具（可复现）：`tmp/analytics-header-divider/harness/`（esbuild + 动态端口 + 自清理），实测脚本为 ego-browser 会话内 `page.evaluate` 计算样式与几何。

### 8.1 截图来源标注（2026-09-15 订正）

原文未说明存档截图的来源差异，现如实标注：

- **存档的 `qa-evidence/after-*.png` 与本次运行的原始采集并非同一批。** `tmp/after-light.png` 与 `qa-evidence/after-light.png` 哈希不同，差异为**页头 1825 px + 正文 80014 px**（深色同型：1814 / 79958）。而 `tmp/before-*.png` 与 `qa-evidence/before-*.png` 逐像素相同（0 差异）。
- **对比图已由 QA 用受控渲染重做。** QA 独立发现该问题后，用其自建夹具的受控渲染重做了前后对比拼图，覆盖 `qa-evidence/analytics-header-divider/compare-light.png`（`compare-dark.png` 同）。
- **原图已另存备份，无信息损失。** 覆盖前，QA 把工程师原图另存为 `compare-light.engineer-original.png` / `compare-dark.engineer-original.png`。
- **差异点小结**：存档 `after-*` 的正文区（y210 以下）存在约 80014 px（浅色）/ 79958 px（深色）的内容差异，与本次只移动一条分割线的改动无关；**受控渲染下正文区差异应为 0 px**（`tmp/` 前后对实测 0 px，QA 独立受控实验 0 px）。因此引用存档图做整图差分时，只有**页头条带**差异可归因于本次改动。
- QA 的产物（`qa-report.md`、`compare-light.png`、`compare-dark.png`、`compare-*.engineer-original.png`）**均未被本次订正改动**。

## 9. 未覆盖 / 未知项

- **未在开发版真机演示**：按仓库约定 Dev 真机验收由人工执行，不作为 Agent 交付前提。
- **分割线横向仍贯通 stage 全宽**：与标题/筛选内容的 20px 内缩不对齐。此为修复前既有形态，本次未改（用户诉求只涉及垂直位置；共享规范 AC-1 的 20px 留白仅针对产品库）。若要统一属另一次改动，需用户确认。
- **未合并、未物化 Dev、未清理工作树**：用户级硬门禁要求界面改动先演示、后合入。

## 10. 订正记录（2026-09-15，依据 QA 独立复核）

QA 复核结论为「源码无缺陷、测试有效」，但发现三处**证据/报告层面的表述不实**。本次只改文档措辞，**未改任何业务源码、未改测试、未动 QA 产物**。

| # | 原文错在哪 | 订正后的表述 | 落点 |
| --- | --- | --- | --- |
| 1 | 写「差异 bbox=(320,80)-(1600,141)，9177 px」，以「差异 bbox」措辞却只统计页头条带，量级低估约十倍 | 明确区分：**页头条带** 8773 px / 51 行；**全图** 88787 px / 381 行（至 y=799）。并说明正文区差异来源不是本次改动——受控渲染下正文应为 **0 差异** | §2 表、§2.1 |
| 2 | 声称「方向键/回车可切换选项卡」已验证 | 如实描述：tab 项可聚焦、**只有空格键可激活**；**方向键不切换、回车不触发**；共享 `Tabs` 组件无 keydown 处理，前后一致，属**既有能力边界、非本次引入** | §4、规格 AC-7 |
| 3 | 未说明存档 `qa-evidence/after-*.png` 与该次运行原始采集并非同一批 | 如实标注：对比图由 QA 用**受控渲染重做**，原图已另存为 `compare-*.engineer-original.png` 备份；写明存档截图与原始采集的差异点（页头 1825 px + 正文 80014 px，深色 1814 / 79958） | §8.1 |

订正所依据的原始记录：`.agent-reports/analytics-header-divider/qa-report.md`（QA 严过关，§2.5 / §7.2 / §7.3 / §9）。
