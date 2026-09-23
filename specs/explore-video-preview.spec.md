# 探索模板视频预览与限定素材归一（Issue #2595）

## Objective
为新会话探索货架/网格已有视频提供静音按需预览，普通详情提供原生受控播放器；补齐96条Pippit首视频映射且保留291段来源，保留21条Creatify静态模板。当前用户已批准本范围，不重复请求需求确认。7个应用沿用打开应用，普通模板沿用复刻与附件。

## Success criteria / journeys
- 初次进入探索：卡片几何、封面、标题和原按钮不变；未交互卡片不挂视频src。仅确认视频类型的HTTPS地址可进播放器，PNG及无视频模板始终是静态图。
- 鼠标停在视频卡片或键盘焦点进入卡片：可见且页面前台才挂视频，muted/playsInline/loop；播放开始前保留封面。离开、失焦、滚出可视区域、页面隐藏、卸载均暂停/释放。拒播或加载失败回封面，不阻断动作。
- 键盘Enter/Space开详情，内层按钮不触发外层；触屏点击普通卡片开详情，原生controls播放/暂停/拖动；应用点击仍打开应用。触屏及focus-within可见原动作。
- 详情视频不自动有声播放；提供controls、poster、preload=none，关闭释放；静态模板无video与假时长；失败回封面并显示简短提示。
- Pippit按items[].media原顺序首个kind=video为首视频；保留其余视频的源id/序号/来源关联，不把过期签名URL当稳定产品地址，不改原库。
- 只统一当前395模板/7复用应用的封面与预览，以及Pippit291视频；稳定URL必须有真实上传/对象检查回执。幂等内容寻址或已存在校验，不覆盖删除。
- rights未知且目标公开时不上传；输出逐项缺口，不以UI完成冒充媒体迁移完成。

## Project structure / reuse audit
现有templates/TemplateCardItem.jsx和TemplateDetailDrawer.jsx保留布局与操作；styles.js复用现有尺寸、遮罩、按钮及原生tokens。已读TrendingCover与PresetCard：各自有领域封面/轮播/图片样式与不完整可见性控制，不可直接替代模板；仅新增模板专属轻量生命周期hook/媒体组件，不改其他领域。数据入口templates-data.js、creative-templates.json、featured-apps-data.js。离线映射/迁移工具位于scripts/，只读取显式传入来源路径，输出本仓文件。测试落相邻模板目录与scripts测试，浏览器证据/报告落.agent-reports/explore-video-preview/。

## Commands
- node --test plugins/omnimux/src/client/session-guide/templates/*.test.js
- pnpm --filter omnimux build
- pnpm verify:stages
- pnpm verify:product-baseline
- git diff --check
- 完整应用Verify：scripts/test-env-bootstrap.mjs startTestEnvironment({root:任务树,mode:'ui'})，通过正式包安装任务hub到私有profile；ego-browser独立TaskSpace真实观察DOM/几何/交互、PNG；finally cleanup及task.finish({keep:[]})。启动方案以环境核验报告为准，不使用Stage夹具冒充应用。

## Code style
沿用React函数组件、具名导出、单引号、现有分号约定；关键参数用JSDoc标明shape，URL解析fail-closed，不引入依赖、不跨包私有导入。范式：`const videoUrl = resolveTemplateVideoUrl(template)`，单一解析入口供卡片详情共用。

## Testing strategy
严格Spec→Code→Verify→Test：先提交本规格，再实现；先真实ego完整应用观察选择器和PNG，之后固化E2E。单测覆盖类型误标、拒绝非HTTPS/本机URL、Pippit稳定顺序/缺口/重复执行幂等、生命周期拒播/隐藏/卸载、按钮事件隔离。浏览器覆盖初始不加载、hover播放/leave暂停、focus、详情controls、静态、失效fallback和原应用/复刻。真实CDN不可播与模拟可播分别标注，不互相代替。独立审查与最终QA由主理人另派。

## Boundaries / product baseline
总是：读上传前R2计划及资产权限合同、保留原库只读、检查回执与稳定地址、报告实际缺口、新用户无开发机路径依赖。
先确认：扩展范围、付费、授权不明的公开发布；仅暂停相关上传，继续UI。
绝不：新桶、改公开权限、覆盖删除对象、写外部仓、重新采集、把签名外链直接补齐称完成、提交凭据、改官方DSH/共享45120/43120、未合入物化Dev/Prod、合并或auto-merge。
新用户依赖已验证稳定远程媒体，不依赖本机资产库/代理；媒体缺失显示封面或占位、动作继续可用。离线工具来源路径为显式必填，不作为产品运行时默认。

## Plan / documentation impact
先UI及类型解析；再依R2报告实现最小映射/迁移；完整应用Verify后测试与工程自检。文档只新增本规格、映射来源/上传回执及实施证据，不改设计和权限合同。R2通道与rights待架构报告，不能推断为已授权公开。
