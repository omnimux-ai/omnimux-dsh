# #3298 达人页视觉交互同步

## 目标与假设

用户要求先视觉对比，再找代码差异，最后实现同步。适用官网/influencer实际画面与本插件当前基线fd33672b。同视口1280x900官网截图source-character/motion/video-picker与插件target-character/motion-before已留存root.agent-reports/avatar-ui-parity-3298，插件实际app-qa76b66594通过并cleaned。官网右栏历史、插件右栏灵感，数据不同不作为布局差异。设计保留官方宿主字体/语义配色/32px控件，无新品牌岛。

## 用户旅程与成功标准

1. 角色设计类型卡始终有可读名称；图片失败显示文本不会留下无含义空白；类型标题/分类数量不重复。
2. 视频入口在左栏内与角色设计切换。视频面板先模式说明与双模式、视频和图片独立槽，点击正确类型槽才显示素材选择，全部/上传/生成筛选只作用该类型；缩略/已选状态/空态/预览/上传易辨识。上传仍复用公开importMaterial+实际byte inspect，最多30images保留。
3. 视频模式CTA固定左栏底部，不随选项滚动，生成条件/接受/异步epoch保持。选中素材可更换/移除，图片提及索引变化保持既有安全。
4. 风格默认简洁关闭，展开编辑，记忆按mode；自定义说明保持并明确开关。未准备参数时清晰度/画幅显示中文维度或当前选择，不显示Select。真实同组能力依旧约束。
5. 角色风格参考入口是直观上传槽，说明收敛，brief保留；重置与已选特征摘要收敛固定栏，不删除手选锁与random语义。
6. 右侧媒体保持完整预览、历史行为；桌面/820/390不横溢出，独立滚动和手机导航无状态丢失。截图前后同状态，真实隔离Web选择/上传/切模式/重载/历史/预览验证，不真实收费。

## 项目结构与复用

只修改plugins/omnimux-avatar/src/client：AvatarStage布局、MotionPanel状态原有公共调用、ImageReference、BuilderPanel、OptionCard、GenerateBar、styles及限定新回归；按需复用dsh-ui-kit Button/Input/Dropdown/Toggle/Popover公开组件，先核对实际导出不跨包私模块。素材选择只消费当前avatar材料与ready任务，不导入hub私资产picker或修改上传鉴权。官网仓只读AGPL，不复制图片/代码。默认新用户无需dev端口/私profile；参考素材或生成channel不足保留现有明确错误。

## 命令与策略

构建node plugins/omnimux-avatar/scripts/build-client.mjs（插件目录实际entry核对后执行）；插件完整node scripts/run-tests.mjs（avatar目录）；根node scripts/verify-plugin-boundaries.mjs、node scripts/verify-product-baseline.mjs、node scripts/verify-stages.mjs、node --test scripts/verify-anti-slop.test.mjs；impact-matrix当前diff选最小union。app-qa使用任务.tmp/run-parity.mjs与旅程，ui合成服务，真实浏览器并清理；网站浏览只观察不生成，egospace28已finishclosed。

## 风格/测试/边界

React具名组件，样式沿既有AVATAR_CSS与dsw，状态沿既有epoch与materials公开seam，关键handler输入保留受管reference。先可见失败基线再新增UI回归，旧安全/accepted/保存/恢复回归全部保持。写documents仅本任务spec+avatarREADME说明新交互；回归generatedreport不提交无关变更。

总是：同状态截图、空/已选/失败/窄屏/keyboard外点Escape、独立最新head审查与正式CI/MQ，Devonly materialize与自身cleanup。
先问：Production、收费视频/付款、凭据初始化、官网写、第三方版权镜像或更换宿主设计系统。
绝不：bypass安全、用CSS隐藏数据错误、复制AGPL、伪造价/模型能力、不明进程强杀/其他任务写。
