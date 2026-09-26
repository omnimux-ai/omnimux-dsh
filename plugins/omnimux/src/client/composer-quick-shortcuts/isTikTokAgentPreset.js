/**
 * TikTok Agent preset detection and role gating.
 *
 * 输入框下方快捷方式（QuickShortcuts）是专属于 TikTok 运营专家的功能入口，
 * 其它角色预设（标准模式、软件开发团队、营销专家等）下必须返回 null 保持零 DOM。
 */

export const TIKTOK_AGENT_PRESET_WHITELIST = Object.freeze([
  'tiktok-agent',
  'tiktokagent',
  'tiktok-ops-team',
  'TikTok运营专家团',
  'TikTok 运营操盘手',
  'TikTok Ops Team',
]);

const TIKTOK_PRESET_SET = new Set(TIKTOK_AGENT_PRESET_WHITELIST);

function matchesTikTokPreset(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (TIKTOK_PRESET_SET.has(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  for (const item of TIKTOK_AGENT_PRESET_WHITELIST) {
    if (item.toLowerCase() === lower) return true;
  }
  return false;
}

/**
 * 探测当前是否处于 TikTok Agent 预设角色。
 * 支持从 props、session（projectionValues/agentPreset/meta）、window.__omnimuxActivePreset
 * 以及 DOM 席位 [data-omnimux-preset-seat] 或 seatLabel 中探测。
 *
 * @param {object | null | undefined} session
 * @param {object | null | undefined} props
 * @returns {boolean}
 */
export function isTikTokAgentPreset(session, props) {
  const candidates = [
    props?.agentPreset,
    session?.projectionValues?.agentPreset,
    session?.agentPreset,
    session?.meta?.agentPreset,
    typeof window !== 'undefined' ? window.__omnimuxActivePreset : null,
  ];

  for (const candidate of candidates) {
    if (matchesTikTokPreset(candidate)) return true;
  }

  if (typeof document !== 'undefined') {
    const seatEl = document.querySelector('[data-omnimux-preset-seat]');
    if (seatEl) {
      const presetSeat = seatEl.getAttribute('data-omnimux-preset-seat');
      if (matchesTikTokPreset(presetSeat)) return true;
      const presetId = seatEl.getAttribute('data-omnimux-preset-id');
      if (matchesTikTokPreset(presetId)) return true;
    }
    const labelEl = document.querySelector('[class*="seatLabel"]');
    if (labelEl && matchesTikTokPreset(labelEl.textContent)) {
      return true;
    }
  }

  return false;
}
