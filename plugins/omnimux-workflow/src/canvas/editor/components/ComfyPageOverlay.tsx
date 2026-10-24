/**
 * ComfyUI 页面全屏层（Issue #3681 M1）。
 *
 * 与导演台同款约定：监听 `COMFY_PAGE_OPEN_EVENT`（detail: { nodeId }），从画布 store
 * 解析该节点的目标地址，然后：
 *   1. 先探测目标是否有人应答（`fetch(url, { mode: 'no-cors' })`，不要求目标站开 CORS）；
 *   2. 可达 → 渲染 iframe（真 ComfyUI 即完整编辑器）；不可达 → 渲染引导层（说明 + 地址
 *      输入 + 重试 + 关闭），绝不静默空白；
 *   3. 探测结果写回节点数据（`status`），节点卡因此能显示「已连接 / 未检测到页面」。
 *
 * 同一时刻最多一个全屏层：再次打开只切换 nodeId；关闭时卸载 iframe（不留后台连接）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { useCanvasStore } from '../../store/canvasStore';
import {
  COMFY_PAGE_PROBE_TIMEOUT_MS,
  comfyPageUrlFromData,
  normalizeComfyPageUrl,
  type ComfyPageUrlReason,
} from '../utils/comfyPageUrl';
import { COMFY_PAGE_OPEN_EVENT } from '../../nodes/definitions/comfyPage';

type ProbeState = 'probing' | 'connected' | 'unreachable';

const REASON_KEY: Record<ComfyPageUrlReason, string> = {
  empty: 'comfyPage.guide.reasonEmpty',
  scheme: 'comfyPage.guide.reasonScheme',
  invalid: 'comfyPage.guide.reasonInvalid',
};

export function ComfyPageOverlay() {
  const t = useT();
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState('');
  const [probe, setProbe] = useState<ProbeState>('probing');
  const [reason, setReason] = useState<ComfyPageUrlReason | null>(null);
  /** 每次「重试」递增，驱动重新探测。 */
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const patchNodeStatus = useCallback((id: string, status: string) => {
    useCanvasStore.getState().setNodes((nodes) =>
      nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, status } } : node)),
    );
  }, []);

  // 打开事件：解析节点地址，重置草稿与探测态。
  useEffect(() => {
    const listener = (event: Event) => {
      const id = (event as CustomEvent<{ nodeId?: unknown }>).detail?.nodeId;
      if (typeof id !== 'string') return;
      const node = useCanvasStore.getState().nodes.find((item) => item.id === id);
      if (!node || node.type !== 'comfy-page') return;
      const target = comfyPageUrlFromData(node.data as Record<string, unknown>);
      setNodeId(id);
      setUrl(target);
      setDraft(target);
      setReason(null);
      setProbe('probing');
      setAttempt((value) => value + 1);
    };
    window.addEventListener(COMFY_PAGE_OPEN_EVENT, listener);
    return () => window.removeEventListener(COMFY_PAGE_OPEN_EVENT, listener);
  }, []);

  // 探测：不依赖目标站 CORS；超时按不可达处理。
  useEffect(() => {
    if (!nodeId) return;
    let stopped = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), COMFY_PAGE_PROBE_TIMEOUT_MS);
    setProbe('probing');
    patchNodeStatus(nodeId, 'probing');
    fetch(url, { mode: 'no-cors', signal: controller.signal, cache: 'no-store' })
      .then(() => {
        if (stopped) return;
        setProbe('connected');
        patchNodeStatus(nodeId, 'connected');
      })
      .catch(() => {
        if (stopped) return;
        setProbe('unreachable');
        patchNodeStatus(nodeId, 'unreachable');
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [nodeId, url, attempt, patchNodeStatus]);

  const close = useCallback(() => {
    if (nodeId) patchNodeStatus(nodeId, 'idle');
    setNodeId(null);
  }, [nodeId, patchNodeStatus]);

  // ESC 退出；只在打开时监听。
  useEffect(() => {
    if (!nodeId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodeId, close]);

  if (!nodeId) return null;

  const applyAddress = () => {
    const normalized = normalizeComfyPageUrl(draft);
    if (!normalized.ok) {
      setReason(normalized.reason);
      return;
    }
    setReason(null);
    setUrl(normalized.url);
    setDraft(normalized.url);
    useCanvasStore.getState().setNodes((nodes) =>
      nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, url: normalized.url } } : node)),
    );
    setAttempt((value) => value + 1);
  };

  return (
    <div className="wf-comfy-page-overlay" role="dialog" aria-modal="true" aria-label={t('comfyPage.card.title')}>
      <header className="wf-comfy-page-overlay__bar">
        <span className="wf-comfy-page-overlay__title">{t('comfyPage.card.title')}</span>
        <code className="wf-comfy-page-overlay__url" title={url}>{url}</code>
        <span className="wf-comfy-page-overlay__status" data-status={probe}>
          {t(`comfyPage.status.${probe}`)}
        </span>
        <a className="wf-comfy-page-overlay__external" href={url} target="_blank" rel="noreferrer noopener">
          {t('comfyPage.overlay.openExternal')}
        </a>
        <button type="button" className="wf-comfy-page-overlay__retry" onClick={() => setAttempt((value) => value + 1)}>
          {t('comfyPage.overlay.retry')}
        </button>
        <button type="button" className="wf-comfy-page-overlay__close" onClick={close} aria-label={t('comfyPage.overlay.close')}>
          {t('comfyPage.overlay.close')}
        </button>
      </header>

      {probe === 'connected' ? (
        <iframe
          ref={frameRef}
          className="wf-comfy-page-overlay__frame"
          src={url}
          title={t('comfyPage.card.title')}
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      ) : (
        <div className="wf-comfy-page-overlay__guide" role="status">
          {probe === 'probing' ? (
            <p className="wf-comfy-page-overlay__guide-title">{t('comfyPage.overlay.opening')}</p>
          ) : (
            <>
              <p className="wf-comfy-page-overlay__guide-title">{t('comfyPage.guide.title')}</p>
              <p className="wf-comfy-page-overlay__guide-body">{t('comfyPage.guide.body')}</p>
              <div className="wf-comfy-page-overlay__address">
                <label className="wf-comfy-page-overlay__address-label" htmlFor="wf-comfy-page-address">
                  {t('comfyPage.overlay.addressLabel')}
                </label>
                <input
                  id="wf-comfy-page-address"
                  className="wf-comfy-page-overlay__input"
                  value={draft}
                  spellCheck={false}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') applyAddress();
                  }}
                />
                <button type="button" className="wf-comfy-page-overlay__apply" onClick={applyAddress}>
                  {t('comfyPage.overlay.retry')}
                </button>
              </div>
              {reason ? (
                <p className="wf-comfy-page-overlay__guide-error" role="alert">
                  {t(REASON_KEY[reason])}
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
