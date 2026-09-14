import { useEffect, useState, useSyncExternalStore } from 'react';
import { getGlobalMediaViewerStore } from '../media-viewer/media-viewer-store.js';
import { COMMENT_FILE_PREFIX, COMMENT_SCHEMA, MAX_COMMENT_BYTES, parseCommentSnapshot } from '../../workbench/comment-snapshot.js';
import type { AttachmentTrayProps } from './AttachmentTray.tsx';

const retiredFiles = new WeakSet<File>();
type Revision = { text: string; file: File; id?: string; attachmentId?: string; consumed?: boolean; phase: 'awaiting' | 'admitted' | 'absent' | 'rejected' };
const revisions = new Map<string, Revision>();
const submittedCandidates = new Map<string, Set<Revision>>();
const observers = new Map<string, () => void>();
type SubmittedText = Readonly<{ sessionId: string; attachmentId: string; name: string; bytes: number; text: string; expiresAt: number }>;
const submittedTexts = new Map<string, SubmittedText>();
const submittedTextListeners = new Set<() => void>();
export function subscribeSubmittedCanvasText(listener: () => void): () => void {
  submittedTextListeners.add(listener);
  return () => { submittedTextListeners.delete(listener); };
}
const SUBMITTED_TEXT_TTL = 5 * 60 * 1000;
const MAX_SUBMITTED_TEXTS = 128;
let submittedTextTimer: ReturnType<typeof setTimeout> | undefined;

function pruneSubmittedTexts() {
  const now = Date.now();
  for (const [key, value] of submittedTexts) if (value.expiresAt <= now) submittedTexts.delete(key);
  if (submittedTextTimer !== undefined) clearTimeout(submittedTextTimer);
  submittedTextTimer = undefined;
  if (submittedTexts.size) {
    const expiresAt = Math.min(...Array.from(submittedTexts.values(), value => value.expiresAt));
    submittedTextTimer = setTimeout(pruneSubmittedTexts, Math.max(1, expiresAt - now));
  }
}

function rememberSubmittedText(sessionId: string, revision: Revision) {
  if (!revision.attachmentId) return;
  const snapshot = parseCommentSnapshot(JSON.parse(revision.text), sessionId);
  if (!snapshot) return;
  const key = JSON.stringify([sessionId, revision.attachmentId, revision.file.name, revision.file.size]);
  submittedTexts.set(key, Object.freeze({ sessionId, attachmentId: revision.attachmentId, name: revision.file.name,
    bytes: revision.file.size, text: snapshot.media.flatMap((media: { comments: { text: string }[] }) => media.comments.map(comment => comment.text)).join('\n'), expiresAt: Date.now() + SUBMITTED_TEXT_TTL }));
  while (submittedTexts.size > MAX_SUBMITTED_TEXTS) submittedTexts.delete(submittedTexts.keys().next().value!);
  pruneSubmittedTexts();
}

/** Resolve only ready, session-owned immutable snapshots named by this pending submission. */
export function getSubmittedCanvasText(sessionId: string, attachments: readonly unknown[]): string {
  if (!sessionId || !Array.isArray(attachments)) return '';
  const texts: string[] = [];
  const seen = new Set<string>();
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object' || !('type' in attachment) || attachment.type !== 'file' || !('value' in attachment)) continue;
    const value = attachment.value;
    if (!value || typeof value !== 'object' || !('attachmentId' in value) || !('name' in value) || !('bytes' in value)) continue;
    if (typeof value.attachmentId !== 'string' || typeof value.name !== 'string' || typeof value.bytes !== 'number') continue;
    const key = JSON.stringify([sessionId, value.attachmentId, value.name, value.bytes]);
    if (seen.has(key)) continue;
    const revision = [...(submittedCandidates.get(sessionId) || [])].find(candidate => !candidate.consumed && candidate.attachmentId === value.attachmentId && candidate.file.name === value.name && candidate.file.size === value.bytes);
    if (revision) {
      const snapshot = parseCommentSnapshot(JSON.parse(revision.text), sessionId);
      if (snapshot) { seen.add(key); texts.push(snapshot.media.flatMap((media: { comments: { text: string }[] }) => media.comments.map(comment => comment.text)).join('\n')); continue; }
    }
    const snapshot = submittedTexts.get(key);
    if (!snapshot || snapshot.expiresAt <= Date.now()) continue;
    seen.add(key);
    texts.push(snapshot.text);
  }
  return texts.join('\n\n');
}

export function removeCommentAttachment(sessionId: string, attachmentId: string) {
  const revision = revisions.get(sessionId);
  if (revision?.id !== attachmentId) return;
  const snapshot = JSON.parse(revision.text);
  getGlobalMediaViewerStore().removeSubmittedComments(sessionId, snapshot.media.flatMap((item: any) => item.comments.map((comment: any) => comment.id)));
  revisions.delete(sessionId);
}

/** Files stay owned by the native composer; this hook owns only their comment revisions. */
export function useCommentAttachment(props: AttachmentTrayProps, sessionId: string) {
  const store = getGlobalMediaViewerStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);
  useEffect(() => {
    store.bindComposerSession(sessionId);
    return () => store.bindComposerSession(null);
  }, [store, sessionId]);
  useEffect(() => {
    const binding = props.getSessions?.()?.binding(sessionId);
    if (!binding) return;
    const observe = () => {
      if (binding.session?.getSnapshot().removed) {
        submittedCandidates.delete(sessionId);
        revisions.delete(sessionId);
        for (const [key, snapshot] of submittedTexts) if (snapshot.sessionId === sessionId) submittedTexts.delete(key);
        pruneSubmittedTexts();
        return;
      }
      const current = store.getSnapshot();
      const savedIds = new Set(Object.values(current.annotationsByMediaId).flatMap((items: any) => items.filter((item: any) => item.sessionId === sessionId).map((item: any) => item.id)));
      for (const revision of submittedCandidates.get(sessionId) || []) {
      if (revision.consumed) continue;
      const snapshot = JSON.parse(revision.text);
      const ids = snapshot.media.flatMap((item: any) => item.comments.map((comment: any) => comment.id));
      if (!ids.some((id: string) => savedIds.has(id))) {
        submittedCandidates.get(sessionId)?.delete(revision);
        continue;
      }
      for (const row of binding.eventSource.getSnapshot().entries) {
        const event = row.type === 'event' ? row.event : null;
        const message = event?.type === 'user/message' ? event.data : null;
        if (message?.source?.kind !== 'user') continue;
        if (!revision.attachmentId) continue;
        if (!message.content?.some((part: any) => part.type === 'file' && part.attachment?.attachmentId === revision.attachmentId && part.attachment?.name === revision.file.name && part.attachment?.bytes === revision.file.size)) continue;
        const snapshot = JSON.parse(revision.text);
        rememberSubmittedText(sessionId, revision);
        revision.consumed = true;
        submittedCandidates.get(sessionId)?.delete(revision);
        revision.phase = 'absent';
        retiredFiles.add(revision.file);
        store.removeSubmittedComments(sessionId, snapshot.media.flatMap((item: any) => item.comments.map((comment: any) => comment.id)));
        break;
      }
      }
    };
    observers.set(sessionId, observe);
    const stop = binding.eventSource.subscribe(observe);
    observe();
    return () => { stop(); if (observers.get(sessionId) === observe) observers.delete(sessionId); };
  }, [props.getSessions, sessionId, store, state]);
  const media = state.mediaList.map((item: any) => ({
    id: item.id, title: item.title || '',
    comments: (state.annotationsByMediaId[item.id] || [])
      .filter((comment: any) => comment.status === 'saved' && comment.sessionId === sessionId)
      .map(({ id, index, text, xPercent, yPercent }: any) => ({ id, index, text, xPercent, yPercent })),
  })).filter((item: any) => item.comments.length);
  const text = media.length ? JSON.stringify({ schema: COMMENT_SCHEMA, sessionId, media }) : '';
  useEffect(() => {
    if (!sessionId || sessionId === 'default') return;
    const attachments = props.attachments || [];
    for (const attachment of attachments) {
      if (retiredFiles.has(attachment.file)) props.onRemoveAttachment?.(attachment.id);
    }
    const previous = revisions.get(sessionId);
    if (previous) {
      const attachment = attachments.find(item => item.file === previous.file);
      if (attachment) { previous.id = attachment.id; previous.phase = 'admitted'; }
      else if (previous.phase === 'admitted') previous.phase = 'absent';
      const upload = previous.id ? props.uploads?.[previous.id] : null;
      if (upload?.status === 'ready') {
        previous.attachmentId = (upload.file as any)?.attachmentId;
        if (!submittedCandidates.has(sessionId)) submittedCandidates.set(sessionId, new Set());
        const wasConsumed = previous.consumed;
        if (!wasConsumed && !submittedCandidates.get(sessionId)!.has(previous)) {
          submittedCandidates.get(sessionId)!.add(previous);
          for (const listener of [...submittedTextListeners]) listener();
        }
        observers.get(sessionId)?.();
        if (!wasConsumed && previous.consumed) return;
      }
      if (previous.text === text) {
        if (previous.phase === 'rejected') setError('评论附件未能登记，请重试');
        return;
      }
      // Retire stale bytes before admitting a changed snapshot, even while uploads are blocked.
      if (attachment && props.onRemoveAttachment) props.onRemoveAttachment(attachment.id);
      retiredFiles.add(previous.file);
      revisions.delete(sessionId);
    }
    setError('');
    if (!text || !props.canAcceptDrop || !props.onAddFiles) return;
    const file = new File([text], `${COMMENT_FILE_PREFIX}${crypto.randomUUID()}.json`, { type: 'application/json' });
    if (file.size > MAX_COMMENT_BYTES) { setError('评论内容过长，请减少后重试'); return; }
    const revision = { text, file, phase: 'awaiting' as const };
    revisions.set(sessionId, revision);
    try { props.onAddFiles([file]); }
    catch { revisions.set(sessionId, { ...revision, phase: 'rejected' }); setError('评论附件添加失败，请重试'); }
  }, [props.attachments, props.uploads, props.canAcceptDrop, props.onAddFiles, props.onRemoveAttachment, sessionId, text, retryVersion]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const pending = revisions.get(sessionId);
      if (pending?.text === text && pending.phase === 'awaiting') {
        pending.phase = 'rejected';
        setError('评论附件未能登记，请重试');
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [sessionId, text, props.canAcceptDrop, retryVersion]);
  const retry = () => {
    const rejected = revisions.get(sessionId);
    if (rejected?.phase !== 'rejected') return;
    retiredFiles.add(rejected.file);
    revisions.delete(sessionId);
    setRetryVersion(value => value + 1);
  };
  return { error, retry };
}
