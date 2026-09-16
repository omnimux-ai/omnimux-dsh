/**
 * plugins/omnimux-workflow/src/canvas/editor/components/publish/PublishWizardModal.tsx
 *
 * 3-Step Publishing Wizard Modal to transform an OmniMux Workflow into a standalone AI Application.
 * Step 1: Basic Information (Name, strictly video|image|audio category, description)
 * Step 2: Input & config exposure (grouped candidates, recommended set on by default, per-item switch)
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
  Layers,
  ArrowRight,
  ArrowLeft,
  Sliders,
  Type,
  RotateCcw,
  AlertCircle,
  Info,
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
  InputGroupId,
  ShowcaseMode,
  ShowcaseItem,
} from './publishTypes.ts';
import { resolveProjectIdForWorkspace } from './publishProjectBinding.ts';

export interface PublishWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: FlowNodeLike[];
  edges: FlowEdgeLike[];
  catalog?: ToolCatalogProvider | null;
  workspaceId?: string | null;
  workflowName?: string;
  /**
   * 本次发布收敛的工作流组 id。snapshot 只含组内子节点（组节点被
   * childIdsOfGroup 排除），组身份必须显式落盘，才能支撑「项目」页
   * 「AI应用」卡片「编辑」的定位。
   */
  groupId?: string | null;
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

/** Candidate groups rendered in step 2, in display order */
const INPUT_GROUP_META: Array<{ id: InputGroupId; label: string; hint: string; icon: React.ReactNode }> = [
  { id: 'asset', label: '素材输入', hint: '用户提供的图片 / 视频 / 音频', icon: <ImageIcon size={14} /> },
  { id: 'text', label: '文本输入', hint: '用户提供的文字内容', icon: <Type size={14} /> },
  { id: 'config', label: '生成配置', hint: '生成参数，可放开给用户，也可由你固定', icon: <Sliders size={14} /> },
];

/** Badge palette for candidate rows; colors come from host semantic tokens */
const BADGE_STYLES: Record<'recommend' | 'required' | 'fixed' | 'internal', React.CSSProperties> = {
  recommend: {
    background: 'var(--dsw-alias-state-success-primary, rgba(34,197,94,0.12))',
    color: 'var(--dsw-alias-label-success, #4ade80)',
  },
  required: {
    background: 'var(--dsw-alias-state-warn-primary, rgba(245,158,11,0.12))',
    color: 'var(--dsw-alias-label-warning, #fbbf24)',
  },
  fixed: {
    background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06))',
    color: 'var(--dsw-alias-label-secondary, #a1a1aa)',
  },
  internal: {
    background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.04))',
    color: 'var(--dsw-alias-label-tertiary, #71717a)',
  },
};

export const PublishWizardModal: React.FC<PublishWizardModalProps> = memo(({
  isOpen,
  onClose,
  nodes,
  edges,
  catalog,
  workspaceId,
  workflowName,
  groupId,
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

  // Step 2: Input & config exposure
  const [inputs, setInputs] = useState<ExposedWorkflowInput[]>([]);

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

  // Toggle whether this candidate is shown to consumers
  const handleToggleExpose = (key: string) => {
    setInputs((prev) =>
      prev.map((inp) => {
        if (inp.key !== key || inp.isInternal) return inp;
        const nextExposed = !inp.isExposed;
        return {
          ...inp,
          isExposed: nextExposed,
          // Reopening a user-provided input restores its recommended required flag;
          // closing it clears required so a fixed field is never reported as mandatory.
          isRequired: nextExposed ? inp.recommendedRequired : false,
        };
      }),
    );
  };

  // Restore the recommended exposure set
  const handleResetRecommended = () => {
    setInputs((prev) =>
      prev.map((inp) => ({
        ...inp,
        isExposed: inp.isInternal ? false : inp.isRecommended,
        isRequired: inp.recommendedRequired,
      })),
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

  // Exposure counters drive the step 2 summary line
  const exposedCount = inputs.filter((inp) => inp.isExposed && !inp.isInternal).length;
  const requiredCount = inputs.filter((inp) => inp.isExposed && inp.isRequired && !inp.isInternal).length;
  const fixedCount = inputs.filter((inp) => !inp.isExposed && !inp.isInternal).length;

  // Handle final publish execution
  const handlePublish = async () => {
    if (!appName.trim()) {
      toast.warning('请输入应用名称');
      setCurrentStep(1);
      return;
    }

    const exposedInputs = inputs.filter((inp) => inp.isExposed && !inp.isInternal);
    if (exposedInputs.length === 0) {
      toast.warning('请至少暴露一个输入项供消费端填写');
      setCurrentStep(2);
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Generate standard restricted JSON schema, field mappings, and the fixed-field summary.
      // Pass every candidate: the generator decides what becomes a form field and what is summarised
      // as author-fixed, so filtering here would silently drop the fixed summary.
      const generatedConfig = generateFormConfig(inputs);

      // 2. Derive stable appId (alphanumeric, underscore, dash)
      const cleanSlug = appName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'app';
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      const appId = `app_${cleanSlug}_${randomSuffix}`;

      // 2b. 反查画布所属项目：供「项目」页「AI应用」卡片的「编辑」直接定位。
      //     失败不阻断发布——卡片侧还能按 workspaceId 反查项目。
      const projectId = await resolveProjectIdForWorkspace(String(workspaceId || ''));

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
          ...(projectId ? { projectId } : {}),
          ...(groupId ? { sourceGroupId: groupId } : {}),
        },
        formSchema: generatedConfig.formSchema,
        fieldMappings: generatedConfig.fieldMappings,
        fixedFields: generatedConfig.fixedFields,
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

  // One publishing candidate row: name, badges, source, rationale, exposure switch, required flag
  const renderCandidateRow = (inp: ExposedWorkflowInput) => {
    const isExposed = inp.isExposed && !inp.isInternal;
    const badge = (text: string, tone: 'recommend' | 'required' | 'fixed' | 'internal') => (
      <span
        key={text}
        style={{
          ...BADGE_STYLES[tone],
          fontSize: '10px',
          lineHeight: '16px',
          padding: '1px 6px',
          borderRadius: '4px',
        }}
      >
        {text}
      </span>
    );

    return (
      <div
        key={inp.key}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 12px',
          borderRadius: '8px',
          background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.04))',
          border: isExposed
            ? '1px solid var(--dsw-alias-border-l3, rgba(255,255,255,0.22))'
            : '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))',
          opacity: inp.isInternal ? 0.6 : 1,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={inp.fieldTitle}
              onChange={(e) => handleFieldTitleChange(inp.key, e.target.value)}
              disabled={inp.isInternal}
              style={{
                height: '26px',
                padding: '0 8px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid transparent',
                background: 'transparent',
                color: 'var(--dsw-alias-label-primary, #fff)',
                outline: 'none',
                width: '150px',
              }}
            />
            {inp.isRecommended && badge('推荐', 'recommend')}
            {isExposed && inp.isRequired && badge('必填', 'required')}
            {!inp.isExposed && !inp.isInternal && badge(`固定：${inp.fixedDisplay || '未设置'}`, 'fixed')}
            {inp.isInternal && badge('内部字段', 'internal')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #71717a)' }}>
            来源：{inp.nodeLabel} · 控件：{inp.widget}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #71717a)' }}>{inp.rationale}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              color: 'var(--dsw-alias-label-secondary, #a1a1aa)',
              cursor: inp.isInternal ? 'not-allowed' : 'pointer',
            }}
          >
            <span>展示给用户</span>
            <button
              type="button"
              role="switch"
              aria-checked={isExposed}
              aria-label={`展示给用户：${inp.fieldTitle}`}
              disabled={inp.isInternal}
              onClick={() => handleToggleExpose(inp.key)}
              style={{
                width: '34px',
                height: '18px',
                borderRadius: '999px',
                border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12))',
                background: isExposed
                  ? 'var(--dsw-alias-state-business-primary, #4c8dff)'
                  : 'var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.08))',
                position: 'relative',
                padding: 0,
                cursor: inp.isInternal ? 'not-allowed' : 'pointer',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: '2px',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: 'var(--dsw-alias-label-primary, #ffffff)',
                  transform: isExposed ? 'translateX(16px)' : 'translateX(0)',
                  transition: 'transform 140ms ease',
                }}
              />
            </button>
          </label>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: isExposed
                ? 'var(--dsw-alias-label-secondary, #a1a1aa)'
                : 'var(--dsw-alias-label-dimmed, rgba(255,255,255,0.28))',
              cursor: isExposed ? 'pointer' : 'not-allowed',
            }}
          >
            <input
              type="checkbox"
              checked={inp.isRequired}
              onChange={() => handleToggleRequired(inp.key)}
              disabled={!isExposed}
              style={{ cursor: isExposed ? 'pointer' : 'not-allowed' }}
            />
            必填
          </label>
        </div>
      </div>
    );
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
            { step: 2, label: '2. 输入项与配置项' },
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

        {/* STEP 2: 输入项与配置项 */}
        {currentStep === 2 && (
          <div
            className="nodrag nopan"
            onWheel={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              maxHeight: '440px',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              scrollbarGutter: 'stable',
            }}
          >
            <div
              data-qa="summary"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: exposedCount === 0
                  ? 'var(--dsw-alias-state-warn-primary, rgba(245,158,11,0.12))'
                  : 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.04))',
                border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))',
                fontSize: '12px',
                lineHeight: '18px',
              }}
            >
              <span
                style={{
                  color: exposedCount === 0
                    ? 'var(--dsw-alias-label-warning, #fbbf24)'
                    : 'var(--dsw-alias-label-secondary, #a1a1aa)',
                  marginTop: '1px',
                }}
              >
                {exposedCount === 0 ? <AlertCircle size={14} /> : <Layers size={14} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--dsw-alias-label-secondary, #a1a1aa)' }}>
                {exposedCount === 0
                  ? '当前没有任何一项展示给用户：用户打开应用会看到空表单，无法出片，建议至少保留素材或描述。'
                  : `用户将填写 ${exposedCount} 项${requiredCount > 0 ? `，其中 ${requiredCount} 项必填` : ''}；另有 ${fixedCount} 项按你的设定执行。`}
              </span>
              <button
                type="button"
                onClick={handleResetRecommended}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '24px',
                  padding: '0 8px',
                  borderRadius: '6px',
                  background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06))',
                  border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12))',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                  fontSize: '12px',
                  flexShrink: 0,
                }}
              >
                <RotateCcw size={12} />
                恢复推荐设置
              </button>
            </div>

            {INPUT_GROUP_META.map((group) => {
              const rows = inputs.filter((inp) => inp.group === group.id);
              if (rows.length === 0) return null;
              return (
                <div key={group.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--dsw-alias-label-secondary, #a1a1aa)' }}>{group.icon}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-primary, #fff)' }}>
                      {group.label}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #71717a)' }}>
                      {group.hint}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {rows.map((inp) => renderCandidateRow(inp))}
                  </div>
                </div>
              );
            })}

            {inputs.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, #71717a)', padding: '12px 0' }}>
                当前工作流没有可配置的输入项或生成参数。
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
