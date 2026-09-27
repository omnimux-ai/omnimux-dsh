/**
 * TikTok Agent preset detection and role gating.
 *
 * 输入框下方快捷方式（QuickShortcuts）是专属于 TikTok 运营专家的功能入口，
 * 其它角色预设（标准模式、软件开发团队、营销专家等）下必须返回 null 保持零 DOM。
 */

export const AGENT_PRESET_CHANGED_EVENT = 'omnimux:agent-preset-changed';

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
 * 显式入参具有绝对优先级（props.agentPreset -> session.projectionValues.agentPreset -> session.agentPreset -> session.meta.agentPreset）。
 * 只要任一显式入参存在且为非空字符串，就以其匹配结果直接返回，绝不向下穿透到全局或 DOM 回退。
 * 只有当所有显式字段均为空/未指定时，才向下回退探测 window.__omnimuxActivePreset 与 DOM 席位。
 *
 * @param {object | null | undefined} session
 * @param {object | null | undefined} props
 * @returns {boolean}
 */
export function isTikTokAgentPreset(session, props) {
  const explicitCandidates = [
    props?.agentPreset,
    session?.projectionValues?.agentPreset,
    session?.agentPreset,
    session?.meta?.agentPreset,
  ];

  for (const candidate of explicitCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return matchesTikTokPreset(candidate);
    }
  }

  // 只有当所有显式字段均为空/未指定时，才向下回退探测 window.__omnimuxActivePreset 与 DOM 席位
  if (typeof window !== 'undefined' && matchesTikTokPreset(window.__omnimuxActivePreset)) {
    return true;
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

/**
 * 订阅活跃 Agent 预设变动。
 * 监听标准全局事件 `omnimux:agent-preset-changed` 及 DOM 席位变动。
 *
 * @param {() => void} callback
 * @returns {() => void} 取消订阅函数
 */
export function subscribeActivePreset(callback) {
  if (typeof window === 'undefined') return () => {};
  const handleEvent = () => {
    callback();
  };
  window.addEventListener(AGENT_PRESET_CHANGED_EVENT, handleEvent);

  let observer = null;
  if (typeof document !== 'undefined' && typeof MutationObserver === 'function') {
    observer = new MutationObserver(() => {
      callback();
    });
    const target = document.body || document.documentElement;
    if (target) {
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-omnimux-preset-seat', 'data-omnimux-preset-id'],
      });
    }
  }

  return () => {
    window.removeEventListener(AGENT_PRESET_CHANGED_EVENT, handleEvent);
    if (observer) observer.disconnect();
  };
}

