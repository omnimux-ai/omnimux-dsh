/**
 * plugins/omnimux-apps/src/client/AppFormPanel.tsx
 *
 * Dynamic Form Panel Engine for OmniMux AI Applications.
 * Geometry standard: Outer width 448px (padding: 24px, border: 1px) -> Inner width strictly 398px.
 * Dynamically renders 9 standard restricted widgets based on ApplicationManifest.
 * Fail-closed validation powered by validateFormData.
 *
 * Authority: docs/contracts/ai-app-ui-spec.md & docs/contracts/workflow-app-boundary.md
 */

import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  ChevronDown,
  Upload,
  Check,
  AlertCircle,
  Film,
  Image as ImageIcon,
  Volume2,
  Sliders,
  X,
  Folder,
  Store,
  Link2,
} from 'lucide-react';
import type {
  ApplicationManifest,
  FormWidgetType,
  FormPropertySchema,
  LibraryKind,
} from '../shared/manifest.ts';
import { validateFormData } from '../shared/schemaValidator.ts';
import {
  LIBRARY_META,
  displayValueOf,
  encodePickedValue,
  fetchLibraryItems,
  sanitizePreviewUrl,
  type LibraryItem,
  type PickedValue,
} from './librarySources.ts';
import './apps.css';

export interface AppFormPanelProps {
  manifest: ApplicationManifest;
  initialValues?: Record<string, unknown>;
  onChange?: (values: Record<string, unknown>) => void;
  onSubmit?: (values: Record<string, unknown>) => void | Promise<void>;
  isSubmitting?: boolean;
  className?: string;
}

export const AppFormPanel: React.FC<AppFormPanelProps> = memo(({
  manifest,
  initialValues,
  onChange,
  onSubmit,
  isSubmitting = false,
  className = '',
}: AppFormPanelProps) => {
  // Form values state
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(manifest.formSchema.properties)) {
      if (initialValues && initialValues[key] !== undefined) {
        defaults[key] = initialValues[key];
      } else if (prop.default !== undefined) {
        defaults[key] = prop.default;
      } else if (manifest.fieldMappings[key]?.defaultValue !== undefined) {
        defaults[key] = manifest.fieldMappings[key]?.defaultValue;
      } else if (prop.type === 'boolean') {
        defaults[key] = false;
      } else if (prop.type === 'number' || prop.type === 'integer') {
        defaults[key] = prop.minimum ?? 0;
      } else if (prop.type === 'string') {
        defaults[key] = '';
      } else if (prop.type === 'array') {
        defaults[key] = [];
      }
    }
    return defaults;
  });

  // Track initialValues changes (e.g. from demoSnapshot reuse)
  useEffect(() => {
    if (!initialValues) return;
    setValues((prev: Record<string, unknown>) => ({ ...prev, ...initialValues }));
  }, [initialValues]);

  // Validation error state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);

  // Draft text for link-style compound inputs (committed on Enter/blur/解析)
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});

  // Library picker modal state
  const [picker, setPicker] = useState<{ fieldKey: string; library: LibraryKind } | null>(null);
  const [pickerItems, setPickerItems] = useState<LibraryItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerUnavailable, setPickerUnavailable] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerSelectedId, setPickerSelectedId] = useState<string | null>(null);

  // Hidden file input serving the media-extractor upload source
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetKeyRef = useRef<string | null>(null);

  // Track blob: object URLs per field so they can be revoked on replace/remove/unmount
  const objectUrlsRef = useRef<Map<string, string>>(new Map());

  const revokeObjectUrl = useCallback((fieldKey: string) => {
    const tracked = objectUrlsRef.current.get(fieldKey);
    if (tracked && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      URL.revokeObjectURL(tracked);
    }
    objectUrlsRef.current.delete(fieldKey);
  }, []);

  // Revoke every outstanding object URL when the panel unmounts
  useEffect(() => {
    const tracked = objectUrlsRef.current;
    return () => {
      if (typeof URL !== 'undefined' && URL.revokeObjectURL) {
        for (const url of tracked.values()) URL.revokeObjectURL(url);
      }
      tracked.clear();
    };
  }, []);

  // Field change handler
  const handleFieldChange = useCallback(
    (key: string, val: unknown) => {
      setValues((prev: Record<string, unknown>) => {
        const next = { ...prev, [key]: val };
        onChange?.(next);
        return next;
      });

      // Clear field error on change
      setErrors((prev: Record<string, string>) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [onChange],
  );

  // Open the library picker modal for a field
  const openPicker = useCallback((fieldKey: string, library: LibraryKind) => {
    setPicker({ fieldKey, library });
    setPickerQuery('');
    setPickerSelectedId(null);
  }, []);

  const closePicker = useCallback(() => setPicker(null), []);

  // Load picker items whenever the modal (re)opens
  useEffect(() => {
    if (!picker) return;
    let cancelled = false;
    setPickerLoading(true);
    setPickerUnavailable(false);
    fetchLibraryItems(picker.library)
      .then((result) => {
        if (cancelled) return;
        setPickerItems(result.items);
        setPickerUnavailable(result.unavailable);
      })
      .finally(() => {
        if (!cancelled) setPickerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [picker]);

  // Confirm the picked library item: encode and fill the field, then close
  const confirmPicker = useCallback(() => {
    if (!picker || !pickerSelectedId) return;
    const item = pickerItems.find((entry) => entry.id === pickerSelectedId);
    if (!item) return;
    const value: PickedValue = {
      name: item.name,
      sub: item.sub,
      url: item.url || item.preview,
      source: picker.library,
    };
    if (item.type) value.type = item.type;
    // Overwriting a field that holds a local upload must release its blob URL,
    // same tracking mechanism as re-upload / remove / unmount
    revokeObjectUrl(picker.fieldKey);
    handleFieldChange(picker.fieldKey, encodePickedValue(value));
    setPicker(null);
  }, [picker, pickerSelectedId, pickerItems, handleFieldChange, revokeObjectUrl]);

  // Local upload source for media-extractor
  const openUpload = useCallback((fieldKey: string) => {
    uploadTargetKeyRef.current = fieldKey;
    fileInputRef.current?.click();
  }, []);

  const handleUploadFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const fieldKey = uploadTargetKeyRef.current;
      e.target.value = '';
      if (!file || !fieldKey) return;
      // Revoke the object URL this field previously held before minting a new one
      revokeObjectUrl(fieldKey);
      const canCreateObjectUrl = typeof URL !== 'undefined' && URL.createObjectURL;
      const objectUrl = canCreateObjectUrl ? URL.createObjectURL(file) : '';
      if (objectUrl) objectUrlsRef.current.set(fieldKey, objectUrl);
      const value: PickedValue = {
        name: file.name,
        sub: `${Math.max(1, Math.round(file.size / 1024))} KB · 本地上传`,
        url: objectUrl || file.name,
        source: 'upload',
        type: file.type.startsWith('video/')
          ? 'video'
          : file.type.startsWith('audio/')
            ? 'audio'
            : 'image',
      };
      handleFieldChange(fieldKey, encodePickedValue(value));
    },
    [handleFieldChange, revokeObjectUrl],
  );

  // Commit a pasted link draft as the raw string value
  const commitLinkDraft = useCallback(
    (fieldKey: string) => {
      const draft = (linkDrafts[fieldKey] || '').trim();
      if (draft) handleFieldChange(fieldKey, draft);
      // Clear the draft after commit so it cannot resurrect on re-render
      setLinkDrafts((prev) => ({ ...prev, [fieldKey]: '' }));
    },
    [linkDrafts, handleFieldChange],
  );

  // Remove a picked result: clear value + stale draft, revoke any tracked blob URL
  const clearPickedValue = useCallback(
    (fieldKey: string) => {
      revokeObjectUrl(fieldKey);
      setLinkDrafts((prev) => ({ ...prev, [fieldKey]: '' }));
      handleFieldChange(fieldKey, '');
    },
    [handleFieldChange, revokeObjectUrl],
  );

  // Form submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Run strict schema validation
    const valResult = validateFormData(manifest.formSchema, values);
    if (!valResult.valid) {
      const fieldErrors: Record<string, string> = {};
      for (const err of valResult.errors) {
        // Match error to field if possible
        const match = err.match(/"([^"]+)"/);
        if (match && match[1] && manifest.formSchema.properties[match[1]]) {
          fieldErrors[match[1]] = err;
        } else {
          fieldErrors['_global'] = err;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    await onSubmit?.(values);
  };

  // Determine UI widget for each field
  const resolveWidget = (key: string, prop: FormPropertySchema): FormWidgetType => {
    const mapping = manifest.fieldMappings[key];
    if (mapping?.widget) return mapping.widget;
    if (prop.widget) return prop.widget;

    if (prop.type === 'boolean') return 'switch-boolean';
    if (prop.type === 'number' || prop.type === 'integer') return 'slider-range';
    if (prop.type === 'array' && Array.isArray(prop.options) && prop.options.length > 0) {
      return 'multi-tags';
    }
    if (prop.enum && prop.enum.length <= 4 && prop.enum.some((e) => String(e).includes(':'))) {
      return 'ratio-cards';
    }
    if (prop.enum) return 'select-single';
    if (prop.type === 'string' && (prop.maxLength !== undefined && prop.maxLength > 100)) return 'textarea';
    return 'input-text';
  };

  // Unified option list: explicit options win, enum degrades to label=value
  const resolveOptions = (prop: FormPropertySchema): Array<{ label: string; value: unknown }> => {
    if (Array.isArray(prop.options) && prop.options.length > 0) return prop.options;
    if (Array.isArray(prop.enum)) return prop.enum.map((entry) => ({ label: String(entry), value: entry }));
    return [];
  };

  // Source label for the picked card hint line
  const sourceLabelOf = (source: PickedValue['source']): string => {
    switch (source) {
      case 'upload':
        return '本地上传';
      case 'asset':
        return '资产库';
      case 'inspiration':
        return '灵感库';
      case 'product':
        return '商品库';
      default:
        return '粘贴链接';
    }
  };

  // Removable picked-result card shared by library-picker / media-extractor / product-link
  const renderPickedCard = (fieldKey: string, rawVal: unknown, showSourceHint: boolean) => {
    const display = displayValueOf(rawVal);
    return (
      <div>
        <div className="omx-widget-picked">
          <div className="omx-widget-picked-thumb">
            {display.source === 'upload' && <Upload size={18} />}
            {display.source === 'asset' && <Folder size={18} />}
            {display.source === 'inspiration' && <Sparkles size={18} />}
            {display.source === 'product' && <Store size={18} />}
            {display.source === 'link' && <Link2 size={18} />}
          </div>
          <div className="omx-widget-picked-info">
            <div className="omx-widget-picked-title">{display.name}</div>
            {display.sub && <div className="omx-widget-picked-sub">{display.sub}</div>}
          </div>
          <button // exempt-ui01 ai-app-ui-spec 28px remove picked item button
            type="button"
            className="omx-widget-picked-clear"
            aria-label="移除"
            onClick={() => clearPickedValue(fieldKey)}
          >
            <X size={14} />
          </button>
        </div>
        {showSourceHint && (
          <div className="omx-widget-src-hint">
            来源：<b>{sourceLabelOf(display.source)}</b> · 可随时移除后换其他方式
          </div>
        )}
      </div>
    );
  };

  const renderCategoryIcon = () => {
    switch (manifest.metadata.category) {
      case 'video':
        return <Film size={18} className="omx-apps-icon-video" />;
      case 'audio':
        return <Volume2 size={18} className="omx-apps-icon-audio" />;
      case 'image':
      default:
        return <ImageIcon size={18} className="omx-apps-icon-image" />;
    }
  };

  // Only exposed candidates become form fields; author-fixed ones are summarised below.
  const fieldEntries = Object.entries(manifest.formSchema.properties) as [string, FormPropertySchema][];
  const fixedFields = manifest.fixedFields || [];

  return (
    <div className={`omx-apps-form-panel ${className}`}>
      <form onSubmit={handleSubmit} className="omx-apps-form-inner">
        {/* Application Header Meta */}
        <div className="omx-apps-form-header">
          <div className="omx-apps-form-icon">{renderCategoryIcon()}</div>
          <div className="omx-apps-form-meta">
            <h2 className="omx-apps-form-title">{manifest.metadata.name}</h2>
            {manifest.metadata.description && (
              <div className="omx-apps-form-desc">{manifest.metadata.description}</div>
            )}
          </div>
        </div>

        {/* Global form error message */}
        {errors['_global'] && (
          <div className="omx-apps-global-error">
            <AlertCircle size={14} />
            <span>{errors['_global']}</span>
          </div>
        )}

        {/* Empty state: the publisher exposed nothing for consumers to fill in */}
        {fieldEntries.length === 0 && (
          <div className="omx-apps-form-empty">
            <AlertCircle size={20} />
            <div className="omx-apps-form-empty-title">这个应用暂时没有可填写的内容</div>
            <div className="omx-apps-form-empty-desc">发布者尚未放开任何输入项或生成参数。</div>
          </div>
        )}

        {/* Dynamic Fields List */}
        {fieldEntries.map(([key, prop]: [string, FormPropertySchema]) => {
          const mapping = manifest.fieldMappings[key];
          const label = mapping?.label || prop.title || key;
          const isRequired = manifest.formSchema.required.includes(key);
          const widget = resolveWidget(key, prop);
          const rawVal = values[key];
          const fieldError = errors[key];

          return (
            <div key={key} className="omx-apps-field">
              {/* Field Label (Except switch-boolean which embeds its label) */}
              {widget !== 'switch-boolean' && (
                <div className="omx-apps-field-label">
                  <span>
                    {label}
                    {isRequired && <span className="omx-apps-field-required">*</span>}
                  </span>
                  {prop.description && (
                    <span className="omx-apps-field-desc">{prop.description}</span>
                  )}
                </div>
              )}

              {/* 1. input-text (40px high, 398px wide, 8px radius) */}
              {widget === 'input-text' && (
                <input
                  type="text"
                  className="omx-widget-input-text"
                  value={typeof rawVal === 'string' ? rawVal : ''}
                  placeholder={prop.placeholder || `请输入${label}`}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(key, e.target.value)}
                />
              )}

              {/* 2. textarea (80px high, 398px wide, 10px radius, resize: none) */}
              {widget === 'textarea' && (
                <div className="omx-widget-textarea-wrapper">
                  <textarea
                    className="omx-widget-textarea"
                    value={typeof rawVal === 'string' ? rawVal : ''}
                    placeholder={prop.placeholder || `请输入${label}...`}
                    maxLength={prop.maxLength}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange(key, e.target.value)}
                  />
                  <span className="omx-widget-textarea-count">
                    {String(rawVal || '').length}
                    {prop.maxLength ? ` / ${prop.maxLength}` : ''}
                  </span>
                </div>
              )}

              {/* 3. select-single (40px high, 398px wide, custom dropdown; options label/value aware) */}
              {widget === 'select-single' && (
                <div className="omx-widget-select-single">
                  <div
                    className="omx-widget-select-trigger"
                    onClick={() => setOpenDropdownKey(openDropdownKey === key ? null : key)}
                  >
                    <span>
                      {(() => {
                        const opts = resolveOptions(prop);
                        const matched = opts.find((opt) => opt.value === rawVal || String(opt.value) === String(rawVal ?? ''));
                        if (matched) return matched.label;
                        return String(rawVal ?? prop.placeholder ?? '请选择');
                      })()}
                    </span>
                    <ChevronDown size={14} />
                  </div>
                  {openDropdownKey === key && (
                    <div className="omx-widget-select-options">
                      {resolveOptions(prop).map((opt) => (
                        <div
                          key={String(opt.value)}
                          className={`omx-widget-select-option ${rawVal === opt.value ? 'is-selected' : ''}`}
                          onClick={() => {
                            handleFieldChange(key, opt.value);
                            setOpenDropdownKey(null);
                          }}
                        >
                          <span>{opt.label}</span>
                          {rawVal === opt.value && <Check size={14} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. ratio-cards (aspect ratio cards, 398px wide; options value aware) */}
              {widget === 'ratio-cards' && (
                <div className="omx-widget-ratio-grid">
                  {(() => {
                    const opts = resolveOptions(prop);
                    const ratios = opts.length > 0 ? opts.map((opt) => String(opt.value)) : ['1:1', '4:3', '16:9', '9:16'];
                    return ratios.map((ratioStr) => {
                      const isActive = String(rawVal) === ratioStr;
                      return (
                        <button // exempt-ui01 ai-app-ui-spec 40px ratio card
                          key={ratioStr}
                          type="button"
                          className={`omx-widget-ratio-card ${isActive ? 'is-active' : ''}`}
                          onClick={() => handleFieldChange(key, ratioStr)}
                        >
                          {ratioStr}
                        </button>
                      );
                    });
                  })()}
                </div>
              )}

              {/* 5. slider-range (slider synced with numeric box, 398px wide) */}
              {widget === 'slider-range' && (
                <div className="omx-widget-slider-box">
                  <input
                    type="range"
                    className="omx-widget-slider-track"
                    min={prop.minimum ?? 0}
                    max={prop.maximum ?? 100}
                    step={prop.type === 'integer' ? 1 : 0.1}
                    value={typeof rawVal === 'number' ? rawVal : (prop.minimum ?? 0)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFieldChange(
                        key,
                        prop.type === 'integer' ? parseInt(e.target.value, 10) : parseFloat(e.target.value),
                      )
                    }
                  />
                  <input
                    type="number"
                    className="omx-widget-slider-num"
                    min={prop.minimum ?? 0}
                    max={prop.maximum ?? 100}
                    value={typeof rawVal === 'number' ? rawVal : (prop.minimum ?? 0)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const num =
                        prop.type === 'integer' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                      if (!isNaN(num)) handleFieldChange(key, num);
                    }}
                  />
                </div>
              )}

              {/* 6. switch-boolean (toggle switch with label, 398px wide) */}
              {widget === 'switch-boolean' && (
                <div className="omx-widget-switch-row">
                  <span className="omx-widget-switch-label">{label}</span>
                  <div
                    className={`omx-widget-switch-track ${rawVal ? 'is-checked' : ''}`}
                    onClick={() => handleFieldChange(key, !rawVal)}
                  >
                    <div className="omx-widget-switch-thumb" />
                  </div>
                </div>
              )}

              {/* 7. media-uploader (398px wide drag-and-drop selector & preview) */}
              {widget === 'media-uploader' && (
                <div>
                  {rawVal && typeof rawVal === 'string' && rawVal.trim() ? (
                    <div className="omx-widget-uploader-wrapper">
                      <img src={rawVal} alt="Uploaded" className="omx-widget-uploader-preview" />
                      <button // exempt-ui01 ai-app-ui-spec replace media button
                        type="button"
                        className="omx-widget-uploader-replace-btn"
                        onClick={() => handleFieldChange(key, '')}
                      >
                        更换
                      </button>
                    </div>
                  ) : (
                    <div
                      className="omx-widget-uploader"
                      onClick={() => {
                        const inputUrl = window.prompt?.('请输入媒体素材资源 URL:');
                        if (inputUrl) handleFieldChange(key, inputUrl.trim());
                      }}
                    >
                      <Upload size={20} className="omx-widget-uploader-icon" />
                      <span className="omx-widget-uploader-hint">
                        点击选择或拖拽上传媒体素材
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 8. media-extractor (three sources: paste link / local upload / asset library) */}
              {widget === 'media-extractor' && (
                typeof rawVal === 'string' && rawVal.trim() ? (
                  renderPickedCard(key, rawVal, true)
                ) : (
                  <div className="omx-widget-extractor">
                    <input
                      type="text"
                      className="omx-widget-extractor-input"
                      value={linkDrafts[key] ?? ''}
                      placeholder={prop.placeholder || '粘贴视频链接或上传，自动解析'}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setLinkDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      onBlur={() => commitLinkDraft(key)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitLinkDraft(key);
                        }
                      }}
                    />
                    <button // exempt-ui01 ai-app-ui-spec 36px upload icon button
                      type="button"
                      className="omx-widget-extractor-icon-btn"
                      aria-label="本地上传"
                      onClick={() => openUpload(key)}
                    >
                      <Upload size={16} />
                    </button>
                    <button // exempt-ui01 ai-app-ui-spec 36px asset library icon button
                      type="button"
                      className="omx-widget-extractor-icon-btn"
                      aria-label="从资产库选择"
                      onClick={() => openPicker(key, 'asset')}
                    >
                      <Folder size={16} />
                    </button>
                    <button // exempt-ui01 ai-app-ui-spec 36px parse action button
                      type="button"
                      className="omx-widget-extractor-btn"
                      onClick={() => commitLinkDraft(key)}
                    >
                      解析
                    </button>
                  </div>
                )
              )}

              {/* 9. select-grid-pair (Dual-column dropdown, each 195px, gap 8px) */}
              {widget === 'select-grid-pair' && (
                <div className="omx-widget-grid-pair">
                  <div className="omx-widget-grid-col">
                    <input
                      type="text"
                      className="omx-widget-input-text omx-widget-grid-input"
                      value={typeof rawVal === 'string' ? rawVal : ''}
                      placeholder="选项 A"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(key, e.target.value)}
                    />
                  </div>
                  <div className="omx-widget-grid-col">
                    <input
                      type="text"
                      className="omx-widget-input-text omx-widget-grid-input"
                      value=""
                      placeholder="选项 B"
                      readOnly
                    />
                  </div>
                </div>
              )}

              {/* 10. library-picker (asset / inspiration / product library modal) */}
              {widget === 'library-picker' && (
                typeof rawVal === 'string' && rawVal.trim() ? (
                  renderPickedCard(key, rawVal, false)
                ) : (
                  <button // exempt-ui01 ai-app-ui-spec 40px library picker trigger row
                    type="button"
                    className="omx-widget-library-trigger"
                    onClick={() => openPicker(key, (prop.library as LibraryKind) || 'asset')}
                  >
                    <span>{prop.placeholder || `${LIBRARY_META[(prop.library as LibraryKind) || 'asset'].triggerText}…`}</span>
                    {(prop.library === 'inspiration') && <Sparkles size={16} />}
                    {(prop.library === 'product') && <Store size={16} />}
                    {(!prop.library || prop.library === 'asset') && <Folder size={16} />}
                  </button>
                )
              )}

              {/* 11. multi-tags (capsule multi-select with max limit) */}
              {widget === 'multi-tags' && (() => {
                const options = resolveOptions(prop);
                const selected: string[] = Array.isArray(rawVal) ? (rawVal as unknown[]).map(String) : [];
                const max = typeof prop.maxItems === 'number' ? prop.maxItems : undefined;
                const limitHit = max !== undefined && selected.length >= max;
                return (
                  <div className="omx-widget-multi-box">
                    <div className="omx-widget-multi-tags">
                      {options.map((opt) => {
                        const val = String(opt.value);
                        const isOn = selected.includes(val);
                        const isLocked = !isOn && limitHit;
                        return (
                          <button // exempt-ui01 ai-app-ui-spec 30px capsule tag
                            key={val}
                            type="button"
                            className={`omx-widget-mtag ${isOn ? 'is-on' : ''} ${isLocked ? 'is-locked' : ''}`}
                            disabled={isLocked}
                            onClick={() => {
                              const next = isOn
                                ? selected.filter((entry) => entry !== val)
                                : [...selected, val];
                              handleFieldChange(key, next);
                            }}
                          >
                            {isOn && <Check size={13} />}
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="omx-widget-multi-foot">
                      <span>{max !== undefined ? `已选 ${selected.length} / ${max}` : `已选 ${selected.length}`}</span>
                      {limitHit && <span className="omx-widget-multi-limit">已达上限，先取消一项</span>}
                    </div>
                  </div>
                );
              })()}

              {/* 12. segmented-tabs (2~4 option segmented single choice, 44px) */}
              {widget === 'segmented-tabs' && (
                <div className="omx-widget-seg-tabs" role="tablist">
                  {resolveOptions(prop).map((opt) => {
                    const isOn = String(rawVal ?? '') === String(opt.value);
                    return (
                      <button // exempt-ui01 ai-app-ui-spec 44px segmented tab
                        key={String(opt.value)}
                        type="button"
                        role="tab"
                        aria-selected={isOn}
                        className={`omx-widget-seg-tab ${isOn ? 'is-on' : ''}`}
                        onClick={() => handleFieldChange(key, opt.value)}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 13. product-link (single-line input + product library button) */}
              {widget === 'product-link' && (
                typeof rawVal === 'string' && rawVal.trim() ? (
                  renderPickedCard(key, rawVal, false)
                ) : (
                  <div className="omx-widget-extractor">
                    <input
                      type="text"
                      className="omx-widget-extractor-input"
                      value={linkDrafts[key] ?? ''}
                      placeholder={prop.placeholder || '粘贴商品链接，或从商品库选择'}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setLinkDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      onBlur={() => commitLinkDraft(key)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitLinkDraft(key);
                        }
                      }}
                    />
                    <button // exempt-ui01 ai-app-ui-spec 36px product library icon button
                      type="button"
                      className="omx-widget-extractor-icon-btn"
                      aria-label="从商品库选择"
                      onClick={() => openPicker(key, 'product')}
                    >
                      <Store size={16} />
                    </button>
                  </div>
                )
              )}

              {/* Inline error message */}
              {fieldError && <div className="omx-apps-field-error">{fieldError}</div>}
            </div>
          );
        })}

        {/* Author-fixed summary: what the publisher decided, hidden from end users */}
        {fixedFields.length > 0 && (
          <div className="omx-apps-fixed-summary">
            <div className="omx-apps-fixed-summary-title">
              <Sliders size={14} />
              <span>以下由作者设定，无需填写</span>
            </div>
            <div className="omx-apps-fixed-summary-chips">
              {fixedFields.map((field) => (
                <span key={field.key} className="omx-apps-fixed-chip">
                  {field.label}
                  <b>{field.value}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Primary Ink CTA Button (44px high, 398px wide, 8px radius) */}
        <button // exempt-ui01 ai-app-ui-spec 44px primary Ink CTA button
          type="submit"
          className="omx-apps-cta-btn"
          disabled={isSubmitting || fieldEntries.length === 0}
        >
          <Sparkles size={16} />
          <span>{isSubmitting ? '正在生成...' : '立即生成'}</span>
        </button>
      </form>

      {/* Hidden file input for the media-extractor local upload source */}
      <input
        type="file"
        accept="video/*,image/*"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleUploadFile}
      />

      {/* Library picker modal (search + grid + confirm) */}
      {picker && (
        <div className="omx-widget-modal-mask" onClick={(e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) closePicker(); }}>
          <div className="omx-widget-modal" role="dialog" aria-label={LIBRARY_META[picker.library].title}>
            <div className="omx-widget-modal-head">
              <div>
                <h3 className="omx-widget-modal-title">{LIBRARY_META[picker.library].title}</h3>
                <div className="omx-widget-modal-sub">{LIBRARY_META[picker.library].subtitle}</div>
              </div>
              <button // exempt-ui01 ai-app-ui-spec 30px modal close button
                type="button"
                className="omx-widget-modal-close"
                aria-label="关闭"
                onClick={closePicker}
              >
                <X size={14} />
              </button>
            </div>
            <div className="omx-widget-modal-search">
              <input
                type="text"
                className="omx-widget-input-text"
                value={pickerQuery}
                placeholder="搜索..."
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPickerQuery(e.target.value)}
              />
            </div>
            <div className="omx-widget-modal-body">
              {pickerLoading && <div className="omx-widget-modal-empty">加载中…</div>}
              {!pickerLoading && pickerUnavailable && (
                <div className="omx-widget-modal-empty">库暂不可用，请稍后重试</div>
              )}
              {!pickerLoading && !pickerUnavailable && (
                (() => {
                  const q = pickerQuery.trim().toLowerCase();
                  const visible = q
                    ? pickerItems.filter((item) => `${item.name}\n${item.sub}`.toLowerCase().includes(q))
                    : pickerItems;
                  if (visible.length === 0) {
                    return (
                      <div className="omx-widget-modal-empty">
                        {pickerItems.length === 0 ? LIBRARY_META[picker.library].emptyText : '没有匹配的内容'}
                      </div>
                    );
                  }
                  return (
                    <div className="omx-widget-lib-grid">
                      {visible.map((item) => {
                        // Whitelist preview schemes before using them as <img src>
                        const previewSrc = sanitizePreviewUrl(item.preview);
                        return (
                        <div
                          key={item.id}
                          className={`omx-widget-lib-item ${pickerSelectedId === item.id ? 'is-on' : ''}`}
                          onClick={() => setPickerSelectedId(item.id)}
                        >
                          <div className="omx-widget-lib-thumb">
                            {picker.library === 'inspiration' ? (
                              <Sparkles size={22} />
                            ) : picker.library === 'product' ? (
                              <Store size={22} />
                            ) : (
                              <Folder size={22} />
                            )}
                            {previewSrc && (
                              <img
                                src={previewSrc}
                                alt=""
                                className="omx-widget-lib-thumb-img"
                                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                          </div>
                          <div className="omx-widget-lib-name">{item.name}</div>
                          {item.sub && <div className="omx-widget-lib-sub">{item.sub}</div>}
                        </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
            <div className="omx-widget-modal-foot">
              <button // exempt-ui01 ai-app-ui-spec 32px modal cancel button
                type="button"
                className="omx-widget-modal-btn"
                onClick={closePicker}
              >
                取消
              </button>
              <button // exempt-ui01 ai-app-ui-spec 32px modal confirm button
                type="button"
                className="omx-widget-modal-btn omx-widget-modal-btn-primary"
                disabled={!pickerSelectedId}
                onClick={confirmPicker}
              >
                确认选择
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default AppFormPanel;
