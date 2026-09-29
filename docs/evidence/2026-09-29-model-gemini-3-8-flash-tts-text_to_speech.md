---
title: "Gemini 3.8 Flash TTS 文本转语音（TTS）本地 CLI 原生直通执行证据"
id: "evidence-model-gemini-3-8-flash-tts-text-to-speech"
type: "evidence"
status: "living"
date: "2026-09-29"
authors: ["齐活林", "寇豆码", "严过关"]
subsystem: "omnimux/media"
---

# Gemini 3.8 Flash TTS — 语音合成（TTS / text_to_speech）CLI 原生执行证据

## 1. 验证目标与说明
本证据记录遵循模型接口准据与单一对外模型 ID 原则。
通过本地 opencli gemini tts 驱动（底层通过 ego-browser 无头调用 Google AI Studio 的 Gemini 3.8 Flash TTS，角色保持 Nika），对中枢音频能力 `audioGenerate`、模型 `gemini-3.8-flash-tts` 进行 CLI 原生直通分发支持。

## 2. CLI 驱动与响应证据
- **CLI 调用命令**：`opencli gemini tts <text> --output <dest> -f json`
- **底层驱动实现**：`/Users/x/Desktop/Project/视频拆解/scripts/gemini_tts.mjs`
- **模型特征**：
  - Model ID: `gemini-3.8-flash-tts`
  - Voice: `Nika` (默认角色)
  - 格式: WAV 音频
  - 输出格式: JSON 结构化返回（包含 Status, Character, Duration, Size, OutputPath, Text）
