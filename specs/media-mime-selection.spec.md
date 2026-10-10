# #3278 媒体素材选择不得冒认未知格式

## 目标、前置和实际旅程
父#3247/#3250用户2026-10-08已批准实施范围中“输入框统一MIME摄入”；前片#3276/PR3277正式合入。任务树`.worktrees/viewer-mime-selection-3278`、branch `agent/viewer-mime-selection-3278-issue-3278`，base `b3dcfcfb404e9442e89e732354268cc8cae007a1`。此片只修当前查看器媒体输入面板选择素材时把格式未知冒认为JPEG/MP4/MPEG，不迁移执行、不调整当前正式资格或模型列表；不解除#3244图片配对依赖。
用户在真实媒体页编辑说明、保留已有参考素材→打开选择参考→选择格式不明素材→收到具体说明、原草稿及原素材不变、选择面板可继续操作→选择明确格式合法素材成功入槽。拒绝选择不触发生成、上传或任务写入；旧编辑/延长/数字人及已有taskRef续取保持。
新用户基线仅正式打包Hub/viewer、当前模型目录及既有资产库路径；无本机端口/账号状态/别名/私有模型服务回退。此片不改变旧目录fallback但不能借其声明证明实际可用；待迁移后层保持母任务未完成。

## 唯一归属、已证问题与复用
实际界面模块为plugins/omnimux-viewer/src/media-viewer/MediaViewerComposer.jsx，不是旧Hubsrc/client/media。现handleSelectAsset先inferMimeType，后662–665用asset.type或目标slot类型替未知补常见MIME，会让`{type:'image',url:'https://example.invalid/opaque',title:'未知格式'}`经严格JPEG白名单成功入槽。slot.type不证明素材格式。
唯一格式读取复用现media-slot.js的inferMimeType；现rejectionOf负责类型/MIME/大小/时长/组规则，不新增第二套格式匹配器或扩展表。真实服务端asset-probe从字节重测的信任边界不改；客户端文件名/声明只为摄入候选提示，不构成真实生成资格。
最小业务写集仅MediaViewerComposer.jsx的未知分支：无法取得具体MIME时明确“当前素材格式不明，请换用带格式信息的文件”，返回false，不能按槽/大类造格式；不操作bucket/草稿/picker关闭或生成。已知分支保持现pseudoFile包装、duration/size/容量/groupLock及原asset原样。

## 成功标准
AC1 三媒体大类和缺type、opaque无扩展URL/无真实filetype、泛MIMEimage/等输入，仅在现inferMimeType最终返回空时适用未知拒绝；在与目标类型匹配的合法槽不得伪造image/jpeg/video/mp4/audio/mpeg。返回false并显示上述具体文案，原选择集合/引用顺序/草稿文本不变、supplier/submission/upload零；泛声明仍有可推断dataURL/扩展时沿已知分支。
AC2 已知是现helper认可的声明/推断，并非字节真值：file.type优先mime/mimeType/type，dataURL及URL扩展沿旧顺序；非blob非空URL优先于顶层name/title，opaque URL不借名字补值；无URL/blob才用顶层name/title。真实picker会把file.name复制到顶层name，file.type空且顶层name=sample.png可推PNG，单有file.name不承诺。pseudoFile保非空file.type不改写，image/*非空沿旧类型/白名单判断，poster.jpg不因type:video改认MP4。大小/时长/格式均不字节探测。
AC3 已知但与现allowedMimes不符沿原rejectionOf拒；已知合法格式仍受原size/duration/max/groupLock，大小/时长未知原语义不另扩大。本片不能借格式修复弱化媒体大小/时长或操作用途。
AC4 用户原草稿字节、已有bucket的顺序、角色、身份、URL和meta拒绝前后相等；reject后可正常选择known素材，并明确只有被允许的素材新增。拒绝不从其它槽移出/释放已共用URL。
AC5 除下方唯一受审旧源码oracle修正外，所有旧测试全文/预期/名称/输入不改；新增生产组件行为测试不复制handleSelectAsset、不以regex证明行为，用实际组件bundle+真实React DOM操作生产Picker/native input，观察notice/素材/草稿与零提交。旧composer测试1719–1730明确强制未知safeSubtype，与本片新行为相冲突；不能在unknown早guard后保留永不需要的fallback计算骗旧源码断言。该唯一it允许名称改为“未知格式不冒认为受支持子类型”、保原禁止裸${inferredType}/断言，原两项要求fallback字符串的断言替换为禁止safeSubtype声明/要求fileType仅exactMime源码约束；不能删除整个it或其它断言，不更改其余测试。另以新增真实组件unknown拒绝/known摄入行为作主要oracle，独立审定此精确例外后才编辑旧it，保存原整文件与该块SHA、反向恢复证明。
AC6 使用现createTestEnvironmentStarter/privateStarterFs+packagedCLI任务私有离线安装；在本任务.tmp先验证适配器，明确加viewer及其声明依赖/正式build字节（原workflow适配器未装viewer），不改旧driver/清单。正常登录→私有工作区→原侧栏“图像生成”→单图视图→实际Composer说明/参考槽→生产Picker/native input选择。任务私有合成资产与本地文件仅用于零付费UI验证，不从全局状态写入或DOMmount冒路径；未知素材缩略图GET仅原展示、不以它探测补MIME，不宣称零浏览器网络。留本版拒绝/已知重选原PNG及零生成/上传POST、草稿/原素材原值；Ego同invocation finally finishkeep[]，Host/fixtures/privateDir自清。3054独立fixture仅旧范围证据不代fullApp。界面新文案须本版演示后用户明确采用才合入，不继承前票确认。
AC7 正式交付相关整包/类型/构建/边界/Stage/新用户基线/L0/diff真退出与非空用例，独立精确源码/功能身份审查→现required+官方SQUASHMergeQueue真实MERGED→mainff+命名Dev同runtime三方字节→仅本票树branch清理。不重启/生产/跨仓；Dev人工业务验收不声称取得。

## 测试策略与计划
先读取原组件/包/测试/现正式环境，再规格独审；新media-mime-selection.test.js对真实生产选择入口建立known正常和unknown失败反例，实际RED必须因原业务假MIME入槽而非缺文件/import/环境错误；保日志。REDcheckpoint同taskbranch仅spec+新增test，不推失败到正式PR；最小修→同targetGREENcheckpoint→80%以上实际生产修改执行行（新增unknown分支及known继续）的覆盖/未知与已知error边界，不以测试代码/复制函数充分母；不造覆盖门禁。
现viewer相关纯测试可能复制算法/源码asserts只证局部；所有原assert保，新增真实入口补缺口。E2E新文件只在真实完整App专项已经通过之后固化并独立审范围，不能先写假验收。若复用现完整journey可保其原运行而任务scratch加specific观察，明确scratch非永久新E2E，不改原driver行为断言。
冻结前业务源码仍唯一MediaViewerComposer.jsx；media-slot.js应只读取，若实证须修inferMimeType或跨入口流程先写具体原因并重审规格，不顺手改目录/算法/参数/已有旧用途。文档仅本spec和经验证的docs/evidence/media-mime-selection-3278.md+必要原PNG，不新增长期规则或平行接口合同。

## 结构、风格和选定命令
写集：本spec、MediaViewerComposer.jsx、加法media-mime-selection.test.js；media-viewer-composer.test.js仅AC5唯一受审it纠正。实际fullApp先任务.tmp适配器复用现正式factory/privateFs/packagedCLI并加viewer离线安装/字节绑定；真实专项通过后可固化tests/e2e/media-mime-selection.e2e.test.js与test-support/media-mime-selection-3278/{environment.mjs,journey.mjs}、docs/evidence的报告/专图，先精确审范围再写；其他旧test/manifest/package/CI/scripts/datafallback/slot算法均不改。现React18 host环境、ESM/JSDoc具名export风格，已既有notice/status样式不新CSS。
基线/聚焦：viewer cwd `node --test src/media-viewer/media-mime-selection.test.js`（新增）；完整原包cwd `node --test tests/*.test.ts src/media-viewer/*.test.js src/media-viewer/*.e2e.test.js`；正式build cwd `node scripts/build.mjs`、`node_modules/.bin/tsc --noEmit -p tsconfig.json && node_modules/.bin/tsc --noEmit -p tsconfig.client.json`；impact根 `node scripts/impact-matrix.mjs --git-diff --base b3dcfcfb404e9442e89e732354268cc8cae007a1`。
适用静态根 `node scripts/verify-plugin-boundaries.mjs`、`node scripts/verify-product-baseline.mjs`、`node scripts/verify-stage-contracts.mjs`、`node --test scripts/verify-anti-slop.test.mjs`、`node scripts/auto-qa-gate.mjs --diff --base b3dcfcfb404e9442e89e732354268cc8cae007a1`、`git -C W diff --check`；依现QA矩阵取并集，未动Hub运行语义则复用本版#3276shared/Hub证据不重复整仓。

## 边界与未知
总是：先规格独审、真实业务RED/GREEN、原testidentity保、复用现helper、实际完整页同版图人工确认、精确独审、全部旧用途保护、TaskSpace/Host自清、原失败保留。先问仅成本/凭据/生产/跨仓/破坏迁移/新依赖越界或保留界面合入决定，普通规格/测试/PR/MQ/Dev已授权不逐stage问。
绝不：图片视频供应商请求/真实上传/账号写/secret读取、跨仓/共享Dev未合入链接、重启/Prod、constantready/pending平台、陌生URL抓图测格式、抹原测试或oldoracle迁移未审。本片不改sourceVersion或qualification，不声称完整新产品迁移/可比报价/真实生成成功。
待证：实际组件全部known来源样例、浏览器媒体页可复用正式入口、修改行coverage及同版UI确认；此spec是待审设计不是任何已通过证明。

## 实际人眼拒绝后的必要可读性补充（仅当前提示）
原35行/9610B/9d981b…规格源码已按两独审实施；实际完整App e03d0361…1pass且unknown拒/草稿原素材保持/known重选，但两原PNG父人眼发现.omx-slot-notice深色fallback背景搭浅色主题深文字、关键提示不可读，不可用assertgreen代交付。该图作为VISUAL_REJECT证据保，不作合入展示批准。
AC8 必要写集加plugins/omnimux/src/client/media-viewer/styles.js，仅.omx-slot-notice的background从缺elevated时暗色常量改为现官方已知背景层令牌（优先--dsw-alias-bg-layer-1，缺时--dsw-alias-bg-base），仍与原--dsw-alias-label-primary搭配；不新CSS层/私造变量/DOMpatch/整页覆盖、不改其它picker/模式按钮/底栏。真实完整媒体页浅/深主题提示计算色对比≥4.5:1且原PNG字清、主按钮/草稿/原素材完整；保先前视觉失败，不借参数数目或提示timer截掉问题。
仅影响打包共用样式，正式Hub/client及viewerbuild同版重建，原其它业务/新产品/旧用途不动；新增media-mime-selection.test.js可补精确此规则结构断言，仅作副证不能代真实computedcontrast/PNG。旧测试不改（唯一AC5例外保）。浏览器重走本版unknown→known并正常系统主题换浅/深，每次实际采色/viewport截图，页面未加载官方token原因仍如实保，不能用注入style/改DOM令牌人为冒绿。此补充规格先独审再改样式。
