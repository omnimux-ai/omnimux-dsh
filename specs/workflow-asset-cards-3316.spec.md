# 创作画布资产卡片精简

## Objective
Issue #3316。用户明确要求资产卡片移除标签，仅保留缩略图与名称。保留当前双列布局、主题与交互，删除数量角标及不再使用的卡片样式。

## Commands
- `node scripts/impact-matrix.mjs --git-diff --base origin/main`
- `node scripts/verify-stage-contracts.mjs`
- `node scripts/scan-ui-gates.mjs`
- `node --test scripts/verify-anti-slop.test.mjs`
- 工作树隔离浏览器验收，桌面与窄幅状态截图及功能断言。

## Project Structure
- `plugins/omnimux-workflow/src/canvas/editor/components/assets/views/SubjectLibraryView.tsx`：卡片渲染。
- `plugins/omnimux-workflow/src/canvas/theme/components.css`：卡片样式。
- `.workbuddy/evidence/`：本机验证与评审证据，不提交。

## Code Style
复用当前 React、TypeScript、画布样式与主题令牌，不新增组件、依赖、配置或数据过滤。

## Testing Strategy
静态检查与真实浏览器检查缩略图、长中文/英文名称、紧凑双列布局、无标签/数量、搜索标签仍有效、点击详情与拖拽数据不变。此可逆低风险展示删除不新增仅复述源码的单测。

## Boundaries
仅修改资产抽屉主体卡片，不改独立资产库、标签数据、分类、排序、搜索或详细页。不发送真实生成请求、不写生产、不修改官方宿主。新用户依赖现有资产读取能力；无资产、读取失败继续使用既有空态与错误态，不新增开发机依赖。文档影响仅任务规格，公共契约及操作不变。

## Acceptance
- 每张卡片仅有缩略图（无封面时保留既有占位）与名称。
- 不渲染标签和素材数量角标，无对应空白占位。
- 长名称仍单行显示，悬停可查看完整名称。
- 标签搜索、分类、排序、点击及拖入画布保持现状。
