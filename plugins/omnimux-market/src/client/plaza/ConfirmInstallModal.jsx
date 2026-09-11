import React from 'react';
import { resolveItemTitle } from './plazaUtils.js';

function getH(opts) {
  if (opts && typeof opts.h === 'function') return opts.h;
  if (typeof h === 'function') return h;
  return React.createElement;
}

function resolveTr(opts) {
  if (typeof useTr === 'function') return useTr();
  if (typeof lookup === 'function') return lookup;
  return (k) => k;
}

function resolveOverlay(opts) {
  if (opts && opts.Overlay) return opts.Overlay;
  if (typeof Overlay !== 'undefined') return Overlay;
  return 'div';
}

function resolveButton(opts) {
  if (opts && opts.Button) return opts.Button;
  if (typeof Button !== 'undefined') return Button;
  return 'button';
}

function getModalPrompt() {
  if (typeof lookup === 'function') {
    return lookup('workshop.confirmInstall') || '是否安装并启用此 Skill？';
  }
  return '是否安装并启用此 Skill？';
}

export function ConfirmInstallModal(opts) {
  const { item, onConfirm, onClose, error = '', installing = false } = opts || {};
  if (!item) return null;

  const h = getH(opts);
  const tr = resolveTr(opts);
  const title = resolveItemTitle(item, tr);
  const overlayComp = resolveOverlay(opts);
  const buttonComp = resolveButton(opts);
  const modalPrompt = getModalPrompt();
  const confirmText = installing ? '正在安装…' : '确认安装';

  return h(overlayComp, { onClose },
    h('div', { className: 'modal-dialog', style: { width: '400px' }, role: 'dialog', 'aria-modal': 'true' },
      h('div', { className: 'modal-header' },
        h('h3', { className: 'modal-title' }, modalPrompt),
      ),
      h('p', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary, #d1d5db)', margin: '0 0 20px' } },
        '即将安装「' + title + '」，安装完成后将自动为您启用。',
      ),
      error ? h('p', { className: 'sh-err', role: 'alert' }, error) : null,
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
        h(buttonComp, { size: 'sm', variant: 'outline', onClick: onClose, disabled: installing }, '取消'),
        h(buttonComp, { size: 'sm', variant: 'primary', onClick: onConfirm, disabled: installing }, confirmText),
      ),
    ),
  );
}
