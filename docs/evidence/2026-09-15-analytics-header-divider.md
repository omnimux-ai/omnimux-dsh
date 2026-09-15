# 数据分析看板分割线迁移实测证据（#1869）

- 日期：2026-09-15
- 分支：`agent/analytics-header-divider-issue-1869`
- 用户诉求：数据分析插件的分割线迁移到 tab 选项卡与标题描述之间
- 取值方式：隔离工作树内 esbuild 夹具（动态端口、自清理）+ 真实浏览器 ego-browser 计算样式与几何；截图为 1280px 宽 stage 的 1:1 像素

## 1. 前一位遗留证据的有效性

| 判定项 | 结果 |
| --- | --- |
| 四图 SHA-256 | 两两互不相同 |
| before-light vs after-light | 差异 bbox=(320,80)-(1600,141)，9177 px，涉及 51 行 |
| before-dark vs after-dark | 同区域，9252 px |
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

行为回归：点击「私信」后 `aria-selected` 正确翻转且内容区切换，分割线仍在 tab 行之上（84 < 93）；键盘焦点保持在 tab 按钮；harness 控制台错误 0。

## 4. 自动化与门禁

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter omnimux-analytics test` | 117 tests / 34 suites，pass 117，fail 0 |
| `pnpm verify:stages` | PASS（11 个 Stage 组件、8 个 sidebar 契约） |
| `pnpm test:ui` | 511 个源文件，违规 0 |
| `plugins/omnimux/src/client/shared-tabs-dividers.e2e.test.js` | 4/4 通过 |
| 新测红绿（`analytics-stage-divider.test.js` + `analytics-header-divider.e2e.test.js`） | 红：回退源码后合计 6 条中 4 条失败；绿：还原后 6/6 通过 |

新增测试说明：`analytics-stage-divider.test.js` 用 react-dom/server 渲染真实 stage 断言元素顺序；`analytics-header-divider.e2e.test.js` 把真实 stage 打成浏览器包后用本机 headless Chrome 打开临时页面，断言子元素顺序为 `PageHeader → separator → action-row → filter`、分割线 1px 高且贯通 stage 全宽、两侧净空 8~28px、筛选栏 `border-bottom` 为 0/none。临时目录随测自清理。

## 5. 图片

- `before-light.png` / `before-dark.png`：修复前，分割线在 tab 行下方（y=140）
- `after-light.png` / `after-dark.png`：修复后，分割线在页头与 tab 行之间（y=84）
- `compare-light.png` / `compare-dark.png`：上=修复前、下=修复后的页头至筛选行对照

## 6. 与共享规范的偏离

`specs/shared-tabs-dividers-polish.spec.md`（#1866/#1868）AC-4 要求「仅保留标签栏下方的一条分割线」。本次按用户明确要求把分割线移到标签栏上方，属对该条位置描述的定向覆盖；该条实质要求（筛选栏下方无底边框、全页仅此一条分割线）未被放宽。已在共享规范 AC-4 处就地补充被覆盖说明。

## 7. 未覆盖

- 未在开发版真机演示（Dev 验收由人工执行）。
- 分割线横向仍贯通 stage 全宽，与内容 20px 内缩不对齐——此为修复前既有形态，本次未改。
