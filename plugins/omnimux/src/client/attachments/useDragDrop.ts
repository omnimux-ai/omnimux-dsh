import { useEffect, useRef, useState } from 'react';

export interface UseDragDropOptions {
  canAcceptDrop: boolean;
  onAddImages?: (files: readonly File[]) => void;
}

interface DragHandlerContext {
  canAcceptDrop: boolean;
  onAddImages?: (files: readonly File[]) => void;
  setDragActive: (active: boolean) => void;
  getDepth: () => number;
  setDepth: (val: number) => void;
}

function extractFilesTransfer(event: DragEvent): DataTransfer | null {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer || !dataTransfer.types) {
    return null;
  }
  const hasFiles = dataTransfer.types.includes('Files');
  return hasFiles ? dataTransfer : null;
}

function isLeftViewport(event: DragEvent): boolean {
  if (typeof window === 'undefined') return false;
  const { clientX, clientY } = event;
  const leftOrTop = clientX <= 0 || clientY <= 0;
  const rightOrBottom = clientX >= window.innerWidth || clientY >= window.innerHeight;
  return leftOrTop || rightOrBottom;
}

function isRootDocumentTarget(target: EventTarget | null): boolean {
  if (typeof document === 'undefined') return false;
  return target === document.documentElement || target === document.body;
}

function handleDragEnter(event: DragEvent, ctx: DragHandlerContext): void {
  const transfer = extractFilesTransfer(event);
  if (!transfer) return;
  event.preventDefault();
  ctx.setDepth(ctx.getDepth() + 1);
  ctx.setDragActive(true);
}

function handleDragOver(event: DragEvent, canAcceptDrop: boolean): void {
  const transfer = extractFilesTransfer(event);
  if (!transfer) return;
  event.preventDefault();
  transfer.dropEffect = canAcceptDrop ? 'copy' : 'none';
}

function handleDragLeave(event: DragEvent, ctx: DragHandlerContext): void {
  const transfer = extractFilesTransfer(event);
  if (!transfer) return;
  const nextDepth = Math.max(0, ctx.getDepth() - 1);
  ctx.setDepth(nextDepth);
  if (nextDepth === 0) {
    ctx.setDragActive(false);
  }
  const shouldReset = isRootDocumentTarget(event.target) && isLeftViewport(event);
  if (shouldReset) {
    ctx.setDepth(0);
    ctx.setDragActive(false);
  }
}

function handleDrop(event: DragEvent, ctx: DragHandlerContext): void {
  const transfer = extractFilesTransfer(event);
  if (!transfer) return;
  event.preventDefault();
  ctx.setDepth(0);
  ctx.setDragActive(false);
  if (ctx.canAcceptDrop && typeof ctx.onAddImages === 'function') {
    ctx.onAddImages([...transfer.files]);
  }
}

function attachDragEventListeners(ctx: DragHandlerContext): () => void {
  const onEnter = (e: DragEvent) => handleDragEnter(e, ctx);
  const onOver = (e: DragEvent) => handleDragOver(e, ctx.canAcceptDrop);
  const onLeave = (e: DragEvent) => handleDragLeave(e, ctx);
  const onDrop = (e: DragEvent) => handleDrop(e, ctx);
  const onEnd = () => {
    ctx.setDepth(0);
    ctx.setDragActive(false);
  };

  document.addEventListener('dragenter', onEnter);
  document.addEventListener('dragover', onOver);
  document.addEventListener('dragleave', onLeave);
  document.addEventListener('drop', onDrop);
  window.addEventListener('dragend', onEnd);

  return () => {
    document.removeEventListener('dragenter', onEnter);
    document.removeEventListener('dragover', onOver);
    document.removeEventListener('dragleave', onLeave);
    document.removeEventListener('drop', onDrop);
    window.removeEventListener('dragend', onEnd);
  };
}

export function useDragDrop(options: UseDragDropOptions): boolean {
  const { canAcceptDrop, onAddImages } = options;
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const getDepth = () => dragDepth.current;
    const setDepth = (val: number) => {
      dragDepth.current = val;
    };
    const ctx: DragHandlerContext = {
      canAcceptDrop,
      onAddImages,
      setDragActive,
      getDepth,
      setDepth,
    };
    return attachDragEventListeners(ctx);
  }, [canAcceptDrop, onAddImages]);

  return dragActive;
}
