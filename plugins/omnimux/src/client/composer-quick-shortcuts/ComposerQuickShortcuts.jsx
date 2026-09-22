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

/** 技能库通道就绪前的重试节奏：插件装载顺序不保证，最多等 3 秒。 */
const SKILL_LIBRARY_RETRY_MS = 200;
const SKILL_LIBRARY_RETRY_LIMIT = 15;

/**
 * 读取跨插件技能库通道（由 `omnimux-market` 的 `apply.js` 发布）。
 * @returns {{ resolvePresetSkill?: (slug: string) => object | null } | null}
 */
function readSkillLibrary() {
  if (typeof window === 'undefined') return null;
  return window.__omnimuxSkillLibrary || null;
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
    useInput,
    inputActions,
    useSession,
    useConversation,
  } = props || {};

  const store = getGlobalQuickShortcutStore();
  const labels = useMemo(() => quickLinkLabels(t), [t]);

  const draft = useInput ? useInput((value) => (value && value.draft) || '') : '';
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

  // 出厂技能库是跨插件通道，插件装载顺序不保证：未就绪时短暂重试，
  // 拿到就定下来；始终拿不到就按「技能缺失」处理（不渲染，不报错）。
  const [library, setLibrary] = useState(() => readSkillLibrary());
  useEffect(() => {
    if (library) return undefined;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const found = readSkillLibrary();
      if (found) {
        setLibrary(found);
        clearInterval(timer);
        return;
      }
      if (tries >= SKILL_LIBRARY_RETRY_LIMIT) clearInterval(timer);
    }, SKILL_LIBRARY_RETRY_MS);
    return () => clearInterval(timer);
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

  const mediaConfig = useMediaGenerationConfig({ initialMode: 'video' });

  const active = useMemo(
    () => shortcuts.find((entry) => entry.id === state.activeId) || null,
    [shortcuts, state.activeId],
  );

  const handlePick = useCallback((entry) => {
    const next = applyQuickShortcut(store.getSnapshot(sessionId).activeId, entry.id);
    if (!next.activeId) {
      // 再点同一条 = 撤回：只清本快捷方式写入的提示语与链接令牌，用户手打的
      // 追加文字原样保留；技能同步撤下。
      const stripped = stripQuickShortcutText(entry, readDraft(), labels);
      // 草稿清不掉（宿主桥缺失或抛错）就整条不生效：否则会出现
      // 「输入框还是原样，卡槽与技能胶囊却已经撤下」的错位状态。
      if (!writeDraft(stripped)) return;
      store.set(sessionId, { activeId: null, links: [], skill: null });
      publishActiveSkill(null);
      return;
    }
    const links = quickShortcutLinks(entry);
    const tokens = links.map((kind) => quickLinkToken(labels[kind])).filter(Boolean);
    const text = tokens.length > 0 ? `${entry.prompt}\n\n${tokens.join(' ')}` : entry.prompt;
    // 提示语写不进去就整条不生效：否则会出现「输入框空的，卡槽已出现、技能胶囊已亮」。
    if (!writeDraft(text)) return;
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

      {showControls ? (
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
      ) : null}

      {/* 草稿回执：提示语已写好（只读镜像，避免用户以为点了没反应） */}
      <span className="omx-quick-shortcut-draft-mirror" data-omx-quick-shortcut-draft={draft ? 'filled' : 'empty'} hidden />
    </div>
  );
}

export default ComposerQuickShortcuts;
