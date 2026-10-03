# Issue #3000 验收报告

## 变更摘要
- 隐藏 `ReferencePickerPopover` 全 Tab 素材卡片可见名称
- 本地上传占位改为两行高并加宽（`grid-row: span 2`，`min-width: 120px`）

## 验证
| 项 | 结果 |
|---|---|
| Issue #3000 回归（2） | PASS |
| media-viewer-composer.test.js | 75/75 PASS |
| PM_SIGN_OFF | PASS |
| 结构截图 | `.agent-reports/issue-3000-ref-picker/picker-after.png` |

## 改动文件
- `plugins/omnimux-viewer/src/media-viewer/ReferencePickerPopover.jsx`
- `plugins/omnimux/src/client/media-viewer/styles.js`
- `plugins/omnimux-viewer/src/media-viewer/media-viewer-composer.test.js`
- `specs/3000-ref-picker-hide-names-upload-span.spec.md`
