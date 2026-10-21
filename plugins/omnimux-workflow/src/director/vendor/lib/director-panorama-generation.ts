import { assertUserScope, captureUserScope, directorServices, operationContext } from '../../services';
import type { DirectorTaskUpdate } from '../../contract';
export const DIRECTOR_PANORAMA_PROMPT = '以参考图中的主体、材质和光影为基础，将环境扩展成完整的 360 度等距柱状全景图。输出 2:1 比例的连续单幅画面，左右边缘自然无缝衔接，保持真实空间尺度；不要拼贴、边框、文字、水印或拍摄设备。';
export async function generateDirectorPanorama(input: { file: File; sceneId: string; projectId?: string; signal?: AbortSignal; onTaskUpdate?: (task: DirectorTaskUpdate) => void }) {
  const expected = captureUserScope();
  const { props } = directorServices();
  if (!props.adapters.generatePanorama) throw new Error('图片生成服务不可用，本地摆场仍可使用');
  if (!input.file.type.startsWith('image/')) throw new Error('请选择图片文件');
  const result = await props.adapters.generatePanorama({ ...input, prompt: DIRECTOR_PANORAMA_PROMPT }, operationContext(expected, input.signal));
  assertUserScope(expected);
  if (!result.storageKey || !result.url || !result.id) throw new Error('全景图任务未返回受管图片');
  return result;
}
export async function recoverDirectorPanoramaTasks(_projectId: string, _sceneId: string, signal?: AbortSignal): Promise<number> {
  const expected = captureUserScope();
  const recover = directorServices().props.adapters.recoverPanoramaTasks;
  if (!recover) throw new Error('全景图任务恢复服务不可用');
  const count = await recover(operationContext(expected, signal));
  assertUserScope(expected);
  return count;
}
