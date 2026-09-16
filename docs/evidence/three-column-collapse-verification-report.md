# 三分栏收起左侧栏 · 会话栏保宽与右栏自适应放大（工单 #2074）

## 结论

macOS 桌面端三分栏状态下点击「收起侧边栏」，「中间会话栏膨胀为整屏、右侧工作台被压灭」的缺陷已修复。
收起后会话栏宽度按像素保持不变并整体左移，左侧栏释放的全部宽度归右侧工作台。

| 状态 | 会话栏 | 右侧工作台 | 第一轨（左栏） |
| --- | --- | --- | --- |
| 展开（视口 1920） | 485px | 1155px | 280px |
| 收起 | **485px（保持）** | **1435px（+280px）** | 0px |

## 缺陷根因

`plugins/omnimux/src/client/conversation-box.js` 的 `PRODUCT_STAGE_CHROME` 中存在一条历史规则：

```
grid-template-columns: 0px minmax(0px, 1fr) auto !important;
```

其选择器写作 `:not([data-details-collapsed="true"])`。桌面外壳的右栏收起标记实际是
`data-rightbar-collapsed`，因此该 `:not()` 恒为真，规则在**任何**左栏收起场景都生效。
第三轨 `auto` 与第二轨 `1fr` 竞争时向内塌缩为 0px，右侧工作台随之被压缩为 0，
中间会话栏吃掉全部 1920px —— 即用户看到的「会话栏全屏」。

## 修复内容

| 文件 | 改动 |
| --- | --- |
| `plugins/omnimux/src/client/conversation-box.js` | 删除 `auto` 第三轨规则；右栏确证收起时保留 `0px minmax(0px, 1fr) 0px` 全宽分支（选择器补 `[data-rightbar-collapsed="true"]`）；新增三分栏保宽规则 `0px var(--omnimux-conversation-width, 480px) minmax(0px, 1fr) !important`，并以 `:not([data-rightbar-collapsed="true"]):not([data-details-collapsed="true"])` 划定边界 |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.js` | 新增模块级 `lastGoodConversationWidth`；`computeChromeLayout` 在展开态实测会话栏宽度（选择器 `.dshDesktopConversationSurface, [class*="centerCol"], [data-slot="conversation"]`，过滤 `≥320 && < innerWidth - 200`，避免读到全屏/已折叠的污染值）；`applyTopbarToggleCssVars` 写入 `--omnimux-conversation-width` |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js` | 新增 3 项契约与几何单测 |
| `plugins/omnimux/src/client/three-column-collapse.e2e.test.js` | 新增 6 项源代码契约回归 |
| `scripts/three-column-collapse-qa.mjs` | 新增真实内核几何门禁（动态端口、临时 profile、自清理、PNG+JSON 留证、含反向对照） |
| `specs/three-column-sidebar-collapse.spec.md` | 验收标准 AC-101 ~ AC-104 |

## 验证证据

### 1. 真实内核几何门禁（工作树隔离）

```
node scripts/three-column-collapse-qa.mjs
✅ PASS · 会话栏 485px → 485px（保持），右栏 1155px → 1435px（吸收 280px）
   反向对照：旧 auto 规则下右栏塌为 0px，夹具未失真
```

- 被测 CSS 从 `conversation-box.js` 的 `PRODUCT_STAGE_CHROME` 常量**逐字抽取**（抽出失败即抛错），
  不是字面量副本；几何变量由真实的 `applyTopbarToggleCssVars` 写入。
- 反向对照：停用生产样式并只注入旧 `auto` 规则，右栏实测塌为 0px —— 证明夹具能真实复现缺陷。
- 归档：`docs/evidence/three-column-collapse-qa-report.json`、`docs/evidence/three-column-collapse-collapsed.png`。
- 资源自清理：HTTP 服务与 CDP 均为动态端口（`0`），临时 profile 测后删除，`cleanup.allReleased === true`。

### 2. 单元与回归

| 套件 | 结果 |
| --- | --- |
| `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js` | 61/61 通过 |
| `plugins/omnimux/src/client/three-column-collapse.e2e.test.js` | 6/6 通过 |

### 3. 主版本全量测试（`pnpm --filter omnimux test`）

- 与本改动无关的既有失败：`src/text/*` 与原生评论相关用例报
  `operation claude-opus-4-6#vision_chat research is draft, not verified`。
- 已在**未改动的 `main` 工作区**用同一命令复现同一批失败，确认为基线既有问题，非本次改动引入。

## 未覆盖 / 未知

- 未在 Windows / Linux 桌面模式下实测（本次改动只影响 macOS 三分栏折叠路径；非 macOS 分支的
  折叠宽度仍由 `--omnimux-sidebar-width` 驱动，规则形状未变）。
- 未覆盖右侧工作台处于 `gui` 焦点模式（面板 `position: fixed` 覆盖）下的折叠交互；该路径下
  第三轨宽度不参与视觉，规则与改动前一致。
- 开发版（Dev 45120）真机验收由人工执行，未作为本报告的交付前提。
