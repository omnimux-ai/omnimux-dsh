import React from 'react';

function getH(props) {
  if (props && props.h) return props.h;
  if (typeof h === 'function') return h;
  return React.createElement;
}

function renderModalHeader(onClose, trLookup, h) {
  const closeLabel = trLookup ? trLookup('action.close') : 'Close';
  const title = trLookup ? (trLookup('workshop.installModalTitle') || '安装Skill') : '安装Skill';
  return h('div', { className: 'modal-header' },
    h('h3', { className: 'modal-title' }, title),
    // exempt-ui01 modal close icon button
    h('button', {
      type: 'button',
      className: 'modal-close-btn',
      'aria-label': closeLabel,
      onClick: onClose,
    },
      h('svg', { width: '18', height: '18', viewBox: '0 0 24 24' },
        h('line', { x1: '18', y1: '6', x2: '6', y2: '18', stroke: 'currentColor', strokeWidth: '2' }),
        h('line', { x1: '6', y1: '6', x2: '18', y2: '18', stroke: 'currentColor', strokeWidth: '2' }),
      ),
    ),
  );
}

function renderDropZone(opts, h) {
  const { file, fileInputRef, onFileChange, onDrop, trLookup } = opts;
  const defaultDrop = trLookup ? (trLookup('workshop.dropText') || '拖放 .zip 或 SKILL.md 文件，或点击选择') : '拖放 .zip 或 SKILL.md 文件，或点击选择';
  const dropText = file ? ('已选择: ' + file.name) : defaultDrop;
  const onZoneClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return h('div', {
    className: 'drop-zone',
    onClick: onZoneClick,
    onDragOver,
    onDrop,
  },
    h('input', {
      ref: fileInputRef,
      type: 'file',
      accept: '.zip,.md',
      style: { display: 'none' },
      onChange: onFileChange,
    }),
    h('div', { className: 'drop-icon-box' },
      h('svg', { width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8' },
        h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
        h('polyline', { points: '14 2 14 8 20 8' }),
        h('line', { x1: '12', y1: '18', x2: '12', y2: '12' }),
        h('line', { x1: '9', y1: '15', x2: '15', y2: '15' }),
      ),
    ),
    h('p', { className: 'drop-text' }, dropText),
  );
}

function renderReqSection(trLookup, h) {
  const reqTitle = trLookup ? (trLookup('workshop.reqTitle') || '文件要求') : '文件要求';
  const reqZip = trLookup ? (trLookup('workshop.reqZip') || '包含 SKILL.md 文件的 .zip 压缩包') : '包含 SKILL.md 文件的 .zip 压缩包';
  const reqMd = trLookup ? (trLookup('workshop.reqMd') || '或直接拖入 SKILL.md 文件') : '或直接拖入 SKILL.md 文件';
  return h('div', { className: 'req-section' },
    h('h4', { className: 'req-title' }, reqTitle),
    h('ul', { className: 'req-list' },
      h('li', { className: 'req-item' }, reqZip),
      h('li', { className: 'req-item' }, reqMd),
    ),
  );
}

async function executeSkillInstall(file, onInstalled, onClose, apiFn) {
  const name = file.name.replace(/\.(zip|md)$/i, '');
  const callApi = apiFn || (typeof api === 'function' ? api : null);
  if (callApi) {
    await callApi('install', { slug: name });
  }
  if (onInstalled) {
    onInstalled({ name, slug: name, installed: true, enabled: true });
  }
  onClose();
}

function resolveStateHook(hooks) {
  if (hooks && typeof hooks.useState === 'function') return hooks.useState;
  if (typeof useState === 'function') return useState;
  return React.useState;
}

function resolveRefHook(hooks) {
  if (hooks && typeof hooks.useRef === 'function') return hooks.useRef;
  if (typeof useRef === 'function') return useRef;
  return React.useRef;
}

function resolveOverlayComp(props) {
  if (props && props.Overlay) return props.Overlay;
  if (typeof Overlay !== 'undefined') return Overlay;
  return 'div';
}

function getSelectedFile(e) {
  return e.target.files && e.target.files[0] ? e.target.files[0] : null;
}

function getDroppedFile(e) {
  return e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0] ? e.dataTransfer.files[0] : null;
}

function resolveTrLookup() {
  if (typeof lookup === 'function') return lookup;
  return (k) => k;
}

function resolveApi(apiProp) {
  if (apiProp) return apiProp;
  if (typeof api === 'function') return api;
  return null;
}

function resolveSubmitLabel(uploading, actionText) {
  if (uploading) return '正在安装…';
  return actionText;
}

export function InstallModal(props) {
  const safeProps = props || {};
  const { open, onClose, onInstalled, hooks, api: apiProp } = safeProps;
  const stateFn = resolveStateHook(hooks);
  const refFn = resolveRefHook(hooks);
  const h = getH(props);

  const [file, setFile] = stateFn(null);
  const [uploading, setUploading] = stateFn(false);
  const [error, setError] = stateFn('');
  const fileInputRef = refFn(null);

  if (!open) return null;

  const trLookup = resolveTrLookup();
  const apiFn = resolveApi(apiProp);

  const handleFileChange = (e) => {
    const selected = getSelectedFile(e);
    if (selected) {
      setFile(selected);
      setError('');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dropped = getDroppedFile(e);
    if (dropped) {
      setFile(dropped);
      setError('');
    }
  };

  const handleInstall = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await executeSkillInstall(file, onInstalled, onClose, apiFn);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setUploading(false);
    }
  };

  const actionText = trLookup('workshop.installAction') || '安装';
  const submitLabel = resolveSubmitLabel(uploading, actionText);
  const overlayComp = resolveOverlayComp(props);
  const dropOpts = { file, fileInputRef, onFileChange: handleFileChange, onDrop: handleDrop, trLookup };

  return h(overlayComp, { onClose },
    h('div', { className: 'modal-dialog', role: 'dialog', 'aria-modal': 'true' },
      renderModalHeader(onClose, trLookup, h),
      renderDropZone(dropOpts, h),
      renderReqSection(trLookup, h),
      error ? h('p', { className: 'sh-err' }, error) : null,
      // exempt-ui01 modal submit action button
      h('button', {
        type: 'button',
        className: 'btn-modal-install' + (file ? ' ready' : ''),
        disabled: !file || uploading,
        onClick: handleInstall,
      }, submitLabel),
    ),
  );
}
