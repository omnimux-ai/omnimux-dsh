# 规格 · 卡片增速胶囊与增速排序（Issue #3113）

## 目标（Objective）

账号监控 Feed 的内容卡右上角渲染增速胶囊；`filter.sort` 提供四项排序
（`综合推荐` / `增速最快` / `最新发布` / `播放量最高`），其中「增速最快」
按同一降级口径排序。增速信号按可信度三级降级：

- **A · 实测增速**：`metrics.views_history` 存在 ≥2 个有效采样点
  （`{at, views}` 均合法）且最早/最晚间隔 ≥1.5h → `Δviews ÷ Δhours`
  （有效采样窗口内差值；views 回退 v2<v1 视为无效信号，降级）。
  前缀按阈值：`>20000` 爆款 / `≥1000` 飙升 / `≥200` 观察 / `<200` 不产出
  **速率族**胶囊，**继续走 C 档判定**（与 B 档同构，不 return null）。
- **B · 发布均速**：A 不可用且 `posted_at`（否则 `first_seen_at`）可解析且
  距今 >0（时钟异常、未来时间、无效日期一律降级）→ `views ÷ age_hours`，
  前缀 `均速`，三级文字弱化。**PM 终验裁定（§7.3）精确化：`<200` 是对
  速率族胶囊存在性的规定，A/B 两档一致适用，且后果一致**——任一方
  落空（算出 vph 但低于下限）即继续下沉到 C 档，不短路为 `null`；
  C 档是倍数族，不受 200/h 约束。
- **C · 账号内相对爆发**：A/B 均**未产出胶囊**（含「算出 vph 但低于
  200 门槛」这一落空形态）且账号历史播放中位数 >0 且 `views/median ≥ 3`
  （PRD §5.1「≥3x 记为爆发」）→ `该号 {v}x`，中性描边。

三者都不可用 → `velocity = null`（不渲染、不留空位、增速排序排最后）。

## 命令（Commands）

- 单测：`cd plugins/omnimux-inspiration && node --import ./scripts/deny-network.mjs --test <files>`
- 插件构建：`cd plugins/omnimux-inspiration && node scripts/build-client.mjs`

## 结构（Project Structure）

- 计算与排序：`src/rival/rival-feed.js`（`feedVelocity` 新增、`mergeAccountPosts`
  接受 `now` 并按账号中位数判 C 档、`sortFeedRows` 新增 `velocity` 分支；
  增速原料留在原始 post 上，wire 行只带 `velocity` 结论）。
- 服务接线：`src/rival/rival-accounts-service.js` `listFeed` 透传 `now`
  与 `sort=velocity`。
- 客户端文案派生：`src/client/rival-format.js` `rivalVelocityText(v, t)`
  —— Host 只下发事实 `{tier, confidence, vph|multiplier, samples_at}`，
  文案经 `t()` 字典键生成；既有 `{text, tier}` 形态保持兼容。
- 胶囊消费：`RivalPostCard.jsx` `VelocityPill` 从结构化描述派生文案；
  `rival-masonry.js` `rivalHasPill` 谓词同步结构化形态。
- 详情口径行：`RivalPostPreviewModal.jsx` 增加 `detail.velocityNote`
  （三句逐字文案，每卡只显示对应口径一句）。
- 排序下拉：`InspirationSection.jsx` 账号监控 tools 区新增 `filter.sort`
  `DropdownSelect`；`use-rival-feed.js` 接 `sort` 选项并映射 wire 值
  （`recommended|latest` → `posted_at`、`velocity` → `velocity`、
  `views` → `views`）。
- 字典：`locales.js` zh/en 增补胶囊前缀、详情口径句、排序项键。

## 代码风格（Code Style）

- 纯函数走 `rival-feed.js`（无 fs/网络，`now` 由调用方传入），服务端
  不产任何界面文字；客户端文字一律经 `t()` 字典键（中文逐字取自
  §3.3/§3.4/§3.6，英文为近义直译）。
- 颜色一律 `--dsw-*` token；多行注释续行以 `*` 开头。

## 测试策略（Testing Strategy）

`node --test` 单元测试，断言逐分支：

- A：2 采样点间隔 ≥1.5h → measured，vph = Δ/Δh；间隔 <1.5h → 降级；
  views 回退（v2<v1）→ 降级不抛错。
- B：单采样点/无效历史 → estimated，vph = views/age；`posted_at` 缺失走
  `first_seen_at`；`posted_at` 在未来（时钟异常）→ 降级 C。
- C：`median>0` 且 `ratio ≥3` → relative；`ratio <3` 或中位数缺失 → null。
- <200 vph → 速率族不产出；若 median>0 且 ≥3x → relative，否则 null。
- `sortFeedRows('velocity')`：vph 降序 → relative 按倍数降序 → null 最后。
- 文案：`rivalVelocityText` 每档逐字断言（含 `{v}` 格式化
  `≥10k 取整 / 1k–10k 一位 / <1k 整数`、relative `x` 倍数、无 `/h`）。
- 详情：`velocityNote` 三口径逐字。

## 边界（Boundaries）

- 总是：增速只消费已落库 `views_history`，不新增任何采集/云调用；
  `views_history` 透传进 feed row 只读不写。
- 绝不做：`card.relativeBadge` 不重开（规格 §9.6 已停用，卡片不渲染）；
  相对档严禁 `k/h` 单位、`爆款/飙升` 前缀与橙红/琥珀色；不加第 5 个
  排序项；不新增表现筛选档（`filter.perf.group` 不在本票）。

## 规格缺口说明（如实记录，不自行发挥）

- §3.3 C 档条件「绝对量级无法判断」未给数值阈值；实现取 PRD §5.1
  「对比账号历史播放中位数：≥3x 记为爆发」作 render 门，`ratio <3` 时
  返回 null（宁可不渲染也不给出弱化假信号）。
- `posted_at` 无效/缺失时 B 档年龄退用 `first_seen_at`（规格未覆盖此
  兜底；若被否按规格字面改为直接判 null→C）。
- B 档 vph <200 的胶囊存在性：**已由 PM 终验裁定**——「<200 不渲染」
  是对速率族胶囊存在性的规定，A/B 两档一致适用（原实现解读为只约束
  A 档前缀，已被驳回并修正）。
- A 档 vph <200 的后果：**本轮 PM 裁定（方案甲）**——A 档落空与 B 档
  同构，继续走 C 档判定，不短路 `null`；旧实现 `return null` 违反函数
  docblock「Every failure mode degrades」并被判定为「有历史反而没
  胶囊」的反向激励缺陷，已撤回。§7.3 的原始理由（拦死 `均速 33/h`
  一类噪音速率胶囊）在甲案下完整保留——门槛适用范围是速率族。
- A 档落空后的判定次序：**先经 B 档判定，B 亦落空才落 C 档**（严格
  逐档降级链），不得由 A 直接跳 C。四轴复审有「A 档落空应跳过 B 直接
  落 C」的相反主张，**已被 PM 裁定驳回**（`pm-signoff-r3.md` §2.2）：
  B 档产出的是同一 views 的真实发布均速且过同一 200/h 门，不存在
  伪造速率；跳过 B 反而压制合法信号（档位角色错位）。实测口径：
  A 落空 + B 成立（2000 views / 4h）→ `均速 500/h`。
- A 档中间采样回退：`views_history` 任一相邻对 `views[i+1] < views[i]`
  即视为数据异常回滚，不产 measured、降级到下一档（与端点 `delta<0`
  同列失败形态；函数 docblock「a views rollback is a data anomaly,
  never a negative speed — degrade」的完整覆盖）。
- A 档采样窗口取「最早与最晚有效采样」（PRD §5.1 字面为「最近两次」）：
  **登记遗留，本票不改**，待 PM 裁定口径后另行收口。
- 同一 PRD 行另载「指数平滑（近一次权重 0.7）」，实现无平滑：
  **登记遗留，本票不改**（与上一项成对登记，PM signoff R3 §3 要求）。

## 成功标准（Success Criteria）

- 六条验收标准全过：三档降级、C 档无 `/h` 形态、胶囊右上默认+悬停可见、
  无信号不留位、`增速最快` 同口径排序且无增速垫底、坏数据不抛错、
  云调用数不变。
