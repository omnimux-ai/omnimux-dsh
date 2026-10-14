---
title: "资产主体点击导入画布修复验证"
id: "evidence-asset-subject-import-3307"
type: "evidence"
status: "living"
authority: "L3"
date: "2026-10-14"
authors: ["agent"]
subsystem: "omnimux-workflow"
---

# 资产主体点击导入画布修复验证

目标来自用户故障截图及[任务规格](../../specs/workflow-asset-import-3307.spec.md)，不是模型生成能力验证。

## 故障与修复

未绑定项目的有效画布进行主体导入或文件导入时报 `project-required`。卡片成功链又只更新项目素材，没有交给现有画布导入入口。修复复用项目自动关联、原画布迁移、项目素材映射和画布插入入口。

## 测试先行证据

- 提交 `a691c80ae`：新增服务端复现。运行 `node --test plugins/omnimux-workflow/src/workflow/routes/projectAssetsBinding.test.mjs`，3 个用例中 2 个因真实 `project-required` 失败、1 个通过。
- 提交 `be4c85f31`：新增客户端点击回调复现。运行 `node --test plugins/omnimux-workflow/src/canvas/editor/components/assets/drawer/subjectInsert.test.mjs`，2 个用例中 1 个因未传递新增文件失败、1 个通过。
- 修复后同样测试与新增 hook 测试共 7 个全部通过、无跳过。服务端用例进一步以非空节点与连线验证前后画布文档全等，重复导入复用原项目。

## 已执行检查

工作流 build 成功；`pnpm --filter omnimux-workflow test` 实际 2488 个用例全部通过、零跳过；随后补充响应级 hook 测试 2 个通过（同时在最终定向 7 用例中运行）。工作流 typecheck 成功；Stage 合同 14 个 Stage 与 8 个侧栏注册通过；anti-slop 3 个通过；产品基线、插件边界（4109 源文件）、`git diff --check` 通过。

仅选择本次相关检查；不跑无关模型、工具声明、全仓测试，不发真实生成请求。实验覆盖率报告没有列出源码（内存打包与浏览器运行不被该统计覆盖），不把空表显示的 100% 当作源码覆盖率证明。

## 证据边界

本文件当前只记录已完成自动测试，不冒充完整应用浏览器验收、合入、开发版安装或人工真机验收。私有完整应用点击、保存、刷新验证单独保留逐次报告和截图。失败及跳过不得回填为通过。主体并发持久化属于已有邻近风险，未扩展本任务事务实现；不增加文件格式支持。
