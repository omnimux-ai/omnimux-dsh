# Spec · 创作画布 AI 应用「立即生成」主按钮深浅主题适配

- Task: workflow-apptab-cta-theme
- Owning file: `plugins/omnimux-workflow/src/client/styles.js`（`.omx-apptab-cta-btn` 及其状态选择器）
- Contracts: `design.md` §3.6 / §5.3（Ink CTA、禁用紫色与宿主亮蓝）、`docs/contracts/ai-app-ui-spec.md` §3（44px/398px/8px 例外几何）
- Status: 设计待用户确认后进入实现

## 1. 问题

`.omx-apptab-cta-btn` 消费了四个宿主并不存在的语义 Token：`--dsw-alias-interactive-primary`、`--dsw-alias-label-inverse`、`--dsw-alias-interactive-bg-disabled`、`--dsw-alias-label-disabled`（对照宿主 token 定义 163 项、alias 层 79 项，均为 0 命中）。缺失 Token 使声明在计算值阶段失效，按钮填充与文字回退到初始值，深浅主题下都无法按 Ink 规范呈现；同时投影误用了模态遮罩 Token `--dsw-alias-bg-mask-1`，且无 hover / active / focus 态。

## 2. 目标

按钮在两个主题下都按 design.md 的 Ink 规则呈现，并补齐交互状态；几何与交互逻辑不变。

## 3. 验收标准（可测）

| ID | 验收条件 | 验证方式 |
| --- | --- | --- |
| AC-1 | 深色主题默认态：填充为近白（`--dsw-alias-label-primary` = `#f9fafb`），文字为近黑（`--dsw-alias-label-primary-foreground` = `#0f1115`） | 真实浏览器 computed style 断言 + 截图 |
| AC-2 | 浅色主题默认态：填充为近黑（`#0f1115`），文字为近白（`#ffffff`） | 同上 |
| AC-3 | 两主题默认态文字/填充对比度 ≥ 4.5:1 | 计算对比度并断言 |
| AC-4 | hover 态填充切换为 `--dsw-alias-button-primary-hover`（深色 `#ebeef2` / 浅色 `#43454a`），两主题均可见变化 | computed style 断言（强制 hover） |
| AC-5 | active 态声明 `transform: scale(0.96)`，过渡 120ms `cubic-bezier(0.16,1,0.3,1)` | 源码断言 + 截图 |
| AC-6 | disabled 态填充 `--dsw-alias-button-primary-dimmed`、文字 `--dsw-alias-label-tertiary`、`cursor: not-allowed` | computed style 断言 |
| AC-7 | 样式仅消费宿主现存 `--dsw-alias-*` Token；无裸 Hex/RGBA；无新增 Emoji/字符图标 | 静态扫描 + token 存在性校验 |
| AC-8 | 几何保持 44px 高 / 398px 宽 / 8px 圆角，表单提交与禁用逻辑不变 | 源码契约测试 + 真实浏览器几何测量 |
| AC-9 | 移除误用遮罩投影与失效 Token，按钮不再出现"无填充/文字不可辨"的退化 | 真实浏览器双主题截图对照 |

## 4. 非目标

- 不修改按钮几何、文案、提交流程与禁用判定逻辑。
- 不修改表单其它控件（除非用户另行确认扩展范围；同文件另有 14 个失效 Token 影响面板底色、徽章与错误文字，作为独立发现单独报告）。

## 5. 证据要求

- 真实浏览器（隔离工作树 Web QA）双主题截图，落盘 `.agent-reports/apptab-cta-theme/`。
- 计算样式与对比度断言输出。
- 合入前：插件单测 + 静态门禁 + 独立评审。
