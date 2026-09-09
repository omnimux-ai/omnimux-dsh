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

import React, { memo, useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  ChevronDown,
  Upload,
  Check,
  AlertCircle,
  Film,
  Image as ImageIcon,
  Volume2,
} from 'lucide-react';
import type {
  ApplicationManifest,
  FormWidgetType,
  FormPropertySchema,
} from '../shared/manifest.ts';
import { validateFormData } from '../shared/schemaValidator.ts';
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
    if (prop.enum && prop.enum.length <= 4 && prop.enum.some((e) => String(e).includes(':'))) {
      return 'ratio-cards';
    }
    if (prop.enum) return 'select-single';
    if (prop.type === 'string' && (prop.maxLength !== undefined && prop.maxLength > 100)) return 'textarea';
    return 'input-text';
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

        {/* Dynamic Fields List */}
        {Object.entries(manifest.formSchema.properties).map(([key, prop]: [string, FormPropertySchema]) => {
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

              {/* 3. select-single (40px high, 398px wide, custom dropdown) */}
              {widget === 'select-single' && (
                <div className="omx-widget-select-single">
                  <div
                    className="omx-widget-select-trigger"
                    onClick={() => setOpenDropdownKey(openDropdownKey === key ? null : key)}
                  >
                    <span>{String(rawVal ?? prop.placeholder ?? '请选择')}</span>
                    <ChevronDown size={14} />
                  </div>
                  {openDropdownKey === key && (
                    <div className="omx-widget-select-options">
                      {(prop.enum || []).map((opt: unknown) => (
                        <div
                          key={String(opt)}
                          className={`omx-widget-select-option ${rawVal === opt ? 'is-selected' : ''}`}
                          onClick={() => {
                            handleFieldChange(key, opt);
                            setOpenDropdownKey(null);
                          }}
                        >
                          <span>{String(opt)}</span>
                          {rawVal === opt && <Check size={14} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. ratio-cards (aspect ratio cards, 398px wide) */}
              {widget === 'ratio-cards' && (
                <div className="omx-widget-ratio-grid">
                  {(prop.enum || ['1:1', '4:3', '16:9', '9:16']).map((ratio: unknown) => {
                    const ratioStr = String(ratio);
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
                  })}
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

              {/* 8. media-extractor (compound input, 40px outer, 36px action button) */}
              {widget === 'media-extractor' && (
                <div className="omx-widget-extractor">
                  <input
                    type="text"
                    className="omx-widget-extractor-input"
                    value={typeof rawVal === 'string' ? rawVal : ''}
                    placeholder="粘贴短视频/网页链接..."
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(key, e.target.value)}
                  />
                  <button // exempt-ui01 ai-app-ui-spec 36px parse action button
                    type="button"
                    className="omx-widget-extractor-btn"
                    onClick={() => {
                      if (!rawVal) return;
                      handleFieldChange(key, String(rawVal).trim());
                    }}
                  >
                    解析
                  </button>
                </div>
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

              {/* Inline error message */}
              {fieldError && <div className="omx-apps-field-error">{fieldError}</div>}
            </div>
          );
        })}

        {/* Primary Ink CTA Button (44px high, 398px wide, 8px radius) */}
        <button // exempt-ui01 ai-app-ui-spec 44px primary Ink CTA button
          type="submit"
          className="omx-apps-cta-btn"
          disabled={isSubmitting}
        >
          <Sparkles size={16} />
          <span>{isSubmitting ? '正在生成...' : '立即生成'}</span>
        </button>
      </form>
    </div>
  );
});

export default AppFormPanel;
