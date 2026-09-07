import type { SpeechToTextRequest, SpeechToTextResult, SpeechToTextSeam } from '../../shared/speechToText.ts';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import { SpeechToTextError } from './errors.ts';

export interface SpeechToTextServiceDeps {
  store: Pick<WorkspaceStore, 'get'>;
  getSeam?: (name: string) => unknown;
}

export function createSpeechToTextService(deps: SpeechToTextServiceDeps) {
  return async (workspaceId: string, input: Required<SpeechToTextRequest>): Promise<SpeechToTextResult> => {
    // Validate workspace existence; the caller may not have autosaved this node yet.
    deps.store.get(workspaceId);
    const seam = deps.getSeam?.('speechToText');
    if (!seam || typeof seam !== 'object' || !('execute' in seam) || typeof seam.execute !== 'function') {
      throw new SpeechToTextError('needs-provider', '语音转写服务未注入，请启用中枢 speechToText 服务', 503);
    }
    // The hub owns byte loading and provider I/O. No generation fallback or graph writes.
    const result = await (seam as SpeechToTextSeam).execute({
      model: input.model,
      audio: input.audioPath,
      response_format: input.responseFormat,
    });
    if (result?.mode !== 'live' || typeof result.text !== 'string' || !result.text.trim()
      || typeof result.model !== 'string' || !result.model.trim()) {
      throw new SpeechToTextError('omnimux-invalid-response', '语音转写服务未返回有效文本', 502);
    }
    return { text: result.text, model: result.model };
  };
}
