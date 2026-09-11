/**
 * Link Reference Trigger Source
 *
 * 为 Lexical ReferenceChipNode（source: 'link'）提供全局序列化支持与 Roster 注册。
 * 彻底避免用户提交包含 URL 药丸时抛出 `slash: no serializer for reference source "link"` 错误。
 */

export interface LinkSourceCodec {
  clipboardText: (ref: string) => string;
  serialize: (ref: string, signal?: AbortSignal) => Promise<string>;
}

export interface LinkTriggerSource {
  trigger: string;
  name: string;
  order?: number;
  candidates: () => Promise<readonly unknown[]>;
  codec: LinkSourceCodec;
}

export function createLinkTriggerSource(): LinkTriggerSource {
  return {
    trigger: '', // 非 @/ 触发符，纯作为 reference source 注册，不在输入时弹出建议列表
    name: 'link',
    order: 100,
    candidates: () => Promise.resolve([]),
    codec: {
      clipboardText: (ref: string) => ref,
      serialize: (ref: string) => Promise.resolve(ref),
    },
  };
}

/**
 * 注册 link 触发源到 inputTriggers 服务中
 * 具备幂等性与生命周期管理（支持返回注销函数并挂载至 ctx.effect）
 */
export function registerLinkTriggerSource(ctx: any): (() => void) | undefined {
  if (!ctx) return undefined;

  let activeUnregister: (() => void) | undefined = undefined;

  const tryRegister = (inputTriggers: any): (() => void) | undefined => {
    if (!inputTriggers || typeof inputTriggers.registerSource !== 'function') {
      return undefined;
    }
    const sources = inputTriggers.live?.sources;
    if (Array.isArray(sources) && sources.some((s: any) => s?.name === 'link')) {
      return undefined;
    }

    try {
      const unreg = inputTriggers.registerSource(createLinkTriggerSource());
      activeUnregister = unreg;
      return unreg;
    } catch (err) {
      console.warn('[omnimux] registerSource("link") failed:', err);
      return undefined;
    }
  };

  // 1. 若当前上下文已同步持有 inputTriggers，立即执行注册
  if (typeof ctx.get === 'function') {
    const directIt = ctx.get('inputTriggers');
    if (directIt) {
      const unreg = tryRegister(directIt);
      if (unreg && typeof ctx.effect === 'function') {
        ctx.effect(() => unreg, 'omnimux: link trigger source');
      }
    }
  }

  // 2. 同时使用 ctx.inject 保证异步/延迟注入时依然能成功注册
  if (typeof ctx.inject === 'function') {
    ctx.inject(['inputTriggers'], (inner: any) => {
      const unreg = tryRegister(inner.inputTriggers);
      if (unreg && typeof inner.effect === 'function') {
        inner.effect(() => unreg, 'omnimux: link trigger source');
      }
    });
  }

  return () => {
    if (activeUnregister) {
      activeUnregister();
      activeUnregister = undefined;
    }
  };
}
