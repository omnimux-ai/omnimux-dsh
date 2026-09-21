# 规格：图像生成页面浮层面板取消透明效果与实体底色收敛

## 背景与缺陷定位
用户在图像生成页面（`omnimux:media-viewer`）点击底部生成栏的模型选择按钮时，展开的模型级联选择面板呈现为半透明毛玻璃状态，底层的图像和背景直接穿透显露，导致菜单项文字与背景图片重叠混杂，严重影响阅读与选择操作。

**根因分析**：
1. 图像生成控制台浮层外壳容器（`.omx-popover-shell`）直接依赖了宿主环境的 CSS 变量 `var(--dsw-alias-bg-elevated)`，未配置兜底色值；在当前宿主主题未注入该变量时，计算值退化为全透明（`transparent`）；
2. 外壳容器同时配置了 `backdrop-filter: blur(24px)`，在透明底色下将下层背景图片直接渲染为半透明毛玻璃；
3. 级联面板主体（`.omx-cascade-panel`）未声明独立不透明底色，完全暴露了透明缺陷。

## 需求与验收标准 (Acceptance Criteria)
- **AC-1 (取消透明与实体底色)**：
  - 浮层外壳容器（`.omx-popover-shell`）与级联模型面板（`.omx-cascade-panel`）背景显式采用规范深色浮层底色 `var(--dsw-alias-bg-elevated, #1c1c1f)`；
  - 彻底移除 `backdrop-filter` / `-webkit-backdrop-filter` 透明毛玻璃特效，确保面板为 100% 不透明纯色实体，绝不透出底层图片。
- **AC-2 (关联浮层与控件底色统一)**：
  - 操作模式浮层（`.omx-op-mode-popover`）与参数配置浮层（`.omx-params-panel`）同步收敛为实体纯色底色 `var(--dsw-alias-bg-elevated, #1c1c1f)`，杜绝同类透明漏洞；
  - 底部控制条触发按钮（`.omx-capsule-trigger`）hover/active 状态与参数分段控件（`.omx-mode-pill`）补充 `#1c1c1f` 兜底。
- **AC-3 (视觉契约与回归测试)**：
  - 编写端到端样式契约测试，验证样式表中 `.omx-popover-shell` 与 `.omx-cascade-panel` 具备不透明实体底色且无透明滤镜；
  - 保证全量相关单元测试与门禁验证 100% 通过。
