# 底栏触发器视觉统一（模型选择 / 音色 / 参数摘要）

- 任务：`.worktrees/workflow-trigger-unify`（分支 `feat/workflow-trigger-unify`）
- 日期：2026-09-14
- 用户决策：**方案 B · 统一为胶囊**（2026-09-14 用户拍板；演示页 `tmp/trigger-unify-demo.html`）

## 1. 问题

素材节点配置面板底栏（`wf-config-panel__bottom-bar`）并排三个下拉/浮层触发器，各自实现、互不共享：

| 触发器 | 实现位置 | 现状 |
| --- | --- | --- |
| 模型选择 `wf-model-cascade-capsule` | `ModelCascadeMenu.tsx` 内联样式 | 8px 方角；hover / 按压 / 键盘焦点 / 禁用四态全缺；chevron 12px |
| 音色 `wf-voice-trigger` | `components.css` | 8px 方角、无边框；无按压缩放 |
| 参数摘要 `wf-cfg-summary-bar` / `wf-video-trigger-bar` | `CfgSummaryBar.tsx` + `components.css` | 999px 胶囊；四态完整 |

用户报告：同一条底栏里左侧模型按钮与右侧参数按钮「激活或未激活都有差别」，模型按钮不符合视觉规范且没有复用共享 UI 组件。

## 2. 目标

底栏三个触发器收敛到**同一套共享视觉规格**（单一 CSS 选择器组 + 同一组状态契约），消除内联业务样式，并补齐缺失的交互反馈。

## 3. 验收标准（可测试）

### 3.1 几何一致性（静态 + 浏览器）

- AC-1 三个触发器计算样式完全一致：`height: 32px`、`border-radius` 归一到同一值（胶囊）、`border-width: 1px`、`font-size: 12px`、`padding: 0 8px 0 10px`。
- AC-2 三者 chevron 图标尺寸一致（14px）。

### 3.2 状态契约（浏览器实测）

- AC-3 hover：背景色与边框色均相对默认态改变（三者行为一致）。
- AC-4 展开（模型按钮 `aria-expanded="true"` / 参数条 `--open`）：背景切到激活底色且边框切到品牌色。**指针停留在触发器上（hover + open 组合态）时品牌描边必须保持**，不得被 hover 描边覆盖（open 规则特异性须不低于 hover 规则且在其后声明）。
- AC-5 按压：`:active` 触发 `transform: scale(0.96)`。
- AC-6 键盘 `:focus-visible`：出现可见焦点环（`box-shadow` 非 none）。
- AC-7 禁用：`opacity: 0.35` + `cursor: not-allowed`。

### 3.3 复用与源码约束（静态）

- AC-8 模型触发器不再含内联业务样式（`ModelCascadeMenu.tsx` 触发按钮的 `style={{...}}` 移除，改用类名）。
- AC-9 三个触发器共用同一 CSS 选择器组的几何声明（非各自复制）。

### 3.4 回归

- AC-10 既有断言测试全绿（`pnpm --filter @omnimux/workflow test` 范围内相关用例）。
- AC-11 参数条既有折叠协议、模型级联面板定位/选择行为不变。

## 4. 非目标

- 不改动发送按钮（仍为圆形）与画布其它控件。
- 不改动摘要条的折叠协议、模型级联数据与服务端契约。

## 5. 验证方式

- 静态：`node scripts/scan-ui-gates.mjs`（现行豁免含 `src/canvas/`）、相关单测。
- 浏览器：本工作树内隔离运行，读取三个触发器的计算样式与 hover/active/focus 前后值，留存截图与结构化结果。
