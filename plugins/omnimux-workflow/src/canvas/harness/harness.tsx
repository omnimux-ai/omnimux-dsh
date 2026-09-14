/**
 * Dev harness (W1 T1.3) — 视觉验收唯一事实源。
 *
 * 独立 esbuild entry（不进生产 bundle）：挂画布 + mock catalog + mock
 * execution 注入 + locale/暗色开关。用法见 scripts/canvas-harness.mjs。
 */

import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Edge, Node } from '@xyflow/react';
import CanvasEditor from '../editor/CanvasEditor';
import { injectCanvasStyles } from '../injectStyles';
import { useCanvasStore } from '../store/canvasStore';
import { useExecutionStore } from '../store/executionStore';
import { setLocale, getLocale, type Locale } from '../i18n';
import { createDefaultMaterialNodeData, type MaterialType } from '../types/materialNode';
import { getDefaultNodeWidth } from '../editor/utils/nodeSizeConfig';
import type { CapabilityCatalog } from '../../shared/api';

// ---------------------------------------------------------------------------
// mock 数据
// ---------------------------------------------------------------------------

const MOCK_CATALOG: CapabilityCatalog = {
  source: 'static-stub',
  fingerprint: 'harness-mock',
  defaults: {
    text: 'gemini-3.7-flash',
    image: 'mock-img-fast',
    video: 'mock-video-720p',
    audio: 'mock-tts-standard',
  },
  // A–Z by label (Issue #314); no Claude-first override.
  text: [
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
    { id: 'gpt-5.5', label: 'GPT 5.5' },
  ],
  image: [
    { id: 'mock-img-fast', label: 'Mock Image Fast' },
    { id: 'mock-img-hd', label: 'Mock Image HD' },
  ],
  video: [{ id: 'mock-video-720p', label: 'Mock Video 720p' }],
  audio: [{ id: 'mock-tts-standard', label: 'Mock TTS Standard' }],
};

const MOCK_MEDIA: Record<Exclude<MaterialType, 'text'>, string> = {
  image: 'https://picsum.photos/seed/omnimux-w1/640/360',
  video: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  audio: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
};

function buildMockGraph(): { nodes: Node[]; edges: Edge[] } {
  const specs: Array<{ id: string; type: MaterialType; x: number; y: number; label: string }> = [
    { id: 'n-text', type: 'text', x: 80, y: 60, label: '文案脚本' },
    { id: 'n-image', type: 'image', x: 480, y: 40, label: '分镜图片' },
    { id: 'n-video', type: 'video', x: 880, y: 80, label: '成片视频' },
    { id: 'n-audio', type: 'audio', x: 880, y: 420, label: '配乐音频' },
  ];
  const nodes = specs.map((spec) => ({
    id: spec.id,
    type: 'material',
    position: { x: spec.x, y: spec.y },
    data: {
      ...createDefaultMaterialNodeData(spec.type, {
        label: spec.label,
        nodeWidth: getDefaultNodeWidth(spec.type),
        selectedTool:
          spec.type === 'text'
            ? 'text-to-text'
            : spec.type === 'image'
              ? 'text-to-image'
              : spec.type === 'video'
                ? 'video-generation'
                : 'text-to-music',
      }),
      // 预置一个已完成的图片节点，便于直接验收 MediaPreview。
      ...(spec.type === 'image'
        ? {
            executionStatus: 'completed',
            mediaUrl: MOCK_MEDIA.image,
            mediaAssets: [{ type: 'image', url: MOCK_MEDIA.image }],
            taskId: 'mock-seed-img-001',
          }
        : {}),
    } as Record<string, unknown>,
  }));
  const edges: Edge[] = [
    { id: 'e-text-image', source: 'n-text', target: 'n-image', type: 'animated' },
    { id: 'e-image-video', source: 'n-image', target: 'n-video', type: 'animated' },
  ];
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// mock execution 注入（走 executionStore.startNodeExecution 桥，同生产接缝）
// ---------------------------------------------------------------------------

function patchNodeData(nodeId: string, patch: Record<string, unknown>): void {
  useCanvasStore.getState().setNodes((nodes) =>
    nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
  );
}

function simulateNodeRun(nodeId: string, outcome: 'completed' | 'error' = 'completed'): void {
  const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const materialType = (node.data as { materialType?: MaterialType }).materialType ?? 'image';

  useExecutionStore.getState().setNodeStatus(nodeId, 'running');
  patchNodeData(nodeId, { executionStatus: 'running', executionError: undefined });

  window.setTimeout(() => {
    if (outcome === 'completed') {
      useExecutionStore.getState().setNodeStatus(nodeId, 'completed');
      if (materialType === 'text') {
        patchNodeData(nodeId, {
          executionStatus: 'completed',
          generatedContent: '（mock）海鸥掠过黄昏的海面，镜头缓慢推近……',
        });
      } else {
        const url = MOCK_MEDIA[materialType];
        patchNodeData(nodeId, {
          executionStatus: 'completed',
          mediaAssets: [{ type: materialType, url }],
          ...(materialType === 'image' ? { mediaUrl: url } : {}),
          taskId: 'mock-task-9f8e7d6c5b4a',
        });
      }
    } else {
      useExecutionStore.getState().setNodeStatus(nodeId, 'error');
      patchNodeData(nodeId, {
        executionStatus: 'error',
        executionError: 'mock 执行失败：[image-routing] all channels failed (provider timeout)',
      });
    }
  }, 8000); // 给 OrganicShimmer 视觉验收留足生成态窗口
}

// ---------------------------------------------------------------------------
// harness 控制条
// ---------------------------------------------------------------------------

const BAR_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  fontSize: 12,
  background: 'var(--wb-surface)',
  borderBottom: '1px solid var(--wb-border)',
  color: 'var(--wb-text-secondary)',
  flexShrink: 0,
  flexWrap: 'wrap',
};

const BTN_STYLE: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--wb-border-strong)',
  background: 'transparent',
  color: 'var(--wb-text-secondary)',
  cursor: 'pointer',
};

const Harness: React.FC = () => {
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [dark, setDark] = useState(false);

  // 初始注入画布数据 + mock 执行桥（只挂一次）。
  useEffect(() => {
    injectCanvasStyles();
    const { nodes, edges } = buildMockGraph();
    useCanvasStore.getState().hydrateGraph(nodes, edges);
    useExecutionStore.getState().setStartNodeExecution((nodeId) => simulateNodeRun(nodeId));
    return () => {
      useExecutionStore.getState().setStartNodeExecution(null);
      useCanvasStore.getState().resetStore();
    };
  }, []);

  useEffect(() => {
    if (dark) {
      document.body.setAttribute('data-ds-dark-theme', '');
    } else {
      document.body.removeAttribute('data-ds-dark-theme');
    }
  }, [dark]);

  const toggleLocale = useCallback(() => {
    const next: Locale = getLocale() === 'zh' ? 'en' : 'zh';
    setLocale(next);
    setLocaleState(next);
  }, []);

  const resetGraph = useCallback(() => {
    const { nodes, edges } = buildMockGraph();
    useCanvasStore.getState().hydrateGraph(nodes, edges);
    useExecutionStore.getState().resetExecution();
  }, []);

  const runScenario = useCallback((outcome: 'completed' | 'error') => {
    for (const id of ['n-text', 'n-image', 'n-video', 'n-audio']) {
      simulateNodeRun(id, outcome);
    }
  }, []);

  return (
    <div className="wf-canvas-root">
      <div style={BAR_STYLE}>
        <strong style={{ color: 'var(--wb-text-primary)' }}>W4 harness</strong>
        <button type="button" style={BTN_STYLE} onClick={toggleLocale}>
          locale: {locale}
        </button>
        <button type="button" style={BTN_STYLE} onClick={() => setDark((v) => !v)}>
          {dark ? 'dark: on' : 'dark: off'}
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" style={BTN_STYLE} onClick={() => runScenario('completed')}>
          mock running→completed
        </button>
        <button type="button" style={BTN_STYLE} onClick={() => runScenario('error')}>
          mock error
        </button>
        <button type="button" style={BTN_STYLE} onClick={resetGraph}>
          reset
        </button>
      </div>
      <main className="wf-canvas-main">
        <CanvasEditor catalog={MOCK_CATALOG} />
      </main>
    </div>
  );
};

const container = document.getElementById('root');
if (!container) throw new Error('harness: #root missing');
createRoot(container).render(<Harness />);
