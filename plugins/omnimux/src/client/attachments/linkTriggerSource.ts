import { LINK_SOURCES, linkClipboardText, validLinkUrl, type LinkKind } from './linkReference.ts';

export interface LinkSourceCodec {
  clipboardText: (ref: string) => string;
  serialize: (ref: string, signal?: AbortSignal) => Promise<string>;
}
export interface LinkTriggerSource {
  trigger: '@' | '/';
  name: string;
  order?: number;
  candidates: () => Promise<readonly unknown[]>;
  codec: LinkSourceCodec;
}

/** Keep the legacy source resolvable for existing unsent references. */
export function createLinkTriggerSource(kind?: LinkKind): LinkTriggerSource {
  const text = (ref: string) => kind ? linkClipboardText(kind, ref) : ref;
  return {
    trigger: '@', name: kind ? LINK_SOURCES[kind] : 'link', order: 100,
    candidates: () => Promise.resolve([]),
    codec: {
      clipboardText: text,
      serialize: async (ref, signal) => {
        if (signal?.aborted) throw new Error('链接提交已取消');
        if (kind && !validLinkUrl(ref)) throw new Error('链接格式无效');
        return text(ref);
      },
    },
  };
}

export function registerLinkTriggerSource(ctx: any): (() => void) | undefined {
  if (!ctx) return undefined;
  const registrations = new Map<any, () => void>();
  let stopped = false;
  const register = (service: any) => {
    if (stopped || !service?.registerSource || registrations.has(service)) return;
    const disposers: (() => void)[] = [];
    try {
      for (const kind of [undefined, 'video', 'product'] as const) {
        const source = createLinkTriggerSource(kind);
        if (service.live?.sources?.some((item: { name: string }) => item.name === source.name)) continue;
        const unregister = service.registerSource(source);
        if (typeof unregister === 'function') disposers.push(unregister);
      }
      const dispose = () => {
        if (!registrations.delete(service)) return;
        disposers.reverse().forEach(fn => fn());
      };
      registrations.set(service, dispose);
      return dispose;
    } catch (error) {
      disposers.reverse().forEach(fn => fn());
      console.warn('[omnimux] link source registration failed:', error);
      return undefined;
    }
  };
  const direct = register(ctx.get?.('inputTriggers'));
  if (direct) ctx.effect?.(() => direct, 'omnimux: link sources');
  ctx.inject?.(['inputTriggers'], (inner: any) => {
    const dispose = register(inner.inputTriggers);
    if (dispose) inner.effect?.(() => dispose, 'omnimux: link sources');
  });
  return () => {
    stopped = true;
    for (const dispose of [...registrations.values()]) dispose();
  };
}
