# 社媒采集插件（omnimux-social-harvest）P0 规格

- Issue: #2426
- 日期: 2026-09-20
- 范围: 新建领域插件，封装本机 OpenCLI 官方内置社媒适配器（只读采集），服务爆款复刻主线的发现/解构环节。

## 1. 背景与目标

OpenCLI（jackwener/opencli，Apache-2.0）把网站变成 `opencli <site> <command>`，复用本机 Chrome 登录态采集数据。11 个社媒平台适配器全部官方内置（官方仓 clis/ 182 个，npm 包附带），零自研。本插件只做四层：环境检测、表单外壳、错误翻译、结果暂存。

## 2. 新用户基线（product-baseline 契约）

- 新用户机器上**不存在** OpenCLI → 本功能是「显式开启」：settings.plugin.item 总开关默认关；未装时页面显示安装引导；工具调用抛 `HARVEST_NOT_INSTALLED`（hint 含安装指引）。
- 禁止：静默降级、假数据、默认路径回退、读 settings.yaml、127.0.0.1 端点、开发机绝对路径。

## 3. 关键用户旅程

### J1 首次进入（未装 OpenCLI）
1. 用户打开工作台「社媒采集」Tab；
2. 页面顶部环境卡显示「未检测到采集环境」+ 安装指引（OpenCLIApp 或 npm）；
3. 平台列表与工具集可见但执行被拦截，提示先装环境。

### J2 连接平台
1. 点平台行的「去浏览器登录」（或工具 `harvest_site_login`）；
2. 前台浏览器窗口打开该平台登录页，人工完成登录（产品不接触账号密码）；
3. 插件 `whoami` 轮询到登录态后，平台徽章变「已连接」。

### J3 采集（核心）
1. 左栏选平台（如 TikTok）→ 右侧工具集点击 `search` 行；
2. 弹窗按该命令输入规格渲染表单（关键词=文本、链接=等宽 URL 框、数量=滑杆、类型=下拉、素材=上传框）；
3. 必填校验通过后执行，弹窗内回显结构化结果（标题/作者/播放/点赞/评论）；
4. 结果写入 `$DSH_HOME/omnimux-social-harvest/reports/`。

### J4 失败引导
- 未登录执行需登录工具 → `HARVEST_AUTH`，hint 引导 J2；
- 桥接断开 → `HARVEST_UNAVAILABLE`（可重试），hint `opencli doctor`；
- 空结果 → 合法空态 `items: []`，不误报。

## 4. Agent 工具面（6 个，全只读）

| 工具 | 封装 | 参数 | 输出 |
|---|---|---|---|
| harvest_tiktok_search | tiktok search | query*, limit≤50 | 信封 |
| harvest_tiktok_user | tiktok user | target*, limit | 信封 |
| harvest_pinterest_pins | pinterest search-pins | query*, limit | 信封 |
| harvest_pinterest_download | pinterest download | url*, dest | 信封（含落盘路径） |
| harvest_sites_status | per-site whoami（60s 缓存） | — | {sites:[{id,name,loggedIn}]} |
| harvest_site_login | <site> login（前台持久会话） | site* | {ok, site} |

统一信封 `{ ok, site, command, items[], rawCount, warnings[], fetchedAtMs }`。

## 5. 错误契约

| 条件 | 码 | retryable | hint |
|---|---|---|---|
| opencli 不在 PATH | HARVEST_NOT_INSTALLED | 否 | 安装指引 |
| exit 77 / 登录特征 | HARVEST_AUTH | 否 | 去浏览器登录该平台 |
| exit 69 / 桥接特征 | HARVEST_UNAVAILABLE | 是 | opencli doctor |
| exit 75 / 超时 | HARVEST_UNAVAILABLE | 是 | 重试 |
| exit 66 | 合法空态 | — | — |
| stdout 非 JSON/无数组 | HARVEST_BAD_PAYLOAD | 否 | 附前 200 字符诊断 |
| 总开关关闭 | HARVEST_DISABLED | 否 | 设置→插件→开启社媒采集 |

分类顺序固定：BINARY_MISSING → BRIDGE → AUTH → 其它（沿用 intercept 实测教训：失败时 stdout 为空、诊断在 stderr）。

## 6. 界面规格

- 席位：Workbench Tab `omnimux-social-harvest:library`（registerTab + createTab）+ settings.plugin.item 紧凑卡（总开关，默认关）。
- 布局：左 264px 平台列表（图标/名称/工具数/状态点），右侧命令工具集行式卡片（命令名+说明+read/auth 标签+›），点击行开弹窗。
- 弹窗：标题 `平台 · 命令`；表单规格驱动渲染 5 类控件；执行中按钮 loading；结果回显弹窗内列表；错误以 hint 条呈现。
- 视觉：demo-page-template 规范（#111113/#18181b、#7961f2 极光紫、Ink CTA、32px 控件、8px 圆角、i18n zh/en）。

## 7. 验收标准

1. 单测：argv 构造逐位断言、envelope 三形态、错误分类顺序、表单规格映射、门禁（开关关/未登录）——100% 绿；
2. `pnpm test:agent-tools` 四层通过；`pnpm verify:product-baseline` 零豁免；guard-ui-design 通过；
3. 工作树隔离浏览器验证：页面挂载、弹窗开合、表单渲染、未装环境引导卡（截图证据）；
4. 真实环境（本机已装）：`harvest_tiktok_search` 返回真实数据（证据落 docs/evidence/）；
5. PR 合入 main（Merge Queue，读回 MERGED）。

## 8. 明确不做（P1/P2）

Ins/X/YouTube/小红书/抖音采集工具、写操作命令（永不开放）、送入解构管线对接、表单规格自动推导、站点级节流。
