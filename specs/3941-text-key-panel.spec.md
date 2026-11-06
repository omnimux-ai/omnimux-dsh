# 首跑引导「使用自己的 Key」文本模型配置界面（Issue #3941）

## 背景

首跑引导的 BYOK 步骤沿用了设置页的通用多场景表单：模型服务、接口地址、密钥 + 文字工具/素材理解/图片生成/视频生成/音频生成五个模型输入。首跑只需要把文字对话跑起来，多场景字段造成信息过载。用户提供参考图 1：提供商横向卡片、快速填充提供方、API Key（带显示切换）、Base URL、模型下拉、继续按钮。

## 目标

- 仅首跑引导的「使用自己的 Key」步骤改为文本模型专用界面；设置页当前没有注册 BYOK 面板（见 settings-ui.md），本次不新增设置页入口，`ProviderConfigPanel` 源码保持不动。
- 内置 7 家提供商：Anthropic、OpenAI、Azure OpenAI、Google Gemini、Ollama Cloud、SenseAudio、AIHubMix，各带默认 Base URL 与常用文本模型清单。
- 字段：API Key（必填，显示/隐藏）、Base URL、模型下拉；不出现素材理解/图片生成/视频生成/音频生成。
- 「继续」保存：PUT `/omnimux/byok/config`，写入 `models.text`、`capabilities:['text']` 与 `scenarioBindings.text`，成功后关闭引导。

## 非目标

- 不实现真实「拉取模型」网络接口。
- 不改设置页多场景配置与媒体能力。
- 不做浅色主题重绘（沿用应用深色主题）。

## 假设

- 首跑用户只需要文字对话模型；把媒体场景字段从首跑移除不会影响设置页已有的多场景配置路径。
- 七家提供商的 OpenAI 兼容协议共用同一套 BYOK 保存/绑定语义；Google 的 `/v1beta/openai` 根路径已是协议根，客户端不得再追加 `/v1`。
- 文本 provider 使用独立 allowlist（`BYOK_PROVIDERS`），不并入媒体 `MEDIA_PROVIDERS`，避免改变媒体能力判定。

## 证伪方式

- 若设置页打开后 BYOK 面板也不再显示素材理解/图片/视频/音频字段，说明改动越界影响了设置页，假设不成立。
- 运行 `node scripts/runtime-guide-web-qa.mjs`：若 key 步骤出现任一媒体字段、提供商卡片数量不为 7、或 PUT 未携带 `models.text` / `scenarioBindings.text`，则实现不成立。
- 运行 `node --test plugins/omnimux/src/byok/http.test.js`：若任一新增 provider id 被服务端拒绝，则统一协议假设不成立。
- 运行 `node --test plugins/omnimux/src/text/chat-base-url.test.js`：若 Gemini `/v1beta/openai` 仍被追加 `/v1`，则 URL 假设不成立。
- QA 反例：6 个 provider 时 `key-provider-count` 必红；插入媒体字段时 `key-no-media-fields` 必红；移除 `scenarioBindings` 时 `save-binds-text` 必红（见证据 falsification）。

## 验收用例

- S1：key 步骤渲染 7 个提供商卡片、快速填充下拉、API Key（可显示/隐藏）、Base URL、模型下拉、继续按钮。
- S2：切换提供商自动带出默认 Base URL 与该家默认模型；页面无媒体字段文案。
- S3：点击继续 → PUT 携带 provider/models.text/capabilities/scenarioBindings.text → 引导关闭。
- S4：设置页 BYOK 面板仍是原多场景表单（含素材理解/图片/视频/音频字段）。

## 证据

- `scripts/runtime-guide-web-qa.mjs`：key 步骤 7 卡片、无媒体字段、默认模型、保存 PUT 断言与截图。
- `plugins/omnimux/src/client/text-key-panel.test.js`：提供商目录与面板文本-only 契约。
- `plugins/omnimux/src/byok/http.test.js`：新增 provider id 的服务端接受性。
- `scripts/runtime-guide-web-qa.mjs`：空 Key 拒绝、显示/隐藏、provider 切换、7 卡片/无媒体字段/保存体断言与截图；报告含 head/dirty/url。
- 守卫证伪：三条反例红 + 回退后全绿（falsification.txt）。
