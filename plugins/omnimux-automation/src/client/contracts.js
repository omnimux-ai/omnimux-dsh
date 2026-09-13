/**
 * 客户端共享契约的类型真源（JSDoc）。本文件没有运行时导出；
 * 需要类型时用 `@typedef {import('./contracts.js').X} X` 引入。
 */

/**
 * @typedef {(key: string, params?: Record<string, unknown>) => string} Translate
 */

/**
 * @typedef {(key: string, params?: Record<string, unknown>) => string} ModelTranslate
 */

/**
 * @typedef {object} SessionListState
 * @property {readonly string[]} [ids]
 * @property {Record<string, unknown>} [byId]
 * @property {string | null} [current]
 */

/**
 * @typedef {object} WorkspaceListState
 * @property {readonly unknown[]} [items]
 * @property {readonly string[]} [archivedSessionIds]
 */

/**
 * @typedef {object} AutomationViewProps
 * @property {Translate} t
 * @property {ModelTranslate} permissionT
 * @property {ModelTranslate} modelT
 * @property {import('./runtime.js').AutomationRuntime} runtime
 * @property {() => void} [closeSettings]
 */

/**
 * @typedef {object} ClientRpc
 * @property {(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<unknown>} call
 */

/**
 * @typedef {object} SidebarTabDescriptor
 * @property {string} id
 * @property {() => string} title
 * @property {(size?: number) => unknown} icon
 * @property {number} [order]
 * @property {boolean} [hidden]
 * @property {boolean} [single]
 * @property {(props: Record<string, unknown>) => unknown} component
 */

/**
 * @typedef {object} BetterSidebarService
 * @property {(descriptor: SidebarTabDescriptor) => () => void} registerTab
 */

/**
 * `TabComponentProps` 由社区 betterSidebar 透传，本插件只读 `visible`。
 *
 * @typedef {object} TabComponentProps
 * @property {ClientContext} ctx
 * @property {unknown} [store]
 * @property {unknown} [scope]
 * @property {unknown} [tab]
 * @property {boolean} [visible]
 */

/**
 * @typedef {object} ClientContext
 * @property {(factory: () => void | (() => void), label?: string) => void} effect
 * @property {{ rpc: ClientRpc }} connection
 * @property {{ list?: { getSnapshot(): SessionListState }, refresh?: () => Promise<void>, open(id: string): void }} [sessions]
 * @property {{ register(namespace: string, dictionaries: { zh: Record<string, string>, en: Record<string, string> }): () => void, bind(namespace: string): Translate }} locale
 * @property {{ get(name: string): unknown, inject?(names: readonly string[], register: (inner: Record<string, any>) => void): void }} [slots]
 * @property {unknown} [betterSidebar]
 */

export {}
