# 规格：会话列收起态右栏面板未铺满剩余跨度（无主空带与投影输入框压面板）

分支：`agent/omnimux-split-panel-geometry`
基线：`main` @ `718091e58`
修订：本文件替代同名旧稿（旧稿经三方向独立审计判定「不可进入实施」，缺陷与勘误见文末《修订记录》）。

---

## 1. 目标 (Objective)

### 1.1 用户报告

在开发版点左侧「项目」打开整页工作台后，同时出现两处硬伤：

- **硬伤 1**：底部输入框横跨左右两栏，右半截与右侧面板叠在一起。
- **硬伤 2**：中间主会话区变成一大片没有任何内容的死黑空带。

「项目入口在右栏打开」属既定产品形态（用户已确认），不在范围内。

### 1.2 现场取证（ego-browser 真实内核，视口 1920×929，基线 `718091e58`）

**收起态（故障态，点左侧「项目」后稳定 3s 取数）**

| 量 | 实测值 | 取数表达式 |
| --- | --- | --- |
| `html[data-omnimux-conversation-collapsed]` | 存在 | `document.documentElement.hasAttribute('data-omnimux-conversation-collapsed')` |
| 帧网格（行内 → 计算） | `280px minmax(0px,1fr) 864px` → `280px 0px 1640px` | `frame.style.gridTemplateColumns` / `getComputedStyle(frame).gridTemplateColumns` |
| `.dshDesktopConversationSurface` | x=280，**w=0** | `getBoundingClientRect()` |
| 右栏面板（全页仅 1 个节点） | `.Ng7Ira_panel`，属性 `data-sidebar-right-panel="push"`、`data-sidebar-right-open="true"` | `document.querySelectorAll('[data-sidebar-right-panel]')`（count=1） |
| 面板几何 | `position:fixed; left:auto; right:0; width:864px` → rect **1056–1920**，z-index 10 | `getComputedStyle` + `getBoundingClientRect()` |
| 输入框座席 `[data-composer-seat]` | `position:fixed; left:280px; right:0; justify-content:center`，宽 1640 | `getComputedStyle` |
| 输入框卡片 `[data-composer-card]` | x=780，w=640 → **780–1420** | `getBoundingClientRect()` |
| 卡片与面板重叠 | **364px**（1056–1420） | `max(0, min(card.right, panel.right) − max(card.left, panel.left))` |
| 无主空带 | **776px**（280–1056） | `panel.left − 左栏右边界` |

**空带的独立性证据（命中测试，y=450）**：x=700 处 `elementFromPoint` 命中 `.dshDesktopRightbarSurface`（透明）且不在面板子树内；x=1200 处命中面板内 `.omnimux-workflow-library-body`。即该 776px 区间既无面板覆盖、也无会话内容 → 渲染为页面底色。

**对照态（同为实测）**

| 状态 | 触发 | 帧网格（计算） | 会话面宽 | 面板 rect | 卡片 rect | 重叠 | 无主空带 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 普通三栏 | `setFocus('split')` | `280px 776px 864px` | 776 | 1056–1920 | 310–1024 | 0 | 无（被会话面占据） |
| 面板关闭 | 初始加载 | `280px 1640px 0px` | 1640 | 视口外（`left:-864px`） | 639–1559 | 0 | 无 |
| 左栏收起 + 收起态 | 收左栏 | `56px 0px 1864px` | 0 | 1056–1920 | 640–1280 | 224px | 1000px |
| 面板全屏 | 点面板「全屏」 | `280px 0px 1640px` | 0 | 280–1920（`fullscreen`/z-30） | 780–1420 | 640px | 无 |

**判别量说明**：`776` 本身不是缺陷证据（三栏态同样是 776，但被会话面占据）。判别量是**空带内是否有归属者**：收起态会话面宽 0，且面板不覆盖该区间。

### 1.3 根因（源码级）

1. 收起分支把帧网格写成 `左栏 0px 1fr`，使**第三轨**独占剩余宽度（实测 1640px）。
   真源：`plugins/omnimux/src/client/conversation-box.js:219-227`（常量 `PRODUCT_STAGE_CHROME`，样式元素 id `dsh-product-stage-chrome`）。
2. 但右栏面板自 #1765 起是**视口右锚的 fixed 元素**，宽度来自外壳默认比例（`1920 × 0.45 = 864`），**不参与网格轨道**。
   真源：`plugins/omnimux/src/client/sidebar-toggle-topbar.js:712-719`（``.dshDesktopFrame [data-sidebar-right-panel][data-sidebar-right-open]{position:fixed;left:auto;right:0}``）。
3. 于是第三轨被撑到 1640px，而面板只覆盖右侧 864px → **左侧 776px 无归属 → 硬伤 2**。
4. 同一收起分支把投影座席设为 `fixed; left:280; right:0; justify-content:center` → 卡片按被撑开的 1640px 居中 → **780–1420 压住面板左缘 364px → 硬伤 1**。

**一句话根因**：收起态的横向跨度被三处各自独立计算——帧网格第三轨（撑到 1640）、面板宽度（外壳固定 864）、投影座席（按 1640 居中）——三者不同源，因此「收起 ⇒ 右栏铺满」这条设计意图在**面板实际几何**上从未成立。修复点就是让面板宽度与另两者同源。

### 1.4 设计意图确认（不是本规格新造）

- `chat-toggle.js:79-82,127-132`：收起态注释明确写「collapsed=true → right panel is full width」，点击时成对写入 `setConversationCollapsed` 与 `setFocus('gui')`。
- `split-layout.js:352-358` `syncConversationCollapsedForFocus`：`gui → collapsed=true`，其余 → `false`（双向维护）。
- `split-layout.js:318-331` `computeFocusWidth(gui)` = `viewport − 左栏` = 1640（即收敛目标值）。
- `sidebar-toggle-topbar.js` 内既有全屏态规则已经让面板铺满 `左栏右边界 → 视口右缘`；本规格只是让**收起态**与之一致。

### 1.5 成功标准（可测）

收起态下：面板左缘贴至左栏右边界（无主空带 ≤1px），输入框卡片完整落在面板区间内；普通三栏态、左栏收起态、全屏态、面板关闭态四态零回归。

---

## 2. 命令 (Commands)

```bash
pnpm --filter omnimux test                     # 单测（含 sidebar-toggle-topbar.test.js、conversation-collapse.test.js）
pnpm --filter omnimux build                    # 产出本工作树客户端产物，供浏览器验收
pnpm verify:stages                             # 静态 Stage/adapter 合同
pnpm test:gates                                # 仓库门禁
```

浏览器验收：本工作树内真实内核量测（ego-browser），四态取数并保留 PNG + 结构化报告。
**证据落盘路径（门禁要求）**：本工作树 `tmp/split-panel-geometry/`（截图与 JSON 报告），报告须晚于本规格 mtime。

---

## 3. 项目结构 (Project Structure)

| 角色 | 路径 |
| --- | --- |
| 改动（主） | `plugins/omnimux/src/client/sidebar-toggle-topbar.js` —— 原生面板几何的**模式所有者**（守门测试明确要求 `conversation-collapse.js` 不得代管） |
| 改动（单测） | `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js` —— 增补收起态铺满断言 |
| 回归守卫 | `plugins/omnimux/src/client/conversation-collapse.js`（**不改**；其两条 fill 规则必须保持 `:not([data-sidebar-right-panel])`） |
| 本规格 | `specs/split-dock-panel-void-and-composer-overlap.spec.md` |
| 证据 | 本工作树 `tmp/split-panel-geometry/`（截图 PNG + 量测 JSON） |

---

## 4. 代码风格 (Code Style)

沿用 `sidebar-toggle-topbar.js` 既有 chrome CSS 形态：裸选择器块、`!important`、中文注释只写「为什么」。
新增规则**不得**使用 `width:auto`（#1765 的守门测试禁止原生面板取得 `width:auto`），必须给显式宽度。
示例形态：

```css
/* 收起态（右栏铺满模式）面板宽度必须与帧网格第三轨、投影座席左基准同源，
   否则第三轨被撑开后右侧面板仍按外壳固定宽度渲染，留下无主空带。 */
html[data-omnimux-conversation-collapsed]:not([data-omnimux-left-collapsed])
  .dshDesktopFrame [data-sidebar-right-panel][data-sidebar-right-open] {
  width: calc(100vw - var(--omnimux-sidebar-width, 280px)) !important;
  max-width: none !important;
}
```

**位置约束**：新增块必须排在既有共享块 `.dshDesktopFrame [data-sidebar-right-panel][data-sidebar-right-open] {…}` **之后**——守门测试用非全局 `match` 取该形态的**首个**匹配，排在前面会劫持它。

---

## 5. 测试策略 (Testing Strategy)

1. **单测（`sidebar-toggle-topbar.test.js`）**
   - 断言新增规则存在，且选择器同时含 `[data-omnimux-conversation-collapsed]` 与 `[data-sidebar-right-panel][data-sidebar-right-open]`；
   - 断言其 `width` 为 `calc(100vw - var(--omnimux-sidebar-width…))` 且**不含** `width:auto`；
   - 断言左栏收起分支存在且为 `width:100vw`；
   - 断言新增块位于共享块之后（防止劫持守门测试）；
   - 反向对照：删除或前置新增块必须使断言失败。
2. **既有守门测试保持通过**：`conversation fill rules leave native panel geometry to its mode owner`（fill 选择器仍为 2 条且都带 `:not([data-sidebar-right-panel])`）与 `native open panels share a right-anchored geometry transition`（共享块内容不变）。
3. **真实浏览器四态量测**：收起态、普通三栏态、左栏收起态、全屏态；每态记录面板 rect、会话面宽、卡片 rect、重叠、无主空带；收起态另做 `elementFromPoint` 命中测试。

---

## 6. 边界 (Boundaries)

- **总是**
  - 只改 `sidebar-toggle-topbar.js`（原生面板几何的模式所有者）与其单测；改动保持在收起态分支内。
  - 宽度公式必须复用既有变量（`--omnimux-sidebar-width`），不硬编码 280/864/1640。
  - 改完在真实浏览器复测四态并保留证据。
- **先问**
  - 改外壳（Electron / `dshDesktopFrame`）自身几何、面板默认比例（0.45）、ADR 的焦点默认矩阵。
  - 改 `conversation-collapse.js` 的两条 fill 规则（守门测试所保护的既有契约）。
  - 改「收起态」状态机本身（自动解除条件、持久化键语义）。
- **绝不**
  - 给原生面板加 `width:auto`（#1765 明确禁止，会破坏全屏提交前的定位）。
  - 改动官方 DSH 源码 / submodule / 发行包。
  - 改 `conversation-box.js` 的帧网格改写（本规格不需要动它；上一稿误将改动落点定在此处）。
  - 通过隐藏检测元素、伪造 rect 或让量测失效来「通过」验收。

---

## 7. 验收标准 (Acceptance Criteria)

量测前置（所有 AC 共用）：

```js
const frame = document.querySelector('.dshDesktopFrame')
const panel = document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]')
const card  = document.querySelector('[data-composer-card]')
const leftRail = frame.querySelector('.dshDesktopSidebarSurface').getBoundingClientRect()
const railRight = document.documentElement.hasAttribute('data-omnimux-left-collapsed') ? 0 : Math.round(leftRail.right)
const p = panel.getBoundingClientRect(), c = card.getBoundingClientRect()
```

| # | 断言 | 判真表达式 |
| --- | --- | --- |
| **AC-1** | 收起态无主空带 ≤1px | `p.left - railRight <= 1` 且 `Math.abs(p.right - innerWidth) <= 1` |
| **AC-2** | 收起态卡片完整落在面板内（既有 `canvas-native-composer-projection` 设计：收起后输入框悬浮于画布底部） | `c.left >= p.left - 1 && c.right <= p.right + 1` |
| **AC-3** | 普通三栏态零回归 | `setFocus('split')` 后：`Math.round(p.width) === 864`（记忆宽度未被改写）、会话面宽 776、`c.right <= p.left + 1` |
| **AC-4** | 左栏收起态成立 | `data-omnimux-left-collapsed` 下：`p.left <= 1` 且 `Math.abs(p.right - innerWidth) <= 1`，且 AC-2 成立 |
| **AC-5** | 全屏态零回归 | 点面板「全屏」后：`Math.abs(p.left - railRight) <= 1`、`Math.abs(p.right - innerWidth) <= 1`，且 AC-2 成立 |
| **AC-6** | 面板关闭态不受影响 | 面板无 `[data-sidebar-right-open]` 时新增规则不命中：该元素 `getComputedStyle(el).width` 仍等于外壳写入值，且帧网格不受影响 |
| **AC-7** | 反向对照（量测有效性） | 停用新增规则后，AC-1 必须失败（实测无主空带 776px），证明判据能捕获缺陷 |
| **AC-8** | 交互可用 | 收起态下 `[data-composer-card]` 内的文本域可聚焦、可输入、可发送（几何全绿但点不动视为失败） |

---

## 8. 假设 (Assumptions)

1. `data-omnimux-conversation-collapsed` 是用户主动收起对话后的持久化状态；本规格只修**几何**，不改该状态何时置位。
2. 面板宽度 864 = 视口 1920 × 外壳默认比例 0.45（**不是**用户拖拽残留；已由审计更正旧稿的错误假设）。
3. 收起态下 `workbench` 的 store width 与面板实际宽度可能不一致（实测 store=1220/1640 而面板恒为 864）。本规格刻意以**收起属性**为键，使视觉正确性不依赖 store 与外壳的宽度同步；store 侧的一致性作为遗留项记录，不在本次修复范围。

## 9. 未决问题 (Open Questions)

1. store width 与外壳面板宽度为何不同步（打开 Tab 时 store=1220、面板 864）——需另开任务排查；本次以属性为键规避。
2. 面板宽度 864 是否应改为跟随用户上次拖拽的 `splitWidth`（产品决策，涉及外壳默认比例）。
3. 陈旧受控规格 `canvas-layout-alignment-and-bottom-composer.spec.md` 与 `canvas-native-composer-projection.spec.md` 中以前提「全跨度居中」写下的条款是否需要同步修订。

---

## 修订记录（相对被审计的旧稿）
| 旧稿问题（审计 M/S 编号） | 本稿处置 |
| --- | --- |
| M1 根因归属点错文件（写成 `conversation-collapse.js`） | §1.3 更正真源为 `conversation-box.js:219-227`；§3 改动落点改为 `sidebar-toggle-topbar.js`（模式所有者） |
| M2 「绝不」与改动授权互斥 | §6 明确不改 `conversation-box.js` 网格、不改 `conversation-collapse.js` fill 规则，二者不再冲突 |
| M3 AC 互斥 / 恒真 | §7 每条 AC 给出判真表达式，判别量改为**面板与左栏/视口的相对关系**，不再用「空带宽度」本身 |
| M4 改动面漏掉决定性模块、机制前提错误 | §1.3-2 纳入 `sidebar-toggle-topbar.js:712-719`（fixed 面板不参与网格），§3 以其为主改动文件 |
| M5 AC-4 与「绝不」矛盾 | §6 允许左栏收起分支（不再列为禁区），AC-4 落在同一文件 |
| S1 依赖哈希类名 | 全部改用稳定属性 `[data-sidebar-right-panel][data-sidebar-right-open]` |
| S2 面板宽度来源假设错误 | §8-2 更正为外壳默认比例 0.45 |
| S5 未写证据落盘路径 | §2 明确 `tmp/split-panel-geometry/` |
| S7 判别量错（用 776 本身） | §1.2 末尾给出判别量说明；AC-1 改用相对关系 |
| S8/S9 缺交互 AC 与缺状态 | 补 AC-8 与 AC-3/4/5/6 四态 |
| 事实更正：重叠方向 | §1.2 记录为「卡片压住面板」（座席 z-index 100 > 面板 10），非「卡片被面板切断」 |

---

## 修订 2（验证阶段发现，取代上文 §3 / §4 / §6 中与之冲突的条款）

**原因**：按修订 1 的 CSS 方案实施后，在真实环境验证**未生效**。CDP `CSS.getMatchedStylesForNode` 证实新增规则
确实匹配面板、且内联宽度为普通优先级（按理应被规则覆盖），但 `CSS.getComputedStyleForNode` 仍返回外壳宽度。
根因：外壳给该面板声明了 `transition: width`，而层叠顺序中**过渡中的值优先于 author 的 `!important`**，
样式表里任何强度的宽度声明都无法接管。

**验证过的可用机制（真实环境 A/B，逐态量测）**：对同一面板同时做两件事——
（1）内联写入 `transition: none !important` 中和过渡；（2）内联写入目标宽度 `!important`。
实测：面板由 1056–1920（864）变为 **280–1920（1640）**，无主空带 **776 → 0px**，输入框卡片 780–1420 完整落在面板内；
移除内联后精确回退。且外壳会持续重写内联宽度（实测重写为其它值），故必须**持有**并自愈回写。

**改动面（取代 §3）**

| 角色 | 路径 |
| --- | --- |
| 新增（主） | `plugins/omnimux/src/client/rightbar-collapsed-fill.js` —— 收起态的宽度写入与持有 |
| 改动（装配） | `plugins/omnimux/src/client/chrome.js` —— 安装并随 effect 清理 |
| 新增（单测） | `plugins/omnimux/src/client/rightbar-collapsed-fill.test.js` |
| 撤回 | `sidebar-toggle-topbar.js` 内修订 1 新增的 CSS 块（无效，已删除）与其单测 |

**代码风格（取代 §4）**：宽度以 JS 内联写入（`style.setProperty(..., 'important')`），**不得**改用样式表宽度规则
（过渡值会压住它）。写入必须**幂等**：值已达标即不再写，否则样式观察者会自触发成环。跨度由 DOM 实测得出
（视口宽 − 左栏右边界；左栏收起时为 0），不得硬编码。

**边界（取代 §6 对应条目）**
- **总是**：仅在内联层持有几何；值达标时不重复写入；收起态解除或面板关闭时立即 `removeProperty` 归还外壳；改动后在真实环境复测四态。
- **先问**：改外壳的面板模式（`push` / `fullscreen`）、面板默认比例、ADR 焦点默认矩阵。
- **绝不**：不中和过渡就直接写宽度（写不进去）；用样式表宽度规则接管；长期占用面板的内联样式（不归还）；触碰 `conversation-collapse.js` 的两条 fill 规则与 `conversation-box.js` 的网格改写。

**验证状态**：模块单测 11 条全绿；插件套件 2010/2010 全绿；上述机制已在真实环境以等价操作 A/B 验证。
**尚未完成**：在本工作树内构建并独立运行后的端到端复测（AC-1…AC-8 的原样量测）。
