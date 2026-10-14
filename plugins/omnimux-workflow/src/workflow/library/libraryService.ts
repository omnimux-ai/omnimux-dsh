import type { FetchLibraryDetail, LibraryAssetDetail, PromoteToLibrary } from '../workspace/ProjectAssetsStore.ts';

interface AssetLibraryService {
  getAsset: (id: string) => LibraryAssetDetail | null;
  saveTypedAsset: (input: { name: string; type?: string; files: Array<{ real_path: string }> }) => Promise<{ asset: unknown }>;
}

export function createLibraryServiceClient(getService: () => unknown): {
  fetchLibraryDetail: FetchLibraryDetail;
  promoteToLibrary: PromoteToLibrary;
} {
  function requireService(): AssetLibraryService {
    const service = getService() as Partial<AssetLibraryService> | null;
    if (!service || typeof service.getAsset !== 'function' || typeof service.saveTypedAsset !== 'function') {
      throw new Error('资产库暂不可用，请稍后重试');
    }
    return service as AssetLibraryService;
  }
  return {
    fetchLibraryDetail: async (id) => requireService().getAsset(id),
    promoteToLibrary: async (input) => (await requireService().saveTypedAsset(input)).asset,
  };
}
