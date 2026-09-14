# 规范：套件详情「规则」块改为源文本展示

> 任务真源：Issue #1682 · 分支 `agent/market-suite-rule-source-issue-1682`。
> 本文件是本任务人与 Agent 共享的验收真相源。

## 1. 业务目标与背景

### 1.1 现状问题

套件详情页的「规则」块把每条规则渲染成一张「标题 + 一句摘要」的小卡（`.ws-suite-grid` / `.ws-suite-item`）。但规则的本质是**安装后会被写进 `AGENTS.md` 的行为约束原文**——用户看到的摘要既不是全文，也无法据此判断这条规则到底约束了什么。用户反馈原话：

> 「规则没必要卡片结构化吧? 直接把源文本显示出来 参考图 2」

### 1.2 目标

「规则」块改为直接展示规则的完整源文本（剥离 YAML frontmatter 的正文），做到所见即所得：页面上看到的就是安装后写进 `AGENTS.md` 的内容。

### 1.3 对照参考

用户提供的对照形态：一个块内呈现「规则名 + 完整正文」，正文可滚动查看。技能块与 Agent 块**保持既有卡片网格**不变（它们展示的是「有哪些」，规则展示的是「约束是什么」）。

## 2. 核心交互契约

### 2.1 规则块

- 块标题与说明文案保留（说明补一句「以下为规则原文」）。
- 每条规则一个竖排块：**规则名** + **完整正文**（保留换行与列表结构）。
- 正文限高，超出部分在块内滚动，不撑破详情模态。
- 规则条数与顺序与套件包内 `contracts/*.md` 一致。

### 2.2 降级

规则正文缺失时退回展示已有摘要（`desc`），不出现空白块。

### 2.3 不变项

- 技能块、Agent 块：仍为卡片网格。
- 空块（该类无条目）仍整块省略，含标题。
- 安装确认、回执、已安装态：行为不变。

## 3. 验收标准（可测）

- [ ] **A1** 规则块不再出现 `.ws-suite-item` 卡片网格，改为 `.ws-suite-rule` 源文本块。
- [ ] **A2** 每条规则渲染出完整正文，且**不含** YAML frontmatter（`---` 分隔的头部）。
- [ ] **A3** 正文保留原文换行（不压成一行）。
- [ ] **A4** 块内正文可滚动，容器高度受限。
- [ ] **A5** 规则条数与套件包内 `contracts/*.md` 数量一致（首批：社媒多模态内容创作工坊 5 条）。
- [ ] **A6** 技能块与 Agent 块渲染结果与改动前一致（回归）。
- [ ] **A7** 相关自动化测试全绿并给出计数；隔离工作树真实浏览器证据留存。

## 4. 技术实现方案

- **数据层**：`catalog/index.json` 的 `suite.rules[]` 增加 `content`（规则正文，已剥离 frontmatter）；`src/expert/catalog.js` 的 `parseSuiteManifest` 解析该字段（缺省空串，向后兼容既有条目）。
- **客户端**：`src/client/plaza/SuiteDetailModal.jsx` 的 `SUITE_BLOCKS` 为规则块加 `variant: 'source'`；`renderBlock` 按 variant 分派到 `renderSourceBlock`（源文本）或既有 `renderGridBlock`（网格）。
- **样式**：`src/client/css.js` 新增 `.ws-suite-rules` / `.ws-suite-rule` / `.ws-suite-rule-title` / `.ws-suite-rule-body`，沿用既有 token 与圆角体系；正文用 `white-space: pre-wrap` 保留换行，`max-height` + `overflow: auto` 限高滚动。

## 5. 边界

- **总是**：规则正文与包内文件一致；正文缺失时降级到摘要；改动限于 `plugins/omnimux-market`。
- **先问**：需要改安装链路或规则写入 `AGENTS.md` 的行为；需要新增远端接口。
- **绝不**：把规则摘要当正文展示；改动技能块与 Agent 块的呈现；伪造规则内容。
