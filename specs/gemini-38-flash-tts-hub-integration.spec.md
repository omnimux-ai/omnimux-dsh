# 规格：Gemini 3.8 Flash TTS 中枢契约注册与 CLI 原生直通分发 (Issue #2801)

## 一、目标（Objective）
将通过 `opencli`（底层基于 `ego-browser` 驱动 Google AI Studio 并保持 Nika 音色）接入的 **Gemini 3.8 Flash TTS**，以方案 A（CLI 原生直通）注册进 OmniMux 多模态能力中枢，使之成为系统一级音频模型，供创作画布（Workflow Canvas）、短视频流水线（ClipForge）、AI 专家智能体、多轨剪辑台（OmniMux Clip）等所有业务场景消费。

## 二、架构设计原则（Architecture Principles）
1. **单一对外模型 ID 铁律（SSOT）**：
   - 官方标准模型 ID：`gemini-3.8-flash-tts`；
   - 遵循用户级记忆《单一对外模型 ID 与定价架构铁律》，对外暴露唯一纯净 ID，不派生带渠道或版本后缀的衍生 ID。
2. **能力契约定义（Contract Definition）**：
   - 登记于 `plugins/omnimux/src/catalog/specs/audio-models.yaml`；
   - 操作：`text_to_speech`，输出 `audio`，格式默认 `wav`，音色默认 `Nika`。
3. **CLI 原生直通执行（Execution Routing）**：
   - 在 `plugins/omnimux/src/media/execute.js` 中捕获 `guardPlan.modelId === 'gemini-3.8-flash-tts'`；
   - 路由至独立模块 `plugins/omnimux/src/media/cli-speech.js`；
   - 使用 `execFile` 数组参数调用（杜绝 Shell 注入），传递 `--output <dest> -f json`；
   - 注入 `AbortSignal` 统一超时控制（默认 180s），Fail-closed 校验进程退出码与文件实盘大小。

## 三、用户关键操作旅程与界面交互
1. **创作画布 (Workflow Canvas)**：
   - 用户在画布新建或配置 Audio 节点时，模型下拉列表中可选 `Gemini 3.8 Flash TTS`；
   - 音色参数默认选中 `Nika`；
   - 连接文案并点击生成后，节点展示生成中状态，底层调用 CLI 驱动生成并在实盘落成 WAV 文件，节点自动更新为可播放与连线状态。
2. **AI 专家对话流 / 工具调度**：
   - 智能体通过系统工具 `omnimux_audio_generate` 传入参数 `{ model: "gemini-3.8-flash-tts", prompt: "...", dest: "..." }`；
   - 执行成功后工具返回 `{ mode: "live", model: "gemini-3.8-flash-tts", duration: ..., dest: "..." }`。

## 四、测试与验收策略（Testing Strategy）
1. **契约静态检查**：`node scripts/verify-model-contracts.mjs --strict` 输出 `mode=strict ok=true`。
2. **目录与门禁断言**：`plugins/omnimux/src/media/catalog.test.js` 和 `plugins/omnimux/src/catalog/list.test.js` 的音频模型计数从 7 调整为 8（新增 `gemini-3.8-flash-tts`），且 label 严禁出现英文连字符 `-`。
3. **适配器单测**：编写 `plugins/omnimux/src/media/cli-speech.test.js`，通过模拟子进程覆盖：正常成功返回解析、子进程非零退出、输出 JSON 解析失败、目标文件未落盘、超时 AbortSignal 触发等边界分支。
4. **媒体路由执行单测**：验证 `executeOmnimuxMedia` 对 `gemini-3.8-flash-tts` 分发至 CLI 执行器而非远程 HTTP 网关。

## 五、边界防线（Boundaries）
- **总是做（Always）**：使用 `execFile` 进行参数数组传递防注入；超时中断时清理临时资源；落盘后检验文件存在与非零字节。
- **先问（Ask First）**：修改非本特性相关的其他模型配置；改动底层通用网关协议。
- **绝不做（Never）**：在 label 中使用 ASCII `-` 连字符；在主检出直接改受版本控制的文件；跳过测试门禁直接提交。
