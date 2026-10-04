/**
 * Official voice preview DTO projected by the hub onto `VoiceOptionMeta.preview`
 * (Issue #3058). The hub owns the mapping and the candidate rule; the client
 * never builds URLs locally.
 * `verified-file` only means a file probe passed at `checked_at` — it is not a
 * license or a promise the clip plays in this browser.
 */
export interface VoicePreview {
  purpose: 'official-voice-preview';
  state: 'verified-file' | 'unverified';
  primary_url: string | null;
  /** Ordered, de-duplicated fallback URLs issued by the hub. */
  candidates: string[];
  checked_at: string | null;
  evidence_ref: string | null;
}

/** Rich voice metadata from the hub Catalog DTO; never a second voice registry. */
export interface VoiceOptionMeta {
  voice_type: string;
  name: string;
  display_name: string;
  /** Comma-separated scene labels; split for multi-select filters. */
  category: string;
  /** Comma-separated language labels, without accent suffixes. */
  language: string;
  /** Comma-separated accent labels; 未知 when the source provides no evidence. */
  accent: string;
  gender: 'male' | 'female' | 'unknown';
  tags: string[];
  resource_id: 'seed-tts-1.0' | 'seed-tts-2.0';
  is_hot: boolean;
  /** Ascending rank: the ten core voices occupy 1–10. */
  hot_order: number;
  /** Optional hub preview projection; absent on unmapped/legacy voices. */
  preview?: VoicePreview;
}
