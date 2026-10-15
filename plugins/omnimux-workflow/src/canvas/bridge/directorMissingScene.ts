import type { DirectorScene } from '../../director/contract';

/**
 * Decide whether a missing authoritative document may create a fresh scene.
 * A node that already references a prior scene must not have that reference
 * replaced silently; the caller keeps the node untouched for explicit recovery.
 */
export function resolveMissingDirectorScene(input: {
  error?: string;
  priorSceneId?: unknown;
  emptyScene: () => DirectorScene;
}): { action: 'create'; scene: DirectorScene } | { action: 'throw'; message: string } {
  const hasPrior = typeof input.priorSceneId === 'string' && Boolean(input.priorSceneId.trim());
  if (input.error === 'director-scene-not-found') {
    if (hasPrior) return { action: 'throw', message: '原导演场景文档缺失，已保留原引用，请修复项目数据后重试或另建场景' };
    return { action: 'create', scene: input.emptyScene() };
  }
  if (input.error === 'project-required' && !hasPrior) return { action: 'create', scene: input.emptyScene() };
  return { action: 'throw', message: input.error || '导演场景无法读取，请保留原节点并重试' };
}
