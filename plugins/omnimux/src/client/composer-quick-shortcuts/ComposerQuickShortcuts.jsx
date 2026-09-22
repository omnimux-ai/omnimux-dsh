import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  applyQuickShortcut,
  quickShortcutLinks,
  resolveQuickShortcuts,
} from './catalog.js';
import { getGlobalQuickShortcutStore } from './store.js';
import { readDraft, writeDraft } from './dom.js';
import { quickLinkLabels, quickLinkToken, stripQuickShortcutText } from './links.js';
import { resolveComposerSessionId } from './session.js';
import { ensureQuickShortcutStyles } from './styles.js';
import { MediaConfigControls, useMediaGenerationConfig } from '../media-viewer/MediaConfigControls.jsx';
import { publishActiveSkill, subscribeSkillChanged } from '../composer-add/skill-event.ts';
import { getGlobalAttachmentStore } from '../attachments/store.ts';
import { isBlankConversation } from '../session-guide/state.js';

/** 技能库通道就绪前的重试节奏：插件装载顺序不保证，指数退避 200ms → 3200ms，8 次合计约 16 秒。 */
const SKILL_LIBRARY_RETRY_BASE_MS = 200;
const SKILL_LIBRARY_RETRY_MAX_MS = 3200;
const SKILL_LIBRARY_RETRY_LIMIT = 8;

/** 写不进输入框时的轻提示：内容固定一条，重复触发靠序号刷新，4 秒后自动收起。 */
const NOTICE_TIMEOUT_MS = 4000;

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
 * 模型 / 参数按钮：只有 `clone` 与 `selling` 两条需要。
 *
 * 单独成组件是为了 `useMediaGenerationConfig`——它会拉一次
 * `/omnimux/model-catalog`。挂在父组件里时，非空会话（父组件随后就返回 null）
 * 也会白跑一次请求；放进子组件后，只有真的选中这两条时才会发生。
 */
function QuickShortcutModelControls({ sessionId }) {
  const mediaConfig = useMediaGenerationConfig({ initialMode: 'video' });
  return (
    <div className="omx-quick-shortcut-controls" data-omx-quick-shortcut-controls="true">
      <MediaConfigControls
        config={mediaConfig}
        showModeSwitch={false}
        showModelSummary
        onModelChange={({ model }) => {
          if (!model) return;
          try {
            fetch('/omnimux/session-model', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({
                sessionId,
                auto: false,
                modelId: model.id || '',
                label: model.name || model.id || '',
              }),
            }).catch(() => {});
          } catch {
            // 中枢不可达不能让一次选择变成报错
          }
        }}
      />
    </div>
  );
}

/**
 * 输入框**下方**的四条快捷方式。
 *
 * 点任意一条同时完成三件事：
 *   1. 写好提示语（整组替换，不追加）；
 *   2. 放入对应链接胶囊（`[视频]` / `[商品]`，卡槽行在输入框内侧上方，
 *      由素材导轨同一行承载）；
 *   3. 选中一款已内置技能（走既有全局通道 `publishActiveSkill`，
 *      底部技能药丸据此亮起）。
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
  const labels = useMemo(() => quickLinkLabels(t), [t]);

  const session = useSession ? useSession((value) => value) : null;
  const hasTargets = useConversation ? useConversation((value) => value && value.activeTargets ? value.activeTargets.size > 0 : false) : false;

  // 会话标识与附件托盘走同一条派生链（唯一实现在 `session.js`）：两侧必须命中
  // 同一行，链接卡槽才会出现在本会话、技能胶囊的 ✕ 才回写本会话、模型才钉对本会话。
  const sessionId = resolveComposerSessionId(
    sessionProp || session,
    sessionIdProp,
    getGlobalAttachmentStore().getActiveSessionId(),
  );

  useEffect(() => ensureQuickShortcutStyles(), []);

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
  useEffect(() => subscribeSkillChanged((skill) => {
    const current = store.getSnapshot(sessionId);
    if (!current.skill) return;
    if (skill) return;
    store.set(sessionId, { skill: null });
  }), [store, sessionId]);

  // 写不进输入框时的轻提示（序号驱动，重复触发也能重新出现，4 秒后自动收起）。
  const [noticeSeq, setNoticeSeq] = useState(0);
  useEffect(() => {
    if (noticeSeq === 0) return undefined;
    const timer = setTimeout(() => setNoticeSeq(0), NOTICE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [noticeSeq]);

  const active = useMemo(
    () => shortcuts.find((entry) => entry.id === state.activeId) || null,
    [shortcuts, state.activeId],
  );

  const handlePick = useCallback((entry) => {
    const next = applyQuickShortcut(store.getSnapshot(sessionId).activeId, entry.id);
    if (!next.activeId) {
      // 再点同一条 = 撤回：只清本快捷方式写入的提示语与链接令牌，用户手打的
      // 追加文字原样保留；技能同步撤下。
      const stripped = stripQuickShortcutText(entry, readDraft());
      // 草稿清不掉（宿主桥缺失、`inputActions.setDraft` 缺失或抛错）就整条不生效：
      // 否则会出现「输入框还是原样，卡槽与技能胶囊却已经撤下」的错位状态。
      if (!writeDraft(stripped)) {
        setNoticeSeq((n) => n + 1);
        return;
      }
      setNoticeSeq(0);
      store.set(sessionId, { activeId: null, links: [], skill: null });
      publishActiveSkill(null);
      return;
    }
    const links = quickShortcutLinks(entry);
    const tokens = links.map((kind) => quickLinkToken(labels[kind])).filter(Boolean);
    const text = tokens.length > 0 ? `${entry.prompt}\n\n${tokens.join(' ')}` : entry.prompt;
    // 提示语写不进去就整条不生效：否则会出现「输入框空的，卡槽已出现、技能胶囊已亮」。
    if (!writeDraft(text)) {
      setNoticeSeq((n) => n + 1);
      return;
    }
    setNoticeSeq(0);
    store.set(sessionId, { activeId: entry.id, links, skill: entry.skill });
    publishActiveSkill(entry.skill);
  }, [store, sessionId, labels]);

  // 只在新对话（空会话）里出现：这是新会话的起手入口，不是会话中的工具条。
  if (useSession && !isBlankConversation(session, hasTargets)) return null;
  if (shortcuts.length === 0) return null;

  const showControls = Boolean(active && active.showModelControls);
  const isActive = (id) => state.activeId === id;

  return (
    <div
      className="omx-quick-shortcuts"
      data-omnimux-quick-shortcuts="true"
      role="group"
      aria-label={typeof t === 'function' ? (t('quickShortcuts.group') || '快捷方式') : '快捷方式'}
    >
      {shortcuts.map((entry) => (
        <button /* exempt-ui01: 快捷方式胶囊按钮 */
          key={entry.id}
          type="button"
          className={`omx-quick-shortcut-btn${isActive(entry.id) ? ' is-active' : ''}`}
          data-omx-quick-shortcut={entry.id}
          aria-pressed={isActive(entry.id)}
          onClick={() => handlePick(entry)}
        >
          {typeof t === 'function' ? (t(entry.labelKey) || entry.id) : entry.id}
        </button>
      ))}

      {showControls ? <QuickShortcutModelControls sessionId={sessionId} /> : null}

      {noticeSeq > 0 ? (
        <p className="omx-quick-shortcut-notice" role="status">
          {typeof t === 'function' ? (t('quickShortcuts.notice.writeFailed') || '输入框未就绪，请重试') : '输入框未就绪，请重试'}
        </p>
      ) : null}
    </div>
  );
}
