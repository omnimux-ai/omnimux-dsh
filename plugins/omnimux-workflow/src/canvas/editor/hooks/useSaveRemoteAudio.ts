import { useCallback, useEffect, useRef } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import { saveRemoteAudio } from '../utils/saveRemoteAudio.ts';
import { savedAudioPatch } from '../utils/savedAudioPatch.ts';
import { resolveMediaPreviewUrl, type MediaAssetLike } from '../utils/mediaUrl.ts';
import type { AudioBytesResponse } from '../../../shared/projectAssets.ts';

/** Mounted above keyed transport so asset adoption cannot interrupt a native action. */
export function useSaveRemoteAudio(id: string, workspaceId: string | undefined, source: string | undefined): () => Promise<void> {
  const inFlight = useRef<AbortController | null>(null);
  const saved = useRef<{ source: string; workspaceId: string; result: AudioBytesResponse } | null>(null);
  const scope = useRef({ id, workspaceId, source });
  scope.current = { id, workspaceId, source };
  useEffect(() => () => { inFlight.current?.abort(); }, [id, workspaceId, source]);
  return useCallback(async (): Promise<void> => {
    if (!source || !workspaceId || inFlight.current) throw new Error('audio-save-busy');
    const controller = new AbortController();
    inFlight.current = controller;
    const stillSelected = (): boolean => {
      const node = useCanvasStore.getState().nodes.find((candidate) => candidate.id === id);
      return Boolean(scope.current.id === id && scope.current.workspaceId === workspaceId
        && scope.current.source === source && node && node.data.materialType === 'audio'
        && resolveMediaPreviewUrl('audio', node.data.mediaAssets as MediaAssetLike[] | undefined, node.data.mediaUrl as string | undefined) === source);
    };
    const unsubscribe = useCanvasStore.subscribe(() => { if (!stillSelected()) controller.abort(); });
    try {
      if (!stillSelected()) throw new Error('audio-save-changed');
      const cached = saved.current;
      const result = cached?.source === source && cached.workspaceId === workspaceId ? cached.result
        : await saveRemoteAudio(source, workspaceId, window.location.origin, controller.signal);
      saved.current = { source, workspaceId, result };
      controller.signal.throwIfAborted();
      if (!stillSelected()) throw new Error('audio-save-changed');
      const state = useCanvasStore.getState();
      const current = state.nodes.find((candidate) => candidate.id === id);
      const patch = current ? savedAudioPatch(current.data, source, workspaceId, result.item) : null;
      if (!patch) throw new Error('audio-save-changed');
      unsubscribe();
      if (state.applyCanvasInputMutation({ nodePatches: [{ nodeId: id, data: patch }] }).status !== 'allowed') {
        throw new Error('audio-save-apply');
      }
    } finally {
      unsubscribe();
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, [id, workspaceId, source]);
}
