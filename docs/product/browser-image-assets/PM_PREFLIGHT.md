---
title: "浏览器图片加入资产库 · PM_PREFLIGHT"
id: "pm-preflight-browser-image-assets"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# 浏览器图片加入资产库 · PM_PREFLIGHT

负责人：许清楚（Xu）。日期：2026-10-03。

## 1. 结论

**PM_PREFLIGHT: PASS（产品范围、最小界面、逐字文案与状态预检）**。

通过范围：两个既有入口、三个动作顺序、图片真实宿主资产库目标、视频原灵感链路、第一动作中英文、图标复用、最小诚实反馈及反误判验收均已明确。通过不代表接口可直接复用、不代表源码或浏览器已验收，也不自动解决 §3 的产品建议与技术未知。

**PM_SIGN_OFF: NOT_EXECUTED**。必须留到实现后，对照白名单及同次真实图片保存闭环再判定。

本轮仅在指定工作树的 `docs/product/browser-image-assets/` 创建五份产品文件；业务源码只读，未写入 AGENTS/CLAUDE，未发布技术规格，未 commit/push/合并/部署。

交付物完整绝对路径：

| 产物 | 完整绝对路径 |
|---|---|
| PRD | [PRD.md](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets/docs/product/browser-image-assets/PRD.md>) |
| Prototype | [Prototype.md](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets/docs/product/browser-image-assets/Prototype.md>) |
| UI-Spec | [UI-Spec.md](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets/docs/product/browser-image-assets/UI-Spec.md>) |
| Plan | [Plan.md](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets/docs/product/browser-image-assets/Plan.md>) |
| PM_PREFLIGHT | [PM_PREFLIGHT.md](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets/docs/product/browser-image-assets/PM_PREFLIGHT.md>) |

## 2. 证据

### 2.1 工作树身份

只读命令均显式指定工作树；Git 均带 `-C`：

- `pwd`：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets`。
- `git -C /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets status --short --branch -uall`：开始时工作树干净，分支 `agent/cross-browser-image-assets...origin/main`。
- `git -C /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets rev-parse HEAD`：`d95764912e36da01d879ab65d6340469b48a4625`，与用户基线相同。

Bash 结果没有失败标记。文档通过 read/grep/glob 核定，文件写入只使用 write/edit；未用 shell 创建或修改文档。

### 2.2 设计与既有规格

| 已读来源 | 实际证据 | 本轮结论 |
|---|---|---|
| 根 [design.md:26–66](</Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/design.md#L26-L66>) 及全篇 | 原生 token、矢量 SVG、几何与可读性要求 | 不引入 emoji、主题岛或新视觉风格 |
| [browser-surfaces.spec.md:44–70](<../../../specs/browser-surfaces.spec.md#L44-L70>) | 角标两阶段，三动作；TikTok 网格消费 media-trigger，详情/流不消费；TikTok 不叠加胶囊 | 不扩大挂载面、不做同页双入口 |
| [media-hover-instant-reveal.spec.md:23–29](<../../../specs/media-hover-instant-reveal.spec.md#L23-L29>)、[45–60](<../../../specs/media-hover-instant-reveal.spec.md#L45-L60>) | 命中即显示；用户确认胶囊 24×24 / 128×24、24px 按钮/14px SVG、现有材质 | 旧 toolbar-fix 的 64px 不是本轮基线，不能回退旧尺寸 |
| [media-hover-card-region.spec.md:47–59](<../../../specs/media-hover-card-region.spec.md#L47-L59>) | 卡片内不隐藏，卡片外宽限；真实销毁立即隐藏；悬停零消息 | 不因入库新增 hover 请求或改隐藏逻辑 |
| [media-hover-toolbar-fix.spec.md](<../../../specs/media-hover-toolbar-fix.spec.md>) 与 [media-hover-video-visibility.spec.md](<../../../specs/media-hover-video-visibility.spec.md>) | 多事件保底、工具栏和气泡同时可见、视频交互不闪隐 | 保留原交互防回退要求，旧尺寸以更晚规格/源码为准 |

### 2.3 两入口与真实保存

| 已读来源 | 观察事实（非推测） | 最小改变判断 |
|---|---|---|
| [media-trigger.ts:133–162](<../../../plugins/omnimux-browser/extension/src/content/surfaces/media-trigger.ts#L133-L162>) | `kindOf` 仅看是否 HTMLVideoElement；`querySelector('img') ?? querySelector('video')`；作品链接包含 `/video/` 或 `/photo/`，但没用于 kind | TikTok `/video/` + img 封面会被当 image；必须核定第一动作作品语义，不能纯改标签 |
| [media-trigger.ts:363–378](<../../../plugins/omnimux-browser/extension/src/content/surfaces/media-trigger.ts#L363-L378>)、[447–454](<../../../plugins/omnimux-browser/extension/src/content/surfaces/media-trigger.ts#L447-L454>)、[544–548](<../../../plugins/omnimux-browser/extension/src/content/surfaces/media-trigger.ts#L544-L548>) | 顺序 inspiration/copy/attach；title/aria 中文固定；执行后无论 outcome 直接收起 | 图片第一动作需要媒体敏感文案/图标与可见结果；复制/对话不改原文与后端行为 |
| [copy.ts:37–79](<../../../plugins/omnimux-browser/extension/src/content/media-hover/copy.ts#L37-L79>) | action 复制为“复制/Copy”，hint 为“复制素材链接/Copy media link”；视频现英文 Add to library | UI-Spec 冻结渠道差异，避免借统一文案扩写后两项 |
| [capsule.ts:26–42](<../../../plugins/omnimux-browser/extension/src/content/media-hover/capsule.ts#L26-L42>)、[267–287](<../../../plugins/omnimux-browser/extension/src/content/media-hover/capsule.ts#L267-L287>) | 三动作次序固定；灵感 saved 用 star，busy/done 可复用 plus/check | 视频灯泡/星形保留，图片默认资产图形，真实完成才用 check |
| [overlay.ts:599–658](<../../../plugins/omnimux-browser/extension/src/content/media-hover/overlay.ts#L599-L658>) | 胶囊按 outcome.ok 更新 saved，并显示 message；复用约 3 秒结果提示 | 可以沿用原位反馈容器，但图片成功条件必须更严格 |
| [actions.ts:196–211](<../../../plugins/omnimux-browser/extension/src/content/media-hover/actions.ts#L196-L211>) | 第一动作只发 DSH_MEDIA_TO_INSPIRATION；ok 包装和内层失败判断 | 图片不是改 done 文案即可，必须到真实宿主资产路径 |
| [background/index.ts:1787–1812](<../../../plugins/omnimux-browser/extension/src/background/index.ts#L1787-L1812>)、[1893–1934](<../../../plugins/omnimux-browser/extension/src/background/index.ts#L1893-L1934>) | 并行写宿主灵感与扩展本地灵感，任一成功即成功；候选端口轮询写宿主灵感 | 图片必须禁止灵感兜底及任意其他实例补写；视频原链路不重构 |
| [media-library.ts:77–101](<../../../plugins/omnimux-browser/extension/src/background/media-library.ts#L77-L101>) | 扩展 chrome.storage.local 灵感记录，按 src 去重并有容量上限 | 扩展本地记录不是宿主资产保存；历史视频/灵感记录不迁移 |
| [payload.ts:269–299](<../../../plugins/omnimux-browser/extension/src/content/media-hover/payload.ts#L269-L299>) | 视频 source ladder 优先 poster，之后 direct/blob/frame | 即使视频 src 是可下载图片，也不能改成图片资产；后两项原地址语义不动 |
| [classifier.ts:385–404](<../../../plugins/omnimux-browser/extension/src/content/media-hover/classifier.ts#L385-L404>) | 媒体胶囊硬拒绝 TikTok，已有社交平台/大小/内容资格门槛 | 本任务不解禁 TikTok 胶囊，不使普通网页新增入口 |
| [registry.ts:63–85](<../../../plugins/omnimux-browser/extension/src/content/surfaces/registry.ts#L63-L85>) | TikTok path 区分 feed/detail 与 grid | 列表覆盖继承真实基线，不更改 scene-fixed |

### 2.4 资产图形与宿主能力

| 已读来源 | 观察事实 | 产品结论 / 技术未知 |
|---|---|---|
| [assets sidebar-entry.js:10](<../../../plugins/omnimux-assets/src/client/sidebar-entry.js#L10>) | 资产库侧栏 ICON 是 viewBox 22 的 currentColor 内联 SVG | 矢量几何可复用；锁定为图片第一动作默认图形。不能直接导入该侧栏业务模块到 content script |
| [overlay-icons.ts:1–9](<../../../plugins/omnimux-browser/extension/src/content/media-hover/overlay-icons.ts#L1-L9>)、[126–138](<../../../plugins/omnimux-browser/extension/src/content/media-hover/overlay-icons.ts#L126-L138>) | content script 不消费 React 图标组件；已有 SVG 字符串及 plus/check | 复用路径可行，不增加 React/UI 运行时。没有把现有图标表声称为已有 asset 键 |
| [panel icons.tsx:73–79](<../../../plugins/omnimux-browser/extension/src/panel/components/icons.tsx#L73-L79>)、[composer-commands-i18n.js:58–98](<../../../plugins/omnimux/src/client/composer-commands-i18n.js#L58-L98>) | 通用 FolderIcon、选材叠图图形也存在 | 已考察但不选用，避免前端自行挑不同图形 |
| [assets library.js:1–6](<../../../plugins/omnimux-assets/src/library.js#L1-L6>)、[17–27](<../../../plugins/omnimux-assets/src/library.js#L17-L27>)、[398–418](<../../../plugins/omnimux-assets/src/library.js#L398-L418>)、[528–556](<../../../plugins/omnimux-assets/src/library.js#L528-L556>) | 资产库存本地实物文件，已有 custom；add 接收本地文件并物化，名称上限 40 字，名称冲突拒绝 | 宿主资产存在且能保存本地文件，但不是已验证的网页 URL 导入能力。建议自定义分类，不伪造语义分类 |
| [assets http-routes.js:198–209](<../../../plugins/omnimux-assets/src/http-routes.js#L198-L209>)、[610–615](<../../../plugins/omnimux-assets/src/http-routes.js#L610-L615>) | library POST 调 library.add；写入有 cross-site/origin 防护 | 不可未经技术核定承诺扩展能直接 POST。不能为满足产品目标删除或绕过防护 |
| [assets index.js:308–348](<../../../plugins/omnimux-assets/src/index.js#L308-L348>)、[444–477](<../../../plugins/omnimux-assets/src/index.js#L444-L477>) | assets_create 创建有类型资产；assets_upload 是带 agent 的生成 artifact 上报 | 图片网页素材不能只上报 artifact 并伪称完成本地创作资产入库 |
| [use-assets-feed.js:149–200](<../../../plugins/omnimux-assets/src/client/use-assets-feed.js#L149-L200>) | 资产库打开时刷新、订阅 changed，连接异常时轮询 | 成功须实际可发现/可预览；不以 HTTP 或事件已发替代可见闭环 |
| [media-export.ts:48–66](<../../../plugins/omnimux-browser/extension/src/background/media-export.ts#L48-L66>) | 已有从 bridge URL 得当前 HTTP base 的工具 | 当前宿主复用存在先例；图片可信写入接缝由技术负责人核定，不在产品稿发布新协议 |

## 3. 待确认歧义与执行边界

| 项目 | 推荐口径 / 已锁定红线 | 需要谁确认 |
|---|---|---|
| 默认分类与单张范围 | 建议既有“自定义”，每次当前单张，不新增分类 UI 或整图集抓取 | 主理人确认产品默认值；不是再次询问已确认的主目标 |
| 跨会话重复保存/同名 | 同次媒体会话已成功不重复创建；跨会话建议识别相同来源/内容的已存资产后返回真实现存结果，不覆盖不同图片或因名称撞车误判已保存 | 主理人 / PM 确认策略，技术负责人核定身份依据；不自行发明跨端全局去重功能 |
| 只有 blob/data、需登录图片 | 没有安全取得真实字节能力就显示“该图片无法保存”；不截屏、不拿页面 URL 做图片、不绕过平台权限 | 技术负责人说明首版可支持来源；PM 不承诺全来源支持 |
| 宿主未连接的判定 | 产品反馈冻结；复用当前目标宿主，不写其他实例；不能把 403/插件缺失/保存拒绝一律误报未连接 | 架构 / 安全负责人核定真实连接和授权接缝 |
| 未知结果与再次重试 | 先提示未确认，禁止自动重试/补偿写灵感库；重试不能误创建跨目标记录 | 技术负责人核定回执/重试语义，PM 对任何新增 UI 再预检 |
| TikTok `/photo/` 卡片封面原图质量 | 产品目标是当前图对应的真实可用图片，不承诺自动获取整组或最高质量原图 | 实现者提供当前来源与实际图片对应证据；不足则如实拒绝，不能伪装成功 |

以上歧义不推翻用户已确认的“图片入真实宿主资产、视频保留灵感、复制/对话不变”。可先开展只读技术核定，受影响行为在确认前不得自行变更或放行实现终验。

## 4. 未覆盖 / 未执行

- 未修改业务源码、技术规格、根 design.md、旧 browser-surfaces/media-hover 规格及角色规则文件。
- 未运行源码单测、构建、真实扩展浏览器、真实宿主下载/资产保存验收；没有运行截图，也没有声称端到端成功。
- 未证明所有 Chromium/Firefox 分发支持，也未改变浏览器范围；实现验收按本产品实际支持的扩展平台执行。
- 未审计所有第三方图片鉴权/格式/尺寸上限及宿主下载实现；这是后续技术与 QA 边界。
- 发现角标基线 26px 命中区与根 design.md 32px 原则冲突，仅记录；按本任务“最小改变”不重新改尺寸。
- 本报告是持久化产品预检证据，不是实现后的 PM_SIGN_OFF。

## 5. 置信度

对范围、基线文案、角标 img 视频封面误判、灵感本地兜底和可复用 SVG：高（已读实际实现与相关规格）。

对“网页图片可通过现成宿主路径安全保存”：未确定。已读资产库存储与写入防护，但未运行端到端，也未发布技术方案。最弱点是可信扩展写入接缝、网页图片下载来源和重复保存策略。

## 6. 文档自检

四件套统一以 UI-Spec 为文案真源；未增加第四动作；中英文图片 idle/busy/done/失败/未知结果齐全；明确视频灯泡与复制/对话渠道差别冻结；成功以真实文件、资产记录、宿主可见预览为准；禁止视频封面入资产与图片灵感兜底；PM_SIGN_OFF 明确未执行。

原报告记录五份预期文件存在且非空、75 个链接检查为 PASS；主理人后续检查发现 UI-Spec 中 design 链接向上层级过多，已修正为工作树根的 design.md，因此原链接全通过结论不能作为完整链接证据。仓库 doc-lint 还把标准尖括号 Markdown 目标误当作文件名；全仓命令有失败，不能报整体通过。后续须以正确解析尖括号的定向链接检查举证。HEAD 仍为基线，文档检查不代替业务测试。

收尾工作树还出现 [CONTEXT.md](<../../../CONTEXT.md>) 修改及 [browser-image-assets.spec.md](<../../../specs/browser-image-assets.spec.md>) 未跟踪文件；不是本 PM 本轮写入，未读取技术规格、未覆盖、未暂存。主理人应分别核对并发产物归属，不得把全工作树 dirty 路径误归为本 PM 修改。
