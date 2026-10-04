---
title: "浏览器图片加入资产库 · UI 与逐字文案规格"
id: "ui-spec-browser-image-assets"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# 浏览器图片加入资产库 · UI 与逐字文案规格

产品负责人：许清楚（Xu）。基线：`d95764912e36da01d879ab65d6340469b48a4625`。

本文件是本任务可见元素与文案的唯一真源，供开发前预检及实现后终验使用；不是技术规格或 API 设计。适用入口：作品角标工具栏 `corner`、媒体悬浮胶囊 `capsule`。未进入白名单的元素不得新增。

关联：[PRD](<PRD.md>)、[Prototype](<Prototype.md>)、[Plan](<Plan.md>)、[PM_PREFLIGHT](<PM_PREFLIGHT.md>)。

## 1. 不变量

1. 展开态恰好三个按钮，固定顺序：第一动作、复制、加入对话。第一动作是在图片/视频之间切换目标，不是新增动作。
2. 两阶段品牌触发器、定位/显隐/几何/开合/键盘/站点覆盖继承基线，不新增永久标题、副标题、徽章、计数、分割线或通知条。
3. 第一动作的文案与目的地来自同一个当前作品语义：图片资产库，视频灵感库。`img`、JPEG/PNG 扩展名、poster、预览图片不等于图片作品。
4. 第一动作两入口采用同一语言和同一状态文案。切换媒体或语言时重新派生，不保留旧结果。
5. 复制与加入对话保留基线渠道文案、图标、语义及结果；不把“复制”统一改为“复制链接”。

## 2. UI 元素白名单

| ID / 区域 | 允许元素 | 内容或图形 | 显隐与交互 | 禁止附加项 |
|---|---|---|---|---|
| `corner.brand` | 既有品牌图标按钮 | 基线幽灵 SVG；既有 aria `OmniMux 快捷操作` | 继承卡片悬停、聚焦和开合规则；本次不改品牌文案 | 禁加资产/视频标签与常驻标题 |
| `capsule.brand` | 既有品牌图标按钮 | 基线幽灵 SVG；aria `OmniMux` | 继承收起/展开阶段 | 禁添加下载/加号装饰 |
| `corner.toolbar`、`capsule.toolbar` | 既有横向 toolbar 容器 | aria `OmniMux`；不显示标题文字 | 继承基线定位和圆角材质 | 禁加第四按钮、分割线、说明行 |
| `*.primary.image` | 单个图标按钮，第一槽 | 资产库矢量图标；文案见 §3 | 仅确定为图片作品时；点击真实保存当前图片 | 禁仍用灯泡、星形；禁徽章、二级菜单、分类表单 |
| `*.primary.video` | 单个图标按钮，第一槽 | 基线灯泡；文案见 §3 | 视频及视频封面语义；走既有灵感保存 | 禁换资产图标、禁把封面送入资产库 |
| `*.primary.unknown` | 第一槽保留，不增按钮 | 保留基线灯泡而不显示资产/check/star；title、aria、tooltip 使用 typeUnknown | 无法确认类型时不发起任何保存；点击同样反馈 §3 的类型错误 | 禁显示“加入资产库”暗示已确认图片；禁默认把未知当图片；禁静默写灵感库 |
| `*.primary.busy` | 第一槽既有状态图形/忙态，不新增进度条 | 复用既有 plus 忙态 SVG；文案见 §3 | 当前请求处理中拒绝重复第一动作；`aria-busy=true`；未获最终结果不能提前 done | 禁百分比、虚构阶段、成功星形 |
| `*.primary.image.done` | 第一槽既有勾形 SVG 与已保存状态 | check；文案见 §3 | 仅当前图片真实宿主保存确认后；本次媒体会话内保持；无删除/取消收藏语义 | 禁视频 star、禁推断历史已保存 |
| `capsule.primary.video.done` | 继承既有视频收藏状态 | 基线 star；文案见 §3 | 按既有视频保存结果；不升级为宿主资产保存承诺 | 禁换 asset/check 作为新视频设计 |
| `corner.primary.video.done` | 基线视频灯泡 | 不新增星形持久态 | 视频原交互保留；本轮仅图片结果需要原位呈现 | 禁借一致性重设计视频状态 |
| `*.copy` | 第二槽既有图标按钮 | 双页 copy SVG；逐渠道文案见 §4 | 复制目标/成功反馈继承基线 | 禁扩写、禁改名、禁顺便改复制 URL |
| `*.attach` | 第三槽既有图标按钮 | bubble SVG；逐渠道文案见 §4 | 会话选择与投递继承基线 | 禁自动运行、禁另加“分析” |
| `*.primary.feedback` | 锚定第一按钮的单条短提示 | §3 唯一当前状态文案 | hover/focus 说明或点击结果；同一时刻一条；结果结束后恢复普通提示 | 禁双重 toast + 气泡、禁常驻 banner、禁内嵌重试按钮、禁直接显示原始服务端堆栈 |

`corner` 基线使用 native title，未消费动作结果；为了完成本需求，允许复用胶囊已有提示组件，在图片第一动作点击后显示单条保存/失败反馈。不能仅修改隐藏 title 或点击后立即收起，让用户看不到结果。无需为视频、复制、对话全面补造新的结果 UI。

## 3. 第一动作逐字中英文文案

下表字符串不允许同义改写。中英文标点逐字锁定。

### 3.1 图片第一动作：两入口同源

| Copy ID / 状态 | 中文 | English | 渲染渠道与约束 |
|---|---|---|---|
| `image.idle` | `加入资产库` | `Add to asset library` | title、aria-label、hover/focus tooltip 均用本行；不是可见长按钮文字 |
| `image.busy` | `正在加入资产库` | `Adding to asset library` | 处理中的 title、aria-label、tooltip；不意味着已保存 |
| `image.done` | `已加入资产库` | `Added to asset library` | 真实宿主保存后 title、aria-label、结果 tooltip；两入口一致 |
| `image.hostUnavailable` | `宿主未连接，请打开 OmniMux 后重试` | `Host not connected. Open OmniMux and try again.` | 没有可信目标宿主或明确未连接；点击后原位反馈，不自动连接/打开 |
| `image.downloadFailed` | `图片下载失败，请重试` | `Image download failed. Try again.` | 宿主明确报告下载失败，如网络、403、失效 URL；不冒充已加入 |
| `image.saveFailed` | `资产保存失败，请重试` | `Asset could not be saved. Try again.` | 已连接但明确注册/写文件失败；不把所有问题谎称未连接 |
| `image.unavailable` | `该图片无法保存` | `This image cannot be saved` | 空源、不可保存来源、实际返回非图片，或不支持安全取得字节；不降级为页面链接资产 |
| `image.typeUnknown` | `无法确认素材类型，请刷新后重试` | `Media type could not be confirmed. Refresh and try again.` | 当前作品类型不明确/矛盾；不写资产或灵感 |
| `image.unconfirmed` | `未确认保存结果，请稍后查看资产库` | `Save result not confirmed. Check the asset library shortly.` | 请求可能已到宿主但最终回执丢失/超时；不能声明未保存或成功 |
| `image.defaultName` | `网页图片` | `Web image` | 仅真实名称缺失时使用的宿主资产名称；不是工具栏副标题 |

失败/未知结果弹出时，第一按钮恢复对应媒体的 idle title/aria-label；短结果提示负责描述失败原因。失败不会置保存状态。done 后的四渠道使用同一完成字符串。普通未参与第一动作的其他按钮不得被本任务永久锁住。

### 3.2 视频第一动作：保留基线

| Copy ID / 状态 | 中文 | English | 约束 |
|---|---|---|---|
| `video.idle` | `加入灵感库` | `Add to library` | title/aria/提示按基线语义；角标原中文与胶囊一致，英文用已有 hoverCopy，不另创翻译 |
| `video.done` | `已加入灵感库` | `Added to library` | 仅原视频保存成功；不能使用图片完成文案 |
| `video.pageReference` | `该视频仅在页面内可播，已引用页面链接` | `This video only plays in its page, so the page link was used` | 继承既有页内视频处理，不冒称资产保存 |
| `video.failed` | `操作失败，请重试` | `Something went wrong. Try again.` | 原视频失败反馈 |

视频基线没有新的 busy 文字，本次不要求新造视频处理中字符串。若旧组件需要 idle 名称，继续用 `video.idle`；不可拿图片 busy/done 文字套用。

## 4. 复制与对话：原文冻结

| 入口 / 渠道 | 中文 | English | 基线与执行边界 |
|---|---|---|---|
| 两入口复制按钮 aria；角标 title | `复制` | `Copy` | 保持原 action 文案；角标原来只有中文，切英文时复用既有 copy 表，不重写中文 |
| 胶囊复制 hover/focus 提示 | `复制素材链接` | `Copy media link` | 保留既有 hint；不改成“复制链接” |
| 复制已有 done | `已复制素材链接` | `Media link copied` | 保留结果原文；不强制给角标新增完整复制反馈 UI |
| 两入口对话 title/aria/提示 | `加入对话` | `Add to chat` | 保留 action/hint |
| 对话已有 done | `已加入对话` | `Added to chat` | 仅原协议结果，不修改成功门槛 |
| 复制/对话已有失败 | `操作失败，请重试` | `Something went wrong. Try again.` | 保留通用失败 |
| 既有素材不可用 | `该素材地址不可用` | `This media address cannot be used` | 保留原文，图片入库用 §3 专用原因 |
| 既有页内视频引用 | `该视频仅在页面内可播，已引用页面链接` | `This video only plays in its page, so the page link was used` | 不影响原 URL 降级逻辑 |

“一致”指图片第一动作两入口的四渠道一致。复制自身已有的 `action=复制`、`hint=复制素材链接` 是有意冻结的渠道差别，不得修成一致以扩大任务。

## 5. 图标复用核定

### 已核定可复用的唯一图片默认图形

宿主资产库侧栏 [sidebar-entry.js:10](<../../../plugins/omnimux-assets/src/client/sidebar-entry.js#L10>) 的 `ICON`：`viewBox="0 0 22 22"`，使用 `currentColor` 的单色 SVG path。该内联 SVG 无需网络、React、宿主主题运行时，可以原样复用矢量几何到扩展既有图标槽。不得直接跨运行时导入包含侧栏行为的模块；代码组织由技术负责人核定，PM 只冻结图形。

两入口图片第一动作使用此图形，不改路径、不附加“+”、不重新手画。胶囊使用已有 14px 字形槽；角标使用已有 15px 字形槽；各自保留按钮命中区、颜色与悬停风格。不得将宿主侧栏 14px SVG 的尺寸属性当成扩展按钮新尺寸。

已发现但不选用的其他图形：扩展面板 `FolderIcon`（通用文件夹）；中枢 `renderLibraryIcon`（叠图选材）。这些不是本轮所选的资产库侧栏入口图形，不能由前端自行切换。

视频继续使用基线 `bulb`。品牌幽灵、copy、bubble、busy plus、check 与视频 saved star 均继承现有 SVG。禁止 Emoji、Unicode 符号及装饰图形。

## 6. 作品语义与状态矩阵

### 6.1 作品类型矩阵

| 实际情况 | 第一动作 / 图标 | 图片资产写入 | 复制与对话 |
|---|---|---|---|
| TikTok 卡片明确 `/video/`，内部仅有 `img` 封面 | 视频加入灵感库 / 灯泡 | 禁止，封面不是图片作品 | 地址选择和投递维持既有行为 |
| TikTok `/video/`，内部 `img` 与 `video` 共存 | 视频加入灵感库 / 灯泡 | 禁止 | 同上 |
| TikTok 明确 `/photo/`，当前图片可取得 | 图片加入资产库 / 资产矢量 | 允许当前单张真实图片 | 不批量抓全图集，不改后两项 |
| 已支持非 TikTok 图片作品 | 图片加入资产库 / 资产矢量 | 允许当前单张 | 后两项不变 |
| `video` 的 poster、视频当前帧 | 视频加入灵感库 / 灯泡 | 禁止，即使源是 JPG/PNG | 后两项不变 |
| 存在明确视频证据但最终请求声称图片 | 不发起图片入库 | 拒绝 | 不因安全拒绝改写后两项协议 |
| 卡片无作品链接且只有模糊封面，或作品类型冲突无法核定 | 未确认态；点击显示 typeUnknown | 禁止；也不静默写灵感 | 保留现有后两项能力，不能推断扩展新能力 |
| 普通独立图片的 HTTP(S) 地址失效/下载结果为 HTML | 图片失败反馈 | 不得生成假图片记录 | 后两项不变 |
| 图片仅有 blob/data 或受限来源 | 只有安全取得真实图片字节才可成功；否则 unavailable | 禁止把网页 URL/截图替换成图片资产 | 本任务不承诺支持全部来源 |

作品类型在显示第一动作和点击第一动作时都要复核。懒加载、SPA 卡片更新不得使显示文案与最终目的地分离。此约束是第一动作的业务规则，不授权重设计全部媒体 payload 或改变复制/对话所用地址。

### 6.2 图片动作结果矩阵

| 状态 | 第一按钮 | 提示 | 成功标识 | 写入目的地 |
|---|---|---|---|---|
| 闲置 | 可用，资产图标，idle 文案 | hover/focus idle | 无 | 无 |
| 处理中 | 阻止重复，既有忙态，busy 文案 | busy；不新增常驻条 | 无 | 当前可信宿主保存请求 |
| 宿主图片文件和资产记录均保存成功 | 可用，check，done 文案 | done 原位反馈 | 有，仅当前图片 | 宿主本地资产库 |
| 仅收到请求/HTTP 2xx/扩展本地写入 | 不能进入 done | 等待最终结果；超时 unconfirmed | 无 | 不把这些信号算保存成功 |
| 明确无宿主/未连接 | 恢复可用，idle | hostUnavailable | 无 | 无，不写其他实例 |
| 明确下载失败 | 恢复可用，idle | downloadFailed | 无 | 无有效资产，不写灵感 |
| 明确保存拒绝/落盘失败 | 恢复可用，idle | saveFailed | 无 | 不宣称成功，不写灵感 |
| 请求后回执超时或丢失 | 恢复可用，idle | unconfirmed | 无 | 结果未知，可能已在宿主；禁止自动补写/改库 |
| 类型不明/来源不可保存 | 恢复可用或无可执行源，idle | typeUnknown / unavailable | 无 | 不写资产/灵感 |
| 切到另一个媒体，旧请求返回 | 新媒体初始状态 | 不把旧反馈贴到新按钮 | 不串状态 | 只承认旧请求所属图片 |
| 同次会话已真实保存，再点第一项 | 保持已保存，不重复创建 | done | 保持当前图片状态 | 无重复动作；不是删除切换 |

失败/完成提示复用既有约 3 秒结果反馈周期；角标图片反馈在按钮仍被操作时不得立刻折叠吞掉结果，延续既有离开/隐藏规则。用户离开、关闭开关或媒体移除时不强留屏幕通知。结果区可由无障碍状态播报复用同一字符串，不新增可见说明元素。

## 7. 视觉继承与终验红线

根 [design.md](<../../../design.md>) 的 SVG、可读性、无额外主题岛等原则保留。媒体悬浮已有批准的小尺寸/胶囊/材质例外以 [media-hover-instant-reveal](<../../../specs/media-hover-instant-reveal.spec.md#L45-L60>) 与基线实际实现为准，不把本任务扩成 32px 改造。角标既有 26px 命中区与根 32px 规则不一致，本轮记录但不越权重设计。

实现终验必须检查：第一动作逐字复制、第一动作四渠道状态一致、两个入口图形相同、三个动作顺序、无额外元素、视频灯泡不变、复制/对话原文不变，以及真实宿主图片落库证据。`PM_SIGN_OFF` 本轮未执行。
