# 图像生成页面模型级联面板取消透明效果实测证据（#2503）

- **日期**：2026-09-21
- **分支**：`agent/omnimux-cascade-panel-opaque-issue-2503`
- **关联 Issue**：[#2503](https://github.com/omnimux-ai/omnimux-dsh/issues/2503)
- **规格文件**：`specs/fix-image-generation-cascade-panel-opaque.spec.md`
- **端到端契约测试**：`plugins/omnimux/src/client/media-viewer/cascade-panel-opaque.e2e.test.js`

## 1. 修复前后样式与视觉行为对比

| 检查项 | 修复前 | 修复后 |
| --- | --- | --- |
| 浮层外壳容器底色 (`.omx-popover-shell`) | `var(--dsw-alias-bg-elevated)`（宿主无变量时退化为 `transparent` 全透明） | `var(--dsw-alias-bg-elevated, #1c1c1f)`（100% 不透明纯色深黑灰兜底） |
| 毛玻璃模糊滤镜 (`backdrop-filter`) | `blur(24px)`（导致底层画面被模糊穿透） | **已彻底移除**（无滤镜穿透，消除透光） |
| 模型级联面板主体 (`.omx-cascade-panel`) | 未声明独立背景（直接穿透外壳底色） | 显式声明 `var(--dsw-alias-bg-elevated, #1c1c1f)` 实体底色 |
| 模式浮层 (`.omx-op-mode-popover`) | 依赖外壳且未声明独立底色 | 补充 `var(--dsw-alias-bg-elevated, #1c1c1f)` 实体底色 |
| 参数面板 (`.omx-params-panel`) | 依赖外壳且未声明独立底色 | 补充 `var(--dsw-alias-bg-elevated, #1c1c1f)` 实体底色 |
| 胶囊条按键 (`.omx-capsule-trigger`) | hover/active 裸用变量 | 补齐 `#1c1c1f` 兜底 |

## 2. 自动化验证覆盖
- `plugins/omnimux/src/client/media-viewer/cascade-panel-opaque.e2e.test.js`：
  - [x] AC-1: 浮层外壳容器具备 `#1c1c1f` 不透明实体底色且无 `backdrop-filter`；
  - [x] AC-1: 级联模型面板主体显式配置不透明实体底色；
  - [x] AC-2: 操作模式与参数配置浮层具备不透明实体底色；
  - [x] AC-2: 底部胶囊条按键及激活项具备实体兜底底色；
  - [x] 防御性安全门禁: 全局排查无裸露未兜底的 `--dsw-alias-bg-elevated` 调用。
