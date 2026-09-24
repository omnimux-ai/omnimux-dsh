# 规格说明：新建项目后前置初始化画布工作区与异常大白话映射 (Issue #2644)

## 1. 业务痛点与技术根因
- **现象**：在未建项工作区点击「创建应用编辑副本」并确认后，页面底部报错英文代码 `workspace-not-found`；
- **根因分析**：
  1. `ProjectStore.create` 创建新项目时，为工程分配了初始 `canvasWorkspaceId`（如 `ws_xxx`），但在画布存储中该快照并未物理落盘；
  2. 前端直接向 `PUT /omnimux-workflow/api/workspaces/ws_xxx` 保存节点数据时，后端执行 `requireSnapshot(id)` 校验发现快照文件不存在，抛出 404 `workspace-not-found`；
  3. 前端捕获后直接透出原始英文错误代号，未进行大白话转译。

## 2. 解决方案与验收标准
1. **画布快照前置初始化**：
   在 `createProjectForkFromManifest` 中，新建项目成功后，先调用 `POST /omnimux-workflow/api/workspaces`（请求体携带 `{ id: workspaceId, name: projectTitle }`）将该空白图纸物理初始化落盘；
   然后再调用 `PUT /omnimux-workflow/api/workspaces/:id`（携带 `{ expectedVersion: 0, nodes, edges }`）保存应用工作流节点，确保后端顺利放行。
2. **友好大白话错误映射**：
   在前端提供友好的中文错误转译映射，将 `workspace-not-found` 转译为“未找到工程画布，请重试”，将 `version-required` 转译为“画布版本号缺失，请重试”等，杜绝暴露英文变量名。

## 3. 质量门禁与验证
- 单元测试覆盖前置初始化调用流程；
- E2E 测试全链路走通新建独立项目并在空白画布初始化后写入工作流节点；
- 实操证据生成与两轮开源代码审查闭环。
