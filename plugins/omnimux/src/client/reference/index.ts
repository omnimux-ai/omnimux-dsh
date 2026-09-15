export * from './types.ts';
export * from './shadow-context.ts';
export * from './dispatcher.ts';

import { deliverReference } from './dispatcher.ts';
import { getGlobalShadowContextStore } from './shadow-context.ts';

/**
 * 挂载全局统一引用单例
 */
export function installGlobalReferenceApi() {
  if (typeof window !== 'undefined') {
    (window as any).__omnimuxReference = {
      deliver: deliverReference,
      getShadowContextStore: getGlobalShadowContextStore,
    };
  }
}
