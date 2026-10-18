---
title: "合集卡 CTA 共享几何与媒体安全配色工作树验证"
id: "evidence-inspiration-collection-cta-css-3418"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-18"
updated: "2026-10-18"
authors: ["agent"]
subsystem: "inspiration"
related:
  - "plugins/omnimux-inspiration/README.md"
  - "specs/inspiration-collection-cta-css-3418.spec.md"
---

# 合集卡 CTA 全局 CSS 污染修复工作树验证（#3418）

本记录只证明隔离任务工作树内的真实页面、真实本地插件处理链、真实 Chrome 渲染样式与注入的宿主全局规则复现；不证明完整 Host 安装、Dev 实机最终观感或共享开发版人工验收（Dev 45120 归人工）。测试使用独占合成资料库、本地封面与动态 loopback 端口；market 客户端未在夹具中挂载，其全局规则按源码逐字注入（sha256 记录在证据 JSON），并用两个对照按钮证明规则确实生效；浅色主题下另做按钮实际渲染像素的 WCAG 对比度采样。

## 根因

`plugins/omnimux-market/src/client/css.js`（第 237–246 行）注入全局选择器 `button[class*="add"]`，带 `background: transparent !important`、`width: 28px !important`、`font-size: 13px !important`、`border-radius: 24px !important` 等强制声明。合集卡旧按钮类名 `omnimux-inspiration-collection-action-add` 含 `add` 子串而被命中，Dev 实机表现为透明窄条、字体与边框错乱；`查看` 按钮不含 `add` 所以未受影响。用户同时指出合集卡按钮与普通卡 CTA 是两套外观。

## 修复

合集卡操作按钮复用普通灵感卡同一套悬停 CTA 组件与样式类：`.omnimux-inspiration-overlay-cta`、`.omnimux-inspiration-overlay-cta-btn secondary|primary`、`.omnimux-inspiration-overlay-cta-label`；高度、圆角、图标尺寸、字阶、按钮内边距与等宽行为由共享样式拥有。操作层水平内边距与普通卡对齐（操作层 `padding: 28px 12px 8px`，CTA 行保留共享库的 `padding: 0 2px`），两卡对应按钮计算宽度严格相等。颜色继续走媒体暗房 token（合集操作层 4 条覆盖规则：查看 `badge-bg-strong` + `border-strong` + `fg`，hover `pill-bg`；加入会话 `fg` 底 + `ink` 字，hover `fg-strong`），在浅色主题与任意封面上保证 AA；按钮类名不含 `add`。

本任务以此「共享几何 + 媒体安全配色」取代 #3411 中「合集按钮独立外观」的条款；#3411 的对比度要求仍保留并由媒体 token 与像素实测满足（见下）。

## 身份与实际观察

目标工作树 HEAD 为 `2e15b40344fe83e9750aeb2c8fc0dc30e3d2769a`；真实源码指纹 `sourceSha256=dbf38fa8e861041e3f7e2516040b89bb81732f0228a52593d1182c8bb773cc18`，构建指纹 `bundleSha256=28da38c650ece86d245d982ea588fc9895035959077415fa7a47dee7ebca043b`。完整断言、注入规则 sha256、对照按钮前后值、截图尺寸与 sha256、清理回执见[浏览器记录](2026-10-18-inspiration-collection-cta-css-3418/browser.json)。

真实链路：产品 `InspirationSection` 由工作树源码经 esbuild 打包渲染，合集经真实 HTTP `POST /omnimux/inspiration/local/collections` 创建，页面由独立 headless Chrome 经 CDP 驱动，样式均取 `getComputedStyle` 的真实渲染值。对照：将 market 规则原文注入 `<head>`，并追加两个命中 `button[class*="add"]` 的对照按钮（旧类名 `omnimux-inspiration-collection-action-add` 与任意 `add` 子串类）。

### 共享 CTA 几何（严格等宽）

普通灵感卡（`qa-fashion2`）CTA 为 `详情`(secondary) / `立即复刻`(primary)；合集卡 CTA 为 `查看`(secondary) / `加入会话`(primary)。两卡对应按钮的几何/字阶/padding/flex **逐项相等**：

| 属性 | secondary（详情 / 查看） | primary（立即复刻 / 加入会话） |
| --- | --- | --- |
| height / border-radius | 28px / 9999px | 28px / 9999px |
| font-size / font-weight / line-height | 12px / 550 / 16px | 同左 |
| padding-left / padding-right | 6px / 6px | 6px / 6px |
| flex-grow / flex-basis | 1 / 0px | 1 / 0px |
| width（两卡四枚按钮） | 105.328px | 105.328px |

两卡卡片宽度均 `246.65625px`，CTA 行宽均 `220.656px`、行 padding 均 `2px/2px`、gap 均 `6px`、内容宽均 `216.656px`（`105.328 = (216.656-6)/2`）。button class 均为 `dshUk-Button-* omnimux-inspiration-overlay-cta-btn secondary|primary`，`element.matches('button[class*="add"]') === false`，class 文本不含 `add`。

### 媒体安全配色（合集操作层）

合集操作层位于封面媒体之上，颜色走媒体暗房 token，与普通卡的别名 palette 有意不同：

| 按钮 | background-color | color | border-color |
| --- | --- | --- | --- |
| 合集 secondary（查看） | `rgba(0, 0, 0, 0.6)` | `rgb(255, 255, 255)` | `rgba(255, 255, 255, 0.3)` |
| 合集 primary（加入会话） | `rgb(255, 255, 255)` | `rgb(17, 17, 19)` | `rgb(255, 255, 255)` |

普通卡同页实测（别名 palette，仅记录，不要求与合集相等）：secondary `rgba(0,0,0,0.08)` / `rgb(27,27,27)` / `rgb(204,204,204)`；primary `rgb(27,27,27)` / `rgb(255,255,255)` / transparent。即两卡共享几何与字体，颜色按所在表面各自拥有。

### 像素级 WCAG 对比度（浅色主题）

沿用 #3413 的像素算法：对按钮裁剪区域连拍两次真实渲染像素——一次正常，一次仅把按钮 `color` 置为 transparent（底色/边框不动、禁用过渡）；字形像素=两图任一 RGB 通道差 ≥24 的像素（内缩 3px）；文字核心=最亮/最暗字形像素；背景取每个字形像素下方真实合成像素；ratio=全部字形像素上的最小值（保守口径）。鼠标停在页面空白处以 focus-within 显示按钮，不叠加 :hover 颜色。

- 合集 secondary（查看）：**13.57:1**（白字 `rgb(255,255,255)` vs 最差合成底色 `rgb(42,49,19)`，300 个字形像素，裁剪 105×28）
- 合集 primary（加入会话）：**18.86:1**（`rgb(17,17,19)` vs `rgb(255,255,255)`，447 个字形像素，裁剪 105×28）

二者均 ≥4.5:1。[共享 UI 截图](2026-10-18-inspiration-collection-cta-css-3418/cta-shared-ui.png)同时展示合集悬停 CTA 与普通卡（键盘 focus 显示）CTA；可看到几何一致、配色按媒体安全策略不同。

### 宿主规则生效与免疫

注入后两个对照按钮均被改写：`background-color` `rgb(18,52,86)`→`rgba(0,0,0,0)`，`width` `120px`→`28px`，`height` `40px`→`28px`，`border-radius` `8px`→`24px`，`font-size` `16px`→`13px`，`padding` → `0px`，`matches('button[class*="add"]') === true`。同一时刻合集 CTA：`matches('button[class*="add"]')===false`、class 不含 `add`、注入前后全部计算样式（含媒体色）逐项不变、宽度非 28、底色非 transparent、圆角非 24、字号非 13；操作层几何仍完全落在封面内，与标题行和「更多操作」菜单无交叠。[注入宿主规则截图](2026-10-18-inspiration-collection-cta-css-3418/cta-host-rule-immunity.png)中合集 CTA 仍为媒体安全配色胶囊，截图左下对照被压成透明窄条。

## 检查结果

- 真实浏览器证据运行：11/11 条断言通过（普通卡 CTA 基线、合集 CTA 结构、浅色主题两按钮像素对比度、宿主规则生效、旧类名对照被改写、共享几何逐项相等、媒体配色预期值、四按钮严格等宽、宿主规则不污染、几何不遮挡、无外网请求与无 console 异常）。
- 固化回归：`node --test tests/e2e/inspiration-collection-actions.e2e.test.mjs` 运行 1 个测试；本轮最终落盘内容连续 3 轮全部通过（pass 1 / fail 0 / skipped 0，约 8.19s、8.19s、8.17s），本任务证据链累计 13 轮全绿。测试内新增 market 规则漂移守卫：读取 `plugins/omnimux-market/src/client/css.js`，断言注入的 `MARKET_GLOBAL_CSS` 常量仍逐字存在于源码，宿主规则变更时测试失败提醒同步；同时保留宿主规则注入/对照/免疫、共享几何与四按钮等宽、媒体颜色预期值、以及原 hover/查看/加入会话/focus/草稿保护/无会话断言与截图（回归证据 9 checks / 7 张截图）。既有其它 e2e 文件未修改。
- 清理回执：Chrome 已退出且临时 profile 删除，fixture 服务关闭、独占 store 删除、环境变量还原；浏览器无 origin 之外的请求。
- 实现侧插件测试由实现负责人执行并报告全绿，本记录不代替、也不重复声称。

## 诚实边界

- 夹具未挂载 `omnimux-market` 客户端：其全局规则是按源码第 237–246 行**逐字注入**的（sha256 `e7357a7618c61ce99641b8fbd3825b875aabca0f016aa28f1493f1b93207d324`），并用对照按钮证明规则在页面生效；这不等同于完整 Host 中多插件同时加载的最终外观。
- 对比度只在**浅色主题**下按真实渲染像素采样；深色主题下媒体 token 同值（#3411 暗房原则），本记录未单独重采深色主题。
- 媒体 token（`--dsw-specific-media-*`）与宿主别名 token 在夹具宿主 CSS 中缺失，按仓库 `rival-tokens.js` / 真实主题值以页面 setup 注入；普通卡与合集卡在同一页面同一 token 下对比，报告记录显式期望值。
- 真实浏览器证据来自独立 headless Chrome（1600x1100，解码校验通过且已逐张查看），不是 Ego 现场观察，也不替代共享开发版 45120 的人工观感验收；本记录不把 Dev 45120 诊断冒充交付验收。
- 未访问外网、未使用用户 profile、未调用账号/模型/付费能力；测试资料为独占合成库（8 条本地灵感与 1 个合集），结束后清理。
