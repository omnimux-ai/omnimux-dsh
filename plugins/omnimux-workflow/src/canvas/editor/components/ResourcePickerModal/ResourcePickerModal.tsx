import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CustomModal } from '../../../ui';
import { useT } from '../../../i18n';
import { useCanvasStore } from '../../../store/canvasStore';
import { listCanvasResources, planPickerSelectionMutation, pickerReasonKey, updatePickerLocalDrafts,
  type LocalFileDraft, type ResourcePickerTab, type ResourcePickerMode } from '../../utils/resourcePickerPolicy.ts';
import type { ResourcePickerSlotTarget } from '../../hooks/useResourcePicker.ts';
import type { NodeSlotEngineState } from '../../../../shared/graph/slotContractTypes.ts';
import type { CanvasInputSelectionRequest } from '../../../../shared/graph/canvasInputMutationGateway.ts';
import CanvasResourcePane from './CanvasResourcePane';
import LocalUploadPane from './LocalUploadPane';

export interface ResourcePickerModalProps {
  open: boolean;
  nodeId: string;
  title?: string;
  initialTab?: ResourcePickerTab;
  slotTarget?: ResourcePickerSlotTarget | null;
  mode?: ResourcePickerMode;
  targetSlotIndex?: number;
  slotState?: NodeSlotEngineState;
  onCancel: () => void;
  onCommit: (payload: {
    selectedCanvasNodeIds: string[];
    selections?: NonNullable<CanvasInputSelectionRequest['selections']>;
    chosenOperationId?: string;
    localFiles: LocalFileDraft[];
    mode?: ResourcePickerMode;
    targetSlotIndex?: number;
  }) => boolean;
}

const ModalCloseButton: React.FC<{ onClose: () => void; placement?: string; ariaLabel?: string }> = ({
  onClose, placement = 'external', ariaLabel = 'Close',
}) => (
  <button
    type="button"
    className={`omnimux-modal-close-btn is-${placement} wf-picker-external-close`}
    onClick={onClose}
    aria-label={ariaLabel}
  >
    <X size={16} />
  </button>
);

const ResourcePickerModal: React.FC<ResourcePickerModalProps> = ({
  open, nodeId, title, initialTab = 'canvas', slotTarget = null, mode = 'add', targetSlotIndex,
  slotState, onCancel, onCommit,
}) => {
  const t = useT();
  const titleId = useId();
  const reasonId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(slotTarget?.openerAnchor
    ?? (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const originPanelRef = useRef<HTMLElement | null>(openerRef.current?.closest<HTMLElement>('.wf-config-panel') ?? null);
  const returnFocusRef = useRef(slotTarget?.onReturnFocus);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const nodes = useCanvasStore(state => state.nodes);
  const edges = useCanvasStore(state => state.edges);
  const catalog = useCanvasStore(state => state.catalogRuntime);
  const target = nodes.find(node => node.id === nodeId);
  const current = target?.data.inputBindingVersion === 1;
  const params = target?.data.params as Record<string, unknown> | undefined;
  const operationId = String(params?.operation ?? '');
  const [tab, setTab] = useState<ResourcePickerTab>(initialTab);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedOutputs, setSelectedOutputs] = useState<Record<string, string>>({});
  const [localFiles, setLocalFiles] = useState<LocalFileDraft[]>([]);
  const selections = useMemo(() => selectedIds.flatMap(id => {
    return selectedOutputs[id] ? [{ sourceNodeId: id, outputId: selectedOutputs[id]!, targetSlot: slotTarget?.slot }] : [];
  }), [selectedIds, selectedOutputs, slotTarget?.slot]);
  const canvasItems = useMemo(() => listCanvasResources(nodes, edges, nodeId, { catalog }, {
    targetSlot: slotTarget?.slot, replaceEdgeId: slotTarget?.replaceEdgeId, replaceSlot: slotTarget?.slot,
    selections: mode === 'replace' ? [] : selections,
  }), [nodes, edges, nodeId, catalog, slotTarget, mode, selections]);
  const selectedCount = selections.length + localFiles.length;
  const prepared = useMemo(() => current ? planPickerSelectionMutation({ nodes, edges }, {
    targetNodeId: nodeId, chosenOperationId: slotTarget?.displayOnlyFromOperation ?? operationId,
    selections, replaceEdgeId: slotTarget?.replaceEdgeId, replaceSlot: slotTarget?.replaceEdgeId ? slotTarget.slot : undefined,
  }, { catalog }) : null, [current, nodes, edges, nodeId, operationId, slotTarget, selections, catalog]);
  const accepts = current ? prepared?.status === 'allowed' && localFiles.length === 0 : true;
  const reason = current && selectedCount > 0 && !accepts
    ? t(pickerReasonKey(localFiles.length ? 'role_conflict' : prepared?.reasonCode)) : undefined;

  useEffect(() => {
    if (!open) return;
    setTab(initialTab); setSelectedIds([]); setLocalFiles([]);
  }, [open, initialTab]);

  // The body ref identifies this portal instance, including its separately portaled filters.
  useEffect(() => {
    if (!open) return;
    if (slotTarget?.openerAnchor) {
      openerRef.current = slotTarget.openerAnchor;
      originPanelRef.current = openerRef.current.closest<HTMLElement>('.wf-config-panel') ?? null;
    } else if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      openerRef.current = document.activeElement;
      originPanelRef.current = openerRef.current.closest<HTMLElement>('.wf-config-panel') ?? null;
    }
    if (slotTarget?.onReturnFocus) {
      returnFocusRef.current = slotTarget.onReturnFocus;
    }
    const card = bodyRef.current?.closest<HTMLElement>('.wf-picker-modal');
    if (!card) return;
    const oldTabIndex = card.getAttribute('tabindex');
    card.tabIndex = -1;
    const owned = new Map<HTMLElement, HTMLElement>();
    let trigger: HTMLElement | null = null;
    let known = new Set(document.querySelectorAll<HTMLElement>('.wf-custom-select-dropdown'));
    const visible = (element: HTMLElement) => !element.hasAttribute('disabled') && element.getClientRects().length > 0 && element.tabIndex >= 0;
    const controls = () => [card, ...owned.keys()].flatMap(root => Array.from(root.querySelectorAll<HTMLElement>('button,input,textarea,[tabindex],a[href]')).filter(visible));
    const focusFirst = () => (card.querySelector<HTMLElement>('.wf-picker-search__input') ?? controls()[0] ?? card).focus();
    const inside = (node: Node) => card.contains(node) || [...owned.keys()].some(root => root.contains(node));
    const pointer = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[aria-haspopup="listbox"]') : null;
      if (element && card.contains(element)) { trigger = element; known = new Set(document.querySelectorAll<HTMLElement>('.wf-custom-select-dropdown')); }
    };
    const observer = new MutationObserver(() => {
      if (trigger?.isConnected && trigger.getAttribute('aria-expanded') === 'true') {
        const added = [...document.querySelectorAll<HTMLElement>('.wf-custom-select-dropdown')].filter(root => !known.has(root));
        if (added.length === 1) { owned.set(added[0]!, trigger); known.add(added[0]!); }
      }
      for (const [root, owner] of owned) if (!root.isConnected) {
        owned.delete(root);
        if (owner.isConnected && (document.activeElement === document.body || !document.activeElement?.isConnected)) owner.focus();
      }
      if (document.hasFocus() && document.activeElement === document.body) focusFirst();
    });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const expanded = [...card.querySelectorAll<HTMLElement>('[aria-haspopup="listbox"][aria-expanded="true"]')];
        if (expanded.length === 1 && [...owned.values()].includes(expanded[0]!)) {
          event.preventDefault(); event.stopImmediatePropagation(); expanded[0]!.click(); expanded[0]!.focus();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        handleCancel();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const dropdown = [...owned.keys()].find(root => active && root.contains(active));
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && dropdown) {
        const options = Array.from(dropdown.querySelectorAll<HTMLElement>('[role="option"]')).filter(visible);
        if (options.length) {
          event.preventDefault();
          const index = options.indexOf(active!);
          options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]!.focus();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const items = controls();
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (!items.length) { event.preventDefault(); card.focus(); }
      else if (index < 0 || event.shiftKey && index === 0 || !event.shiftKey && index === items.length - 1) {
        event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0]!.focus();
      }
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.getAttribute('aria-haspopup') === 'listbox') { trigger = focused; known = new Set(document.querySelectorAll<HTMLElement>('.wf-custom-select-dropdown')); }
    };
    const focus = (event: FocusEvent) => {
      if (document.hasFocus() && !inside(event.target as Node)) focusFirst();
      const element = event.target as HTMLElement;
      if (card.contains(element) && element.getAttribute('aria-haspopup') === 'listbox') { trigger = element; known = new Set(document.querySelectorAll<HTMLElement>('.wf-custom-select-dropdown')); }
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('focusin', focus, true);
    observer.observe(document.body, { childList: true, subtree: true });
    focusFirst();
    return () => {
      observer.disconnect(); owned.clear();
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('focusin', focus, true);
      if (oldTabIndex === null) card.removeAttribute('tabindex'); else card.setAttribute('tabindex', oldTabIndex);
      queueMicrotask(() => {
        const currentOpener = openerRef.current;
        const currentPanel = originPanelRef.current;
        let targetElement = currentOpener?.isConnected ? currentOpener : null;
        if (!targetElement && currentPanel?.isConnected) {
          targetElement = currentPanel.querySelector<HTMLElement>('.wf-slot-wells [role="button"]');
        }
        if (targetElement?.isConnected) {
          if (returnFocusRef.current) returnFocusRef.current(targetElement);
          else targetElement.focus();
        }
        else if (currentPanel?.isConnected) {
          const fallback = currentPanel.querySelector<HTMLElement>('button:not(:disabled),[tabindex="0"]');
          if (fallback) fallback.focus();
          else { const previous = currentPanel.getAttribute('tabindex'); currentPanel.tabIndex = -1; currentPanel.focus(); if (previous === null) currentPanel.removeAttribute('tabindex'); else currentPanel.setAttribute('tabindex', previous); }
        }
      });
    };
  }, [open, slotTarget]);

  useEffect(() => {
    const card = bodyRef.current?.closest<HTMLElement>('.wf-picker-modal');
    if (!open || !card) return;
    const attributes = { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId };
    const previous = Object.keys(attributes).map(key => [key, card.getAttribute(key)] as const);
    for (const [key, value] of Object.entries(attributes)) card.setAttribute(key, value);
    const close = card.querySelector<HTMLElement>('.wf-modal-close, .omnimux-modal-close-btn');
    const oldLabel = close?.getAttribute('aria-label');
    close?.setAttribute('aria-label', t('app.close'));
    return () => {
      for (const [key, value] of previous) if (value === null) card.removeAttribute(key); else card.setAttribute(key, value);
      if (close) { if (oldLabel == null) close.removeAttribute('aria-label'); else close.setAttribute('aria-label', oldLabel); }
    };
  }, [open, t, titleId]);

  const handleCancel = useCallback(() => { setLocalFiles([]); onCancel(); }, [onCancel]);
  const handleToggle = useCallback((id: string, inUse: boolean, disabled?: boolean) => {
    if (disabled || inUse) return;
    const outputId = canvasItems.find(item => item.nodeId === id)?.outputId;
    if (!outputId) return;
    setSelectedOutputs(previous => ({ ...previous, [id]: outputId }));
    setSelectedIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : mode === 'replace' ? [id] : [...previous, id]);
    if (mode === 'replace') setLocalFiles([]);
  }, [mode, canvasItems]);
  const handleUse = () => {
    if (selectedCount === 0 || !accepts) return;
    onCommit({ selectedCanvasNodeIds: selectedIds, selections, chosenOperationId: operationId, localFiles, mode, targetSlotIndex });
  };
  const modalTitle =
    title || t('picker.title');
  const footer = <div className="wf-picker-footer">
    <button type="button" className="wf-picker-btn wf-picker-btn--ghost" onClick={handleCancel}>{t('picker.cancel')}</button>
    <button type="button" className="wf-picker-btn wf-picker-btn--primary" disabled={selectedCount === 0 || !accepts}
      aria-describedby={reason ? reasonId : undefined} onClick={handleUse}>{t(mode === 'replace' ? 'node.replace' : 'picker.use')}</button>
  </div>;
  const changeTab = (next: ResourcePickerTab) => { setTab(next); setSelectedIds([]); setLocalFiles([]); };
  return <CustomModal open={open} onCancel={handleCancel} title={<span id={titleId}>{modalTitle}</span>}
    width="min(88vw, 760px)" className="wf-picker-modal" bodyClassName="wf-picker-modal__body" footer={footer}>
    <ModalCloseButton onClose={handleCancel} placement="external" ariaLabel={t('app.close') || 'Close'} />
    <div ref={bodyRef} className="wf-picker-content">
      <div className="wf-picker-tabs" role="tablist">
        {(['canvas', 'local'] as const).map(source => <button key={source} type="button" role="tab" id={`${titleId}-${source}-tab`}
          aria-controls={`${titleId}-${source}-pane`} aria-selected={tab === source} tabIndex={tab === source ? 0 : -1}
          className={`wf-picker-tab ${tab === source ? 'wf-picker-tab--active' : ''}`} onClick={() => changeTab(source)}
          onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = source === 'canvas' ? 'local' : 'canvas'; changeTab(next); document.getElementById(`${titleId}-${next}-tab`)?.focus(); } }}>
          {t(source === 'canvas' ? 'picker.tab.canvas' : 'picker.tab.local')}
        </button>)}
      </div>
      <div role="tabpanel" id={`${titleId}-${tab}-pane`} aria-labelledby={`${titleId}-${tab}-tab`}>
        {tab === 'canvas' ? <CanvasResourcePane items={canvasItems} selectedIds={selectedIds} mode={mode}
          targetSlotIndex={targetSlotIndex} slotState={slotState} onToggle={handleToggle}
          acceptedTypes={slotTarget?.acceptedTypes} allowConnectedSelection={current || Boolean(slotTarget)} />
          : <LocalUploadPane active={open} files={localFiles} onAddFiles={incoming => {
            const next = updatePickerLocalDrafts(mode, selectedIds, localFiles, incoming);
            setSelectedIds(next.selectedIds); setLocalFiles(next.localFiles);
            if (mode === 'replace' && incoming.length) setSelectedOutputs({});
          }}
            onRemove={id => setLocalFiles(previous => previous.filter(file => file.id !== id))} acceptedTypes={slotTarget?.acceptedTypes} />}
      </div>
      {reason ? <div id={reasonId} className="wf-picker-reason" role="status">{reason}</div> : null}
    </div>
  </CustomModal>;
};
export default ResourcePickerModal;
