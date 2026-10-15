import { assertUserScope, importModel, persistAsset, uploadImage, type CapturedUserScope, type NewAsset, type UploadedFile, type UploadedImage } from '../../services';
export type DirectorCanvasImageHandoff = { assetId?: string; persisted?: boolean };
export type DirectorLibraryPersistResult = { assetId: string; created: boolean; confirmed: boolean };
function current(expected: CapturedUserScope, signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('导演台会话已结束', 'AbortError'); assertUserScope(expected); }
export async function persistDirectorLibraryAsset(input: { asset: NewAsset; expectedScope: CapturedUserScope; signal?: AbortSignal; existingAssetId?: string; existingPersisted?: boolean; pendingRemoteUpload?: boolean }): Promise<DirectorLibraryPersistResult> {
  current(input.expectedScope, input.signal);
  const result = await persistAsset(input.asset, input.expectedScope, input.signal, input.existingAssetId, input.existingPersisted);
  current(input.expectedScope, input.signal);
  return result;
}
export async function persistDirectorImageUpload(input: { source: string | Blob; expectedScope: CapturedUserScope; signal?: AbortSignal; toAsset: (uploaded: UploadedImage) => NewAsset; existingAssetId?: string; existingPersisted?: boolean; onProgress?: (uploaded: number, total: number) => void }) {
  current(input.expectedScope, input.signal);
  const uploaded = await uploadImage(input.source, input.onProgress, input.expectedScope);
  current(input.expectedScope, input.signal);
  const persist = await persistDirectorLibraryAsset({ ...input, asset: input.toAsset(uploaded) });
  return { uploaded, persist };
}
export async function persistDirectorMediaUpload(input: { source: Blob; prefix: string; expectedScope: CapturedUserScope; signal?: AbortSignal; toAsset: (uploaded: UploadedFile) => NewAsset; fileName?: string; sidecars?: File[]; existingAssetId?: string; existingPersisted?: boolean; onProgress?: (uploaded: number, total: number) => void }) {
  current(input.expectedScope, input.signal);
  const fileName = input.fileName || (input.source instanceof File ? input.source.name : 'model.glb');
  const uploaded = await importModel(input.source, fileName, input.expectedScope, input.signal, input.sidecars);
  const persist = await persistDirectorLibraryAsset({ ...input, asset: input.toAsset(uploaded) });
  current(input.expectedScope, input.signal);
  return { uploaded, persist };
}
