import React, { useEffect, useRef, useState } from 'react';
import { Button, ModalDialog } from 'dsh-ui-kit';
import { ModalCloseButton } from '../ModalCloseButton.jsx';
import {
  createProductFromLink,
  isHttpUrl,
  normalizeHttpUrl,
} from './product-create-api.js';

const STYLE_ID = 'omx-product-create-link-modal';

const CSS = `
.omx-product-create-link {
  display: flex; flex-direction: column; gap: 14px;
  padding: 4px 2px 8px; box-sizing: border-box;
}
.omx-product-create-link__hint {
  margin: 0; font-size: 13px; line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.omx-product-create-link__field {
  display: flex; flex-direction: column; gap: 8px;
}
.omx-product-create-link__label {
  font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary);
}
.omx-product-create-link__input-wrap {
  position: relative; display: flex; align-items: center;
}
.omx-product-create-link__icon {
  position: absolute; left: 12px; display: flex; align-items: center;
  color: var(--dsw-alias-label-tertiary); pointer-events: none;
}
.omx-product-create-link__input {
  width: 100%; height: 32px; box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1, transparent);
  padding: 0 12px 0 36px;
  font-size: 13px; color: var(--dsw-alias-label-primary);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.omx-product-create-link__input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}
.omx-product-create-link__input:focus {
  border-color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-label-primary);
}
.omx-product-create-link__input:disabled {
  opacity: 0.7; cursor: not-allowed;
}
.omx-product-create-link__status {
  margin: 0; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.omx-product-create-link__status[data-tone="error"] {
  color: var(--dsw-alias-state-error-primary);
}
.omx-product-create-link__status[data-tone="loading"] {
  color: var(--dsw-alias-label-secondary);
}
.omx-product-create-link__footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  width: 100%; box-sizing: border-box;
}
`;

function ensureStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head?.appendChild(style);
}

function LinkIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/**
 * 粘贴商品链接 → 解析草稿 → 保存产品。
 * @param {{
 *   open: boolean,
 *   preferredKind?: string,
 *   t: (key: string, vars?: any) => string,
 *   onClose: () => void,
 *   onCreated: (product: any) => void,
 *   createFromLink?: typeof createProductFromLink,
 * }} props
 */
export function ProductCreateLinkModal({
  open,
  preferredKind,
  t,
  onClose,
  onCreated,
  createFromLink = createProductFromLink,
}) {
  const inputRef = useRef(null);
  const requestToken = useRef(0);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    ensureStyles();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setUrl('');
    setBusy(false);
    setError('');
    setStatus('');
    requestToken.current += 1;
    const timer = setTimeout(() => inputRef.current?.focus?.(), 30);
    return () => {
      clearTimeout(timer);
      // 关闭时作废在途请求，避免回写已关闭会话。
      requestToken.current += 1;
    };
  }, [open]);

  if (!open) return null;

  const canSubmit = !busy && url.trim() !== '';

  const submit = async () => {
    if (busy) return;
    const value = normalizeHttpUrl(url);
    if (!isHttpUrl(value)) {
      setError(t('productPicker.create.invalidUrl'));
      setStatus('');
      return;
    }

    const requestId = requestToken.current + 1;
    requestToken.current = requestId;
    setBusy(true);
    setError('');
    setStatus(t('productPicker.create.loading'));

    try {
      const result = await createFromLink({
        url: value,
        preferredKind,
        signalToken: requestToken,
        requestId,
      });

      if (result.stage === 'stale') return;
      if (!result.ok) {
        setBusy(false);
        setStatus('');
        setError(result.message || t('productPicker.create.failed'));
        return;
      }

      setBusy(false);
      setStatus('');
      onCreated(result.product);
    } catch (err) {
      if (requestToken.current !== requestId) return;
      setBusy(false);
      setStatus('');
      setError(err instanceof Error && err.message ? err.message : t('productPicker.create.failed'));
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      title={t('productPicker.create.title')}
      size="sm"
      footer={
        <div className="omx-product-create-link__footer">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onClose}
          >
            {t('productPicker.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            loading={busy}
            onClick={() => {
              void submit();
            }}
          >
            {t('productPicker.create.submit')}
          </Button>
        </div>
      }
    >
      <ModalCloseButton
        onClose={() => {
          if (busy) return;
          onClose();
        }}
        placement="external"
        ariaLabel={t('productPicker.cancel')}
      />
      <div className="omx-product-create-link" data-testid="product-create-link-modal">
        <p className="omx-product-create-link__hint">{t('productPicker.create.hint')}</p>
        <div className="omx-product-create-link__field">
          <label className="omx-product-create-link__label" htmlFor="omx-product-create-link-input">
            {t('productPicker.create.linkLabel')}
          </label>
          <div className="omx-product-create-link__input-wrap">
            <span className="omx-product-create-link__icon">
              <LinkIcon />
            </span>
            <input
              id="omx-product-create-link-input"
              ref={inputRef}
              className="omx-product-create-link__input"
              type="url"
              value={url}
              disabled={busy}
              placeholder={t('productPicker.create.placeholder')}
              aria-label={t('productPicker.create.placeholder')}
              onChange={(event) => {
                setUrl(event.target.value);
                if (error) setError('');
                if (status) setStatus('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
        </div>
        {error ? (
          <p className="omx-product-create-link__status" data-tone="error" role="alert">
            {error}
          </p>
        ) : status ? (
          <p className="omx-product-create-link__status" data-tone="loading" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}
