/**
 * plugins/omnimux-workflow/src/canvas/editor/components/publish/PublishWizardModal.tsx
 *
 * 3-Step Publishing Wizard Modal to transform an OmniMux Workflow into a standalone AI Application.
 * Step 1: Basic Information (Name, strictly video|image|audio category, description)
 * Step 2: Input Field Exposure (Root inDegree=0 defaults to exposed/required, downstream inDegree>0 collapsible)
 * Step 3: Cover & Showcase Preview Configuration
 * On Confirm: Assembles ApplicationManifest, validates schema, persists, dispatches sidebar tab events.
 *
 * Contract: docs/contracts/ai-app-ui-spec.md & docs/contracts/workflow-app-boundary.md
 */

import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Share2,
  Check,
  Video,
  Image as ImageIcon,
  Music,
  ChevronDown,
  ChevronRight,
  Layers,
  ArrowRight,
  ArrowLeft,
  Sliders,
} from 'lucide-react';
import { CustomModal, toast } from '../../../ui';
import {
  analyzeWorkflowInputs,
  generateFormConfig,
  type FlowNodeLike,
  type FlowEdgeLike,
  type ToolCatalogProvider,
} from './topologyAnalyzer.ts';
import type {
  ApplicationCategory,
  ApplicationManifest,
  ExposedWorkflowInput,
  ShowcaseMode,
  ShowcaseItem,
} from './publishTypes.ts';

export interface PublishWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: FlowNodeLike[];
  edges: FlowEdgeLike[];
  catalog?: ToolCatalogProvider | null;
  workspaceId?: string | null;
  workflowName?: string;
  onPublished?: (manifest: ApplicationManifest) => void;
}

const CATEGORIES: Array<{ key: ApplicationCategory; label: string; icon: React.ReactNode; desc: string }> = [
  {
    key: 'video',
    label: '视频应用',
    icon: <Video size={16} />,
    desc: '适用于短视频生成、视频微调、内容二创与复刻',
  },
  {
    key: 'image',
    label: '图片应用',
    icon: <ImageIcon size={16} />,
    desc: '适用于文生图、图生图、角色一致性与画风迁移',
  },
  {
    key: 'audio',
    label: '音频应用',
    icon: <Music size={16} />,
    desc: '适用于语音合成、声音克隆、配乐与音效生成',
  },
];

const DEFAULT_CATEGORY_ICONS: Record<ApplicationCategory, string> = {
  video: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`,
  image: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  audio: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
};

const DEFAULT_CATEGORY_COVERS: Record<ApplicationCategory, string> = {
  video: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="%231a1a24"/><circle cx="320" cy="180" r="48" fill="%237c3aed" opacity="0.8"/><polygon points="312,160 336,180 312,200" fill="%23ffffff"/></svg>',
  image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="%231a1a24"/><rect x="260" y="120" width="120" height="120" rx="16" fill="%232563eb" opacity="0.8"/></svg>',
  audio: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="%231a1a24"/><circle cx="320" cy="180" r="44" fill="%23059669" opacity="0.8"/></svg>',
};

const DEFAULT_CATEGORY_MEDIA_URLS: Record<ApplicationCategory, string> = {
  video: 'https://cdn.omnimux.com/samples/video-default.mp4',
  image: 'https://cdn.omnimux.com/samples/image-default.png',
  audio: 'https://cdn.omnimux.com/samples/audio-default.mp3',
};

export const PublishWizardModal: React.FC<PublishWizardModalProps> = memo(({
  isOpen,
  onClose,
  nodes,
  edges,
  catalog,
  workspaceId,
  workflowName,
  onPublished,
}) => {
  // 1. Run pure topology analysis on workflow graph
  const analysis = useMemo(() => {
    if (!isOpen) return null;
    return analyzeWorkflowInputs(nodes, edges, catalog || undefined);
  }, [isOpen, nodes, edges, catalog]);

  // Step 1: Basic Info
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [appName, setAppName] = useState('');
  const [category, setCategory] = useState<ApplicationCategory>('video');
  const [description, setDescription] = useState('');

  // Step 2: Exposed Inputs
  const [inputs, setInputs] = useState<ExposedWorkflowInput[]>([]);
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);

  // Step 3: Showcase & Cover
  const [coverUrl, setCoverUrl] = useState('');
  const [showcaseMode, setShowcaseMode] = useState<ShowcaseMode>('carousel');
  const [showcaseItems, setShowcaseItems] = useState<ShowcaseItem[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize state from topology analysis
  useEffect(() => {
    if (!isOpen || !analysis) return;

    setCurrentStep(1);
    const initialName = (workflowName || workspaceId || '新创作应用').replace(/[_-]/g, ' ');
    setAppName(initialName);
    setCategory(analysis.categorySuggestion);
    setDescription('');
    setInputs(analysis.inputs.map((inp) => ({ ...inp })));
    setCoverUrl(DEFAULT_CATEGORY_COVERS[analysis.categorySuggestion]);
    setShowcaseMode('carousel');
    setShowcaseItems([
      {
        id: `showcase_${Date.now()}`,
        title: `${initialName} 示例演示`,
        mediaType: analysis.categorySuggestion,
        mediaUrl: DEFAULT_CATEGORY_MEDIA_URLS[analysis.categorySuggestion],
        posterUrl: DEFAULT_CATEGORY_COVERS[analysis.categorySuggestion],
      },
    ]);
    setIsSubmitting(false);
  }, [isOpen, analysis, workflowName, workspaceId]);

  if (!isOpen || !analysis) return null;

  // Toggle field exposure
  const handleToggleExpose = (key: string) => {
    setInputs((prev) =>
      prev.map((inp) => (inp.key === key ? { ...inp, isExposed: !inp.isExposed } : inp)),
    );
  };

  // Toggle field required
  const handleToggleRequired = (key: string) => {
    setInputs((prev) =>
      prev.map((inp) => (inp.key === key ? { ...inp, isRequired: !inp.isRequired } : inp)),
    );
  };

  // Change field title
  const handleFieldTitleChange = (key: string, title: string) => {
    setInputs((prev) =>
      prev.map((inp) => (inp.key === key ? { ...inp, fieldTitle: title } : inp)),
    );
  };

  // Group inputs into root (inDegree === 0) vs downstream (inDegree > 0)
  const rootInputs = inputs.filter((inp) => inp.isRoot);
  const downstreamInputs = inputs.filter((inp) => !inp.isRoot);

  // Handle final publish execution
  const handlePublish = async () => {
    if (!appName.trim()) {
      toast.warning('请输入应用名称');
      setCurrentStep(1);
      return;
    }

    const exposedInputs = inputs.filter((inp) => inp.isExposed);
    if (exposedInputs.length === 0) {
      toast.warning('请至少暴露一个输入项供消费端填写');
      setCurrentStep(2);
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Generate standard restricted JSON schema and field mappings
      const generatedConfig = generateFormConfig(exposedInputs);

      // 2. Derive stable appId (alphanumeric, underscore, dash)
      const cleanSlug = appName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'app';
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      const appId = `app_${cleanSlug}_${randomSuffix}`;

      // 3. Assemble complete ApplicationManifest conforming to L1 schema
      const manifest: ApplicationManifest = {
        appId,
        version: '1.0.0',
        schemaVersion: '1.0',
        createdAt: new Date().toISOString(),
        metadata: {
          name: appName.trim(),
          category,
          description: description.trim() || undefined,
          iconSvg: DEFAULT_CATEGORY_ICONS[category],
          coverUrl: coverUrl || DEFAULT_CATEGORY_COVERS[category],
        },
        workflowBinding: {
          workspaceId: workspaceId || 'workspace_main',
          workflowHash: analysis.workflowHash,
          snapshot: {
            nodes: nodes as unknown[],
            edges: edges as unknown[],
          },
        },
        formSchema: generatedConfig.formSchema,
        fieldMappings: generatedConfig.fieldMappings,
        showcase: {
          mode: showcaseMode,
          items: showcaseItems.length > 0
            ? showcaseItems
            : [
                {
                  id: `showcase_${Date.now()}`,
                  title: `${appName.trim()} 演示效果`,
                  mediaType: category,
                  mediaUrl: DEFAULT_CATEGORY_MEDIA_URLS[category],
                  posterUrl: coverUrl || DEFAULT_CATEGORY_COVERS[category],
                },
              ],
        },
        demoSnapshot: generatedConfig.demoSnapshot,
      };

      // 4. Persist to host storage (via host HTTP API or direct storage cache)
      try {
        if (typeof window !== 'undefined') {
          const cachedManifests = JSON.parse(window.localStorage?.getItem('omnimux_apps_manifests') || '{}');
          cachedManifests[manifest.appId] = manifest;
          window.localStorage?.setItem('omnimux_apps_manifests', JSON.stringify(cachedManifests));

          fetch('/omnimux/apps/manifest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(manifest),
          }).catch(() => {});
        }
      } catch {
        // Safe fallback
      }

      // 5. Register Sidebar Tab & notify listeners
      if (typeof window !== 'undefined') {
        fetch(`/omnimux/apps/tabs/${encodeURIComponent(manifest.appId)}`, { method: 'POST' }).catch(() => {});
        window.dispatchEvent(new CustomEvent('omnimux-app-tabs-changed'));
        window.dispatchEvent(
          new CustomEvent('omnimux-app-open', {
            detail: { id: manifest.appId, manifest },
          }),
        );

        // 显式调用 window.__omnimuxOpenAppTab 或通过 window.__omnimuxBetterSidebar.openTab 调度打开该新 Tab
        const win = window as any;
        if (typeof win.__omnimuxOpenAppTab === 'function') {
          win.__omnimuxOpenAppTab(manifest);
        } else if (win.__omnimuxBetterSidebar && typeof win.__omnimuxBetterSidebar.openTab === 'function') {
          win.__omnimuxBetterSidebar.openTab({
            type: 'omnimux-workflow:app',
            id: `app_${manifest.appId}`,
            title: manifest.metadata?.name || 'AI 应用',
            path: `app://${manifest.appId}`,
            extra: { manifest, appId: manifest.appId },
          });
        }
      }

      // 6. Invoke onPublished callback if provided
      onPublished?.(manifest);

      toast.success(`AI 应用「${appName.trim()}」已成功发布！已自动开启侧栏 Tab。`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发布应用失败，请检查配置');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CustomModal
      open={isOpen}
      onCancel={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Share2 size={18} style={{ color: 'var(--dsw-alias-brand-primary, #7c3aed)' }} />
          <span>发布为 AI 应用</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.08))',
              color: 'var(--dsw-alias-label-secondary, #a1a1aa)',
            }}
          >
            步骤 {currentStep} / 3
          </span>
        </div>
      }
      width={680}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                className="wf-btn"
                style={{
                  height: '32px',
                  padding: '0 14px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.08))',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                  border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12))',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onClick={() => setCurrentStep((s) => (s - 1) as 1 | 2 | 3)}
              >
                <ArrowLeft size={14} />
                上一步
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="wf-btn"
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '6px',
                background: 'transparent',
                color: 'var(--dsw-alias-label-secondary, #a1a1aa)',
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={onClose}
            >
              取消
            </button>

            {currentStep < 3 ? (
              <button
                type="button"
                className="wf-btn"
                style={{
                  height: '32px',
                  padding: '0 16px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-button-primary-fill, #fff)',
                  color: 'var(--dsw-alias-label-primary-inverted, #000)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 500,
                }}
                onClick={() => {
                  if (currentStep === 1 && !appName.trim()) {
                    toast.warning('请输入应用名称');
                    return;
                  }
                  setCurrentStep((s) => (s + 1) as 1 | 2 | 3);
                }}
              >
                下一步
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="wf-btn"
                disabled={isSubmitting}
                style={{
                  height: '32px',
                  padding: '0 18px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-state-business-primary, #4c8dff)',
                  color: 'var(--dsw-alias-label-primary-inverted, #fff)',
                  border: 'none',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                  opacity: isSubmitting ? 0.6 : 1,
                }}
                onClick={handlePublish}
              >
                <Check size={14} />
                {isSubmitting ? '发布中...' : '确定发布并开启 Tab'}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="wf-publish-wizard" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Step Indicator Pills */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))',
            paddingBottom: '16px',
          }}
        >
          {[
            { step: 1, label: '1. 基础画像' },
            { step: 2, label: '2. 输入项暴露' },
            { step: 3, label: '3. 封面与预览' },
          ].map((item) => (
            <button
              key={item.step}
              type="button"
              onClick={() => setCurrentStep(item.step as 1 | 2 | 3)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '32px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: currentStep === item.step ? 600 : 400,
                background:
                  currentStep === item.step
                    ? 'var(--dsw-alias-interactive-bg-active, rgba(255,255,255,0.14))'
                    : 'transparent',
                color:
                  currentStep === item.step
                    ? 'var(--dsw-alias-label-primary, #fff)'
                    : 'var(--dsw-alias-label-secondary, #71717a)',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* STEP 1: 基础信息 */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  marginBottom: '6px',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                }}
              >
                应用名称 <span style={{ color: 'var(--dsw-alias-state-error-primary, #ef4444)' }}>*</span>
              </label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="例如：爆款口播短视频复刻"
                style={{
                  width: '100%',
                  height: '40px',
                  borderRadius: '8px',
                  boxSizing: 'border-box',
                  padding: '0 12px',
                  background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.06))',
                  border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12))',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                  outline: 'none',
                }}
                autoFocus
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  marginBottom: '6px',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                }}
              >
                核心分类（严格受限单选）
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {CATEGORIES.map((cat) => {
                  const isSelected = category === cat.key;
                  const isSuggested = analysis.categorySuggestion === cat.key;
                  return (
                    <div
                      key={cat.key}
                      onClick={() => setCategory(cat.key)}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                        border: isSelected
                          ? '1px solid var(--dsw-alias-state-business-primary, #4c8dff)'
                          : '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))',
                        background: isSelected
                          ? 'var(--dsw-alias-interactive-bg-active, rgba(76,141,255,0.15))'
                          : 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.04))',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}>
                          {cat.icon}
                          <span>{cat.label}</span>
                        </div>
                        {isSuggested && (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'var(--dsw-alias-state-success-primary, #10b981)',
                              color: '#fff',
                            }}
                          >
                            推荐
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #a1a1aa)', lineHeight: 1.4 }}>
                        {cat.desc}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  marginBottom: '6px',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                }}
              >
                应用描述（可选）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要介绍此应用的功能和使用方式..."
                rows={3}
                style={{
                  width: '100%',
                  borderRadius: '8px',
                  boxSizing: 'border-box',
                  padding: '8px 12px',
                  background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.06))',
                  border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12))',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                  outline: 'none',
                  resize: 'none',
                }}
              />
            </div>
          </div>
        )}

        {/* STEP 2: 输入项暴露勾选 */}
        {currentStep === 2 && (
          <div
            className="nodrag nopan"
            onWheel={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '420px',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              scrollbarGutter: 'stable',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Layers size={14} style={{ color: 'var(--dsw-alias-state-business-primary, #4c8dff)' }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-primary, #fff)' }}>
                  核心输入项（入度 = 0，默认暴露且必填）
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rootInputs.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, #71717a)', padding: '12px 0' }}>
                    当前工作流无根输入节点。
                  </div>
                ) : (
                  rootInputs.map((inp) => (
                    <div
                      key={inp.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.04))',
                        border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={inp.isExposed}
                        onChange={() => handleToggleExpose(inp.key)}
                        style={{ cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <input
                            type="text"
                            value={inp.fieldTitle}
                            onChange={(e) => handleFieldTitleChange(inp.key, e.target.value)}
                            style={{
                              height: '28px',
                              padding: '0 8px',
                              fontSize: '12px',
                              borderRadius: '4px',
                              border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.15))',
                              background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.08))',
                              color: 'var(--dsw-alias-label-primary, #fff)',
                              outline: 'none',
                              width: '180px',
                            }}
                          />
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.12))',
                              color: 'var(--dsw-alias-label-secondary, #a1a1aa)',
                            }}
                          >
                            {inp.widget}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #71717a)' }}>
                          节点: {inp.nodeLabel} ({inp.nodeId}) · 字段: {inp.targetField}
                        </div>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={inp.isRequired}
                          onChange={() => handleToggleRequired(inp.key)}
                          disabled={!inp.isExposed}
                        />
                        必填
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Downstream inputs (collapsible) */}
            {downstreamInputs.length > 0 && (
              <div style={{ borderTop: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))', paddingTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsAdvancedExpanded((prev) => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--dsw-alias-label-secondary, #a1a1aa)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '4px 0',
                  }}
                >
                  {isAdvancedExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Sliders size={14} />
                  <span>高级参数与未接槽位 ({downstreamInputs.length} 项可选暴露)</span>
                </button>

                {isAdvancedExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    {downstreamInputs.map((inp) => (
                      <div
                        key={inp.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.03))',
                          border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.06))',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={inp.isExposed}
                          onChange={() => handleToggleExpose(inp.key)}
                          style={{ cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <input
                              type="text"
                              value={inp.fieldTitle}
                              onChange={(e) => handleFieldTitleChange(inp.key, e.target.value)}
                              style={{
                                height: '26px',
                                padding: '0 8px',
                                fontSize: '11px',
                                borderRadius: '4px',
                                border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12))',
                                background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06))',
                                color: 'var(--dsw-alias-label-primary, #fff)',
                                outline: 'none',
                                width: '160px',
                              }}
                            />
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.1))',
                                color: 'var(--dsw-alias-label-secondary, #a1a1aa)',
                              }}
                            >
                              {inp.widget}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #71717a)' }}>
                            下游节点: {inp.nodeLabel} · 参数: {inp.targetField}
                          </div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={inp.isRequired}
                            onChange={() => handleToggleRequired(inp.key)}
                            disabled={!inp.isExposed}
                          />
                          必填
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: 封面与预览 */}
        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  marginBottom: '6px',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                }}
              >
                应用封面（URL 或默认预设）
              </label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <img
                  src={coverUrl || DEFAULT_CATEGORY_COVERS[category]}
                  alt="Cover preview"
                  style={{
                    width: '120px',
                    height: '68px',
                    borderRadius: '6px',
                    objectFit: 'cover',
                    background: 'var(--dsw-alias-bg-layer-2, #232324)',
                    border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.1))',
                  }}
                />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input
                    type="text"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="可粘贴图片 URL 或使用分类默认封面"
                    style={{
                      width: '100%',
                      height: '34px',
                      borderRadius: '6px',
                      padding: '0 10px',
                      fontSize: '12px',
                      background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.06))',
                      border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12))',
                      color: 'var(--dsw-alias-label-primary, #fff)',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setCoverUrl(DEFAULT_CATEGORY_COVERS[category])}
                    style={{
                      alignSelf: 'flex-start',
                      fontSize: '11px',
                      color: 'var(--dsw-alias-brand-primary, #7c3aed)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    恢复分类默认封面
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  marginBottom: '6px',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                }}
              >
                示例展示模式
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {(
                  [
                    { key: 'carousel', label: '轮播展示 (Carousel)' },
                    { key: 'gallery', label: '网格画廊 (Gallery)' },
                    { key: 'comparison', label: '并排对比 (Comparison)' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setShowcaseMode(m.key)}
                    style={{
                      height: '36px',
                      borderRadius: '6px',
                      border:
                        showcaseMode === m.key
                          ? '1px solid var(--dsw-alias-state-business-primary, #4c8dff)'
                          : '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))',
                      background:
                        showcaseMode === m.key
                          ? 'var(--dsw-alias-interactive-bg-active, rgba(76,141,255,0.15))'
                          : 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.04))',
                      color:
                        showcaseMode === m.key
                          ? 'var(--dsw-alias-label-primary, #fff)'
                          : 'var(--dsw-alias-label-secondary, #a1a1aa)',
                      fontSize: '12px',
                      fontWeight: showcaseMode === m.key ? 500 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </CustomModal>
  );
});

export default PublishWizardModal;
