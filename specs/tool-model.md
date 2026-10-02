# Issue #2959 · 工具模型 Spec

> Matt 风格业务规格：只定义「做什么、为什么、怎么算做完」，不含实现文件路径。前端必须逐字遵守文末《UI 元素白名单》与《逐字文案字典》。

## 1. 背景与问题

OmniMux 设置（设置 → 插件 → 可配置）已有 `omnimux` 命名空间，`ModelsSettingsCard` 渲染四组默认模型下拉，选项来自 `GET /omnimux/model-catalog`。

目前所有 `textComplete` 类工具文本补全（推特 copilot `bridge.completeText`、canvas 文本节点、`omnimux_text_complete` 工具）一律走 `runtimeMode`（official / agent / key）路由，用户无法为这些工具补全单独指定一个模型。用户希望能把工具补全固定到某一个会话可达模型上，而不影响对话主模型与运行模式。

## 2. 方案概述

在 `ModelsSettingsCard` 的 text 组新增一行「工具模型」下拉：

- 选项来源：host 侧把 `llm-pi-ai` settings 命名空间下的 providers 展平为 `provider:modelId` 复合值清单（即「当前会话可达模型列表」），**不**复用 model-catalog。
- 列表首位固定为「自动」项（值 `auto`），语义 = 未配置（字段 unset）。
- 生效语义：配置了具体复合值后，所有 `textComplete` 工具补全**绕过 runtimeMode**，直连 `ctx.llm.stream(provider, model)`；值为 `auto` / 未配置时，行为与今天完全一致。
- 失败语义：所配置的复合值中 provider 或 modelId 已从会话可达列表消失时，调用**响亮报错**（fail loud），不静默回退；UI 下拉如实回显原始值，不改写、不清洗。

## 3. 用户旅程

1. 用户打开 设置 → 插件 → OmniMux 可配置区，找到「模型」卡片的 text 组。
2. 在新增的「工具模型」一行打开下拉：首项为「自动」，其后逐项列出会话可达模型（每项形如「模型名 · 供应商名」）。
3. 用户选择某个具体模型（如 `gpt-5 · openai`），保存设置。
4. 用户回到推特 copilot（或画布文本节点 / `omnimux_text_complete`）触发文本补全；本次补全直连所选 provider:model 生成，不再经过 runtimeMode 路由。
5. 用户把该项改回「自动」后，工具补全恢复到今天的路由行为。

## 4. 可测验收标准（Given / When / Then）

**AC-1 行渲染**
- Given 用户打开 OmniMux 设置卡片；When 页面渲染 text 组；Then 组内出现一行 label 为「工具模型」（zh）/「Tool model」（en）的下拉，且该行不含任何徽章、图标、副标题或说明文字。

**AC-2 选项构成**
- Given host 已展平出会话可达模型清单；When 用户展开「工具模型」下拉；Then 首项为「自动」/「Auto」（值 `auto`），其后每项 label 严格为 `模型名 · 供应商名` 格式（间隔号两端各一个半角空格），value 为对应 `provider:modelId` 复合值。

**AC-3 默认与未配置等价**
- Given 用户从未配置该项；When 下拉渲染；Then 选中态为「自动」/「Auto」，且任意 `textComplete` 调用行为与未引入本功能前完全一致（走 runtimeMode 路由）。

**AC-4 直连生效**
- Given 用户将「工具模型」选为 `providerA:modelB` 并保存；When 推特 copilot `bridge.completeText`、canvas 文本节点或 `omnimux_text_complete` 任一入口发起补全；Then 该请求经 `ctx.llm.stream(providerA, modelB)` 直连执行，不经过 runtimeMode 路由。

**AC-5 配置失效响亮报错**
- Given 已配置的复合值中 provider 或 modelId 从当前会话可达列表消失；When 任一 `textComplete` 入口发起补全；Then 调用方向调用方抛出明确错误（包含失效的复合值信息），不静默回退到其他模型。

**AC-6 失效值如实回显**
- Given 同 AC-5 的失效配置；When 用户打开「工具模型」下拉；Then 下拉回显已存的原始复合值（原样展示），不被改写为 auto 或替换成其他项。

**AC-7 改回自动**
- Given 当前配置为具体复合值；When 用户改选「自动」并保存；Then 后续 `textComplete` 恢复 runtimeMode 路由行为。

**AC-8 文案零自由发挥**
- Given 前端实现完成；When 审查源码中该行所有可见字符串；Then 仅出现《逐字文案字典》中锁定的四个字符串，无任何新增/改写文案。

## 5. UI 元素白名单（唯一授权清单）

仅允许在 `ModelsSettingsCard` 的 **text 组**内新增**一行**下拉，除此之外该区域不得新增任何元素。

| 元素 ID | 元素类型 | 授权内容 | 显隐 / 交互规则 | 显式红线（严禁附加项） |
|---|---|---|---|---|
| `models.rowToolModel` | 下拉行（与 text 组其余行同构） | 行标签 labelKey = `models.rowToolModel` | 常驻显示于 text 组，行位置在该组末尾 | 禁加副标题、说明文字、提示气泡、帮助图标、Beta/New 徽章 |
| `models.rowToolModel.option.auto` | 下拉首项 | 文案见字典，value = `auto` | 永远位于列表首位；选中 = 未配置语义 | 禁加图标、禁加「推荐」等修饰 |
| `models.rowToolModel.option.item` | 下拉项（N 个） | label = `模型名 · 供应商名`，value = `provider:modelId` | 按 host 返回清单逐字渲染，不排序改写、不聚合 | 禁加供应商 Logo/图标、禁加价格/参数注释、禁加分组小标题 |
| `models.rowToolModel.option.stale` | 失效值回显项 | 原始复合值字符串 | 仅当已存值不在当前清单中时追加显示 | 禁加「失效」「已下线」等状态后缀 |

**未列入上表的一切元素（徽章、分割线、提示条、说明段落、图标、二级标题、括号注释）均为非法元素，验收时一票否决。**

## 6. 逐字文案字典（锁定 · 前端零自由发挥）

| key | zh-CN | en-US |
|---|---|---|
| `models.rowToolModel` | `工具模型` | `Tool model` |
| `models.rowToolModel.option.auto` | `自动` | `Auto` |

- 上述四个字符串为最终交付文案，前端只能原样引用，禁止改写、扩写或追加标点。
- 模型选项 label 拼接格式锁定为：`{模型名} · {供应商名}`（间隔号为 U+00B7，两侧各一个半角空格）。
- 除以上条目外，本功能不新增任何 UI 文案。

## 7. 非目标（Out of Scope）

- 不改动任何桥接/补全链路的超时配置。
- 不引入 reasoning / 思考档位选择。
- 不按场景区分工具模型（推特 copilot、canvas、`omnimux_text_complete` 共用同一个值）。
- 不动 `ModelsSettingsCard` 其余四组下拉的选项来源与行为。
- 不做失效值的自动修复、迁移或回退逻辑。

## 8. PM 验收口径

前端自验完成后提交 PM_SIGN_OFF；验收唯一依据为第 5、6 节白名单与字典：出现任何未授权元素或篡改文案即 REJECT，全部命中即 PASS。
