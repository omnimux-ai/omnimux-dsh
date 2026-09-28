/**
 * Single source for Veo UI/validation defaults.
 *
 * IMPORTANT: generateVideoSilently / opencli currently ignore `mode` and do not
 * push durationSec into the Google Vids page controls. Modes only affect UI
 * labels, placeholders, and request validation until a dedicated behavior issue
 * wires them into the driver.
 */

/** @typedef {{ id: string, label: string, placeholder: string }} VeoModeSpec */

/** @type {readonly VeoModeSpec[]} */
export const VEO_MODES = Object.freeze([
  {
    id: 'create',
    label: '创建',
    placeholder: '描述您想生成的视频画面与动作...',
  },
  {
    id: 'modify',
    label: '修改',
    placeholder: '描述需要对当前视频进行的调整（如光影或服装风格）...',
  },
  {
    id: 'animate',
    label: '动画',
    placeholder: '描述图像素材中应展现的动作与运镜细节...',
  },
  {
    id: 'extend',
    label: '扩展',
    placeholder: '描述当前视频结尾后续发生的情节发展...',
  },
])

export const VEO_MODE_IDS = Object.freeze(VEO_MODES.map((m) => m.id))

export const VEO_TASK_SPEC = Object.freeze({
  modes: VEO_MODES,
  modeIds: VEO_MODE_IDS,
  defaultMode: 'create',
  durationSec: Object.freeze({ min: 3, max: 10, fallback: 10 }),
  resolution: '720p',
  aspectRatio: '16:9',
  /** Fixed capsule copy shown under the composer (not a selectable control). */
  paramCapsule: '720p · 16:9 · 10s',
  editorGatePlaceholder: '请先在右侧创建或打开剪辑工程...',
})

/**
 * @param {string | undefined | null} modeId
 * @returns {VeoModeSpec}
 */
export function resolveVeoMode(modeId) {
  const hit = VEO_MODES.find((m) => m.id === modeId)
  return hit || VEO_MODES[0]
}
