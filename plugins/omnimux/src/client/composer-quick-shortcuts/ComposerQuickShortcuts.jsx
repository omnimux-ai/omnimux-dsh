import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  applyQuickShortcut,
  clearQuickShortcutSkill,
  quickShortcutDefaultLinks,
  quickShortcutLinks,
  resolveQuickShortcuts,
} from './catalog.js';
import { getGlobalQuickShortcutStore } from './store.js';
import { readDraft, removeQuickLinkChips, replaceQuickLinkChips, writeDraft } from './dom.js';
import { quickLinkLabels, stripQuickShortcutText } from './links.js';
import { QuickWriteNotice, useQuickWriteNotice } from './notice.jsx';
import { resolveComposerSessionId } from './session.js';
import { ensureQuickShortcutStyles } from './styles.js';
import { QuickShortcutArrow, QuickShortcutIcon } from './icons.jsx';
import { MediaConfigControls, useMediaGenerationConfig } from '../media-viewer/MediaConfigControls.jsx';
import { publishActiveSkill, subscribeSkillChanged } from '../composer-add/skill-event.ts';
import { getGlobalAttachmentStore } from '../attachments/store.ts';
import { isBlankConversation } from '../session-guide/state.js';

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
 *   2. 在输入框光标处插入**默认链接**那一枚胶囊（图标 + 名称 + 可粘贴链接的输入框 + ×，
 *      形态见 `linkChip.js`、样式见 `styles.js`）；整组替换，不留上一条的胶囊。
 *      条目上的 `extraLinks` 不在这里插入——它们只是上方卡槽行的可点项，用户点了才追加；
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
  // 本组件的根节点：所有胶囊动作都以它为锚点定位**本会话**的输入框卡片，
  // 宿主同时挂载多张卡（分屏 / 多标签保活）时不会动到别的会话。
  const rootRef = useRef(null);

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

  const active = useMemo(
    () => shortcuts.find((entry) => entry.id === state.activeId) || null,
    [shortcuts, state.activeId],
  );

  const handlePick = useCallback((entry) => {
    const next = applyQuickShortcut(store.getSnapshot(sessionId).activeId, entry.id);
    if (!next.activeId) {
      // 再点同一条 = 撤回：只剥掉本快捷方式写入的提示语，用户手打的追加文字
      // （含同名的 `[视频]` / `[视频](url)` 令牌）原样保留；胶囊走删除通道清掉。
      const stripped = stripQuickShortcutText(entry, readDraft());
      // 草稿清不掉（宿主桥缺失、`inputActions.setDraft` 缺失或抛错）就整条不生效：
      // 否则会出现「输入框还是原样，卡槽与技能胶囊却已经撤下」的错位状态。
      if (!writeDraft(stripped)) {
        notifyWriteFailed();
        return;
      }
      removeQuickLinkChips(rootRef.current);
      dismissNotice();
      store.set(sessionId, { activeId: null, links: [], skill: null });
      publishActiveSkill(null);
      return;
    }
    const links = quickShortcutLinks(entry);
    // 点快捷方式只预填**默认链接**：`extraLinks` 那几枚是上方卡槽上的可点项，
    // 用户点了卡槽才插进来，不在这里自动插入。
    const defaults = quickShortcutDefaultLinks(entry);
    // 提示语写不进去就整条不生效：否则会出现「输入框空的，卡槽已出现、技能胶囊已亮」。
    if (!writeDraft(entry.prompt)) {
      notifyWriteFailed();
      return;
    }
    // 链接是真正的胶囊节点，插在本会话输入框卡片内的胶囊行；整组替换，不残留上一个快捷方式的胶囊。
    // 胶囊插不进去（拿不到本会话输入框等）只降级为「没有胶囊 + 轻提示」：提示语与技能照旧生效，
    // 上方卡槽仍可点回，不会出现「静默什么都不发生」。
    const inserted = replaceQuickLinkChips(defaults, { labels, t, anchor: rootRef.current });
    if (inserted === defaults.length) dismissNotice();
    else notifyWriteFailed();
    store.set(sessionId, { activeId: entry.id, links, skill: entry.skill });
    publishActiveSkill(entry.skill);
  }, [store, sessionId, labels, t, notifyWriteFailed, dismissNotice]);

  // 只在新对话（空会话）里出现：这是新会话的起手入口，不是会话中的工具条。
  if (useSession && !isBlankConversation(session, hasTargets)) return null;
  if (shortcuts.length === 0) return null;

  const showControls = Boolean(active && active.showModelControls);
  const isActive = (id) => state.activeId === id;

  return (
    <div
      ref={rootRef}
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

      {showControls ? <QuickShortcutModelControls sessionId={sessionId} /> : null}

      <QuickWriteNotice visible={noticeVisible} t={t} />
    </div>
  );
}
