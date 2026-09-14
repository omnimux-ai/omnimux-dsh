import { useEffect, useRef } from "react";
import { useProjectStore } from "../openreel/web/stores/project-store";
import { useUIStore } from "../openreel/web/stores/ui-store";

/**
 * 单次画布会话最多导入的上游素材条数（视频 + 图片 + 音频合计）。
 * 超出部分告警并截断，防止恶意/异常入参打爆媒体库与内存。
 */
const MAX_IMPORT_ITEMS = 20;

const ALLOWED_PROTOCOLS = ["http:", "https:", "asset:", "file:", "blob:", "data:"];

export interface CanvasSession {
  source?: "canvas" | "sidebar" | "agent";
  nodeId?: string;
  nodeTitle?: string;
  projectId?: string;
  draftSchema?: unknown;
  upstreamInputs?: {
    videos?: Array<{ path: string; name: string; durationMs?: number; url?: string }>;
    audios?: Array<{ path: string; name: string; durationMs?: number; url?: string }>;
    images?: Array<{ path: string; name: string; displayDurationMs?: number; url?: string }>;
    captions?: Array<{ text: string; startTimeMs: number; durationMs: number }>;
  };
}

function resolveFetchableUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("/omnimux")) {
    return trimmed;
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return `/omnimux-workflow/api/local-file?path=${encodeURIComponent(trimmed)}`;
  }
  try {
    const parsed = new URL(trimmed, "http://localhost");
    return ALLOWED_PROTOCOLS.includes(parsed.protocol) ? trimmed : "";
  } catch {
    return "";
  }
}

function isValidUrl(rawUrl: string): boolean {
  return Boolean(resolveFetchableUrl(rawUrl));
}

function inferMime(path: string, fallback: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".aac")) return "audio/aac";
  return fallback;
}

/**
 * useCanvasIngestion handles:
 * 1. Automatic project initialization when opened from canvas (bypassing welcome screen).
 * 2. Automatic async ingestion of upstream videos, images, and audio into OpenReel's media library.
 *
 * 防爆保护：
 * - 协议白名单校验，过滤非安全/未知协议；
 * - 入参最多导入 MAX_IMPORT_ITEMS（20）条素材，超额打印 warn 并截断；
 * - 整条初始化链路（含 store 调用）包在 try/catch 中，任何异常都不会抛出页面。
 */
export function useCanvasIngestion(session: CanvasSession | null | undefined) {
  const processedRef = useRef<Set<string>>(new Set());
  const activeNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session || session.source !== "canvas") {
      activeNodeIdRef.current = null;
      return;
    }

    try {
      const { nodeId, nodeTitle, upstreamInputs } = session;

      // Reset processed set when switching nodes
      if (activeNodeIdRef.current !== nodeId) {
        activeNodeIdRef.current = nodeId || null;
        processedRef.current.clear();
      }

      // Bypass welcome screen for canvas sessions
      const uiStore = useUIStore.getState();
      if (!uiStore.skipWelcomeScreen) {
        uiStore.setSkipWelcomeScreen(true);
      }

      // Ensure a project exists
      const projectStore = useProjectStore.getState();
      if (!projectStore.hasOpenProject) {
        projectStore.createNewProject(nodeTitle || "创作画布视频合成");
      }

      if (!upstreamInputs) return;

      const itemsToImport: Array<{ url: string; name: string; fallbackMime: string }> = [];

      if (Array.isArray(upstreamInputs.videos)) {
        for (const v of upstreamInputs.videos) {
          const raw = v.url || v.path;
const url = resolveFetchableUrl(raw);
if (url && !processedRef.current.has(raw)) {
  itemsToImport.push({ url, name: v.name || "video.mp4", fallbackMime: "video/mp4" });
}
        }
      }

      if (Array.isArray(upstreamInputs.images)) {
        for (const img of upstreamInputs.images) {
          const raw = img.url || img.path;
const url = resolveFetchableUrl(raw);
if (url && !processedRef.current.has(raw)) {
  itemsToImport.push({ url, name: img.name || "image.png", fallbackMime: "image/png" });
}
        }
      }

      if (Array.isArray(upstreamInputs.audios)) {
        for (const a of upstreamInputs.audios) {
          const raw = a.url || a.path;
const url = resolveFetchableUrl(raw);
if (url && !processedRef.current.has(raw)) {
  itemsToImport.push({ url, name: a.name || "audio.mp3", fallbackMime: "audio/mpeg" });
}
        }
      }

      // 素材防爆：超额告警并截断，只保留前 MAX_IMPORT_ITEMS 条
      if (itemsToImport.length > MAX_IMPORT_ITEMS) {
        console.warn(
          `[omnimux-clip:ingestion] upstream asset count ${itemsToImport.length} exceeds limit ${MAX_IMPORT_ITEMS}; truncating to first ${MAX_IMPORT_ITEMS}`,
        );
        itemsToImport.length = MAX_IMPORT_ITEMS;
      }

      if (itemsToImport.length === 0) return;

      let isMounted = true;

      const importAll = async () => {
        let firstVideoId: string | null = null;
        let firstVideoMeta: { width?: number; height?: number } | null = null;

        for (const item of itemsToImport) {
          if (!isMounted) break;
          processedRef.current.add(item.url);
          try {
            const res = await fetch(item.url);
            if (!res.ok) continue;
            const blob = await res.blob();
            const mime = inferMime(item.name || item.url, item.fallbackMime);
            const file = new File([blob], item.name, { type: mime });
            await useProjectStore.getState().importMedia(file);

            const currentItems = useProjectStore.getState().project.mediaLibrary.items;
            const latest = currentItems[currentItems.length - 1];
            if (latest && latest.type === "video" && !firstVideoId) {
              firstVideoId = latest.id;
              firstVideoMeta = latest.metadata;
            }
          } catch (err) {
            console.warn("[omnimux-clip:ingestion] failed to import upstream asset:", item.url, err);
          }
        }

        // 若时间轴为空，自动将首个上游素材加入时间轴并适配比例
        if (firstVideoId && isMounted) {
          try {
            const store = useProjectStore.getState();
            const hasClips = store.project.timeline.tracks.some((t) => t.clips.length > 0);
            if (!hasClips) {
              if (firstVideoMeta?.width && firstVideoMeta?.height) {
                await store.updateSettings({
                  width: firstVideoMeta.width,
                  height: firstVideoMeta.height,
                });
              }
              await store.addClipToNewTrack(firstVideoId, 0);
            }
          } catch (e) {
            console.warn("[omnimux-clip:ingestion] auto-add first video to timeline failed:", e);
          }
        }
      };

      void importAll();

      return () => {
        isMounted = false;
      };
    } catch (err) {
      console.warn("[omnimux-clip:ingestion] canvas session initialization failed:", err);
    }
  }, [session]);
}
