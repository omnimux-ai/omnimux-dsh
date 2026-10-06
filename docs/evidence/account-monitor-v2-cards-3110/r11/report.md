# #3166 R11 修整 · 证据与测量记录

工作树 `.worktrees/account-monitor-v2-cards-r8`，分支 `fix/account-monitor-v2-cards-r8-issue-3166`，R10 `c5d543fda` 之后追加（同分支，非 amend）。
四轴裁定收敛：QA FAIL / 代码复审 BLOCKING / PM REJECT / OCR 4 medium → 一条实质代码项（两轴独立命中）+ 一批文档/装置口径项。

**度量口径（R11 起强制）**：不符数一律分「低估/高估」双列报。低估会直接导致卡片高度不足与重叠，是危险方向；R10 总数 678→405 的下降曾掩盖低估 310→330 的恶化，本报告全部表格执行双列。

## ① `｡､･` 归拉回（两轴独立命中，本票唯一实质代码项）

- 红证据：先补断言 `中中｡`@32 === 2（`中^n+X`@14n+4 形态）+ 中置形态 `中中X文文`@32 === 3——R10 悬挂实现给 1/2，断言红 `ℹ fail 1`（`/tmp/r11-red.log`）。
- 绿：`FF61/FF64/FF65` 由 `LINE_START_HANG` 移入 `LINE_START_PULLBACK`；`LINE_START_HALFWIDTH_HANG` 与 `unitPx/2` 半宽 advance 保留（宽度计量，与语义分组无关）。`rival-masonry.test.js` 59/59；`rival-cards.e2e.test.js` spec oracle 同步归组 17/17。
- Chrome 复核（`harness/cdp.mjs` 真机逐行）：`中中｡文文`@32 → `中`/`中｡`/`文文`（3 行，悬挂建模给 2）；`中中｡文文`@46 → `中中｡`/`文文`（2 行）。

### 与两轴数字对照

| 夹具 | R10 | R11 | 低估 | 高估 |
|---|---|---|---|---|
| QA 6820 格隔离网格（p4-kinzoku 22 码位） | 133（低估 74 / 高估 59） | **91** | **32** | **59** |
| 7700 行变体夹具（p1b，1100 例 × 7 宽） | 28（低估 3 / 高估 25） | **28** | **3** | **25** |
| 既有断言 | — | **0 条变红**（59/59 全绿） | — | — |

- 6820 格减掉的 42 格 = `｡､･` 各 14 格低估，与 QA `p7-halfwidth-content` 逐行核对一致（这 42 格在 R9 本对，是 R10 新引入回归）。
- 剩余 91 格残差在 U+201D/2026/FF08/300C/0021（词段/行尾禁则语义，域外，且全部相对 R9 改善）。
- 网格内 16+3 个禁则码位 mismatch：**R10 实测 42（非报告原写的 0），R11 全为 0**。QA 夹具族的 `@40px` 收尾形态对半宽组零鉴别力（`中文`=28 + `｡`=35 ≤ 40 根本不进禁则分支）——中置形态 `中中X文文` 已补入套件断言。
- 复算脚本：`r10/score-mismatch.mjs`（相对路径版，夹具入库至 `r11/p4-kinzoku.json`）。

## ② `％`(FF05) 登记偏差 + 注释三处

- `％` 留在拉回组（不得删除：删除使该码位网格不符 3→15），规格按**10 个码位**口径登记（`，。、：；？！﹖﹗％` + `｡､･`）。
- 注释修正：语义表注释 `｡､･` 归悬挂的断言已按证伪改写；错字「这五…九类」已修；`％` 在注释里标注登记偏差理由。

## ③ `filter-jump` `:focus-within` 补 `:not(:disabled)` + 护栏按选择器逐条判定

- `rival-styles.js`：`.omnimux-rival-filter-row:focus-within .omnimux-rival-filter-jump:not(:disabled)`（disabled 缺陷族第 4 次逃逸：R5 act-btn → R6 act-primary → R7 filter-jump → R11 focus-within）。
- 护栏假阴性修补：断言由「整条规则 `includes(':not(:disabled)')`」改为**按选择器逐条**判定（同一规则块内 `:hover` 选择器的守卫不得替 `:focus-within` 选择器顶包）。
- **注入验证**：临时删去 `:focus-within` 选择器的守卫 → `ℹ fail 1`（`lacks :not(:disabled)`）命中变红；恢复后 59/59。

## ④ 装置修复（OCR R1/R2/R4）

- `r10/p5-bright.mjs` 依赖的 `cdp.mjs` 已入库 `harness/cdp.mjs`（原文件仅在 QA 私有目录、命中 `.git/info/exclude`，仓库里第三方不可复现），import 改相对路径——本机复跑 82 枚胶囊裁图成功。
- `r10/score-mismatch.mjs` 改相对 import + 夹具路径参数化 + 低估/高估双列输出。
- 测试注释 BREAK_AFTER 计数 304 → **133**（R9 删 >0x2E7F 死码后实收，已数集核对）。

## ⑤ 文档口径

- PRD §9.1 `:564`：on-media `飙升` 底 = **不透明 `#78350f` + `#fbbf24`**（与 §9.7 字面一致；`120,53,15` 仅作历史沿革带「R9 已改」字样）；演示封面 ≥5.2:1、亮封面夹具 5.43:1。
- PRD §9.1 `:565`：溢出登记按 PM M2′ 实测重写——4 按钮卡典型 27px（73−46）、3 按钮卡最劣 57px（73−16）；label 自身典型 19px、最劣 51px。
- 数字统一：`ratio_far` 为判据口径——爆款 `4.6→4.79:1`、rising `5.46→5.43:1`（亮封面夹具）、V23 最小值 `4.83→4.79`，并在 V23 写明「`ratio_all` 均值口径最小 3.46 系抗锯齿计入，不作判据」。
- `r10/report.md`：变体表改双列；「16 个禁则码位全 0」更正为 **42**；Q5 最劣 46 → **51px**。

## ⑥ 观察项

- **O4**：`爆款` 实底红 ≥4.5:1 写成可执行断言（`rival-tokens.test.js`，声明值 WCAG 公式，覆盖 hot dark/light、rising on-media、中性三档与 light surface 合成底），fail=0。
- **O8**：`plugins/omnimux-inspiration/lib/client.js` 在本工作树内是 R8 期陈旧构建产物（仍含 `rgba(0,0,0,0.38)`/`rgba(120,53,15,0.9)` 旧令牌），被 `.gitignore` 忽略、未被 git 跟踪，由 `npm run build`（`prepare`）生成——**不是本 PR 缺陷，但发布打包前必须确认 prepare 已重建**（`package.json` 的 `files` 含它）。如实登记。

## ⑦ 全量回归与探针

- client 套件：第一段 **1109**（fail 0 / skipped 2 为既有 legacy 标记）/ 第二段 **261** / 合计 **1370**，REAL_EXIT=0 ×2，`ℹ fail 0`。
- 资产层：`omnimux` masonry-layout **4/4**、`omnimux-assets` 全套 **457/457**（`dsh-ui-kit` 私有依赖经软链复现 R10 环境修复，非生产改动）。
- `codepoint-probe.mjs`：**0 mismatches**（48 码位，R11 复跑，留档 `codepoint-probe.json`）。
- 人眼复检：暗整页 / 亮整页 / 亮封面（`?bright=1`）/ 600px 四张（`r11-*.png`），装置实测 `maxOverlap=0`（43 卡 ×4 档位），无重叠、无破版、胶囊可读。

## ⑧ 未做项

- 网格残差 91 格（U+201D/2026/FF08/300C/0021）属域外语义，非本票范围；已按低估 32 / 高估 59 双列登记，留跟进票。
