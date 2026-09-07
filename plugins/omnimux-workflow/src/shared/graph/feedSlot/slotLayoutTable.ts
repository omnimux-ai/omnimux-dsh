import type { SlotLayoutPreset } from './types.ts';

export interface SlotLayoutPolicy {
  preset: SlotLayoutPreset;
  slots?: readonly string[];
  swap?: boolean;
  addButton?: boolean;
}

/** Presentation only: types, roles and limits always come from catalog inputs. */
export const SLOT_LAYOUT_TABLE: Readonly<Record<string, SlotLayoutPolicy>> = Object.freeze({
  text_to_image: { preset: 'strip', slots: ['reference_image', 'reference'], addButton: true },
  image_to_image: { preset: 'strip', slots: ['reference_image', 'reference'], addButton: true },
  multi_reference: { preset: 'strip', slots: ['reference_image', 'reference'], addButton: true },
  text_to_video: { preset: 'none' },
  first_frame: { preset: 'named', slots: ['first_frame'] },
  first_last_frame: { preset: 'pair', slots: ['first_frame', 'last_frame'], swap: true },
  video_multi_ref: { preset: 'strip', slots: ['reference'], addButton: true },
  digital_human: { preset: 'named', slots: ['character', 'driving_audio'] },
});

export const SLOT_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  first_frame: ['start_frame'],
  last_frame: ['end_frame'],
  character: ['character_image', 'portrait', 'reference_image', 'reference_images', 'first_frame'],
  driving_audio: ['audio_track', 'audio', 'source_audio'],
  reference_image: ['reference', 'references', 'input_image', 'input_images'],
  reference: ['reference_image', 'references', 'input_image', 'input_images'],
});
