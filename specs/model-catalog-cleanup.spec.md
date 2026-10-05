# 模型清单清理：34 个疑似下线/改名 ID 收口 + index-tts 残留（Issue #3102）

## 目标

upstream-sentinel 检出 34 个本地登记但上游已下线/改名的模型 ID + 厂商源码 `index-tts` 残留。逐个核对并收口：改名→更新 canonical；下线且无后继→标 deprecated/alias 不删；残留 wire 名→清除。

## 处置矩阵（逐个核对后落位）

| ID | 结论 | 处置 |
| --- | --- | --- |
| `index-tts`（厂商源码残留） | 上游改名 indextts-2，已有新登记 | `AUDIO_VIDEO_TASK_MODEL_IDS` 移除旧名；保留 `indextts-2` 在 AUTODL 通道 |
| `seedance-2.0` / `seedance-2.0-fast` / `seedance-2.0-mini` / `seedance-2.5` / `seedream-4.5` / `seedream-5.0-pro` / `seed-audio` / `doubao-seed-audio-1.0` / `tts` | 点号/别名格式，上游有 canonical 横线版 | dispositions 已是 alias→核对 target 正确性，无需改 canonical |
| `grok-imagine-image-*`（5 个）/ `grok-imagine-video-1.5` | 上游无对应型号（上游只有 `grok-4.5/4.6` 与 `grok-imagine-video-1-5`） | 下游改名/下线：按 #3063 先例标 deprecated/alias 指向 `grok-imagine-video-1-5`（图像）或记录 notlocated |
| `kling-avatar` / `kling-o1` | 上游 `kling-o3/v2-6/v3` | 核对是否 alias 指向对应 canonical |
| `h3-max` / `h3-max-turbo` / `minimax-h3-max` / `minimax-h3-max-turbo` | 上游 `minimax-h3*`（无 max/max-turbo） | 核对是否 alias；无则 deprecated |
| `gemini-3.8-flash-tts` / `gpt-4o-mini-tts` | manifest 在售但上游无 | 核查 opencli/渠道文档；无 → deprecated |
| `gpt-image-2` / `gpt-image-2.5-hd` | 上游 `gpt-image-2.5*` | alias/deprecated 指向 canonical |
| `deepseek-v4-flash-vision-exp` | 上游 `deepseek-v4-flash` | alias/deprecated |
| `midjourney` / `midjourney-niji-7` / `nanobanana-2` / `nanobanana-pro` / `seedance2.5-stable-max-720p` / `veo-3.1` / `veo-3.1-fast` / `wan3.0-video` | 上游零命中 | notlocated → deprecated/下架白名单，保留注册作 alias/legacy 兼容 |
| `omnimux-failed` | 内部错误码非模型 ID | 哨兵误报，标记豁免 |

## 验收

- 每个 ID 都有明确 disposition（canonical/alias/deprecated）且 dispositions/manifest/specs/submit-guard 一致；
- `AUDIO_VIDEO_TASK_MODEL_IDS` 不再含 `index-tts`；
- `pnpm verify:model-contracts`、相关 catalog/submit-guard 测试绿；
- 上游新增 77 个仅记录不接入。