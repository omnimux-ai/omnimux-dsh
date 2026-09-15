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

| 判定项 | 结果 |
| --- | --- |
| 四图 SHA-256 | 两两互不相同 |
| `before-light` vs `after-light` | 差异 bbox=(320,80)-(1600,141)，差异像素 9177，涉及 51 行 |
| `before-dark` vs `after-dark` | 同区域，差异像素 9252 |
| `before-light` vs `before-dark` | 全图 1 783 116 px 差异（确为两套主题，而非误截同图） |
| 被误截成 after 的可能 | 排除：before 两图的分割线都在 y=140，after 两图都在 y=84 |
| 渲染的是真实 `AnalyticsStage` | 确认：`tmp/.../harness/entry.jsx` 直接 import 工作树源码；截图中标题「数据分析看板」、描述、tab「发布效果分析/私信」、筛选栏俱全；harness 控制台错误 0 |
| bundle 与源码时序 | 源码 mtime 11:48:09 → bundle 11:48:14 → after 截图 11:48:39/40；before 截图 11:47:35/37（早于改动） |

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

行为回归：点击「私信」后 `aria-selected` 正确翻转、内容区切换，分割线仍在 tab 行之上（84 < 93）；键盘焦点保持在 tab 按钮。

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

## 9. 未覆盖 / 未知项

- **未在开发版真机演示**：按仓库约定 Dev 真机验收由人工执行，不作为 Agent 交付前提。
- **分割线横向仍贯通 stage 全宽**：与标题/筛选内容的 20px 内缩不对齐。此为修复前既有形态，本次未改（用户诉求只涉及垂直位置；共享规范 AC-1 的 20px 留白仅针对产品库）。若要统一属另一次改动，需用户确认。
- **未合并、未物化 Dev、未清理工作树**：用户级硬门禁要求界面改动先演示、后合入。
