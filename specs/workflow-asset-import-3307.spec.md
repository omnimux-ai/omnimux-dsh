# 资产卡片自动加入画布（Issue #3307）

## 目标与成功标准
用户在创作画布的主体库点击卡片，主体内支持的素材自动加入当前画布，无需先手动建项目。未绑定项目的有效画布自动绑定一个项目；已有绑定复用；旧节点与连线保持；刷新后素材仍可读取。空主体、未知画布、跨来源写入与文件错误不应误报成功。切换画布后旧请求不得插入新画布。

## 新用户基线
依赖安装自带的资产与工作流服务、可写用户素材库及已有有效画布，不依赖开发机路径、模型或凭据。缺少素材文件或可写目录时显示可理解错误，不静默退化。

## 计划与项目结构
复用 projects/ensureProjectBound.ts，在资产导入写入前验证画布并绑定；复用 canvas/editor 的项目素材与 onInsertAsset 导入适配器，将本次新增文件加入画布，不复制独立导入实现。源码范围限 plugins/omnimux-workflow/src/workflow/routes 与 src/canvas/editor，相关测试紧邻源码。

## 命令
`node --test plugins/omnimux-workflow/src/workflow/routes/projectAssetsBinding.test.mjs`；`pnpm --filter omnimux-workflow test`；`node scripts/verify-stage-contracts.mjs`；`node --test scripts/verify-anti-slop.test.mjs`；`node scripts/verify-product-baseline.mjs`；隔离应用 `node scripts/worktree-app-qa.mjs --journey .workbuddy/qa-journeys/asset-import.mjs`；`git diff --check`。

## 代码风格
沿用具名导出、现有错误类型、关键函数显式类型、现有工作区异步守卫。服务端负责项目绑定，界面不吞掉 project-required。

## 测试策略
先以真实工作区与项目存储构造未绑定主体导入复现，记录红灯再修复并运行同一用例。覆盖已有绑定、未知画布、错误体及既有画布保存；客户端验证仅本次导入文件入画布与切换守卫。完整隔离应用以合成素材点击主体卡片取 DOM、素材文件及截图证据，不发媒体生成请求。

## 边界与文档影响
始终复用存储、导入与项目绑定机制；不改官方 DSH、不改生产或模型、不删除用户文件、不改 CI。文档只新增任务规格与真实证据，不变更产品范围。授权为用户当前故障修复及仓库规定的正常开发交付。
