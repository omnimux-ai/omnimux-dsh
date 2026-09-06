import { WORKFLOW_API_ROUTES } from '../../shared/api.ts';
import { isGenerationKind } from '../../shared/generationPreferences.ts';
import { jsonBodyProblem } from '../../http/helpers';
import type { GenerationPreferencesStore } from '../workspace/GenerationPreferencesStore.ts';
import type { GenerationGateway } from '../seam/gateway';
import { notFound, type RouteTry } from './dispatch';

export function createGenerationPreferencesRoutes(
  store: GenerationPreferencesStore,
  gateway: GenerationGateway,
): { tryHandle: RouteTry } {
  return {
    async tryHandle(method, path, req) {
      if (path !== WORKFLOW_API_ROUTES.generationPreferences) return null;
      if (method !== 'GET' && method !== 'PATCH') return notFound();
      if (method === 'PATCH') {
        const problem = jsonBodyProblem(req.body);
        if (problem) return problem;
        const { kind, modelId } = req.body as Record<string, unknown>;
        if (!isGenerationKind(kind) || typeof modelId !== 'string' || !modelId.trim()) {
          return { status: 400, body: { error: 'invalid-preference', message: '请选择生成类型和模型' } };
        }
        // Capabilities are already projected through the canvas policy by the gateway.
        const catalog = await gateway.capabilities();
        if (!catalog[kind].some((model) => model.id === modelId)) {
          return { status: 400, body: { error: 'model-unavailable', message: '该模型不在当前可用模型列表中，请重新选择' } };
        }
        try {
          return { status: 200, body: store.set(kind, modelId) };
        } catch {
          return { status: 500, body: { error: 'preference-save-failed', message: '模型偏好保存失败，请重试并检查应用数据目录权限' } };
        }
      }
      try {
        return { status: 200, body: store.get() };
      } catch {
        return { status: 500, body: { error: 'preference-load-failed', message: '模型偏好读取失败，请检查应用数据目录' } };
      }
    },
  };
}
