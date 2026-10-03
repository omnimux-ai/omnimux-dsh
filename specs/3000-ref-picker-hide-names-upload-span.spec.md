---
title: "选择素材面板：隐藏卡片名称 + 本地上传两行占位"
id: "spec-3000-ref-picker-hide-names-upload-span"
type: "spec"
status: "approved"
issue: 3000
date: "2026-10-03"
subsystem: "omnimux-viewer"
---

# Issue #3000 — 选择素材面板卡片展示优化

## 1. 目标（Objective）

优化媒体查看器「选择素材 / 选择首帧」弹层（`ReferencePickerPopover`）的素材卡片展示：

1. **隐藏卡片名称**：所有 Tab（本地 / AI 生成 / 数字人 / 商品等）下的素材卡片只显示缩略图，不显示下方可见名称文案。名称保留在 `aria-label` / `title` 等无障碍属性中。
2. **本地上传占位**：首格「从本地上传」改为两行高（`grid-row: span 2`），宽度适当加宽（`min-width ≥ 110px`），顶底与两行素材卡片对齐；去掉原先 `1/1` 单行方卡比例。

### 用户旅程

1. 用户在媒体查看器点击首帧/参考卡槽 → 打开「选择素材」弹层。
2. 本地 Tab：左侧看到加宽、跨两行的「从本地上传」占位；右侧素材卡片仅缩略图、无名称。
3. 切换 AI 生成 / 数字人 / 商品等 Tab：素材卡片同样无可见名称。
4. 键盘/读屏仍可通过 `aria-label`/`title` 获知素材名。

### 成功标准（可测）

- [ ] JSX 不再渲染 `.omx-ref-picker-asset-title` 可见名称节点。
- [ ] 卡片容器带 `aria-label={asset.title}` 或 `title={asset.title}`。
- [ ] `.omx-ref-picker-upload-card` 含 `grid-row: span 2`，且 `min-width`/`width` ≥ 110px。
- [ ] 上传卡不再使用 `aspect-ratio: 1 / 1`。
- [ ] 样式中移除 `.omx-ref-picker-asset-title`，防止回潮。
- [ ] `media-viewer-composer.test.js` 中 Issue #3000 两条回归用例全绿。

## 2. 范围与边界

### 总是做

- 仅改 `ReferencePickerPopover.jsx` + `plugins/omnimux/src/client/media-viewer/styles.js`。
- 补回归测试（已插入 `media-viewer-composer.test.js`）。
- 提交前跑相关单测。

### 绝不做

- 不改资产库主站 / 共享 `AssetPicker` / `AssetPickerCard`。
- 不改「从本地上传」文案本身。
- 不引入新依赖、不改 CI/合同。

### 先问

- 若需同步改共享 AssetPicker 卡片（已确认：不需要）。

## 3. 假设

1. 仅媒体查看器弹层（`ReferencePickerPopover`），不涉及 Asset Hub。
2. 缩略图 `alt` 可置空（名称已在卡片 `aria-label`），避免重复朗读。
3. 两行高度用 `grid-row: span 2` + `min-height ≈ 190px`（≈ 两行 90px 缩略图 + gap）对齐。

## 4. 命令

```bash
# 工作树内
node --test --test-name-pattern "Issue #3000" \
  plugins/omnimux-viewer/src/media-viewer/media-viewer-composer.test.js

# 相关回归
node --test plugins/omnimux-viewer/src/media-viewer/media-viewer-composer.test.js
```

## 5. 项目结构

| 路径 | 变更 |
|---|---|
| `plugins/omnimux-viewer/src/media-viewer/ReferencePickerPopover.jsx` | 去掉可见名称；卡片加 aria-label/title |
| `plugins/omnimux/src/client/media-viewer/styles.js` | 上传卡两行+加宽；移除 title 样式 |
| `plugins/omnimux-viewer/src/media-viewer/media-viewer-composer.test.js` | Issue #3000 回归断言 |
| `specs/3000-ref-picker-hide-names-upload-span.spec.md` | 本规格 |

## 6. 测试策略

- **接缝**：源码契约（JSX 不渲染可见名称）+ CSS 契约（上传卡 span 2 / 加宽 / 无 1:1）。
- 与既有 `media-viewer-composer.test.js` 风格一致（读源码/CSS 字符串断言）。
- UI 改动交付时保留功能路径结构证据；Dev 真机验收归人工。

## 7. 边界（Boundaries）

- **Always**：规格先行；TDD 红→绿；独立 worktree；PR 关联 `Closes #3000`。
- **Ask first**：扩大到共享 AssetPicker / 资产库。
- **Never**：直推 main；绕过 PR；重启桌面 App。
