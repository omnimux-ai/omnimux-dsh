import { useCallback, useState } from "react";
import {
  getExportEngine,
  type VideoExportSettings,
  type ExportResult,
  type Project,
} from "@openreel/core";
import { getActiveClipSession } from "../../../stage-store.js";
import { notifyCanvasProgress, notifyCanvasSave } from "../../../CanvasBridge.js";
import { getVideoEngine } from "../../core/video/video-engine";
import {
  createSilentCanvasWritable,
  isCanvasClipExportSession,
} from "../../../export-canvas-mode.js";
import { createWritableCapture, type WritableLike } from "./export-write-buffer";

export interface ExportRunnerState {
  isExporting: boolean;
  progress: number;
  phase: string;
  error: string | null;
  complete: boolean;
}

export type ExportContainer = "mp4" | "webm" | "mov" | "wav";

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  wav: "audio/wav",
};

export function mimeForExt(ext: string): string {
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function extForFormat(format: string, codec?: string): ExportContainer {
  if (codec === "prores") return "mov";
  if (format === "mov") return "mov";
  if (format === "webm") return "webm";
  if (format === "wav") return "wav";
  return "mp4";
}

const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/g;

export function sanitizeFilenameBase(name: string): string {
  const withoutControls = Array.from(name, (ch) =>
    ch.charCodeAt(0) < 0x20 ? " " : ch,
  ).join("");
  return withoutControls
    .replace(ILLEGAL_FILENAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 200)
    .trim();
}

export function exportFilename(projectName: string | undefined, ext: string): string {
  const cleaned = projectName ? sanitizeFilenameBase(projectName) : "";
  const base = cleaned.length > 0 ? cleaned : "export";
  return `${base}.${ext}`;
}

export async function writeBlobToWritable(
  blob: Blob,
  writable: FileSystemWritableFileStream,
): Promise<void> {
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) await writable.write(value);
    }
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      void 0;
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function progressPhaseLabel(phase: string): string {
  return phase === "complete" ? "Complete!" : `${phase}...`;
}

function triggerAnchorDownload(data: Blob, filename: string, onRelease?: () => void): void {
  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => {
    URL.revokeObjectURL(url);
    onRelease?.();
  }, 1000);
}

const OPFS_TMP_PREFIX = ".openreel-export-";
const OPFS_TMP_TTL_MS = 60 * 60 * 1000;

type OpfsWriteHandle = FileSystemFileHandle & {
  createWritable?: (opts?: { keepExistingData?: boolean }) => Promise<FileSystemWritableFileStream>;
};

type OpfsDirHandle = FileSystemDirectoryHandle & {
  keys?: () => AsyncIterableIterator<string>;
};

async function getOpfsRoot(): Promise<OpfsDirHandle | null> {
  try {
    const storage = navigator.storage as StorageManager & {
      getDirectory?: () => Promise<OpfsDirHandle>;
    };
    if (!storage || typeof storage.getDirectory !== "function") return null;
    return await storage.getDirectory();
  } catch {
    return null;
  }
}

async function sweepStaleOpfsTemps(root: OpfsDirHandle, now: number): Promise<void> {
  if (typeof root.keys !== "function") return;
  try {
    const stale: string[] = [];
    for await (const name of root.keys()) {
      if (!name.startsWith(OPFS_TMP_PREFIX)) continue;
      const stamp = Number(name.slice(OPFS_TMP_PREFIX.length).split("-")[0]);
      if (Number.isFinite(stamp) && now - stamp > OPFS_TMP_TTL_MS) stale.push(name);
    }
    for (const name of stale) {
      await root.removeEntry(name).catch(() => undefined);
    }
  } catch {
    void 0;
  }
}

async function createOpfsDownloadWritable(
  filename: string,
): Promise<FileSystemWritableFileStream | null> {
  const root = await getOpfsRoot();
  if (!root) return null;

  const now = Date.now();
  await sweepStaleOpfsTemps(root, now);

  const tmpName = `${OPFS_TMP_PREFIX}${now}-${Math.random().toString(36).slice(2)}.tmp`;
  let fileHandle: OpfsWriteHandle;
  let writable: FileSystemWritableFileStream;
  try {
    fileHandle = (await root.getFileHandle(tmpName, { create: true })) as OpfsWriteHandle;
    if (typeof fileHandle.createWritable !== "function") return null;
    writable = await fileHandle.createWritable({ keepExistingData: false });
  } catch (error) {
    console.warn("[export-runner] OPFS streaming unavailable; using in-memory fallback", error);
    return null;
  }

  return {
    async seek(position: number) {
      await writable.seek(position);
    },
    async write(data: unknown) {
      await writable.write(data as Parameters<typeof writable.write>[0]);
    },
    async truncate(size: number) {
      await writable.truncate(size);
    },
    async close() {
      await writable.close();
      const file = await fileHandle.getFile();
      triggerAnchorDownload(file, filename, () => {
        root.removeEntry(tmpName).catch(() => undefined);
      });
    },
    async abort() {
      try {
        await writable.abort();
      } catch {
        void 0;
      }
      await root.removeEntry(tmpName).catch(() => undefined);
    },
  } as unknown as FileSystemWritableFileStream;
}

function createBufferedDownloadWritable(
  filename: string,
  mime: string,
): FileSystemWritableFileStream {
  let buffer = new Uint8Array(16 * 1024 * 1024);
  let length = 0;
  let cursor = 0;

  const grow = (needed: number) => {
    if (needed <= buffer.length) return;
    let newSize = buffer.length;
    while (newSize < needed) newSize *= 2;
    const next = new Uint8Array(newSize);
    next.set(buffer.subarray(0, length));
    buffer = next;
  };

  const writeBytes = (bytes: Uint8Array, position: number) => {
    const end = position + bytes.byteLength;
    grow(end);
    buffer.set(bytes, position);
    if (end > length) length = end;
    cursor = end;
  };

  return {
    seek(position: number) {
      cursor = position;
      return Promise.resolve();
    },
    write(data: unknown) {
      if (data instanceof ArrayBuffer) {
        writeBytes(new Uint8Array(data), cursor);
      } else if (ArrayBuffer.isView(data)) {
        writeBytes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), cursor);
      }
      return Promise.resolve();
    },
    close() {
      triggerAnchorDownload(new Blob([buffer.slice(0, length)], { type: mime }), filename);
      return Promise.resolve();
    },
    abort() {
      return Promise.resolve();
    },
    truncate() {
      return Promise.resolve();
    },
  } as unknown as FileSystemWritableFileStream;
}

async function createFallbackWritable(
  filename: string,
  mime: string,
): Promise<FileSystemWritableFileStream> {
  return (await createOpfsDownloadWritable(filename)) ?? createBufferedDownloadWritable(filename, mime);
}

export function createCapturingWritable(
  target: FileSystemWritableFileStream,
  mime: string,
  onComplete: (blob: Blob) => void,
): FileSystemWritableFileStream {
  // 捕获必须保留写入位置：mp4 封装收尾会回到文件头定点回填 mdat 长度，
  // 无条件追加会让长度字段停在占位值、解析器读不到尾部的 moov。
  const capture = createWritableCapture(target as unknown as WritableLike);

  return {
    seek: (position: number) => capture.seek(position),
    write: (data: unknown) => capture.write(data),
    truncate: (size: number) => capture.truncate(size),
    async close() {
      await target.close();
      onComplete(new Blob([capture.captured.toUint8Array()], { type: mime }));
    },
    async abort() {
      if (typeof target.abort === "function") {
        await target.abort();
      }
    },
  } as unknown as FileSystemWritableFileStream;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (typeof result !== "string") {
        resolve("");
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to encode blob to base64"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Persist encoded export bytes through the clip host.
 *
 * The bytes travel as `application/octet-stream`: a real composition is far
 * larger than the host's JSON body cap, and base64 would inflate it by a
 * third. `metadata` stays in the signature for existing callers but is not
 * part of the wire payload — the host derives the destination from the
 * project id.
 *
 * `revision` is the host's content identity (`mtimeMs:size`) for the file it
 * just wrote. The canvas must carry it into the downstream node's `mediaUrl`,
 * because re-exporting overwrites the same path and an unchanged URL never
 * makes the browser reload the `<video>`.
 */
export async function persistExportBlobToHost(
  projectId: string,
  blob: Blob,
  metadata: { durationMs?: number; width?: number; height?: number } = {},
): Promise<{ path?: string; bytes?: number; revision?: string }> {
  void metadata;
  try {
    if (!blob || blob.size === 0) return {};
    const res = await fetch(`/omnimux-clip/api/projects/${encodeURIComponent(projectId)}/save-export`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: blob,
    });
    if (!res.ok) {
      console.warn("[export-runner] persistExportBlobToHost rejected:", res.status);
      return {};
    }
    const body = (await res.json()) as { path?: string; bytes?: number; revision?: string };
    return {
      path: body.path,
      bytes: body.bytes,
      revision: typeof body.revision === "string" && body.revision ? body.revision : undefined,
    };
  } catch (err) {
    console.warn("[export-runner] persistExportBlobToHost failed:", err);
    return {};
  }
}

export async function captureProjectThumbnail(
  project: Project,
  width: number = 320,
  height: number = 180,
): Promise<string | undefined> {
  try {
    const videoEngine = getVideoEngine();
    if (videoEngine && videoEngine.isInitialized()) {
      const rendered = await videoEngine.renderFrame(project, 0, width, height);
      if (rendered?.image) {
        const canvas = document.createElement("canvas");
        canvas.width = rendered.image.width;
        canvas.height = rendered.image.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(rendered.image, 0, 0);
          rendered.image.close?.();
          return canvas.toDataURL("image/jpeg", 0.85);
        }
      }
    }
  } catch (err) {
    console.warn("[export-runner] Frame thumbnail capture failed:", err);
  }

  // Fallback to first media item thumbnail if available
  const firstThumb = project.mediaLibrary?.items?.find((m) => m.thumbnailUrl)?.thumbnailUrl;
  return firstThumb || undefined;
}

export async function createDownloadWritable(
  filename: string,
  mime: string,
): Promise<FileSystemWritableFileStream> {
  const ext = filename.split(".").pop() || "mp4";

  if (isCanvasClipExportSession()) {
    return createSilentCanvasWritable() as unknown as FileSystemWritableFileStream;
  }

  if (typeof window.openreel?.fs?.showSaveDialog === "function") {
    const chosen = await window.openreel.fs.showSaveDialog({
      defaultPath: filename,
      filters: [{ name: "Media file", extensions: [ext] }],
    });
    if (!chosen) {
      throw new DOMException("User cancelled", "AbortError");
    }
    (window as { __openreelExportPath?: string }).__openreelExportPath = chosen;
    const handleId = await window.openreel.fs.openWrite(chosen);
    let cursor = 0;
    return {
      async seek(position: number) {
        cursor = position;
      },
      async write(data: unknown) {
        let bytes: ArrayBuffer | Uint8Array;
        if (data instanceof ArrayBuffer) {
          bytes = data;
        } else if (data instanceof Uint8Array) {
          bytes = data;
        } else if (ArrayBuffer.isView(data)) {
          bytes = new Uint8Array(
            data.buffer as ArrayBuffer,
            data.byteOffset,
            data.byteLength,
          );
        } else {
          return;
        }
        await window.openreel!.fs.writeChunk(handleId, bytes, cursor);
        cursor += bytes.byteLength;
      },
      async close() {
        await window.openreel!.fs.closeWrite(handleId);
      },
      async abort() {
        await window.openreel!.fs.abortWrite(handleId);
      },
      async truncate() {},
    } as unknown as FileSystemWritableFileStream;
  }

  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (
        window as unknown as {
          showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Media file",
            accept: { [mime]: [`.${ext}`] },
          },
        ],
      });
      return handle.createWritable();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      console.warn(
        "[export-runner] showSaveFilePicker unavailable; streaming to a downloaded file instead",
        error,
      );
    }
  }

  return createFallbackWritable(filename, mime);
}

const INITIAL_STATE: ExportRunnerState = {
  isExporting: false,
  progress: 0,
  phase: "",
  error: null,
  complete: false,
};

interface ExportRunnerOptions {
  project: Project;
  onExported?: (settings: Partial<VideoExportSettings>) => void;
}

export interface UseExportRunner {
  state: ExportRunnerState;
  runExport: (
    videoSettings: Partial<VideoExportSettings>,
    ext: string,
    writableStream: FileSystemWritableFileStream,
  ) => Promise<void>;
  showSavePicker: (filename: string, ext: string, opts?: { streamToFile?: boolean }) => Promise<FileSystemWritableFileStream>;
  reportProgress: (progress01: number, phase: string) => void;
  markComplete: () => void;
  beginExport: () => void;
  finishExportSoon: () => void;
  failExport: (error: unknown) => void;
  cancel: () => void;
  resetError: () => void;
}

export function useExportRunner(options: ExportRunnerOptions): UseExportRunner {
  const { project, onExported } = options;
  const [state, setState] = useState<ExportRunnerState>(INITIAL_STATE);

  const beginExport = useCallback(() => {
    setState({
      isExporting: true,
      progress: 0,
      phase: "Initializing...",
      error: null,
      complete: false,
    });
  }, []);

  const reportProgress = useCallback((progress01: number, phase: string) => {
    setState((prev) => ({
      ...prev,
      progress: progress01 * 100,
      phase: progressPhaseLabel(phase),
    }));
  }, []);

  const markComplete = useCallback(() => {
    setState((prev) => ({ ...prev, complete: true, phase: "Saved!" }));
  }, []);

  const finishExportSoon = useCallback(() => {
    setTimeout(() => {
      setState(INITIAL_STATE);
    }, 2000);
  }, []);

  const failExport = useCallback((error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") {
      setState(INITIAL_STATE);
      return;
    }
    setState((prev) => ({
      ...prev,
      isExporting: false,
      error: error instanceof Error ? error.message : "Export failed",
    }));
  }, []);

  const resetError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const runExport = useCallback(
    async (
      videoSettings: Partial<VideoExportSettings>,
      ext: string,
      writableStream: FileSystemWritableFileStream,
    ): Promise<void> => {
      const engine = getExportEngine();
      await engine.initialize();

      let capturedBlob: Blob | null = null;
      const capturingWritable = createCapturingWritable(
        writableStream,
        mimeForExt(ext),
        (blob) => {
          capturedBlob = blob;
        },
      );

      const session = getActiveClipSession();
      const isCanvas = session?.source === "canvas" && Boolean(session?.nodeId);

      if (isCanvas && session?.nodeId) {
        notifyCanvasProgress({
          nodeId: session.nodeId,
          status: "rendering",
          renderProgress: 0,
        });
      }

      const generator = engine.exportVideo(project, videoSettings, capturingWritable);
      let finalResult: ExportResult | undefined;

      while (true) {
        const { value, done } = await generator.next();
        if (done) {
          finalResult = value;
          break;
        }
        const progressPercent = Math.round(value.progress * 100);
        setState((prev) => ({
          ...prev,
          progress: progressPercent,
          phase: progressPhaseLabel(value.phase),
        }));

        if (isCanvas && session?.nodeId) {
          notifyCanvasProgress({
            nodeId: session.nodeId,
            status: "rendering",
            renderProgress: progressPercent,
          });
        }
      }

      if (finalResult?.success) {
        setState((prev) => ({ ...prev, complete: true, phase: "Saved!" }));
        onExported?.(videoSettings);

        // If in Canvas mode, persist to host and notify canvas save
        if (isCanvas && session?.nodeId) {
          const projectId = session.projectId || project.id || `clip_${Date.now()}`;
          const durationMs = Math.round((project.timeline?.duration ?? 0) * 1000);
          const width = videoSettings.width ?? project.settings?.width ?? 1920;
          const height = videoSettings.height ?? project.settings?.height ?? 1080;

          const thumbnailPath = await captureProjectThumbnail(project, 320, Math.round(320 * (height / width)));

          // The canvas node must point at the bytes rendered just now.
          // `window.__openreelExportPath` belongs to a manual Save-dialog export
          // and would silently attach an unrelated file to the canvas node.
          const persistRes = capturedBlob
            ? await persistExportBlobToHost(projectId, capturedBlob, { durationMs, width, height })
            : null;
          const videoPath = persistRes?.path;
          if (!videoPath) {
            console.error("[export-runner] canvas export was not persisted to the local library");
            throw new Error("Canvas export was not persisted to the local library");
          }

          notifyCanvasSave({
            nodeId: session.nodeId,
            projectId,
            schema: project as unknown as Record<string, unknown>,
            createDownstreamNode: true,
            output: {
              videoPath,
              thumbnailPath,
              durationMs,
              width,
              height,
              revision: persistRes?.revision,
            },
          });
        }
      } else {
        throw new Error(finalResult?.error?.message || "Export failed");
      }
    },
    [project, onExported],
  );

  const showSavePicker = useCallback(
    async (
      filename: string,
      ext: string,
      opts?: { streamToFile?: boolean },
    ): Promise<FileSystemWritableFileStream> => {
      const mime = mimeForExt(ext);

      if (isCanvasClipExportSession()) {
        return createSilentCanvasWritable() as unknown as FileSystemWritableFileStream;
      }

      if (typeof window.openreel?.fs?.showSaveDialog === "function") {
        const chosen = await window.openreel.fs.showSaveDialog({
          defaultPath: filename,
          filters: [{ name: "Media file", extensions: [ext] }],
        });
        if (!chosen) {
          throw new DOMException("User cancelled", "AbortError");
        }
        (window as { __openreelExportPath?: string }).__openreelExportPath = chosen;

        // The WAV path and any WebCodecs export (streamToFile) mux directly to
        // disk through the fs bridge. The native ffmpeg video path writes the
        // file itself via __openreelExportPath, so it gets the no-op stub below.
        if (ext === "wav" || opts?.streamToFile === true) {
          const handleId = await window.openreel.fs.openWrite(chosen);
          let cursor = 0;
          return {
            async seek(position: number) {
              cursor = position;
            },
            async write(data: unknown) {
              let bytes: ArrayBuffer | Uint8Array;
              if (data instanceof ArrayBuffer) {
                bytes = data;
              } else if (data instanceof Uint8Array) {
                bytes = data;
              } else if (ArrayBuffer.isView(data)) {
                bytes = new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
              } else {
                return;
              }
              await window.openreel!.fs.writeChunk(handleId, bytes, cursor);
              cursor += bytes.byteLength;
            },
            async close() {
              await window.openreel!.fs.closeWrite(handleId);
            },
            async abort() {
              await window.openreel!.fs.abortWrite(handleId);
            },
            async truncate() {},
          } as unknown as FileSystemWritableFileStream;
        }

        return {
          async seek() {},
          async write() {},
          async close() {},
          async abort() {},
          async truncate() {},
        } as unknown as FileSystemWritableFileStream;
      }

      if ("showSaveFilePicker" in window) {
        try {
          const handle = await (
            window as unknown as {
              showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
            }
          ).showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: "Media file",
                accept: { [mime]: [`.${ext}`] },
              },
            ],
          });
          return handle.createWritable();
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
          }
          console.warn(
            "[export-runner] showSaveFilePicker unavailable; streaming to a downloaded file instead",
            error,
          );
          return createFallbackWritable(filename, mime);
        }
      }

      return createFallbackWritable(filename, mime);
    },
    [],
  );

  const cancel = useCallback(() => {
    const engine = getExportEngine();
    engine.cancel();
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    runExport,
    showSavePicker,
    reportProgress,
    markComplete,
    beginExport,
    finishExportSoon,
    failExport,
    cancel,
    resetError,
  };
}
