import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  applyQuickShortcut,
  clearQuickShortcutSkill,
  quickShortcutLinks,
  resolveQuickShortcuts,
} from './catalog.js';
import { getGlobalQuickShortcutStore } from './store.js';
import { useOwnedPrompt } from './useOwnedPrompt.ts';
import { writeDraft } from './dom.js';
import { QuickWriteNotice, useQuickWriteNotice } from './notice.jsx';
import { resolveComposerSessionId } from './session.js';
import { acquireQuickShortcutStyles } from './styles.js';
import { QuickShortcutArrow, QuickShortcutIcon } from './icons.jsx';
import { ModelPicker } from './ModelPicker.jsx';
import { publishActiveSkill, subscribeSkillChanged } from '../composer-add/skill-event.ts';
import { getGlobalAttachmentStore } from '../attachments/store.ts';
import { isBlankConversation } from '../session-guide/state.js';
import {
  isTikTokAgentPreset,
  TIKTOK_AGENT_PRESET_WHITELIST,
} from './isTikTokAgentPreset.js';

export { isTikTokAgentPreset, TIKTOK_AGENT_PRESET_WHITELIST };

/** 技能库通道就绪前的重试节奏：插件装载顺序不保证，指数退避 200ms → 3200ms，8 次合计约 16 秒。 */
const SKILL_LIBRARY_RETRY_BASE_MS = 200;
const SKILL_LIBRARY_RETRY_MAX_MS = 3200;
const SKILL_LIBRARY_RETRY_LIMIT = 8;

/**
 * 读取跨插件技能库通道（由 `omnimux-market` 的 `apply.js` 发布）。
 *
 * 通道只暴露 `resolvePresetSkill(slug)`，**不带 sessionId，属有意设计**：
 * 技能数据是出厂预设的全局只读目录，与会话无关；带上会话 id 只会让人以为
 * 存在会话级技能解析，反而诱导出第二份真源。会话级状态一律留在本插件的
 * `store.js`（按 sessionId 分行），两侧不混。
 *
 * @returns {{ resolvePresetSkill?: (slug: string) => object | null } | null}
 */
function readSkillLibrary() {
  if (typeof window === 'undefined') return null;
  return window.__omnimuxSkillLibrary || null;
}

/**
 * 方案 B 经典会话模型选择器：只有 `clone` 与 `selling` 两条需要。
 * 彻底移除相机生成参数面板及参数摘要按钮，仅保留由 Agent 自主选型的会话模型选择器。
 */
function QuickShortcutModelControls({ sessionId }) {
  return (
    <div className="omx-quick-shortcut-controls" data-omx-quick-shortcut-controls="true">
      <ModelPicker sessionId={sessionId} />
    </div>
  );
}

/** 官方底部扩展座：与外部快捷入口共用会话快照，不复制配置状态。 */
export function ComposerQuickShortcutControls(props) {
  const { sessionId: sessionIdProp, session: sessionProp, useSession, useConversation } = props || {};
  const session = useSession ? useSession((value) => value) : null;
  const currentSession = sessionProp || session;
  const hasTargets = useConversation ? useConversation((value) => Boolean(value?.activeTargets?.size)) : false;
  const sessionId = resolveComposerSessionId(currentSession, sessionIdProp, getGlobalAttachmentStore().getActiveSessionId());
  const store = getGlobalQuickShortcutStore();
  const subscribe = useCallback((listener) => store.subscribe(sessionId, listener), [store, sessionId]);
  const snapshot = useCallback(() => store.getSnapshot(sessionId), [store, sessionId]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => acquireQuickShortcutStyles(), []);
  if (!isTikTokAgentPreset(currentSession, props)) return null;
  if (useSession && !isBlankConversation(session, hasTargets)) return null;
  if (state.activeId !== 'clone' && state.activeId !== 'selling') return null;
  return <QuickShortcutModelControls key={sessionId} sessionId={sessionId} />;
}

/**
 * 输入框**下方**的四条快捷方式。
 *
 * 提示语首次追加到正文末尾；切换或撤回只编辑仍可靠归属于本组件的范围。
 * 链接卡槽只是添加入口，快捷方式不创建或删除正文链接。
 * 已内置技能通过既有 `publishActiveSkill` 通道选中。
 *
 * `clone` / `selling` 额外给出「模型」「参数」两个按钮，直接消费媒体面板的
 * 既有配置控件；`breakdown` / `reverse` 一条不显示。
 * 技能在出厂预设技能库里解析不到时，这一条**整条不渲染**，且不报错。
 */
export function ComposerQuickShortcuts(props) {
  const {
    t,
    sessionId: sessionIdProp,
    session: sessionProp,
    useSession,
    useConversation,
  } = props || {};

  const store = getGlobalQuickShortcutStore();
  const input = props.useInput?.(value => value);

  const session = useSession ? useSession((value) => value) : null;
  const hasTargets = useConversation ? useConversation((value) => value && value.activeTargets ? value.activeTargets.size > 0 : false) : false;

  // 会话标识与附件托盘走同一条派生链（唯一实现在 `session.js`）：两侧必须命中
  // 同一行，链接卡槽才会出现在本会话、技能胶囊的 ✕ 才回写本会话、模型才钉对本会话。
  const sessionId = resolveComposerSessionId(
    sessionProp || session,
    sessionIdProp,
    getGlobalAttachmentStore().getActiveSessionId(),
  );

  const ownedPrompt = useOwnedPrompt(input, sessionId, props.mutatePrompt);
  const writePrompt = useCallback((text) => {
    if (input && typeof props?.mutatePrompt === 'function') {
      return ownedPrompt(text);
    }
    return writeDraft(text);
  }, [input, props?.mutatePrompt, ownedPrompt]);
  useEffect(() => acquireQuickShortcutStyles(), []);

  // 出厂技能库是跨插件通道，插件装载顺序不保证：未就绪时按指数退避重试；
  // 预算用尽仍拿不到就留痕（不静默），并保留「窗口重新可见/获得焦点」的兜底重查。
  const [library, setLibrary] = useState(() => readSkillLibrary());
  useEffect(() => {
    if (library) return undefined;
    let cancelled = false;
    let timer = null;

    const recheck = () => {
      if (cancelled) return false;
      const found = readSkillLibrary();
      if (!found) return false;
      setLibrary(found);
      return true;
    };
    const onWake = () => {
      if (recheck()) detach();
    };
    const detach = () => {
      if (typeof window === 'undefined') return;
      window.removeEventListener('focus', onWake);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onWake);
    };
    const attach = () => {
      if (typeof window === 'undefined') return;
      window.addEventListener('focus', onWake);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onWake);
    };

    let tries = 0;
    const scheduleNext = () => {
      if (cancelled) return;
      if (tries >= SKILL_LIBRARY_RETRY_LIMIT) {
        console.warn(
          '[omnimux] 快捷方式技能库通道始终未就绪（window.__omnimuxSkillLibrary 缺失）：'
          + `已按指数退避重试 ${SKILL_LIBRARY_RETRY_LIMIT} 次（约 16 秒），四条快捷方式暂不渲染；`
          + '窗口重新获得焦点时会再查一次。',
        );
        attach();
        return;
      }
      const delay = Math.min(SKILL_LIBRARY_RETRY_BASE_MS * 2 ** tries, SKILL_LIBRARY_RETRY_MAX_MS);
      timer = setTimeout(() => {
        tries += 1;
        if (!recheck()) scheduleNext();
      }, delay);
    };
    scheduleNext();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      detach();
    };
  }, [library]);

  const shortcuts = useMemo(
    () => resolveQuickShortcuts((slug) => (library && typeof library.resolvePresetSkill === 'function'
      ? library.resolvePresetSkill(slug)
      : null)),
    [library],
  );

  const subscribe = useCallback((listener) => store.subscribe(sessionId, listener), [store, sessionId]);
  const getSnapshot = useCallback(() => store.getSnapshot(sessionId), [store, sessionId]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // 技能药丸被 ✕ 撤下时只动技能：提示语与链接卡槽原样保留。
  // 归约规则只有 `clearQuickShortcutSkill` 一份实现，组件不再内联第二份。
  useEffect(() => subscribeSkillChanged((skill) => {
    const current = store.getSnapshot(sessionId);
    if (!current.skill) return;
    if (skill) return;
    store.set(sessionId, clearQuickShortcutSkill(current));
  }), [store, sessionId]);

  // 写不进输入框时的轻提示（序号驱动，重复触发也能重新出现，4 秒后自动收起）。
  // 状态与展示组件由 `notice.jsx` 提供，素材卡槽行那条通道用的是同一份。
  const { visible: noticeVisible, notify: notifyWriteFailed, dismiss: dismissNotice } = useQuickWriteNotice();

  const handlePick = useCallback((entry) => {
    const next = applyQuickShortcut(store.getSnapshot(sessionId).activeId, entry.id);
    if (!next.activeId) {
      // 撤回只删除可靠自有提示语；归属丢失则保留正文，仍可撤下入口与技能。
      if (!writePrompt('')) {
        notifyWriteFailed();
        return;
      }

      dismissNotice();
      store.set(sessionId, { activeId: null, links: [], skill: null });
      publishActiveSkill(null);
      return;
    }
    const links = quickShortcutLinks(entry);
    // 卡槽提供链接添加入口，正文仅通过受保护的提示语范围编辑。
    // 宿主拒绝编辑时不切换入口与技能。
    if (!writePrompt(entry.prompt)) {
      notifyWriteFailed();
      return;
    }
    dismissNotice();
    store.set(sessionId, { activeId: entry.id, links, skill: entry.skill });
    publishActiveSkill(entry.skill);
  }, [store, sessionId, writePrompt, notifyWriteFailed, dismissNotice]);

  // 只在新对话（空会话）且为 TikTok Agent 角色时出现；
  // 必须全部 4 条快捷方式命中已内置技能时才完整渲染，残缺不展示。
  if (useSession && !isBlankConversation(session, hasTargets)) return null;
  if (!isTikTokAgentPreset(sessionProp || session, props)) return null;
  if (shortcuts.length !== 4) return null;

  const isActive = (id) => state.activeId === id;

  return (
    <div
      className="omx-quick-shortcuts"
      data-omnimux-quick-shortcuts="true"
      role="group"
      aria-label={typeof t === 'function' ? (t('quickShortcuts.group') || '快捷方式') : '快捷方式'}
    >
      {shortcuts.map((entry) => (
        <button /* exempt-ui01: 快捷方式入口（无边框「图标 + 文字 + 箭头」） */
          key={entry.id}
          type="button"
          className={`omx-quick-shortcut-btn${isActive(entry.id) ? ' is-active' : ''}`}
          data-omx-quick-shortcut={entry.id}
          data-omx-quick-shortcut-icon={entry.icon}
          aria-pressed={isActive(entry.id)}
          onClick={() => handlePick(entry)}
        >
          <QuickShortcutIcon name={entry.icon} />
          <span className="omx-quick-shortcut-label">
            {typeof t === 'function' ? (t(entry.labelKey) || entry.id) : entry.id}
          </span>
          <QuickShortcutArrow />
        </button>
      ))}

      <QuickWriteNotice visible={noticeVisible} t={t}
        messageKey="quickShortcuts.notice.promptUnconfirmed"
        fallback="无法确认草稿状态，原内容已保留。请编辑正文后重试。" />
    </div>
  );
}
