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
}
