/**
 * Material Node Specification (SSOT).
 *
 * Declares all 16 material tools, their input slots, accepted input types,
 * model categories, and connection ports.
 */

import type { MaterialType, NodeSpec, ToolSpec } from '../contracts.ts';

export type MaterialTool =
  | 'text-editor'
  | 'text-to-text'
  | 'link-extract'
  | 'audio-transcription'
  | 'import'
  | 'text-to-image'
  | 'image-to-image'
  | 'video-generation'
  | 'motion-mimicry'
  | 'subtitle-render'
  | 'digital-human'
  | 'text-to-audio'
  | 'text-to-music'
  | 'video-to-audio'
  | 'voice-clone'
  | 'audio-extract';

export const MATERIAL_TOOLS_BY_TYPE: Record<MaterialType, readonly MaterialTool[]> = {
  text: ['text-editor', 'text-to-text', 'link-extract', 'audio-transcription'],
  image: ['import', 'text-to-image', 'image-to-image'],
  video: ['import', 'video-generation', 'motion-mimicry', 'subtitle-render', 'digital-human'],
  audio: ['import', 'text-to-audio', 'text-to-music', 'video-to-audio', 'voice-clone', 'audio-extract'],
};

export const DEFAULT_MATERIAL_TOOL_BY_TYPE: Record<MaterialType, MaterialTool> = {
  text: 'text-editor',
  image: 'text-to-image',
  video: 'video-generation',
  audio: 'text-to-audio',
};

export const materialTools: Record<string, ToolSpec> = {
  // === Text Tools ===
  'text-editor': {
    id: 'text-editor',
    labelKey: 'tool.text-editor',
    materialType: 'text',
    outputType: 'text',
    acceptedInputTypes: [],
    slots: [],
  },
  'text-to-text': {
    id: 'text-to-text',
    labelKey: 'tool.text-to-text',
    materialType: 'text',
    outputType: 'text',
    acceptedInputTypes: ['text', 'image', 'video', 'audio'],
    modelCategory: 'text',
    slots: [
      {
        slotId: 'prompt',
        materialType: 'text',
        role: 'prompt',
        required: true,
      },
    ],
  },
  'link-extract': {
    id: 'link-extract',
    labelKey: 'tool.link-extract',
    materialType: 'text',
    outputType: 'text',
    acceptedInputTypes: ['text'],
    slots: [
      {
        slotId: 'url',
        materialType: 'text',
        role: 'prompt',
        required: true,
      },
    ],
  },
  'audio-transcription': {
    id: 'audio-transcription',
    labelKey: 'tool.audio-transcription',
    materialType: 'text',
    outputType: 'text',
    acceptedInputTypes: ['audio'],
    modelCategory: 'audio',
    slots: [
      {
        slotId: 'audio',
        materialType: 'audio',
        role: 'audio_track',
        required: true,
      },
    ],
  },

  // === Common Import Tool ===
  import: {
    id: 'import',
    labelKey: 'tool.import',
    materialType: 'image',
    outputType: 'image',
    acceptedInputTypes: [],
    slots: [],
  },

  // === Image Tools ===
  'text-to-image': {
    id: 'text-to-image',
    labelKey: 'tool.text-to-image',
    materialType: 'image',
    outputType: 'image',
    acceptedInputTypes: ['text'],
    modelCategory: 'image',
    slots: [
      {
        slotId: 'prompt',
        materialType: 'text',
        role: 'prompt',
        required: true,
      },
    ],
  },
  'image-to-image': {
    id: 'image-to-image',
    labelKey: 'tool.image-to-image',
    materialType: 'image',
    outputType: 'image',
    acceptedInputTypes: ['text', 'image'],
    modelCategory: 'image',
    slots: [
      {
        slotId: 'prompt',
        materialType: 'text',
        role: 'prompt',
        required: true,
      },
      {
        slotId: 'references',
        materialType: 'image',
        role: 'reference',
        required: false,
        dynamicMaxByModel: true,
      },
    ],
  },

  // === Video Tools ===
  'video-generation': {
    id: 'video-generation',
    labelKey: 'tool.video-generation',
    materialType: 'video',
    outputType: 'video',
    acceptedInputTypes: ['text', 'image', 'video', 'audio'],
    modelCategory: 'video',
    slots: [
      {
        slotId: 'prompt',
        materialType: 'text',
        role: 'prompt',
        required: true,
      },
      {
        slotId: 'references',
        materialType: 'image',
        role: 'reference',
        required: false,
        dynamicMaxByModel: true,
      },
      {
        slotId: 'audio_track',
        materialType: 'audio',
        role: 'audio_track',
        required: false,
      },
    ],
  },
  'motion-mimicry': {
    id: 'motion-mimicry',
    labelKey: 'tool.motion-mimicry',
    materialType: 'video',
    outputType: 'video',
    acceptedInputTypes: ['text', 'image', 'video'],
    modelCategory: 'video',
    slots: [
      {
        slotId: 'motion_source',
        materialType: 'video',
        role: 'motion_source',
        required: true,
      },
      {
        slotId: 'character_image',
        materialType: 'image',
        role: 'reference',
        required: true,
      },
    ],
  },
  'subtitle-render': {
    id: 'subtitle-render',
    labelKey: 'tool.subtitle-render',
    materialType: 'video',
    outputType: 'video',
    acceptedInputTypes: ['text', 'video'],
    modelCategory: 'video',
    slots: [
      {
        slotId: 'video',
        materialType: 'video',
        role: 'reference',
        required: true,
      },
      {
        slotId: 'subtitles',
        materialType: 'text',
        role: 'prompt',
        required: true,
      },
    ],
  },
  'digital-human': {
    id: 'digital-human',
    labelKey: 'tool.digital-human',
    materialType: 'video',
    outputType: 'video',
    acceptedInputTypes: ['text', 'image', 'video', 'audio'],
    modelCategory: 'video',
    slots: [
      {
        slotId: 'character_image',
        materialType: 'image',
        role: 'reference',
        required: true,
      },
      {
        slotId: 'speech_audio',
        materialType: 'audio',
        role: 'audio_track',
        required: true,
      },
      {
        slotId: 'prompt',
        materialType: 'text',
        role: 'prompt',
        required: false,
      },
    ],
  },

  // === Audio Tools ===
  'text-to-audio': {
    id: 'text-to-audio',
    labelKey: 'tool.text-to-audio',
    materialType: 'audio',
    outputType: 'audio',
    acceptedInputTypes: ['text'],
    modelCategory: 'audio',
    slots: [
      {
        slotId: 'prompt',
        materialType: 'text',
        role: 'prompt',
        required: true,
      },
    ],
  },
  'text-to-music': {
    id: 'text-to-music',
    labelKey: 'tool.text-to-music',
    materialType: 'audio',
    outputType: 'audio',
    acceptedInputTypes: ['text'],
    modelCategory: 'audio',
    slots: [
      {
        slotId: 'prompt',
        materialType: 'text',
        role: 'prompt',
        required: true,
      },
    ],
  },
  'video-to-audio': {
    id: 'video-to-audio',
    labelKey: 'tool.video-to-audio',
    materialType: 'audio',
    outputType: 'audio',
    acceptedInputTypes: ['video'],
    modelCategory: 'audio',
    slots: [
      {
        slotId: 'video',
        materialType: 'video',
        role: 'reference',
        required: true,
      },
    ],
  },
  'voice-clone': {
    id: 'voice-clone',
    labelKey: 'tool.voice-clone',
    materialType: 'audio',
    outputType: 'audio',
    acceptedInputTypes: ['text', 'audio'],
    modelCategory: 'audio',
    slots: [
      {
        slotId: 'prompt',
        materialType: 'text',
        role: 'prompt',
        required: true,
      },
      {
        slotId: 'voice_sample',
        materialType: 'audio',
        role: 'audio_track',
        required: true,
      },
    ],
  },
  'audio-extract': {
    id: 'audio-extract',
    labelKey: 'tool.audio-extract',
    materialType: 'audio',
    outputType: 'audio',
    acceptedInputTypes: ['video'],
    modelCategory: 'audio',
    slots: [
      {
        slotId: 'video',
        materialType: 'video',
        role: 'reference',
        required: true,
      },
    ],
  },
};

export const materialNodeSpec: NodeSpec = {
  type: 'material',
  ports: [
    { side: 'in', acceptedTypes: ['text', 'image', 'video', 'audio'], multi: true },
    { side: 'out', acceptedTypes: ['text', 'image', 'video', 'audio'], multi: true },
  ],
  tools: materialTools,
  defaultTool: 'text-editor',
  executorKey: 'material',
};
