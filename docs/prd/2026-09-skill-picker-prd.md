---
title: "Skill 选择器（Composer 入口）PRD"
id: "prd-skill-picker"
type: "prd"
status: "accepted"
authority: "L2"
date: "2026-09-05"
authors: ["xu-qingchu"]
subsystem: "omnimux-market"
---

# Skill 选择器（Composer 入口）PRD

> 作者：产品经理 许清楚（Xu） · 团队：software-skill-picker
> 语言：中文 · 工作区：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`
> 本 PRD 基于对代码库的实际侦察（见附录「侦察事实」），不含代码与架构设计。

## 1. 项目信息

| 字段 | 值 |
|---|---|
| Project Name | `skill_picker` |
| 归属插件 | `plugins/omnimux-market`（客户端 UI + 复用其 Host `/omnimux-market` 数据层） |
| Programming Language | 沿用插件栈：Node.js（Host）+ React/`h()`（Client，`dsh-ui-kit`） |
| 原始需求复述 | 在会话输入框（Composer）「权限设置」按钮**右侧**新增 Skill 选择器入口；点击弹出面板：数据来自插件市场技能/分类数据源；含搜索框、分类 Tab（全部/我的/精选/短剧漫剧/专业影视/动画…，横向滚动）、技能列表项（技能名 + /slug + 一句话描述）；选中技能直接填入输入框；底部固定「探索更多」（跳插件市场技能 Tab）与「+ 创建」（预填创建 skill 的调用内容） |

## 2. 产品定义

### 2.1 背景与问题

今天用户想用某个 Skill 的完整路径是：想到需求 → 去插件市场一级页 → 技能 Tab → 搜索 → 读卡 → 选择 → 安装 → 回到会话手敲 `/slug`。链路长、打断心流，且大量用户根本不知道有哪些技能可用。竞品形态（参考截图）证明：把技能货架压缩成 Composer 旁边的一个浮层，是当前主流且被验证的交互。

### 2.2 Product Goals（3 个正交目标）

1. **缩短调用路径**：从「市场搜索→选择→安装→手敲」≥5 步压缩到「点选→填入」2 步，用户不离开会话即可唤起任意技能。
2. **提升技能可发现性**：通过搜索框 + 分类 Tab + 精选/我的视图，让技能货架出现在用户最高频的操作位（Composer），把「不知道有技能」变成「顺手看见技能」。
3. **零基础设施重造**：面板数据 100% 复用 `omnimux-market` 既有三渠道聚合检索（自建 Catalog > WorkBuddy 本地 > SkillHub 远程）与分类体系，不新建数据层、不新建插件。

### 2.3 成功指标（Success Metrics）

| 指标 | 口径 | 目标 |
|---|---|---|
| 面板打开→填入转化率 | 打开面板后完成「选中并填入输入框」的比例 | ≥ 40% |
| 技能调用路径步数 | 用户从「想用一个技能」到「输入框出现调用手势」的点击步数 | ≤ 2（入口点击 + 列表项点击） |
| 「探索更多」点击率 | 面板打开后点击底部「探索更多」的比例 | ≥ 10%（说明面板发挥了货架引流作用） |
| 面板首屏加载 | 打开到列表可交互（本地渠命中即可渲染） | ≤ 300ms；远程渠 soft-fail 不阻塞 |
| 数据一致性 | 面板列表与插件市场技能 Tab 同查询结果一致（同一 `aggregateSkillSearch`） | 100% |

## 3. 用户故事

| # | 用户故事 | 优先级 |
|---|---|---|
| US-1 | As a 创作者，I want 在输入框旁一键打开技能面板并点选「有声书 /audiobook」，so that 输入框立刻出现调用内容，不用去插件市场翻找安装。 | P0 |
| US-2 | As a 创作者，I want 在面板里按「短剧漫剧 / 专业影视 / 动画」等分类横向切换，so that 我能快速聚焦当前项目相关的技能集合。 | P0 |
| US-3 | As a 创作者，I want 在面板顶部直接搜「分镜」「字幕」，so that 海量技能里我能用关键词直达目标。 | P0 |
| US-4 | As a 创作者，I want 点「探索更多」直接跳到插件市场的技能 Tab，so that 面板放不下时我能进入完整货架继续逛。 | P0 |
| US-5 | As a 开发者/重度用户，I want 点「+ 创建」把「创建 skill」技能的调用内容填入输入框，so that 我能把顺手的工作流立刻沉淀成新技能。 | P1 |

## 4. 需求池（Requirements Pool）

> P0 = Must have（本期交付）｜P1 = Should have｜P2 = Nice to have

| 编号 | 需求 | 优先级 | 说明 | 依赖 |
|---|---|---|---|---|
| R-01 | Composer 工具行新增 Skill 选择器入口按钮，位于「权限设置」（官方 `PermissionSelect`）**右侧** | P0 | 32px 高、SVG 图标、与权限按钮同基线。挂载官方 list 槽 `conversation.input.left`（`InputBar` `{leftItems}`），禁止 overlay patch / DOM 注入 | 官方槽 `conversation.input.left` |
| R-02 | 点击入口弹出 Skill 选择器面板（深色浮层，锚定入口按钮向上展开） | P0 | 结构：标题 + 搜索框 / 分类 Tab 行 / 技能列表 / 底部固定双按钮 | design.md 深色浮层规范 |
| R-03 | 面板数据复用市场聚合检索：`POST /omnimux-market` `method=search`（内部 `aggregateSkillSearch`，custom > workbuddy > skillhub） | P0 | 含 `installed` 标记、channelErrors soft-fail、fallback 热门列表；**禁止**面板自建第二套搜索/合并逻辑 | `plugins/omnimux-market/src/local-api.ts`、`skill-aggregate.ts` |
| R-04 | 搜索框：占位「搜索 Skill」，输入即过滤（防抖 ~200ms），支持清空 | P0 | 复用 `dsh-ui-kit` `SearchField`（`skill-plaza.js` 已在用） | R-03 |
| R-05 | 分类 Tab 行：「全部 / 我的 / 精选 / 短剧漫剧 / 专业影视 / 动画 …」横向滚动，溢出显示右侧 `>` 折叠箭头 | P0 | 「我的」= 已安装（`method=list` / search 返回的 `installed`）；「精选」= 自建 `sk-omx-*` 渠；领域 Tab 映射自建 catalog `tags`（短剧漫剧/专业影视/动画均为真实 tag 值） | catalog tags；`categories.ts` |
| R-06 | 技能列表项：第一行「技能名 + `/slug`」，第二行一句话描述；点击选中 | P0 | 对应 catalog `title` / `skill` / `summary`；行高约 48px，hover 高亮 | R-03 |
| R-07 | 选中技能 → 调用内容**直接填入 Composer 输入框**并关闭面板，焦点回到输入框 | P0 | 复用市场已验证的 React 18 原型 setter 注入：`plugins/omnimux-market/src/client/composer.js` 的 `insertGesture` / `findComposer`（选择器 `[data-composer-card] textarea, textarea[data-phase]` 等）；填入格式待确认 Q1（建议默认 `/slug ` 手势） | composer.js 既有算法 |
| R-08 | 底部固定「探索更多」按钮：跳转插件市场一级页并落在**技能 Tab** | P0 | 复用 `window.__omnimuxWorkbench.open({ tabId: "omnimux-market:plaza" })`（`plaza-shell.js` 既有用法）；技能 Tab 定位见 R-12 | `plugins/omnimux/src/client/workbench.js` |
| R-09 | 底部固定「+ 创建」按钮：把「创建 skill」预装技能的调用内容填入输入框 | P0 | 目标条目：`catalog/index.json` 的 `sk-omx-skill-creator`（title「技能创建」，`skill: "skill-creator"`，source git `infometa/OmniMux-skills/skills/skill-creator`）；填入格式同 R-07 | R-07 |
| R-10 | 面板空态 / 加载态 / 错误态 | P0 | 空态：「未找到相关技能」+ 引导点「探索更多」；加载态：骨架/文案；错误态：远程失败仍展示本地渠并给轻提示（与市场 `channelErrors.skillhub` 口径一致） | R-03 |
| R-11 | 键盘可达性：Esc 关闭、↑/↓ 移动选中、Enter 填入、Tab 焦点顺序（搜索框 → 分类 Tab → 列表 → 底部按钮） | P0 | 符合 WCAG AA；焦点陷阱限定在面板内 | design.md 可访问性条款 |
| R-12 | 「探索更多」落地技能 Tab 的跳转参数 | P0 | 现状 `PlazaView` 内部 tab state 默认 `plugins`，**不接受外部 tab 参数**；需要给市场 Plaza 增加最小扩展（如 `open` 时附带 `initialTab: "skills"` 或读取全局一次性意图）——列为对架构师的明确输入，不另起页面 | R-08 |
| R-13 | 「我的」Tab 的已安装数据源 | P1 | `POST /omnimux-market` `method=list`（`listInstalled(cfg.skillsDir)`）已有；或仅用 search 结果的 `installed` 标记做过滤（P0 可先用后者，P1 再并 list） | local-api.ts `method=list` |
| R-14 | 面板内未安装技能的一键安装入口（或「发送时懒安装」） | P1 | 呼应历史讨论「/ 命令唤起全部 skill、选中发送时才真实安装并热加载」；P0 仅填入手势不安装，安装策略待确认 Q2 | `method=install`（含 catalogId 智能路由） |
| R-15 | 面板打开位置/选中历史的轻量记忆（记住上次分类 Tab） | P2 | 本地存储即可，不进设置页 | — |
| R-16 | 列表项评分/下载量等富信息 | P2 | 复用 `method=ratings` 惰性 SWR；面板行高受限，默认不显示 | `method=ratings` |

## 5. 交互设计

### 5.1 打开 / 关闭

| 动作 | 行为 |
|---|---|
| 点击入口按钮 | 面板以入口为锚点**向上**弹出（浮层在 Composer 上方，避免被窗口下边缘裁切）；入口按钮呈 pressed 态 |
| 点击面板外区域 | 关闭面板，入口恢复默认态 |
| `Esc` | 关闭面板，焦点返还入口按钮 |
| 再次点击入口 | 关闭（toggle） |
| 切换会话 / 打开一级页 Tab | 面板自动关闭（不跨场景悬挂） |

### 5.2 搜索

- 输入即搜：防抖 ~200ms 后调用 `method=search`（带 `query`、当前分类、面板自己的小 limit，如 20 条 + 「查看全部 → 探索更多」）。
- 清空按钮一键复位到「当前分类的浏览态」。
- 搜索中输入框右侧显示轻量 loading；远程渠超时不阻塞本地结果。

### 5.3 分类切换

- Tab 点击即过滤，选中态高亮（全部默认选中）。
- 分类行 `flex-wrap: nowrap` + 横向滚动；溢出时右侧出现 `>` 箭头，点击滚动到下一屏分类（或展开为下拉，遵循 Popover 规范，禁止原生 `<select>`）。
- 「我的」无已安装技能时显示空态：「还没有安装技能，去『探索更多』看看」。

### 5.4 选中填入

1. 点击列表项 → 立即把该技能的调用手势（默认 `/<slug> `，含尾随空格，与专家召唤 `gesture = "/" + item.skill` 一致）写入 Composer（caret 处插入，`insertGesture` 同款原型 setter + `InputEvent`）。
2. 写入成功 → 关闭面板，焦点留在输入框，光标停在手势之后，用户可继续补充自然语言。
3. 写入失败（找不到 composer 等）→ 面板不关，列表上方给一行轻提示「已就绪，请点击输入框后重试」（口径同 `expert.gestureReady`）。

### 5.5 探索更多

- 点击 → 关闭面板 → `__omnimuxWorkbench.open({ tabId: "omnimux-market:plaza", title })` → 市场落在技能 Tab（依赖 R-12 的 initialTab 扩展）。

### 5.6 创建 skill

- 点击「+ 创建」→ 等价于选中 `sk-omx-skill-creator`：填入其调用手势（默认 `/skill-creator `）→ 关闭面板。
- 若该技能未安装，行为与 R-14 的安装策略一致（P0：只填手势，是否可正常唤起交给 Q2 决策）。

### 5.7 空态 / 加载态 / 错误态

| 状态 | 展示 |
|---|---|
| 加载中 | 列表区 3 行骨架（技能名条 + 描述条），搜索框可用 |
| 无结果 | 插画位（可选）+「未找到『{query}』相关技能」+ 次级按钮「探索更多」 |
| 远程失败 | 本地渠结果照常渲染 + 顶部一行轻提示「远程 SkillHub 暂不可用，已仅展示本地结果」（与 `host-render.ts` 现网文案一致） |
| 全部不可用 | 错误文案 + 「重试」按钮 |

### 5.8 键盘可达性

- 面板打开后焦点自动进搜索框；`↑/↓` 在列表项间移动（循环），`Enter` 触发选中填入，`Esc` 关闭。
- 所有可点元素可 Tab 到达，`aria-selected` / `aria-expanded` / `role="dialog"` 标注齐全；对比度满足 WCAG AA。

## 6. UI 设计稿

### 6.1 入口按钮（Composer 工具行）

```
官方 InputBar 工具行（.tools，单行 nowrap）：
┌──────────────────────────────────────────────────────────────┐
│ [+]  [权限设置▾] [✦ Skill]            [模型▾] [ctx] [↑发送] │
│       PermissionSelect   ↑ 新增入口（32px，图标+文字）        │
└──────────────────────────────────────────────────────────────┘
```

- 高度 **32px**、圆角 **8px**、与 `PermissionSelect` 同基线同字级；图标为矢量 SVG（16px 四宫格可复用市场 `renderPlazaIcon`，或专用 Skill 图标），禁止 emoji。
- 颜色 100% 消费 `--dsw-alias-*` / `--dsw-specific-*` token，零裸色值、零主题覆写。

### 6.2 面板线框（ASCII）

```
                    ┌────────────────────────────────────────────┐
                    │ Skill ⓘ              [ 🔍 搜索 Skill    ✕ ] │  ← 头部：标题 + SearchField（32px）
                    ├────────────────────────────────────────────┤
                    │ [全部*] [我的] [精选] [短剧漫剧] [专业影视] > │  ← 分类 Tab 行，横向滚动，溢出 >
                    │        [动画]  …（nowrap，hidden 溢出）      │
                    ├────────────────────────────────────────────┤
                    │ 有声书            /audiobook                │ ↕
                    │ 把书籍转化为多角色有声书                      │  列表区：每行 ≈48px
                    │────────────────────────────────────────────│  技能名+/slug（13px 500）
                    │ 分镜板            /storyboard                │  描述一行省略（12px tertiary）
                    │ 把剧本拆为N宫格分镜故事板                      │
                    │────────────────────────────────────────────│
                    │ 字幕修正          /subtitle-correction       │
                    │ 修正 SRT 字幕语音识别错误…                    │
                    │                  …（滚动区）                  │
                    ├────────────────────────────────────────────┤
                    │ [ 探索更多 ]                    [ + 创建 ]   │  ← 底部固定双按钮（32px）
                    └────────────────────────────────────────────┘
         ▲ 锚定入口按钮，向上弹出；宽 ≈360–400px，最大高 ≈480px
```

### 6.3 引用 design.md / ui-design-guidelines.md 的硬约束

| 项 | 约束（真源：`design.md` + `docs/contracts/ui-design-guidelines.md`） |
|---|---|
| Token | 100% 消费 `--dsw-alias-*` / `--dsw-specific-*`；浮层背景 `--dsw-alias-bg-elevated`；禁止裸 hex/rgba、禁止 `--omx-*` 岛、禁止 `ctx.theme.overrideTokens()` |
| 控件高度 | 32px 基线（搜索框、Tab、按钮、列表行内控件） |
| 圆角 | 基础 8px；**面板外壳 10~12px**（浮层/卡片档），不用 16px 弹窗档 |
| 层级 | 深色浮层菜单规范：投影 + `bg-elevated`；z-index 高于 Composer 卡、低于全局 Modal |
| 图标 | 全部矢量 SVG（16px），禁止文本/emoji 图标 |
| 选择器 | 分类溢出若做下拉，必须 React Popover，禁止原生 `<select>` |
| 单行 | 分类 Tab 行 `flex-wrap: nowrap`（单行工具栏铁律） |
| 对比度 | 文案/图标满足 WCAG AA |
| 明暗 | Zero-JS：只消费宿主级联的 CSS 变量，不写 JS 主题分支 |

## 7. 数据与接口需求

### 7.1 复用（不新增）

| 用途 | 现有资产 | 位置 |
|---|---|---|
| 技能聚合搜索（含分类、分页、installed、channelErrors） | `POST /omnimux-market` `method=search` → `aggregateSkillSearch`（custom > workbuddy > skillhub，软失败） | `plugins/omnimux-market/src/local-api.ts:51`、`skill-aggregate.ts` |
| 分类枚举（SkillHub 12 个一级分类，中文 label） | `CATEGORIES` / `CATEGORY_KEYS` / `categoryLabel` | `plugins/omnimux-market/src/categories.ts` |
| 领域分类（短剧漫剧/专业影视/动画…） | 自建 catalog 条目的 `tags`（实测存在「短剧漫剧」「专业影视」「动画」等值） | `plugins/omnimux-market/catalog/index.json` |
| 已安装列表 | `method=list`（`listInstalled`）；或 search 返回项的 `installed` | `local-api.ts:92`、`install.ts` |
| 客户端 API + 90s 软缓存 | `api()` / `apiCache`（`API_CACHE_READ` 含 `search`） | `plugins/omnimux-market/src/client/api.js` |
| Composer 写入 | `insertGesture` / `findComposer`（React 18 原型 setter + `InputEvent`，已验证） | `plugins/omnimux-market/src/client/composer.js` |
| 手势格式 | `gesture = "/" + item.skill`（专家召唤现网口径） | `plugins/omnimux-market/src/expert/summon.js:23` |
| 跳插件市场 | `window.__omnimuxWorkbench.open({ tabId: "omnimux-market:plaza", title })` | `plugins/omnimux-market/src/client/plaza-shell.js:169`；API 定义 `plugins/omnimux/src/client/workbench.js:943` |
| 「创建 skill」条目 | `sk-omx-skill-creator`（`skill: "skill-creator"`，git 源 `infometa/OmniMux-skills`） | `plugins/omnimux-market/catalog/index.json:5457` |

### 7.2 需要新增（最小增量）

| # | 新增点 | 规模 |
|---|---|---|
| N-1 | 市场 Plaza 支持「打开即定位技能 Tab」：`PlazaView` 接受一次性 `initialTab`（全局意图/`open` 透传，二选一，交架构师） | 小 |
| N-2 | 面板本体（入口按钮 + Popover 面板组件）及入口的挂载方式（overlay patch 或 DOM 注入，交架构师） | 中 |
| N-3 | （可选）面板专用 list 接口参数：小 limit + 「我的/精选」渠过滤可完全用现有 `channels` / `installed` 入参实现，**预计无需新 HTTP 方法** | 0–小 |

## 8. 验收标准（DoD，覆盖全部 P0）

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | 会话页已加载 | 用户看向 Composer 工具行 | 「权限设置」右侧出现 Skill 入口，32px 高、SVG 图标、与权限按钮同基线，浅色/深色均对比度合规 |
| AC-2 | 入口可见 | 点击入口 | 面板在 Composer 上方锚定弹出；含标题、搜索框、分类 Tab 行、列表、底部「探索更多」「+ 创建」；Esc 与点击外部均可关闭 |
| AC-3 | 面板打开 | 不做任何操作 | 列表展示聚合结果（本地渠 ≤300ms 可交互）；与插件市场技能 Tab 同条件查询结果一致 |
| AC-4 | 面板打开 | 在搜索框输入「分镜」 | ~200ms 防抖后列表过滤为相关技能；清空按钮恢复浏览态 |
| AC-5 | 面板打开 | 点击分类「短剧漫剧」 | 列表只显示带该 tag/分类的技能；Tab 行不换行，溢出出现 `>` 箭头且可滚动 |
| AC-6 | 列表有「分镜板 /storyboard」 | 点击该列表项 | 输入框 caret 处插入 `/storyboard `（含尾随空格），面板关闭，焦点在输入框，光标在手势后 |
| AC-7 | 面板打开 | 点击「探索更多」 | 面板关闭，工作台打开 `omnimux-market:plaza` 且**落在技能 Tab**（不是插件 Tab） |
| AC-8 | 面板打开 | 点击「+ 创建」 | 输入框被填入 `sk-omx-skill-creator` 对应的调用手势（默认 `/skill-creator `），面板关闭 |
| AC-9 | 远程 SkillHub 不可达 | 打开面板 | 本地渠结果照常展示，出现「远程暂不可用」轻提示，无白屏无未捕获异常 |
| AC-10 | 搜索无命中 | 输入乱码查询 | 显示空态文案 + 「探索更多」引导 |
| AC-11 | 面板打开 | 仅用键盘 | Tab/↑↓/Enter/Esc 全流程可用；焦点不逃出面板 |
| AC-12 | 打开面板后 | 切换到其他会话或打开一级页 | 面板自动关闭，再次打开回到默认态（全部 Tab） |
| AC-13 | 交付验收 | — | `pnpm test` 全绿；改动涉及客户端入口/浮层，按铁律完成 `pnpm verify:live`（45120 Dev App 真机 DOM 断言 + ego-browser 截图证据） |

## 9. 已拍板决策（原 Open Questions）

| # | 问题 | 决策（2026-09-05） |
|---|---|---|
| Q1 | 填入格式 | `/<item.skill> `（尾随空格）。官方 slash 真触发，与专家召唤一致。 |
| Q2 | 未安装策略 | 浏览不装；点选立刻填入手势 + 非阻塞 `method=install`。不拦截发送键。未安装行仅轻标识。 |
| Q3 | 「精选」口径 | `channels: ['custom']`（`sk-omx-*`）。 |
| Q4 | 领域 Tab | 固定 P0：全部 / 我的 / 精选 / 短剧漫剧 / 专业影视 / 动画。本地按 tags 过滤，query 带该词以便远程尽力命中。 |
| Q5 | 窄宽度 | 复用 `html[data-omnimux-composer-density='icon']` 收成纯图标。 |
| Q6 | 入口挂载 | **官方 list 槽 `conversation.input.left`**（PermissionSelect 右侧 `{leftItems}`）。禁止 overlay patch 与 DOM 注入。 |
| Q7 | 行内安装按钮 | 不做。 |

## 10. 附录：侦察事实（PRD 依据）

| 事实 | 证据 |
|---|---|
| 市场插件 Host 暴露 `POST /omnimux-market`，`method=search` 走 `aggregateSkillSearch` 三渠道聚合（custom > workbuddy > skillhub），远程软失败 | `plugins/omnimux-market/src/host.ts:247`、`local-api.ts:51-70`、`skill-aggregate.ts:63-100` |
| 分类枚举 12 个一级分类 + 中文 label；自建 catalog 条目带 `tags`（含「短剧漫剧」「专业影视」「动画」） | `plugins/omnimux-market/src/categories.ts`；`catalog/index.json` 多条 |
| 技能卡片字段含 title/slug(summary)/installed/pageUrl/channel/installBackend | `plugins/omnimux-market/src/api.ts:74`、`types.ts` |
| Composer 写入已有验证算法：React 18 原型 value setter + `InputEvent`；选择器 `[data-composer-card] textarea, [data-composer-seat] textarea, textarea[data-phase], textarea[placeholder]` | `plugins/omnimux-market/src/client/composer.js:8-35` |
| 手势格式现网口径：`gesture = "/" + item.skill`（专家召唤） | `plugins/omnimux-market/src/expert/summon.js:23` |
| 「权限设置」按钮 = 官方 `PermissionSelect`，渲染在官方 `InputBar.tsx` 工具行 `.tools` 区；该区域无插件插槽，仅 `conversation.input.attachments`（卡内壁）、`conversation.input.plan`、`conversation.input.model`、`conversation.composer.dock` 等座 | `/Users/x/Desktop/Project/Github/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:331-456`；`plugins/omnimux/src/client/stats-line-shadow.js:12` |
| 官方 checkout 无「权限设置」中文串（权限 UI 走 `access.*` i18n key，如 `access.preset.fullAccess`=「完全权限」）；2026-09-05 侦察时本仓仅有额度源码补丁、无 composer overlay；额度补丁现按 [#668 合同](../contracts/quota-error-compatibility.md) 退役 | grep 官方 packages；`docs/harness-pin.md` |
| 工作台打开：`__omnimuxWorkbench.open({ tabId, title })`；`openWorkbench` 不支持 tab 参数之外的视图参数；市场 `PlazaView` 默认 tab 为 `plugins`，无 initialTab | `plugins/omnimux/src/client/workbench.js:943-981`；`plaza-shell.js:18, 165-171` |
| 「创建 skill」预装条目：`sk-omx-skill-creator`（「技能创建」，`skill: "skill-creator"`，git 源）；`dropped.json` 另有过期的 `sk-skill-creator`（废弃，勿用） | `catalog/index.json:5457-5473`；`catalog/dropped.json:2687` |
| 已安装枚举：`method=list` → `listInstalled(cfg.skillsDir)` | `local-api.ts:92-95`、`install.ts` |
| 客户端搜索组件可直接复用：`dsh-ui-kit` `SearchField` / `Button` / `IconButton`，市场 Plaza 已在用 | `plugins/omnimux-market/src/client/boot.js`、`plaza-shell.js:3-13` |
| DOM 注入先例：hub 客户端 `composer-compact.js`、`stats-line-shadow.js` 已在 composer 区域做 overlay/隐藏，挂载方式有章可循 | `plugins/omnimux/src/client/chrome.js:9-52`、`stats-line-shadow.js` |
