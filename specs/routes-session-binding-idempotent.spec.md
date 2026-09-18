# 规格说明：修复会话项目绑定 GET 接口产生修改副作用及覆盖已有创作页缺陷

Issue: #2322 · 模块: omnimux-workflow · 风险等级: R2

## 文档影响说明
规范 `GET /omnimux-workflow/api/projects/session-binding` 接口幂等性，确保在项目已存在时直接读取既有项目档案，严禁篡改创作页列表或覆盖 `activePageId`。

## 新用户与产品基线
遵循 RESTful GET 幂等规范。当项目档案已经存在时，GET 接口不得对项目执行 `addPage` 写入；只有当项目不存在时，才执行新项目登记绑定，确保历史会话已建好的画板能完整呈现。

---

## 一、背景与业务问题
在 `routes.ts` 的 `session-binding` 接口实现中，无论当前工作区项目是否已存在，均直接调用 `ensureWorkspaceProjectBound(store, { ... canvasWorkspaceId: sessionToWorkspaceId(sessionId) })`。导致每次客户端发起只读查询时，后端误以为需要追加新页面，硬生生追加一个散列画板页面并抢占 `activePageId`，导致用户原本由智能助手创建的高质量画板被屏蔽。

---

## 二、验收标准与核心行为
1. 在 `routes.ts` 中，优先检查当前工作区是否已存在项目；
2. 若项目已存在，直接读取并返回该项目的真实档案（保留原有的创作页列表与 `activePageId`），绝不触发 `addPage`；
3. 仅当项目不存在时，才触发新建绑定流程。

---

## 三、验证与测试计划
1. **单元测试与契约测试**：
   - 验证已有项目调用 `GET /session-binding` 时保持幂等，页面数量不增加，`activePageId` 不变；
   - 全套测试 100% 绿灯。
