# #3300 特征卡交互与角色瀑布流精确同步

## 目标与视觉事实

用户给当前截图并要求继续Ego访问官网，聚焦左特征卡和右瀑布流。基线d8823b5561d27cbd2a18ba80f89bc624ce24804b。2026-10-14真实官网ego46同1440x960角色设计+AI达人栏目：type88x104、白底独立80x76图/20label、selected4px inset；gender88square、透明底2border、非右上tinyicon；普通media成功hover/focuslabel，非黑chip。官网columns4 gap16、DOM同列上到下，目标displaygridgap12为伪瀑布流留下row空。截图和测量root.agent-reports/avatar-cards-3300，source浏览空间已正常finishclosed；来源部署SHA不保证匹配readonlysource。

## 用户旅程/成功标准

左类型与普通特征卡采用不同变体；type图片完整contain+独立标签，不黑横条；type可折叠恢复，默认展开，selectedclear沿宿主高对比色（宿主brand在当前Dev与亮底同色不能画不可见边，因此type用继承深字色内描边，gender/普通卡仍brand）。性别图标区域按卡中央尺寸，标签独立位置，64px以内icon不遮文字；普通media图完整可辨识、标签不是贴黑chip，hover/focus有明确反馈，失败/loading仍有常显身份（沿共享RecoverableMedia状态/重试），touch可读。类别标题数量紧凑不重复，折叠不改选择、随机手选锁/动物可见性保持。

右侧真正CSScolumns2/3/4现有viewport阈值，不造greedydom重排；column-gap与同列verticalgap16，break-insideavoid卡不分裂，保留presetimage原ratio/preview/apply两个兄弟button、键盘DOM顺序。预览不自动套用、不新生成，touchCTA常显。无hero/website第三方视频资源移植，本轮只gallery/featurecard细节。

## 结构/实现计划与复用

限定avatarclientOptionCard/BuilderPanel/styles/RecoverableMedia(按需事件state)与useBuilder初始化tieraccordion。ExplorePresetGrid保existingcolumns hook，不再注释假的masonry；已有runtimeassets用原数据不添加官网copyright头像。先读成熟图库既有CSScolumns对比2产品pattern（CSS multicol每列紧密，图库焦点保持DOM顺序），不增加依赖。原React具名函数、CSSofficialtoken与CSSvariables，criticalonState callback明确公开状态。图像检验/上传/任务账本/模型路由不改。

## 命令与测试

构建avatar目录node scripts/build-client.mjs；完整avatar node --test src/*.test.mjs src/client/*.test.mjs src/client/*.test.js src/client/components/*.test.mjs。rootnode scripts/verify-stage-contracts.mjs/node scripts/verify-plugin-boundaries.mjs/node scripts/verify-product-baseline.mjs/node --test scripts/verify-anti-slop.test.mjs，impactmatrix最小union。真实TaskprivateuiApp runner+专属journey1440/820/390、hover/focus/select/collapse/流adjacent geometry/brokenimage identity/reflow/previewapply，拍beforeafter并clean；正式E2E先实际预演后固化。unit先red断言type结构+CSSmasonry，旧测试不弱化；必要旧layoutexpect变更须准确保留安全断言。

## 基线/文档/边界

新用户仍正式安装后直接用，无dev默认/私workspace路径；素材缺失给可读身份与原有有限媒体恢复不假ready。更新avatarREADME以及task映射，原创独立hostdesignnotAGPLcopy。普通实现授权含正常PRMQ+Devonly和taskownedcleanup。总是：同栏目量化截图与功能验收，不拿历史不同data当几何差；先问Prod/payment/credential/copyrightdataset或另仓写；绝不copyAGPLcode/new原图/改hosttheme/securitygate/原有typedrefs安全/unknownkill。
