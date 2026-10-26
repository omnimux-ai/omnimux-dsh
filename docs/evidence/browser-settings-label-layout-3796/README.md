# 浏览器插件 · 设置面板行标签与说明句的窄宽度布局（Issue #3796）

真实浏览器（未打包扩展，`scripts/lib/extension-e2e.mjs` 单进程、自清理）验收证据。
本目录是本次交付的专属实测证据，不是首页冒烟图。**下面每个数字都标注了它出自哪份 JSON。**

## 1. 验收对象

- 工作树：`.worktrees/browser-settings-label-layout-3796`，分支 `fix/browser-settings-label-layout-3796-issue-3796`
- 规格：`specs/browser-settings-label-layout-3796.spec.md`
- 扩展构建产物：`plugins/omnimux-browser/extension/dist`（`node scripts/build.mjs` 重建后验收）
- 运行方式：Chrome for Testing + `--load-extension`，扩展页 `chrome-extension://<id>/panel/index.html`，
  通过面板自身的设置按钮进入设置视图；不注入任何夹具样式

## 2. 复现的缺陷

`.settings label` 用 `grid-template-columns: 1fr auto`：说明句是长中文且无换行约束，`auto` 列
按内容撑到接近整行宽，`1fr` 标签列被压到不足一个汉字宽，中文逐字断行。

回退到修复前 CSS 后实测（产物：`settings-label-layout-420-falsify.json`，见 §4）：

| 行 | `labelWidth` | `labelLines` |
| --- | --- | --- |
| 文本生成模型 | 12px | 6 |
| 鉴权 Token | 51px | 2 |

## 3. 真实浏览器断言

命令（每个宽度一次运行，一个 Chrome 进程，结束清理；默认跑深浅两套主题）：

```bash
node scripts/verify-browser-settings-label-layout.mjs --width 280
node scripts/verify-browser-settings-label-layout.mjs --width 340
node scripts/verify-browser-settings-label-layout.mjs --width 420
node scripts/verify-browser-settings-label-layout.mjs --width 1280
```

结果（产物：`settings-label-layout-<width>.json` 的 `runs[].assertions`）：

| 宽度 | dark | light | 断言总数 |
| --- | --- | --- | --- |
| 280px | 16/16 pass | 16/16 pass | 16 |
| 340px | 16/16 pass | 16/16 pass | 16 |
| 420px | 16/16 pass | 16/16 pass | 16 |
| 1280px | 15/15 pass | 15/15 pass | 15 |

1280px 是宽面板，跳过两条只在 ≤480px 生效的窄面板断言，另加 1 条只在宽面板生效的
45% 上限断言，故为 15 项。

断言清单（同一份 `judge()`）：

| # | 断言 | 适用 | 判据 |
| --- | --- | --- | --- |
| 1 | 两行模型配置同时存在 | 全部 | 按「对话模型 / 文本生成模型」定位 |
| 2–3 | 对话模型 标签单行、未裁切 | 全部 | `labelLines === 1`；`scrollWidth` 未超自身宽 |
| 4 | 对话模型 控件铺满整行 | 全部 | `\|控件行宽 −(模型选择器 + 推理等级)\| ≤ 10`（两者间距 8px） |
| 5 | 对话模型 说明句位置 | 全部 | ≤480px 落到标签下方；>480px 同排且未压窄标签 |
| 6 | 对话模型 说明句不压住控件 | 全部 | `controlTop ≥ smallBottom` |
| 7–11 | 文本生成模型 同上五项 | 全部 | 该行只有模型选择器，`effortWidth` 为 0 |
| 12 | 所有设置行都没有超出自身宽度 | 全部 | **逐行** `scrollWidth − clientWidth ≤ 1` |
| 13 | 其它设置行标签同样单行未裁切 | 全部 | 10 个非开关行 |
| 14 | 开关行在窄面板下未被压坏 | ≤480px | 8 个开关行标签未裁切、行未溢出 |
| 15 | 开关行的开关仍在文案右侧 | ≤480px | 7 个非中继开关行 `switchLeft ≥ copyRight` |
| 16 | 中继配置行标签未裁切、行未溢出 | 全部 | 5 个中继行（脚本先点「添加档案」让它们出现） |
| 17 | 超长标签受 45% 上限约束且不撑破行 | >480px | 见 §5 |

**逐行溢出（#12）为什么不用 `documentElement`**：`.settings` 自带 `overflow-y: auto`、
`.settings-panel` 是 `overflow: hidden`，页面级永远不会横向滚动，那个判据恒为 0（修复前也 pass）。
逐行 `scrollWidth − clientWidth` 才是被 `overflow:hidden` 掩盖的真实信号。

**控件铺满（#4）为什么改成差值比较**：`>= 控件行宽 − 12` 在留有死白时同样成立，属近恒真；
改成与实际 8px 间距比较后，死白超过 10px 即失败。

测量面（`measured.rowCounts`，四份 JSON 一致）：**22 行** —— 开关行 8、中继配置行 5、
普通设置行 10（「设为默认模型」既在中继配置里又是开关行，两类各计一次，故三者之和为 23）；
模型两行另存完整几何。

产物：`settings-<width>px-<theme>.png`（8 张）、`settings-label-layout-<width>.json`（4 份，
含 viewport、主题、每行几何、逐项 pass/actual、chromePid 与 profileDir）。

## 4. 证伪（修复前必须失败）

把 `styles.css` 回退到修复前版本、重建 `dist`，用 `--tag falsify` 跑同一条命令，
**失败产物独立保存、不覆盖通过证据**：

```bash
node scripts/verify-browser-settings-label-layout.mjs --width 420 --tag falsify
```

结果（产物：`settings-label-layout-420-falsify.json`，`pass: false`，12/16）：

| 失败断言 | `actual` |
| --- | --- |
| 文本生成模型 标签单行显示 | `labelLines: 6` |
| 文本生成模型 说明句落到标签下方 | `labelTop: 384, labelHeight: 97, smallTop: 384` |
| 对话模型 说明句落到标签下方 | `labelTop: 285, labelHeight: 16, smallTop: 285` |
| 其它设置行标签同样单行未裁切 | 文本生成模型 `labelLines: 6, labelWidth: 12`；鉴权 Token `labelLines: 2, labelWidth: 51` |

恢复修复后同一条命令回到 16/16（`settings-label-layout-420.json`）。断言锚定的是本缺陷，不是恒真。

## 5. 45% 上限的实测（`measured.longLabel`）

真实中文标签只有 4–7 字，`fit-content(45%)` 平时不参与计算，所以脚本会**临时**把一个标签
改成 90 字再测量、随后还原。宽面板实测（`settings-label-layout-1280.json` 的 `longLabel`）：

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `rowContentWidth` | 1220px | 行的内容宽度 |
| 45% 上限 | 549px | 1220 × 0.45 |
| `firstTrackWidth` | 549px | 实际标签轨道宽，**正好被 45% 卡住** |
| `labelLines` | 3 | 长标签换行而非撑满一行 |
| `rowOverflow` | 0 | 未撑破行 |

若去掉上限（裸 `max-content`），轨道会随 90 字撑到远超 549px 并溢出——这正是单测里
`doesNotMatch(/grid-template-columns:\s*max-content\s/)` 要防的回退。
窄面板下该上限不参与（媒体查询把标签列改为整行宽），所以这条断言只在 >480px 生效。

## 6. 共用网格的其它行（回归面实测，均出自 `settings-label-layout-420.json`）

- **开关行（8 行）**：其中 7 个非中继开关行文案列宽 312px、`switchLeft = 354` 在文案右缘
  （`copyRight = 342`）之外、`rowOverflow = 0`；第 8 个是中继里的「设为默认模型」，因
  `.relay-profile label` 是 flex 列布局，开关本就在文案下方（162 / 192 / 291），
  所以 #15 用 `nestedInRelay` 把它排除——排除的是**布局前提不同**，不是把它当合格样本
- **中继配置行（5 行）**：4 个字段 label 宽 310px、「设为默认模型」开关行文案宽 162px，
  全部单行、`rowOverflow = 0`
- **其它设置行（10 行）**：标签全部单行、未裁切
- **逐行溢出**：22 行 `rowOverflow` 全为 0

## 7. 其它证据

- 定向单测：`npx vitest run tests/panel-settings-label-layout.spec.ts tests/panel-styles.spec.ts tests/panel-text-model-isolation.spec.ts` → 9/9 pass
- 扩展全量单测：`cd plugins/omnimux-browser/extension && pnpm test` → 160 文件 / 1743 pass + 1 expected fail
- `pnpm verify:stages` → PASS: 14 Stage components; 8 registered sidebar targets
- `node --test scripts/verify-anti-slop.test.mjs` → pass 3 / fail 0
- `node --test scripts/verify-governance-registry.test.mjs` → pass 4 / fail 0（新脚本已在 `scripts/governance-manifest.json` 登记为 manual）
- `pnpm test:gates` → exit 0
- `pnpm typecheck`：70 个既有错误，与 `origin/main` 检出同一基线，本次新增 0 个
