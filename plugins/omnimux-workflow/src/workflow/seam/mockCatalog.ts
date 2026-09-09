import type { CapabilityCatalog, InputSlotDto, OperationContractDto } from '../../shared/api.ts';

function op(id: string, label: string, type: string, inputs: InputSlotDto[] = []): OperationContractDto {
  return { id, label, output: { type },
    inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 }, ...inputs],
    research: { status: 'verified', docUrl: 'mock-fixture' },
    execution: { status: 'live', profileId: 'mock', seam: 'mock' }, listed: true };
}
function imageSlot(slot: string, role: string, min: number, max: number, maxSizeMb: number): InputSlotDto {
  return { slot, role, type: 'image', source: 'upstream_edge', min, max, maxSizeMb,
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'], limitSource: { kind: 'policy_conservative', note: 'mock fixture' } };
}

/** Explicit offline fixture; it grants no real model or provider capabilities. */
export function mockCatalog(): CapabilityCatalog {
  const definitions = [
    { id: 'mock-text-flash', label: 'MockText Flash', operations: [op('chat', '纯文本对话', 'text')] },
    { id: 'mock-text-pro', label: 'MockText Pro', operations: [op('chat', '纯文本对话', 'text'),
      op('vision_chat', '视觉对话', 'text', [imageSlot('reference_images', 'reference', 0, 4, 10)])] },
    { id: 'mock-image-1', label: 'MockImage 1', operations: [op('text_to_image', '文生图', 'image'),
      op('image_to_image', '图生图', 'image', [imageSlot('reference_images', 'reference', 1, 4, 10)])] },
    { id: 'mock-video-1', label: 'MockVideo 1', operations: [op('text_to_video', '文生视频', 'video'),
      op('first_last_frame', '首尾帧', 'video', [imageSlot('start_frame', 'first_frame', 1, 1, 20),
        imageSlot('end_frame', 'last_frame', 1, 1, 20)])] },
    { id: 'mock-audio-speech', label: 'MockSpeech', operations: [op('text_to_speech', '文本转语音', 'audio')] },
  ];
  const capability = (min: number, max: number, supportedRoles: string[]) => ({
    modalities: ['text', 'image'] as Array<'text' | 'image'>,
    referenceImages: { min, max, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'], supportedRoles },
  });
  return {
    source: 'static-stub', schemaVersion: '1.1', fingerprint: 'mock-static-stub',
    defaults: { text: 'mock-text-flash', image: 'mock-image-1', video: 'mock-video-1', audio: 'mock-audio-speech' },
    models: definitions.map((row) => ({ ...row, family: 'mock', listed: true, disposition: 'canonical',
      listedOperations: row.operations.map((operation) => `${row.id}#${operation.id}`) })),
    defaultsByOperation: { chat: 'mock-text-flash', vision_chat: 'mock-text-pro', text_to_image: 'mock-image-1',
      image_to_image: 'mock-image-1', text_to_video: 'mock-video-1', first_last_frame: 'mock-video-1', text_to_speech: 'mock-audio-speech' },
    text: [{ id: 'mock-text-flash', label: 'MockText Flash' },
      { id: 'mock-text-pro', label: 'MockText Pro', inputCapability: capability(0, 4, ['reference']) }],
    image: [{ id: 'mock-image-1', label: 'MockImage 1', inputCapability: capability(0, 4, ['reference']) }],
    video: [{ id: 'mock-video-1', label: 'MockVideo 1', inputCapability: capability(0, 2, ['first_frame', 'last_frame']) }],
    audio: [{ id: 'mock-audio-speech', label: 'MockSpeech' }],
  };
}
