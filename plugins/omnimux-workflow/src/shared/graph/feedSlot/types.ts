import type { ReferenceAssetPayload } from '../../../workflow/seam/gateway.ts';

export interface FeedAsset {
  edgeId: string;
  sourceNodeId: string;
  outputId?: string;
  type: string;
  availability: 'ready' | 'waiting' | 'unavailable';
  mimeType?: string;
  sizeBytes?: number;
  durationSec?: number;
  ordinal: number;
  /** Resolved by the caller; the kernel never performs I/O. */
  pathOrUrl?: string;
  url?: string;
  /** Legacy or one-shot picker hints, used only during hydration. */
  targetSlot?: string;
  role?: string;
}

export interface SlotOccupant {
  sourceNodeId: string;
  edgeId: string;
  outputId?: string;
  pinned: boolean;
}

export type SlotBindings = Record<string, SlotOccupant[]>;
export type SlotConflictReason = 'type_mismatch' | 'role_illegal' | 'slot_removed';
export interface SlotConflict {
  slot: string;
  occupant: SlotOccupant;
  reason: SlotConflictReason;
}
export type SlotLayoutPreset = 'none' | 'named' | 'pair' | 'strip';
export interface SlotSpec {
  slot: string;
  role: string;
  type: string;
  min: number;
  max: number | null;
  labelKey: string;
  allowedMimes?: string[];
}
export interface SlotLayout {
  operationId: string;
  preset: SlotLayoutPreset;
  slots: SlotSpec[];
  swap: boolean;
  addButton: boolean;
  implementationGaps: string[];
}
export interface FillResult {
  bindings: SlotBindings;
  unusedFeed: FeedAsset[];
  conflicts: SlotConflict[];
}
export interface EffectiveSubmitInputs {
  prompt: string;
  references: ReferenceAssetPayload[];
  audioTrack?: ReferenceAssetPayload;
  unusedFeedEdgeIds: string[];
  emptyRequiredSlots: string[];
  /** Occupied but not usable, including optional slots: never silently skip them. */
  blockedInputs: Array<{ slot: string; edgeId: string; sourceNodeId: string; reason: 'input_waiting' | 'input_unavailable' }>;
}
