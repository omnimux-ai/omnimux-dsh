# 规格 · #3166 账号监控 v2 卡片线收口整改（R8）

## 1. 目标（Objective）

承接 #3140 合并主干时未带入的第七轮复审必修项，对账号监控 v2 卡片线做收口整改：删除误设的非 CJK 断行守卫、把徽章（胶囊）文字对比度修到 WCAG AA 底线、补齐禁用态 hover 守卫的「类」级断言、修复两处验收装置缺陷，并一次性清掉文档/计数/低档遗留。成功 = 全部必修项落地、断言钉住防回流、全量回归与资产层无回归、真机人眼复检无重叠/破版。

## 2. 决策（已由主理人裁定，照做）

- **决策一**：删除 `rival-masonry.js` 的「非 CJK 守卫」三处（`:202`、`:286`、`:295-297`），回到 R6 简单语义（EX/HH/HY/B2/BA 一律可断后）。QA 反证该守卫既无益于其声称要修的问题、又是新高估成因。补 `<CJK>？<长拉丁词>` 形态的行数断言（行数 == Chrome 行数）防回流。**先写红测试**。
- **决策二**：胶囊（`爆款`/`飙升` 等徽章）文字对比度按 WCAG AA ≥4.5:1 修，**只调明度、保留色相与层级语义**；必须**像素法实测**（取胶囊文字像素与相邻背景像素，不用祖先背景链）；修完同步修订规格 §9.1；若某组合无法保留色相达标，如实报告最小让步方案。
- **决策三**：本轮为收口轮，文档/计数/低档项一并做掉。

## 3. 用户操作旅程与期望反馈

- 用户浏览账号监控卡片：正文 `<CJK>？<长拉丁词>` 类混排文本的断行与 Chrome 一致，不高估行数导致卡片错位。
- 用户阅读卡片徽章：徽章文字与其实际背景对比度 ≥4.5:1，层级色相不变（爆款最热、飙升次之）。
- 用户把鼠标悬停在禁用态的筛选跳转按钮上：无 hover 样式反馈（与 act-btn、act-primary 一致）。

## 4. 验收标准（Success Criteria）

1. `rival-masonry.js` 三处守卫删除后，新增 `<CJK>？<长拉丁词>` 断言通过；`?`-in-URL 修复不受影响（既有断言仍绿）。
2. 胶囊文字 24 组合（6 徽章 × 2 主题 × 2 底）像素法实测对比度全部 ≥4.5:1，或附如实让步报告；规格 §9.1 写入该底线。
3. `rival-styles.js` 所有「会 disabled 的元素 × 其 hover 规则」均有 `:not(:disabled)`；断言在**类**上枚举全集（`.omnimux-rival-act-btn`、`.omnimux-rival-act-primary`、`.omnimux-rival-filter-jump`），非实例。
4. `ui-kit-shim.mjs` 的 `Button` 渲染为生产 DOM 形状 `<button><span class="label">{children}</span></button>`；改完后省略号/指标行的像素或 OCR A/B 在装置里真可测。
5. `measure-placement.mjs` 的 `ONLY` 白名单只筛选报告输出行，replay 最短列重放与同列重叠统计恒基于全量 `data.cards`。
6. 注记方向按真机实测重写（最坏低估 `U+2E3B` −28.271px；`U+200D` +8.288、`U+2011` +1.835 为安全方向；`U+2764` −4.454、`U+2192` −4.242）。
7. 计数口径：`BREAK_AFTER` = 304 条（官方 EX∪HH∪HY∪B2∪BA 非空格 306 减 `{0021,007C}`）；锁表 18 个字形；注明 LineBreak.txt 版本 18.0.0。
8. 注释修正：行尾禁则已模拟；行首禁则集补 `〉】〕`；行尾禁则集 `［` 去重；`demo-bundle-pre.js` 补 provenance 头。
9. 补断言：vh 节点位置 DOM 结构断言；`cover_key`/`cover_src`/`cover_http_url` 三字段同源同值断言。
10. 全量回归：插件 client 测试口径 `第一段 N / 第二段 261 / 合计 M` 全绿；资产层测试无回归；真机暗/亮、中英、多列宽整页截图无重叠/破版。

## 5. 命令（Commands）

```bash
# 插件内测试（本仓入口）
cd plugins/omnimux-inspiration && node --import ./scripts/deny-network.mjs --test <files>
# 退出码取证
cmd > log 2>&1; echo "REAL_EXIT=$?"; grep 'ℹ fail' log
# 验收装置
node docs/evidence/account-monitor-v2-cards-3110/harness/measure-placement.mjs
node docs/evidence/account-monitor-v2-cards-3110/harness/codepoint-probe.mjs
node docs/evidence/account-monitor-v2-cards-3110/harness/build-demo.mjs
```

## 6. 项目结构（相关文件）

- `plugins/omnimux-inspiration/src/client/rival-masonry.js` — 宽度/断行估算模型（决策一、④⑤⑥）
- `plugins/omnimux-inspiration/src/client/rival-styles.js` — 卡片样式（①决策二）
- `plugins/omnimux-inspiration/src/client/rival-masonry.test.js` — 模型断言
- `plugins/omnimux-inspiration/src/client/test-fixtures/ui-kit-shim.mjs` — 验收装置 shim（②）
- `plugins/omnimux-inspiration/src/client/account-monitor-feed-render.test.js` / `rivals-layout-render.test.js` — ⑦ 断言落点
- `docs/evidence/account-monitor-v2-cards-3110/harness/measure-placement.mjs` — ③ 白名单语义
- `docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md` — §9.1 规格修订
- `demo-bundle-pre.js`（worktree 内对应路径）— ⑥ provenance

## 7. 边界（Boundaries）

- **总是**：测试先红后绿（决策一）；退出码用 `> log 2>&1; echo REAL_EXIT` 取证；改 `*.test.*`/`specs/*` 前登记主检出 `.tmp/anti-cheat-exemptions.json`；只动本工作树文件。
- **先问**：无（主理人已裁定全部决策）。
- **绝不**：push / 开 PR / 本地合并主干；动其他工作树文件；改文案/白名单外 UI 元素（裴像素零自由发挥铁律）；用祖先背景链替代像素法。

## 8. 跟进票（本票不做）

生产 `dsh-ui-kit` 字体下字宽复测；`rival-card-stage.jsx` 夹具漏传 `busyId`；`RivalPostCard.jsx` 拆解按钮无 busy 守卫；`rival-filter.js` import 位置；指标行第 4 项最小列宽不可见；`card-compact-cta.e2e.test.js` flaky；`ratio` 生产链路；`.clamp-*`/`.t-*` 类名与 `attachFailed` 文案复用。
