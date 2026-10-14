# #3311 参考素材自有云存储

## 目标与已确认范围

用户选择直接实施：配置一次，在生成需要在线参考素材时自动上传，确认可读后提交；不做本地搬迁、项目同步或备份。默认关闭不改变旧流程。开启后用户云失败不改用官方云、不发生成请求。

## 成功标准

- 官方设置现有 OmniMux 席位内独立“参考素材云存储”区域：开关、S3兼容上传地址、桶、区域、公网根地址、访问标识与秘密输入；保存明确生效，读回仅配置状态。
- 非敏感字段以单一 referenceStorage 对象存入官方settings。两项访问值均在官方credentials，普通settings只有引用。更新凭据使用新引用成对暂存，成功配置提交后使用新引用，失败清理仅本次创建的引用，旧配置不受影响。留空保持旧值，不能变更一半的凭据。
- 所有已调查的 image/video统一执行入口的新提交在参数准入和幂等短路之后准备素材；runtime/自备渠道不漏过。原生供应商文件上传型渠道（如ComfyUI）无需公网引用，不重复上传用户云；保证这类提交不会误拿启用开关当禁用能力。
- 本地图片/视频/音频参考用现有source descriptor与payload字段扫描。公共已有URL不重新上传。新增上传只使用经用户配置的HTTPS公网目标；禁止认证URL/查询/片段和私网；实际连接DNS检查/固定目标，拒绝重定向，避免签名泄漏。
- 流式摘要与PUT，内容摘要命名、正确Content-Type；匿名读取检查响应类型与字节摘要（优先全流比对，限制大小/时间），校验后才允许生成。不缓存校验结论跨任务，无需额外持久对象仓；同次重复素材可共用准备Promise，每次操作解析当前凭据，配置快照固定。不开自动清理或链接短时失效。
- 已接受任务恢复与相同requestKey查重不重新上传、不再次付费提交。设置切换只作用后续准备。
- 真实云互通/费用及真实生成未获授权，本次用合成媒体/凭据与HTTP替身测试。

## 新用户基线

仅已安装中枢、官方settings/credentials和现有媒体服务。未启用保持现状；启用但缺字段/凭据/不可用明确报错，不读开发profile或跨profile凭据。默认没有本地S3服务或开发地址。

## 结构与复用

plugins/omnimux/src/reference-storage/{config,http,upload,public-http}.js 与相邻测试（最小按必要分割）；设置schema接非敏感对象；host/http挂精确认证路由；execute统一上传接入；现有gateway-upload提取通用payload扫描回调，默认路径不变。客户端在现有ModelsSettingsCard加入ReferenceStorageSection，控件复用dsh-ui-kit与现有官方tokens，无独立页面壳。

## 风格

JS ESM，关键边界JSDoc类型、错误使用固定中文与机器码，不暴露URL认证/秘密/原始S3响应。采用现有HTTP requestRejection、body读取与settings修订约束，不复制localhost-only权限策略。维护中的AWS官方SigV4签名包按锁定依赖引入，不手写签名算法，不自动发现机器AWS凭据。

## 命令与测试策略

测试runner为node:test。先写行为测试取得RED，再最小代码GREEN，保留阶段证据。节点：配置合法与秘密拒绝/原子提交/修订冲突；HTTP认证优先；上传流、私网DNS、重定向、HTML/错误字节、取消；统一生成pipeline图片/视频/runtime分支，失败零提交；恢复不重传。针对新增模块覆盖至少80%，不以全仓覆盖稀释。

执行：node --test plugins/omnimux/src/reference-storage/*.test.js 与必要集成测试；node plugins/omnimux/scripts/run-tests.mjs；node scripts/verify-plugin-boundaries.mjs；node scripts/verify-product-baseline.mjs；node scripts/verify-stage-contracts.mjs；node --test scripts/verify-anti-slop.test.mjs；实际inject触及则node scripts/verify-plugin-load.mjs和node --test scripts/verify-plugin-load.test.mjs；git diff --check。使用impact-matrix按实际diff选择剩余必要验证，不跑全仓。

## 界面与文档

现有设置是方向，截图仅业务字段参考。BeefTV 将用途、计费和字段同页；AWS云存储把连接端点与公开读取地址区分；Cloudflare存储区分访问凭据和公开域名，采用这些可发现的信息分组，不复制视觉壳。视觉：官方中性背景与紧凑表单；内容：用途/状态、开关、连接字段、凭据状态、保存反馈；交互：明确保存、失败原表单保留、忙时避免重复提交，控件已有焦点反馈。单一CSS策略为本仓现有styles字符串与官方变量。宽屏双列窄屏单列，不添加动效。

文档更新中枢/设置合同对应功能，明确公開读取、云费用、不会同步/备份/自动删对象，以及未完成真实云供应商验收。

## 边界与门禁

总是：隔离worktree、范围内测试、真实浏览器功能证据、独立安全审查与MQ。绝不：用户真实凭据引导/读取、真实云写入、付费生成、Prod发布、改官方DSH/桌面壳、改本地素材位置或自动删用户对象。仅成本/权限/不可逆范围扩大才问用户，不逐阶段要确认。

## 浏览器验收已知风险

当前test-env-bootstrap的ui模式会读取Dev设置/profile并软链/复制业务数据，与现行文档矛盾。不得直接运行该路径。优先核对同仓已进行安全bootstrap任务的修复证据与合入状态；未满足前用有明确合成HOME与任务profile的隔离完整应用路径，并取得正式插件装配身份。不能用组件夹具冒充完整应用。相关验收动作阻断时继续单元/集成工作。

## 第一轮接入核定（只读证据，未写业务）

- 当前实际mapOmnimuxInput在存在guardPlan.vendorPayload时直接复制这份已映射载荷（vendors/omnimux.js:374-375）。优先对已经核准且实际发送的mappedInput做限定字段转换，避免二次运行完整准入或改guard历史身份；转换同时覆盖references[].pathOrUrl、audioTrack.pathOrUrl和已知图片/视频/音频URL字段。不递归替换任意文本，不上传prompt/link_url，不改变media metadata里的非素材值。这样官方payload与BYOK保留references都不漏，runtime取得同一finalInput。
- 用户自有存储启用优先于shouldHost，显式uploadLocalAssets:false和注入runtime不能跳过需要在线链接的参考准备；原生文件上传分支无需公网传递，保持既有文件交付，测试明确例外。音频生成输出不在本次范围，图片/视频的驱动音频属于参考素材。
- 依赖候选均已存在当前lockfile：@smithy/signature-v4 5.7.4（AWS维护，Apache-2.0）、@aws-crypto/sha256-js 5.2.0、ipaddr.js 2.5.0。实施在hub声明直接依赖并更新锁文件，不依赖偶然的传递安装路径，不采用完整S3客户端的机器凭据发现。SignatureV4.sign(request)签已知内容摘要，实际TLS连接由新窄传输负责，DNS公网校验与连接地址固定同时完成；节点ipaddr仅接受unicast公网，拒绝IPv4映射/保留/私网。
- 公开读取必须无Authorization/Cookie；流式读到EOF核对大小与SHA256，拒绝HTML/XML、不匹配媒体类型、不匹配摘要、超量、跳转和取消；并非只读前512字节。每次任务准备重新验证，避免过期缓存承诺。PUT失败不自动换端点/官方云，PUT成功读失败仍可能保留用户桶副本，UI明确该事实，不擅自删除。
- 配置保存只用严格认证聚合HTTP：GET返回非敏感配置、settings revision与credentials describe状态；PUT校验expectedRevision，对凭据成对替换生成新引用，非敏感配置提交是生效点。新引用以随机凭据身份隔离，在失败清理时绝不删除旧引用；如果设置写入抛错后无法证明是否提交，重新读取身份，无法判定则保留新引用并明确失败，不删除可能已激活的凭据。并行写冲突返回409，页面不显示假成功。
- 包签名官方网页读取被URL解析安全策略拒绝，未换curl绕过；已读取安装候选包的package.json与dist-types/SignatureV4.d.ts验证签名及许可，正式依赖声明仍待测试门禁修复后RED/GREEN。

## 可直接执行的验收用例清单

### 配置保存

1. 默认未配置返回enabled=false；查询状态不触发DNS、云请求、生成或磁盘扫描。
2. 未授权/外源/同域不同端口请求在读body/访问settings/credentials前拒绝；缺connection为503。
3. PUT需要页面读取的expectedRevision，不自动重试覆盖新设置；配置未知字段、错误类型、含认证/查询/片段URL、私网/保留地址、非法桶名拒绝。enabled=false也不允许把秘密嵌进普通对象。
4. UI公共字段为enabled、endpoint、bucket、region、publicBaseUrl；credentialId由服务创建且只允许指定固定命名的随机标识，用户不能填写任意凭据引用。公开读取不回access标识或secret；响应no-store。
5. 凭据输入两项都空则沿用；只替换一项拒绝；两项填写才暂存新pair。secret不trim改变其真实字节，拒绝控制字符/越长；访问标识按服务约束校验，不记录原值。凭据服务缺失/只读明确失败。
6. 新pair第二步写失败，清理仅本次第一步；settings更新失败且确认未提交则清理新pair；settings实际已提交但答复丢失/读取不确定不能删活跃pair，返回明确状态未知，页面重读确认。
7. 保存成功后next调用重读新配置/解析新pair；应用重启恢复公开设置而不是客户端localStorage。轮换不删除进行中请求仍使用的旧pair，本期不做凭据垃圾自动清理。

### 上传与取料

8. 普通文件、data URI与受管本地链接都受字节上限。默认保守50MiB图片、200MiB视频、50MiB参考音频，或复用已核准渠道更严限制；读取途中实际字节超限失败，不能只信stat/Content-Length。无需在线引用的纯文本任务不要求云凭据。
9. 上传输入取同一稳定内容：物理文件流摘要前后核验stat/version，防摘要后被修改；无法提供一致快照则停止，不发生成。对象键固定私有前缀+内容摘要+可识别扩展，不用用户原文件名、绝对路径或prompt构建键。
10. 签名服务固定s3、显式region、显式pair；path-style端点/桶/对象键，公开根已代表桶根不再加桶名。签名只发送给已配置HTTPS端点，不随跳转传递；匿名读取使用独立无凭据请求。
11. DNS所有地址均须公网unicast；连接使用本轮核验地址固定lookup，TLS仍核验原域名。IPv6字面、映射、CGNAT、私网、链路本地、保留/组播均拒绝，DNS无结果/错误不能容错为allow。不会借系统代理绕DNS策略。
12. PUT成功后GET匿名流核验MIME、完整大小、SHA256；200正确才通过。403、3xx、HTML/XML、不同内容、短读/超长、超时与取消都零生成提交。测试使用函数替身或明确私有临时HTTPS合成服务，不请求公共真实桶。
13. 已有公共URL不镜像到用户桶，但本次实际参考必须验证可匿名读取合法媒体；原素材准入已检查真实字节，若读取时发生变化应拒绝或按本次一致素材核定，不把缓存旧状态当通过。带签名查询URL仅作为已有素材输入，不作为用户endpoint/publicBaseUrl；验证错误不回显含签名URL。
14. 同任务重复来源共用准备，多个不同来源顺序/受限并发，不按无限Promise.all同时缓冲；取消传播hash/PUT/GET，任务锁finally释放。没有跨任务校验成功缓存，因此配置轮换不会复用旧链接。

### 生成与界面

15. 主统一执行图片/视频+驱动音频：官方guard已通过才写用户云；BYOK/runtime采用同一准备结果；关闭时维持原行为。上传失败调用计数为零，包括旧官方上传和生成POST。原生文件上传分支保持原交付，不用云开关改能力。
16. 已accepted taskRef/taskId与requestKey查重在新准备前返回；删原素材/停用存储/移除新凭据后仍能按旧任务句柄收取，不重传或再提交。
17. 设置存储保存不能改变runtimeMode/聊天模型/生成渠道；以更新patch仅含referenceStorage断言原设置字段不变。
18. 浏览器：进入现有官方设置位置、填写合成数据、保存、确认密码已清空，重新打开公共配置仍在、仅显示凭据已配置。错误保存表单仍保留且无成功提示；双击保存不发重复PUT；窄屏无横向溢出、暗浅主题输入可读、键盘可操作。

## 计划与串行写入

本次主代理唯一代码写入者；独立并行子代理仅读审计报告。先配置/HTTP安全闭环，再上传与失败阻断，再客户端/整体验证；最后独立审查、required CI/MQ、Dev物化与保留证据后清理。Issue 3311，base 38d95d6a77920eb157c5546f8e961a59c1179bc4。
