# 浏览器插件 · 设置面板行标签与说明句的窄宽度布局（Issue #3796）

真实浏览器（未打包扩展，`scripts/lib/extension-e2e.mjs` 单进程、自清理）验收证据。
本目录是本次交付的专属实测证据，不是首页冒烟图。

## 1. 验收对象

- 工作树：`.worktrees/browser-settings-label-layout-3796`，分支 `fix/browser-settings-label-layout-3796-issue-3796`
- 规格：`specs/browser-settings-label-layout-3796.spec.md`
- 扩展构建产物：`plugins/omnimux-browser/extension/dist`（`node scripts/build.mjs` 重建后验收）
- 运行方式：Chrome for Testing + `--load-extension`，扩展页 `chrome-extension://<id>/panel/index.html`，
  通过面板自身的设置按钮进入设置视图（不注入任何夹具样式）

## 2. 复现的缺陷

`.settings label` 用 `grid-template-columns: 1fr auto`：说明句是长中文且无换行约束，`auto` 列
按内容撑到接近整行宽，`1fr` 标签列被压到不足一个汉字宽，中文逐字断行。

修复前在 420px 面板宽度下实测：**「文本生成模型」占 6 行**、「鉴权 Token」占 2 行，
说明句与标签同排起头但把标签挤成竖排。

## 3. 真实浏览器断言（13 项 × 3 个宽度，全 pass）

命令（每个宽度一次运行，一个 Chrome 进程，结束清理）：

```bash
node scripts/verify-browser-settings-label-layout.mjs --width 280   # 13/13 pass
node scripts/verify-browser-settings-label-layout.mjs --width 340   # 13/13 pass
node scripts/verify-browser-settings-label-layout.mjs --width 420   # 13/13 pass
node scripts/verify-browser-settings-label-layout.mjs --width 1280  # 13/13 pass
```

| 断言 | 280px | 340px | 420px | 1280px |
| --- | --- | --- | --- | --- |
| 两行模型配置同时存在 | pass | pass | pass | pass |
| 对话模型 标签单行显示（不逐字竖排） | pass | pass | pass | pass |
| 对话模型 标签未被裁切 | pass | pass | pass | pass |
| 对话模型 控件铺满整行（无剩余空白） | pass | pass | pass | pass |
| 对话模型 说明句落到标签下方（≤480px）／与标签同排且未压窄标签（>480px） | pass | pass | pass | pass |
| 对话模型 说明句不压住控件 | pass | pass | pass | pass |
| 文本生成模型 标签单行显示（不逐字竖排） | pass | pass | pass | pass |
| 文本生成模型 标签未被裁切 | pass | pass | pass | pass |
| 文本生成模型 控件铺满整行（无剩余空白） | pass | pass | pass | pass |
| 文本生成模型 说明句落到标签下方／与标签同排且未压窄标签 | pass | pass | pass | pass |
| 文本生成模型 说明句不压住控件 | pass | pass | pass | pass |
| 页面无横向溢出 | pass | pass | pass | pass |
| 其它设置行标签同样单行未裁切（共 10 行） | pass | pass | pass | pass |

截图：`settings-280px.png`、`settings-340px.png`、`settings-420px.png`、`settings-1280px.png`；
结构化报告：`settings-label-layout-<width>.json`（含 viewport、每行几何、逐项 pass/actual）。

## 4. 证伪（修复前必须失败）

把 `styles.css` 回退到修复前版本、重建 `dist` 后跑同一条 420px 命令：

```
420px: 9/13 pass
  FAIL 文本生成模型 标签单行显示（不逐字竖排） {"labelLines":6}
  FAIL 对话模型 说明句落到标签下方 {"narrow":true,"labelTop":285,"labelHeight":16,"smallTop":285}
  FAIL 文本生成模型 说明句落到标签下方 {"labelTop":384,"labelHeight":97,"smallTop":384}
  FAIL 其它设置行标签同样单行未裁切 {"broken":[{"text":"文本生成模型","labelLines":6},{"text":"鉴权 Token","labelLines":2}]}
```

恢复修复后同一条命令回到 13/13 pass。这证明断言确实锚定本缺陷，而不是恒真。

## 5. 共用网格的其它行（回归面实测）

`@media (max-width: 480px)` 的单列规则只作用于 `label:not(.setting-toggle)`。为确认没有误伤，
在 340px 与 420px、深浅两套主题下实测了全部设置行（含开关行、中继配置 label）：

- 开关行（`.setting-toggle`）保持两列：340px 下文案宽 232px、420px 下 312px，`rowOverflow` 全为 0，
  未被压成单列、开关未被挤到下一行
- 中继配置的 label（无说明句）标签宽 310px、单行、无裁切
- 所有行 `rowOverflow = 0`，`documentElement` 无横向溢出

## 6. 其它证据

- 定向单测：`npx vitest run tests/panel-settings-label-layout.spec.ts tests/panel-styles.spec.ts tests/panel-text-model-isolation.spec.ts` → 9/9 pass
- 扩展全量单测：`cd plugins/omnimux-browser/extension && pnpm test` → 160 文件 / 1743 pass + 1 expected fail
- `pnpm verify:stages` → PASS: 14 Stage components; 8 registered sidebar targets
- `node --test scripts/verify-anti-slop.test.mjs` → pass 3 / fail 0
- `pnpm typecheck`：70 个既有错误，与 `origin/main` 检出同一基线，本次新增 0 个
