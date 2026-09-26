# 规格：恢复首页 4 个热门入门卡片与表单预填输入框

## 1. 目标与背景
- **背景**：根据用户指令与产品经理（许清楚）核定的需求，恢复新会话首页在输入框下方的 4 个热门入门方式卡片（`marketing-insight` 营销洞察、`url-to-video` 视频网址、`recreate-viral-ads` 复刻爆款视频、`bulk-create-ads` 批量创建广告）以及对应的表单模态框。
- **目标**：
  1. 用户在空白会话全宽模式下，输入框下方清晰展示 4 个大卡片（热门入门方式区块，位于探索模板上方）。
  2. 点击各个卡片打开对应的全功能表单模态框（`MarketingInsightModal`、`UrlToVideoModal`、`RecreateViralAdsModal`、`BulkCreateAdsModal`，并预留 `CreativePresetsModal`）。
  3. 表单填写后点击生成/提交，将生成的 Prompt 预填至会话输入框（`setDraft` + `focusEditor`），关闭模态框，用户保有最终发送权，绝不代发。
  4. 遵照产品经理（许清楚）核定的文案字典与《UI 元素与文案锁定规格》，严格遵循 `design.md` 的色彩 Token 与几何规范，零自由发挥、反过度设计。

## 2. 界面布局与组件层次
- **容器结构**：
  - `SessionGuide` (`BlankSessionGuide`) 在非紧凑模式（`!isCompact`）下：
    - 第一层：`PopularStarterGrid`（`popularStarters={POPULAR_STARTERS}`，包含 4 张 `PopularStarterCard`），带标题 `guide.popular.title`（“热门入门方式”）；
    - 第二层：`ExploreTemplatesSection` 探索模板核心专区；
    - 兼容保留：`TrendingReplicateSection`（隐藏态）。
  - 模态弹窗挂载在组件底部：
    - `MarketingInsightModal`
    - `UrlToVideoModal`
    - `RecreateViralAdsModal`
    - `BulkCreateAdsModal`
    - `CreativePresetsModal`
- **卡片白名单与行为定义**：
  | ID | 标题文案 (ZH) | 标题文案 (EN) | 点击交互 | 提交行为 |
  |---|---|---|---|---|
  | `marketing-insight` | 营销洞察 | Marketing Insight | 打开 `MarketingInsightModal` | 提交参数拼接 Prompt 预填输入框，复制并提示「已添加到剪贴板」 |
  | `url-to-video` | 视频网址 | URL to Video | 打开 `UrlToVideoModal` | 提交 URL 及配置拼接 Prompt 预填输入框 |
  | `recreate-viral-ads` | 复刻爆款视频 | Recreate Viral Ads | 打开 `RecreateViralAdsModal` | 提交原片与新需求拼接 Prompt 预填输入框 |
  | `bulk-create-ads` | 批量创建广告 | Bulk Create Ads | 打开 `BulkCreateAdsModal` | 提交简报与配置拼接 Prompt 预填输入框 |

## 3. 验收用例与测试契约
1. **单元测试 (`component.test.js`)**：
   - 恢复 `popular starters render 4 cards and marketing insight modal flows draft into input` 用例；
   - 验证渲染 4 个带有 `[data-popular-starter-id]` 的卡片；
   - 验证点击打开模态框、填写并提交后，`draft` 写入目标 Prompt 且编辑器获得焦点。
2. **端到端测试契约适配 (`remove-popular-starters-home.e2e.test.mjs`)**：
   - 调整契约为验证首页正确渲染热门入门 4 张卡片，探索模板及标题仍完好对齐。
