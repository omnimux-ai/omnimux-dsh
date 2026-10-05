# PR #3140 第六轮整改规格（Issue #3110 账号监控 v2.1 卡片与瀑布流）

## 背景
第五轮整改修好 7 项，但把 `wrapAtoms` 的空白判定从 `\s` 收窄为 `/[ \t\n\r\f\v]/` 时引入净回归：一批浏览器可断行的码位（UAX#14 BA 全宽空格、ZWSP、行/段分隔符）被并入词内不可断，同列物理重叠 4px、实测高度重放错列 5 张、逐卡行数少算。同时测量脚本的白名单参数未写进报告、英文操作行最小列宽文字溢出、若干注释/死代码与可访问性遗留。

## 整改项与验收标准

### R6-① 断行规则一次写全（阻塞）
`wrapAtoms` 的可断判定改为完整集合：
- 可断 = CSS 文档空白 {0020,0009,000A,000D,000C} ∪ UAX#14 BA {1680,2000–2006,2008–200A,205F} ∪ ZW {200B}（零宽可断点）∪ BK {2028,2029}（硬换行）
- 不可断 = {00A0,202F,FEFF,2060,2007}（并入词内）
- U+3000 继续走 CJK 逐字分支；U+2011 留在词内；连字符 U+002D/U+2010 段后可断（R5 行为保持）
- 验收：新增单测断言全部码位分类；真机码位探针（harness/codepoint-probe.mjs）逐码位对比 Chrome 行数 vs 模型行数全等；41 卡夹具（?edge=1&qa41=1）在 1164px/600px 上同列重叠 = 0、实测高度重放错列 = 0。

### R6-② 测量证据可复现（阻塞）
- `measure-placement.mjs` 报告写入 `only` 字段（白名单 id 列表，null 表示全量）。
- `r4-placement-measure.json` 按「不带白名单重生成」修法重做，并在 JSON 中注明口径变化与复现命令。
- `demo-pre.html` 加 `build-demo.mjs --pre` 支持，使 r5-pre 证据一条命令可复现；`r5-placement-measure-pre.json` 附 note。
- README 补齐复现命令。

### R6-③ 英文操作行溢出（中）
`.omnimux-rival-act-btn` 加 `overflow:hidden` + `text-overflow:ellipsis`。220px 与 224px 两档真机复验留截图，按钮不再与状态槽重叠。

### R6-④ 注释与真机不符（低）
- `rival-masonry.js` 连字符注释与 `rival-masonry.test.js` 注释改成可复现数字（w1：模型 5 行 / Chrome 4 行 / 卡高差 0px，含上限说明）。
- `RivalPostCard.jsx` 注释改为「合成事件会冒泡、真实 Chrome 不派发；包裹 span 兜住两条路径」。
- `wrapAtoms` JSDoc 返回值改为与实际形状一致。

### R6-⑤ `!ticket` 死条件（低）
`RivalAccountsPanel.jsx` `handleReplicate` 改 `String(card?.id ?? '')` 与兄弟函数一致。

### R6-⑥ 包裹 span 复用槽位类（低）
原帖按钮外层 span 加 `omnimux-rival-act-slot`。

### R6-⑦ 禁用按钮 hover 变亮（低）
`.on-media`/`.on-surface` 两条 `.omnimux-rival-act-btn:hover` 补 `:not(:disabled)`。

### R6-⑧ 第三语种走探针（低）
`rivalLocaleOf`：host locale 非 zh/en 前缀时不再默认 zh，改走字典探针兜底。

### R6-⑨ 禁用按钮 title 键盘不可达（低）
禁用原因文字以 `aria-describedby` + 可视隐藏描述节点暴露给读屏（保留 disabled 置灰与点击安全）。

### R6-⑩ 字宽系数标定（中）
ASCII 0.55 → 0.592（实测 8.284/14）；空格独立常量 0.271（实测 3.79/14），按可折叠性求和；e5 的「多算」方向写入已知偏差清单。41 卡夹具复测 maxAbsDiff 下降。

## 不做
- 胶囊对比度（D3/O4）等用户裁定，不动配色。
- `.clamp-*`/`.t-*` 类名、`attachFailed` 文案复用、`ratio` 生产链路、负载下 flaky 用例：本轮不做。

## 验证
- 先红：①的新单测在旧实现上失败；②的证据文件可复现命令在旧字段下缺 `only`。
- 绿：插件单测 + e2e oracle 同步、真机码位探针全等、41 卡两宽度测量零重叠零错列、220/224px 截图、资产层测试无回归。
