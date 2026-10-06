import React, { useEffect, useState, useRef, useCallback } from "react";
import { ToolcraftText as Text } from "@openreel/ui";

import { Toolbar } from "./Toolbar";
import { EditorActionRail } from "./EditorActionRail";
import { AssetsPanel } from "./AssetsPanel";
import { Preview } from "./Preview";
import { InspectorPanel } from "./InspectorPanel";
import { Timeline } from "./Timeline";
import { KeyframeEditorPanel } from "./KeyframeEditorPanel";
import { AudioMixer } from "../audio-mixer";
import { AIPanel } from "./ai-panel/AIPanel";
import { KeyboardShortcutsOverlay } from "./KeyboardShortcutsOverlay";
import { PanelErrorBoundary } from "../ErrorBoundary";
import { SpotlightTour, MoGraphTour } from "./tour";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { useEngineStore } from "../../stores/engine-store";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import {
  initializePlaybackBridge,
  disposePlaybackBridge,
} from "../../bridges/playback-bridge";
import {
  initializeMediaBridge,
  disposeMediaBridge,
} from "../../bridges/media-bridge";
import {
  initializeRenderBridge,
  disposeRenderBridge,
} from "../../bridges/render-bridge";
import {
  initializeEffectsBridge,
  disposeEffectsBridge,
} from "../../bridges/effects-bridge";
import {
  initializeTransitionBridge,
  disposeTransitionBridge,
} from "../../bridges/transition-bridge";

const ChatPanel = React.lazy(() =>
  import("./chat/ChatPanel").then((module) => ({ default: module.ChatPanel })),
);

// Timeline area (bottom band) is sized as a container percentage ratio so the
// top workspace (media | stage | inspector) gets the rest. The grid
// uses `1fr var(--tl-height)` rows — by default timeline is 40%
// which leaves the top workspace with ~60% of available height.
const DEFAULT_TIMELINE_RATIO = 40;
const MIN_TIMELINE_RATIO = 20;
const MAX_TIMELINE_RATIO = 70;
// Compact mode: timeline takes most of the height, leaving a small preview.
const COMPACT_TIMELINE_RATIO = 80;

const DEFAULT_MEDIA_W = 460;
const MIN_MEDIA_W = 320;
const MAX_MEDIA_W = 640;

const DEFAULT_INSPECTOR_W = 360;
const MIN_INSPECTOR_W = 280;
const MAX_INSPECTOR_W = 560;

const DEFAULT_CHAT_W = 380;
const MIN_CHAT_W = 320;
const MAX_CHAT_W = 560;

const MIN_STAGE_W = 380;
const RESIZE_HANDLE = 10;

// Host panel column (left): the generation surface is provided by the video
// plugin and mounted into the host container this column renders. Official
// panels keep their implementations and only change column order.
const DEFAULT_GENERATE_W = 360;
const MIN_GENERATE_W = 280;
const MAX_GENERATE_W = 560;

type ResizeTarget = "timeline" | "media" | "inspector" | "chat" | "generate";

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const TIMELINE_RATIO_STORAGE_KEY = "openreel_timeline_ratio";

/**
 * Auto-save initialization hook
 */
const useAutoSave = () => {
  const { initializeAutoSave } = useProjectStore();

  useEffect(() => {
    initializeAutoSave().catch(console.error);
  }, [initializeAutoSave]);
};

/**
 * Engine and bridge initialization hook
 * Ensures all engines and bridges are fully initialized before rendering editor
 */
const useEngineInitialization = () => {
  const { initialize, initialized, initializing, initError } = useEngineStore();
  const [bridgesReady, setBridgesReady] = useState(false);
  const [initStatus, setInitStatus] = useState("Starting...");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initAll = async () => {
      try {
        const currentState = useEngineStore.getState();
        if (!currentState.initialized && !currentState.initializing) {
          setInitStatus("Initializing video engine...");
          await initialize();
        } else if (currentState.initializing) {
          await new Promise<void>((resolve) => {
            const unsubscribe = useEngineStore.subscribe((state) => {
              if (state.initialized || state.initError) {
                unsubscribe();
                resolve();
              }
            });
          });
        }

        if (!isMounted) return;

        const engineState = useEngineStore.getState();
        if (!engineState.initialized) {
          throw new Error(
            engineState.initError || "Engine initialization failed",
          );
        }

        setInitStatus("Initializing media bridge...");
        await initializeMediaBridge();
        if (!isMounted) return;

        setInitStatus("Initializing playback bridge...");
        await initializePlaybackBridge();
        if (!isMounted) return;

        setInitStatus("Initializing render bridge...");
        await initializeRenderBridge();
        if (!isMounted) return;

        setInitStatus("Initializing effects bridge...");
        const projectState = useProjectStore.getState();
        const { width, height } = projectState.project.settings;
        try {
          await initializeEffectsBridge(width, height);
        } catch (effectsError) {
          console.error(
            "[EditorInterface] EffectsBridge initialization failed:",
            effectsError,
          );
        }
        if (!isMounted) return;

        setInitStatus("Initializing transition bridge...");
        try {
          initializeTransitionBridge(width, height);
        } catch (transitionError) {
          console.error(
            "[EditorInterface] TransitionBridge initialization failed:",
            transitionError,
          );
        }
        if (!isMounted) return;

        setBridgesReady(true);
      } catch (error) {
        console.error("Failed to initialize engines/bridges:", error);
        if (isMounted) {
          setLocalError(
            error instanceof Error ? error.message : "Unknown error",
          );
          setInitStatus(
            `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }
    };

    initAll();

    return () => {
      isMounted = false;
      disposePlaybackBridge();
      disposeMediaBridge();
      disposeRenderBridge();
      disposeEffectsBridge();
      disposeTransitionBridge();
    };
  }, [initialize, initialized, initializing]);

  return {
    initialized: initialized && bridgesReady,
    initializing: initializing || (!bridgesReady && initialized),
    initError: initError || localError,
    initStatus,
  };
};

/**
 * Main Editor Interface — v2 cinematic layout.
 *
 * Grid (per mockup):
 *
 *   ┌─────────────── topbar ───────────────┐
 *   │                                      │
 *   │  media │   stage   │   inspector     │  ← top row (auto-fit)
 *   │   460  │   1fr     │      360        │
 *   ├──────────────────────────────────────┤
 *   │             timeline                 │  ← `tl-height` (vh)
 *   └──────────────────────────────────────┘
 *
 * Column widths and timeline height are user-resizable via the
 * dividers between panels. Values are persisted to CSS custom
 * properties on the root grid so panels can pick them up.
 */
export const EditorInterface: React.FC = () => {
  const { initialized, initializing, initError, initStatus } =
    useEngineInitialization();

  const { showShortcutsOverlay, setShowShortcutsOverlay } =
    useKeyboardShortcuts();
  useAutoSave();

  const {
    keyframeEditorOpen,
    setKeyframeEditorOpen,
    getSelectedClipIds,
    panels,
    setPanelVisible,
    timelineMaximized,
  } = useUIStore();
  const { project, updateClipKeyframes } = useProjectStore();
  const tracks = project.timeline.tracks;

  const [selectedKeyframeIds, setSelectedKeyframeIds] = React.useState<string[]>([]);
  const [copiedKeyframes, setCopiedKeyframes] = React.useState<
    import("@openreel/core").Keyframe[]
  >([]);

  const selectedClip = React.useMemo(() => {
    const selectedIds = getSelectedClipIds();
    if (selectedIds.length === 0) return null;
    const clipId = selectedIds[0];
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return clip;
    }
    return null;
  }, [getSelectedClipIds, tracks]);

  const handleUpdateKeyframe = React.useCallback(
    (
      keyframeId: string,
      updates: Partial<import("@openreel/core").Keyframe>,
    ) => {
      if (!selectedClip?.keyframes) return;
      const keyframes = selectedClip.keyframes.map((kf) =>
        kf.id === keyframeId ? { ...kf, ...updates } : kf,
      );
      updateClipKeyframes(selectedClip.id, keyframes);
    },
    [selectedClip, updateClipKeyframes],
  );

  const handleDeleteKeyframe = React.useCallback(
    (keyframeId: string) => {
      if (!selectedClip?.keyframes) return;
      const keyframes = selectedClip.keyframes.filter(
        (kf) => kf.id !== keyframeId,
      );
      updateClipKeyframes(selectedClip.id, keyframes);
      setSelectedKeyframeIds((prev) => prev.filter((id) => id !== keyframeId));
    },
    [selectedClip, updateClipKeyframes],
  );

  const handleCopyKeyframes = React.useCallback(
    (keyframeIds: string[]) => {
      if (!selectedClip?.keyframes) return;
      const toCopy = selectedClip.keyframes.filter((kf) =>
        keyframeIds.includes(kf.id),
      );
      setCopiedKeyframes(toCopy);
    },
    [selectedClip],
  );

  const handlePasteKeyframes = React.useCallback(
    (clipId: string, time: number) => {
      const targetClip = tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === clipId);
      if (!targetClip) return;
      const newKeyframes = copiedKeyframes.map((kf) => ({
        ...kf,
        id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        time: kf.time + time,
      }));
      updateClipKeyframes(clipId, [
        ...(targetClip.keyframes || []),
        ...newKeyframes,
      ]);
    },
    [copiedKeyframes, tracks, updateClipKeyframes],
  );

  const handleSelectKeyframe = React.useCallback(
    (keyframeId: string, addToSelection: boolean) => {
      if (addToSelection) {
        setSelectedKeyframeIds((prev) =>
          prev.includes(keyframeId)
            ? prev.filter((id) => id !== keyframeId)
            : [...prev, keyframeId],
        );
      } else {
        setSelectedKeyframeIds([keyframeId]);
      }
    },
    [],
  );

  // ── Layout state (resizable columns and timeline band) ──────────
  const rootRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<ResizeTarget | null>(null);
  const [mediaWidth, setMediaWidth] = useState(DEFAULT_MEDIA_W);
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR_W);
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_W);
  const [generateWidth, setGenerateWidth] = useState(DEFAULT_GENERATE_W);
  const [timelineRatio, setTimelineRatio] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_TIMELINE_RATIO;
    const stored = window.localStorage.getItem(TIMELINE_RATIO_STORAGE_KEY);
    const parsed = stored ? Number.parseFloat(stored) : NaN;
    return Number.isFinite(parsed) && parsed >= MIN_TIMELINE_RATIO && parsed <= MAX_TIMELINE_RATIO
      ? parsed
      : DEFAULT_TIMELINE_RATIO;
  });

  const chatVisible = panels.agentChat?.visible ?? false;

  const mediaRef = useRef(mediaWidth);
  const inspectorRef = useRef(inspectorWidth);
  const chatRef = useRef(chatWidth);
  const generateRef = useRef(generateWidth);
  useEffect(() => {
    mediaRef.current = mediaWidth;
  }, [mediaWidth]);
  useEffect(() => {
    inspectorRef.current = inspectorWidth;
  }, [inspectorWidth]);
  useEffect(() => {
    chatRef.current = chatWidth;
  }, [chatWidth]);
  useEffect(() => {
    generateRef.current = generateWidth;
  }, [generateWidth]);

  const beginResize = useCallback(
    (target: ResizeTarget) => (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = target;
      document.body.style.cursor =
        target === "timeline" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
    },
    [],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const root = rootRef.current;
      const target = resizeRef.current;
      if (!root || !target) return;
      const rect = root.getBoundingClientRect();
      const chatOpen =
        useUIStore.getState().panels.agentChat?.visible ?? false;
      const chatOffset = chatOpen ? chatRef.current + RESIZE_HANDLE : 0;

      if (target === "generate") {
        const maxByStage =
          rect.width -
          mediaRef.current -
          chatOffset -
          2 * RESIZE_HANDLE -
          MIN_STAGE_W;
        setGenerateWidth(
          clamp(
            e.clientX - rect.left,
            MIN_GENERATE_W,
            Math.min(MAX_GENERATE_W, maxByStage),
          ),
        );
        return;
      }
      if (target === "media") {
        // The library/attributes column now sits on the right edge, so its
        // width is measured from the right border rather than the left.
        const maxByStage =
          rect.width -
          generateRef.current -
          chatOffset -
          2 * RESIZE_HANDLE -
          MIN_STAGE_W;
        setMediaWidth(
          clamp(
            rect.right - e.clientX,
            MIN_MEDIA_W,
            Math.min(MAX_MEDIA_W, maxByStage),
          ),
        );
        return;
      }
      if (target === "chat") {
        const maxByStage =
          rect.width -
          mediaRef.current -
          2 * RESIZE_HANDLE -
          MIN_STAGE_W;
        setChatWidth(
          clamp(
            rect.right - e.clientX,
            MIN_CHAT_W,
            Math.min(MAX_CHAT_W, maxByStage),
          ),
        );
        return;
      }
      // timeline: percentage based on the available container height (minus Toolbar)
      const availableHeight = Math.max(100, rect.height - 40);
      const ratio = ((rect.bottom - e.clientY) / availableHeight) * 100;
      const nextRatio = clamp(ratio, MIN_TIMELINE_RATIO, MAX_TIMELINE_RATIO);
      setTimelineRatio(nextRatio);
      try {
        window.localStorage.setItem(TIMELINE_RATIO_STORAGE_KEY, String(Math.round(nextRatio)));
      } catch {}
    };

    const onUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Reflect resized panel sizes back into CSS variables so child styles
  // (timeline header padding, etc.) can react.
  useEffect(() => {
    const r = rootRef.current;
    if (!r) return;
    const tlRatio = timelineMaximized ? COMPACT_TIMELINE_RATIO : timelineRatio;
    r.style.setProperty("--generate-w", `${generateWidth}px`);
    r.style.setProperty("--media-w", `${mediaWidth}px`);
    r.style.setProperty("--inspector-w", `${inspectorWidth}px`);
    r.style.setProperty("--chat-w", `${chatWidth}px`);
    r.style.setProperty("--tl-height", `${tlRatio}%`);
  }, [generateWidth, mediaWidth, inspectorWidth, chatWidth, timelineRatio, timelineMaximized]);

  if (initializing || !initialized) {
    return (
      <div className="w-full h-full bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <Text type="supporting" color="primary" className="text-fg-2 text-sm">Initializing editor…</Text>
          <Text type="supporting" color="secondary" className="text-fg-muted text-xs mt-2">{initStatus}</Text>
          {initError && (
            <Text type="supporting" className="text-status-error text-xs mt-2">{initError}</Text>
          )}
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────
  // Grid template uses inline CSS for the resizable columns. The CSS
  // variables `--media-w`, `--inspector-w`, `--tl-height` are kept in
  // sync via the effect above so other components can use them too.
  const effectiveTimelineRatio = timelineMaximized
    ? COMPACT_TIMELINE_RATIO
    : timelineRatio;
  // 生成列与素材列是可拖拽的偏好宽度，不是硬下限：窄窗口里必须让位给官方舞台，
  // 否则中间播放器会被两侧挤成几像素宽的破版。三区各留一条可用下限，谁都不许塌陷。
  const STAGE_MIN_W = 280;
  const SIDE_MIN_W = 240;
  const gridStyle: React.CSSProperties = chatVisible
    ? {
        gridTemplateColumns: `minmax(${SIDE_MIN_W}px, ${generateWidth}px) ${RESIZE_HANDLE}px minmax(${STAGE_MIN_W}px, 1fr) ${RESIZE_HANDLE}px ${chatWidth}px ${RESIZE_HANDLE}px minmax(${SIDE_MIN_W}px, ${mediaWidth}px)`,
        gridTemplateRows: `1fr ${RESIZE_HANDLE}px ${effectiveTimelineRatio}%`,
        gridTemplateAreas:
          "'gen gh stage ch chat mh media' 'th th th th th th th' 'timeline timeline timeline timeline timeline timeline timeline'",
      }
    : {
        gridTemplateColumns: `minmax(${SIDE_MIN_W}px, ${generateWidth}px) ${RESIZE_HANDLE}px minmax(${STAGE_MIN_W}px, 1fr) ${RESIZE_HANDLE}px minmax(${SIDE_MIN_W}px, ${mediaWidth}px)`,
        gridTemplateRows: `1fr ${RESIZE_HANDLE}px ${effectiveTimelineRatio}%`,
        gridTemplateAreas:
          "'gen gh stage mh media' 'th th th th th' 'timeline timeline timeline timeline timeline'",
      };

  return (
    <div
      ref={rootRef}
      className="w-full h-full bg-bg text-fg overflow-hidden font-sans select-none relative z-20 flex flex-col"
    >
      <Toolbar />

      <div className="flex-1 min-h-0 flex">
        <div
          className="flex-1 min-w-0 min-h-0 grid gap-0 bg-bg p-2.5 overflow-x-auto overflow-y-hidden"
          style={gridStyle}
        >
        <div
          className="bg-bg-1 min-w-0 min-h-0 overflow-hidden rounded-xl border border-border shadow-sm"
          style={{ gridArea: "gen" }}
        >
          <PanelErrorBoundary name="Generate">
            {/* Host container: the generation surface is provided by the video
                plugin and mounts itself here. Nothing is rendered by the
                editor itself, so the two plugins stay decoupled. */}
            <div
              className="h-full w-full min-w-0 min-h-0"
              data-omnimux-host="clip.editor.generate"
            />
          </PanelErrorBoundary>
        </div>

        <div
          className="grid place-items-center cursor-col-resize group/h"
          style={{ gridArea: "gh" }}
          onMouseDown={beginResize("generate")}
        >
          <span className="h-10 w-1 rounded-full bg-transparent group-hover/h:bg-accent/40 transition-colors" />
        </div>

        <div
          className="bg-bg-1 min-w-0 min-h-0 overflow-hidden rounded-xl border border-border shadow-sm"
          style={{ gridArea: "media" }}
        >
          <PanelErrorBoundary name="Media">
            <AssetsPanel />
          </PanelErrorBoundary>
        </div>

        <div
          className="grid place-items-center cursor-col-resize group/h"
          style={{ gridArea: "mh" }}
          onMouseDown={beginResize("media")}
        >
          <span className="h-10 w-1 rounded-full bg-transparent group-hover/h:bg-accent/40 transition-colors" />
        </div>

        <div
          className="bg-stage-bg min-w-0 min-h-0 overflow-hidden rounded-xl border border-border shadow-sm"
          style={{ gridArea: "stage" }}
        >
          <PanelErrorBoundary name="Stage">
            <Preview />
          </PanelErrorBoundary>
        </div>

        {chatVisible && (
          <>
            <div
              className="grid place-items-center cursor-col-resize group/h"
              style={{ gridArea: "ch" }}
              onMouseDown={beginResize("chat")}
            >
              <span className="h-10 w-1 rounded-full bg-transparent group-hover/h:bg-accent/40 transition-colors" />
            </div>

            <div
              className="bg-bg-1 min-w-0 min-h-0 overflow-hidden rounded-xl border border-border shadow-sm"
              style={{ gridArea: "chat" }}
            >
              <PanelErrorBoundary name="AI Editor">
                <React.Suspense
                  fallback={
                    <div className="grid h-full place-items-center text-xs text-fg-muted">
                      Loading AI Editor…
                    </div>
                  }
                >
                  <ChatPanel
                    onClose={() => setPanelVisible("agentChat", false)}
                  />
                </React.Suspense>
              </PanelErrorBoundary>
            </div>
          </>
        )}

        <div
          className="grid place-items-center cursor-row-resize group/h"
          style={{ gridArea: "th" }}
          onMouseDown={beginResize("timeline")}
        >
          <span className="w-10 h-1 rounded-full bg-transparent group-hover/h:bg-accent/40 transition-colors" />
        </div>

        <div
          className="bg-tl-bg min-w-0 min-h-0 overflow-hidden flex flex-col rounded-xl border border-border shadow-sm"
          style={{ gridArea: "timeline" }}
        >
          {panels.audioMixer?.visible && (
            <div className="shrink-0 border-b border-border">
              <PanelErrorBoundary name="Audio Mixer">
                <AudioMixer
                  visible
                  onClose={() => setPanelVisible("audioMixer", false)}
                />
              </PanelErrorBoundary>
            </div>
          )}

          {panels.ai?.visible && (
            <div className="shrink-0 border-b border-border">
              <PanelErrorBoundary name="AI">
                <AIPanel />
              </PanelErrorBoundary>
            </div>
          )}

          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 min-h-0">
              <PanelErrorBoundary name="Timeline">
                <Timeline />
              </PanelErrorBoundary>
            </div>

            {keyframeEditorOpen && (
              <div className="shrink-0 min-w-0 border-l border-border">
                <PanelErrorBoundary name="Keyframe Editor">
                  <KeyframeEditorPanel
                    clip={selectedClip}
                    onClose={() => setKeyframeEditorOpen(false)}
                    onUpdateKeyframe={handleUpdateKeyframe}
                    onDeleteKeyframe={handleDeleteKeyframe}
                    onCopyKeyframes={handleCopyKeyframes}
                    onPasteKeyframes={handlePasteKeyframes}
                    selectedKeyframeIds={selectedKeyframeIds}
                    onSelectKeyframe={handleSelectKeyframe}
                    copiedKeyframes={copiedKeyframes}
                  />
                </PanelErrorBoundary>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      <KeyboardShortcutsOverlay
        isOpen={showShortcutsOverlay}
        onClose={() => setShowShortcutsOverlay(false)}
      />

      <SpotlightTour />
      <MoGraphTour />
    </div>
  );
};

export default EditorInterface;
