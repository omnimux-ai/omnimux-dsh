---
title: "图像生成：参考图必须真正参与，取消手选生成方式"
id: "spec-image-ref-auto-mode"
type: "spec"
status: "draft"
authority: "L2"
date: "2026-10-06"
updated: "2026-10-06"
subsystem: "omnimux-viewer"
tags: ["image", "reference", "composer", "auto-adapt"]
related:
  - "docs/contracts/node-input-submission.md"
  - "docs/contracts/ui-copywriting-and-naming-standards.md"
  - "docs/contracts/ui-design-guidelines.md"
  - "docs/contracts/model-list-ownership.md"
---

# 图像生成：参考图必须真正参与，取消手选生成方式

## 1. 用户报告的事实

在图像生成输入框（媒体面板 composer）里已放入参考图，模型为 `GPT Image 2.5`（经济版），实际出图完全没有使用这张参考图。同时输入框上方仍存在 `文生图 / 参考` 手选页签与参数面板里的「生成方式」组。

## 2. 目标

1. 放入卡槽的参考素材必须真正随请求发出，并被上游消费；任何情况下不得静默丢弃。
2. 取消消费端手选的图像生成方式（页签 + 参数面板「生成方式」组）。
3. 生成方式由**当前模型契约支持的操作集合** × **实际放入的图片数量**自动推导：
   - 0 张 → 文生图（`text_to_image`）
   - 1 张 → 图片编辑（`image_edit`，若契约无此操作则退到参考）
   - 多张 → 参考（`multi_reference`）
   契约里等价的参考类操作 id（`image_to_image`、`inpaint_outpaint`）必须与上述集合一致识别，不得出现「页签认识、推导不认识」的分裂。

## 3. 验收标准（可测）

| # | 场景 | 期望 |
| --- | --- | --- |
| A1 | 模型契约含 `text_to_image` + `multi_reference`，卡槽 0 张图 | 推导操作 = `text_to_image`；提交 `references` 为空 |
| A2 | 同上，卡槽 1 张图 | 推导操作 = `multi_reference`；提交 `references` 长度 = 1 |
| A3 | 模型契约含 `image_edit`，卡槽 1 张图 | 推导操作 = `image_edit`；提交 `references` 长度 = 1 |
| A4 | 模型契约含 `image_to_image`（无 `multi_reference`），卡槽 1 张图 | 推导操作 = `image_to_image`；提交 `references` 长度 = 1 |
| A5 | 卡槽有图，但模型契约只有 `text_to_image` | 不静默丢弃：给出明确提示且不提交空载荷 |
| A6 | 图像模式下的输入框 | 不再渲染 `文生图/参考/编辑` 页签行；参数面板不再有「生成方式」组 |
| A7 | 视频模式 | 视频生成方式页签与「生成方式」组保持不变 |
| A8 | 提交请求 | `operation` 仍为契约操作 id，且与推导结果一致 |

## 4. 新用户基线

- 依赖：中枢 `/omnimux/model-catalog` 返回的模型 `raw.operations` 契约。读不到契约时 `operationsOf` 已有的图像兜底三元组（`text_to_image` / `image_edit` / `multi_reference`）继续生效，因此新用户不依赖任何本机开发态数据。
- 失败表现：模型契约里完全没有参考类操作时，放入素材后必须显示明确提示（不得静默出图）。

## 5. 契约边界裁定（审计结论）

1. **`docs/contracts/generation-node-policy.md` 的图片行不适用于本改动。** 该合同的适用范围是 Workflow 生成节点（`generationPolicy.ts` 维护产品模型范围与模式展示策略），它自己的视频条款也只约束 `OperationSegment` / `VideoTriggerBar`。媒体面板输入框不是 Workflow 节点，它直接提交 `/omnimux/api/media/generate`。因此不修改该合同，也不动 `plugins/omnimux-workflow/**`。
2. **不违反 `node-input-submission.md` 第 3 节。** 该条禁止的是「因连线运行时插槽标签收缩 `effectiveOps` 而隐藏生成模式选择器」；本次是**素材数量驱动**的推导，且素材越多可选能力只会变宽不会变窄，与连线标签无关。
3. **`ui-design-guidelines.md` 的分段控件胶囊圆角规范不受影响**：视频生成方式、清晰度、张数等分段控件继续存在并继续复用同一份样式。
4. **文案**：`node-input-submission.md` 禁止在用户可见错误里暴露内部 `operation` 术语，因此本次新增/改写的提示必须使用业务语言（如「请先在卡槽放入要修改或参考的图片」）。

## 6. 唯一可见的手动选择器

审计确认 `MediaConfigControls` 在 `plugins/` 下只有 `MediaViewerComposer.jsx` 一个渲染点，且已传 `showModeSwitch={false} showOpMode={false}` —— 参数面板里的图像「生成方式」组是不可达的死控件。**用户唯一能看到的手动图像模式选择器就是输入框上方由 `opModeTabs` 驱动的 `.omx-slot-modes` 页签行**。本次同时清掉死控件与其孤儿样式/注释，避免留下第二套误导性入口。

## 7. 不做

- 不改上游厂商协议、不改渠道与定价、不动视频生成方式选择、不动工作流节点（画布）的生成模式选择器。
- 不新增模型、不探测真实模型 API。
- 不修 `scripts/` 下驱动 `.omx-slot-mode` 的历史取证脚本（`generate-batch-digits-opmode-evidence.mjs`、`generate-batch-wrap-fix-evidence.mjs`、`media-param-qa.mjs`、`media-paste-qa.mjs`），仅在交付报告里登记为已知过期。
