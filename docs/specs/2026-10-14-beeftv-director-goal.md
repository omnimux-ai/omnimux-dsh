---
title: "三维导演台迁移执行目标"
id: "goal-beeftv-director-migration"
type: "spec"
status: "draft"
authority: "L2"
date: "2026-10-14"
updated: "2026-10-14"
authors:
  - "x"
  - "agent"
subsystem: "omnimux-workflow"
---

# 三维导演台迁移执行目标

这是后续实施目标，不是迁移已完成声明。本轮仅研究与需求规划；实现尚未启动。完整需求真源：../../specs/beeftv-3d-director-migration.spec.md。

## 推荐执行目标

/goal 在 OmniMux 既有创作画布完整迁移 BeefTV 已实现的三维导演台，按完整需求的全部必选功能完成导演节点、摆场人物姿态、摄影机、动画轨迹、保存恢复、构图截图与可播放白膜参考视频、识图简化站位和全景辅助、Agent操作及既有媒体/剪辑交接，并完成真实完整应用与实际文件验收。
验证：先消除完整应用测试装配连接共享Dev配置、凭据、项目和媒体的风险，建立任务私有完整应用并验证打包插件/源码身份、WebGL实际画面和录制能力；在正常产品入口走通创建、编辑、保存、关闭重开、刷新、任务主机重启与导出。横屏16:9和竖屏9:16各产生5秒30fps含运动参考镜头；PNG独立解码且画幅误差≤1%，视频首中尾可解码、可播放和拖进度，时长差≤max(0.3秒,5%)，画面真实变化且无辅助叠层。执行需求全部A01–A12及相关最小检查，保留同版本截图、文件指纹、请求/落盘与清理回执；模拟和真实AI结果分列。
约束：保留源MIT版权与实际采用资产许可，复用源三维实现并适配宿主服务/主题；新用户无源仓和模型密钥可完成本地导演工作。源未开放文字自动建场、真实三维重建、任意模型自动绑骨和不可达高级轨道UI不作已实现承诺。识图提示与校验统一16候选上限，替换只对象及相关绑定，不冒称重建整个场景。聊天、视觉和生图按场景走中枢，不复制源账户或供应商客户端。
边界：业务写入主要在任务隔离工作树的plugins/omnimux-workflow；仅必要公开能力接缝涉及plugins/omnimux，以及必要安全验收装配、包配置、许可和任务文档。assets/clip只用公开服务，不跨导入私有代码；不改官方DSH、共享Dev/Prod配置或业务数据，不写其他仓库，不建新通用平台，不启动替代当前GUI服务器，不调用真实付费视频模型或进行资金操作。
迭代策略：固定来源提交5e2ad6022addd387001d08a478e3316ee2266524，实施前读取最新目标远端主干及适用合同；先P0安全装配与来源核对，后按P1–P5纵向闭环推进。每阶段更新规格与逐项证据，失败先读实际结果、修原因并跑相关检查，不降低标准、不把缺失项或模拟状态记成功。独立方向可并行，协调者统一Git状态；没有必要人类输入时持续完成已授权步骤。
完成条件：所有必选功能有当前版本的真实完整应用与媒体证据，全部必要检查和独立复核通过，旧项目/输入/生成/剪辑回归及安全失败路径通过；经实施授权后完成普通PR、required CI、Merge Queue、主干同步和开发版安装并记录真实状态。首闭环、源码存在、HTTP200、单测/CI绿灯、演示夹具或开发版安装不等于完整验收；缺必要证据不能mark complete。生产发布与人工Dev检查分别列状态，不冒充完成。
暂停条件：仅缺必要凭据授权、真实付费视频任务预算、生产/跨仓/破坏性许可或人类专属输入时暂停受影响动作，继续其余安全授权工作；无需重复问例行批准。录制/WebGL/真实智能服务或完整隔离应用不可用须报告具体证据与受影响项，不以演示或模拟替代通过。新账户、付款、生产及用户数据破坏性动作不得自动提交。

## 默认选择与来源

承接现有画布的按需专用编辑器，不新增平行平台。研究位于任务 .agent-reports/beeftv-director/；完整需求列明功能、结构、数据、测试矩阵与命令。实际实施必须先读完整规格，不只执行目标摘要。

## Current execution goal (same boundaries)

/goal Migrate the implemented BeefTV 3D director into the existing OmniMux workflow canvas with all mandatory scene, actor pose, camera, animation, persistence, screenshot, playable clay-reference video, image-layout/panorama assistance, agent and existing media/editor handoffs. Follow the Chinese requirements as the single source and prove the full application and real artifacts.
Verification: first fix task-private application assembly without shared Dev configuration, secrets or writable media/projects, and verify installed bundle identity, WebGL pixels and recording. Run A01–A12 through normal product entry; restore after reload and task-host restart; export moving five-second requested-30fps clips at 16:9 and 9:16, decode PNG within 1 percent aspect error, decode video start/middle/end, play and seek, and measure duration error within max(0.3 seconds, 5 percent). Keep source-bound screenshots, files, receipts and cleanup; distinguish simulated and real AI results.
Constraints: retain MIT and asset license notices, reuse the existing rendering implementation but adapt host services and native UI. Local editing requires no source checkout or model secret. Do not promise unimplemented text-to-3D, reconstruction, arbitrary auto-rigging or unreachable advanced tracks; align image-layout parsing and prompt to 16 candidates. Route visual and image work through the hub.
Boundaries: task worktree only; mainly workflow, necessary hub public seams and task-specific safe test assembly, package/license/docs. Do not modify official DSH, shared Dev/Prod data, other repositories, private cross-plugin internals or replace the current GUI server. No production release, real payment or paid video-model calls.
Iteration policy: pin source 5e2ad6022addd387001d08a478e3316ee2266524 and inspect latest remote target before implementation; execute P0–P5 as verified vertical slices, preserve unrelated code and data, diagnose failures from evidence and never weaken completion standards. Coordinator owns shared Git state; continue authorized independent work without routine reconfirmation.
Stop when: every mandatory requirement has current full-application and artifact evidence, applicable checks and independent review pass, existing projects and failure paths remain safe, and authorized implementation completes PR/required CI/Merge Queue/main sync/Dev installation. Planning, source presence, HTTP success, fixtures or installation alone are not full acceptance; do not mark missing evidence complete.
Pause if: necessary authorization, credentials, paid-video budget or human-only input is missing; pause only affected actions and continue independent safe work. Report exact runtime/isolation limitations, never substitute simulated results. Production, cross-workspace destructive operations and payments need their own boundaries.

## 当前状态

目标已制定，实现尚未开始；本轮没有真实生成或导演应用旅程、远端提交、合并、部署。目标文字检查通过不代表功能通过。
