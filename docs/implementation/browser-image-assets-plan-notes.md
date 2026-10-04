---
title: "浏览器图片真实入资产库 · 架构调查"
id: "architecture-notes-browser-image-assets"
type: "log"
status: "accepted"
authority: "L3"
date: "2026-10-03"
subsystem: "omnimux-browser"
---

# 浏览器图片真实入资产库：调查与实施计划 notes

> 状态：架构调查完成，方案与票据均为草案；不是已批准的技术规格，不发布 Issue / PR。
> 调查基线：`d95764912e36da01d879ab65d6340469b48a4625`。工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-browser-image-assets`；根仓：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`。
> 用户已确认：作品角标与悬浮胶囊两处，图片改为下载真实文件进宿主资产库；视频保持原加入灵感库；复制、加入对话不变。此文只调查及给出实施建议，不改业务源码。

## 1. 结论与可信度

**已存在真实 URL 下载入库能力，但不存在已核实的“任意网页图片 URL → 资产库”的现成公共入口。** 云目录 `saveToLocal(id)` 下载目录中的 URL，再调用当前资产库 `library.add()`，最终保存文件副本和账本。它接收云目录 ID，不接收任意 URL；不能伪造云目录行、把浏览器收藏写进云目录或把 URL 当成本地文件路径传给 `library.add()`。

**推荐组合复用，而非新增资产库：复用浏览器桥的安全下载 Module、宿主已有的只校验不保存图片 Interface、资产库同一个活跃 LibraryStore 的持久化。** 扩展图片写入走当前配对且握手完成的 WebSocket，新增一个窄的图片入库 RPC；Host 下载和校验后通过 assets 拥有的宿主 Seam 完成真实入库。不要开放通用跨域文件写路由，不要让扩展提交本机路径，不创建第二个 LibraryStore、不直接覆写其 JSON。

可靠性：持久化、角标/胶囊调用、下载限制、认证逻辑均有读过的源码证据及既有定向测试；真实 Chrome/Firefox 扩展点击到宿主资产页的产品闭环尚未实现/实测。以下接口名和数值方案标为建议，不把测试绿灯等同于功能端到端成功。

## 2. 客观技术栈与证据地图

栈由构建配置识别：根 [package.json](../../package.json#L1-L12) 为 ESM / pnpm 11.7.0 工作区、Node `^22.19.0 || >=24`；assets 是 Node ESM JavaScript、React 18、esbuild、`node:test`（[配置](../../plugins/omnimux-assets/package.json#L20-L56)）；browser Host 是严格 TypeScript、Cordis、ws、tsc + tsdown、Vitest（[配置](../../plugins/omnimux-browser/package.json#L52-L98)、[tsconfig](../../plugins/omnimux-browser/tsconfig.json#L1-L25)）。扩展为 MV3、TypeScript / React 18、Vite / Vitest，Chrome service worker 与 Firefox background scripts 两种载体（[扩展配置](../../plugins/omnimux-browser/extension/package.json#L9-L35)、[Chrome manifest](../../plugins/omnimux-browser/extension/manifest.json#L1-L52)、[Firefox manifest](../../plugins/omnimux-browser/extension/manifest.firefox.json#L1-L72)）。未根据 AGENTS / CLAUDE 角色话术选栈。

### 2.1 真实资产与下载

- [paths.js:18–29](../../plugins/omnimux-assets/src/paths.js#L18-L29)：唯一资产根是当前 `DSH_HOME/omnimux/assets`，账本 `library.json`，文件 `data/files/<assetId>/`。
- [library.js:264–347](../../plugins/omnimux-assets/src/library.js#L264-L347)：实例载入 schema 2 / revision，账本原子临时文件 + rename；只保存 vault-relative 文件路径。[398–419](../../plugins/omnimux-assets/src/library.js#L398-L419)、[528–556](../../plugins/omnimux-assets/src/library.js#L528-L556)：`add()` 先复制实际文件，后入内存、revision 加一、持久化。[223–255](../../plugins/omnimux-assets/src/library.js#L223-L255)：缺失文件默认跳过，故图片专用入口必须额外要求恰好一个实际文件，不允许空资产成功。
- [ingest.js:51–82](../../plugins/omnimux-assets/src/ingest.js#L51-L82)：已有名称去重与磁盘预检（1.5 倍输入 + 500 MiB 余量）。[159–175](../../plugins/omnimux-assets/src/ingest.js#L159-L175)、[211–245](../../plugins/omnimux-assets/src/ingest.js#L211-L245)：复制流、临时文件、rename、失败清理、vault 包含性。`uniqueName()` 仅 basename 与 NUL 清理，不是完整跨平台远程文件名安全策略。
- [cloud-catalog.js:339–455](../../plugins/omnimux-assets/src/cloud-catalog.js#L339-L455)：目录 ID 解析、`source=cloud:<id>` 顺序去重、下载到独占暂存 slice、`library.add()`、缺文件检查与半资产回滚、finally 清理。去重不是同 ID 并发锁；不要误认为已具备强幂等。
- [cloud-catalog.js:474–507](../../plugins/omnimux-assets/src/cloud-catalog.js#L474-L507)：120 秒 / 512 MiB、content-length 检查、整包 `arrayBuffer()` 后再检查、默认 fetch 重定向；该处未做任意 URL 的 DNS/private 网络控制、逐跳控制或真实 MIME 校验。[630–639](../../plugins/omnimux-assets/src/cloud-catalog.js#L630-L639) 优先 URL 后缀选扩展名。**不得原样开放此下载器给网页 URL。** 可复用其入库完成与 slice 清理经验，不能把“已有下载”写成“安全任意下载”。
- [media-fetch.ts:39–81](../../plugins/omnimux-browser/src/media-fetch.ts#L39-L81)、[92–223](../../plugins/omnimux-browser/src/media-fetch.ts#L92-L223)：已有公网 http(s)、拒绝凭据、9 秒总预算、8 MiB 流式读上限、5 跳手动重定向、逐跳先校验、非 2xx / 超时 / 超限独立 outcome。返回 base64，只用于读取，不会资产持久化；也不保证返回的是图片。
- [public-media-transport.ts:22–109](../../plugins/omnimux-browser/src/public-media-transport.ts#L22-L109)、[113–166](../../plugins/omnimux-browser/src/public-media-transport.ts#L113-L166)：DNS 结果审查绑定到真实 socket lookup，不再二次解析；混合公网/私网拒绝；Host/SNI 保留；gzip/deflate/br 解压后计量。这个现成实现必须复用，禁止另造 fetch + 一次 DNS 检查。
- 旁支 [inspiration/downloader.js:252–267](../../plugins/omnimux-inspiration/src/downloader.js#L252-L267)、[347–459](../../plugins/omnimux-inspiration/src/downloader.js#L347-L459) 已有手动重定向、流式文件、60 秒 / 512 MiB、HTML/XML/HLS 拒绝和 temp 清理，[78–99](../../plugins/omnimux-inspiration/src/downloader.js#L78-L99) 有魔数识别。但其默认 fetch 与 [url-policy.js:204–245](../../plugins/omnimux-inspiration/src/url-policy.js#L204-L245) 的预先 DNS 检查是分开的，不能凭注释断言 socket 不会再解析；并且不是公共导出，**不跨插件私有 import**。

### 2.2 revision / list / preview / 页面刷新

- [http-routes.js:373–396](../../plugins/omnimux-assets/src/http-routes.js#L373-L396)：state 根据 lrev / arev 判断 unchanged；[574–615](../../plugins/omnimux-assets/src/http-routes.js#L574-L615)：既有 library list / detail / files / preview / 本地文件 create。
- [library.js:682–710](../../plugins/omnimux-assets/src/library.js#L682-L710)：preview 只解析库中 assetId + fileId，不接受任意路径；[scanner.js:23–50](../../plugins/omnimux-assets/src/scanner.js#L23-L50) MIME 由本地扩展名推导，故入库文件后缀必须与经校验字节一致。[http-routes.js:118–133](../../plugins/omnimux-assets/src/http-routes.js#L118-L133)：nosniff、SVG sandbox、只读 stream。
- [use-assets-feed.js:149–201](../../plugins/omnimux-assets/src/client/use-assets-feed.js#L149-L201)：事件健康时暂停轮询，只等 `omnimux:assets:changed`；不能只增加 lrev 而漏事件，否则资产页可能长期不刷新。新宿主入库 Seam 成功提交后沿用已有 [index.js:391–403](../../plugins/omnimux-assets/src/index.js#L391-L403) 事件协议，重复命中不增加 revision。

### 2.3 扩展入口与现有误报

- 角标 [surfaces/media-trigger.ts:133–162](../../plugins/omnimux-browser/extension/src/content/surfaces/media-trigger.ts#L133-L162)：优先 img，按元素是否 video 判类型；选到 `/video/` 卡片的 img 封面会得到 `type=image`。[447–454](../../plugins/omnimux-browser/extension/src/content/surfaces/media-trigger.ts#L447-L454)：三操作共用 MediaActionBridge，但丢弃 outcome，执行后关闭工具栏，当前没有可靠错误回执 UI。
- 胶囊 [overlay.ts:599–658](../../plugins/omnimux-browser/extension/src/content/media-hover/overlay.ts#L599-L658)：有 busy / saved / tooltip outcome，保存同样调用 MediaActionBridge。[detector.ts:297–340](../../plugins/omnimux-browser/extension/src/content/media-hover/detector.ts#L297-L340)：类型仍从元素判定，creative classifier 是资格判断，不是作品类型判定。
- [actions.ts:196–212](../../plugins/omnimux-browser/extension/src/content/media-hover/actions.ts#L196-L212)：当前保存只拒绝 outer `ok!==true` 或 inner `ok===false`，inner 空对象仍报 saved。[background/index.ts:1787–1812](../../plugins/omnimux-browser/extension/src/background/index.ts#L1787-L1812)：宿主灵感写入 + chrome.storage 并行；任一成功都报成功。[media-library.ts:77–101](../../plugins/omnimux-browser/extension/src/background/media-library.ts#L77-L101) 只是最多 500 条 URL 描述，无媒体字节，不能算资产保存。
- [background/index.ts:1893–1935](../../plugins/omnimux-browser/extension/src/background/index.ts#L1893-L1935)：向候选端口逐个 POST 灵感记录，仅看 HTTP ok，不读最终结果。若某宿主已提交但回执超时，随后可能再投另一宿主；已有目标端口不一定优先（只有不在列表才 unshift）。**图片新路径禁止使用此扫描写入及 storage 兜底。** 视频路径功能保持原语义，此旧逻辑风险单独记录，不在本任务借机改造全部视频流。
- [payload.ts:285–330](../../plugins/omnimux-browser/extension/src/content/media-hover/payload.ts#L285-L330)：video 的 src 可以是 poster / blob / frame / page，不能按 `.jpg` 或 `sourceKind=poster` 反推作品为 image。[actions.ts:28–38](../../plugins/omnimux-browser/extension/src/content/media-hover/actions.ts#L28-L38)、[220–264](../../plugins/omnimux-browser/extension/src/content/media-hover/actions.ts#L220-L264)：复制和加入对话既有源梯级与渠道优先级应保留。

### 2.4 配对、Origin/CORS、宿主选择

- [pairing.ts:152–184](../../plugins/omnimux-browser/src/pairing.ts#L152-L184)：request/status 仅 loopback、拒绝 http(s) 网页 Origin；approval 必须当前宿主准确 loopback Origin。[pairing-routes.ts:166–187](../../plugins/omnimux-browser/src/pairing-routes.ts#L166-L187)：批准 token 单次领取。Origin 不替代 token。
- [server.ts:315–341](../../plugins/omnimux-browser/src/server.ts#L315-L341)：全部连接，包括 loopback，都必须 hello token 验证后才能处理帧；[207–210](../../plugins/omnimux-browser/src/server.ts#L207-L210) 没有 Origin allowlist，认证主依据为 token。代码中“loopback 不要 token”的注释（[index.ts:316–319](../../plugins/omnimux-browser/src/index.ts#L316-L319)）与实现冲突，以实际验证为准。
- [assets/http-routes.js:198–210](../../plugins/omnimux-assets/src/http-routes.js#L198-L210)、[504–510](../../plugins/omnimux-assets/src/http-routes.js#L504-L510)：assets POST 限本地网页 Origin / Sec-Fetch-Site，缺 Origin 可通过，但不验证扩展配对 token。`chrome-extension://...` / `moz-extension://...` 不是 LOCAL_HOST，不能直接把同源资产 POST 当扩展入口；assets `sendJson` / register 中没有扩展 CORS 或 OPTIONS 授权。
- [browser/index.ts:320–335](../../plugins/omnimux-browser/src/index.ts#L320-L335) bridge-config `ACAO=*` 只公布无 token 配置；[inspiration/http-routes.js:116–125](../../plugins/omnimux-inspiration/src/http-routes.js#L116-L125) 灵感接口宽泛 CORS，不能挪来做任意 URL 的资产写安全策略。
- 安装依赖 `@deepseek-ai/dsh-host-webserver@0.1.5-rc.3` 的 lib/index.js:228–244、260–287 实测阅读为直派 HTTP/upgrade handler，并未自动补这两条业务路由的 Origin/CORS 认证。安装依赖证据不属于固定 Git 基线，部署仍需 Chrome/Firefox 实测；不把 Node HTTP 模拟当浏览器 CORS 验收。
- [background/index.ts:135–177](../../plugins/omnimux-browser/extension/src/background/index.ts#L135-L177)：发现过程可能扫描多个端口，并以任一 root HTTP 回应兜底；[1423–1507](../../plugins/omnimux-browser/extension/src/background/index.ts#L1423-L1507)：实际 RPC 使用单活跃 bridge；[1544–1626](../../plugins/omnimux-browser/extension/src/background/index.ts#L1544-L1626)：配对捕获 port 但领取 token 后只存 token，再调用 startBridge；[1647–1653](../../plugins/omnimux-browser/extension/src/background/index.ts#L1647-L1653) 切换端口不清旧 token。图片写入需要“目标地址 + token + 握手代次”绑定，不能只采用 storage 的端口字符串。

## 3. 推荐拓扑与最小 Seams（待主理人确认）

图片保存：角标 / 胶囊 → 同一保存动作路由 → runtime worker → **被明确选择且 hello.ok 的当前本机 bridge** → 图片入库 RPC → 复用 fetchMediaBytes / fetchPublicMedia → 宿主只校验图片 → assets 拥有的写入 Seam → 当前活跃 library → 文件 / ledger / revision / event → 小回执 → 原入口成功态。

视频保存：同一动作路由按作品语义判为视频 → 保留既有灵感路径。复制 / 加入对话不受图片保存持久化结果影响，不换成本地 asset URI，不增下载副作用。

### Seam A：浏览器私有 RPC，建议名称 `omnimux.saveImageAsset`

只挂在既有 token 验证后的 bridge，显式 loopback-only（不能因既有 media read 方法允许远端就扩大磁盘写授权）。遵守既有 `rpc` / `rpc.result` 相关 ID；在 hello caps 可增加一个能力位以区别旧 Host，不根据端口存活猜测支持。处理函数按调用捕获 conn/代次，响应只给该连接，不路由到后来替换的连接。

输入草案：`{ requestId: string, url: string, pageUrl: string, title?: string }`。requestId 是一次明确点击的重试身份；URL 输入长度建议各 <=8192、title <=200、requestId <=128，严格对象及字段类型，无 `path`、`files`、`destDir`、任意 type/tags、cookie、Authorization 或 HTTP header 字段。仅传真实图片 URL，不从视频 poster 自动生成图片请求。

业务 outcome 草案：成功 `{ status: 'saved' | 'duplicate', assetId, fileId, lrev }`；失败 `{ status: 'unavailable' | 'invalid-url' | 'unsupported-image' | 'mime-mismatch' | 'too-large' | 'timeout' | 'http-error' | 'storage-failed' | 'cancelled', statusCode? }`。业务 outcome 随 outer 成功 RPC frame 返回，调用者必须解析明确成功形状和非空 assetId/fileId，不把“worker 应答”或 outer ok 当保存成功。基础设施断连/无配对单独转成可见失败。不得把本机路径、内部网络目标、signed URL 原文、下载字节发回扩展。

### Seam B：资产库拥有的 Host 写入 Interface，建议 `ctx.get('assetLibrary').ingestDownloadedImage(...)`

只有当前 assets 插件实例提供，内部请求含经校验的 `bytes: Uint8Array`、确定的 `mime`、清理后的展示名称、`sourceKey`、有限来源说明。不暴露为外部任意 bytes 上传 API。browser 不 import assets 私有实现。assets 未装载 / 未提供时返回 unavailable，不在 browser 创建第二套 store 或回退写新路径。

assets 接收后：同 sourceKey 互斥 → 复核现有完整文件资产 → 复用磁盘预检（把实际下载字节与暂存/复制双份开销计入）→ 在**现有资产根内部**新建本次私有暂存 slice（0700 / 文件0600）→ 调用同实例 `library.add()`（custom、真实图片文件、`source=browser-image:<sha256>`）→ 验证实际 file 数为一且 preview 可解析、size>0 → 账本提交 → emit assets changed → 返回 ID / lrev → finally 仅清本次 slice。库内最终路径仍是 `data/files/<assetId>/`。这是临时 stage，不是新资产库，绝不使用 committed cloud-catalog/.staging 来存浏览器用户文件。常规失败/成功 finally 清理，崩溃残留由该 Seam 启动时只扫自己命名的过期 slice；沿用云端的独占 slice / live slice 不删原则，路径不可由调用者指定，拒绝 symlink 逃逸，不清整个资产根。

现有 add 对缺路径静默跳过；专用入口必须 fail-closed。持久化失败时现有 add 的内存已 push / revision 已加且文件可能已复制，因此实施需在 LibraryStore 所属 Module 给这条提交路径补失败一致性（撤掉本次内存变更与未引用文件、保留旧 ledger，不误删用户/别人的文件）；不能只用 add 外层 catch 报错误而留下可列表的幽灵资产。不要凭 remove() 再次 persist 必定成功作保证。可采用对 add 的小型事务修正，不拓展成全仓存储重构。

### 校验与幂等细节

- 网络复用 `fetchMediaBytes` 的公网 http(s)、五跳、8 MiB、9 秒默认，不上调到 cloud 的 512 MiB / 120 秒。不转发登录 cookie/Referer/Authorization，不自动重试；签名 query 保留给下载器但不回显。
- URL 初始、每跳、真实 socket DNS 都必须走既有防护。重定向 hop 的 body 应关闭；内容压缩按解压字节上限。新增调用取消应通过现有下载 Module 的 optional signal 接入 conn.abort，保持总预算不重置，不能在调用层重写一套下载器。
- MIME 不能只看 URL 后缀。复用 Host `attachments.validateImage()` 的**只校验、不保存**能力（已读 rc.3 类型合同 index.d.ts:21–27：完整 raster decode 后完成；实现 admission 见 lib/index.js:195–210）。明确检查 host `imageLimits.mediaTypes`，将规范化 content-type 映射成 raster MIME，再由 validateImage 拒绝类型不符、损坏及像素/尺寸超限。初版建议 JPEG/PNG/WebP/GIF 与实际宿主支持交集；SVG/HTML/XML/HEIC/未知类型不入库。缺失/`octet-stream` 是否采用公开魔数检测需正式规格明确；最小方案明确拒绝，而非凭 `.jpg` 放过。
- 不调用 attachments.saveImage 保存第二份或用 attachment 成功替代 library 成功；借用只校验 Interface，最终仍归资产库。宿主没有 validateImage 则报 unavailable，不能降格为仅 header 检查。运行时具体 adapter / 图像能力需 T1 composition 验证。
- 文件名由 Host 生成为 `image-<摘要>.<校验mime对应后缀>`；页面 title 只用于 <=40 字展示名，清理 `/\\`、全部控制字符、点路径、Windows 保留名与尾空格/点；远端 Content-Disposition / URL basename 不驱动落盘路径。不利用 uniqueName 的有限清理冒充全校验。
- sourceKey 建议 SHA256(规范 URL，删除 fragment，保留 query)。同 URL 两入口/多标签/重连均指向同一库条目；requestId 与同 key 的 in-flight Map 合并并发，持久去重使用**既有 source 字段**，不新建 dedupe DB。已有 asset 文件丢失不得返回 duplicate 成功；允许专用修复路径重新下载，不误报“已保存”。
- 回执丢失属于“结果未确认”，UI 不标 saved，不自动改投其他 Host；用户重试相同 host/sourceKey 命中完整 asset 即可恢复。成功回执必须在持久化之后发送。断连前未提交可取消，提交后不要因为回执掉线把真实文件撤掉。
- requestId/sourceKey 的串行锁由 assets 单实例持有，跨 Host 不协调。现有 LibraryStore 没有跨进程文件锁；两个进程共享同 DSH_HOME 同时写仍是既有风险，不声称全局 exactly-once。若部署允许共享 home，需另行 storage-owner 方案批准，不能默认在本任务加新数据库。

### 目标实例纪律

配对领取 token 时一并保存本次 port 的完整 bridgeUrl，不在随后 startBridge 重新扫描选另一个 Host。扩展图像写必须由一个明确选中的本机目标及已验证 token/hello 代次承载；若当前 URL 源于自动发现且目标尚未确认，用既有实例选择/配对入口要求确认，不靠“第一个存活”取得写授权。切换实例使旧保存代次失效，新目标需握手/配对；设置修改期间不重投原请求。无 bridge、旧 Host、错误 token、assets 不存在均失败，不扫描多个 Host POST、不发灵感请求、不写 dshMediaInspiration 兜底。只影响图片写路径，发现列表仍可正常用于只读选择。

## 4. 作品语义与不变的操作

保存操作增加独立的 `resolveSaveIntent(payload, evidence)`，输出 image-asset / video-inspiration / unknown；不要为了保存修改通用 payload.src/type 使复制或对话附件改变。证据可用既有资格 classifier 和作品容器，但它们不等于类型。

优先已识别的作品链接/平台结构：TikTok `/video/` 为 video，即使里面只有 img；`/photo/` 与明确照片容器为 image。X 限当前媒体 container 的 videoComponent/videoPlayer，而不是整篇 tweet 是否含视频（混合图文不可把独立照片全归为视频）；通用站点限当前媒体所属作品卡片的 `<video>` / 明确播放器结构。随后才采用真实 `<video>`，无视频证据的独立 `<img>` 为 image。冲突/不确定不猜图像下载，呈现可见不可用，不自动收藏封面。Host MIME 验证只能确认下载字节是图片，**不能判断这个 jpg 是否为视频封面**，语义门禁必须在两入口共用的保存路由前完成。

仅变第一操作的图片文案/状态（具体字面由主理人/PM 锁定）：图片表达保存到资产库，视频维持加入灵感库；三个 icon slots、几何、copy/attach 功能不增不减。角标必须像胶囊一样消费同一 ActionOutcome，busy 防二次点击、失败可见，不执行后立即关闭而吞错误；不新增装饰 badge/tagline/来源小卡。[design.md](../../design.md#L18-L55) 保持现有 tokens、矢量图标与几何；本任务**不需要改 design.md**，前端负责人实施前衔接既有规范，若新增视觉状态超过已有规范由主理人另确认。

## 5. 最小可独立验证的垂直薄片草案

此处是票草案，非已发布票。行为段不携带具体文件路径；路径见下一节。主理人将正式技术规格另写并确认 Seams 后才批准/发布。

### V1 — 从胶囊保存一张图片，在目标宿主资产库可读回

**Blocked by：无（前提是主理人批准技术规格与 Seams）。**

要交付的行为：明确配对目标上，用户从胶囊对一张公网真实图片保存；安全下载、图像校验、真实文件与账本提交、资产页刷新后显示且可预览；未配对/私网/非图片/磁盘失败均不报成功；视频仍旧动作，复制与加入对话不变。

验收：真文件、账本相对路径、重建 store 后仍可列与预览；错误 token / 普通网页不能触发新写；相同 URL 的串行及并发重试只得一资产；假图片、损坏文件、大小、跳转、超时受限；成功发事件，失败无空记录或 stage 遗留。

票内分工：寇豆码负责 RPC、下载复用、Host 校验 Adapter、assets 写入 Seam/失败一致性及测试；裴像素负责胶囊保存路由、图片文案、配对目标绑定与可见回执，执行专属场景浏览器验收。此票完整穿过扩展、认证、下载、持久化和显示，不拆成“后端票 / 前端票”。

### V2 — 角标使用同一真实保存路径，视频封面不入图片库

**Blocked by：V1。**

要交付的行为：作品角标图片保存与胶囊共用已验证能力；两处识别 TikTok /video/ 的 img 封面、X 播放器 poster 为视频，仍加入灵感库；真正图片（包括 /photo/ 与混合帖子里的独立图）进资产库。角标与胶囊都展示准确 busy / saved / failed。

验收：相同图先角标后胶囊以及相反顺序不增重复资产；两个入口都不能把视频封面下载成图片；图片 src 不被预览地址或 pageUrl 替代；copy/attach 回归原地址与原渠道行为。

票内分工：裴像素负责共享保存语义判定、角标状态/可见回执、当前 payload 快照与异步代次隔离；寇豆码核对相同源去重和字段校验并支持集成测试。

### V3 — Chrome / Firefox 双实例与故障恢复的真实闭环

**Blocked by：V1、V2。**

要交付的行为：两种浏览器在同时运行的两个 Host 中，只写已配对选择的那个；保存过程中切实例、worker 回收、断连、回执超时后重试均不误投/不重复；文件落地后断开公网仍可在资产页预览，重建 Host store 仍存在。

验收：实际扩展运行（不是 DOM harness）两入口专属截图 + 两 Host 文件/ledger/revision 差异 + preview 字节校验；错误回执与未确认态不显示 saved；另一 Host 的 lrev 不变。安全下载 DNS/重定向测试必须保留“不拨私网”的记录，不借真实恶意地址做破坏性探测。没有 Firefox 实测环境则明确缺项，不以构建通过代替。

票内分工：裴像素负责两个真实浏览器点击/文案/禁用/截图；寇豆码负责两个隔离 home 的宿主 fixture、网络/存储故障注入与 durable readback。端到端验证属于该票的可演示行为，而非单独“QA 水平票”。

拓扑：V1 → V2；V1 + V2 → V3。不把全仓 downloader 统一或所有视频收藏迁移塞入这些票。

## 6. 票外文件规划（建议，尚未修改）

- browser Host：`plugins/omnimux-browser/src/protocol.ts`、`server.ts`、`index.ts`；建议新增 `image-assets.ts` 作为下载/Host 图片校验到 assets Seam 的 Adapter；现有 `media-fetch.ts` 仅按需增加 optional signal，不复制 private IP/redirect 策略。
- assets：`plugins/omnimux-assets/src/index.js` 提供同实例窄 Seam 与既有事件；建议 `image-ingest.js` 管理 stage / source 幂等 / 完整性；`library.js` 对新提交的失败一致性做小幅修正，复用 `ingest.js` / `paths.js`。不新增公网 HTTP 写路由；不改 cloud catalog 数据或云目录存储路径。
- extension：`src/background/index.ts`、`src/background/rpc.ts`（仅必要的代次/cancellation 与明确回执）、`src/content/media-hover/actions.ts` / `copy.ts`、`overlay.ts`、`capsule.ts`、`src/content/surfaces/media-trigger.ts`；建议共享保存语义 `src/content/media-hover/save-intent.ts`。保留原 copy/attach shape，不改 sidebar App 的其它保存入口。
- Tests：同 plugin 原测试目录内增加新画像入库与 composition 测试；沿用 `.spec.ts` / `.test.js` 命名。`design.md` 只读取/复用，无计划修改。需要新增 Cordis 服务类型时在 browser 内声明结构型窄 Interface，不导入 assets 私有源码；不添加新框架/库。
- 架构门禁：[scripts/verify-plugin-boundaries.mjs:77–95](../../scripts/verify-plugin-boundaries.mjs#L77-L95) 已拒绝跨插件私有 src/lib import。方案通过 Host Seam 互调，而不是拼接相对路径调用现有内部函数。

## 7. 测试接缝、建议命令与本轮实际验证

### 既有接缝

- 持久化：[library.test.js:24–31](../../plugins/omnimux-assets/src/library.test.js#L24-L31) 注入独立 paths；[71–92](../../plugins/omnimux-assets/src/library.test.js#L71-L92) 已证 managed copy 不依赖原文件。扩展新增重建 store、零文件拒绝、persist 失败恢复与 stage cleanup 测试。
- 完整性与并发 stage：[cloud-catalog.test.js:737–895](../../plugins/omnimux-assets/src/cloud-catalog.test.js#L737-L895) 有并发保留他人 slice / 失踪文件 / 半资产回滚范式。借鉴行为，不直接调用 cloud 目录身份。
- 网络：[media-fetch.spec.ts:156–347](../../plugins/omnimux-browser/tests/media-fetch.spec.ts#L156-L347) injected fetch / body；[public-media-transport.spec.ts:11–31](../../plugins/omnimux-browser/tests/public-media-transport.spec.ts#L11-L31) DNS 混合与连接使用 exact checked addresses；[public-media-request.spec.ts:35–79](../../plugins/omnimux-browser/tests/public-media-request.spec.ts#L35-L79) production transport gzip/deflate/br、decoded cap、上游取消、fresh socket。
- UI 动作：[media-actions.spec.ts:37–88](../../plugins/omnimux-browser/extension/tests/media-actions.spec.ts#L37-L88) ActionTransport；[120–189](../../plugins/omnimux-browser/extension/tests/media-actions.spec.ts#L120-L189) 原 copy/attach 保留回归。新增真实成功回执白名单，不再用 `result:{}` 表示保存；[media-trigger.spec.ts:30–35](../../plugins/omnimux-browser/extension/tests/media-trigger.spec.ts#L30-L35) 已有 video 链接 + img 封面的负样本 DOM，但尚未测保存语义。
- 配对/composition：[composition.spec.ts:116–177](../../plugins/omnimux-browser/tests/composition.spec.ts#L116-L177) 真实 Cordis Loader / webServer；[183–202](../../plugins/omnimux-browser/tests/composition.spec.ts#L183-L202) 带扩展 Origin 的真实 ws。组合 assets 真 store + 图片校验 Adapter，验证 singleton 与 mounted-later/unavailable。
- E2E 局限：[bridge-extension.e2e.spec.ts:19–35](../../plugins/omnimux-browser/tests/e2e/bridge-extension.e2e.spec.ts#L19-L35)、[53–55](../../plugins/omnimux-browser/tests/e2e/bridge-extension.e2e.spec.ts#L53-L55) 旧 extension dist 路径、无 Chromium/产物时跳过；不直接把现有 smoke green 当本功能通过，需使用本工作树扩展产物，禁止静默 skip。
- [media-inspiration-attach-closure.spec.ts:29–63](../../plugins/omnimux-browser/extension/tests/media-inspiration-attach-closure.spec.ts#L29-L63) 在测试内手写 fetch/body，没有驱动实际 background handler；不能作为真入资产库的证据。

### 建议验收命令（实施后运行，不代表本轮全已执行）

工作树根执行：`node --test plugins/omnimux-assets/src/library.test.js plugins/omnimux-assets/src/cloud-catalog.test.js plugins/omnimux-assets/src/http-routes.test.js`；新增 image-ingest 测试须加入同一命令。

browser 目录执行：`node node_modules/vitest/vitest.mjs run tests/media-fetch.spec.ts tests/public-media-transport.spec.ts tests/public-media-request.spec.ts tests/pairing.spec.ts tests/composition.spec.ts`，增加新 image-assets / RPC tests；`node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --tsBuildInfoFile /明确测试临时目录/browser.tsbuildinfo`（tsconfig 是 composite，不禁用 incremental；验收阶段授权后也可使用 package 的 build:server）。

extension 目录执行：`node ../node_modules/vitest/vitest.mjs run tests/media-actions.spec.ts tests/media-trigger.spec.ts tests/media-library.spec.ts tests/background-bridge-lifecycle.spec.ts`，增加共享语义、background save handler 与两 Host/worker 回收测试；`node ../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`；实施授权后 `node scripts/build.mjs` 及 `node scripts/build.mjs --firefox`。

工作树根：`node scripts/verify-plugin-boundaries.mjs`；最后检查 `git -C "$WT" diff --check`。所有命令显式 workdir，Git 显式 `-C`。日志须保留真实退出码，不用 tail 管道掩盖失败。先确认依赖已准备；**只读调查不要用 pnpm exec 的自动安装路径**。

### 本轮实际结果与环境副作用

- 基线 HEAD = 给定 base；起始 `git status --short` 为空。
- Node v25.8.0：资产 `library/cloud-catalog/http-routes` 定向测试 **116 passed / 0 failed**。
- 直接调用已安装 Vitest：Host 安全下载三文件 **74 passed / 0 failed**；extension media-actions / media-trigger / media-library 三文件 **39 passed / 0 failed**。这些是既有行为测试，不是新需求验收。
- 一次 `corepack pnpm --dir plugins/omnimux-browser exec vitest ...` 触发 pnpm 自动安装/prepare，已取消；七个 market 的 tracked lib/expert 自动生成差异已仅按精确文件恢复到 HEAD。未编辑业务源码；ignored node_modules / build 产物曾被物化，不宣称零文件系统写入。最终检查需继续确认无 tracked lib 差异。另一次根仓 Vitest 入口尝试因 MODULE_NOT_FOUND 失败，后使用已发现的工作树安装入口运行上述测试成功。
- 最终 `git diff --check` 通过，`git diff --name-only -- plugins packages` 为空，tracked 业务源码与生成文件没有本岗残留差异。调查期间另出现协作方的 `CONTEXT.md` 修改、`docs/product/browser-image-assets/` 及 `specs/browser-image-assets.spec.md`，未创建/改写/还原这些并发产物。本岗正式交付仅本 notes；不提交、不发布技术 spec / Issue / PR、不重启应用、不做实际用户资产写入。

## 8. 不可避免权衡、未知项与不覆盖事项

1. **bridge RPC vs HTTP URL 入库**：选已配对 bridge 避免新增 Origin/CORS/Authorization/OPTIONS 的宽权限写路由；代价是需要活跃明确目标和 Host 能力，未连接就保存失败。HTTP 备选只有在需求明确要脱离 bridge 时才考虑，必须完整 token + 精确扩展 Origin + loopback + bounded body 契约，不能放宽现有 assertLocalWrite 或假装 extension fetch 没有 Origin。
2. **8 MiB / 9 秒 vs 更多图片兼容性**：沿用现成下载限制使 RPC 30 秒预算内可完成，限制大图和慢 CDN；返回明确超限/超时，不自动降清晰度、不引用 URL 伪装存下字节。若需加大，须单独确认完整内存/校验/RPC deadline 预算。
3. **只校验 Host attachment vs 扩展 MIME 猜测**：复用 `validateImage` 避免重复图像解码与安全规则，不创建第二套持久化；代价是依赖实际 deployment 的 raster 类型/像素预算，无 Adapter 就显式不可用。实际图像 adapter 的业务运行接入尚未 composition / 真机核验。
4. **精确 URL 幂等 vs 内容去重**：保留 signed query 不误改请求，但同一图片不同签名 URL 可能形成两资产；首版不引入全球内容寻址/新库。请求 sourceKey 可持久去重，无重新下载验证的 duplicate 只代表先前保存的完整文件，不保证远端 URL 内容永不变化。
5. **fake-IP 代理兼容性**：现有 publicLookup 明确允许 DNS 给出的 reserved 地址（如 198.18/15），却拒绝 URL 直接指定此地址（源码 88–109、测试 42–73）；这是现成代理兼容策略，不应写成“所有非公网 DNS 均拒绝”。严格拒绝 reserved DNS 会破坏该机器公开 CDN 下载；是否继续允许其代理模式需主理人作为安全权衡锁定，私网/loopback/mixed answers 必须仍拒绝。
6. **本任务不改视频存储产品语义**：旧视频灵感路径的广泛 CORS、扫描重投、local-only success 是观察到的相邻风险。本需求只禁止图片误走该路径，不顺手发布视频重构；必要时另开经批准的任务。

未知/待验证：Chrome 与 Firefox 真 Origin、token 握手与目标切换实际执行；assets service 的 mounted-later/HMR singleton；Host `validateImage` 是否覆盖目标图片格式；新图片事务掉电恢复；真实页面作品 DOM 演变。只能靠指定 composition + 双浏览器专属路径 + durable readback 收敛，当前不能断言实现已成功。

不覆盖：历史本地收藏自动迁移、登录站点 cookie 带出、blob/data 图片转码、视频下载与灵感库全面安全改造、公共云目录数据变更、资产框架全仓统一、多进程 shared-home 锁、正式技术规格/Issue/PR 发布及生产部署。
