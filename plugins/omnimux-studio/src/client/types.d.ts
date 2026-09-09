export type ScopeKey = string;
export type Mode = 'agent' | 'video' | 'image';
export type Part = { id: string; kind: 'text'; text: string } | { id: string; kind: 'url-token'; tokenType: 'product' | 'video'; value: string; validation: 'empty' | 'invalid' | 'valid'; error?: string };
export type EditorDocument = { version: 1; parts: Part[] };
export type Spec = { resolution: string; aspect: string; durationMode: 'auto' | 'fixed' | 'none'; durationSeconds: number | null; batchCount: 1 | 2 | 3 | 4 };
export type Reference = { id: string; slot: string; kind: 'image' | 'video'; source: 'fixture' | 'local'; fixtureId: string | null; fileId: string | null; name: string; mime: string };
export type Draft = { mode: Mode; document: EditorDocument; submode: string | null; skillId: string | null; presetId: string | null; modelId: string | null; spec: Spec | null; references: Reference[] };
export type RequestSnapshot = Readonly<{ version: 1; requestId: string; scopeKey: ScopeKey; mode: 'mock'; draft: Draft; modelLabel: string | null; prompt: string; unitCost: number; totalCost: number; createdAt: string }>;
export type MediaState = 'idle' | 'loading' | 'ready' | 'error';
export type Result = {
  id: string; kind: 'text'; fixtureId: 'mock:sample-text'; mediaState: MediaState;
  actualMetadata: { text: string };
} | {
  id: string; kind: 'image' | 'video'; fixtureId: 'mock:sample-image' | 'mock:sample-video'; mediaState: MediaState;
  actualMetadata: { source: string; dimensions: string; durationSeconds: number | null };
};
export type AdapterOutcome = { status: 'completed'; results: Result[] } | { status: 'failed'; results: [] };
export type Task = { id: string; attemptId: string; request: RequestSnapshot; status: 'pending' | 'completed' | 'failed' | 'cancelled'; results: Result[]; refunded: boolean; error: string | null };
export type StudioState = { drafts: Record<Mode, Draft>; tasks: Task[]; mockCredits: number; view: 'dashboard' | 'video' | 'image'; mode: Mode; filters: { modelId: string | null; resolution: string | null; aspect: string | null }; section: 'history' | 'examples' };
export type SubmitResult = { ok: true; taskId: string } | { ok: false; errors: string[] };
export type JobHandle = { pause(): void; resume(): void; cancel(): void };
