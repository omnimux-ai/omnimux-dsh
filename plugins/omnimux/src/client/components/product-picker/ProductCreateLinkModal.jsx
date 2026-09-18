import React, { useEffect, useRef, useState } from 'react';
import { Button, ModalDialog } from 'dsh-ui-kit';
import { ModalCloseButton } from '../ModalCloseButton.jsx';
import {
  createProductFromLink,
  isHttpUrl,
  normalizeHttpUrl,
} from './product-create-api.js';

const STYLE_ID = 'omx-product-create-link-modal-v2';

const CSS = `
.omx-pcl {
  display: flex; flex-direction: column; align-items: center;
  gap: 22px; padding: 18px 8px 10px; box-sizing: border-box; text-align: center;
}
.omx-pcl__title {
  margin: 8px 0 0; font-size: 22px; line-height: 30px; font-weight: 650;
  color: var(--dsw-alias-label-primary); letter-spacing: -0.01em;
  max-width: 520px;
}
.omx-pcl__title-em {
  color: var(--dsw-alias-brand-primary);
  font-weight: 700;
}
.omx-pcl__supports {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.omx-pcl__supports-label {
  margin: 0; font-size: 12px; line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-pcl__logos {
  display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;
}
.omx-pcl__logo {
  width: 28px; height: 28px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06));
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px; font-weight: 700; letter-spacing: -0.02em;
  user-select: none;
}
.omx-pcl__logo[data-more="true"] {
  background: transparent; border-style: dashed;
  color: var(--dsw-alias-label-tertiary); font-weight: 600;
}
.omx-pcl__field {
  width: 100%; max-width: 560px; box-sizing: border-box;
}
.omx-pcl__input {
  width: 100%; height: 48px; box-sizing: border-box;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1, transparent);
  padding: 0 18px;
  font-size: 14px; color: var(--dsw-alias-label-primary);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.omx-pcl__input::placeholder { color: var(--dsw-alias-label-tertiary); }
.omx-pcl__input:focus {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-tertiary, rgba(59,130,246,0.25));
}
.omx-pcl__input:disabled { opacity: 0.72; cursor: not-allowed; }
.omx-pcl__status {
  margin: -8px 0 0; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-secondary); min-height: 18px;
}
.omx-pcl__status[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.omx-pcl__actions {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  width: 100%;
}
.omx-pcl__primary {
  min-width: 168px; height: 40px; border-radius: 999px !important;
}
.omx-pcl__manual {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  padding: 0; margin: 0;
  font-size: 13px; line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.omx-pcl__manual:hover { color: var(--dsw-alias-label-primary); }
.omx-pcl__manual:disabled { opacity: 0.55; cursor: not-allowed; }
.omx-pcl__manual-em {
  color: var(--dsw-alias-brand-primary); font-weight: 600;
}
.omx-pcl__spin {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary-inverted, #111) 35%, transparent);
  border-top-color: var(--dsw-alias-label-primary-inverted, #111);
  animation: omx-pcl-spin 0.7s linear infinite;
  display: inline-block; vertical-align: -2px; margin-right: 8px;
}
@keyframes omx-pcl-spin { to { transform: rotate(360deg); } }
.omx-pcl-dialog { width: min(640px, 100%) !important; }
.omx-pcl-dialog__body { max-height: min(78vh, 640px) !important; }
.omx-pcl-dialog [data-part="title"],
.omx-pcl-dialog .dsw-modal-title {
  position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0);
}
`;

const SUPPORT_LOGOS = [
  { key: 'amz', label: 'a' },
  { key: 'shopify', label: 'S' },
  { key: 'etsy', label: 'E' },
  { key: 'ebay', label: 'eb' },
  { key: 'appstore', label: 'A' },
  { key: 'play', label: 'G' },
  { key: 'wp', label: 'W' },
  { key: 'wix', label: 'w' },
];

function ensureStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return;
  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head?.appendChild(style);
  }
  style.textContent = CSS;
}

/**
 * 粘贴商品链接 → 解析草稿 → 保存产品（Creatify 风格居中布局）。
 * @param {{
 *   open: boolean,
 *   preferredKind?: string,
 *   t: (key: string, vars?: any) => string,
 *   onClose: () => void,
 *   onCreated: (product: any) => void,
 *   onManualCreate?: () => void,
 *   createFromLink?: typeof createProductFromLink,
 * }} props
 */
export function ProductCreateLinkModal({
  open,
  preferredKind,
  t,
  onClose,
  onCreated,
  onManualCreate,
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

  const handleManual = () => {
    if (busy) return;
    if (typeof onManualCreate === 'function') onManualCreate();
    else onClose();
  };

  return (
    <ModalDialog
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      title={t('productPicker.create.title')}
      size="md"
      className="omx-pcl-dialog"
      contentClassName="omx-pcl-dialog__body"
      footer={null}
    >
      <ModalCloseButton
        onClose={() => {
          if (busy) return;
          onClose();
        }}
        placement="external"
        ariaLabel={t('productPicker.cancel')}
      />
      <div className="omx-pcl" data-testid="product-create-link-modal">
        <h2 className="omx-pcl__title">
          {t('productPicker.create.heroBefore')}
          <span className="omx-pcl__title-em">{t('productPicker.create.heroEm')}</span>
          {t('productPicker.create.heroAfter')}
        </h2>

        <div className="omx-pcl__supports">
          <p className="omx-pcl__supports-label">{t('productPicker.create.supports')}</p>
          <div className="omx-pcl__logos" aria-hidden="true">
            {SUPPORT_LOGOS.map((item) => (
              <span key={item.key} className="omx-pcl__logo">{item.label}</span>
            ))}
            <span className="omx-pcl__logo" data-more="true">…</span>
          </div>
        </div>

        <div className="omx-pcl__field">
          <input
            id="omx-product-create-link-input"
            ref={inputRef}
            className="omx-pcl__input"
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

        {error ? (
          <p className="omx-pcl__status" data-tone="error" role="alert">{error}</p>
        ) : status ? (
          <p className="omx-pcl__status" data-tone="loading" role="status">{status}</p>
        ) : (
          <p className="omx-pcl__status" aria-hidden="true">&nbsp;</p>
        )}

        <div className="omx-pcl__actions">
          <Button
            className="omx-pcl__primary"
            variant="primary"
            size="md"
            disabled={!canSubmit}
            loading={busy}
            onClick={() => {
              void submit();
            }}
          >
            {busy ? (
              <>
                <span className="omx-pcl__spin" aria-hidden="true" />
                {t('productPicker.create.loadingShort')}
              </>
            ) : (
              t('productPicker.create.submit')
            )}
          </Button>
          <button
            type="button"
            className="omx-pcl__manual"
            disabled={busy}
            onClick={handleManual}
          >
            {t('productPicker.create.manualBefore')}
            <span className="omx-pcl__manual-em">{t('productPicker.create.manualEm')}</span>
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
