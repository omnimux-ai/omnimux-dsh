# Issue #3011 验收证据报告：媒体查看器失败任务原位保留、重试与刷新续传

## 验收概述
- **关联 Issue**: #3011 (https://github.com/omnimux-ai/omnimux-dsh/issues/3011)
- **分支**: `agent/viewer-failed-card-resume-issue-3011`
- **对应规格**: `specs/viewer-failed-card-resume-3011.spec.md` (A1 ~ A6 全部通过)

## 功能验收点与真实浏览器验证

### 1. 修复前问题复现（A1 负向证据）
- **现象**: 网关异常（如 522/502/断网）或提交失败时，任务卡片直接消失，缩略图栏也不见，顶部弹出未经转译的裸 HTML Toast。
- **证据文件**: `docs/evidence/viewer-failed-card-resume-3011/before-failure-card-vanishes.png`

### 2. 失败任务原位保留与友好提示（A1、A2）
- **现象**: 
  - 生成失败或网关 522 阻断时，任务卡片停留在主视口原位置（`.omx-mv-failure-card`），不自动切走。
  - 卡片内文案严格遵循产品白名单：
    - 网关/超时/网络异常：「生成服务暂时不可用，请稍后重试」
    - 服务端中文业务错误：原样透传
    - 未知异常：「生成失败，请稍后重试」
    - 刷新后无 taskRef 且无在途任务：「任务已中断，请重新提交」
  - 缩略图栏展示带轻量错误底色的卡槽（`.omx-thumb-task-slot--failed`，title:「生成失败」）。
- **证据文件**: `docs/evidence/viewer-failed-card-resume-3011/failed-card.png`

### 3. 原位「重试」交互（A3）
- **现象**: 点击失败卡片上的「重试」按钮后，使用新 `requestKey` 原位发起重新生成，生成中卡片重新激活，生成成功后原地淡入展示结果。
- **证据文件**: `docs/evidence/viewer-failed-card-resume-3011/retry-success.png`

### 4. 刷新后断点续传（A4、A5）
- **现象**:
  - `media-viewer-store` 对 `generating` 和 `failed` 任务实施安全持久化（剥离内联 `data:` 参考图，防超额失效）。
  - 刷新进入页面后，若存在服务端有效任务记录，自动发起取回并在主卡片上展示「正在恢复任务」流光动画；终态返回后原地变为成功或失败卡片。
- **证据文件**: `docs/evidence/viewer-failed-card-resume-3011/resuming-card.png`

## 测试套件执行情况
- `plugins/omnimux-viewer/src/media-viewer/generation-failure.test.js`: 8/8 通过
- `plugins/omnimux-viewer/src/media-viewer/generation-failure-resume.e2e.test.js`: 21/21 通过
- 相关单元测试与集成测试: 316/317 通过（唯一失败为 main 主干既有已知问题）
- OCR 审查意见全部清空闭环。
