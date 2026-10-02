export function mountMediaViewerTab(ctx: {
  inject?: (deps: string[], cb: (inner: any) => void) => unknown
  get?: (name: string) => unknown
  effect?: (cb: () => unknown, label?: string) => unknown
  locale?: { bind?: (ns: string) => (key: string) => string }
}): void
