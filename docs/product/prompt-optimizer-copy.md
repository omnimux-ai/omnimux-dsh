# 优化提示词 · UI 元素与文案锁定规格表

> 适用范围：DSH 会话输入框（Composer）模型选择器左侧「优化提示词」图标按钮。
> 本表为前端实现的**唯一文案真源**：逐字复制，严禁改写、扩写或新增任何未列出的可见文本、图标、Badge、副标题。
> 口径基准：Linear / Vercel / Stripe / Apple HIG —— 零同义重复、零装饰图标、零括号解释。

## 一、UI 元素白名单

| 元素 ID | 类型 | 允许存在 | 显隐/交互规则 | 严禁附加项 |
|---|---|---|---|---|
| `composer.optimizeBtn` | 图标按钮（sparkles/wand 类品牌图标 + tooltip） | ✅ | 输入框非空时启用；空态置灰 | 禁附加文字标签、禁 Badge、禁副标题 |
| `composer.optimizeBtn.spinner` | 运行态 spinner（替换图标本体） | ✅ | 优化进行中替换图标，禁重入 | 禁加「优化中…」等文字、禁进度百分比 |
| `composer.optimizeBtn.tooltip.enabled` | tooltip / aria-label | ✅ | hover/聚焦时显示 | 禁括号解释、禁第二行 |
| `composer.optimizeBtn.tooltip.empty` | 空输入禁用态 tooltip | ❌ 不显示 | 禁用态不渲染任何 tooltip | —— |
| `composer.optimizeBtn.tooltip.noKey` | 未配置 JEV_API_KEY 禁用态 tooltip | ✅ | hover/聚焦时显示 | 禁技术细节（如 env 变量名）、禁第二行 |
| `composer.optimizeBtn.resultBadge` | 命中模板胶囊/徽标 | ❌ 不显示 | 用户已明确否决 | —— |
| `composer.optimizeFailToast` | 失败 toast（唯一错误出口） | ✅ | 失败时短暂显示后自动消失 | 禁错误码、禁重试按钮、禁第二行 |

## 二、逐字文案表（zh + en）

| 元素 ID | zh（逐字锁定） | en（逐字锁定） | 裁定说明 |
|---|---|---|---|
| `composer.optimizeBtn.tooltip.enabled` | `优化提示词` | `Optimize prompt` | 通过。四字动词短语，与 Linear「Improve」系命令命名同级；无对象重复（按钮上下文即输入框）。aria-label 同文案。 |
| `composer.optimizeBtn.tooltip.empty` | —— | —— | **不显示**。输入为空时按钮置灰本身已是充分信号；再加「先输入内容」属冗余说教，违反零冗余原则（同 Linear/Vercel 禁用按钮惯例：静默置灰）。 |
| `composer.optimizeBtn.tooltip.noKey` | `配置 API Key 后可用` | `Requires API key` | 一句、名词性结尾，不带括号与配置指引；详细指引属设置页职责，不属于 tooltip。 |
| `composer.optimizeFailToast` | `优化失败，请重试` | `Couldn't optimize. Try again.` | 一句完成「状态 + 出路」，无错误码、无致歉、无感叹号。 |

## 三、generic-optimize 兜底模板正文（审定稿）

以下为注入输入框的模板正文，前端原样使用占位变量 `{input}`。

**zh：**

```
{input}

要求：
1. 目标明确，可直接执行
2. 步骤具体，无歧义
3. 给出验收标准
```

**en：**

```
{input}

Requirements:
1. Clear, actionable goal
2. Specific, unambiguous steps
3. Explicit acceptance criteria
```

**裁定说明：**

- 草稿中「背景与任务：」「请按以下要求执行：」「先复述你对任务的理解」全部删除——标签行、敬语引导句与「复述理解」均为模板腔冗余，不属于用户可见收益；兜底模板只保留「原指令 + 三条优化要求」的最小骨架。
- `验收标准` 一项保留，是兜底模板对 20 个场景模板缺失时的唯一结构化补偿。
- 全文无营销话术、无修饰形容词、无装饰符号。

## 四、全局红线（复审清单）

1. 按钮旁不得出现任何胶囊、Badge、模板名回显（用户已否决）。
2. 所有 tooltip 单行、无括号、无第二句。
3. toast 单句、无图标堆叠、无操作按钮。
4. 模板正文内不得出现「助力」「赋能」「轻松」「一键」等营销词。
5. 未列入本表的任何可见字符串均视为越权私货，PM_SIGN_OFF 直接 REJECT。
