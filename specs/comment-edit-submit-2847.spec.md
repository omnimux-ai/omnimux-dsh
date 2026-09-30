# 评论改图直接提交回归修复（Issue #2847）

## 目标与成功标准
延续 #2827：在图片上实际点击添加评论、打点、填写并提交后，输入框自动附加原图参考卡槽（标记 1）及评论文字；只需点击发送即可发起图片编辑。
提交渠道必须保留中枢原值，展示名不得改变渠道id；初次默认值尊重目录default标记，显式选旗舰版仍提交pro，禁止静默改换计费渠道。
保留原图引用与评论方位；错误响应显示既有通知通道，成功验证新任务身份、结果URL和图片naturalWidth>0，不用旧图证明成功。
验收必须实际点击评论按钮、图像坐标、评论提交和发送按钮，不能直接调用commitAnnotation冒充用户操作。准备测试原图允许隔离夹具。模拟响应必须标明测试数据，真实生成另行验证。
不改主图与队列布局，复用现有设计体系。

## 新用户基线
正常安装、已有可用媒体渠道和图片即可；无渠道/无素材时使用现有错误说明，不依赖开发机私有路径、共享profile或固定测试端口。

## 命令
在任务工作树执行：node --test plugins/omnimux/src/client/media-viewer/media-viewer-composer.test.js；pnpm --filter omnimux test；pnpm verify:stages；pnpm verify:product-baseline；node --test scripts/verify-anti-slop.test.mjs；git diff --check。
隔离浏览器以动态端口挂载生产查看器与配置组件，记录源码身份、请求和PNG；生成替身明确标为模拟。用户要求的真实CDP生成仅在已合并且桌面可用时追加，不重启，不装未合并代码到Dev。

## 项目结构
业务：plugins/omnimux/src/client/media-viewer/MediaViewerComposerData.js、MediaConfigControls.jsx、MediaViewerTab.jsx；目录默认标记：plugins/omnimux/src/catalog/project.js。
回归：原media-viewer测试。临时探针只放任务.tmp/，证据docs/evidence/comment-edit-2847/，完成时保留证据并清理私有进程。

## 代码风格与文档影响
沿用具名导出、原生React状态、当前分号风格；复用目录，不新造渠道别名字典或请求路由。示例：id: ch.id，展示文案仅作用于name。
本规格记录配置投影和直接提交行为变化，不改变模型上游能力声明。

## 测试策略
先观察真实DOM，再固化回归：草稿/提交联动、默认与手选渠道、单次image_edit请求/原图/百分比坐标、成功结果加载与具体错误通知。不得以源码includes或单纯DOM存在冒充行为验证。
已运行基线素材/store相关41个单测全绿，但不能代替评论点击或生成验收。

## 边界
总是：独立工作树、规格先行、正几何和真实点击、失败非零退出、可解码截图、独立审查和PR必要CI。
先问：额外付费批量生成、凭据引导、生产或跨仓修改。
绝不：应用重启、真实付款、main直推/本地合并、覆盖他人工作、改内部状态或CSS伪造验收、把模拟图称作真实生成。
精准放行仅限本任务规格及过时旗舰通道断言，其他保护保持不变。

## 实施计划
核对请求→修复渠道id投影及默认选择→隔离浏览器评论旅程→固化回归→审查PR→合并同步Dev→追加CDP验证→清理。
