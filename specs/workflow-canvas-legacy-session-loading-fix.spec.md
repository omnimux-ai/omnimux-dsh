# 规格说明：修复旧会话打开创作画布无限停留在加载状态死锁缺陷

Issue: #2315 · 模块: omnimux-workflow · 风险等级: R2

## 文档影响说明
消除画布标签页因跨会话本地缓存污染导致的无限加载（`canvas.loading`）死锁，确保无论新旧会话均能准确进入画布渲染或未建项引导，杜绝出现界面假死。

## 新用户与产品基线
无论用户打开新创建的会话还是历史遗留的未建项旧会话，创作画布都必须在状态就绪后立即呈现明确的界面：若有可用创作页则加载画板，若无可用项目则可靠呈现未建项引导卡片，严禁永久卡在“正在加载创作画布…”中间态。

---

## 一、背景与业务问题
1. **跨会话本地存储导致显式画布判定被污染**：`CanvasTab.jsx` 在挂载时，会从本地存储（`localStorage`）读取上次全局活跃的画布编号作为保底。该记录的 `sessionId` 为空，在解析目标画布编号（`resolveCanvasTargetWorkspaceId`）时因会话不匹配被安全忽略；但在外层的 `hasExplicitCanvas` 判定中，未对 `pickedBySession` 校验会话归属，导致系统误以为当前会话存在明确画布，将 `isUnprojected`（未建项）误判为 `false`。
2. **三元渲染分支空洞导致状态死锁**：当上述误判发生时，`isUnprojected` 为 `false`（不显示未建项引导），同时 `targetWorkspaceId` 亦为 `undefined`（因项目为空无法解析出目标画布），界面最终落入三元表达式的第三个兜底分支 `{t('canvas.loading')}`，永久展示“正在加载创作画布…”，形成状态死锁。

---

## 二、验收标准与核心行为
### A. 显式画布归属判定加固
1. 在 `CanvasTab.jsx` 中，`pickedBySession` 必须严格通过 `belongsToSession` 校验（即 `pickedBySession.sessionId === sessionId`）才可被计入 `hasExplicitCanvas`，彻底阻断跨会话全局缓存污染；
2. 当且仅当当前会话确实拥有明确的创作页编号（显式 scope、属于当前会话的选中记录或项目绑定的创作页）时，`hasExplicitCanvas` 才为 `true`。

### B. 消除加载死锁与可靠状态回退
3. 当项目绑定请求已完成响应（`sessionBinding` 非空）且无项目档案（`sessionBinding.project === null`）时，若无任何显式创作页目标，100% 可靠判定为 `isUnprojected = true`；
4. 杜绝因三元判断空洞导致的永久停留在 `t('canvas.loading')` 状态。

---

## 三、验证与测试计划
1. **单元测试与契约测试**：
   - 模拟旧会话（无项目、localStorage 存在非本会话残留画布）场景，断言 `hasExplicitCanvas` 保持为 `false`，`isUnprojected` 正确为 `true`；
   - 模拟绑定有画布的项目场景，断言正常识别并加载 `targetWorkspaceId`。
2. **端到端测试**：
   - 更新 `canvas-workspace-sync.e2e.test.mjs`，增加跨会话本地存储污染防御与死锁消除断言；
   - 运行全量 1950+ 项测试保持 100% 绿灯。
