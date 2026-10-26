# 浏览器插件 · 设置面板行标签与说明句的窄宽度布局（Issue #3796）

真实浏览器（未打包扩展，`scripts/lib/extension-e2e.mjs` 单进程、自清理）验收证据。
本目录是本次交付的专属实测证据，不是首页冒烟图。下列每个数字都出自同目录 JSON。

## 1. 验收对象

- 工作树：`.worktrees/browser-settings-label-layout-3796`，分支 `fix/browser-settings-label-layout-3796-issue-3796`
- 规格：`specs/browser-settings-label-layout-3796.spec.md`
- 扩展构建产物：`plugins/omnimux-browser/extension/dist`（`node scripts/build.mjs` 重建后验收）
- 运行方式：Chrome for Testing + `--load-extension`，扩展页 `chrome-extension://<id>/panel/index.html`，
  通过面板自身的设置按钮进入设置视图；不注入任何夹具样式

## 2. 复现的缺陷

`.settings label` 用 `grid-template-columns: 1fr auto`：说明句是长中文且无换行约束，`auto` 列
按内容撑到接近整行宽，`1fr` 标签列被压到不足一个汉字宽，中文逐字断行。

修复前在 420px 面板宽度下实测（见 §4 证伪日志）：**「文本生成模型」标签列仅 12px 宽、占 6 行**，
「鉴权 Token」标签列 51px、占 2 行。

## 3. 真实浏览器断言（16 项 × 4 个宽度 × 深浅两套主题）

命令（每个宽度一次运行，一个 Chrome 进程，结束清理）：

```bash
node scripts/verify-browser-settings-label-layout.mjs --width 280
node scripts/verify-browser-settings-label-layout.mjs --width 340
node scripts/verify-browser-settings-label-layout.mjs --width 420
node scripts/verify-browser-settings-label-layout.mjs --width 1280
```

| 结果 | 280px | 340px | 420px | 1280px |
| --- | --- | --- | --- | --- |
| dark | 16/16 pass | 16/16 pass | 16/16 pass | 14/14 pass |
| light | 16/16 pass | 16/16 pass | 16/16 pass | 14/14 pass |

1280px 是宽面板，跳过两条只在 ≤480px 生效的窄面板断言，故为 14 项。

断言清单（同一份 `judge()`，逐项 pass/actual 见 JSON）：

| # | 断言 | 说明 |
| --- | --- | --- |
| 1 | 两行模型配置同时存在 | 按「对话模型 / 文本生成模型」定位 |
| 2–3 | 对话模型 标签单行、未裁切 | `labelLines === 1`，`scrollWidth` 未超自身宽 |
| 4 | 对话模型 控件铺满整行 | 模型选择器 + 推理等级 + 间隙 ≥ 控件行宽 |
| 5 | 对话模型 说明句落到标签下方（≤480px）／同排且未压窄标签（>480px） | 按宽度切换判据 |
| 6 | 对话模型 说明句不压住控件 | `controlTop >= smallBottom` |
| 7–11 | 文本生成模型 同上五项 | 该行只有模型选择器，`effortWidth` 为 0 |
| 12 | 所有设置行都没有超出自身宽度 | **逐行** `scrollWidth - clientWidth`，而非 `documentElement`（后者因 `.settings-panel{overflow:hidden}` 恒为 0） |
| 13 | 其它设置行标签同样单行未裁切 | 10 个非开关行 |
| 14 | 开关行在窄面板下未被压坏 | 8 个开关行，标签未裁切、行未溢出（仅 ≤480px） |
| 15 | 开关行的开关仍在文案右侧 | 7 个非中继开关行，`switchLeft >= copyRight`（仅 ≤480px） |
| 16 | 中继配置行标签未裁切、行未溢出 | 5 个中继行（脚本会先点「添加档案」让它们出现） |

测量面（`measured.rowCounts`，每个宽度/主题一致）：**22 行** —— 开关行 8、中继配置行 5、
普通设置行 10（「设为默认模型」既在中继配置里又是开关行，两类各计一次，故三者之和为 23）；
模型两行另存完整几何。中继行的 label 是 `.relay-profile label`（flex 列，无说明句列），
开关行文本在 `.setting-toggle-copy` 内——两者都必须测，因为窄面板规则正是用
`:not(.setting-toggle)` 把它们排除在外的。

产物：`settings-<width>px-<theme>.png`（8 张）、`settings-label-layout-<width>.json`（4 份，
含 viewport、主题、每行几何、逐项 pass/actual、chromePid 与 profileDir）。

## 4. 证伪（修复前必须失败）

把 `styles.css` 回退到修复前版本、重建 `dist`，跑同一条 420px 命令：

```
420px dark: 12/16 pass
  FAIL 文本生成模型 标签单行显示（不逐字竖排） {"labelLines":6}
  FAIL 对话模型 说明句落到标签下方 {"narrow":true,"labelTop":285,"labelHeight":16,"smallTop":285}
  FAIL 文本生成模型 说明句落到标签下方 {"labelTop":384,"labelHeight":97,"smallTop":384}
  FAIL 其它设置行标签同样单行未裁切 {"broken":[
    {"text":"文本生成模型","labelLines":6,"labelWidth":12,"labelHeight":97},
    {"text":"鉴权 Token","labelLines":2,"labelWidth":51,"labelHeight":32}]}
```

恢复修复后同一条命令回到 16/16。这说明断言锚定的是本缺陷，不是恒真。

## 5. 共用网格的其它行（回归面实测）

窄面板单列规则只作用于 `label:not(.setting-toggle)`，为确认没有误伤，脚本实测了全部 22 行：

- **开关行（8 行）**：420px 下文案列宽 312px、开关 `switchLeft = 354` 仍在文案右缘
  （`copyRight = 342`）之外；280px 下为 172 / 214 / 202，同样在右侧。两档 `rowOverflow` 均为 0，
  即保持两列、未被挤到下一行
- **中继配置行（5 行）**：4 个字段 label 宽 310px、「设为默认模型」开关行文案宽 162px，
  全部单行、`rowOverflow = 0`
- **其它设置行（10 行）**：标签全部单行、未裁切
- **逐行溢出**：22 行 `rowOverflow` 全为 0

## 6. 其它证据

- 定向单测：`npx vitest run tests/panel-settings-label-layout.spec.ts tests/panel-styles.spec.ts tests/panel-text-model-isolation.spec.ts` → 9/9 pass
- 扩展全量单测：`cd plugins/omnimux-browser/extension && pnpm test` → 160 文件 / 1743 pass + 1 expected fail
- `pnpm verify:stages` → PASS: 14 Stage components; 8 registered sidebar targets
- `node --test scripts/verify-anti-slop.test.mjs` → pass 3 / fail 0
- `node --test scripts/verify-governance-registry.test.mjs` → pass 4 / fail 0（新脚本已在 `scripts/governance-manifest.json` 登记为 manual）
- `pnpm test:gates` → exit 0
- `pnpm typecheck`：70 个既有错误，与 `origin/main` 检出同一基线，本次新增 0 个
