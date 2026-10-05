# 规格 · #3166 账号监控 v2 卡片线收口整改（R10）

## 1. 目标（Objective）

R9（`05e0da3a5`）落地后 QA 收口复验 `QA_VERDICT: FAIL`、PM 终验 `PM_SIGN_OFF: REJECT`。本轮修剩余项：行首禁则**按码位分**语义（不是按前驱类型）、半透明中性媒体胶囊改不透明、600px 档同列 4px 物理重叠、装置补亮封面夹具、规格三处修订、Q5/N4 溢出量入报告。

## 2. 决策（主理人裁定，照做）

- **行首禁则逐码位语义**（核心）：QA 用 `@40px` 形态（`中文中文中文X`，逐行内容直接测量）证 Chrome 行为逐码位异质：
  - **拉回**：`，。、：；？！﹖﹗`（FF0C / 3002 / 3001 / FF1A / FF1B / FF1F / FF01 / FE56 / FE57）——6820 格隔离网格量化为各 +22 全低估 ⇒ 这五个码位在拉回（base）上本就正确；
  - **悬挂**：`｡､･〉】〕）`（FF61 / FF64 / FF65 / 3009 / 3011 / 3015 / FF09）——悬挂量化 72→55 / 48→31 / 51→31 ⇒ 必须悬挂；
  - 前驱类型仍为次级条件：前驱是不可断词原子时标点留行尾（R9 已对，保留）。
  - 实现：`LINE_START_PULLBACK` / `LINE_START_HANG` 两个集合（或禁则条目带语义标记）。
  - 断言：每码位一条钉行断言（拉回组期望 4 行、悬挂组期望 3 行，`@40px` 形态），加一条区分「按码位」vs「按前驱类型」的断言。
  - 验收：QA 的 1100 例 × 7 宽度对照报「不符 Chrome 数」，与四变体基线（base 689 / NP 828 / GH 689 / NH 676）对比，目标 **< 676**。
- **M2**：`rival-tokens.js` 半透明中性媒体胶囊两个背景令牌（`media-pill-bg` 0.38 / `media-pill-bg-dim` 0.30）→ 不透明 `#111113`（复用既有 media-ink 值；亮封面最劣 1.63、已处理态 2.43/2.70 均劣于琥珀档 1.61）。验收：26 组合 × 2 主题 fail=0、最小 4.83。
- **α 保底**：R9 已改不透明 `#78350f`，只需确认闭环。
- **R8-3**：600px（2 列）`ra_4:p11` 底 819.55 vs `ra_6:p5` 顶 815.55 重叠 4px，装置 `maxAdjacentOverlap=4` 已报出而 R8 报告写「600 无重叠」。修重叠并把报告口径改成与装置指标一致。验收：1164/860/600 三档 `maxAdjacentOverlap` 全 0。
- **装置夹具**：`harness/covers/c1..c12.svg` 全为暗色渐变（hsl 18%→30%），补亮封面（纯白 + ~65% 灰），对比度验收覆盖。
- **M3 规格三处**：§9.1「配色不变」自相矛盾改「色相不变，明度按 #3166 底线校准后的值」；§3.3 红线区 `飙升` on-media 底改动须落 §9.7 冲突表；数值口径加前提 + §9.6 补 V23（亮封面夹具 × 6 档 × 2 主题 × 2 承载面 × 已处理态像素法 ≥4.5）。
- **Q5/N4**：把实际溢出量写进报告与规格口径（Q5 典型 19px/最劣 46px；N4 第 4 项被裁、en 连第 3 项也被裁）；能在不改字典不加宽前提下减少溢出则做，否则如实记录为已知偏差。

## 3. 用户操作旅程与期望反馈

- 用户浏览含 CJK 标点（句号、顿号、半角片假名、括号等）的卡片正文/标题：断行行数与 Chrome 一致，不因估算错误导致卡片重叠或留白。
- 用户在亮封面媒体卡上读中性胶囊（`观察`/`均速`/`该号`）：文字与合成背景对比度 ≥4.5:1。
- 用户在窄视口（600px/2 列）浏览：同列卡片不物理重叠。

## 4. 验收标准（Success Criteria）

1. `rivalWrapLines`：逐码位语义落地；新增断言全绿；R10 前悬挂组断言须为红。
2. QA 1100×7 对照：不符 Chrome 数 < 676；6820 格联合口径下降。
3. 对比度：26 组合 × 2 主题 fail=0、最小 4.83；`codepoint-probe.mjs` 仍 0 mismatches。
4. 三档 `maxAdjacentOverlap` = 0，报告口径与装置指标一致。
5. `covers/` 含纯白与 ~65% 灰亮封面；对比度验收覆盖亮封面（含已处理态）。
6. 规格 §9.1/§9.6(V23)/§9.7 三处修订落盘；Q5/N4 溢出量入报告与规格。
7. 全量回归：`第一段 N / 第二段 261 / 合计 M` 全绿；资产层无回归；暗/亮整页（含亮封面）+ 600px 档人眼复检无重叠/破版/胶囊可读。

## 5. 命令（Commands）

```bash
cd plugins/omnimux-inspiration && node --import ./scripts/deny-network.mjs --test <files>
cmd > log 2>&1; echo "REAL_EXIT=$?"; grep 'ℹ fail' log
node docs/evidence/account-monitor-v2-cards-3110/harness/{build-demo,measure-placement,codepoint-probe}.mjs
```

## 6. 项目结构（相关文件）

- `plugins/omnimux-inspiration/src/client/rival-masonry.js` — 行首禁则按码位拆分
- `plugins/omnimux-inspiration/src/client/rival-masonry.test.js` / `rival-cards.e2e.test.js` — 钉行断言 + oracle 同步
- `plugins/omnimux-inspiration/src/client/rival-tokens.js` — M2 两个胶囊背景令牌
- `docs/evidence/account-monitor-v2-cards-3110/harness/covers/` — 亮封面夹具
- `docs/evidence/account-monitor-v2-cards-3110/harness/demo-entry.jsx` — 亮封面接入参数
- `docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md` — M3 三处修订
- `docs/evidence/account-monitor-v2-cards-3110/r8/report.md` — 重叠口径与溢出量登记

## 7. 边界（Boundaries）

- **总是**：逐码位语义先写红断言；真实退出码取证；测试口径 `第一段 N / 第二段 261 / 合计 M`；只在工作树内改文件；git 用 `git -C <绝对路径>`。
- **绝不**：amend 已有提交；开新 PR；改字典文案；用祖先背景链替代像素法。
