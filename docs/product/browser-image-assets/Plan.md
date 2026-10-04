---
title: "浏览器图片加入资产库 · 实施与验收计划"
id: "product-plan-browser-image-assets"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# 浏览器图片加入资产库 · 实施与验收计划

产品负责人：许清楚（Xu）。基线：`d95764912e36da01d879ab65d6340469b48a4625`。

此为产品实施计划，不指定新 API、消息结构、鉴权机制或下载架构，不代替技术负责人规格。本轮仅文档交付，不执行以下源码任务，不提交/合并/部署。

文案唯一真源：[UI-Spec](<UI-Spec.md>)；业务验收：[PRD](<PRD.md#6-可测成功标准>)；证据与待确认：[PM_PREFLIGHT](<PM_PREFLIGHT.md>)。

## 1. 开发前置检查

| 顺序 | 负责人 | 工作 | 放行条件 |
|---|---|---|---|
| 1 | 主理人 / PM | 确认当前目标是两个已有入口的图片第一动作；核定默认自定义分类与跨会话重复保存策略 | 不扩大视频/图集/分类 UI 范围；记录仍待确认项 |
| 2 | 前端 | 读取根 design.md 与本目录四件套；确认继承 media-hover 已批准的小尺寸/材质例外 | 不重建 design.md；不改根设计体系；三个槽顺序和几何锁定 |
| 3 | 架构 / 安全 | 独立核定扩展 → 当前宿主真实图片下载与资产登记的可信接缝、结果确认和多实例选择 | 不绕过现有写入防护；没有可信宿主就失败；可核实真实文件和资产记录 |
| 4 | QA / 实现 | 在写实现前建立失败用例：TikTok 视频封面误判、宿主缺失、失败/未知结果假成功 | 用例确实覆盖目标风险，不以模型 mock 宣称真实落库 |
| 5 | PM | 按白名单预检前端方案；歧义未解决时阻止自行补造功能 | 保留 `PM_PREFLIGHT` 与实现后终验分离 |

## 2. 最小实施切片

下列路径是经只读核定的关注面，不是本轮授权写范围，也不要求逐个修改。实现者以技术负责人核定结果选最小必要集合。

### 切片 A · 第一动作作品语义

关注 [media-trigger.ts](<../../../plugins/omnimux-browser/extension/src/content/surfaces/media-trigger.ts>) 与 [payload.ts](<../../../plugins/omnimux-browser/extension/src/content/media-hover/payload.ts>) 的现有事实。

先保证 `/video/` 封面、poster、视频当前帧不进入图片分支；`/photo/` 明确作品与普通图片仍可执行图片保存。显示与点击复核同一作品；不改变复制/对话的地址选择和完整数据协议。类型无法确认就诚实拒绝图片写入。

验收：图片、视频封面、混合卡片、懒加载、SPA 卡片复用、类型冲突矩阵；第一动作图标/提示/目的地一致。

### 切片 B · 真实宿主图片保存

关注 [actions.ts](<../../../plugins/omnimux-browser/extension/src/content/media-hover/actions.ts>)、[background/index.ts](<../../../plugins/omnimux-browser/extension/src/background/index.ts>)、宿主资产库 [library.js](<../../../plugins/omnimux-assets/src/library.js>) 和 [http-routes.js](<../../../plugins/omnimux-assets/src/http-routes.js>)。

先验证可信目标宿主和字节保存能力，再让图片第一动作到真实宿主资产库。视频保留原链路。图片失败不可调用宿主灵感库或扩展本地灵感库兜底；不把返回 2xx、临时文件、空记录、生成 artifact 当作成功。

验收：真实图片文件与宿主本地资产记录关联、可见可预览；下载拒绝/无宿主/存储失败/回执丢失不误报成功，目标环境不串库。技术安全方案由对应负责人完成，PM 不发布技术规格。

### 切片 C · 两入口最小 UI 与文案

关注 [copy.ts](<../../../plugins/omnimux-browser/extension/src/content/media-hover/copy.ts>)、[capsule.ts](<../../../plugins/omnimux-browser/extension/src/content/media-hover/capsule.ts>)、[overlay.ts](<../../../plugins/omnimux-browser/extension/src/content/media-hover/overlay.ts>)、[overlay-icons.ts](<../../../plugins/omnimux-browser/extension/src/content/media-hover/overlay-icons.ts>) 和 [media-trigger.ts](<../../../plugins/omnimux-browser/extension/src/content/surfaces/media-trigger.ts>)。

图片第一图标复用宿主资产库 SVG；两入口第一动作 idle/busy/done/error 使用 UI-Spec 原文。角标图片动作新增的唯一必要可见反馈复用既有提示组件，不新造 toast/标题/分类器。视频灯泡保留；复制/对话不改原文和行为。

验收：中文、英文两入口逐渠道与逐状态核查；第一动作恰好一个图标槽；无额外装饰；键盘与焦点可达；不串媒体状态。

## 3. 验证层次与证据

| 层次 | 必测内容 | 不能代替什么 |
|---|---|---|
| 语义/状态自动测试 | 类型矩阵、目的地分支、重复点击、旧回执不串新媒体、文案/ARIA 与顺序 | 不证明宿主真实写文件 |
| 宿主保存验证 | 图片字节有效、资产记录/预览关联、失败无假资产、无灵感兜底、当前实例选择 | 仅网络存活或接口 2xx 不够 |
| 工作树隔离真实浏览器 | 两入口实际 hover → 展开 → 点击 → 结果；TikTok `/video/` 的 img 封面与 `/photo/`；非 TikTok 图片胶囊；双语言故障反馈 | 静态原型、JSDOM、首页截图不够 |
| 宿主功能闭环 | 同次浏览器点击后用户打开宿主资产库本地视图，找到并预览目标图片 | 不能用任意既有资产截图冒充新保存 |
| PM 源码与视觉终验 | 对照 UI-Spec 全可见字符串、SVG、状态、未授权元素；功能路径截图人眼复检 | 单测全绿不等于 PM_SIGN_OFF |

自动化最小命令集合由实现者依据真实改动面选择，保留基线 media-hover/surfaces 的相关用例，并加入资产保存失败用例；本轮未运行源码测试，不声称测试通过。图片下载真实验证只能使用合法用户点击与已授权来源，不测试绕过鉴权。

建议证据按场景命名：角标图片闲置/处理中/成功/宿主缺失、角标视频 img 封面、胶囊图片成功/下载失败/未知结果、胶囊视频灯泡、宿主新图片预览。每份证据记录同次运行身份、目标宿主、工作树 revision、素材与结果关联，不含密钥。

## 4. PM 终验标准

全部 [PRD：AC-01 至 AC-11](<PRD.md#6-可测成功标准>) 通过；逐字中英文文案与白名单一致；两个入口均有真实图片保存闭环；TikTok 视频封面没有误写入；缺少宿主/失败/未知结果不伪装成功。

实现完成后许清楚再给 `PM_SIGN_OFF: PASS` 或 `PM_SIGN_OFF: REJECT`。本轮状态明确为 `PM_SIGN_OFF: NOT_EXECUTED`。`PM_PREFLIGHT: PASS` 只表示产品范围与 UI/文案预检完成，不代表技术可行性、源码测试、真实端到端或上线准许。

## 5. 收尾边界

本轮产物仅本目录 PRD、Prototype、UI-Spec、Plan、PM_PREFLIGHT。不得在本轮写源码、发布技术规格、commit、push、合并、物化或生产发布。主理人接收报告后先处理待确认事项和技术接缝，再安排实现与终验。
