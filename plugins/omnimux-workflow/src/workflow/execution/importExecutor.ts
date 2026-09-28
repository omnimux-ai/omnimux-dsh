/**
 * Import executor: handles pass-through for imported/static media nodes
 * (key: 'material:import').
 *
 * Structural invariant: This module MUST NOT import GenerationGateway or any
 * seam submission logic. It is architecturally impossible for an import node
 * to trigger model generation or overwrite user media assets.
 */

import { localFileMediaUrl, projectFileMediaUrl } from '../../shared/localMedia.ts';
import type {
  ExecutionContext,
  NodeExecutor,
  NodeOutput,
} from '../executors/registry';

function readString(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readMaterialType(nodeData: Record<string, unknown>): 'text' | 'image' | 'video' | 'audio' {
  const value = nodeData.materialType;
  if (value === 'image' || value === 'video' || value === 'audio') return value;
  return 'text';
}

function collectUpstreamText(ctx: ExecutionContext): string | undefined {
  for (const output of ctx.upstreamOutputs.values()) {
    if (output.text && output.text.trim()) {
      return output.text;
    }
  }
  return undefined;
}

export function createImportExecutor(): NodeExecutor {
  return {
    key: 'material:import',
    async execute(node, ctx): Promise<NodeOutput> {
      const data = node.data ?? {};
      const materialType = readMaterialType(data);
      const type = materialType === 'video' ? 'video' : materialType === 'audio' ? 'audio' : 'image';

      const relativePath = readString(data, 'relativePath');
      const assetId = readString(data, 'assetId');
      if (relativePath && ctx.workspaceId) {
        const url = projectFileMediaUrl(ctx.workspaceId, relativePath);
        return {
          relativePath,
          assetId,
          mediaAssets: [{ type, url, relativePath, assetId }],
        };
      }

      const firstMediaAsset = Array.isArray(data.mediaAssets) && data.mediaAssets[0] && typeof data.mediaAssets[0] === 'object'
        ? (data.mediaAssets[0] as Record<string, unknown>)
        : undefined;

      const realPath = readString(data, 'realPath') ?? readString(data, 'path') ?? readString(firstMediaAsset, 'path') ?? readString(firstMediaAsset, 'realPath');
      if (realPath) {
        return {
          realPath,
          mediaAssets: [{
            type,
            url: localFileMediaUrl(realPath),
            path: realPath,
            ...(firstMediaAsset ?? {}),
          }],
        };
      }

      const nodeMediaUrl = readString(data, 'mediaUrl') ?? readString(firstMediaAsset, 'url');
      if (nodeMediaUrl && !nodeMediaUrl.startsWith('blob:')) {
        return {
          mediaAssets: [{
            type,
            url: nodeMediaUrl,
            ...(firstMediaAsset ?? {}),
          }],
        };
      }

      const text = readString(data, 'content') ?? collectUpstreamText(ctx);
      return { text };
    },
  };
}
