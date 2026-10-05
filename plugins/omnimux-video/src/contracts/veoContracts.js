/**
 * Google Vids (Veo) 视频生成中枢核心数据契约与指令模板
 * @module omnimux-video/contracts/veoContracts
 */

import {
  VEO_TASK_SPEC,
  VIDS_ERROR_CODES,
  VIDS_MODES,
  buildVidsRequest,
} from '../shared/veoTaskSpec.js'

/**
 * 谷歌底层 Protobuf 二进制数据包映射模板
 * @description
 * 374: 纯文本生成指令 (Text-to-Video)
 * 376: 携带参考图素材生成指令 (Reference Image-to-Video)
 */
export const GOOGLE_VIDS_PROTO_TEMPLATES = {
  // 纯文生视频 (374 模板)
  TEXT_TO_VIDEO: (docId, promptText, durationSec = 10) => [
    374,
    null,
    [
      9,
      null,
      null,
      null,
      `goog_${Date.now()}`,
      null,
      "0",
      null,
      [
        null,
        null,
        null,
        [[[null, null, null, null, null, null, null, [null, null, [[docId, "application/vnd.google-apps.flix", null, null, 1]]]]]]
      ],
      null,
      null,
      [24, 0],
      null,
      "en",
      null,
      null,
      null,
      null,
      null,
      1,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      0
    ],
    [
      null,
      null,
      null,
      [[[null, null, promptText]]]
    ],
    [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      [0, 12, null, 0, 1, null, null, null, durationSec]
    ],
    [1, null, [[null, "1", 1189]]],
    1
  ],

  // 参考图生视频 (376 模板)
  IMAGE_TO_VIDEO: (docId, promptText, assetToken, assetUuid, durationSec = 10) => [
    376,
    null,
    [
      9,
      null,
      null,
      null,
      `goog_${Date.now()}`,
      null,
      "0",
      null,
      [
        null,
        null,
        null,
        [[[null, null, null, null, null, null, null, [null, null, [[docId, "application/vnd.google-apps.flix", null, null, 1]]]]]]
      ],
      null,
      null,
      [24, 0],
      null,
      "en",
      null,
      null,
      null,
      null,
      null,
      1,
      null,
      null,
      null,
      null,
      null,
      [
        [
          [
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            [
              assetUuid,
              [
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                [
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  [null, null, null, assetToken, 1],
                  null,
                  null,
                  null,
                  null,
                  "图片 1"
                ]
              ]
            ]
          ]
        ]
      ],
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      0
    ],
    [
      null,
      null,
      null,
      [
        [
          [null, null, promptText],
          [null, null, " "],
          [
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            [null, [null, null, "图片 1"], [null, null, null, null, null, null, null, [assetUuid]]]
          ]
        ]
      ]
    ],
    [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      [0, 12, null, 0, 1, null, null, null, durationSec]
    ],
    [1, null, [[null, "1", 1189]]],
    1
  ]
};

/**
 * 取第一个有值的候选字段（新契约顶层 snake_case 优先，兼容旧契约的顶层 durationSec）。
 * @param {Record<string, unknown>} req
 * @param {string[]} keys
 * @returns {unknown}
 */
function pickFirst(req, keys) {
  for (const key of keys) {
    const value = req[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

/**
 * 校验生成请求入参是否合法。
 *
 * 同时接受两种请求形状（Issue #3181）：
 * - 四模式新契约：`{ mode, operation, prompt, seconds, resolution, aspect_ratio, image_url?, video_id? }`
 * - 旧契约：`{ prompt, mode?, durationSec? | parameters: { durationSec } }`
 *
 * 参数域与必需输入全部派生自 `veoTaskSpec.js`（单一真源），**不做静默钳制**：
 * 越界秒数、未知分辨率/比例、缺必需素材一律返回可读中文原因与稳定错误码。
 *
 * @param {Object} req - 请求载荷
 * @returns {{ valid: true, request: { operation: string, mode: string, prompt: string, seconds: number, resolution: string, aspect_ratio: string, image_url?: string, video_id?: string } }
 *   | { valid: false, code: string, error: string }}
 */
export function validateVeoTaskRequest(req) {
  if (!req || typeof req !== 'object') {
    return { valid: false, code: VIDS_ERROR_CODES.invalidPayload, error: '任务请求载荷必须为有效对象' };
  }

  const rawMode = req.mode;
  if (rawMode !== undefined && rawMode !== null && typeof rawMode !== 'string') {
    return { valid: false, code: VIDS_ERROR_CODES.unknownMode, error: `不支持的视频生成模式: ${String(rawMode)}` };
  }
  const mode = typeof rawMode === 'string' && rawMode.trim() ? rawMode.trim() : VEO_TASK_SPEC.defaultMode;
  if (!VEO_TASK_SPEC.modeIds.includes(mode)) {
    return { valid: false, code: VIDS_ERROR_CODES.unknownMode, error: `不支持的视频生成模式: ${mode}` };
  }

  // 模式 → 中枢操作由真源派生；显式传入的 operation 必须与模式一致，否则报错而不是静默改写。
  const modeSpec = VIDS_MODES.find((m) => m.id === mode);
  const operation = typeof req.operation === 'string' ? req.operation.trim() : '';
  if (operation && operation !== modeSpec.operation) {
    return {
      valid: false,
      code: VIDS_ERROR_CODES.invalidPayload,
      error: `生成模式「${modeSpec.title}」对应的操作应为 ${modeSpec.operation}，收到 ${operation}`,
    };
  }

  // 新契约用顶层 seconds；旧契约用顶层 durationSec 或 parameters.durationSec。
  const seconds = pickFirst(req, ['seconds', 'durationSec']) ?? req.parameters?.durationSec;

  const built = buildVidsRequest({
    mode,
    prompt: req.prompt,
    seconds,
    resolution: req.resolution,
    aspectRatio: req.aspect_ratio,
    imageUrl: req.image_url,
    videoId: req.video_id,
  });
  if (!built.ok) {
    return { valid: false, code: built.code, error: built.message };
  }
  return { valid: true, request: built.request };
}
