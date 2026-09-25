/**
 * Google Vids (Veo) 视频生成中枢核心数据契约与指令模板
 * @module omnimux-video/contracts/veoContracts
 */

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
 * 校验生成请求入参是否合法
 * @param {Object} req - 请求载荷
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateVeoTaskRequest(req) {
  if (!req || typeof req !== 'object') {
    return { valid: false, error: '任务请求载荷必须为有效对象' };
  }
  if (!req.prompt || typeof req.prompt !== 'string' || !req.prompt.trim()) {
    return { valid: false, error: '必须提供有效的视频生成提示词' };
  }
  const mode = req.mode || 'create';
  if (!['create', 'modify', 'animate', 'extend'].includes(mode)) {
    return { valid: false, error: `不支持的视频生成模式: ${mode}` };
  }
  const duration = req.parameters?.durationSec ?? 10;
  if (typeof duration !== 'number' || duration < 3 || duration > 10) {
    return { valid: false, error: '生成时长必须在 3 秒至 10 秒之间' };
  }
  return { valid: true };
}
